/**
 * @fileoverview SpammerZ - UI Components
 * 3-Panel Layout: Submission Settings | Google Form | Configure Weights
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
      restoreLiveForm();
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

    // Main layout - 3 panels
    container.innerHTML = `
      <div class="spammerz-backdrop">
        <div class="spammerz-panel">
          <div class="spammerz-header">
            <div class="spammerz-logo">
              <span class="spammerz-logo-text">Spammer</span><span class="spammerz-logo-accent">Z</span>
            </div>
            <div class="spammerz-form-title">${escHtml(formData.title)}</div>
            <button class="spammerz-header-btn spammerz-disable-btn" id="spz-disable-btn">✕</button>
          </div>
          <div class="spammerz-content">
            <div class="spammerz-submission-panel" id="spz-submission-panel"></div>
            <div class="spammerz-sandbox" id="spz-sandbox"></div>
            <div class="spammerz-weights-panel" id="spz-weights-panel"></div>
          </div>
          <div id="spz-modal-container"></div>
        </div>
      </div>
    `;

    // Render Submission Settings (LEFT panel)
    renderSubmissionPanel(s, updateState);

    // Render Google Form (MIDDLE panel)
    renderSandbox(formData, s);

    // Render Configure Weights (RIGHT panel)
    renderWeightsPanel(formData, s, updateState);

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
 * Render the LEFT panel - Submission Settings + General Settings
 */
