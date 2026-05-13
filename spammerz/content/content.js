/**
 * @fileoverview SpammerZ - Main Content Script
 * Entry point that loads UI and initializes the extension
 */

// ============================================
// Minimal HTM implementation (inline, no CDN needed)
// ============================================
(function() {
  const htm = function(parts, ...values) {
    let str = parts[0];
    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      const part = parts[i + 1];
      if (Array.isArray(val)) {
        str += val.join('');
      } else if (val && typeof val === 'object') {
        str += val.content ? val.content : String(val);
      } else {
        str += val == null ? '' : val;
      }
      str += part;
    }
    return str;
  };
  htm.exports = true;
  window.htm = htm;
  window.htmFragment = function(parts, ...values) {
    const tmpl = document.createElement('template');
    tmpl.innerHTML = htm(parts, ...values);
    return tmpl.content;
  };
})();

// Global state
/** @type {ParsedForm | null} */
let formData = null;

/** @type {any} */
let state = {
  answers: [],
  count: 100,
  delayMs: 500,
  randomizeDelay: false,
  weightMode: 'plan',
  running: false,
  submitted: 0,
  succeeded: 0,
  failed: 0,
  lastResult: null,
  autoNameConfig: null,
  autoAddressConfig: null,
};

/** @type {AbortController | null} */
let abortController = null;

// Global state (default enabled)
const isEnabled = true;

/**
 * Initialize after HTM loads
 */
function init() {
  // htm is already set globally by the IIFE
  window.spammerzEnabled = isEnabled;

  // Parse the form
  formData = parseFormFromPage();

  if (!formData) {
    showError('Could not parse form. Make sure the form is public.');
    return;
  }

  // Check for reCAPTCHA
  if (hasRecaptcha()) {
  }

  // Initialize default answer configs
  state.answers = formData.allQuestions.map(q => createDefaultConfig(q));
  if (!state.autoNameConfig) state.autoNameConfig = createDefaultNameConfig();
  if (!state.autoAddressConfig && window.createDefaultAddressConfig) state.autoAddressConfig = window.createDefaultAddressConfig();

  // Load and render UI
  loadUI();

  // Listen for messages
  chrome.runtime.onMessage.addListener(handleMessage);

  // Expose manual reparse
  window._spammerz = {
    getState: () => state,
    getForm: () => formData,
    reparse: () => {
      const result = parseFormFromPage();
      if (result) {
        formData = result;
        state.answers = formData.allQuestions.map(q => createDefaultConfig(q));
        if (!state.autoNameConfig) state.autoNameConfig = createDefaultNameConfig();
        loadUI();
      }
      return result;
    }
  };
}

/**
 * Load the UI script and CSS
 */
function loadUI() {
  // panel.js and panel.css are already injected by the manifest
  if (window.renderSpammerZUI) {
    window.renderSpammerZUI(formData, state, updateState);
  } else {
    // panel.js hasn't defined its exports yet — wait one tick
    setTimeout(() => {
      if (window.renderSpammerZUI) {
        window.renderSpammerZUI(formData, state, updateState);
      } else {
        showError('UI failed to load. Check that ui/panel.js exists.');
      }
    }, 100);
  }
}

/**
 * Handle messages from popup/background
 */
function handleMessage(msg, sender, sendResponse) {
  switch (msg.action) {
    case 'start':
      if (!state.running) startSubmissions();
      break;
    case 'stop':
      if (state.running) stopSubmissions();
      break;
    case 'getState':
      sendResponse(state);
      break;
  }
  return true;
}

/**
 * Update state and re-render UI
 */
function updateState(updates) {
  state = { ...state, ...updates };
  if (window.spammerzUpdateState) {
    window.spammerzUpdateState(state);
  }
}

/**
 * Start the submission loop
 */
async function startSubmissions() {
  if (!formData || state.running) return;

  state.running = true;
  state.submitted = 0;
  state.succeeded = 0;
  state.failed = 0;
  state.lastResult = null;
  updateState(state);

  abortController = new AbortController();

  /** @type {SubmissionConfig} */
  const config = {
    count: state.count,
    delayMs: state.delayMs,
    randomizeDelay: state.randomizeDelay,
    answers: state.answers,
  };

  const onProgress = (event) => {
    updateState({
      submitted: event.submitted,
      succeeded: event.succeeded,
      failed: event.failed,
      lastResult: event.result,
    });
  };

  try {
    for await (const result of runSubmissions(formData.actionUrl, config, onProgress)) {
      if (abortController.signal.aborted) break;
      state.lastResult = result;
    }
  } catch (err) {
    console.error('[SpammerZ] Error:', err);
  } finally {
    updateState({ running: false });
  }
}

