# SpammerZ — Hybrid Browser Extension

> **The best of both worlds.** Serverless Chrome extension with reliable JSON-based form parsing. No server, no API routes, no cheerio — just JavaScript running in your browser.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Extension Format** | Chrome Extension (Manifest V3) | Runs in Chrome, no installation friction |
| **Language** | TypeScript | Type safety, self-contained in `.js` files |
| **UI Rendering** | HTM (Hyperscript Tagged Markup) | React-like syntax without a build step |
| **State Management** |Vanilla JavaScript | No framework overhead, just `useState`-like pattern with closures |
| **Persistence** | `chrome.storage.local` | Built-in extension API for local storage |
| **Form Parsing** | `FB_PUBLIC_LOAD_DATA_` extraction | Reliable, Google Forms' own internal data |
| **Form Submission** | Native `fetch()` API with `no-cors` | Direct POST to Google Forms endpoint |
| **Styling** | Plain CSS | No Tailwind/bundler needed |

### No Build Step Required

Unlike traditional React apps, this project:
- Does **not** use Vite, Webpack, esbuild, or any bundler
- Does **not** use npm/pnpm install for dependencies
- Loads **HTM from CDN** at runtime via `<script type="module">` in the content script
- All TypeScript is written as JSDoc-typed JavaScript (or compiled once with `tsc` in `transpileOnly` mode)

The result: a folder of `.js` and `.css` files that load directly into Chrome.

---

## What You Get

A **single Chrome extension** that:

1. **Parses Google Forms reliably** — extracts form data from `FB_PUBLIC_LOAD_DATA_` JavaScript variable (same technique as the Next.js version, but in-browser)
2. **No server required** — all parsing and submission happens in the browser
3. **Full workspace UI** — not just a tiny popup, but a proper panel that shows:
   - The form sandbox (preview of the form)
   - Per-question answer configuration
   - Randomization settings (uniform or weighted)
   - Submission count and delay controls
   - Live progress modal
4. **All question types supported** — text, paragraph, multiple choice, checkbox, dropdown, linear scale, date, time, grid
5. **Serverless** — no backend, no API, no deployment, no hosting costs

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Google Form Page (docs.google.com/forms/...)            │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │  Content Script                                   │    │
│  │  │  - Parses FB_PUBLIC_LOAD_DATA_ JSON             │    │
│  │  │  - Handles form submissions via fetch()          │    │
│  │  │  - Injects the workspace UI into the page        │    │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Background Script (Service Worker)                     │   │
│  │  - Persists state across tabs                          │   │
│  │  - Handles extension icon badge                        │   │
│  │  - Optional: cross-session logging                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

No server. No API. Everything runs locally.
```

---

## Key Innovation: Browser-Side JSON Parsing

Google Forms embeds all form structure data in a JavaScript variable called `FB_PUBLIC_LOAD_DATA_`. It looks like this when you view the page source:

```html
<script>
FB_PUBLIC_LOAD_DATA_ = [
  null,                          // [0] raw form description
  [                              // [1] form content array
    [                            // item 1
      "Question Title",          // [0] question text
      "Description text",        // [1] helper text
      null,                      // [2]
      2,                         // [3] question type (2 = multiple choice)
      [                          // [4] entry data
        [1234567890],           // [0][0] entry ID
        [                       // [0][1] options
          ["Option A"],
          ["Option B"],
          ["Option C"],
        ],
        1,                      // [0][2] required flag
      ],
      null,                      // [5]
      null,                      // [6]
      null,                      // [7]
    ],
    // more items...
  ],
  null, null, null, null,        // [2-5]
  null, null,                     // [6-7]
  "Form Title",                  // [8] form title
];
</script>
```

**The trick:** We can read this variable directly from the page's JavaScript context via the content script. No server needed.

```javascript
// In content.js — read the form data directly from the page
const rawData = window.FB_PUBLIC_LOAD_DATA_;
if (!rawData) {
  console.error('Could not find FB_PUBLIC_LOAD_DATA_');
  return;
}

const formTitle = rawData[1][8];
const questions = rawData[1][1].map(parseItem);
```

This is the same parsing strategy used in the Next.js guide, but executed in the browser instead of server-side with cheerio.

---

## File Structure

```
spammerz/
├── manifest.json           ← Chrome extension config (Manifest V3)
├── content/
│   ├── content.ts          ← Main content script (entry point)
│   ├── parser.ts           ← FB_PUBLIC_LOAD_DATA_ JSON parser
│   ├── submitter.ts        ← Form submission logic
│   ├── randomizer.ts       ← Answer randomization (uniform + weighted)
│   └── types.ts            ← TypeScript interfaces
├── ui/
│   ├── panel.tsx           ← Injected workspace panel (React via HTM)
│   ├── panel.css           ← Panel styling
│   └── components/
│       ├── FormSandbox     ← Read-only form preview
│       ├── ConfigPanel     ← Answer configuration per question
│       ├── ProgressModal   ← Live submission progress
│       └── CompletionDialog← Done screen
├── background/
│   └── service-worker.ts   ← Background script for state persistence
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

