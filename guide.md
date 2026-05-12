# GForm Automator — Agent Build Guide

> **Read this entire file before writing a single line of code.**
> This guide is fully self-contained. Follow it top to bottom. Do not skip sections.
> Every component, page, route, type, and behavior is specified here.

---

## 0. What You Are Building

A two-page web app:

- **`/` (home)** — User pastes a Google Form URL and clicks Load. The server fetches and parses the form. On success, the parsed form data is saved to `sessionStorage` and the user is navigated to `/form`.
- **`/form`** — The full workspace. Left side: a pixel-close sandbox recreation of the Google Form (all pages, all question types). Right side: per-question answer configuration with smart randomization. Bottom of right panel: submission count, delay settings, and the Start button. On submit: a modal pops up counting `0 / N` live. When done: a completion dialog replaces it.

No other pages. No auth. No database.

---

## 1. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | Use `app/` directory |
| Language | TypeScript (strict) | `"strict": true` in tsconfig |
| Styling | Tailwind CSS v3 + shadcn/ui | Use shadcn components throughout |
| Form state | react-hook-form | For config panel inputs |
| HTML parsing | cheerio | Server-side only, never imported in client components |
| Real-time | Server-Sent Events (SSE) | Via Next.js Route Handler |
| Runtime | Node.js 18+ | Required for native fetch |
| Package manager | pnpm | |

---

## 2. Project File Structure

Create exactly this layout. Every file listed must exist.

```
gform-automator/
├── app/
│   ├── layout.tsx                     # Root layout: font, metadata, body
│   ├── globals.css                    # Tailwind base
│   ├── page.tsx                       # Route: / (home page)
│   ├── form/
│   │   └── page.tsx                   # Route: /form (workspace page)
│   └── api/
│       ├── fetch-form/
│       │   └── route.ts               # POST /api/fetch-form
│       └── submit/
│           └── route.ts               # POST /api/submit (SSE stream)
│
├── components/
│   ├── home/
│   │   └── UrlInputCard.tsx           # URL paste + load card on /
│   ├── form/
│   │   ├── FormSandbox.tsx            # Left panel: sandboxed Google Form mirror
│   │   ├── PageSection.tsx            # One page/section within the sandbox
│   │   ├── QuestionBlock.tsx          # Renders a single question (any type)
│   │   ├── ConfigPanel.tsx            # Right panel: answer config per question
│   │   ├── QuestionConfig.tsx         # Config row for one question
│   │   ├── SubmissionSettings.tsx     # Count, delay, randomize-delay controls
│   │   ├── ProgressModal.tsx          # Live 0/N modal during submission
│   │   └── CompletionDialog.tsx       # Final success dialog
│   └── ui/                            # shadcn/ui auto-generated (do not edit manually)
│
├── lib/
│   ├── parser.ts                      # Server: fetch + parse Google Form HTML
│   ├── randomizer.ts                  # Resolve answers per randomization mode
│   ├── submitter.ts                   # Async generator: submit N times with delay
│   └── utils.ts                       # cn(), sleep(), clamp() helpers
│
├── types/
│   └── form.ts                        # All shared TypeScript interfaces
│
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. TypeScript Types — `types/form.ts`

Write this file first. Every other file imports from here.

```typescript
export type QuestionType =
  | 'short_text'
  | 'paragraph'
  | 'multiple_choice'
  | 'checkbox'
  | 'dropdown'
  | 'linear_scale'
  | 'date'
  | 'time'
  | 'grid'
  | 'unknown'

export interface FormQuestion {
  id: string              // "entry.123456789"
  title: string
  description?: string    // question-level helper text
  type: QuestionType
  required: boolean
  options: string[]       // for MCQ, checkbox, dropdown, grid rows
  gridColumns?: string[]  // for grid type column headers
  scaleMin?: number
  scaleMax?: number
  scaleMinLabel?: string
  scaleMaxLabel?: string
  pageIndex: number       // 0-based page index this question belongs to
}

export interface FormPage {
  index: number
  title: string
  description: string
  questions: FormQuestion[]
}

export interface ParsedForm {
  formId: string
  title: string
  description: string
  actionUrl: string       // The Google formResponse POST endpoint
  pages: FormPage[]
  allQuestions: FormQuestion[]
}

export type RandomMode = 'uniform' | 'weighted'

export interface AnswerConfig {
  questionId: string
  randomize: boolean       // if false, always use values[0]
  mode: RandomMode         // only applies when randomize=true and values.length > 1
  values: string[]         // one or more possible answers
  weights: number[]        // parallel to values; only used when mode='weighted'; must sum to 100
}

export interface SubmissionConfig {
  count: number            // total submissions to run
  delayMs: number          // base ms between submissions
  randomizeDelay: boolean  // apply +-50% jitter to delayMs
  answers: AnswerConfig[]
}

export interface SubmissionResult {
  index: number            // 1-based submission number
  success: boolean
  statusCode?: number
  error?: string
  durationMs: number
}