/**
 * Stop the submission loop
 */
function stopSubmissions() {
  if (abortController) abortController.abort();
  updateState({ running: false });
}

/**
 * Show error message
 */
function showError(message) {
  const container = document.createElement('div');
  container.id = 'spammerz-error';
  container.innerHTML = `
    <div class="spammerz-error-header">
      <h3>⚠ SpammerZ Error</h3>
      <button class="spammerz-error-toggle" id="spz-error-toggle" type="button">-</button>
    </div>
    <p class="spammerz-error-message">${message}</p>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #spammerz-error {
      position: fixed; right: 20px; bottom: 20px;
      background: #1a0000; border: 1px solid #ff4444;
      color: #ff4444; padding: 20px 30px;
      border-radius: 8px; font-family: -apple-system, sans-serif;
      font-size: 14px; z-index: 999999; max-width: 400px;
      box-shadow: 0 4px 20px rgba(255,68,68,0.3);
    }
    #spammerz-error h3 { margin: 0; font-size: 16px; }
    #spammerz-error p { margin: 10px 0 0 0; opacity: 0.9; }
    #spammerz-error.collapsed {
      padding: 6px 8px;
      max-width: 44px;
      min-width: 44px;
      text-align: center;
    }
    #spammerz-error.collapsed p,
    #spammerz-error.collapsed h3 {
      display: none;
    }
    .spammerz-error-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .spammerz-error-toggle {
      border: 1px solid #ff4444;
      background: transparent;
      color: #ff4444;
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      min-width: 24px;
    }
    .spammerz-error-toggle:hover {
      background: rgba(255, 68, 68, 0.1);
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(container);

  const toggle = container.querySelector('#spz-error-toggle');
  if (toggle) {
    toggle.onclick = () => {
      const isCollapsed = container.classList.toggle('collapsed');
      toggle.textContent = isCollapsed ? '+' : '-';
    };
  }
}

// ============================================
// FROM: content/types.js
// ============================================
/** @typedef {'short_text'|'paragraph'|'multiple_choice'|'checkbox'|'dropdown'|'linear_scale'|'date'|'time'|'grid'|'checkbox_grid'|'unknown'} QuestionType */

/** @typedef {Object} FormQuestion
 * @property {string} id - entry.XXXXXXXX
 * @property {string} title
 * @property {string} [description]
 * @property {QuestionType} type
 * @property {boolean} required
 * @property {string[]} options
 * @property {string[]} [gridCols]
 * @property {string[]} [gridColumns] - alias for gridCols
 * @property {number} [scaleMin]
 * @property {number} [scaleMax]
 * @property {string} [scaleMinLabel]
 * @property {string} [scaleMaxLabel]
 * @property {number} pageIndex
 */

/** @typedef {Object} FormPage
 * @property {number} index
 * @property {string} title
 * @property {string} description
 * @property {FormQuestion[]} questions
 */

/** @typedef {Object} ParsedForm
 * @property {string} formId
 * @property {string} title
 * @property {string} description
 * @property {string} actionUrl
 * @property {FormPage[]} pages
 * @property {FormQuestion[]} allQuestions
 */

/** @typedef {Object} AnswerConfig
 * @property {string} questionId
 * @property {boolean} randomize
 * @property {'uniform'|'weighted'} mode
 * @property {string[]} values
 * @property {number[]} [weights]
 */

// ============================================
// DOM-based Form Parser (like GFormTasker)
// ============================================

function parseFormFromPage() {
  const raw = window.FB_PUBLIC_LOAD_DATA_;
  if (raw && Array.isArray(raw)) {
    return parseFromRawData(raw);
  }

  // Fallback: extract FB_PUBLIC_LOAD_DATA_ from script
  const scripts = Array.from(document.querySelectorAll('script'));
  const dataScript = scripts.find(s => s.textContent.includes('FB_PUBLIC_LOAD_DATA_'));

  if (!dataScript) {
    console.error('[SpammerZ] FB_PUBLIC_LOAD_DATA_ not found');
    return null;
  }

  const match = dataScript.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
  const rawMatch = dataScript.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]+?);?\s*$/);

  let data;
  try {
    data = JSON.parse((match || rawMatch)[1]);
  } catch (e) {
    console.error('[SpammerZ] Failed to parse FB_PUBLIC_LOAD_DATA_', e);
    return null;
  }

  return parseFromRawData(data);
}

function parseFromRawData(raw) {
  try {
    const formMeta = raw[1];
    const title = formMeta?.[8] ?? 'Untitled Form';
    const description = formMeta?.[0] ?? '';
    const formId = raw?.[2] || extractFormId(window.location.href);
    const actionUrl = getActionUrl(raw);

    const rawItems = formMeta?.[1] ?? [];
    const pages = buildPages(rawItems);
    const allQuestions = pages.flatMap(p => p.questions);

    return {
      formId,
      title,
      description,
      actionUrl,
      pages,
      allQuestions,
    };
  } catch (err) {
    console.error('[SpammerZ] Error parsing form:', err);
    return null;
  }
}

function buildPages(rawItems) {
  const pages = [];
  let current = { index: 0, title: '', description: '', questions: [] };
  pages.push(current);

  for (const item of rawItems) {
    if (!Array.isArray(item)) continue;

    // Page break: item[3] === 8 with no entry data
    if (item[3] === 8 && !item[4]?.[0]) {
      current = {
        index: pages.length,
        title: item[1] ?? `Page ${pages.length + 1}`,
        description: item[2] ?? '',
        questions: [],
      };
      pages.push(current);
      continue;
    }

    const question = parseQuestion(item, current.index);
    if (question) current.questions.push(question);
  }

  return pages;
}

function parseQuestion(item, pageIndex) {
  if (!item[4]?.[0]) return null;

  const entry = item[4][0];
  const entryId = `entry.${entry[0]}`;
  const typeInt = item[3] ?? 0;
  const type = TYPE_MAP[typeInt] ?? 'unknown';
  const required = entry[2] === 1;
  const title = item[1] ?? 'Question';
  const description = item[2] ?? '';

  const options = [];
  if (Array.isArray(entry[1])) {
    for (const opt of entry[1]) {
      if (opt[0]) options.push(opt[0]);
    }
  }

  const gridColumns = [];
  if ((type === 'grid' || type === 'checkbox_grid') && Array.isArray(item[4][1]?.[1])) {
    for (const col of item[4][1][1]) {
      if (col[0]) gridColumns.push(col[0]);
    }
  }

  const question = {
    id: entryId,
    title,
    description,
    type,
    required,
    options,
    pageIndex,
  };

  if (type === 'linear_scale' && entry[1]?.[0]?.[3]) {
    const bounds = entry[1][0][3];
    question.scaleMin = bounds[0] ?? 1;
    question.scaleMax = bounds[1] ?? 5;
    question.scaleMinLabel = bounds[2] ?? '';
    question.scaleMaxLabel = bounds[3] ?? '';
  }

  if (gridColumns.length) {
    question.gridColumns = gridColumns;
  }

  return question;
}

const TYPE_MAP = {
  0: 'short_text',
  1: 'paragraph',
  2: 'multiple_choice',
  3: 'dropdown',
  4: 'checkbox',
  5: 'linear_scale',
  7: 'date',
  8: 'time',
  9: 'grid',
  27: 'checkbox_grid',
  73: 'checkbox_grid',
};

function extractFormId(url) {
  return url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || 'unknown';
}

function getActionUrl(raw) {
  const liveForm = document.querySelector('form[action*="formResponse"]');
  if (liveForm?.getAttribute('action')) {
    return liveForm.getAttribute('action');
  }
  if (raw?.[14]) {
    const base = String(raw[14]);
    if (base.includes('/formResponse')) return base;
    return base.replace(/\/$/, '') + '/formResponse';
  }
  const base = window.location.href
    .replace(/\/viewform.*$/, '')
    .replace(/\/prefill.*$/, '')
    .replace(/\/edit.*$/, '')
    .replace(/\/closedform.*$/, '');
  return base.replace(/\/$/, '') + '/formResponse';
}

function hasRecaptcha() {
  return !!(window.grecaptcha || document.querySelector('[data-sitekey]'));
}

// ============================================
// FROM: content/randomizer.js
// ============================================
function resolveAnswer(config) {
  const { values, weights, randomize } = config;
  if (!values?.length) return '';
  if (!randomize || values.length === 1) return values[0];
  if (weights?.length === values.length) {
    return weightedPick(values, weights);
  }
  return values[Math.floor(Math.random() * values.length)];
}

function weightedPick(values, weights) {
  const total = weights.reduce((a, b) => a + Math.max(0, Number(b) || 0), 0);
  if (total <= 0) return values[Math.floor(Math.random() * values.length)];

  let r = Math.random() * total;
  for (let i = 0; i < values.length; i++) {
    const weight = Math.max(0, Number(weights[i]) || 0);
    if (weight <= 0) continue;
    r -= weight;
    if (r <= 0) return values[i];
  }
  const weightedValues = values.filter((_, i) => Math.max(0, Number(weights[i]) || 0) > 0);
  return weightedValues[weightedValues.length - 1] || values[values.length - 1];
}

function resolveDelay(baseMs, randomize) {
  if (!randomize) return baseMs;
  const jitter = baseMs * 0.5;
  return Math.max(0, baseMs + (Math.random() * jitter * 2 - jitter));
}

function createDefaultConfig(question) {
  let values = [...question.options];
  if (question.type === 'linear_scale') {
    const scaleMin = Number.isFinite(question.scaleMin) ? question.scaleMin : 1;
    const scaleMax = Number.isFinite(question.scaleMax) ? question.scaleMax : Math.max(scaleMin, 5);
    values = [];
    for (let i = scaleMin; i <= scaleMax; i++) values.push(String(i));
  }
  if (!values.length) values = [''];
  const equalWeight = Math.floor(100 / values.length);
  return {
    questionId: question.id,
    randomize: values.length > 1,
    mode: 'weighted',
    values,
    weights: values.length > 1 ? values.map((_, i) => i === values.length - 1 ? 100 - (equalWeight * (values.length - 1)) : equalWeight) : [100],
  };
}

function createDefaultNameConfig() {
  return {
    enabled: true,
    fields: [],
    sources: {
      firstNames: ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'James', 'Mary'],
      lastNames: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'],
    },
    namesLoadedFromMd: false,
    patterns: ['first_last'],
    extensionIdx: 0,
    includeExtension: false,
  };
}

// ============================================
// FROM: content/submitter.js
// ============================================
async function* runSubmissions(actionUrl, config, onProgress) {
  let succeeded = 0, failed = 0;
  for (let i = 0; i < config.count; i++) {
    const payload = buildPayload(config.answers);
    const result = await submitForm(actionUrl, payload, i + 1);
    if (result.success) succeeded++; else failed++;
    onProgress({ type: 'progress', submitted: succeeded + failed, succeeded, failed, total: config.count, result });
    yield result;
    if (i < config.count - 1) await sleep(resolveDelay(config.delayMs, config.randomizeDelay));
  }
  onProgress({ type: 'complete', submitted: succeeded + failed, succeeded, failed, total: config.count });
}

function buildPayload(answers) {
  const payload = new FormData();
  payload.append('fvv', '1');
  payload.append('partialResponse', '[null,null,""]');
  payload.append('pageHistory', '0');
  payload.append('fbzx', String(Math.floor(Math.random() * 9007199254740991) + 1000000000));
  for (const cfg of answers) {
    const val = resolveAnswer(cfg);
    if (val !== '') payload.append(cfg.questionId, val);
  }
  return payload;
}

async function submitForm(url, payload, index) {
  const start = Date.now();
  try {
    fetch(url, { method: 'POST', body: payload, mode: 'no-cors' }).catch(() => {});
    await sleep(300);
    return { index, success: true, statusCode: 0, durationMs: Date.now() - start };
  } catch (e) {
    return { index, success: false, error: e.message, durationMs: Date.now() - start };
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Start the extension when DOM is ready
// Try multiple times because Google Forms lazy-loads content
let waitAttempts = 0;
const maxWaitAttempts = 30;

function waitForForm(callback) {
  // FB_PUBLIC_LOAD_DATA_ is in the initial HTML — just check for it
  const scripts = Array.from(document.querySelectorAll('script'));
  const ready   = scripts.some(s => s.textContent.includes('FB_PUBLIC_LOAD_DATA_'));

  if (ready) {
    callback();
  } else if (waitAttempts < 10) {
    waitAttempts++;
    setTimeout(() => waitForForm(callback), 300);
  } else {
    showError('Could not find form data. Is this a public Google Form?');
  }
}

waitForForm(init);
