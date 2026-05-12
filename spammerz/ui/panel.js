/**
 * @fileoverview SpammerZ - UI Components
 * Left: Config with weighted percentages | Right: Sandbox (Google Form replica)
 */

/**
 * Render the complete workspace UI
 */
function renderSpammerZUI(formData, state, updateState) {
  window.spammerzFormData = formData;
  window.spammerzState = state;
  window.spammerzUpdateState = (updates) => {
    window.spammerzState = { ...window.spammerzState, ...updates };
    render();
  };

  let container = document.getElementById('spammerz-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'spammerz-container';
    document.body.appendChild(container);
  }

  function render() {
    if (!window.htm) return;
    const s = window.spammerzState;

    // Disabled state - floating toggle
    if (s.enabled === false) {
      const toggle = document.createElement('div');
      toggle.id = 'spammerz-disabled-toggle';
      toggle.innerHTML = '<span class="spammerz-toggle-icon">⚡</span><span>SpammerZ</span>';
      toggle.onclick = () => {
        window.spammerzState.enabled = true;
        render();
      };
      container.innerHTML = '';
      container.appendChild(toggle);
      return;
    }

    // Main layout
    container.innerHTML = `
      <div class="spammerz-backdrop">
        <div class="spammerz-panel">
          <div class="spammerz-header">
            <button class="spammerz-header-btn spammerz-disable-btn" id="spz-disable-btn">✕</button>
            <div class="spammerz-logo">
              <span class="spammerz-logo-text">Spammer</span><span class="spammerz-logo-accent">Z</span>
            </div>
            <div class="spammerz-form-title">${escHtml(formData.title)}</div>
          </div>
          <div class="spammerz-content">
            <div class="spammerz-config-panel" id="spz-config-panel"></div>
            <div class="spammerz-sandbox" id="spz-sandbox"></div>
          </div>
          <div id="spz-modal-container"></div>
        </div>
      </div>
    `;

    // Render Config Panel (LEFT side)
    renderConfigPanel(formData, s, updateState);

    // Render Google Form Sandbox (RIGHT side)
    renderSandbox(formData, s);

    // Render Modal if running/finished
    if (s.running || s.submitted > 0) {
      renderModal(s);
    }

    // Attach all listeners
    attachAllListeners(formData, s, updateState);
  }

  render();
}

// Export for content script
window.renderSpammerZUI = renderSpammerZUI;

/**
 * Render the left config panel with weighted percentages
 */