export interface SSEEvent {
  type: 'progress' | 'complete' | 'error'
  submitted: number        // how many have been attempted so far
  succeeded: number
  failed: number
  total: number
  result?: SubmissionResult
  message?: string
}
```

---

## 4. Lib: Parser — `lib/parser.ts`

Server-side only. Never import this in a Client Component.

### Strategy

Every public Google Form HTML page contains a JavaScript variable `FB_PUBLIC_LOAD_DATA_` embedded in a `<script>` tag. It is a large nested JSON array containing every question, its type, its options, its entry ID, and page break markers.

Parse this variable — do NOT scrape HTML elements for questions. The embedded JSON is reliable; the HTML structure is not.

```typescript
import * as cheerio from 'cheerio'
import type { ParsedForm, FormPage, FormQuestion, QuestionType } from '@/types/form'

const TYPE_MAP: Record<number, QuestionType> = {
  0: 'short_text',
  1: 'paragraph',
  2: 'multiple_choice',
  3: 'dropdown',
  4: 'checkbox',
  5: 'linear_scale',
  7: 'date',
  8: 'time',
  9: 'grid',
}

export async function fetchAndParseForm(rawUrl: string): Promise<ParsedForm> {
  const viewUrl = normalizeUrl(rawUrl)

  const res = await fetch(viewUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) throw new Error(`HTTP ${res.status} when fetching form`)
  const html = await res.text()

  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/)
  if (!match) {
    throw new Error(
      'Could not extract form data. The form may be private, require login, or no longer exist.'
    )
  }

  const raw = JSON.parse(match[1])

  const $ = cheerio.load(html)
  const rawAction = $('form[action]').attr('action') ?? ''
  const actionUrl =
    rawAction.replace(/&amp;/g, '&') ||
    viewUrl.replace('/viewform', '/formResponse')

  const formMeta = raw[1]
  const title: string = formMeta[8] ?? 'Untitled Form'
  const description: string = formMeta[0] ?? ''
  const formId = extractFormId(rawUrl)

  const rawItems: any[] = formMeta[1] ?? []
  const pages: FormPage[] = []
  let current: FormPage = { index: 0, title: '', description: '', questions: [] }
  pages.push(current)

  for (const item of rawItems) {
    if (!Array.isArray(item)) continue
    // Type 8 = page break
    if (item[3] === 8) {
      current = {
        index: pages.length,
        title: item[1] ?? `Page ${pages.length + 1}`,
        description: item[2] ?? '',
        questions: [],
      }
      pages.push(current)
      continue
    }
    const q = parseQuestion(item, current.index)
    if (q) current.questions.push(q)
  }

  const allQuestions = pages.flatMap((p) => p.questions)
  return { formId, title, description, actionUrl, pages, allQuestions }
}

function parseQuestion(item: any[], pageIndex: number): FormQuestion | null {
  if (!item[4]?.[0]) return null
  const entry = item[4][0]
  const entryId = `entry.${entry[0]}`
  const typeInt: number = item[3] ?? 0
  const type: QuestionType = TYPE_MAP[typeInt] ?? 'unknown'
  const required = entry[2] === 1
  const title: string = item[1] ?? 'Question'
  const description: string = item[2] ?? ''

  const options: string[] = []
  if (Array.isArray(entry[1])) {
    for (const opt of entry[1]) {
      if (opt[0]) options.push(opt[0])
    }
  }

  const gridColumns: string[] = []
  if (type === 'grid' && Array.isArray(item[4][1]?.[1])) {
    for (const col of item[4][1][1]) {
      if (col[0]) gridColumns.push(col[0])
    }
  }

  let scaleMin: number | undefined
  let scaleMax: number | undefined
  let scaleMinLabel: string | undefined
  let scaleMaxLabel: string | undefined
  if (type === 'linear_scale' && entry[1]?.[0]?.[3]) {
    const bounds = entry[1][0][3]
    scaleMin = bounds[0] ?? 1
    scaleMax = bounds[1] ?? 5
    scaleMinLabel = bounds[2] ?? ''
    scaleMaxLabel = bounds[3] ?? ''
  }

  return {
    id: entryId,
    title,
    description,
    type,
    required,
    options,
    gridColumns,
    scaleMin,
    scaleMax,
    scaleMinLabel,
    scaleMaxLabel,
    pageIndex,
  }
}

function normalizeUrl(url: string): string {
  let u = url.trim()
  u = u.replace('/edit', '/viewform').replace('/prefill', '/viewform')
  if (!u.includes('/viewform')) {
    u = u.split('?')[0].replace(/\/$/, '') + '/viewform'
  }
  return u + '?hl=en'
}

function extractFormId(url: string): string {
  return url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? 'unknown'
}
```

---

## 5. Lib: Randomizer — `lib/randomizer.ts`

```typescript
import type { AnswerConfig } from '@/types/form'

export function resolveAnswer(config: AnswerConfig): string {
  const { values, weights, randomize, mode } = config
  if (!values.length) return ''
  if (!randomize || values.length === 1) return values[0]

  if (mode === 'weighted' && weights?.length === values.length) {
    return weightedPick(values, weights)
  }

  // Uniform random
  return values[Math.floor(Math.random() * values.length)]
}