> **Note:** We use **HTM (Hyperscript Tagged Markup)** instead of bundler-based React. HTM lets us write React-like components in plain JavaScript without a build step. No Webpack, no Vite, no esbuild.

---

## How It Works (Step by Step)

### Step 1: User Opens a Google Form

```
User navigates to: https://docs.google.com/forms/d/e/.../viewform
```

The extension's content script automatically activates on this URL (via `host_permissions` in manifest).

### Step 2: Content Script Parses the Form

```typescript
// content.ts (simplified)
import { parseFormFromPage } from './parser.js';
import { runSubmissions } from './submitter.js';

async function init() {
  const formData = parseFormFromPage();

  if (!formData) {
    showError('Could not parse form. Make sure the form is public.');
    return;
  }

  renderWorkspaceUI(formData);
  setupMessageHandlers();
}

init();
```

The parser extracts `FB_PUBLIC_LOAD_DATA_` directly from `window`:

```typescript
// parser.ts (simplified)
export function parseFormFromPage(): ParsedForm | null {
  const raw = (window as any).FB_PUBLIC_LOAD_DATA_;
  if (!raw || !Array.isArray(raw)) return null;

  const [desc, items, , , , , , , title] = raw;
  const formId = extractFormId(window.location.href);
  const actionUrl = getActionUrl();

  return {
    formId,
    title: title || 'Untitled Form',
    description: desc || '',
    actionUrl,
    pages: buildPages(items),
    allQuestions: flattenPages(buildPages(items)),
  };
}
```

### Step 3: Workspace UI Renders

The content script injects HTML/CSS into the page:

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌────────────────────────────────┬───────────────────────────┐    │
│  │                                │   Configure Answers        │    │
│  │   FORM SANDBOX (preview)       │   ──────────────────────   │    │
│  │   ────────────────────────      │                            │    │
│  │                                │   Q1: [Short text]         │    │
│  │   Form Title                   │   ├─ Answer 1              │    │
│  │   Description                  │   ├─ [+ Add value]          │    │
│  │                                │   └─ [x] Randomize         │    │
│  │   Page 1                       │                            │    │
│  │   ┌────────────────────────┐  │   Q2: [Multiple choice]    │    │
│  │   │ Q1: Question text *    │  │   ├─ Option A ✓            │    │
│  │   │ [disabled input]       │  │   ├─ Option B ✓            │    │
│  │   └────────────────────────┘  │   ├─ Option C ✓            │    │
│  │   ┌────────────────────────┐  │   └─ [x] Randomize         │    │
│  │   │ Q2: Question text      │  │                            │    │
│  │   │ ○ Option A             │  │   Q3: [Linear scale]       │    │
│  │   │ ○ Option B             │  │   ├─ 1 ──── 2 ──── 5       │    │
│  │   │ ○ Option C             │  │   └─ [x] Randomize         │    │
│  │   └────────────────────────┘  │                            │    │
│  │                                │   ──────────────────────   │    │
│  │                                │   Submission Settings      │    │
│  │                                │   Submissions: [ 100 ]     │    │
│  │                                │   Delay (ms):  [ 1500 ]    │    │
│  │                                │   [x] Randomize delay      │    │
│  │                                │                            │    │
│  │                                │   [ Start Submitting ]     │    │
│  │                                │                            │    │
│  └────────────────────────────────┴───────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Step 4: User Configures Answers

For each question, the user can:

**Multiple Choice / Checkbox / Dropdown:**
- See all available options (pre-populated from form)
- Toggle options on/off to include/exclude them
- Enable "Randomize" to cycle through selected options
- Optionally enable "Weighted" and set percentages per option

**Text / Paragraph:**
- Enter custom answer text
- Option to add multiple values and randomize

**Linear Scale:**
- Shows scale range (e.g., 1-5)
- Randomization picks a number in that range

### Step 5: User Clicks "Start Submitting"

