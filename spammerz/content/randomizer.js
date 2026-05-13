/**
 * @fileoverview SpammerZ - Randomizer
 * Answer randomization with uniform and weighted modes
 */

import { defaultAnswerConfig } from './randomizer.js';

/**
 * Resolve a single answer based on config
 * @param {AnswerConfig} config
 * @returns {string}
 */
export function resolveAnswer(config) {
  const { values, weights, randomize } = config;

  if (!values || !values.length) return '';
  if (!randomize || values.length === 1) return values[0];

  if (weights && weights.length === values.length) {
    return weightedPick(values, weights);
  }

  // Uniform random
  return values[Math.floor(Math.random() * values.length)];
}

/**
 * Pick a value based on weights (must sum to 100)
 * @param {string[]} values
 * @param {number[]} weights
 * @returns {string}
 */
export function weightedPick(values, weights) {
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

/**
 * Resolve delay with optional jitter
 * @param {number} baseMs - Base delay in ms
 * @param {boolean} randomize - Whether to apply jitter
 * @param {number} jitterAmount - Jitter amount (default 0.5 = +-50%)
 * @returns {number}
 */
export function resolveDelay(baseMs, randomize, jitterAmount = 0.5) {
  if (!randomize) return baseMs;

  const jitter = baseMs * jitterAmount;
  const min = Math.max(0, baseMs - jitter);
  const max = baseMs + jitter;

  return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * Create default answer config for a question
 * @param {FormQuestion} question
 * @returns {AnswerConfig}
 */
export function createDefaultConfig(question) {
  let values = [...question.options];
  const randomize = values.length > 1;

  // Handle special types
  if (question.type === 'linear_scale' && question.scaleMin !== undefined) {
    values = [];
    for (let i = question.scaleMin; i <= question.scaleMax; i++) {
      values.push(String(i));
    }
  }

  if (!values.length) {
    values = [''];
  }

  /** @type {AnswerConfig} */
  const config = {
    questionId: question.id,
    randomize,
    mode: 'weighted',
    values,
  };

  // Add equal weights for weighted mode support
  if (values.length > 1) {
    const equalWeight = Math.floor(100 / values.length);
    config.weights = values.map((_, i) => {
      // Last item gets the remainder to ensure sum = 100
      return i === values.length - 1 ? 100 - (equalWeight * (values.length - 1)) : equalWeight;
    });
  }

  return config;
}

/**
 * Generate a random date string (YYYY-MM-DD)
 * @returns {string}
 */
export function randomDate() {
  const year = 2020 + Math.floor(Math.random() * 5);
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generate a random time string (HH:MM)
 * @returns {string}
 */
export function randomTime() {
  const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
  const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Generate a random text response
 * @param {number} [length=10] - Approximate word count
 * @returns {string}
 */
export function randomText(length = 10) {
  const words = [
    'Lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur',
    'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor',
    'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua',
    'response', 'answer', 'sample', 'test', 'data', 'input',
    'random', 'generated', 'automated', 'form', 'submission',
    'excellent', 'good', 'fair', 'poor', 'satisfied', 'neutral',
  ];

  const result = [];
  for (let i = 0; i < length; i++) {
    result.push(words[Math.floor(Math.random() * words.length)]);
  }
  return result.join(' ');
}