function renderSubmissionPanel(s, updateState) {
  const panel = document.getElementById('spz-submission-panel');
  if (!panel) return;

  const autoNameEnabled = s.autoNameConfig?.enabled;
  const detectedFieldsCount = s.autoNameConfig?.fields?.length || 0;

  panel.innerHTML = `
    <!-- Submission Settings Section -->
    <div class="spammerz-config-header">Submission Settings</div>
    <div class="spammerz-config-questions">
      <div class="spammerz-settings">
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
        <button class="spammerz-btn-primary" id="spz-start-btn" type="button" ${s.running ? 'disabled' : ''}>
          ${s.running ? 'Running...' : 'Start Submitting'}
        </button>
      </div>
    </div>

    <!-- General Settings Section -->
    <div class="spammerz-config-header spammerz-general-header">General Settings</div>
    <div class="spammerz-config-questions">
      <div class="spammerz-settings">
        <div class="spammerz-auto-name-section">
          <div class="spammerz-auto-name-header">
            <span class="spammerz-auto-name-title">Auto Naming</span>
            <span class="spammerz-auto-name-status ${autoNameEnabled ? 'active' : ''}">
              ${autoNameEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div class="spammerz-auto-name-toggle">
            <label class="spammerz-toggle">
              <input type="checkbox" id="spz-auto-name-toggle" ${autoNameEnabled ? 'checked' : ''}>
              <span class="spammerz-toggle-slider"></span>
              <span>Enable Auto Naming</span>
            </label>
          </div>
          ${autoNameEnabled && detectedFieldsCount > 0 ?
            `<div class="spammerz-auto-name-info">${detectedFieldsCount} field(s) detected</div>` :
            ''}
          <button class="spammerz-btn-outline spammerz-auto-name-btn" id="spz-general-settings-btn">
            ${autoNameEnabled ? 'Configure' : 'Configure Auto Naming'}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the Auto Naming configuration modal - Simplified
 */
function renderAutoNameModal(s) {
  const container = document.getElementById('spz-modal-container');
  if (!container) return;

  const config = window.spammerzState.autoNameConfig || createDefaultNameConfig();
  const sources = config.sources || {};
  const savedFirstNames = (sources.firstNames || []).join('\n');
  const savedLastNames = (sources.lastNames || []).join('\n');
  const includeExtension = !!config.includeExtension;

  // Get detected name fields from form for status display
  const detectedFields = window.spammerzFormData ? detectNameQuestions(window.spammerzFormData.allQuestions) : [];

  const fieldTypeLabels = {
    fullname: 'Full Name',
    firstname: 'First Name',
    middlename: 'Middle Name',
    lastname: 'Last Name',
    mi: 'Middle Initial',
    extension: 'Extension',
  };

  const detectedLabels = detectedFields.map(f => fieldTypeLabels[f.fieldType] || f.fieldType);
  const detectedSummary = detectedLabels.length > 0 ? detectedLabels.join(', ') : 'None detected';
  const detectionClass = detectedLabels.length > 0 ? 'detected' : '';

  container.innerHTML = `
    <div class="spammerz-modal spammerz-modal-name">
      <div class="spammerz-modal-content spammerz-modal-content-name">
        <div class="spammerz-modal-header">
          <h2>Auto Name Settings</h2>
          <button class="spammerz-modal-close" id="spz-name-modal-close">&times;</button>
        </div>

        <div class="spammerz-name-landscape">
          <!-- Left Column - Name Sources -->
          <div class="spammerz-name-column">
            <div class="spammerz-name-fields-section">
              <div class="spammerz-name-section-title-row">
                <span class="spammerz-name-section-title">Name Sources</span>
              </div>

              <div class="spammerz-name-fields-grid">
                <!-- First Name Field -->
                <div class="spammerz-name-field editable">
                  <div class="spammerz-name-field-header">
                    <span class="spammerz-name-field-title">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      First Name
                    </span>
                    <span class="spammerz-badge spammerz-badge-editable">Editable</span>
                  </div>
                  <textarea class="spammerz-name-textarea" id="spz-firstnames" placeholder="Enter first names, one per line&#10;&#10;Example:&#10;John&#10;Jane&#10;Michael James">${escHtml(savedFirstNames)}</textarea>
                  <div class="spammerz-name-hint">Random selection: full entry or first part only (50/50)</div>
                </div>

                <!-- Last Name Field -->
                <div class="spammerz-name-field editable">
                  <div class="spammerz-name-field-header">
                    <span class="spammerz-name-field-title">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                      </svg>
                      Last Name
                    </span>
                    <span class="spammerz-badge spammerz-badge-editable">Editable</span>
                  </div>
                  <textarea class="spammerz-name-textarea" id="spz-lastnames" placeholder="Enter last names, one per line&#10;&#10;Example:&#10;Smith&#10;Johnson&#10;Williams">${escHtml(savedLastNames)}</textarea>
                </div>

                <!-- Middle Name Field (Locked) -->
                <div class="spammerz-name-field locked">
                  <div class="spammerz-name-field-header">
                    <span class="spammerz-name-field-title">Middle Name</span>
                    <span class="spammerz-badge spammerz-badge-locked">Locked</span>
                  </div>
                  <div class="spammerz-name-locked-content">
                    <div class="spammerz-name-locked-value">Auto-copied from Last Name pool</div>
                  </div>
                </div>

                <!-- Extension Field (Locked) -->
                <div class="spammerz-name-field locked">
                  <div class="spammerz-name-field-header">
                    <span class="spammerz-name-field-title">Extension</span>
                    <span class="spammerz-badge spammerz-badge-locked">Locked</span>
                  </div>
                  <div class="spammerz-name-locked-content">
                    <div class="spammerz-name-locked-value">Auto-cycled: Jr., Sr., II, III, IV</div>
                    <label class="spammerz-toggle spammerz-name-toggle">
                      <input type="checkbox" id="spz-extension-toggle" ${includeExtension ? 'checked' : ''}>
                      <span class="spammerz-toggle-slider"></span>
                      <span>Include Extension</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column - Info -->
          <div class="spammerz-patterns-column">
            <div class="spammerz-patterns-column-content">
              <div class="spammerz-name-info-section">
                <div class="spammerz-name-section-title-row">
                  <span class="spammerz-name-section-title">Auto Detection</span>
                </div>
                <div class="spammerz-name-detection-display ${detectionClass}">
                  <div class="spammerz-detection-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 11l3 3L22 4"/>
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                  </div>
                  <div class="spammerz-detection-text">
                    <div class="spammerz-detection-label">Form Fields Detected</div>
                    <div class="spammerz-detection-value">${detectedSummary}</div>
                  </div>
                </div>
              </div>

              <div class="spammerz-name-info-section">
                <div class="spammerz-name-section-title-row">
                  <span class="spammerz-name-section-title">How It Works</span>
                </div>
                <div class="spammerz-how-it-works">
                  <div class="spammerz-how-item">
                    <span class="spammerz-how-num">1</span>
                    <span>System auto-detects name fields in your form</span>
                  </div>
                  <div class="spammerz-how-item">
                    <span class="spammerz-how-num">2</span>
                    <span>Random names are generated from your lists</span>
                  </div>
                  <div class="spammerz-how-item">
                    <span class="spammerz-how-num">3</span>
                    <span>Names fill detected fields automatically</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="spammerz-modal-actions-name">
          <button class="spammerz-btn-outline" id="spz-name-cancel">Cancel</button>
          <button class="spammerz-btn-primary" id="spz-name-save">Save Settings</button>
        </div>
      </div>
    </div>
  `;

  // Attach modal button listeners immediately after rendering
  attachAutoNameModalListeners(formData, updateState);
}

/**
 * Attach event listeners to Auto Name Modal buttons
 */
function attachAutoNameModalListeners(formData, updateState) {
  // Close button (×)
  const nameModalClose = document.getElementById('spz-name-modal-close');
  if (nameModalClose) {
    nameModalClose.onclick = () => {
      document.getElementById('spz-modal-container').innerHTML = '';
    };
  }

  // Cancel button
  const nameModalCancel = document.getElementById('spz-name-cancel');
  if (nameModalCancel) {
    nameModalCancel.onclick = () => {
      document.getElementById('spz-modal-container').innerHTML = '';
    };
  }

  // Save button
  const nameModalSave = document.getElementById('spz-name-save');
  if (nameModalSave) {
    nameModalSave.onclick = () => {
      const firstNamesEl = document.getElementById('spz-firstnames');
      const lastNamesEl = document.getElementById('spz-lastnames');
      const patternCheckboxes = document.querySelectorAll('#spz-patterns-grid input:checked');
      const extensionToggle = document.getElementById('spz-extension-toggle');

      const firstNames = (firstNamesEl?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
      const lastNames = (lastNamesEl?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
      const selectedPatterns = Array.from(patternCheckboxes).map(cb => cb.value);
      const includeExtensionNext = !!extensionToggle?.checked;

      // Get detected fields
      const detectedFields = detectNameQuestions(window.spammerzFormData.allQuestions);

      // Build the config
      const canEnable = firstNames.length > 0 && lastNames.length > 0;
      const prevEnabled = window.spammerzState.autoNameConfig?.enabled ?? true;
      const config = {
        enabled: prevEnabled && canEnable,
        fields: detectedFields,
        sources: {
          firstNames,
          lastNames,
        },
        patterns: selectedPatterns.length > 0 ? selectedPatterns : ['first_last'],
        extensionIdx: 0,
        includeExtension: includeExtensionNext,
      };

      updateState({ autoNameConfig: config });
      document.getElementById('spz-modal-container').innerHTML = '';

      // Re-render to update the UI
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }

  // Close modal on backdrop click
  const nameModal = document.querySelector('.spammerz-modal-name');
  if (nameModal) {
    nameModal.onclick = (e) => {
      if (e.target.classList.contains('spammerz-modal-name')) {
        document.getElementById('spz-modal-container').innerHTML = '';
      }
    };
  }
}

/**
 * Render the RIGHT panel - Configure Weights
 */
function renderWeightsPanel(formData, s, updateState) {
  const panel = document.getElementById('spz-weights-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="spammerz-config-header">Configure Weights (%)</div>
    <div class="spammerz-config-questions" id="spz-questions-list"></div>
  `;

  // Render each question
  const questionsList = document.getElementById('spz-questions-list');
  formData.allQuestions.forEach((q, qIdx) => {
    const cfg = s.answers[qIdx];
    if (!cfg) return;
    questionsList.appendChild(createWeightedQuestionConfig(q, cfg, qIdx));
  });
}

/**
 * Create weighted config for one question
 */
