/**
 * @fileoverview SpammerZ - Form Submitter
 * Handles HTTP POST submissions to Google Forms with no-cors mode
 */

import { resolveAnswer, resolveDelay, randomDate, randomTime, randomText } from './randomizer.js';

/**
 * Async generator that runs submissions with progress callbacks
 * @param {string} actionUrl - The formResponse endpoint
 * @param {SubmissionConfig} config - Submission configuration
 * @param {(event: SSEEvent) => void} onProgress - Progress callback
 * @returns {AsyncGenerator<SubmissionResult>}
 */
export async function* runSubmissions(actionUrl, config, onProgress) {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < config.count; i++) {
    // Build answer payload
    const payload = buildPayload(config.answers);

    // Submit to Google Forms
    const result = await submitForm(actionUrl, payload, i + 1);

    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }

    // Report progress
    onProgress({
      type: 'progress',
      submitted: succeeded + failed,
      succeeded,
      failed,
      total: config.count,
      result,
    });

    // Yield the result
    yield result;

    // Delay before next submission (skip on last iteration)
    if (i < config.count - 1) {
      const delay = resolveDelay(config.delayMs, config.randomizeDelay);
      await sleep(delay);
    }
  }

  // Final event
  onProgress({
    type: 'complete',
    submitted: succeeded + failed,
    succeeded,
    failed,
    total: config.count,
  });
}

/**
 * Build the form payload with all answers
 * @param {AnswerConfig[]} answers
 * @returns {FormData}
 */
export function buildPayload(answers) {
  const payload = new FormData();

  // Add required hidden fields
  payload.append('fvv', '1');
  payload.append('partialResponse', '[null,null,""]');
  payload.append('pageHistory', '0');
  payload.append('fbzx', String(Math.floor(Math.random() * 9007199254740991) + 1000000000));

  // Add answer for each question
  for (const answerConfig of answers) {
    const value = resolveAnswer(answerConfig);
    if (value !== '') {
      payload.append(answerConfig.questionId, value);
    }
  }

  return payload;
}

/**
 * Submit form data to Google Forms
 * @param {string} url - formResponse URL
 * @param {FormData} payload - Form data to submit
 * @param {number} index - Submission index (1-based)
 * @returns {Promise<SubmissionResult>}
 */
export async function submitForm(url, payload, index) {
  const startTime = Date.now();

  try {
    // Use no-cors mode because Google Forms doesn't support CORS
    // We can't read the response, but the request still goes through
    fetch(url, {
      method: 'POST',
      body: payload,
      mode: 'no-cors',
    }).catch(() => {
      // Ignore fetch errors in no-cors mode - we can't tell success anyway
    });

    // Since we use no-cors, we assume success after a short delay
    // The request either goes through or Google rejects it server-side
    await sleep(500);

    return {
      index,
      success: true,
      statusCode: 0,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      index,
      success: false,
      error: err.message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Utility sleep function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate special values for date/time/text questions
 * @param {AnswerConfig} config
 * @returns {string}
 */
export function generateSpecialValue(config) {
  // Check if the config expects a special type
  const firstValue = config.values[0] || '';

  // If it looks like a date field (empty default or specific hint)
  if (firstValue === '' && config.questionId.includes('date')) {
    return randomDate();
  }

  // If it looks like a time field
  if (firstValue === '' && config.questionId.includes('time')) {
    return randomTime();
  }

  // If values array is empty, generate random text
  if (!config.values.length) {
    return randomText();
  }

  // Otherwise use normal resolution
  return resolveAnswer(config);
}