```typescript
// submitter.ts (simplified)
export async function* runSubmissions(
  actionUrl: string,
  config: SubmissionConfig,
  onProgress: (progress: ProgressEvent) => void
): AsyncGenerator<SubmissionResult> {

  for (let i = 0; i < config.count; i++) {
    // Build answer payload
    const payload = buildPayload(config.answers);

    // Submit to Google Forms
    const result = await submitForm(actionUrl, payload);
    yield result;

    // Report progress
    onProgress({ submitted: i + 1, result });

    // Delay before next submission
    if (i < config.count - 1) {
      await sleep(resolveDelay(config.delayMs, config.randomizeDelay));
    }
  }
}

async function submitForm(url: string, payload: FormData): Promise<SubmissionResult> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: payload,
      mode: 'no-cors',  // Critical: Google Forms doesn't support CORS
    });
    return { success: true, statusCode: 0 };  // no-cors means no status
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Step 6: Live Progress Modal

While submitting, a modal overlays the screen showing:

```
┌────────────────────────────────────────┐
│        Submitting Responses            │
│                                        │
│              087 / 100                 │
│                                        │
│   ████████████████████░░░░░░░░  87%    │
│                                        │
│   ✓ 85 succeeded    ✗ 2 failed        │
│                                        │
│   Last: #87 — success                  │
│                                        │
│             [ Stop ]                   │
└────────────────────────────────────────┘
```

### Step 7: Completion

When done:

```
┌────────────────────────────────────────┐
│                 ✓                       │
│                                        │
│   All 100 responses submitted!         │
│                                        │
│   ✓ 98 succeeded    ✗ 2 failed          │
│                                        │
│   [ Submit Again ]  [ Close ]          │
└────────────────────────────────────────┘
```

---

## Question Type Handling

| Type | ID | Parser | Randomizer | Submit |
|---|---|---|---|---|
| Short text | 0 | Extract `entry.XXXXX` | Random string | `entry.XXXXX=value` |
| Paragraph | 1 | Extract `entry.XXXXX` | Random sentence | `entry.XXXXX=value` |
| Multiple choice | 2 | Extract options array | Pick random option | `entry.XXXXX=value` |
| Dropdown | 3 | Extract options array | Pick random option | `entry.XXXXX=value` |
| Checkbox | 4 | Extract options array | Subset of options | Multiple `entry.XXXXX=value` lines |
| Linear scale | 5 | Extract min/max + labels | Pick number in range | `entry.XXXXX=value` |
| Date | 7 | Extract `entry.XXXXX` | Random valid date | `entry.XXXXX=MM/DD/YYYY` |
| Time | 8 | Extract `entry.XXXXX` | Random valid time | `entry.XXXXX=HH:MM` |
| Grid | 9 | Extract rows + columns | Pick per row | Multiple entry IDs per row |

---

## Technical Decisions Explained

### Why HTM Instead of Bundled React?

HTM (Hyperscript Tagged Markup) is a zero-config way to write JSX-like syntax in plain JavaScript:

```javascript
// Instead of JSX (requires build step):
import { h, render } from 'preact';
const element = <div className="container">{count}</div>;

// HTM (no build step needed):
import { html } from 'htm/react';
const element = html`<div class="container">${count}</div>`;
```

This means:
- **No Vite/Webpack/esbuild** — no bundling step
- **No npm packages** — pure JavaScript files
- **Load it from CDN** in the content script
- Works directly with Chrome's Manifest V3 content script loading

### Why Content Script Injection Instead of Popup?

Two options for the UI:

**Option A: Popup (GFormTasker approach)**
- Small icon in toolbar => click => small popup
- Limited space, basic UI
- Can access page data via `chrome.tabs.sendMessage`

**Option B: Content Script Injection (our hybrid approach)**
- UI injected directly into the form page
- Full width/height available for a proper workspace
- Direct access to `window.FB_PUBLIC_LOAD_DATA_` (no message passing)
- Better UX — user sees the form and config side by side

**We chose Option B** for the better user experience.

### Why `mode: 'no-cors'`?

Google Forms returns a redirect on POST. Without CORS headers, the browser blocks the response. But we don't need the response — we just need the request to go through. `mode: 'no-cors'` sends the request and doesn't wait for a response:

```javascript
fetch(url, {
  method: 'POST',
  body: payload,
  mode: 'no-cors',  // Don't wait for response
});
```

**Tradeoff:** We can't tell if the submission actually succeeded. Google Forms appears to accept all submissions that reach it, but we have no 100% confirmation. We assume success unless an error is thrown.

### State Persistence

We use `chrome.storage.local` for persistence:

```typescript
// Save submission history
chrome.storage.local.set({
  history: [
    { formId, count, succeeded, failed, timestamp }
  ]
});