function weightedPick(values: string[], weights: number[]): string {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < values.length; i++) {
    r -= weights[i]
    if (r <= 0) return values[i]
  }
  return values[values.length - 1]
}

export function resolveDelay(baseMs: number, randomize: boolean): number {
  if (!randomize) return baseMs
  const jitter = baseMs * 0.5
  return Math.max(0, baseMs + (Math.random() * jitter * 2 - jitter))
}

export function defaultAnswerConfig(questionId: string, options: string[]): AnswerConfig {
  return {
    questionId,
    randomize: options.length > 1,
    mode: 'uniform',
    values: options.length ? [...options] : [''],
    weights: options.length
      ? options.map(() => Math.floor(100 / options.length))
      : [100],
  }
}
```

---

## 6. Lib: Submitter — `lib/submitter.ts`

```typescript
import type { SubmissionConfig, SubmissionResult } from '@/types/form'
import { resolveAnswer, resolveDelay } from './randomizer'

export async function* runSubmissions(
  actionUrl: string,
  config: SubmissionConfig
): AsyncGenerator<SubmissionResult> {
  for (let i = 0; i < config.count; i++) {
    const payload = new URLSearchParams()

    for (const answerCfg of config.answers) {
      const val = resolveAnswer(answerCfg)
      if (val !== '') payload.append(answerCfg.questionId, val)
    }

    // Google Forms requires these hidden fields
    payload.append('fvv', '1')
    payload.append('partialResponse', '[null,null,""]')
    payload.append('pageHistory', '0')
    payload.append('fbzx', String(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)))

    const result = await submitOnce(actionUrl, payload, i + 1)
    yield result

    if (i < config.count - 1) {
      await sleep(resolveDelay(config.delayMs, config.randomizeDelay))
    }
  }
}

async function submitOnce(
  url: string,
  payload: URLSearchParams,
  index: number
): Promise<SubmissionResult> {
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
      redirect: 'follow',
    })
    return { index, success: res.ok, statusCode: res.status, durationMs: Date.now() - t0 }
  } catch (err: any) {
    return { index, success: false, error: err.message, durationMs: Date.now() - t0 }
  }
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}
```

---

## 7. Lib: Utils — `lib/utils.ts`

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val))
}
```

---

## 8. API Routes