function renderConfigPanel(formData, s, updateState) {
  const panel = document.getElementById('spz-config-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="spammerz-config-header">Configure Weights (%)</div>
    <div class="spammerz-config-questions" id="spz-questions-list"></div>
    <div class="spammerz-settings" id="spz-settings"></div>
  `;

  // Render each question
  const questionsList = document.getElementById('spz-questions-list');
  formData.allQuestions.forEach((q, qIdx) => {
    const cfg = s.answers[qIdx];
    if (!cfg) return;
    questionsList.appendChild(createWeightedQuestionConfig(q, cfg, qIdx));
  });

  // Render submission settings
  const settings = document.getElementById('spz-settings');
  settings.innerHTML = `
    <div class="spammerz-settings-title">Submission Settings</div>
    <div class="spammerz-settings-row">
      <label>Submissions</label>
      <input type="number" id="spz-count" value="${s.count}" min="1" max="10000">
    </div>
    <div class="spammerz-settings-row">
      <label>Delay (ms)</label>
      <input type="number" id="spz-delay" value="${s.delayMs}" min="0" max="60000" step="100">
    </div>
    <div class="spammerz-settings-toggle-row">
      <label class="spammerz-toggle">
        <input type="checkbox" id="spz-jitter" ${s.randomizeDelay ? 'checked' : ''}>
        <span class="spammerz-toggle-slider"></span>
        <span>Randomize delay</span>
      </label>
    </div>
    <button class="spammerz-btn-primary" id="spz-start-btn" ${s.running ? 'disabled' : ''}>
      ${s.running ? 'Running...' : 'Start Submitting'}
    </button>
  `;
}

/**
 * Create weighted config for one question
 */
function createWeightedQuestionConfig(question, cfg, qIdx) {
  const item = document.createElement('div');
  item.className = 'spammerz-config-item';

  // Question title header
  item.innerHTML = `
    <div class="spammerz-config-item-title">${escHtml(question.title)}</div>
    <div class="spammerz-config-item-type">${getTypeName(question.type)}</div>
  `;

  // Add weight inputs for each option
  if (question.options.length > 0 || question.type === 'linear_scale') {
    const weightsList = document.createElement('div');
    weightsList.className = 'spammerz-weights-list';

    // Get options to show
    let options = [...question.options];

    // For linear scale, generate options from scale range
    if (question.type === 'linear_scale') {
      options = [];
      for (let i = question.scaleMin; i <= question.scaleMax; i++) {
        options.push(String(i));
      }
    }

    // Add weight slider for each option
    options.forEach((opt, optIdx) => {
      const weight = cfg.weights ? (cfg.weights[optIdx] || 0) : 0;
      const percentage = calculatePercentage(cfg.weights, optIdx);

      const row = document.createElement('div');
      row.className = 'spammerz-weight-row';

      row.innerHTML = `
        <div class="spammerz-weight-option">${escHtml(opt)}</div>
        <div class="spammerz-weight-input-group">
          <input type="number" class="spammerz-weight-input"
                 data-qidx="${qIdx}" data-optidx="${optIdx}"
                 value="${weight}" min="0" max="100" step="1">
          <span class="spammerz-weight-percent">${percentage.toFixed(0)}%</span>
        </div>
      `;

      weightsList.appendChild(row);
    });

    // Show total percentage
    const total = cfg.weights ? cfg.weights.reduce((a, b) => a + b, 0) : 0;
    const totalRow = document.createElement('div');
    totalRow.className = 'spammerz-weights-total';
    totalRow.textContent = `Total weight: ${total}`;
    weightsList.appendChild(totalRow);

    item.appendChild(weightsList);
  } else {
    // Text input type - custom text
    const textConfig = document.createElement('div');
    textConfig.className = 'spammerz-text-config';
    textConfig.innerHTML = `
      <input type="text" class="spammerz-config-text-input" data-qidx="${qIdx}"
             value="${cfg.values[0] || ''}" placeholder="Custom answer text">
    `;
    item.appendChild(textConfig);
  }

  return item;
}

/**
 * Calculate percentage for an option based on weights
 */
function calculatePercentage(weights, optIdx) {
  if (!weights || weights.length === 0) return 0;
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return (weights[optIdx] / total) * 100;
}

/**
 * Render the Google Form replica sandbox (RIGHT side)
 * This should look EXACTLY like the real Google Form
 */
function renderSandbox(formData, s) {
  const sandbox = document.getElementById('spz-sandbox');
  if (!sandbox) return;

  sandbox.className = 'spammerz-sandbox google-forms-theme';

  sandbox.innerHTML = `
    <div class="spammerz-gform-container">
      <div class="spammerz-gform-header">
        <div class="spammerz-gform-title">${escHtml(formData.title)}</div>
        ${formData.description ? `<div class="spammerz-gform-desc">${escHtml(formData.description)}</div>` : ''}
      </div>
      <div class="spammerz-gform-questions" id="spz-gform-questions"></div>
      <div class="spammerz-gform-footer">
        <div class="spammerz-gform-submit-bar">
          <span class="spammerz-gform-progress-text" id="spz-progress-text">
            ${s.submitted}/${s.count} submitted
          </span>
        </div>
      </div>
    </div>
  `;

  // Render questions that look like Google Form
  const questionsContainer = document.getElementById('spz-gform-questions');
  formData.allQuestions.forEach((q, qIdx) => {
    questionsContainer.appendChild(createGoogleFormQuestion(q, qIdx));
  });
}

/**
 * Create a question element that looks exactly like Google Form
 */
function createGoogleFormQuestion(question, qIdx) {
  const div = document.createElement('div');
  div.className = 'spammerz-gform-question';

  // Question title with required asterisk
  const titleHtml = question.title + (question.required ? ' <span class="spammerz-gform-required">*</span>' : '');
  div.innerHTML = `<div class="spammerz-gform-question-title">${titleHtml}</div>`;

  // Create the input based on type
  let inputHtml = '';

  switch (question.type) {
    case 'short_text':
      inputHtml = `<input type="text" class="spammerz-gform-input" placeholder="Your answer">`;
      break;

    case 'paragraph':
      inputHtml = `<textarea class="spammerz-gform-textarea" rows="4" placeholder="Your answer"></textarea>`;
      break;

    case 'multiple_choice':
      inputHtml = question.options.map(opt =>
        `<div class="spammerz-gform-radio-option">
           <label class="spammerz-gform-radio-label">
             <input type="radio" name="q_${qIdx}" class="spammerz-gform-radio">
             <span class="spammerz-gform-radio-custom"></span>
             <span class="spammerz-gform-option-text">${escHtml(opt)}</span>
           </label>
         </div>`
      ).join('');
      break;

    case 'checkbox':
      inputHtml = question.options.map(opt =>
        `<div class="spammerz-gform-checkbox-option">
           <label class="spammerz-gform-checkbox-label">
             <input type="checkbox" class="spammerz-gform-checkbox">
             <span class="spammerz-gform-checkbox-custom"></span>
             <span class="spammerz-gform-option-text">${escHtml(opt)}</span>
           </label>
         </div>`
      ).join('');
      break;

    case 'dropdown':
      inputHtml = `<select class="spammerz-gform-select">
        <option value="">Choose</option>
        ${question.options.map(opt => `<option value="${escHtml(opt)}">${escHtml(opt)}</option>`).join('')}
      </select>`;
      break;

    case 'linear_scale':
      const scaleOpts = [];
      for (let i = question.scaleMin; i <= question.scaleMax; i++) {
        scaleOpts.push(`
          <label class="spammerz-gform-scale-label">
            <input type="radio" name="scale_${qIdx}" class="spammerz-gform-scale-input">
            <span class="spammerz-gform-scale-value">${i}</span>
          </label>
        `);
      }
      inputHtml = `
        <div class="spammerz-gform-scale-container">
          ${question.scaleMinLabel ? `<span class="spammerz-gform-scale-edge">${escHtml(question.scaleMinLabel)}</span>` : ''}
          <div class="spammerz-gform-scale">${scaleOpts.join('')}</div>
          ${question.scaleMaxLabel ? `<span class="spammerz-gform-scale-edge">${escHtml(question.scaleMaxLabel)}</span>` : ''}
        </div>
      `;
      break;

    case 'date':
      inputHtml = `<input type="date" class="spammerz-gform-input">`;
      break;

    case 'time':
      inputHtml = `<input type="time" class="spammerz-gform-input">`;
      break;

    default:
      inputHtml = `<div class="spammerz-gform-unsupported">Unsupported question type</div>`;
  }

  div.innerHTML += inputHtml;
  return div;
}

/**
 * Render modal overlay
 */
function renderModal(s) {
  const container = document.getElementById('spz-modal-container');
  if (!container) return;

  const progress = s.count > 0 ? Math.round((s.submitted / s.count) * 100) : 0;
  const done = !s.running && s.submitted >= s.count && s.submitted > 0;

  if (done) {
    container.innerHTML = `
      <div class="spammerz-modal">
        <div class="spammerz-modal-content">
          <div class="spammerz-modal-icon spammerz-modal-icon-success">✓</div>
          <h2>All ${s.count} responses submitted!</h2>
          <div class="spammerz-modal-stats">
            <span class="spammerz-stat-success">✓ ${s.succeeded} succeeded</span>
            ${s.failed > 0 ? `<span class="spammerz-stat-error">✗ ${s.failed} failed</span>` : ''}
          </div>
          <div class="spammerz-modal-actions">
            <button class="spammerz-btn-outline" id="spz-reset">Reset</button>
            <button class="spammerz-btn-primary" id="spz-close">Close</button>
          </div>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="spammerz-modal">
        <div class="spammerz-modal-content">
          <h2>Submitting Responses</h2>
          <div class="spammerz-modal-progress-num">
            <span class="spammerz-modal-current">${s.submitted}</span>
            <span class="spammerz-modal-sep">/</span>
            <span class="spammerz-modal-total">${s.count}</span>
          </div>
          <div class="spammerz-modal-progress-bar">
            <div class="spammerz-modal-progress-fill" style="width:${progress}%"></div>
          </div>
          <div class="spammerz-modal-percent">${progress}%</div>
          <div class="spammerz-modal-stats">
            <span class="spammerz-stat-success">✓ ${s.succeeded}</span>
            <span class="spammerz-stat-error">✗ ${s.failed}</span>
          </div>
          <button class="spammerz-btn-danger" id="spz-stop">Stop</button>
        </div>
      </div>
    `;
  }
}

/**
 * Attach all event listeners
 */
function attachAllListeners(formData, s, updateState) {
  // Disable button
  const disableBtn = document.getElementById('spz-disable-btn');
  if (disableBtn) disableBtn.onclick = () => {
    window.spammerzState.enabled = false;
    render();
  };

  // Weight inputs
  document.querySelectorAll('.spammerz-weight-input').forEach(input => {
    input.oninput = (e) => {
      const qIdx = parseInt(e.target.dataset.qidx);
      const optIdx = parseInt(e.target.dataset.optidx);
      const newWeight = parseInt(e.target.value) || 0;

      // Update weights in state
      const cfg = window.spammerzState.answers[qIdx];
      if (cfg && cfg.weights) {
        cfg.weights[optIdx] = newWeight;

        // Update percentage display
        const row = e.target.closest('.spammerz-weight-row');
        const percentSpan = row.querySelector('.spammerz-weight-percent');
        percentSpan.textContent = calculatePercentage(cfg.weights, optIdx).toFixed(0) + '%';

        // Update total
        const total = cfg.weights.reduce((a, b) => a + b, 0);
        const totalEl = document.querySelector('.spammerz-weights-total');
        if (totalEl) totalEl.textContent = `Total weight: ${total}`;

        updateState({ answers: [...window.spammerzState.answers] });
      }
    };
  });

  // Text inputs
  document.querySelectorAll('.spammerz-config-text-input').forEach(input => {
    input.oninput = (e) => {
      const qIdx = parseInt(e.target.dataset.qidx);
      const cfg = window.spammerzState.answers[qIdx];
      if (cfg) {
        cfg.values = [e.target.value];
        updateState({ answers: [...window.spammerzState.answers] });
      }
    };
  });

  // Count input
  const countInput = document.getElementById('spz-count');
  if (countInput) {
    countInput.oninput = (e) => {
      updateState({ count: parseInt(e.target.value) || 1 });
    };
  }

  // Delay input
  const delayInput = document.getElementById('spz-delay');
  if (delayInput) {
    delayInput.oninput = (e) => {
      updateState({ delayMs: parseInt(e.target.value) || 0 });
    };
  }

  // Jitter toggle
  const jitterCheck = document.getElementById('spz-jitter');
  if (jitterCheck) {
    jitterCheck.onchange = (e) => {
      updateState({ randomizeDelay: e.target.checked });
    };
  }

  // Start button
  const startBtn = document.getElementById('spz-start-btn');
  if (startBtn) {
    startBtn.onclick = () => {
      if (window.spammerzState.running) return;
      window.spammerzState.running = true;
      window.spammerzState.submitted = 0;
      window.spammerzState.succeeded = 0;
      window.spammerzState.failed = 0;
      render();
      startSubmissionLoop(formData, window.spammerzState, updateState);
    };
  }

  // Stop button
  const stopBtn = document.getElementById('spz-stop');
  if (stopBtn) {
    stopBtn.onclick = () => {
      window.spammerzState.running = false;
      render();
    };
  }

  // Close button
  const closeBtn = document.getElementById('spz-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      window.spammerzState.submitted = 0;
      window.spammerzState.succeeded = 0;
      window.spammerzState.failed = 0;
      render();
    };
  }

  // Reset button
  const resetBtn = document.getElementById('spz-reset');
  if (resetBtn) {
    resetBtn.onclick = () => {
      window.spammerzState.submitted = 0;
      window.spammerzState.succeeded = 0;
      window.spammerzState.failed = 0;
      render();
    };
  }
}

/**
 * Start the actual submission loop
 */
async function startSubmissionLoop(formData, state, updateState) {
  const { resolveDelay } = window;

  for (let i = state.submitted; i < state.count; i++) {
    if (!state.running) break;

    state.submitted = i + 1;

    // Build payload
    const payload = new FormData();
    payload.append('fvv', '1');
    payload.append('partialResponse', '[null,null,""]');
    payload.append('pageHistory', '0');
    payload.append('fbzx', String(Math.floor(Math.random() * 9e12) + 1e12));

    for (const cfg of state.answers) {
      const { values, weights, randomize } = cfg;
      if (!values?.length) continue;

      let selected = values[0];
      if (randomize && values.length > 1 && weights) {
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let j = 0; j < values.length; j++) {
          r -= weights[j];
          if (r <= 0) {
            selected = values[j];
            break;
          }
        }
      }

      if (selected) payload.append(cfg.questionId, selected);
    }

    // Submit
    try {
      fetch(state.actionUrl || formData.actionUrl, {
        method: 'POST',
        body: payload,
        mode: 'no-cors'
      }).catch(() => {});
      state.succeeded++;
    } catch {
      state.failed++;
    }

    updateState({ submitted: state.submitted, succeeded: state.succeeded, failed: state.failed });

    // Update progress text
    const progressText = document.getElementById('spz-progress-text');
    if (progressText) progressText.textContent = `${state.submitted}/${state.count} submitted`;

    // Delay
    if (i < state.count - 1 && state.running) {
      await new Promise(r => setTimeout(r, resolveDelay(state.delayMs, state.randomizeDelay)));
    }
  }

  state.running = false;
  updateState({ running: false });
  render();
  function render() { if (window.renderSpammerZUI) window.renderSpammerZUI(formData, window.spammerzState, updateState); }
}

/**
 * Utility functions
 */
function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function getTypeName(type) {
  const names = {
    short_text: 'TEXT',
    paragraph: 'PARA',
    multiple_choice: 'MCQ',
    checkbox: 'CHECK',
    dropdown: 'DROP',
    linear_scale: 'SCALE',
    date: 'DATE',
    time: 'TIME',
    grid: 'GRID',
    unknown: '???',
  };
  return names[type] || type.toUpperCase();
}

function resolveDelay(baseMs, randomize) {
  if (!randomize) return baseMs;
  const jitter = baseMs * 0.5;
  return baseMs + (Math.random() * jitter * 2 - jitter);
}