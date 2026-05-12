/**
 * @fileoverview SpammerZ - Type Definitions
 * JSDoc-typed interfaces for all data structures
 */

/**
 * @typedef {'short_text' | 'paragraph' | 'multiple_choice' | 'checkbox' | 'dropdown' | 'linear_scale' | 'date' | 'time' | 'grid' | 'unknown'} QuestionType
 */

/**
 * @typedef {'uniform' | 'weighted'} RandomMode
 */

/**
 * @typedef {Object} FormQuestion
 * @property {string} id - entry.XXXXXXXX
 * @property {string} title - Question text
 * @property {string} [description] - Helper text
 * @property {QuestionType} type - Question type
 * @property {boolean} required - Is required
 * @property {string[]} options - Available options for MCQ/checkbox/dropdown
 * @property {string[]} [gridColumns] - Column headers for grid type
 * @property {number} [scaleMin] - Min value for linear scale
 * @property {number} [scaleMax] - Max value for linear scale
 * @property {string} [scaleMinLabel] - Label for min value
 * @property {string} [scaleMaxLabel] - Label for max value
 * @property {number} pageIndex - 0-based page index
 */

/**
 * @typedef {Object} FormPage
 * @property {number} index - Page index
 * @property {string} title - Page title
 * @property {string} description - Page description
 * @property {FormQuestion[]} questions - Questions on this page
 */

/**
 * @typedef {Object} ParsedForm
 * @property {string} formId - Google Form ID
 * @property {string} title - Form title
 * @property {string} description - Form description
 * @property {string} actionUrl - formResponse endpoint URL
 * @property {FormPage[]} pages - All pages
 * @property {FormQuestion[]} allQuestions - Flat list of all questions
 */

/**
 * @typedef {Object} AnswerConfig
 * @property {string} questionId - entry.XXXXXXXX
 * @property {boolean} randomize - Use random answer selection
 * @property {RandomMode} mode - Uniform or weighted
 * @property {string[]} values - Possible answer values
 * @property {number[]} [weights] - Parallel to values, must sum to 100 for weighted mode
 */

/**
 * @typedef {Object} SubmissionConfig
 * @property {number} count - Total submissions to run
 * @property {number} delayMs - Base ms between submissions
 * @property {boolean} randomizeDelay - Apply +-50% jitter to delay
 * @property {AnswerConfig[]} answers - Per-question answer configs
 */

/**
 * @typedef {Object} SubmissionResult
 * @property {number} index - 1-based submission number
 * @property {boolean} success - Whether submission succeeded
 * @property {number} [statusCode] - HTTP status code
 * @property {string} [error] - Error message if failed
 * @property {number} durationMs - Time taken
 */

/**
 * @typedef {Object} SSEEvent
 * @property {'progress' | 'complete' | 'error'} type - Event type
 * @property {number} submitted - How many attempted so far
 * @property {number} succeeded - How many succeeded
 * @property {number} failed - How many failed
 * @property {number} total - Total to submit
 * @property {SubmissionResult} [result] - Latest result
 * @property {string} [message] - Error message if type=error
 */

/**
 * @typedef {Object} ProgressState
 * @property {number} submitted - Total submitted
 * @property {number} succeeded - Successful count
 * @property {number} failed - Failed count
 * @property {SubmissionResult} [lastResult] - Most recent result
 * @property {boolean} running - Is submission loop active
 */

// Export empty object (JSDoc-only file, no runtime value needed)
export {};