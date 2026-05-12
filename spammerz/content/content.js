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
  delayMs: 1500,
  randomizeDelay: false,
  running: false,
  submitted: 0,
  succeeded: 0,
  failed: 0,
  lastResult: null,
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
    console.warn('[SpammerZ] reCAPTCHA detected - submissions may be blocked');
  }

  // Initialize default answer configs
  state.answers = formData.allQuestions.map(q => createDefaultConfig(q));

  // Load and render UI
  loadUI();

  // Listen for messages
  chrome.runtime.onMessage.addListener(handleMessage);

  // Expose manual reparse
  window._spammerz = {
    getState: () => state,
    getForm: () => formData,
    reparse: () => {
      console.log('[SpammerZ] Manual reparse triggered');
      const result = parseFormFromPage();
      if (result) {
        formData = result;
        state.answers = formData.allQuestions.map(q => createDefaultConfig(q));
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
  container.innerHTML = `<h3>⚠ SpammerZ Error</h3><p>${message}</p>`;

  const style = document.createElement('style');
  style.textContent = `
    #spammerz-error {
      position: fixed; top: 20px; right: 20px;
      background: #1a0000; border: 1px solid #ff4444;
      color: #ff4444; padding: 20px 30px;
      border-radius: 8px; font-family: -apple-system, sans-serif;
      font-size: 14px; z-index: 999999; max-width: 400px;
      box-shadow: 0 4px 20px rgba(255,68,68,0.3);
    }
    #spammerz-error h3 { margin: 0 0 10px 0; font-size: 16px; }
    #spammerz-error p { margin: 0; opacity: 0.9; }
  `;
  document.head.appendChild(style);
  document.body.appendChild(container);
}

// ============================================
// FROM: content/types.js
// ============================================
/** @typedef {'short_text'|'paragraph'|'multiple_choice'|'checkbox'|'dropdown'|'linear_scale'|'date'|'time'|'grid'|'unknown'} QuestionType */

/** @typedef {Object} FormQuestion
 * @property {string} id - entry.XXXXXXXX
 * @property {string} title
 * @property {string} [description]
 * @property {QuestionType} type
 * @property {boolean} required
 * @property {string[]} options
 * @property {string[]} [gridColumns]
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
  // Find the FB_PUBLIC_LOAD_DATA_ script tag — this is the source of truth
  const scripts = Array.from(document.querySelectorAll('script'));
  const dataScript = scripts.find(s => s.textContent.includes('FB_PUBLIC_LOAD_DATA_'));
  
  if (!dataScript) {
    console.error('[SpammerZ] FB_PUBLIC_LOAD_DATA_ not found');
    return null;
  }

  // Extract the JSON array from the script
  const match = dataScript.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
  // Fallback: grab everything after the = sign
  const rawMatch = dataScript.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]+?);?\s*$/);
  
  let data;
  try {
    data = JSON.parse((match || rawMatch)[1]);
  } catch (e) {
    console.error('[SpammerZ] Failed to parse FB_PUBLIC_LOAD_DATA_', e);
    return null;
  }

  // data[1][1] is the array of question blocks
  const questionBlocks = data?.[1]?.[1];
  if (!Array.isArray(questionBlocks)) {
    console.error('[SpammerZ] Unexpected data structure', data);
    return null;
  }

  const formTitle = data?.[1]?.[8] || 'Untitled Form';
  const formId    = data?.[2] || extractFormId(window.location.href);

  const TYPE_MAP = {
    0: 'short_text',
    1: 'multiple_choice',
    2: 'checkbox',
    3: 'dropdown',
    4: 'linear_scale',
    5: 'grid',          // multiple choice grid
    7: 'paragraph',
    9: 'date',
    10: 'time',
  };

  const questions = [];

  for (const block of questionBlocks) {
    // Each block: [title, fieldData, type, ?, ?, ?, ...]
    const title    = block[1] || 'Untitled question';
    const typeCode = block[3];
    const type     = TYPE_MAP[typeCode] || 'unknown';
    const fields   = block[4]; // array of sub-fields (usually 1, more for grid)

    if (!fields) continue;

    for (const field of fields) {
      const entryId  = 'entry.' + field[0];
      const required = field[2] === 1;
      const options  = [];

      // Options live at field[1]
      if (Array.isArray(field[1])) {
        for (const opt of field[1]) {
          if (opt[0]) options.push(opt[0]);
        }
      }

      // Linear scale bounds
      let scaleMin, scaleMax, scaleMinLabel, scaleMaxLabel;
      if (type === 'linear_scale' && field[3]) {
        scaleMin      = field[3][0];
        scaleMax      = field[3][1];
        scaleMinLabel = field[3][2] || '';
        scaleMaxLabel = field[3][3] || '';
      }

      questions.push({
        id: entryId,
        title,
        type,
        required,
        options,
        scaleMin, scaleMax, scaleMinLabel, scaleMaxLabel,
        pageIndex: 0,
      });

      console.log(`[SpammerZ] Parsed: ${entryId} | ${type} | "${title}" | options: ${options.join(', ') || '—'}`);
    }
  }

  const actionUrl = getFallbackActionUrl();

  return {
    formId,
    title: formTitle,
    description: '',
    actionUrl,
    pages: [{ index: 0, title: '', description: '', questions }],
    allQuestions: questions,
  };
}

function extractFormId(url) {
  return url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || 'unknown';
}

function getFallbackActionUrl() {
  // Works on /viewform, /prefill, and edit URLs
  const base = window.location.href
    .replace(/\/viewform.*$/, '')
    .replace(/\/prefill.*$/, '')
    .replace(/\/edit.*$/, '')
    .replace(/\/closedform.*$/, '');
  return base + '/formResponse';
}

function hasRecaptcha() {
  return !!(window.grecaptcha || document.querySelector('[data-sitekey]'));
}

// ============================================
// FROM: content/randomizer.js
// ============================================
function resolveAnswer(config) {
  const { values, weights, randomize, mode } = config;
  if (!values?.length) return '';
  if (!randomize || values.length === 1) return values[0];
  if (mode === 'weighted' && weights?.length === values.length) {
    return weightedPick(values, weights);
  }
  return values[Math.floor(Math.random() * values.length)];
}

function weightedPick(values, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < values.length; i++) {
    r -= weights[i];
    if (r <= 0) return values[i];
  }
  return values[values.length - 1];
}

function resolveDelay(baseMs, randomize) {
  if (!randomize) return baseMs;
  const jitter = baseMs * 0.5;
  return Math.max(0, baseMs + (Math.random() * jitter * 2 - jitter));
}

function createDefaultConfig(question) {
  let values = [...question.options];
  if (question.type === 'linear_scale' && question.scaleMin !== undefined) {
    values = [];
    for (let i = question.scaleMin; i <= question.scaleMax; i++) values.push(String(i));
  }
  if (!values.length) values = [''];
  const equalWeight = Math.floor(100 / values.length);
  return {
    questionId: question.id,
    randomize: values.length > 1,
    mode: 'uniform',
    values,
    weights: values.length > 1 ? values.map((_, i) => i === values.length - 1 ? 100 - (equalWeight * (values.length - 1)) : equalWeight) : [100],
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