function createWeightedQuestionConfig(question, cfg, qIdx) {
  const item = document.createElement('div');
  item.className = 'spammerz-config-item';

  const nameFieldLabels = {
    fullname: 'Full Name',
    firstname: 'First Name',
    middlename: 'Middle Name',
    lastname: 'Last Name',
    mi: 'Middle Initial',
    extension: 'Extension',
  };

  // Detect if this question is a name field
  const detectedFields = window.spammerzFormData ? detectNameQuestions(window.spammerzFormData.allQuestions) : [];
  const nameBinding = detectedFields.find(f => f.questionIndex === qIdx);
  const isNameField = !!nameBinding;

  // Question title header
  let headerHtml = `<div class="spammerz-config-item-title">${escHtml(question.title)}</div>`;

  if (isNameField) {
    headerHtml += `
      <div class="spammerz-config-item-type spammerz-type-name">${getTypeName(question.type)}</div>
    `;
    item.innerHTML = headerHtml;

    // Show name field detection (locked, green)
    const nameDetector = document.createElement('div');
    nameDetector.className = 'spammerz-name-detected-badge';
    nameDetector.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span class="spammerz-name-detected-text">Auto-fill: <strong>${nameFieldLabels[nameBinding.fieldType] || nameBinding.fieldType}</strong></span>
    `;
    item.appendChild(nameDetector);
  } else {
    headerHtml += `<div class="spammerz-config-item-type">${getTypeName(question.type)}</div>`;
    item.innerHTML = headerHtml;

    // Add weight inputs for each option
    if (question.options.length > 0 || question.type === 'linear_scale') {
      const weightsList = document.createElement('div');
      weightsList.className = 'spammerz-weights-list';

      // Get options to show
      let options = [...question.options];

      // For linear scale, generate options from scale range
      if (question.type === 'linear_scale') {
        const scaleMin = Number.isFinite(question.scaleMin) ? question.scaleMin : 1;
        const scaleMax = Number.isFinite(question.scaleMax) ? question.scaleMax : Math.max(scaleMin, 5);
        options = [];
        for (let i = scaleMin; i <= scaleMax; i++) {
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
            <input type="range" class="spammerz-weight-slider"
                   data-qidx="${qIdx}" data-optidx="${optIdx}"
                   value="${weight}" min="0" max="100" step="1">
            <span class="spammerz-weight-value">${weight}</span>
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
 * Detect name-related questions from form questions
 * More specific patterns checked first to avoid false matches
 */
function detectNameQuestions(questions) {
  const detected = [];

  questions.forEach((q, idx) => {
    const title = q.title.trim().toLowerCase();

    if (/\bfirst\s*name\b/.test(title) || /\bgiven\s*name\b/.test(title)) {
      detected.push({ questionIndex: idx, fieldType: 'firstname', questionId: q.id, title: q.title });
    } else if (/\bmiddle\s*name\b/.test(title)) {
      detected.push({ questionIndex: idx, fieldType: 'middlename', questionId: q.id, title: q.title });
    } else if (/\blast\s*name\b/.test(title) || /\bsurname\b/.test(title) || /\bfamily\s*name\b/.test(title)) {
      detected.push({ questionIndex: idx, fieldType: 'lastname', questionId: q.id, title: q.title });
    } else if (/\bfull\s*name\b/.test(title) || title === 'name' || title.match(/^name\s*[\*]*$/)) {
      detected.push({ questionIndex: idx, fieldType: 'fullname', questionId: q.id, title: q.title });
    } else if (/\bm\.?i\.?\b/.test(title) || /\bmiddle\s*initial\b/.test(title)) {
      detected.push({ questionIndex: idx, fieldType: 'mi', questionId: q.id, title: q.title });
    } else if (/\bext(ension)?\b/.test(title) || /\bsuffix\b/.test(title)) {
      detected.push({ questionIndex: idx, fieldType: 'extension', questionId: q.id, title: q.title });
    }
  });

  return detected;
}

/**
 * Generate a name based on configuration
 */
function generateName(config) {
  const sources = config.sources || {};
  const patterns = config.patterns || ['first_last'];
  const includeExtension = !!config.includeExtension;

  const firstNames = sources.firstNames || [];
  const lastNames = sources.lastNames || [];
  const extensions = ['Jr.', 'Sr.', 'II', 'III', 'IV', ''];

  if (firstNames.length === 0 || lastNames.length === 0) {
    return { fullName: 'No names configured' };
  }

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

  // Force different last name for middle name
  let middleName = lastName;
  if (lastNames.length > 1) {
    let attempts = 0;
    while (middleName === lastName && attempts < 20) {
      middleName = lastNames[Math.floor(Math.random() * lastNames.length)];
      attempts++;
    }
  }

  // Get first part of first name only (50% chance)
  const firstParts = firstName.split(' ');
  const firstPartOnly = firstParts[0];
  const useFullFirst = firstParts.length > 1 && Math.random() > 0.5;
  const usedFirst = useFullFirst ? firstName : firstPartOnly;

  // M.I = first letter of middle name
  const mi = middleName.charAt(0).toUpperCase();

  // Extension cycling
  const extIdx = (config.extensionIdx || 0) % extensions.length;
  const extension = includeExtension ? extensions[extIdx] : '';

  // Pick random pattern
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];

  let fullName = '';
  switch (pattern) {
    case 'first_only':
      fullName = usedFirst;
      break;
    case 'first_last':
      fullName = `${usedFirst} ${lastName}`;
      break;
    case 'first_middle_last':
      fullName = `${usedFirst} ${middleName} ${lastName}`;
      break;
    case 'first_mi_last':
      fullName = `${usedFirst} ${mi}. ${lastName}`;
      break;
    case 'first_last_ext':
      fullName = extension ? `${usedFirst} ${lastName} ${extension}` : `${usedFirst} ${lastName}`;
      break;
    case 'full':
      fullName = extension ? `${usedFirst} ${middleName} ${lastName} ${extension}` : `${usedFirst} ${middleName} ${lastName}`;
      break;
    default:
      fullName = `${usedFirst} ${lastName}`;
  }

  return {
    fullName,
    firstName: usedFirst,
    middleName,
    lastName,
    mi: mi + '.',
    extension,
  };
}

/**
 * Render the Google Form replica sandbox (MIDDLE panel)
 */
function renderSandbox(formData, s) {
  const sandbox = document.getElementById('spz-sandbox');
  if (!sandbox) return;

  sandbox.className = 'spammerz-sandbox google-forms-theme';

  sandbox.innerHTML = `
    <div class="spammerz-live-form-shell">
      <div class="spammerz-live-form-host" id="spz-live-form-host"></div>
      <div class="spammerz-gform-footer">
        <span class="spammerz-gform-progress-text" id="spz-progress-text">
          ${s.submitted}/${s.count} submitted
        </span>
        <button class="spammerz-btn-outline spammerz-gform-refresh" id="spz-refresh-preview">
          Refresh Preview
        </button>
      </div>
    </div>
  `;

  mountLiveFormIntoSandbox();
  if (s.enabled !== false) {
    requestAnimationFrame(() => refreshLivePreview(formData, s));
  }
}

function mountLiveFormIntoSandbox() {
  const host = document.getElementById('spz-live-form-host');
  if (!host) return;

  if (window.spammerzLiveFormState?.mounted) {
    const wrapper = window.spammerzLiveFormState.wrapper;
    if (wrapper && wrapper.parentElement !== host) {
      host.appendChild(wrapper);
    }
    return;
  }

  const form = findLiveFormRoot();
  if (!form) {
    host.innerHTML = '<div class="spammerz-live-form-empty">Google Form not found.</div>';
    return;
  }

  const wrapper = form.closest('div[role="main"]') || form;
  const placeholder = document.createElement('div');
  placeholder.id = 'spammerz-live-form-placeholder';

  const originalParent = wrapper.parentElement;
  const nextSibling = wrapper.nextSibling;
  if (!originalParent) return;

  originalParent.insertBefore(placeholder, wrapper);
  host.appendChild(wrapper);
  wrapper.classList.add('spammerz-live-form');

  window.spammerzLiveFormState = {
    mounted: true,
    wrapper,
    originalParent,
    nextSibling,
    placeholder,
  };
}

function restoreLiveForm() {
  const state = window.spammerzLiveFormState;
  if (!state?.mounted) return;

  const { wrapper, originalParent, nextSibling, placeholder } = state;
  if (wrapper && originalParent) {
    if (nextSibling && nextSibling.parentElement === originalParent) {
      originalParent.insertBefore(wrapper, nextSibling);
    } else {
      originalParent.appendChild(wrapper);
    }
    wrapper.classList.remove('spammerz-live-form');
  }

  if (placeholder && placeholder.parentElement) {
    placeholder.parentElement.removeChild(placeholder);
  }

  window.spammerzLiveFormState = { mounted: false };
}

function findLiveFormRoot() {
  return document.querySelector('form[action*="formResponse"]') || document.querySelector('form');
}

function refreshLivePreview(formData, s) {
  const wrapper = window.spammerzLiveFormState?.wrapper || findLiveFormRoot();
  if (!wrapper || !formData) return;

  const autoNameConfig = s.autoNameConfig;
  const detectedFields = autoNameConfig?.enabled ? detectNameQuestions(formData.allQuestions) : [];
  const activeFields = autoNameConfig?.fields?.length ? autoNameConfig.fields : detectedFields;
  const generatedName = autoNameConfig?.enabled && detectedFields.length > 0 ? generateName(autoNameConfig) : null;

  formData.allQuestions.forEach((q, idx) => {
    const cfg = s.answers[idx];
    if (!cfg) return;

    let value = resolvePreviewValueForQuestion(cfg, q);
    if (generatedName && activeFields.length) {
      const binding = activeFields.find(f => f.questionIndex === idx);
      if (binding) {
        switch (binding.fieldType) {
          case 'fullname':   value = generatedName.fullName;   break;
          case 'firstname':  value = generatedName.firstName;  break;
          case 'middlename': value = generatedName.middleName; break;
          case 'lastname':   value = generatedName.lastName;   break;
          case 'mi':         value = generatedName.mi;         break;
          case 'extension':  value = generatedName.extension;  break;
        }
      }
    }

    applyPreviewValue(wrapper, q, value);
  });
}

function resolvePreviewValue(cfg) {
  const { values, weights, randomize, mode } = cfg;
  if (!values || values.length === 0) return '';
  if (!randomize || values.length === 1) return values[0];
  if (mode === 'weighted' && weights && weights.length === values.length) {
    return weightedPreviewPick(values, weights);
  }
  return values[Math.floor(Math.random() * values.length)];
}

function resolvePreviewValueForQuestion(cfg, question) {
  let value = resolvePreviewValue(cfg);
  if (value) return value;
  if (!question?.required) return value;
  if (question.type === 'date') return new Date().toISOString().slice(0, 10);
  if (question.type === 'time') return new Date().toTimeString().slice(0, 5);
  return 'Auto response';
}

function weightedPreviewPick(values, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < values.length; i++) {
    r -= weights[i];
    if (r <= 0) return values[i];
  }
  return values[values.length - 1];
}

function applyPreviewValue(wrapper, question, value) {
  const inputs = getQuestionInputs(wrapper, question);
  if (!inputs || inputs.length === 0) return;

  const type = question.type;
  if (type === 'short_text' || type === 'paragraph' || type === 'date' || type === 'time') {
    const input = inputs[0];
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (type === 'dropdown') {
    const select = inputs[0];
    if (select.tagName.toLowerCase() !== 'select') return;
    const match = Array.from(select.options).find(opt => opt.value === value || opt.textContent === value);
    if (match) select.value = match.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (type === 'multiple_choice' || type === 'linear_scale') {
    inputs.forEach(input => { input.checked = false; });
    const target = Array.from(inputs).find(input => input.value === value) || inputs[0];
    if (target) target.checked = true;
    if (target) target.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (type === 'checkbox') {
    inputs.forEach(input => { input.checked = false; });
    const target = Array.from(inputs).find(input => input.value === value) || inputs[0];
    if (target) target.checked = true;
    if (target) target.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (type === 'grid' || type === 'checkbox_grid') {
    const groupMap = new Map();
    inputs.forEach(input => {
      if (!input.name) return;
      if (!groupMap.has(input.name)) groupMap.set(input.name, []);
      groupMap.get(input.name).push(input);
    });

    groupMap.forEach(group => {
      group.forEach(input => { input.checked = false; });
      const target = group[Math.floor(Math.random() * group.length)];
      if (target) target.checked = true;
      if (target) target.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

function getQuestionInputs(wrapper, question) {
  const local = wrapper.querySelectorAll(`[name="${question.id}"]`);
  if (local && local.length) return Array.from(local);

  const globalMatch = document.querySelectorAll(`[name="${question.id}"]`);
  if (globalMatch && globalMatch.length) return Array.from(globalMatch);

  const block = findQuestionBlockByTitle(wrapper, question.title);
  if (!block) return [];
  return Array.from(block.querySelectorAll('input, textarea, select'));
}

function findQuestionBlockByTitle(wrapper, title) {
  if (!title) return null;
  const normalized = title.trim().toLowerCase();
  const blocks = wrapper.querySelectorAll('[role="listitem"]');
  for (const block of blocks) {
    const label = block.querySelector('[role="heading"], .freebirdFormviewerViewItemsItemItemTitle');
    const text = label?.textContent?.trim().toLowerCase();
    if (text === normalized) return block;
  }
  return null;
}

/**
 * Create a question element that looks exactly like Google Form
 */
function createGoogleFormQuestion(question, qIdx) {
  const div = document.createElement('div');
  div.className = 'spammerz-gform-card spammerz-gform-question-card';

  const titleHtml = question.title + (question.required ? ' <span class="spammerz-gform-required">*</span>' : '');
  div.innerHTML = `
    <div class="spammerz-gform-question-title">${titleHtml}</div>
    ${question.description ? `<div class="spammerz-gform-question-desc">${escHtml(question.description)}</div>` : ''}
  `;

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

    case 'linear_scale': {
      const isRating = /rating/i.test(question.title || '') && (question.scaleMax || 0) <= 5;
      if (isRating) {
        inputHtml = createRatingQuestionHtml(question, qIdx);
        break;
      }
      const scaleOpts = [];
      for (let i = question.scaleMin; i <= question.scaleMax; i++) {
        scaleOpts.push(`
          <label class="spammerz-gform-scale-option">
            <span class="spammerz-gform-scale-number">${i}</span>
            <input type="radio" name="scale_${qIdx}" class="spammerz-gform-scale-input">
            <span class="spammerz-gform-scale-dot"></span>
          </label>
        `);
      }
      inputHtml = `
        <div class="spammerz-gform-scale-container">
          <div class="spammerz-gform-scale">
            ${scaleOpts.join('')}
          </div>
          <div class="spammerz-gform-scale-labels">
            <span>${escHtml(question.scaleMinLabel || '')}</span>
            <span>${escHtml(question.scaleMaxLabel || '')}</span>
          </div>
        </div>
      `;
      break;
    }

    case 'date':
      inputHtml = `<input type="date" class="spammerz-gform-input">`;
      break;

    case 'time':
      inputHtml = `<input type="time" class="spammerz-gform-input">`;
      break;

    case 'grid':
    case 'checkbox_grid':
      inputHtml = createGridQuestionHtml(question, qIdx, question.type === 'checkbox_grid');
      break;

    default:
      inputHtml = `<input type="text" class="spammerz-gform-input" placeholder="Your answer">`;
  }

  div.innerHTML += inputHtml;
  return div;
}

function createRatingQuestionHtml(question, qIdx) {
  const max = question.scaleMax || 5;
  const options = [];
  for (let i = 1; i <= max; i++) {
    options.push(`
      <label class="spammerz-gform-rating-option">
        <input type="radio" name="rating_${qIdx}" class="spammerz-gform-rating-input">
        <span class="spammerz-gform-rating-star">★</span>
        <span class="spammerz-gform-rating-num">${i}</span>
      </label>
    `);
  }
  return `<div class="spammerz-gform-rating">${options.join('')}</div>`;
}

/**
 * Create grid question HTML (multiple choice grid or checkbox grid)
 */
function createGridQuestionHtml(question, qIdx, isCheckboxGrid = false) {
  const rows = question.options || [];
  const cols = question.gridColumns || question.gridCols || [];
  if (rows.length === 0) return '';

  const inputType = isCheckboxGrid ? 'checkbox' : 'radio';
  const inputClass = isCheckboxGrid ? 'spammerz-gform-grid-checkbox' : 'spammerz-gform-grid-radio';
  const inputName = isCheckboxGrid ? `grid_${qIdx}_${qIdx}_${qIdx}` : `grid_${qIdx}`;

  let html = `<div class="spammerz-gform-grid-container">`;
  html += `<table class="spammerz-gform-grid-table"><thead><tr><th></th>`;

  cols.forEach(col => {
    html += `<th>${escHtml(col)}</th>`;
  });
  html += '</tr></thead><tbody>';

  rows.forEach((row, rowIdx) => {
    html += `<tr><td class="spammerz-gform-grid-row-label">${escHtml(row)}</td>`;
    cols.forEach((col, colIdx) => {
      const finalName = isCheckboxGrid
        ? `${inputName}_${rowIdx}_${colIdx}`
        : `${inputName}_${rowIdx}`;
      html += `<td><input type="${inputType}" name="${finalName}" class="${inputClass}"></td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

/**
 * Create default naming configuration
 */
function createDefaultNameConfig() {
  return {
    enabled: true,
    fields: [],
    sources: {
      firstNames: ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'James', 'Mary'],
      lastNames: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'],
    },
    patterns: ['first_last'],
    extensionIdx: 0,
    includeExtension: false,
  };
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
    window.renderSpammerZUI(formData, window.spammerzState, updateState);
  };

  // Weight sliders
  document.querySelectorAll('.spammerz-weight-slider').forEach(input => {
    input.oninput = (e) => {
      const qIdx = parseInt(e.target.dataset.qidx);
      const optIdx = parseInt(e.target.dataset.optidx);
      const newWeight = parseInt(e.target.value) || 0;

      const cfg = window.spammerzState.answers[qIdx];
      if (cfg && cfg.weights) {
        cfg.weights[optIdx] = newWeight;

        const row = e.target.closest('.spammerz-weight-row');
        const valueSpan = row.querySelector('.spammerz-weight-value');
        const percentSpan = row.querySelector('.spammerz-weight-percent');
        if (valueSpan) valueSpan.textContent = String(newWeight);
        percentSpan.textContent = calculatePercentage(cfg.weights, optIdx).toFixed(0) + '%';

        const total = cfg.weights.reduce((a, b) => a + b, 0);
        const totalEl = row.closest('.spammerz-weights-list').querySelector('.spammerz-weights-total');
        if (totalEl) totalEl.textContent = `Total weight: ${total}`;
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
      }
    };
  });

  // Count input
  const countInput = document.getElementById('spz-count');
  if (countInput) {
    countInput.oninput = (e) => {
      const next = parseInt(e.target.value, 10);
      window.spammerzState.count = Number.isFinite(next) ? next : 1;
    };
    countInput.onchange = (e) => {
      updateState({ count: parseInt(e.target.value, 10) || 1 });
    };
    countInput.onblur = (e) => {
      updateState({ count: parseInt(e.target.value, 10) || 1 });
    };
  }

  // Delay input
  const delayInput = document.getElementById('spz-delay');
  if (delayInput) {
    delayInput.oninput = (e) => {
      const next = parseInt(e.target.value, 10);
      window.spammerzState.delayMs = Number.isFinite(next) ? next : 0;
    };
    delayInput.onchange = (e) => {
      updateState({ delayMs: parseInt(e.target.value, 10) || 0 });
    };
    delayInput.onblur = (e) => {
      updateState({ delayMs: parseInt(e.target.value, 10) || 0 });
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
      const nextState = {
        ...window.spammerzState,
        running: true,
        submitted: 0,
        succeeded: 0,
        failed: 0,
      };
      updateState(nextState);
      startSubmissionLoop(formData, nextState, updateState);
    };
  }

  // General Settings button
  const settingsBtn = document.getElementById('spz-general-settings-btn');
  if (settingsBtn) {
    settingsBtn.onclick = () => {
      renderAutoNameModal(window.spammerzState);
    };
  }

  // Refresh live preview
  const refreshBtn = document.getElementById('spz-refresh-preview');
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      refreshLivePreview(formData, window.spammerzState);
    };
  }

  // Auto Name toggle
  const autoNameToggle = document.getElementById('spz-auto-name-toggle');
  if (autoNameToggle) {
    autoNameToggle.onchange = (e) => {
      const enabled = e.target.checked;
      const config = window.spammerzState.autoNameConfig || createDefaultNameConfig();
      updateState({ autoNameConfig: { ...config, enabled } });
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }

  // Stop button
  const stopBtn = document.getElementById('spz-stop');
  if (stopBtn) {
    stopBtn.onclick = () => {
      window.spammerzState.running = false;
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }

  // Close button
  const closeBtn = document.getElementById('spz-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      window.spammerzState.submitted = 0;
      window.spammerzState.succeeded = 0;
      window.spammerzState.failed = 0;
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }

  // Reset button
  const resetBtn = document.getElementById('spz-reset');
  if (resetBtn) {
    resetBtn.onclick = () => {
      window.spammerzState.submitted = 0;
      window.spammerzState.succeeded = 0;
      window.spammerzState.failed = 0;
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }
}

/**
 * Start the actual submission loop
 */
async function startSubmissionLoop(formData, state, updateState) {
  const getState = () => window.spammerzState;

  for (let i = getState().submitted; i < getState().count; i++) {
    if (!getState().running) break;

    window.spammerzState.submitted = i + 1;

    // Build payload
    const payload = buildLiveFormPayload(formData, getState());
    if (!payload) {
      console.warn('[SpammerZ] Live form not found. Skipping submit.');
      break;
    }

    // Submit
    try {
      const liveForm = findLiveFormRoot();
      const actionUrl = liveForm?.getAttribute('action') || formData.actionUrl;
      ensureGoogleFormFields(payload, liveForm);
      console.debug('[SpammerZ] Submitting', { actionUrl, index: i + 1 });
      logFormData(payload, { maxEntries: 40 });
      logMissingQuestionEntries(payload, formData);
      logMissingEntryDetails(payload, formData);

      fetch(actionUrl, {
        method: 'POST',
        body: payload,
        mode: 'no-cors'
      }).catch(() => {});
      window.spammerzState.succeeded++;
    } catch {
      window.spammerzState.failed++;
    }

    updateProgressUI(getState());

    const progressText = document.getElementById('spz-progress-text');
    if (progressText) progressText.textContent = `${getState().submitted}/${getState().count} submitted`;

    if (i < getState().count - 1 && getState().running) {
      await new Promise(r => setTimeout(r, resolveDelay(getState().delayMs, getState().randomizeDelay)));
    }
  }

  window.spammerzState.running = false;
  updateState({
    running: false,
    submitted: window.spammerzState.submitted,
    succeeded: window.spammerzState.succeeded,
    failed: window.spammerzState.failed,
  });

  function render() { if (window.renderSpammerZUI) window.renderSpammerZUI(formData, window.spammerzState, updateState); }
  render();
}

/**
 * Build the FormData payload from the live Google Form DOM,
 * then fill any entry IDs missing from the DOM via FB_PUBLIC_LOAD_DATA_.
 */
function buildLiveFormPayload(formData, state) {
  const formEl = findLiveFormRoot();
  if (!formEl) return null;

  resetLiveFormInputs(formEl);

  const autoNameConfig = state.autoNameConfig;
  const detectedFields = autoNameConfig?.enabled ? detectNameQuestions(formData.allQuestions) : [];
  const activeFields = autoNameConfig?.fields?.length ? autoNameConfig.fields : detectedFields;
  const generatedName = autoNameConfig?.enabled && detectedFields.length > 0 ? generateName(autoNameConfig) : null;

  formData.allQuestions.forEach((q, idx) => {
    const cfg = state.answers[idx];
    if (!cfg) return;

    let value = resolvePreviewValueForQuestion(cfg, q);
    if (generatedName && activeFields.length) {
      const binding = activeFields.find(f => f.questionIndex === idx);
      if (binding) {
        switch (binding.fieldType) {
          case 'fullname':    value = generatedName.fullName;   break;
          case 'firstname':   value = generatedName.firstName;  break;
          case 'middlename':  value = generatedName.middleName; break;
          case 'lastname':    value = generatedName.lastName;   break;
          case 'mi':          value = generatedName.mi;         break;
          case 'extension':   value = generatedName.extension;  break;
        }
      }
    }

    applyPreviewValue(formEl, q, value);
  });

  const payload = new FormData(formEl);

  // Fill any entry IDs that weren't in the DOM (grid rows, hidden fields, etc.)
  // using Google's internal FB_PUBLIC_LOAD_DATA_ structure.
  fillMissingEntries(payload, formData);
  ensureRequiredEntriesFilled(payload, formData);

  return payload;
}

/**
 * Extract ALL entry IDs and their valid options from Google's internal
 * FB_PUBLIC_LOAD_DATA_ structure. This is the only reliable source for
 * grid sub-row entry IDs which never appear as named DOM inputs.
 *
 * Returns a Map of { "entry.XXXXXXX" => string[] | null }
 *   - string[]  = valid option labels (for radio/checkbox/dropdown/scale)
 *   - null      = free-text field (short answer, paragraph, date, time)
 */
function extractGoogleFormEntryMap() {
  const map = new Map();
  const raw = getFbPublicLoadData();
  if (!raw) return map;

  try {
    // raw[1][1] = array of top-level question descriptors
    const questions = raw[1][1];
    if (!Array.isArray(questions)) return map;

    questions.forEach(q => {
      // q[4] = array of answer groups (one per row for grids, one for simple questions)
      const answerGroups = q[4];
      if (!Array.isArray(answerGroups)) return;

      answerGroups.forEach(group => {
        // group[0] = numeric entry ID, group[1] = array of options (or absent/null for text)
        const entryId = group[0];
        if (entryId == null) return;

        const key = `entry.${entryId}`;
        const rawOptions = group[1];

        if (Array.isArray(rawOptions) && rawOptions.length > 0) {
          // Each option element: [optionLabel, ...rest]
          map.set(key, rawOptions.map(o => (Array.isArray(o) ? String(o[0]) : String(o))));
        } else {
          map.set(key, null); // free-text
        }
      });
    });
  } catch (e) {
    console.warn('[SpammerZ] Could not parse FB_PUBLIC_LOAD_DATA_', e);
  }

  return map;
}

function getFbPublicLoadData() {
  if (Array.isArray(window.FB_PUBLIC_LOAD_DATA_)) return window.FB_PUBLIC_LOAD_DATA_;
  const scripts = Array.from(document.querySelectorAll('script'));
  const dataScript = scripts.find(s => s.textContent.includes('FB_PUBLIC_LOAD_DATA_'));
  if (!dataScript) return null;
  const match = dataScript.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    console.warn('[SpammerZ] Failed to parse FB_PUBLIC_LOAD_DATA_ from script', e);
    return null;
  }
}

/**
 * Append entries that are missing from the FormData payload.
 * Reads from FB_PUBLIC_LOAD_DATA_ so it catches grid sub-row IDs
 * that are never rendered as named <input> elements in the DOM.
 */
function fillMissingEntries(payload, formDataModel) {
  const entryMap = extractGoogleFormEntryMap();
  console.debug('[SpammerZ] Entry map size', entryMap.size);
  if (entryMap.size === 0) {
    // FB_PUBLIC_LOAD_DATA_ unavailable — fall back to DOM scan
    fillMissingEntriesFromDOM(payload, formDataModel);
  }

  // Build set of keys already present in the payload
  const present = new Set(payload.keys());

  entryMap.forEach((options, entryKey) => {
    if (present.has(entryKey)) return; // already filled by DOM

    if (!options || options.length === 0) {
      // Free-text field
      payload.append(entryKey, 'Auto response');
      present.add(entryKey);
    } else {
      // Pick a random valid option
      const pick = options[Math.floor(Math.random() * options.length)];
      payload.append(entryKey, pick);
      present.add(entryKey);
    }
  });

  // Final sweep using the parsed form model as authoritative fallback.
  fillRemainingFromFormModel(payload, formDataModel);
}

function fillRemainingFromFormModel(payload, formDataModel) {
  if (!formDataModel?.allQuestions?.length) return;

  const present = new Set(payload.keys());
  const appended = [];

  formDataModel.allQuestions.forEach(q => {
    if (!q.id || present.has(q.id)) return;

    if ((q.type === 'grid' || q.type === 'checkbox_grid') && Array.isArray(q.gridRowIds)) {
      q.gridRowIds.forEach(rowEntryId => {
        if (!rowEntryId || present.has(rowEntryId)) return;
        const cols = q.gridColumns || q.gridCols || [];
        const pick = cols.length > 0
          ? cols[Math.floor(Math.random() * cols.length)]
          : 'Auto response';
        payload.append(rowEntryId, pick);
        present.add(rowEntryId);
        appended.push({ id: rowEntryId, source: 'gridRow', value: pick });
      });
      return;
    }

    if (q.options && q.options.length > 0) {
      const pick = q.options[Math.floor(Math.random() * q.options.length)];
      payload.append(q.id, pick);
      appended.push({ id: q.id, source: 'options', value: pick });
    } else if (q.type === 'date') {
      const value = new Date().toISOString().slice(0, 10);
      payload.append(q.id, value);
      appended.push({ id: q.id, source: 'date', value });
    } else if (q.type === 'time') {
      const value = new Date().toTimeString().slice(0, 5);
      payload.append(q.id, value);
      appended.push({ id: q.id, source: 'time', value });
    } else {
      payload.append(q.id, 'Auto response');
      appended.push({ id: q.id, source: 'default', value: 'Auto response' });
    }

    present.add(q.id);
  });

  if (appended.length) {
    console.debug('[SpammerZ] Appended missing entries from form model', appended);
  }
}

function ensureRequiredEntriesFilled(payload, formDataModel) {
  if (!formDataModel?.allQuestions?.length) return;
  const replaced = [];

  formDataModel.allQuestions.forEach(q => {
    if (!q.required || !q.id) return;
    const values = payload.getAll(q.id);
    if (!values.length) return;

    const allEmpty = values.every(v => v === '' || v == null);
    if (!allEmpty) return;

    payload.delete(q.id);

    let value = 'Auto response';
    if (q.options && q.options.length > 0) {
      value = q.options[Math.floor(Math.random() * q.options.length)];
    } else if (q.type === 'date') {
      value = new Date().toISOString().slice(0, 10);
    } else if (q.type === 'time') {
      value = new Date().toTimeString().slice(0, 5);
    }

    payload.append(q.id, value);
    replaced.push({ id: q.id, value });
  });

  if (replaced.length) {
    console.debug('[SpammerZ] Replaced empty required entries', replaced);
  }
}

/**
 * Fallback: scan the live form DOM for any named entry inputs that are
 * still empty/unchecked. Used when FB_PUBLIC_LOAD_DATA_ is unavailable.
 */
function fillMissingEntriesFromDOM(payload, formDataModel) {
  const formEl = findLiveFormRoot();
  if (!formEl) return;

  const handledNames = new Set(formDataModel.allQuestions.map(q => q.id).filter(Boolean));
  const present = new Set(payload.keys());

  // Group radio/checkbox inputs by name
  const groups = new Map();
  formEl.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
    const name = input.getAttribute('name');
    if (!name || !name.startsWith('entry.')) return;
    if (handledNames.has(name) || present.has(name)) return;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(input);
  });

  groups.forEach((inputs, name) => {
    const pick = inputs[Math.floor(Math.random() * inputs.length)];
    if (pick?.value) payload.append(name, pick.value);
  });

  // Text/date/time inputs
  formEl.querySelectorAll('input[type="text"], input[type="date"], input[type="time"], textarea').forEach(input => {
    const name = input.getAttribute('name');
    if (!name || !name.startsWith('entry.')) return;
    if (handledNames.has(name) || present.has(name)) return;
    if (input.type === 'date') {
      payload.append(name, new Date().toISOString().slice(0, 10));
    } else if (input.type === 'time') {
      payload.append(name, new Date().toTimeString().slice(0, 5));
    } else {
      payload.append(name, 'Auto response');
    }
  });
}