### `app/api/fetch-form/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { fetchAndParseForm } from '@/lib/parser'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const url: string = body?.url ?? ''

    if (!url.includes('docs.google.com/forms')) {
      return NextResponse.json(
        { error: 'Please provide a valid Google Forms URL (docs.google.com/forms/...)' },
        { status: 400 }
      )
    }

    const form = await fetchAndParseForm(url)
    return NextResponse.json(form)
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}
```

### `app/api/submit/route.ts`

Streams SSE events back to the client. Each event is a JSON-encoded `SSEEvent` on its own `data:` line followed by two newlines.

```typescript
import { NextRequest } from 'next/server'
import { runSubmissions } from '@/lib/submitter'
import type { SubmissionConfig, SSEEvent } from '@/types/form'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { actionUrl, config }: { actionUrl: string; config: SubmissionConfig } =
    await req.json()

  const encoder = new TextEncoder()
  let succeeded = 0
  let failed = 0

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SSEEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        for await (const result of runSubmissions(actionUrl, config)) {
          if (result.success) succeeded++
          else failed++

          const submitted = succeeded + failed
          const isLast = submitted === config.count

          send({
            type: isLast ? 'complete' : 'progress',
            submitted,
            succeeded,
            failed,
            total: config.count,
            result,
          })
        }
      } catch (err: any) {
        send({
          type: 'error',
          submitted: succeeded + failed,
          succeeded,
          failed,
          total: config.count,
          message: err.message,
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

---

## 9. PAGE 1: `/` — Home (`app/page.tsx`)

### Purpose
Single purpose: accept a Google Form URL and navigate to `/form`.

### Full Page Layout

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│                  GForm Automator                         │
│       Automate any Google Form. Unlimited. Free.         │
│                                                          │
│   ┌──────────────────────────────────────────────────┐   │
│   │                                                  │   │
│   │  Google Form URL                                 │   │
│   │  ┌────────────────────────────────────────────┐ │   │
│   │  │  https://docs.google.com/forms/d/...       │ │   │
│   │  └────────────────────────────────────────────┘ │   │
│   │                                                  │   │
│   │            [ Load Form → ]                       │   │
│   │                                                  │   │
│   │  ● Error message shown here if fetch fails       │   │
│   │                                                  │   │
│   └──────────────────────────────────────────────────┘   │
│                                                          │
│   1. Paste URL    2. Configure answers    3. Submit      │
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Behavior (step by step)

1. Page renders with a centered card on a gray background.
2. User types or pastes a Google Form URL into the input field.
3. User clicks "Load Form" button or presses Enter.
4. Button shows spinner, input is disabled, error is cleared.
5. Frontend `POST /api/fetch-form` with body `{ url }`.
6. On success (2xx response):
   - Call `sessionStorage.setItem('parsedForm', JSON.stringify(data))`
   - Call `router.push('/form')`
7. On error (!res.ok or data.error exists):
   - Show `data.error` in a red error block below the button
   - Re-enable the input and button
   - Do NOT navigate

### Component: `components/home/UrlInputCard.tsx`

This is a Client Component (`'use client'`). The parent `app/page.tsx` simply renders it.

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ParsedForm } from '@/types/form'

export function UrlInputCard() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleLoad() {
    if (!url.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/fetch-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      const data: ParsedForm & { error?: string } = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      sessionStorage.setItem('parsedForm', JSON.stringify(data))
      router.push('/form')
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">GForm Automator</h1>
          <p className="text-gray-500">
            Automate any Google Form. Unlimited submissions. Free.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Google Form URL
          </label>
          <Input
            type="url"
            placeholder="https://docs.google.com/forms/d/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleLoad()}
            disabled={loading}
            className="mb-4"
          />
          <Button
            onClick={handleLoad}
            disabled={loading || !url.trim()}
            className="w-full"
            size="lg"
          >
            {loading ? 'Loading form...' : 'Load Form →'}
          </Button>

          {error && (
            <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}
        </div>

        {/* Steps hint */}
        <div className="mt-6 flex justify-between text-xs text-gray-400 px-2">
          <span>1. Paste your form URL</span>
          <span>2. Configure answers</span>
          <span>3. Hit submit</span>
        </div>
      </div>
    </div>
  )
}
```

### `app/page.tsx`

```typescript
import { UrlInputCard } from '@/components/home/UrlInputCard'

export default function HomePage() {
  return <UrlInputCard />
}
```

---

## 10. PAGE 2: `/form` — Workspace (`app/form/page.tsx`)

### Purpose
The full automation workspace. Left: sandbox form mirror. Right: answer config + controls. Modals on top when running.

### Full Page Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ← Back   GForm Automator   |   [Form Title]                            │  TOPBAR (h-14)
├────────────────────────────────┬─────────────────────────────────────────┤
│                                │                                         │
│   FORM SANDBOX                 │   CONFIG PANEL                          │
│   (left column, scrollable)    │   (right column, scrollable)            │
│                                │                                         │
│   Gray background              │   White background                      │
│                                │                                         │
│   ┌────────────────────────┐   │   Configure Answers           (sticky)  │
│   │ [Form title card]      │   │   ─────────────────────────────────     │
│   │ Title                  │   │                                         │
│   │ Description            │   │   Page 1                                │
│   └────────────────────────┘   │   [ QuestionConfig for Q1 ]             │
│                                │   [ QuestionConfig for Q2 ]             │
│   Page 1: Section heading      │                                         │
│   ┌────────────────────────┐   │   Page 2                                │
│   │ Q1: question text *    │   │   [ QuestionConfig for Q3 ]             │
│   │ [disabled input]       │   │                                         │
│   └────────────────────────┘   │   ─────────────────────────────────     │
│   ┌────────────────────────┐   │   SUBMISSION SETTINGS                   │
│   │ Q2: question text      │   │   Submissions: [ 100  ]                 │
│   │ ○ Option A             │   │   Delay (ms):  [ 1500 ]                 │
│   │ ○ Option B             │   │   [x] Randomize delay                   │
│   └────────────────────────┘   │                                         │
│                                │   [ Start Submitting ]  (big button)    │
│   Page 2: Section heading      │                                         │
│   ┌────────────────────────┐   │                                         │
│   │ Q3: Rate 1-5           │   │                                         │
│   │ 1  2  3  4  5          │   │                                         │
│   └────────────────────────┘   │                                         │
│                                │                                         │
└────────────────────────────────┴─────────────────────────────────────────┘

WHEN SUBMITTING — ProgressModal overlays the entire page:
┌───────────────────────────────────────┐
│         Submitting Responses          │
│                                       │
│               87 / 150               │  ← hero number, text-5xl font-bold
│                                       │
│   ████████████████████░░░░░  58%      │  ← progress bar
│                                       │
│   ✓ 85 submitted    ✗ 2 failed        │
│                                       │
│   Last: #87 — 243ms — success         │
│                                       │
│              [ Stop ]                 │
└───────────────────────────────────────┘

WHEN DONE — CompletionDialog replaces the modal:
┌───────────────────────────────────────┐
│               ✓                       │  ← large green checkmark
│                                       │
│   All 150 responses submitted!        │
│                                       │
│   ✓ 148 succeeded    ✗ 2 failed       │
│                                       │
│  [ Submit again ]   [ Back to home ]  │
└───────────────────────────────────────┘
```

### On Mount Behavior

```typescript
useEffect(() => {
  const raw = sessionStorage.getItem('parsedForm')
  if (!raw) {
    router.replace('/')
    return
  }
  const parsed: ParsedForm = JSON.parse(raw)
  setForm(parsed)
  setAnswers(parsed.allQuestions.map((q) => defaultAnswerConfig(q.id, q.options)))
}, [])
```

### State

```typescript
const [form, setForm] = useState<ParsedForm | null>(null)
const [answers, setAnswers] = useState<AnswerConfig[]>([])
const [count, setCount] = useState(100)
const [delayMs, setDelayMs] = useState(1500)
const [randomizeDelay, setRandomizeDelay] = useState(false)
const [modalOpen, setModalOpen] = useState(false)
const [submitted, setSubmitted] = useState(0)
const [succeeded, setSucceeded] = useState(0)
const [failed, setFailed] = useState(0)
const [lastResult, setLastResult] = useState<SubmissionResult | undefined>()
const [completionOpen, setCompletionOpen] = useState(false)
const [wasStopped, setWasStopped] = useState(false)
const abortRef = useRef<AbortController | null>(null)
```

### Start Submission Handler

```typescript
async function startSubmissions() {
  if (!form) return

  const config: SubmissionConfig = { count, delayMs, randomizeDelay, answers }

  abortRef.current = new AbortController()
  setSubmitted(0)
  setSucceeded(0)
  setFailed(0)
  setLastResult(undefined)
  setWasStopped(false)
  setCompletionOpen(false)
  setModalOpen(true)

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionUrl: form.actionUrl, config }),
      signal: abortRef.current.signal,
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() ?? ''

      for (const chunk of chunks) {
        if (!chunk.startsWith('data: ')) continue
        const event: SSEEvent = JSON.parse(chunk.slice(6))
        setSubmitted(event.submitted)
        setSucceeded(event.succeeded)
        setFailed(event.failed)
        if (event.result) setLastResult(event.result)
        if (event.type === 'complete' || event.type === 'error') {
          setModalOpen(false)
          setCompletionOpen(true)
        }
      }
    }
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      setModalOpen(false)
      setCompletionOpen(true)
    }
  }
}

function stopSubmissions() {
  abortRef.current?.abort()
  setWasStopped(true)
  setModalOpen(false)
  setCompletionOpen(true)
}

function handleSubmitAgain() {
  setCompletionOpen(false)
  // answers and form remain intact — user can reconfigure and restart
}

function handleGoHome() {
  sessionStorage.removeItem('parsedForm')
  router.push('/')
}
```

### JSX structure of `app/form/page.tsx`

```tsx
if (!form) return <div>Loading...</div>  // or a spinner

return (
  <div className="flex flex-col h-screen">
    {/* Topbar */}
    <header className="h-14 border-b flex items-center px-4 gap-4 shrink-0">
      <button onClick={handleGoHome}>← Back</button>
      <span className="font-semibold">GForm Automator</span>
      <span className="text-gray-500">|</span>
      <span className="text-gray-700 truncate">{form.title}</span>
    </header>

    {/* Main two-column layout */}
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Form sandbox */}
      <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
        <FormSandbox form={form} />
      </div>

      {/* Right: Config panel */}
      <div className="w-[420px] shrink-0 border-l overflow-y-auto bg-white">
        <ConfigPanel
          form={form}
          answers={answers}
          onAnswersChange={setAnswers}
          count={count}
          onCountChange={setCount}
          delayMs={delayMs}
          onDelayChange={setDelayMs}
          randomizeDelay={randomizeDelay}
          onRandomizeDelayChange={setRandomizeDelay}
          onStart={startSubmissions}
        />
      </div>
    </div>

    {/* Modals */}
    <ProgressModal
      open={modalOpen}
      submitted={submitted}
      succeeded={succeeded}
      failed={failed}
      total={count}
      lastResult={lastResult}
      onStop={stopSubmissions}
    />

    <CompletionDialog
      open={completionOpen}
      total={count}
      succeeded={succeeded}
      failed={failed}
      stopped={wasStopped}
      onSubmitAgain={handleSubmitAgain}
      onGoHome={handleGoHome}
    />
  </div>
)
```

---

## 11. Component: `FormSandbox.tsx`

Receives the `ParsedForm` and renders a read-only visual replica of the Google Form.

### Visual rules
- Outer wrapper: `bg-gray-100 min-h-full p-6`
- Form title card at the top: white card, with a thick purple top border (4px, matching Google Forms' accent color `#673ab7`)
- Each page/section: separate white card below, with a section heading
- Questions inside each card separated by `border-t` dividers

### Props
```typescript
interface FormSandboxProps {
  form: ParsedForm
}
```

### Render
```tsx
<div className="max-w-2xl mx-auto space-y-4">
  {/* Title card */}
  <div className="bg-white rounded-lg border-t-4 border-purple-600 p-6 shadow-sm">
    <h2 className="text-2xl font-normal text-gray-800">{form.title}</h2>
    {form.description && <p className="text-gray-600 mt-1 text-sm">{form.description}</p>}
  </div>

  {/* Pages */}
  {form.pages.map((page) => (
    <PageSection key={page.index} page={page} />
  ))}
</div>
```

---

## 12. Component: `PageSection.tsx`

One page/section of the form sandbox.

```typescript
interface PageSectionProps {
  page: FormPage
}
```

```tsx
<div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
  {(page.title || page.description) && (
    <div className="px-6 py-4 border-b border-gray-200">
      {page.title && <h3 className="text-lg font-medium text-gray-800">{page.title}</h3>}
      {page.description && <p className="text-sm text-gray-500">{page.description}</p>}
    </div>
  )}
  <div className="divide-y divide-gray-100">
    {page.questions.map((q) => (
      <div key={q.id} className="px-6 py-5">
        <QuestionBlock question={q} />
      </div>
    ))}
  </div>
</div>
```

---

## 13. Component: `QuestionBlock.tsx`

Renders one question visually. Display-only — all inputs are `disabled`.

### Props
```typescript
interface QuestionBlockProps {
  question: FormQuestion
}
```

### Render each type

**All question types share this wrapper:**
```tsx
<div>
  <p className="text-sm font-medium text-gray-800 mb-1">
    {question.title}
    {question.required && <span className="text-red-500 ml-1">*</span>}
  </p>
  {question.description && (
    <p className="text-xs text-gray-500 mb-3">{question.description}</p>
  )}
  {/* type-specific UI below */}
</div>
```

**Type-specific UI:**

| type | Render |
|---|---|
| `short_text` | `<input type="text" disabled placeholder="Short answer text" className="w-full border-b border-gray-300 py-1 text-sm bg-transparent text-gray-400" />` |
| `paragraph` | `<textarea disabled placeholder="Long answer text" rows={3} className="w-full border border-gray-200 rounded p-2 text-sm bg-gray-50 text-gray-400 resize-none" />` |
| `multiple_choice` | Map options: `<label><input type="radio" disabled /> {option}</label>` |
| `checkbox` | Map options: `<label><input type="checkbox" disabled /> {option}</label>` |
| `dropdown` | `<select disabled><option>Choose...</option>{options.map(o => <option>{o}</option>)}</select>` |
| `linear_scale` | Row of numbered buttons from `scaleMin` to `scaleMax`, all disabled, with `scaleMinLabel` left and `scaleMaxLabel` right beneath |
| `date` | `<input type="date" disabled className="border border-gray-200 rounded p-1 text-sm" />` |
| `time` | `<input type="time" disabled className="border border-gray-200 rounded p-1 text-sm" />` |
| `grid` | A table: column headers from `gridColumns`, row headers from `options`, each cell has `<input type="radio" disabled />` |
| `unknown` | `<span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Unsupported question type</span>` |

---

## 14. Component: `ConfigPanel.tsx`

The right panel. Scrollable. Contains one `QuestionConfig` per question (grouped by page), then `SubmissionSettings` pinned at the bottom.

### Props
```typescript
interface ConfigPanelProps {
  form: ParsedForm
  answers: AnswerConfig[]
  onAnswersChange: (answers: AnswerConfig[]) => void
  count: number
  onCountChange: (n: number) => void
  delayMs: number
  onDelayChange: (ms: number) => void
  randomizeDelay: boolean
  onRandomizeDelayChange: (v: boolean) => void
  onStart: () => void
}
```

### Layout
```tsx
<div className="flex flex-col h-full">
  {/* Sticky header */}
  <div className="px-4 py-3 border-b font-semibold text-sm sticky top-0 bg-white z-10">
    Configure Answers
  </div>

  {/* Scrollable question configs */}
  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
    {form.pages.map((page) => (
      <div key={page.index}>
        {form.pages.length > 1 && (
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {page.title || `Page ${page.index + 1}`}
          </p>
        )}
        <div className="space-y-3">
          {page.questions.map((q) => {
            const config = answers.find((a) => a.questionId === q.id)!
            return (
              <QuestionConfig
                key={q.id}
                question={q}
                config={config}
                onChange={(updated) =>
                  onAnswersChange(answers.map((a) => (a.questionId === q.id ? updated : a)))
                }
              />
            )
          })}
        </div>
      </div>
    ))}
  </div>

  {/* Sticky submission settings at bottom */}
  <div className="border-t">
    <SubmissionSettings
      count={count}
      onCountChange={onCountChange}
      delayMs={delayMs}
      onDelayChange={onDelayChange}
      randomizeDelay={randomizeDelay}
      onRandomizeDelayChange={onRandomizeDelayChange}
      onStart={onStart}
    />
  </div>
</div>
```

---

## 15. Component: `QuestionConfig.tsx`

Configures the automated answer(s) for one question.

### Props
```typescript
interface QuestionConfigProps {
  question: FormQuestion
  config: AnswerConfig
  onChange: (updated: AnswerConfig) => void
}
```

### Visual layout

```
┌─────────────────────────────────────────────────────┐
│  [Q title truncated]                  [type badge]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Answer values:                                     │
│  ┌──────────────────────────────┐  [✕]             │
│  │ value 1                      │                  │
│  └──────────────────────────────┘                  │
│  ┌──────────────────────────────┐  [✕]             │
│  │ value 2                      │                  │
│  └──────────────────────────────┘                  │
│  [ + Add value ]                                    │
│                                                     │
│  [toggle] Randomize answers                         │
│                                                     │
│  (if randomize=true AND values.length > 1):         │
│  Mode: [ Uniform ▾ ]                                │
│                                                     │
│  (if mode='weighted'):                              │
│  value 1  [━━━━━━━━░░]  60%                        │
│  value 2  [━━░░░░░░░░]  40%                        │
│  Total: 100% ✓  / ⚠ Must equal 100%               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Per-type initial state rules

| Question type | Initial `config.values` | `config.randomize` |
|---|---|---|
| `multiple_choice` | All option labels from `question.options` | `true` |
| `checkbox` | All option labels from `question.options` | `true` |
| `dropdown` | All option labels from `question.options` | `true` |
| `linear_scale` | All integers from `scaleMin` to `scaleMax` (as strings) | `true` |
| `short_text` | `['']` (one empty input) | `false` |
| `paragraph` | `['']` (one empty input) | `false` |
| `date` | `['']` with hint "Format: YYYY-MM-DD" | `false` |
| `time` | `['']` with hint "Format: HH:MM" | `false` |
| `grid` | One input per row for the first column (entry IDs differ per row for grid) | `false` |

### Weighted mode validation
- All weights must be integers summing to exactly 100.
- Show `⚠ Weights must total 100%` warning if not.
- Disable the global "Start Submitting" button when any question has invalid weights.
- Include an "Auto-balance" button that sets all weights to `Math.floor(100 / values.length)` with remainder on the first item.

### Important: submitted values must match Google Forms exactly
For MCQ, checkbox, dropdown — the submitted string must be the exact option label text. Pre-populate from `question.options` so the user doesn't have to type them. They can modify if needed.

---

## 16. Component: `SubmissionSettings.tsx`

Bottom of the config panel. Sticky to the bottom.

### Props
```typescript
interface SubmissionSettingsProps {
  count: number
  onCountChange: (n: number) => void
  delayMs: number
  onDelayChange: (ms: number) => void
  randomizeDelay: boolean
  onRandomizeDelayChange: (v: boolean) => void
  onStart: () => void
  disabled?: boolean
}
```

### Layout
```tsx
<div className="p-4 space-y-4">
  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
    Submission Settings
  </p>

  <div className="grid grid-cols-2 gap-3">
    <div>
      <label className="text-xs text-gray-600 mb-1 block">Submissions</label>
      <Input
        type="number"
        min={1}
        value={count}
        onChange={(e) => onCountChange(Math.max(1, parseInt(e.target.value) || 1))}
      />
    </div>
    <div>
      <label className="text-xs text-gray-600 mb-1 block">Delay (ms)</label>
      <Input
        type="number"
        min={0}
        value={delayMs}
        onChange={(e) => onDelayChange(Math.max(0, parseInt(e.target.value) || 0))}
      />
    </div>
  </div>

  <div className="flex items-center gap-2">
    <Switch checked={randomizeDelay} onCheckedChange={onRandomizeDelayChange} />
    <label className="text-sm text-gray-600">Randomize delay (±50%)</label>
  </div>

  <Button
    className="w-full"
    size="lg"
    onClick={onStart}
    disabled={disabled}
  >
    Start Submitting
  </Button>
</div>
```

---

## 17. Component: `ProgressModal.tsx`

Full-screen overlay. Appears when submissions start. Does NOT close itself.

### Props
```typescript
interface ProgressModalProps {
  open: boolean
  submitted: number
  succeeded: number
  failed: number
  total: number
  lastResult?: SubmissionResult
  onStop: () => void
}
```

### Layout
```tsx
{open && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
    <div className="bg-white rounded-2xl p-8 shadow-xl w-full max-w-md mx-4">
      <h2 className="text-lg font-semibold text-gray-800 text-center mb-6">
        Submitting Responses
      </h2>

      {/* Hero counter */}
      <div className="text-center mb-6">
        <span className="text-6xl font-bold text-gray-900">
          {submitted} / {total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
        <div
          className="bg-gray-900 h-2 rounded-full transition-all duration-300"
          style={{ width: `${total > 0 ? (submitted / total) * 100 : 0}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 text-right mb-6">
        {total > 0 ? Math.round((submitted / total) * 100) : 0}%
      </p>

      {/* Stats row */}
      <div className="flex justify-center gap-8 mb-4">
        <span className="text-sm text-green-600">✓ {succeeded} succeeded</span>
        <span className="text-sm text-red-500">✗ {failed} failed</span>
      </div>

      {/* Last result line */}
      {lastResult && (
        <p className="text-xs text-gray-400 text-center mb-6">
          Last: #{lastResult.index} — {lastResult.durationMs}ms —{' '}
          {lastResult.success ? '✓ success' : `✗ ${lastResult.error ?? 'failed'}`}
        </p>
      )}

      {/* Stop button */}
      <Button variant="outline" className="w-full" onClick={onStop}>
        Stop
      </Button>
    </div>
  </div>
)}
```

---

## 18. Component: `CompletionDialog.tsx`

Shown after all submissions finish or Stop is pressed.

### Props
```typescript
interface CompletionDialogProps {
  open: boolean
  total: number
  succeeded: number
  failed: number
  stopped: boolean
  onSubmitAgain: () => void
  onGoHome: () => void
}
```

### Layout
```tsx
{open && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
    <div className="bg-white rounded-2xl p-8 shadow-xl w-full max-w-sm mx-4 text-center">
      {/* Icon */}
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      {/* Message */}
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        {stopped
          ? 'Submission stopped'
          : `All ${total} responses submitted!`}
      </h2>

      {/* Stats */}
      <div className="flex justify-center gap-6 mb-6 text-sm">
        <span className="text-green-600">✓ {succeeded} succeeded</span>
        {failed > 0 && <span className="text-red-500">✗ {failed} failed</span>}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onSubmitAgain}>
          Submit again
        </Button>
        <Button className="flex-1" onClick={onGoHome}>
          Back to home
        </Button>
      </div>
    </div>
  </div>
)}
```

---

## 19. `app/layout.tsx`

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GForm Automator',
  description: 'Automate Google Form submissions. Unlimited. Free.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

---

## 20. `next.config.ts`

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['cheerio'],
  },
}

export default nextConfig
```

---

## 21. Install Commands

```bash
# 1. Scaffold
pnpm create next-app@latest gform-automator \
  --typescript --tailwind --app --no-src-dir --no-import-alias

cd gform-automator

# 2. Dependencies
pnpm add cheerio react-hook-form clsx tailwind-merge

# 3. shadcn/ui — accept all defaults, choose Slate base color, yes to CSS variables
npx shadcn-ui@latest init

# 4. shadcn components needed
npx shadcn-ui@latest add button input label dialog progress badge toggle switch separator
```

---

## 22. Build Order

Execute in this exact sequence:

```
 1. Scaffold + install (section 21)
 2. types/form.ts                         (section 3)
 3. lib/utils.ts                          (section 7)
 4. lib/randomizer.ts                     (section 5)
 5. lib/submitter.ts                      (section 6)
 6. lib/parser.ts                         (section 4)
 7. app/api/fetch-form/route.ts           (section 8)
 8. app/api/submit/route.ts               (section 8)
 9. components/form/QuestionBlock.tsx     (section 13)
10. components/form/PageSection.tsx       (section 12)
11. components/form/FormSandbox.tsx       (section 11)
12. components/form/QuestionConfig.tsx    (section 15)
13. components/form/SubmissionSettings.tsx(section 16)
14. components/form/ConfigPanel.tsx       (section 14)
15. components/form/ProgressModal.tsx     (section 17)
16. components/form/CompletionDialog.tsx  (section 18)
17. components/home/UrlInputCard.tsx      (section 9)
18. app/form/page.tsx                     (section 10)
19. app/page.tsx                          (section 9)
20. app/layout.tsx                        (section 19)
21. next.config.ts                        (section 20)
22. pnpm dev — test with a public form
```

---

## 23. Testing Checklist

**Home page (`/`)**
- [ ] Page renders at localhost:3000
- [ ] Empty URL → button is disabled
- [ ] Invalid URL (not a Google Form) → error message shown
- [ ] Private/login form → error message shown
- [ ] Valid public form → navigates to /form with form loaded

**Form page (`/form`)**
- [ ] Direct nav to /form (no sessionStorage) → redirected to /
- [ ] Form title shows in topbar
- [ ] All pages show as sections in sandbox
- [ ] Short text renders disabled input
- [ ] MCQ renders radio buttons with correct labels
- [ ] Checkbox renders checkbox list
- [ ] Dropdown renders select with options
- [ ] Linear scale renders numbered buttons with labels
- [ ] Required questions show red asterisk *
- [ ] Config panel has one row per question
- [ ] MCQ/checkbox/dropdown configs pre-populate with real options
- [ ] Adding a second answer value shows Randomize toggle
- [ ] Weighted mode shows percentage inputs
- [ ] Weights not summing to 100 → warning shown, Start disabled
- [ ] Auto-balance button distributes weights evenly
- [ ] Start button → ProgressModal opens
- [ ] Counter increments: 0/50, 1/50 ... 50/50
- [ ] Progress bar fills proportionally
- [ ] Succeeded and failed counts correct
- [ ] Stop mid-run → modal closes, CompletionDialog shows "stopped"
- [ ] Full run → CompletionDialog shows "All N responses submitted!"
- [ ] "Submit again" → dialog closes, form stays, can run again
- [ ] "Back to home" → navigates to /, sessionStorage cleared

---

## 24. Known Limitations & Handling

| Limitation | How to handle |
|---|---|
| Private / login-required form | `/api/fetch-form` throws "Could not extract form data" — show on home page |
| File upload questions | Skip in QuestionConfig — show disabled badge: "File uploads cannot be automated" |
| reCAPTCHA forms | Detect `grecaptcha` in fetched HTML — show warning banner at top of /form |
| Google 429 rate limiting | Surface `statusCode: 429` in lastResult line — user should increase delay |
| 0 questions parsed | Show error on /form: "No questions found. Check if the form is public." |
| Form changes after load | Not handled — user must re-paste URL on home page |

---

## 25. Deployment

```bash
# Vercel (zero config, recommended)
pnpm build && vercel deploy

# Self-hosted Node
pnpm build && pnpm start   # port 3000

# With custom port
PORT=8080 pnpm start
```

No environment variables required. No database. No external services.

---

*End of guide. Two pages: `/` for URL input, `/form` for everything else. Start at section 22 (Build Order) and work linearly.*