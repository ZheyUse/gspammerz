/**
 * @fileoverview SpammerZ - Form Parser
 * Extracts form structure from FB_PUBLIC_LOAD_DATA_ embedded in Google Forms
 */

/**
 * Type mapping: Google Forms internal type IDs to readable names
 * @type {Record<number, string>}
 */
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
  18: 'rating',
};

/**
 * Parse a Google Form from the current page
 * @returns {ParsedForm | null} Parsed form data or null if parsing fails
 */
export function parseFormFromPage() {
  /** @type {any} */
  const raw = window.FB_PUBLIC_LOAD_DATA_;

  if (!raw || !Array.isArray(raw)) {
    console.error('[SpammerZ] Could not find FB_PUBLIC_LOAD_DATA_');
    return null;
  }

  try {
    const formMeta = raw[1];
    const title = formMeta[8] ?? 'Untitled Form';
    const description = formMeta[0] ?? '';
    const formId = extractFormId(window.location.href);
    const actionUrl = getActionUrl(raw);

    const rawItems = formMeta[1] ?? [];
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

/**
 * Build pages from raw items array
 * @param {any[]} rawItems
 * @returns {FormPage[]}
 */
function buildPages(rawItems) {
  /** @type {FormPage[]} */
  const pages = [];
  /** @type {FormPage} */
  let current = { index: 0, title: '', description: '', questions: [] };
  pages.push(current);

  for (const item of rawItems) {
    if (!Array.isArray(item)) continue;

    // Type 8 = page break
    if (item[3] === 8) {
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
    if (question) {
      current.questions.push(question);
    }
  }

  return pages;
}

/**
 * Parse a single question item
 * @param {any[]} item - Raw item array
 * @param {number} pageIndex
 * @returns {FormQuestion | null}
 */
function parseQuestion(item, pageIndex) {
  // Entry data is in item[4][0]
  if (!item[4]?.[0]) return null;

  const entry = item[4][0];
  const entryId = `entry.${entry[0]}`;
  const typeInt = item[3] ?? 0;
  let type = TYPE_MAP[typeInt] ?? 'unknown';
  const required = entry[2] === 1;
  const title = item[1] ?? 'Question';
  const description = item[2] ?? '';

  /** @type {string[]} */
  const options = [];
  if (Array.isArray(entry[1])) {
    for (const opt of entry[1]) {
      if (opt[0]) options.push(opt[0]);
    }
  }

  const scaleGuess = inferLinearScaleFallback(type, title, entry, options);
  if (scaleGuess) {
    type = 'linear_scale';
  }

  /** @type {string[]} */
  const gridColumns = [];
  if ((type === 'grid' || type === 'checkbox_grid') && Array.isArray(item[4][1]?.[1])) {
    for (const col of item[4][1][1]) {
      if (col[0]) gridColumns.push(col[0]);
    }
  }

  /** @type {FormQuestion} */
  const question = {
    id: entryId,
    title,
    description,
    type,
    rawTypeInt: typeInt,
    rawTypeName: TYPE_MAP[typeInt] || 'unknown',
    required,
    options,
    pageIndex,
  };

  // Linear scale specific data
  if (type === 'linear_scale' && entry[1]?.[0]?.[3]) {
    const bounds = entry[1][0][3];
    question.scaleMin = bounds[0] ?? 1;
    question.scaleMax = bounds[1] ?? 5;
    question.scaleMinLabel = bounds[2] ?? '';
    question.scaleMaxLabel = bounds[3] ?? '';
  } else if (scaleGuess) {
    question.scaleMin = scaleGuess.scaleMin;
    question.scaleMax = scaleGuess.scaleMax;
  }

  if (gridColumns.length) {
    question.gridColumns = gridColumns;
  }

  return question;
}

function inferLinearScaleFallback(currentType, title, entry, options) {
  if (currentType === 'linear_scale') return null;
  if (!Array.isArray(options) || options.length < 2) return null;

  const normalizedTitle = String(title || '').toLowerCase();
  const ratingWords = /\b(rating|rate|score|satisfaction|satisfied|likelihood|likely|quality|performance|experience|agree|agreement|likert|scale|stars?)\b/.test(normalizedTitle);
  const numericOptions = options.every(opt => /^\d+$/.test(String(opt).trim()));
  const consecutiveNumbers = numericOptions && options.every((opt, idx) => Number(opt) === Number(options[0]) + idx);
  const bounds = Array.isArray(entry?.[1]?.[0]?.[3]) ? entry[1][0][3] : null;

  if (!numericOptions) return null;
  if (!ratingWords && !bounds && !consecutiveNumbers) return null;

  const min = Number(options[0]);
  const max = Number(options[options.length - 1]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max - min + 1 !== options.length) return null;

  return { scaleMin: min, scaleMax: max };
}

/**
 * Extract form ID from URL
 * @param {string} url
 * @returns {string}
 */
function extractFormId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Get the formResponse action URL
 * @param {any[]} raw - Raw FB_PUBLIC_LOAD_DATA_
 * @returns {string}
 */
function getActionUrl(raw) {
  // Try to get from embedded form URL
  if (raw[14]) {
    return raw[14] + '/formResponse';
  }
  // Fallback: convert viewform URL to formResponse
  const url = window.location.href
    .replace('/edit', '')
    .replace('/viewform', '')
    .replace('/prefill', '')
    .split('?')[0]
    .replace(/\/$/, '');
  return url + '/formResponse';
}

/**
 * Check if reCAPTCHA is detected on the form
 * @returns {boolean}
 */
export function hasRecaptcha() {
  return !!(window.grecaptcha || document.querySelector('[data-sitekey]'));
}