// This persists across browser restarts
```

---

## manifest.json

```json
{
  "manifest_version": 3,
  "name": "SpammerZ",
  "version": "1.0",
  "description": "Bulk submit Google Forms with random answers — serverless",

  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],

  "host_permissions": [
    "*://docs.google.com/forms/*",
    "https://unpkg.com/",          // CDN for HTM
    "https://cdn.jsdelivr.net/"     // CDN fallback
  ],

  "background": {
    "service_worker": "background/service-worker.js"
  },

  "content_scripts": [
    {
      "matches": ["*://docs.google.com/forms/*"],
      "js": ["content/content.js"],
      "css": ["ui/panel.css"],
      "run_at": "document_end"
    }
  ],

  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

---

## Build Order

```
1. Create folder structure
2. Create manifest.json
3. Create types.ts — all TypeScript interfaces
4. Create parser.ts — FB_PUBLIC_LOAD_DATA_ parser
5. Create randomizer.ts — uniform + weighted randomization
6. Create submitter.ts — POST to Google Forms
7. Create background/service-worker.ts — persistence
8. Create ui/panel.css — styling
9. Create ui/panel.tsx — React components via HTM
10. Create content/content.ts — entry point, wires everything together
11. Create icon files (or use placeholder)
12. Load in Chrome via chrome://extensions/
```

---

## Loading in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select your `spammerz` folder
5. Navigate to any public Google Form
6. UI appears alongside the form

---

## Testing Checklist

**On form page load:**
- [ ] UI renders without errors
- [ ] All questions visible in sandbox
- [ ] All questions visible in config panel
- [ ] Question types display correctly
- [ ] Required fields marked with *

**Configuration:**
- [ ] MCQ options pre-populated from form
- [ ] Can toggle individual options on/off
- [ ] Randomize toggle enables/disables per-value selection
- [ ] Weighted mode shows percentage inputs
- [ ] Weights sum validation works

**Submission:**
- [ ] Start button initiates submission loop
- [ ] Progress modal appears
- [ ] Counter increments live
- [ ] Progress bar fills
- [ ] Succeeded/failed counts update
- [ ] Stop button cancels loop mid-run
- [ ] Completion dialog shows on finish

**Persistence:**
- [ ] Submission history saved to chrome.storage.local
- [ ] History persists across browser restart

---

## Known Limitations

| Issue | Status | Workaround |
|---|---|---|
| Private forms (login required) | Cannot parse | Show error message |
| File upload questions | Not supported | Skip question, show notice |
| reCAPTCHA forms | Cannot bypass | Stop immediately if detected |
| no-cors response unknown | Can't confirm success | Assume success unless error |
| Form structure changed | May break | Check console for parser errors |

---

## Comparison: Three Approaches

| Feature | GFormTasker (commercial) | Next.js Guide (guide.md) | **SpammerZ** |
|---|---|---|---|
| Server needed | Yes (credits) | Yes | **No** |
| Form parsing | DOM scraping | cheerio server-side | **JSON extraction** |
| UI | Popup only | Full web app | **Embedded workspace** |
| Question types | All common | All | **All** |
| Weighted random | No | Yes | **Yes** |
| Setup complexity | Install extension | Deploy web app | **Install extension** |
| Cost | Paid | Server hosting | **Free** |
| Source code | Closed | Open (guide) | **Open** |

---

## Summary

This hybrid approach gives you:

- ✅ **Serverless** — runs entirely in your browser
- ✅ **Reliable parsing** — extracts `FB_PUBLIC_LOAD_DATA_` JSON (not fragile DOM scraping)
- ✅ **Full workspace UI** — side-by-side form preview and configuration
- ✅ **All question types** — supports every Google Forms question type
- ✅ **Weighted randomization** — control answer distribution
- ✅ **No cost** — no subscriptions, no hosting, no API keys
- ✅ **Open source** — you own and control the code

The entire application is a Chrome extension you install once and use anywhere. No backend. No server. Just JavaScript parsing JSON and making HTTP requests to Google Forms — exactly what it's designed to accept anyway.

---

## Next Steps

To build this:

1. Create the folder structure
2. Start with `types.ts` (defines everything)
3. Build `parser.ts` next (parsing logic is the foundation)
4. Then `randomizer.ts` and `submitter.ts`
5. UI last (`panel.tsx` + `panel.css`)
6. Wire it all together in `content.ts`

The code is simpler than the Next.js version — no API routes, no server components, no sessionStorage, no deployment. Just a content script that reads the page, renders UI, and submits forms.