function ensureGoogleFormFields(formData, formEl) {
  const ensure = (name, fallback) => {
    if (formData.has(name)) return;
    const el = formEl?.querySelector(`input[name="${name}"]`);
    if (el?.value) {
      formData.append(name, el.value);
      return;
    }
    if (fallback !== undefined) formData.append(name, fallback);
  };

  ensure('fvv', '1');
  ensure('fbzx', String(Math.floor(Math.random() * 9e12) + 1e12));
  ensure('pageHistory', '0');
  ensure('partialResponse', '[null,null,""]');
  ensure('draftResponse', '[null,null,"-1"]');
}

function logFormData(formData, options = {}) {
  const maxEntries = options.maxEntries ?? 30;
  let count = 0;
  const entries = [];
  const jsonPayload = {};
  for (const [key, value] of formData.entries()) {
    if (count >= maxEntries) break;
    entries.push([key, String(value)]);
    if (jsonPayload[key] === undefined) {
      jsonPayload[key] = String(value);
    } else if (Array.isArray(jsonPayload[key])) {
      jsonPayload[key].push(String(value));
    } else {
      jsonPayload[key] = [jsonPayload[key], String(value)];
    }
    count++;
  }
  console.debug('[SpammerZ] Payload entries', entries);
  console.debug('[SpammerZ] Payload JSON', jsonPayload);
}

function logMissingQuestionEntries(formData, formDataModel) {
  if (!formDataModel?.allQuestions?.length) return;
  const missing = [];
  formDataModel.allQuestions.forEach(q => {
    if (q.required && !formData.has(q.id)) missing.push(q.id);
  });
  if (missing.length) {
    console.debug('[SpammerZ] Missing required entries', missing);
  }
}

function logMissingEntryDetails(formData, formDataModel) {
  if (!formDataModel?.allQuestions?.length) return;

  const entryMap = extractGoogleFormEntryMap();
  const missing = formDataModel.allQuestions.filter(q => q.required && !formData.has(q.id));
  if (!missing.length) return;

  const details = missing.map(q => {
    const mapEntry = entryMap.get(q.id);
    return {
      id: q.id,
      title: q.title,
      type: q.type,
      required: q.required,
      optionsCount: q.options ? q.options.length : 0,
      gridColumnsCount: q.gridColumns?.length || q.gridCols?.length || 0,
      gridRowIdsCount: q.gridRowIds?.length || 0,
      inFbPublicData: entryMap.has(q.id),
      fbOptionsCount: Array.isArray(mapEntry) ? mapEntry.length : 0,
    };
  });

  console.debug('[SpammerZ] Missing required entry details', details);
}

function resetLiveFormInputs(formEl) {
  const inputs = formEl.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    const tag = input.tagName.toLowerCase();
    const type = input.getAttribute('type');
    if (type === 'hidden') return;
    if (type === 'checkbox' || type === 'radio') {
      input.checked = false;
      return;
    }
    if (tag === 'select') {
      input.selectedIndex = 0;
      return;
    }
    input.value = '';
  });
}

function updateProgressUI(s) {
  const currentEl = document.querySelector('.spammerz-modal-current');
  const totalEl = document.querySelector('.spammerz-modal-total');
  const percentEl = document.querySelector('.spammerz-modal-percent');
  const progressFill = document.querySelector('.spammerz-modal-progress-fill');
  const successEl = document.querySelector('.spammerz-stat-success');
  const errorEl = document.querySelector('.spammerz-stat-error');

  const progress = s.count > 0 ? Math.round((s.submitted / s.count) * 100) : 0;

  if (currentEl) currentEl.textContent = String(s.submitted);
  if (totalEl) totalEl.textContent = String(s.count);
  if (percentEl) percentEl.textContent = `${progress}%`;
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (successEl) successEl.textContent = `✓ ${s.succeeded}`;
  if (errorEl) errorEl.textContent = `✗ ${s.failed}`;
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