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
  installQuestionTypeDebug(formData);
  window.spammerzUpdateState = (updates) => {
    window.spammerzState = { ...window.spammerzState, ...updates };
    render();
  };

  const captureScrollState = () => ({
    weights: document.getElementById('spz-questions-list')?.scrollTop || 0,
  });

  const restoreScrollState = (snapshot) => {
    if (!snapshot) return;
    const weightsList = document.getElementById('spz-questions-list');
    if (weightsList) weightsList.scrollTop = snapshot.weights || 0;
  };

  let container = document.getElementById('spammerz-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'spammerz-container';
    document.body.appendChild(container);
  }

  const version = (window.chrome?.runtime?.getManifest?.().version) || '1.0.4';

  // Load names from packaged markdown files if not already loaded
  if (window.spammerzState.autoNameConfig) {
    const config = window.spammerzState.autoNameConfig;
    if (!config.namesLoadedFromMd) {
      loadNamesFromMdFiles().then(loaded => {
        if (loaded.firstNames.length > 0 || loaded.lastNames.length > 0) {
          window.spammerzState.autoNameConfig = {
            ...window.spammerzState.autoNameConfig,
            sources: loaded,
            namesLoadedFromMd: true,
          };
          // Trigger a refresh to show the loaded names
          if (typeof updateState === 'function') {
            updateState({ autoNameConfig: window.spammerzState.autoNameConfig });
          }
        }
      }).catch(() => {});
    }
  }

  // Pre-load courses from markdown file
  preloadCourses();

  // Pre-load professions from markdown file
  preloadProfessions();

  if (!window.spammerzState.autoAddressConfig) {
    window.spammerzState.autoAddressConfig = createDefaultAddressConfig();
    if (typeof updateState === 'function') {
      updateState({ autoAddressConfig: window.spammerzState.autoAddressConfig });
    }
  } else if (!window.spammerzState.autoAddressConfig.locationChecked) {
    const fieldCountry = inferAddressCountryFromFields(detectAddressQuestions(formData.allQuestions));
    if (fieldCountry) {
      const regions = getAddressRegionOptions(fieldCountry.countryCode);
      window.spammerzState.autoAddressConfig = {
        ...window.spammerzState.autoAddressConfig,
        country: fieldCountry.country,
        countryCode: fieldCountry.countryCode,
        regions,
        provinces: regions,
        region: 'random',
        province: 'random',
        locality: 'random',
        city: 'random',
        barangay: 'random',
        ward: 'random',
        dependentLocality: 'random',
        locationChecked: true,
      };
      if (typeof updateState === 'function') {
        updateState({ autoAddressConfig: window.spammerzState.autoAddressConfig });
      }
    } else {
      detectAddressCountry().then(location => {
        ensureDetectedAddressLocation(location);
        const config = window.spammerzState.autoAddressConfig || createDefaultAddressConfig();
        const countryCode = normalizeAddressCountryCode(location.countryCode || config.countryCode);
        const regions = getAddressRegionOptions(countryCode);
        window.spammerzState.autoAddressConfig = {
          ...config,
          country: location.country || getAddressProfile(countryCode).country,
          countryCode,
          regions,
          provinces: regions,
          region: 'random',
          province: 'random',
          locality: 'random',
          city: 'random',
          barangay: 'random',
          ward: 'random',
          dependentLocality: 'random',
          detectedLocation: location,
          locationChecked: true,
        };
        if (typeof updateState === 'function') {
          updateState({ autoAddressConfig: window.spammerzState.autoAddressConfig });
        }
      }).catch(() => {});
    }
  }

  // Initialize Nationality Config
  if (!window.spammerzState.autoNationalityConfig) {
    const detectedNationalityFields = detectNationalityQuestions(formData.allQuestions);
    window.spammerzState.autoNationalityConfig = {
      ...createDefaultNationalityConfig(),
      fields: detectedNationalityFields,
    };
    if (typeof updateState === 'function') {
      updateState({ autoNationalityConfig: window.spammerzState.autoNationalityConfig });
    }
  } else if (!window.spammerzState.autoNationalityConfig.locationChecked) {
    // Re-detect fields on reload
    const detectedNationalityFields = detectNationalityQuestions(formData.allQuestions);
    window.spammerzState.autoNationalityConfig = {
      ...window.spammerzState.autoNationalityConfig,
      fields: detectedNationalityFields,
      locationChecked: true,
    };
    if (typeof updateState === 'function') {
      updateState({ autoNationalityConfig: window.spammerzState.autoNationalityConfig });
    }
  }

  function render() {
    if (!window.htm) return;
    const s = window.spammerzState;
    const scrollSnapshot = captureScrollState();

    // Disabled state - floating toggle
    if (s.enabled === false) {
      restoreLiveForm();
      const toggle = document.createElement('div');
      toggle.id = 'spammerz-disabled-toggle';
      toggle.innerHTML = '<span class="spammerz-toggle-icon">&#9889;</span><span>SpammerZ</span>';
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
              <span class="spammerz-version">v${version}</span>
            </div>
            <div class="spammerz-form-title">${escHtml(formData.title)}</div>
            <button class="spammerz-header-btn spammerz-disable-btn" id="spz-disable-btn">&#10005;</button>
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

    // Check for email collection feature and show blocking modal
    const emailCollectionEnabled = window.spammerz_emailCollectionChecked ? window.spammerz_emailCollectionEnabled : (() => {
      const enabled = detectEmailCollectionEnabled();
      window.spammerz_emailCollectionEnabled = enabled;
      window.spammerz_emailCollectionChecked = true;
      return enabled;
    })();

    if (emailCollectionEnabled) {
      showEmailCollectionModal();
    }

    // Render Submission Settings (LEFT panel)
    renderSubmissionPanel(s, updateState);

    // Render Google Form (MIDDLE panel)
    renderSandbox(formData, s);

    // Render Configure Weights (RIGHT panel)
    renderWeightsPanel(formData, s, updateState);
    restoreScrollState(scrollSnapshot);

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

function installQuestionTypeDebug(formData) {
  const getRows = () => (window.spammerzFormData?.allQuestions || formData?.allQuestions || []).map((question, idx) => ({
    index: idx,
    title: question.title || '',
    id: question.id || '',
    rawTypeInt: question.rawTypeInt ?? null,
    rawTypeName: question.rawTypeName || '',
    resolvedType: question.type || '',
    displayType: getQuestionDisplayType(question, question.type || 'unknown'),
    options: Array.isArray(question.options) ? question.options.join(' | ') : '',
    scaleMin: question.scaleMin ?? null,
    scaleMax: question.scaleMax ?? null,
    scaleMinLabel: question.scaleMinLabel || '',
    scaleMaxLabel: question.scaleMaxLabel || '',
    gridColumns: Array.isArray(question.gridColumns) ? question.gridColumns.join(' | ') : '',
  }));

  window.spammerzQuestionTypeDebug = () => {
    const rows = getRows();
    console.table(rows);
    const json = JSON.stringify(rows, null, 2);
    console.log('[SpammerZ] Question type debug JSON:', json);
    return json;
  };

  const debugKey = formData?.formId || formData?.title || 'unknown-form';
  if (window.spammerzLastQuestionTypeDebugKey !== debugKey) {
    window.spammerzLastQuestionTypeDebugKey = debugKey;
    console.info('[SpammerZ] Type debug ready. Run spammerzQuestionTypeDebug() in the console and paste the returned JSON.');
    window.spammerzQuestionTypeDebug();
  }
}

/**
 * Render the LEFT panel - Submission Settings + General Settings
 */
function renderSubmissionPanel(s, updateState) {
  const panel = document.getElementById('spz-submission-panel');
  if (!panel) return;

  const autoNameEnabled = s.autoNameConfig?.enabled;
  const detectedFieldsCount = s.autoNameConfig?.fields?.length || 0;
  const autoAddressEnabled = s.autoAddressConfig?.enabled;
  const detectedAddressCount = s.autoAddressConfig?.fields?.length || 0;
  const addressCountry = s.autoAddressConfig?.country || 'Detecting';
  const weightMode = s.weightMode || 'plan';

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
        <div class="spammerz-weight-mode-section">
          <div class="spammerz-auto-name-header">
            <span class="spammerz-auto-name-title">Weight Mode</span>
          </div>
          <div class="spammerz-mode-card-group" role="radiogroup" aria-label="Weight Mode">
            <label class="spammerz-mode-card ${weightMode === 'plan' ? 'active' : ''}" title="Plan mode pre-calculates the whole run so final results stay close to your configured weights.">
              <input type="radio" name="spz-weight-mode" value="plan" ${weightMode === 'plan' ? 'checked' : ''}>
              <span class="spammerz-mode-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </span>
              <span class="spammerz-mode-copy">
                <span class="spammerz-mode-title">Plan</span>
                <span class="spammerz-mode-desc">Balanced run</span>
              </span>
            </label>
            <label class="spammerz-mode-card ${weightMode === 'dice' ? 'active' : ''}" title="Dice mode rolls each response independently, so results can swing above or below the configured weights.">
              <input type="radio" name="spz-weight-mode" value="dice" ${weightMode === 'dice' ? 'checked' : ''}>
              <span class="spammerz-mode-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <circle cx="8" cy="8" r="1"/>
                  <circle cx="16" cy="8" r="1"/>
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="8" cy="16" r="1"/>
                  <circle cx="16" cy="16" r="1"/>
                </svg>
              </span>
              <span class="spammerz-mode-copy">
                <span class="spammerz-mode-title">Dice</span>
                <span class="spammerz-mode-desc">Random rolls</span>
              </span>
            </label>
          </div>
        </div>

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

        <div class="spammerz-auto-name-section spammerz-auto-address-section">
          <div class="spammerz-auto-name-header">
            <span class="spammerz-auto-name-title">Auto Address</span>
            <span class="spammerz-auto-name-status ${autoAddressEnabled ? 'active' : ''}">
              ${autoAddressEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div class="spammerz-auto-name-toggle">
            <label class="spammerz-toggle">
              <input type="checkbox" id="spz-auto-address-toggle" ${autoAddressEnabled ? 'checked' : ''}>
              <span class="spammerz-toggle-slider"></span>
              <span>Enable Auto Address</span>
            </label>
          </div>
          <div class="spammerz-auto-name-info">${escHtml(addressCountry)}${autoAddressEnabled && detectedAddressCount > 0 ? ` - ${detectedAddressCount} field(s) detected` : ''}</div>
          <button class="spammerz-btn-outline spammerz-auto-name-btn" id="spz-address-settings-btn">
            ${autoAddressEnabled ? 'Configure' : 'Configure Auto Address'}
          </button>
        </div>

        <div class="spammerz-auto-name-section spammerz-auto-nationality-section">
          <div class="spammerz-auto-name-header">
            <span class="spammerz-auto-name-title">Auto Nationality</span>
            <span class="spammerz-auto-name-status ${s.autoNationalityConfig?.enabled ? 'active' : ''}">
              ${s.autoNationalityConfig?.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div class="spammerz-auto-name-toggle">
            <label class="spammerz-toggle">
              <input type="checkbox" id="spz-auto-nationality-toggle" ${s.autoNationalityConfig?.enabled ? 'checked' : ''}>
              <span class="spammerz-toggle-slider"></span>
              <span>Enable Auto Nationality</span>
            </label>
          </div>
          <div class="spammerz-auto-name-info">
            ${(s.autoNationalityConfig?.enabled && s.autoNationalityConfig?.fields?.length > 0) ? `${s.autoNationalityConfig.fields.length} field(s) detected` : 'Detects nationality, citizenship, and related fields'}
          </div>
          <button class="spammerz-btn-outline spammerz-auto-name-btn" id="spz-nationality-settings-btn">
            ${s.autoNationalityConfig?.enabled ? 'Configure' : 'Configure Auto Nationality'}
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
    pattern: 'Name Pattern',
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
                  <div class="spammerz-name-hint">Random selection uses exactly one full entry from this list</div>
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
  // Close button
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
        namesLoadedFromMd: true,
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

function renderAutoAddressModal(s) {
  const container = document.getElementById('spz-modal-container');
  if (!container) return;

  const config = window.spammerzState.autoAddressConfig || createDefaultAddressConfig();
  const countryCode = normalizeAddressCountryCode(config.countryCode || 'INTL');
  const profile = getAddressProfile(countryCode);
  const supportedCountries = getSupportedAddressCountries();
  const regionOptions = getAddressRegionOptions(countryCode);
  const selectedRegion = config.region || config.province || 'random';
  const selectedRegions = selectedRegion !== 'random'
    ? [selectedRegion]
    : (config.regions?.length ? config.regions : (config.provinces?.length ? config.provinces : regionOptions));
  const localityOptions = getAddressLocalityOptions(countryCode, selectedRegions);
  const selectedLocality = config.locality || config.city || 'random';
  const dependentField = getAddressDependentField(profile);
  const selectedDependent = dependentField ? (config[dependentField] || config.dependentLocality || 'random') : 'random';
  const dependentOptions = getAddressDependentOptions(countryCode, selectedRegion, selectedLocality);
  const zipPreview = getAddressPostalCodePreview(countryCode, selectedRegion, selectedLocality);
  const detectedFields = window.spammerzFormData ? detectAddressQuestions(window.spammerzFormData.allQuestions) : [];
  const detectedSummary = detectedFields.length ? detectedFields.map(field => getAddressFieldLabel(field.fieldType)).join(', ') : 'None detected';
  const regionLabel = getAddressFieldLabel(profile.regionField || 'state');
  const localityLabel = getAddressFieldLabel(profile.localityField || 'city');
  const dependentLabel = dependentField ? getAddressFieldLabel(dependentField) : '';

  logAutoAddressDebug('modal-open', {
    countryCode,
    profile,
    regionOptions,
    localityOptions,
    dependentOptions,
    selectedRegion,
    selectedLocality,
    selectedDependent,
    zipPreview,
  });

  container.innerHTML = `
    <div class="spammerz-modal spammerz-modal-name">
      <div class="spammerz-modal-content spammerz-modal-content-address">
        <div class="spammerz-modal-header">
          <h2>Auto Address Settings</h2>
          <button class="spammerz-modal-close" id="spz-address-modal-close">&times;</button>
        </div>
        <div class="spammerz-address-modal-body">
          <div class="spammerz-address-detected">
            <span>Country Detected</span>
            <strong id="spz-address-country-detected">${escHtml(profile.country)}</strong>
          </div>
          <div class="spammerz-address-detected">
            <span>Form Fields Detected</span>
            <strong>${escHtml(detectedSummary)}</strong>
          </div>
          <div class="spammerz-settings-row">
            <label>Country Profile</label>
            <select id="spz-address-country" class="spammerz-address-select">
              ${supportedCountries.map(country => `<option value="${escHtml(country.code)}" ${countryCode === country.code ? 'selected' : ''}>${escHtml(country.name)}</option>`).join('')}
            </select>
          </div>
          <div class="spammerz-settings-row">
            <label id="spz-address-region-label">${escHtml(regionLabel)}</label>
            <select id="spz-address-region" class="spammerz-address-select">
              <option value="random">Random</option>
              ${regionOptions.map(region => `<option value="${escHtml(region)}" ${selectedRegion === region ? 'selected' : ''}>${escHtml(region)}</option>`).join('')}
            </select>
          </div>
          <div class="spammerz-settings-row">
            <label id="spz-address-locality-label">${escHtml(localityLabel)}</label>
            <select id="spz-address-locality" class="spammerz-address-select">
              <option value="random">Random</option>
              ${localityOptions.map(city => `<option value="${escHtml(city)}" ${selectedLocality === city ? 'selected' : ''}>${escHtml(city)}</option>`).join('')}
            </select>
          </div>
          <div class="spammerz-settings-row" id="spz-address-dependent-row" style="${dependentField ? '' : 'display:none'}">
              <label id="spz-address-dependent-label">${escHtml(dependentLabel)}</label>
              <select id="spz-address-dependent" class="spammerz-address-select">
                <option value="random">Random</option>
                ${dependentOptions.map(item => `<option value="${escHtml(item)}" ${selectedDependent === item ? 'selected' : ''}>${escHtml(item)}</option>`).join('')}
              </select>
          </div>
          <div class="spammerz-address-detected">
            <span>Zip / Postal Code</span>
            <strong id="spz-address-zip-preview">${escHtml(zipPreview)}</strong>
          </div>
          <div class="spammerz-address-components" id="spz-address-components">
            ${profile.components.map(fieldType => `<span>${escHtml(getAddressFieldLabel(fieldType))}</span>`).join('')}
          </div>
          <div class="spammerz-address-note" id="spz-address-note">Random values stay connected by country profile: selected country limits ${escHtml(regionLabel)}, selected ${escHtml(regionLabel)} limits ${escHtml(localityLabel)}${dependentField ? `, selected ${escHtml(localityLabel)} limits ${escHtml(dependentLabel)}` : ''}, and ZIP follows the selected ${escHtml(localityLabel)}.</div>
        </div>
        <div class="spammerz-modal-actions-name">
          <button class="spammerz-btn-outline" id="spz-address-cancel">Cancel</button>
          <button class="spammerz-btn-primary" id="spz-address-save">Save Settings</button>
        </div>
      </div>
    </div>
  `;

  attachAutoAddressModalListeners(formData, updateState);
  enhanceAddressSearchInputs();
  hydrateAddressModalOptions(countryCode);
}

/**
 * Render Nationality Configuration Modal
 */
function renderAutoNationalityModal(s) {
  const container = document.getElementById('spz-modal-container');
  if (!container) return;

  const config = window.spammerzState.autoNationalityConfig || createDefaultNationalityConfig();
  const detectedFields = window.spammerzFormData ? detectNationalityQuestions(window.spammerzFormData.allQuestions) : [];
  const detectedSummary = detectedFields.length
    ? detectedFields.map(field => getSmartSurveyFieldLabel(field.fieldType)).join(', ')
    : 'None detected';
  const pools = [
    { value: 'all', label: 'All Countries' },
    { value: 'pinoy', label: 'Filipino (Pinoy)' },
    { value: 'asian', label: 'Asian' },
    { value: 'european', label: 'European' },
    { value: 'american', label: 'American / Latin' },
    { value: 'african', label: 'African' },
    { value: 'oceanian', label: 'Oceanian' },
  ];

  container.innerHTML = `
    <div class="spammerz-modal spammerz-modal-name">
      <div class="spammerz-modal-content spammerz-modal-content-address">
        <div class="spammerz-modal-header">
          <h2>Auto Nationality Settings</h2>
          <button class="spammerz-modal-close" id="spz-nationality-modal-close">&times;</button>
        </div>
        <div class="spammerz-address-modal-body">
          <div class="spammerz-address-detected">
            <span>Form Fields Detected</span>
            <strong>${escHtml(detectedSummary)}</strong>
          </div>
          <div class="spammerz-settings-row">
            <label>Nationality Pool</label>
            <select id="spz-nationality-pool" class="spammerz-address-select">
              ${pools.map(p => `<option value="${escHtml(p.value)}" ${config.pool === p.value ? 'selected' : ''}>${escHtml(p.label)}</option>`).join('')}
            </select>
          </div>
          <div class="spammerz-settings-row">
            <label>Specific Nationality (Optional)</label>
            <select id="spz-nationality-select" class="spammerz-address-select">
              <option value="random">Random from Pool</option>
              ${NATIONALITIES.slice(0, 50).map(n => `<option value="${escHtml(n)}" ${config.nationality === n ? 'selected' : ''}>${escHtml(n)}</option>`).join('')}
            </select>
          </div>
          <div class="spammerz-settings-row">
            <label class="spammerz-toggle">
              <input type="checkbox" id="spz-nationality-prefer-local" ${config.preferLocal ? 'checked' : ''}>
              <span class="spammerz-toggle-slider"></span>
              <span>Match Local Nationality (based on address country)</span>
            </label>
          </div>
          <div class="spammerz-address-note">
            <strong>Detected Fields:</strong> Nationality, Citizenship, Ethnicity, and related fields are automatically detected from form questions.
          </div>
        </div>
        <div class="spammerz-modal-actions-name">
          <button class="spammerz-btn-outline" id="spz-nationality-cancel">Cancel</button>
          <button class="spammerz-btn-primary" id="spz-nationality-save">Save Settings</button>
        </div>
      </div>
    </div>
  `;

  // Attach listeners
  document.getElementById('spz-nationality-modal-close')?.addEventListener('click', () => {
    document.getElementById('spz-modal-container').innerHTML = '';
  });
  document.getElementById('spz-nationality-cancel')?.addEventListener('click', () => {
    document.getElementById('spz-modal-container').innerHTML = '';
  });
  document.getElementById('spz-nationality-save')?.addEventListener('click', () => {
    const pool = document.getElementById('spz-nationality-pool')?.value || 'all';
    const nationality = document.getElementById('spz-nationality-select')?.value || 'random';
    const preferLocal = document.getElementById('spz-nationality-prefer-local')?.checked || false;
    const detectedFields = detectNationalityQuestions(window.spammerzFormData?.allQuestions || []);
    const prev = window.spammerzState.autoNationalityConfig || createDefaultNationalityConfig();
    const next = {
      ...prev,
      enabled: prev.enabled !== false,
      fields: detectedFields,
      pool,
      nationality,
      preferLocal,
    };
    updateState({ autoNationalityConfig: next });
    document.getElementById('spz-modal-container').innerHTML = '';
    window.renderSpammerZUI(formData, window.spammerzState, updateState);
  });
}

function attachAutoAddressModalListeners(formData, updateState) {
  const close = () => { document.getElementById('spz-modal-container').innerHTML = ''; };
  document.getElementById('spz-address-modal-close')?.addEventListener('click', close);
  document.getElementById('spz-address-cancel')?.addEventListener('click', close);
  document.getElementById('spz-address-country')?.addEventListener('change', (e) => {
    const prev = window.spammerzState.autoAddressConfig || createDefaultAddressConfig();
    const countryCode = normalizeAddressCountryCode(e.target.value);
    const profile = getAddressProfile(countryCode);
    window.spammerzState.autoAddressConfig = {
      ...prev,
      country: profile.country,
      countryCode,
      regions: getAddressRegionOptions(countryCode),
      provinces: getAddressRegionOptions(countryCode),
      region: 'random',
      province: 'random',
      locality: 'random',
      city: 'random',
      barangay: 'random',
      ward: 'random',
      dependentLocality: 'random',
    };
    updateAddressModalCascades();
    hydrateAddressModalOptions(countryCode);
  });

  document.getElementById('spz-address-region')?.addEventListener('change', (e) => {
    const prev = window.spammerzState.autoAddressConfig || createDefaultAddressConfig();
    const region = e.target.value || 'random';
    const countryCode = normalizeAddressCountryCode(document.getElementById('spz-address-country')?.value || prev.countryCode);
    window.spammerzState.autoAddressConfig = {
      ...prev,
      countryCode,
      country: getAddressProfile(countryCode).country,
      region,
      province: region,
      regions: region === 'random' ? getAddressRegionOptions(countryCode) : [region],
      provinces: region === 'random' ? getAddressRegionOptions(countryCode) : [region],
      locality: 'random',
      city: 'random',
      barangay: 'random',
      ward: 'random',
      dependentLocality: 'random',
    };
    updateAddressModalCascades();
    hydrateAddressModalOptions(countryCode);
  });

  document.getElementById('spz-address-locality')?.addEventListener('change', (e) => {
    const prev = window.spammerzState.autoAddressConfig || createDefaultAddressConfig();
    window.spammerzState.autoAddressConfig = {
      ...prev,
      locality: e.target.value || 'random',
      city: e.target.value || 'random',
      barangay: 'random',
      ward: 'random',
      dependentLocality: 'random',
    };
    updateAddressModalCascades();
    hydrateAddressModalOptions(normalizeAddressCountryCode(prev.countryCode));
  });

  document.getElementById('spz-address-save')?.addEventListener('click', () => {
    const countryCode = normalizeAddressCountryCode(document.getElementById('spz-address-country')?.value || 'INTL');
    const profile = getAddressProfile(countryCode);
    const region = document.getElementById('spz-address-region')?.value || 'random';
    const locality = document.getElementById('spz-address-locality')?.value || 'random';
    const dependentField = getAddressDependentField(profile);
    const dependentValue = document.getElementById('spz-address-dependent')?.value || 'random';
    const regions = region === 'random' ? getAddressRegionOptions(countryCode) : [region];
    const detectedFields = detectAddressQuestions(window.spammerzFormData.allQuestions);
    const prev = window.spammerzState.autoAddressConfig || createDefaultAddressConfig();
    const next = {
      ...prev,
      enabled: prev.enabled !== false,
      fields: detectedFields,
      country: profile.country,
      countryCode,
      region,
      province: region,
      regions,
      provinces: regions,
      locality,
      city: locality,
      dependentLocality: dependentValue,
      ...(dependentField ? { [dependentField]: dependentValue } : {}),
      ...(dependentField !== 'barangay' ? { barangay: 'random' } : {}),
      ...(dependentField !== 'ward' ? { ward: 'random' } : {}),
    };
    updateState({ autoAddressConfig: next });
    close();
    window.renderSpammerZUI(formData, window.spammerzState, updateState);
  });
}

function updateAddressModalCascades() {
  const config = window.spammerzState.autoAddressConfig || createDefaultAddressConfig();
  const countryCode = normalizeAddressCountryCode(config.countryCode);
  const profile = getAddressProfile(countryCode);
  const regionEl = document.getElementById('spz-address-region');
  const countryEl = document.getElementById('spz-address-country');
  const localityEl = document.getElementById('spz-address-locality');
  const dependentEl = document.getElementById('spz-address-dependent');
  const zipEl = document.getElementById('spz-address-zip-preview');
  const countryLabel = document.getElementById('spz-address-country-detected');
  const regionLabel = document.getElementById('spz-address-region-label');
  const localityLabel = document.getElementById('spz-address-locality-label');
  const dependentLabel = document.getElementById('spz-address-dependent-label');
  const noteEl = document.getElementById('spz-address-note');
  const componentsEl = document.getElementById('spz-address-components');
  const dependentRow = document.getElementById('spz-address-dependent-row');
  const dependentField = getAddressDependentField(profile);

  if (countryEl) {
    countryEl.innerHTML = getSupportedAddressCountries()
      .map(country => `<option value="${escHtml(country.code)}" ${countryCode === country.code ? 'selected' : ''}>${escHtml(country.name)}</option>`)
      .join('');
    countryEl.value = countryCode;
  }
  if (countryLabel) countryLabel.textContent = profile.country;
  if (regionLabel) regionLabel.textContent = getAddressFieldLabel(profile.regionField || 'state');
  if (localityLabel) localityLabel.textContent = getAddressFieldLabel(profile.localityField || 'city');

  if (regionEl) {
    setAddressSelectOptions(regionEl, getAddressRegionOptions(countryCode), config.region || config.province || 'random');
  }

  const selectedRegion = config.region || config.province || 'random';
  const regionOptions = getAddressRegionOptions(countryCode);
  const selectedRegions = selectedRegion === 'random' ? getAddressRegionOptions(countryCode) : [selectedRegion];
  const localityOptions = getAddressLocalityOptions(countryCode, selectedRegions);
  if (localityEl) {
    setAddressSelectOptions(localityEl, localityOptions, config.locality || config.city || 'random');
  }

  const selectedLocality = config.locality || config.city || 'random';
  const dependentOptions = getAddressDependentOptions(countryCode, selectedRegion, selectedLocality);
  const zipPreview = getAddressPostalCodePreview(countryCode, selectedRegion, selectedLocality);
  if (dependentRow) dependentRow.style.display = dependentField ? '' : 'none';
  if (dependentLabel && dependentField) dependentLabel.textContent = getAddressFieldLabel(dependentField);
  if (dependentEl && dependentField) {
    setAddressSelectOptions(dependentEl, dependentOptions, config[dependentField] || config.dependentLocality || 'random');
  }

  if (zipEl) zipEl.textContent = zipPreview;
  if (componentsEl) {
    componentsEl.innerHTML = profile.components.map(fieldType => `<span>${escHtml(getAddressFieldLabel(fieldType))}</span>`).join('');
  }
  if (noteEl) {
    const currentRegionLabel = getAddressFieldLabel(profile.regionField || 'state');
    const currentLocalityLabel = getAddressFieldLabel(profile.localityField || 'city');
    const currentDependentLabel = dependentField ? getAddressFieldLabel(dependentField) : '';
    noteEl.textContent = `Random values stay connected by country profile: selected country limits ${currentRegionLabel}, selected ${currentRegionLabel} limits ${currentLocalityLabel}${dependentField ? `, selected ${currentLocalityLabel} limits ${currentDependentLabel}` : ''}, and ZIP follows the selected ${currentLocalityLabel}.`;
  }

  enhanceAddressSearchInputs();

  logAutoAddressDebug('cascade-update', {
    countryCode,
    profile,
    regionOptions,
    localityOptions,
    dependentOptions,
    selectedRegion,
    selectedLocality,
    selectedDependent: dependentField ? (config[dependentField] || config.dependentLocality || 'random') : 'random',
    zipPreview,
  });
}

function setAddressSelectOptions(select, options, selectedValue = 'random') {
  const normalizedSelected = options.includes(selectedValue) ? selectedValue : 'random';
  select.innerHTML = [
    '<option value="random">Random</option>',
    ...options.map(option => `<option value="${escHtml(option)}" ${normalizedSelected === option ? 'selected' : ''}>${escHtml(option)}</option>`),
  ].join('');
  select.value = normalizedSelected;
  syncAddressSearchInput(select);
}

function enhanceAddressSearchInputs() {
  ['spz-address-country', 'spz-address-region', 'spz-address-locality', 'spz-address-dependent'].forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return;
    let input = document.getElementById(`${selectId}-search`);
    if (!input) {
      input = document.createElement('input');
      input.id = `${selectId}-search`;
      input.type = 'search';
      input.className = 'spammerz-address-search';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = 'Search...';
      select.parentElement.insertBefore(input, select);

      input.addEventListener('input', () => filterAddressSelect(select, input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        selectFirstVisibleAddressOption(select);
      });
      input.addEventListener('blur', () => syncAddressSearchInput(select));
      select.addEventListener('change', () => syncAddressSearchInput(select));
    }
    syncAddressSearchInput(select);
  });
}

function filterAddressSelect(select, query) {
  const needle = normalizeAddressSearch(query);
  const options = Array.from(select.options);
  options.forEach(option => {
    const isRandom = option.value === 'random';
    const matches = !needle || normalizeAddressSearch(option.textContent).includes(needle);
    option.hidden = !isRandom && !matches;
  });

  const exact = options.find(option => option.value !== 'random' && normalizeAddressSearch(option.textContent) === needle);
  if (exact && select.value !== exact.value) {
    select.value = exact.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function selectFirstVisibleAddressOption(select) {
  const firstVisible = Array.from(select.options).find(option => !option.hidden && option.value !== 'random')
    || Array.from(select.options).find(option => !option.hidden);
  if (!firstVisible || select.value === firstVisible.value) return;
  select.value = firstVisible.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function syncAddressSearchInput(select) {
  const input = document.getElementById(`${select.id}-search`);
  if (!input) return;
  Array.from(select.options).forEach(option => { option.hidden = false; });
  const selectedOption = select.options[select.selectedIndex];
  input.value = selectedOption && selectedOption.value !== 'random' ? selectedOption.textContent : '';
}

function normalizeAddressSearch(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function hydrateAddressModalOptions(countryCode) {
  try {
    const config = window.spammerzState.autoAddressConfig || createDefaultAddressConfig();
    await hydrateSupportedAddressCountries();
    await hydrateAddressProfile(countryCode, config.region || config.province || 'random', config.locality || config.city || 'random');
    updateAddressModalCascades();
  } catch (e) {
    logAutoAddressDebug('api-fetch-failed', {
      countryCode,
      profile: getAddressProfile(countryCode),
      regionOptions: getAddressRegionOptions(countryCode),
      localityOptions: [],
      dependentOptions: [],
      selectedRegion: window.spammerzState.autoAddressConfig?.region || 'random',
      selectedLocality: window.spammerzState.autoAddressConfig?.locality || 'random',
      selectedDependent: window.spammerzState.autoAddressConfig?.dependentLocality || 'random',
      zipPreview: 'API unavailable',
      error: e?.message || String(e),
    });
  }
}

async function hydrateAddressProfile(countryCode, selectedRegion = 'random', selectedLocality = 'random') {
  const code = normalizeAddressCountryCode(countryCode);
  if (code === 'PH') {
    await hydratePhilippinesAddressProfile(selectedRegion, selectedLocality);
  } else {
    await hydrateGeocodedAddressProfile(code, selectedRegion);
  }
  await hydratePostalCode(code, selectedRegion, selectedLocality);
}

function logAutoAddressDebug(context, data) {
  return;
}

/**
 * Render the RIGHT panel - Configure Weights
 */
function renderWeightsPanel(formData, s, updateState) {
  const panel = document.getElementById('spz-weights-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="spammerz-config-header spammerz-weights-header">
      <span>Configure Weights (%)</span>
      <button class="spammerz-icon-btn spammerz-random-weights-btn" id="spz-randomize-weights" type="button" title="Randomize all weights">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 3h5v5"/>
          <path d="M4 20L21 3"/>
          <path d="M21 16v5h-5"/>
          <path d="M15 15l6 6"/>
          <path d="M4 4l5 5"/>
        </svg>
      </button>
    </div>
    <div class="spammerz-config-questions" id="spz-questions-list"></div>
  `;

  // Group questions by page/section
  const questionsByPage = groupQuestionsByPage(formData);

  // Render each page group
  const questionsList = document.getElementById('spz-questions-list');
  Object.entries(questionsByPage).forEach(([pageIdx, questions]) => {
    if (questions.length === 0) return;

    // Check if any question in this page has configurable weights
    const hasConfigurables = questions.some(q => {
      const cfg = s.answers[formData.allQuestions.indexOf(q)];
      return cfg && getConfigurableOptionCount(q, cfg) > 1;
    });

    // Get page title
    const page = formData.pages?.find(p => p.index === parseInt(pageIdx));
    const pageTitle = page?.title || `Section ${parseInt(pageIdx) + 1}`;

    // Add page section header with per-page randomize button
    const typeSection = document.createElement('div');
    typeSection.className = 'spammerz-type-section';
    typeSection.innerHTML = `
      <div class="spammerz-type-section-header">
        <span class="spammerz-type-section-title">${escHtml(pageTitle)}</span>
        <button class="spammerz-icon-btn spammerz-random-page-btn" data-page="${pageIdx}" type="button" title="Randomize this section" ${!hasConfigurables ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 3h5v5"/>
            <path d="M4 20L21 3"/>
            <path d="M21 16v5h-5"/>
            <path d="M15 15l6 6"/>
            <path d="M4 4l5 5"/>
          </svg>
        </button>
      </div>
    `;
    questionsList.appendChild(typeSection);

    // Render each question in this page
    questions.forEach(q => {
      const qIdx = formData.allQuestions.indexOf(q);
      const cfg = s.answers[qIdx];
      if (!cfg) return;
      questionsList.appendChild(createWeightedQuestionConfig(q, cfg, qIdx));
    });
  });
}

/**
 * Group questions by their page/section
 */
function groupQuestionsByPage(formData) {
  const grouped = {};
  formData.allQuestions.forEach(q => {
    const pageIdx = q.pageIndex ?? 0;
    if (!grouped[pageIdx]) grouped[pageIdx] = [];
    grouped[pageIdx].push(q);
  });
  return grouped;
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
    pattern: 'Name Pattern',
  };

  // Detect if this question is a name field
  const detectedFields = window.spammerzFormData ? detectNameQuestions(window.spammerzFormData.allQuestions) : [];
  const nameBinding = detectedFields.find(f => f.questionIndex === qIdx);
  const addressFields = window.spammerzFormData ? detectAddressQuestions(window.spammerzFormData.allQuestions) : [];
  const addressBinding = addressFields.find(f => f.questionIndex === qIdx);
  const ageBinding = detectAgeQuestion(question, qIdx);
  const smartBinding = detectSmartSurveyQuestion(question, qIdx);
  const isNameField = !!nameBinding;
  const isAddressField = !!addressBinding;
  const isAgeField = !!ageBinding;
  const isBirthdateField = smartBinding?.fieldType === 'birthdate';
  const isTypedQuestion = ['short_text', 'paragraph', 'date', 'time'].includes(question.type) || isBirthdateField;
  const isConsentField = smartBinding?.fieldType === 'consent';
  const isSmartField = !!smartBinding && !isAgeField && (isTypedQuestion || isConsentField || smartBinding?.fieldType === 'date');

  const nameBindingLabel = nameBinding
    ? getNameBindingDisplayLabel(nameBinding, nameFieldLabels)
    : '';

  // Question title header
  let headerHtml = `<div class="spammerz-config-item-title">${escHtml(question.title)}</div>`;

  // Check if extension field but extension is disabled
  const isExtensionDisabled = nameBinding?.fieldType === 'extension' && !cfg?.includeExtension;

  if (isNameField || isAddressField) {
    const typeLabel = getQuestionDisplayType(question, isBirthdateField ? 'date' : question.type);
    headerHtml += `
      <div class="spammerz-config-item-type spammerz-type-name">${typeLabel}</div>
    `;
    item.innerHTML = headerHtml;

    // Show auto-fill field detection (locked, green or red warning if extension disabled)
    const nameDetector = document.createElement('div');

    if (isExtensionDisabled) {
      // Red warning badge for disabled extension
      nameDetector.className = 'spammerz-name-detected-badge spammerz-name-detected-badge-warning';
      nameDetector.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span class="spammerz-name-detected-text">Auto-fill: <strong>${escHtml(nameBindingLabel)}</strong></span>
        <span class="spammerz-detected-warning" title="Extension is disabled. Please enable it in Auto Name Settings for this feature to work.">!</span>
      `;
    } else {
      // Normal green badge
      nameDetector.className = 'spammerz-name-detected-badge';
      nameDetector.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span class="spammerz-name-detected-text">Auto-fill: <strong>${escHtml(isNameField ? nameBindingLabel : getAddressFieldLabel(addressBinding.fieldType))}</strong></span>
      `;
    }
    item.appendChild(nameDetector);
  } else {
    const typeLabel = getQuestionDisplayType(question, isBirthdateField ? 'date' : question.type);
    headerHtml += `<div class="spammerz-config-item-type">${typeLabel}</div>`;
    item.innerHTML = headerHtml;

    if (isAgeField) {
      const ageConfig = normalizeAgeConfig(cfg.ageConfig);
      const agePanel = document.createElement('div');
      agePanel.className = 'spammerz-age-config';
      agePanel.innerHTML = `
        <div class="spammerz-name-detected-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span class="spammerz-name-detected-text">Auto-fill: <strong>Age Range</strong></span>
        </div>
        <div class="spammerz-age-range-row">
          <label>
            <span>From</span>
            <input type="number" class="spammerz-age-input" data-qidx="${qIdx}" data-age-field="min" min="0" max="130" value="${ageConfig.min}">
          </label>
          <label>
            <span>To</span>
            <input type="number" class="spammerz-age-input" data-qidx="${qIdx}" data-age-field="max" min="0" max="130" value="${ageConfig.max}">
          </label>
        </div>
      `;
      item.appendChild(agePanel);
    }

    if (isSmartField) {
      const smartPanel = document.createElement('div');
      smartPanel.className = 'spammerz-smart-config';
      smartPanel.innerHTML = createSmartSurveyConfigHtml(question, cfg, qIdx, smartBinding);
      item.appendChild(smartPanel);
    }

    // Add weight inputs for each option
    if (question.options.length > 0 || question.type === 'linear_scale') {
      const weightsList = document.createElement('div');
      weightsList.className = 'spammerz-weights-list';

      // Get options to show
      let options = [...question.options];
      if (isTypedQuestion && isSmartField && (smartBinding.fieldType === 'gender' || smartBinding.fieldType === 'sex')) {
        options = getConfiguredGenderOptions(cfg, smartBinding.fieldType);
        syncConfigValuesToOptions(cfg, options);
      }

      // For linear scale, generate options from scale range
      if (question.type === 'linear_scale') {
        const scaleMin = Number.isFinite(question.scaleMin) ? question.scaleMin : 1;
        const scaleMax = Number.isFinite(question.scaleMax) ? question.scaleMax : Math.max(scaleMin, 5);
        options = [];
        for (let i = scaleMin; i <= scaleMax; i++) {
          options.push(String(i));
        }
      }

      // Add header with randomize button for this question's weights
      const weightsHeader = document.createElement('div');
      weightsHeader.className = 'spammerz-weights-header-row';
      weightsHeader.innerHTML = `
        <button class="spammerz-icon-btn spammerz-random-question-btn" data-qidx="${qIdx}" type="button" title="Randomize weights for this question" ${options.length <= 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 3h5v5"/>
            <path d="M4 20L21 3"/>
            <path d="M21 16v5h-5"/>
            <path d="M15 15l6 6"/>
            <path d="M4 4l5 5"/>
          </svg>
        </button>
      </div>
      <div class="spammerz-weights-slider-area">
      `;
      weightsList.appendChild(weightsHeader);

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
               value="${cfg.values[0] || ''}" placeholder="${isAgeField || isSmartField ? 'Smart detection is active' : 'Custom answer text'}" ${isAgeField || isSmartField ? 'disabled' : ''}>
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

function getNameBindingDisplayLabel(binding, labels) {
  const label = labels[binding.fieldType] || binding.fieldType;
  if (binding.fieldType !== 'pattern') return label;
  return `${label}: ${getNamePatternExample(binding)}`;
}

function getNamePatternExample(binding) {
  return formatGeneratedNameForField({
    fullName: 'John Doe',
    firstName: 'John',
    middleName: 'Smith',
    lastName: 'Doe',
    mi: 'D.',
    extension: '',
  }, binding);
}

function getQuestionDisplayType(question, fallbackType) {
  if (isRatingQuestion(question)) return 'RATING';
  return getTypeName(fallbackType);
}

function isRatingQuestion(question) {
  if (!question || question.type !== 'linear_scale') return false;
  if (question.rawTypeInt === 18) return true;
  const title = String(question.title || '').toLowerCase();
  return /\b(rating|rate|score|satisfaction|satisfied|likert|stars?)\b/.test(title)
    && Number.isFinite(question.scaleMax)
    && question.scaleMax <= 5;
}

function getConfigurableOptionCount(question, cfg) {
  if (!question) return cfg?.values?.length || 0;
  if (question.type === 'linear_scale') {
    const scaleMin = Number.isFinite(question.scaleMin) ? question.scaleMin : 1;
    const scaleMax = Number.isFinite(question.scaleMax) ? question.scaleMax : Math.max(scaleMin, 5);
    return Math.max(0, scaleMax - scaleMin + 1);
  }
  if (question.options?.length) return question.options.length;
  return cfg?.values?.length || 0;
}

function detectAgeQuestion(question, idx = 0) {
  if (!question || !['short_text', 'paragraph'].includes(question.type)) return null;
  const title = normalizeNameTitle(question.title || '');
  if (/\b(age|edad|years?\s*old|how\s*old|your\s*age|applicant\s*age|student\s*age|respondent\s*age)\b/.test(title)) {
    return { questionIndex: idx, questionId: question.id, title: question.title, fieldType: 'age' };
  }
  return null;
}

function normalizeAgeConfig(config = {}) {
  const min = clampAge(Number.parseInt(config.min, 10), 18);
  const max = clampAge(Number.parseInt(config.max, 10), 30);
  return min <= max
    ? { enabled: config.enabled !== false, min, max }
    : { enabled: config.enabled !== false, min: max, max: min };
}

function clampAge(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(130, Math.max(0, value));
}

function generateAgeValue(config = {}) {
  const ageConfig = normalizeAgeConfig(config);
  if (ageConfig.enabled === false) return '';
  const span = ageConfig.max - ageConfig.min + 1;
  return String(ageConfig.min + Math.floor(Math.random() * span));
}

/**
 * Smart occupation/employment field detection
 * Uses context-aware matching to avoid false positives like "comments about work"
 */
function isLikelyOccupationField(title) {
  const t = title.toLowerCase();

  // Reject false positives - question patterns that mention work but aren't asking about occupation
  const falsePositivePatterns = [
    /^(how\s+do|do\s+you|any\s+)?(comments?|reflections?|thoughts?|opinions?|feedback|thoughts?|suggestions?|experiences?)\s+(about|on|regarding|concerning|relating\s+to)\b/i,
    /\bcomments?\s+(about|on|regarding|concerning|about\s+your)?\s*(work|job|employment)/i,
    /\b(work|job|employment)\s+(experience|life|balance|satisfaction)\b/i,
    /\bhow\s+(do\s+you|satisfied\s+are\s+you)\s+(find|like|feel)\s+(your|the)?\s*(work|job)/i,
    /\b(feedback|comments?|reflections?)\b/i,
    /\b(open\s*-|free\s*form|text|essay|textarea|describe)/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(t)) {
      // Check if there's a strong occupation indicator alongside the false positive
      if (/\b(occupation|profession|employer|job\s*title|what\s+is\s+your\s+(current\s+)?(job|occupation|position)|where\s+do\s+you\s+work)\b/i.test(t)) {
        continue; // Override false positive, this is a real occupation question
      }
      return false;
    }
  }

  // Strong occupation indicators ( standalone keywords )
  const strongOccupationKeywords = [
    /\boccupation\b/i,
    /\bprofession\b/i,
    /\bemployment\s*status\b/i,
    /\bcurrent\s+occupation\b/i,
    /\bprofessional\s+title\b/i,
    /\bjob\s+title\b/i,
    /\bworking\s+status\b/i,
    /\bemployed\s+(as|by|in|with)?\b/i,
    /\bemployee\s+status\b/i,
    /\btype\s+of\s+(work|employment|job)\b/i,
    /\bprimary\s+(occupation|work|profession)\b/i,
    /\bofficial\s+designation\b/i,
    /\bdesignation\b/i,
  ];

  for (const pattern of strongOccupationKeywords) {
    if (pattern.test(t)) return true;
  }

  // Medium strength - occupation keywords with context (avoiding standalone "work")
  const mediumOccupationKeywords = [
    /\bwhat\s+(is\s+your|do\s+you\s+do\s+for\s+a\s+living)\b/i, // "What is your [occupation]" or "What do you do for a living"
    /\byour\s+(current\s+)?(job|profession|position|role)\b/i, // "your current job/profession"
    /\bwhat\s+(do\s+you|is\s+your)\s+(do|do\s+for)\b/i, // "What do you do" (implying occupation)
    /\bemployer\b/i,
    /\bcompany\b/i,
    /\bindustry\b/i,
    /\bwork\s+(at|for|in)\s+(the\s+)?(company|employer|organization|firm|office)/i, // explicit work location
    /\bcurrently\s+(employed|work|doing)\b/i,
    /\bcurrent\s+(position|employment|profession|job)\b/i,
    /\bwhere\s+(do\s+you|does\s+the\s+.*\s+work)\b/i,
    /\bhow\s+(many\s+years\s+(of|at)|long\s+h)?(do\s+you|at\s+your)\s+(work|hold|have\s+you|been\s+working)/i,
    /\byears?\s+(of\s+)?(experience|service|employment)\b/i,
    /\byears?\s+in\s+(the\s+)?(field|industry|profession|role)\b/i,
  ];

  let mediumMatchCount = 0;
  for (const pattern of mediumOccupationKeywords) {
    if (pattern.test(t)) {
      mediumMatchCount++;
      if (mediumMatchCount >= 1) return true;
    }
  }

  return false;
}

/**
 * Smart gender/sex field detection
 */
function isLikelyGenderField(title) {
  const t = title.toLowerCase();

  // False positives to reject
  const falsePositivePatterns = [
    /\bhow\s+do\s+you\s+(identify|feel)\b/i,
    /\bwhich\s+gender\s+(is|belongs)\b/i,
    /\b(gender|sex)\s+(of\s+the\s+)?(participant|respondent|subject|person)\b/i,
    /\b(gender|sex)\s+between\b/i,
    /\b(gender|sex)\s+(distribution|breakdown|ratio)\b/i,
    /\band\s+gender\b/i,
    /\bgender\s+is\s+(important|relevant|required)\b/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(t)) {
      // If it also has "your" or direct question, it might be valid
      if (/\byour\b|\bare\s+you\b|\bselect\b|\bwhat\b.*\byour\b|\bplease\b.*\byour\b/i.test(t)) continue;
      return false;
    }
  }

  // Strong gender patterns
  if (/\b((what\s+is|please\s+(select|indicate|tell|choose)|select|choose|state|provide|enter)\s+(your\s+)?|your\s+)?gender\b/i.test(t)) return true;
  if (/\b((what\s+is|please\s+(select|indicate|tell|choose)|select|choose|state|provide|enter)\s+(your\s+)?|your\s+)?biological\s+sex\b/i.test(t)) return true;
  if (/\bbiological\s+sex\b/i.test(t)) return true;
  if (/\b(sex|gender)\s+(preference|choice)\b/i.test(t)) return true;

  return false;
}

/**
 * Smart email field detection
 */
function isLikelyEmailField(title) {
  const t = title.toLowerCase();

  // False positives - patterns that mention email but aren't asking for the user's email
  const falsePositivePatterns = [
    /supervisor'?s?\s+email/i,
    /\bemail\s+(will|must|should)\s+(be|you)/i,
    /\bwe\s+will\s+email\b/i,
    /\bemail\s+(confirmation|notification|verification)\b/i,
    /\bemail\s+will\s+be\s+used\b/i,
    /\bsomeone\s+else'?s?\s+email\b/i,
    /\bemail\s+address\s+\(optional\)/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(t)) {
      // Override if this is actually a direct question asking for user's email
      if (/\byour\s+(e?mail|e?mail\s*address)\b/i.test(t)) continue;
      if (/^\s*(what\s+is|please\s+(provide|enter|give))\s+(your\s+)?e?mail/i.test(t)) continue;
      return false;
    }
  }

  // Additional false positive - "email to contact/us" without "your"
  if (/email\s+(to\s+)?(contact|reach|us)/i.test(t) && !/\byour\b/i.test(t)) return false;

  // False positive: "your email for us/future updates" - but NOT if it's a direct question
  if (/your\s+email\s+(address\s+)?for\s+(us|future\s+updates|contact\s+purposes)/i.test(t) && !/^\s*(what\s+is|please\s+(provide|enter|give))/i.test(t)) return false;

  // Strong email patterns
  if (/\be-?mail\b/i.test(t)) {
    if (/\byour\b|\byours?\b|\bwhat\s+is\b|\bprovide\b|\bselect\b|\benter\b|\bcontact\b/i.test(t)) return true;
    // Email at start of question
    if (/\A\s*(what\s+(is\s+)?(your\s+)?e?mail|e?mail(\s*address)?\s*\?|e?mail\s+address\s*\z)/i.test(t)) return true;
  }

  return false;
}

/**
 * Smart phone number field detection
 */
function isLikelyPhoneField(title) {
  const t = title.toLowerCase();

  // False positives
  const falsePositivePatterns = [
    /\bphone\s+(of|for|to|number\s+of)\b/i,
    /\bemergency\s+contact.*phone\b/i,
    /\bsomeone\s+else.*phone\b/i,
    /\bphone\s+(will|must|should|can)\b/i,
    /\bphone\s+(us|call|reach)\b/i,
    /\bwe\s+will\s+call\b/i,
    /\bif\s+we.*phone\b/i,
    /\bphone\s+number\s+\(optional\)\b/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(t)) return false;
  }

  // Strong phone patterns
  if (/\b(contact\s*(number|no)|mobile\s*(number|no)?|phone\s*(number|no)?|cellphone|cell\s*number|telephone)\b/i.test(t)) {
    if (/\byour\b|\bprovide\b|\bselect\b|\bwhat\s+is\b|\bi\s+(can|could)\s+reach\b/i.test(t)) return true;
    // Just "Your phone number" or "Phone number"
    if (/^(what\s+is\s+)?your\s+(contact\s*)?(number|no|phone|telephone|mobile|cell)(\s*number)?\?$/i.test(t)) return true;
    return /\byour\b/i.test(t);
  }

  return false;
}

/**
 * Smart school/university field detection
 */
function isLikelySchoolField(title) {
  const t = title.toLowerCase();

  // False positives
  const falsePositivePatterns = [
    /\bschool\s+(of\s+)?(thought|medicine|law|business)\b/i,
    /\bschool\s+(fees|tuition|policy)\b/i,
    /\bschool\s+(calendar|schedule|hours)\b/i,
    /\byour\s+favorite\s+school\b/i,
    /\bschool\s+(trip|tour|visit)\b/i,
    /\bwhich\s+school\s+does\b/i,
    /\bhigh\s+school\s+(diploma|graduate|graduation)\b/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(t)) return false;
  }

  // Strong school patterns
  if (/\b(school|university|college|campus|institution)\b/i.test(t)) {
    // With possessive or question indicators
    if (/\byour\b|\battend\b|\benrolled\b|\bschool\s+where\b|\bat\b|\bwhich\b|\bwhat\b/i.test(t)) return true;
    // Standalone patterns
    if (/^what\s+(is\s+)?your\s+(school|enrollment)\b/i.test(t)) return true;
    if (/\bname\s+of\s+(your\s+)?(school|university|college)\b/i.test(t)) return true;
    if (/\bcurrent\s+(school|enrollment|college|university)\b/i.test(t)) return true;
    if (/\bwhere\s+do\s+you\s+(go\s+to|attend)\b/i.test(t)) return true;
  }

  return false;
}

/**
 * Smart course/program field detection
 */
function isLikelyCourseField(title) {
  const t = title.toLowerCase();

  // False positives
  const falsePositivePatterns = [
    /\bcourse\s+(of\s+)?(action|study|treatment|events?|this\s+survey)\b/i,
    /\bcourse\s+(will|can|should|must|to)\b/i,
    /\bcourse\s+(fee|record|schedule)\b/i,
    /\boverall\s+course\b/i,
    /\bhow\s+(was|did)\s+(you\s+)?(enjoy|like)\s+the\s+course\b/i,
    /\bcourse\s+(evaluation|feedback|review)\b/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(t)) return false;
  }

  // Strong course patterns
  if (/\b(course|program|degree|strand|track)\b/i.test(t)) {
    if (/\byour\b|\benrolled\b|\bmajor\b|\bminor\b|\bstudying\b|\bwhich\b|\bwhat\b|\bwhere\b/i.test(t)) return true;
    if (/\bcourse\s+(of\s+)?(stud|major|program)\b/i.test(t)) return true;
    if (/\bwhat\s+(are\s+you\s+studying|is\s+your\s+(stud|course))\b/i.test(t)) return true;
    if (/\bmajor\s+in\b/i.test(t)) return true;
    if (/\bprogram\s+of\s+study\b/i.test(t)) return true;
  }

  return false;
}

/**
 * Smart year/grade level field detection
 */
function isLikelyYearLevelField(title) {
  const t = title.toLowerCase();

  // False positives
  const falsePositivePatterns = [
    /\byear\s+(to\s+date|in\s+review)\b/i,
    /\bthis\s+year\s+(we\s+will|you\s+can)\b/i,
    /\byear\s+(of|for)\s+(experience|service)\b/i,
    /\bsince\s+(what|last)\s+year\b/i,
    /\byear\s+(end|start|close)\b/i,
    /\byear\s+you\s+(graduate|graduated|started)\b/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(t)) return false;
  }

  // Strong year level patterns
  if (/\b(year\s*level|grade\s*level|academic\s*year|section|year\s+of\s+study)\b/i.test(t)) return true;
  if (/\b(what|which)\s+(year|grade)\s+(are\s+you|level)\b/i.test(t)) return true;
  if (/\byour\s+(current\s+)?(year|grade)\b/i.test(t)) return true;
  if (/\b(1st|2nd|3rd|4th|5th|6th|first|second|third|fourth|fifth|sixth)\s*(year|grade)\b/i.test(t)) return true;
  if (/\b(bs|ba|ma|ms|phd|mba)\s*(year|student)?\b/i.test(t)) return true;
  if (/\byear\s+(one|two|three|four|five|six)\b/i.test(t)) return true;

  return false;
}

/**
 * Smart religion field detection
 */
function isLikelyReligionField(title) {
  const t = title.toLowerCase();

  // False positives
  const falsePositivePatterns = [
    /\breligion\s+(of\s+the\s+)?(country|area|nation)\b/i,
    /\byour\s+religion\s+(affects|influences|relates)\b/i,
    /\bhow\s+does\s+religion\b/i,
    /\breligion\s+(and\s+)?(politics|beliefs?|cultural)\b/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(t)) return false;
  }

  // Strong religion patterns
  if (/\breligion\b/i.test(t)) {
    if (/\byour\b|\bwhat\b|\bwhich\b|\bplease\b|\bselect\b|\bidentify\b/i.test(t)) return true;
    if (/\byou\s+(belong|follow|practice|identify)\b/i.test(t)) return true;
    if (/\breligious\s+(affiliation|belief|preference)\b/i.test(t)) return true;
  }
  if (/\bfaith\b/i.test(t) && /\b(what|which|your)\b/i.test(t)) return true;
  if (/\bchurch\b/i.test(t) && /\battend\b/i.test(t)) return true;

  return false;
}

/**
 * Smart household size field detection
 */
function isLikelyHouseholdSizeField(title) {
  const t = title.toLowerCase();

  // False positives - be strict about "household" matching
  if (/\bhousehold\s+(income|expenses|items|budget|cost|spending)\b/i.test(t)) return false;

  // Strong household size patterns
  if (/\b(household\s*size)\b/i.test(t)) return true;
  if (/\bnumber\s+of\s+(family|household)\s+members\b/i.test(t)) return true;
  if (/\bfamily\s+members\b/i.test(t) && /\bhow\s+many\b/i.test(t)) return true;
  if (/\bhow\s+many\s+(people|members)\s+(live\s+in|in|are\s+in)\b.*\b(family|household|home)\b/i.test(t)) return true;
  if (/\b(family|household)\s+size\b/i.test(t)) return true;
  if (/\bnumber\s+of\s+(people|persons)\s+(in\s+)?(your\s+)?(family|household)\b/i.test(t)) return true;
  if (/\byour\s+(family|household)\s+consists?\b/i.test(t)) return true;
  if (/\bhow\s+many\s+people\s+(in\s+)?your\s+(family|household|home)\b/i.test(t)) return true;

  return false;
}

/**
 * Smart consent/agreement field detection
 */
function isLikelyConsentField(title) {
  const t = title.toLowerCase();

  // Strong consent patterns at the start or with question markers
  if (/\b(i\s+agree|consent|data\s+privacy|terms\s+and\s+conditions|privacy\s+policy|agree\s+to\s+participate)\b/i.test(t)) return true;
  if (/\bcheckbox\s+to\s+confirm\b/i.test(t)) return true;
  if (/\bby\s+(checking|clicking|submitting)\b.*\byou\s+agree\b/i.test(t)) return true;
  if (/\bi\s+(consent|agree|accept)\b/i.test(t)) return true;
  if (/\bdo\s+you\s+agree\b/i.test(t) || /\bagreement\s+to\b/i.test(t)) return true;

  return false;
}

/**
 * Smart nationality field detection
 */
function isLikelyNationalityField(title) {
  const t = title.toLowerCase();

  // False positives
  const falsePositivePatterns = [
    /\bnationality\s+(of\s+the\s+)?(company|organization|product)\b/i,
    /\bwhat\s+is\s+the\s+your\b.*\bnationality\b/i,
    /\bnationality\s+(and\s+)?(preference|choice)\b/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(t)) return false;
  }

  // Strong nationality patterns
  if (/\b(nationality|citizenship)\b/i.test(t)) {
    if (/\byour\b|\bwhat\b|\bwhich\b|\bplease\b|\bselect\b|\bidentify\b/i.test(t)) return true;
    if (/\byou\s+(hold|have|are)\b.*\b(citizen|national)\b/i.test(t)) return true;
  }
  if (/\bcountry\s+of\s+(birth|citizenship|origin)\b/i.test(t)) return true;
  if (/\bwhat\s+is\s+your\s+(nationality|citizenship)\b/i.test(t)) return true;
  if (/\bwhich\s+(country|nation)\s+(are\s+you|from|do\s+you\s+belong)\b/i.test(t)) return true;

  return false;
}

/**
 * Smart ethnicity field detection
 */
function isLikelyEthnicityField(title) {
  const t = title.toLowerCase();

  // False positives for ethnicity - be specific
  if (/\betchnic\s+(origin|background)\b/i.test(t) && !/^\s*what\b/i.test(t)) return false;
  if (/\byour\s+etchnic\s+(background)\b/i.test(t) && /^\s*what\b/i.test(t)) return true;

  // Strong ethnicity patterns
  if (/\b(ethnic\s*(origin|ity)|ethnicity)\b/i.test(t)) return true;
  if (/\brace\s+(of\s+)?(the\s+)?participant\b/i.test(t)) return true;
  if (/\bwhat\s+is\s+your\s+(racial|ethnic)\b/i.test(t)) return true;
  if (/\brace\s+or\s+ethnicity\b/i.test(t)) return true;
  if (/\brare\s+you\b.*\b ethnicity\b/i.test(t)) return true;
  if (/\bhow\s+would\s+you\s+describe\s+your\s+(etchnic|racial)\b/i.test(t)) return true;

  return false;
}

/**
 * Smart ancestry field detection
 */
function isLikelyAncestryField(title) {
  const t = title.toLowerCase();

  // Strong ancestry patterns
  if (/\b(ancestry|ancestral|ancestors|heritage|lineage)\b/i.test(t)) {
    if (/\byour\b|\bwhat\b|\bwhich\b|\bplease\b|\bdescribe\b/i.test(t)) return true;
    if (/\bwhere\s+do\s+your\s+(ancestors?|family)\s+come\s+from\b/i.test(t)) return true;
    if (/^\s*what\s+is\s+your\s+(ancestry|heritage)\b/i.test(t)) return true;
  }

  return false;
}

/**
 * Smart birthdate field detection (more specific than date)
 */
function isLikelyBirthdateField(title) {
  const t = title.toLowerCase();

  if (/\b(birthday|birthdate|birth\s*date|date\s*of\s*birth|dob)\b/i.test(t)) return true;
  if (/\bwhen\s+(were\s+you|is\s+your)\s+born\b/i.test(t)) return true;
  if (/\byour\s+date\s+of\s+birth\b/i.test(t)) return true;

  return false;
}

/**
 * Smart generic date field detection
 */
function isLikelyDateField(title) {
  const t = title.toLowerCase();

  // False positives - specific date contexts that are for internal use
  const falsePositivePatterns = [
    /\bsurvey\s+(completion|submission)\s*date\b/i,
    /\bform\s*date\b/i,
    /\bsubmission\s*date\b/i,
    /\bwhen\s+did\s+you\s+(submit|complete|finish|take)\b/i,
    /\byyyy-mm-dd\b/i,
  ];

  for (const pattern of falsePositivePatterns) {
    if (pattern.test(t)) return false;
  }

  // Strong date patterns (but not birthday - that's checked separately)
  if (!/\b(birth|when\s+were\s+you|born)\b/i.test(t)) {
    if (/\byour\s+date\b/i.test(t)) return /\b(of\s+)?(event|occurrence|appointment|schedule|visit|test|exam|meeting|interview|start|end)\b/i.test(t);
    if (/^\s*what\s+date\b/i.test(t)) return true;
    if (/\bwhat\s+(is\s+)?the\s+date\b/i.test(t)) return true;
    if (/\bselect\s+(a|the)\s+date\b/i.test(t)) return true;
  }

  return false;
}

function detectSmartSurveyQuestion(question, idx = 0) {
  if (!question) return null;
  const title = normalizeNameTitle(question.title || '');
  const base = { questionIndex: idx, questionId: question.id, title: question.title };
  if (!isSmartTextQuestion(question) && question.type !== 'date') return null;

  // Use smart context-aware detection functions
  if (question.type === 'date') {
    if (isLikelyBirthdateField(title)) return { ...base, fieldType: 'birthdate' };
    return { ...base, fieldType: 'date' };
  }

  if (isLikelyGenderField(title)) return { ...base, fieldType: /\bsex\b/.test(title) && !/\bgender\b/.test(title) ? 'sex' : 'gender' };
  if (isLikelyEmailField(title)) return { ...base, fieldType: 'email' };
  if (isLikelyPhoneField(title)) return { ...base, fieldType: 'phone' };
  if (isLikelyBirthdateField(title)) return { ...base, fieldType: 'birthdate' };
  if (isLikelyDateField(title)) return { ...base, fieldType: 'date' };
  if (isLikelySchoolField(title)) return { ...base, fieldType: 'school' };
  if (isLikelyCourseField(title)) return { ...base, fieldType: 'course' };
  if (isLikelyYearLevelField(title)) return { ...base, fieldType: 'yearLevel' };
  if (isLikelyOccupationField(title)) return { ...base, fieldType: 'occupation' };
  if (isLikelyReligionField(title)) return { ...base, fieldType: 'religion' };
  if (isLikelyHouseholdSizeField(title)) return { ...base, fieldType: 'householdSize' };
  if (isLikelyConsentField(title)) return { ...base, fieldType: 'consent' };
  if (isLikelyNationalityField(title)) return { ...base, fieldType: 'nationality' };
  if (isLikelyEthnicityField(title)) return { ...base, fieldType: 'ethnicity' };
  if (isLikelyAncestryField(title)) return { ...base, fieldType: 'ancestry' };

  return null;
}

function createSmartSurveyConfigHtml(question, cfg, qIdx, binding) {
  const label = getSmartSurveyFieldLabel(binding.fieldType);
  if (binding.fieldType === 'gender' || binding.fieldType === 'sex') {
    const options = getConfiguredGenderOptions(cfg, binding.fieldType);
    const pool = binding.fieldType === 'sex'
      ? ['Male', 'Female']
      : ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
    return `
      <div class="spammerz-name-detected-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span class="spammerz-name-detected-text">Auto-fill: <strong>${escHtml(label)}</strong></span>
      </div>
      <div class="spammerz-smart-card-grid">
        <button type="button" class="spammerz-smart-chip" data-qidx="${qIdx}" data-smart-field="genderAll">All</button>
        ${pool.map(option => `
          <label class="spammerz-smart-chip ${options.includes(option) ? 'active' : ''}">
            <input type="checkbox" class="spammerz-smart-gender-option" data-qidx="${qIdx}" value="${escHtml(option)}" ${options.includes(option) ? 'checked' : ''}>
            <span>${escHtml(option)}</span>
          </label>
        `).join('')}
      </div>
    `;
  }

  if (binding.fieldType === 'householdSize') {
    const range = normalizeHouseholdConfig(cfg.householdConfig);
    return `
      <div class="spammerz-name-detected-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span class="spammerz-name-detected-text">Auto-fill: <strong>${escHtml(label)}</strong></span>
      </div>
      <div class="spammerz-age-range-row">
        <label><span>From</span><input type="number" class="spammerz-household-input" data-qidx="${qIdx}" data-household-field="min" min="1" max="30" value="${range.min}"></label>
        <label><span>To</span><input type="number" class="spammerz-household-input" data-qidx="${qIdx}" data-household-field="max" min="1" max="30" value="${range.max}"></label>
      </div>
    `;
  }

  return `
    <div class="spammerz-name-detected-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span class="spammerz-name-detected-text">Auto-fill: <strong>${escHtml(label)}</strong></span>
    </div>
  `;
}

function getSmartSurveyFieldLabel(fieldType) {
  const labels = {
    gender: 'Gender',
    sex: 'Sex',
    email: 'Email',
    phone: 'Phone Number',
    birthdate: 'Birthdate',
    date: 'Date',
    school: 'School / University',
    course: 'Course / Program / Strand',
    yearLevel: 'Year / Grade Level',
    occupation: 'Occupation / Employment',
    religion: 'Religion',
    householdSize: 'Household Size',
    consent: 'Consent / Eligibility',
    nationality: 'Nationality',
    ethnicity: 'Ethnicity',
    ancestry: 'Ancestry / Origin',
  };
  return labels[fieldType] || fieldType;
}

function getConfiguredGenderOptions(cfg, fieldType = 'gender') {
  const fallback = fieldType === 'sex' ? ['Male', 'Female'] : ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
  const options = cfg.smartConfig?.genderOptions;
  return Array.isArray(options) && options.length ? options : fallback;
}

function syncConfigValuesToOptions(cfg, options) {
  const nextValues = options.length ? [...options] : ['Male', 'Female'];
  const oldWeightsByValue = new Map((cfg.values || []).map((value, idx) => [value, cfg.weights?.[idx] || 0]));
  cfg.values = nextValues;
  cfg.weights = nextValues.map(value => oldWeightsByValue.get(value) || Math.floor(100 / nextValues.length));
  const total = cfg.weights.reduce((sum, weight) => sum + weight, 0);
  if (cfg.weights.length && total !== 100) {
    cfg.weights[cfg.weights.length - 1] += 100 - total;
  }
  cfg.randomize = nextValues.length > 1;
  cfg.mode = 'weighted';
}

function normalizeHouseholdConfig(config = {}) {
  const min = Math.min(30, Math.max(1, Number.parseInt(config.min, 10) || 1));
  const max = Math.min(30, Math.max(1, Number.parseInt(config.max, 10) || 8));
  return min <= max ? { min, max } : { min: max, max: min };
}

function createRandomWeights(count) {
  if (count <= 0) return [];
  if (count === 1) return [100];

  const raw = Array.from({ length: count }, () => Math.random());
  const rawTotal = raw.reduce((sum, value) => sum + value, 0) || 1;
  const weights = raw.map(value => Math.floor((value / rawTotal) * 100));
  let remainder = 100 - weights.reduce((sum, value) => sum + value, 0);

  while (remainder > 0) {
    weights[Math.floor(Math.random() * weights.length)] += 1;
    remainder--;
  }

  return weights;
}

/**
 * Detect name-related questions from form questions
 * More specific patterns checked first to avoid false matches
 */
function detectNameQuestions(questions) {
  const detected = [];

  questions.forEach((q, idx) => {
    const rawTitle = q.title || '';
    const title = normalizeNameTitle(rawTitle);
    const base = {
      questionIndex: idx,
      questionId: q.id,
      title: q.title,
      uppercase: shouldUppercaseNameOutput(rawTitle),
    };
    if (!isSmartTextQuestion(q)) return;
    if (isSchoolNameTitle(title)) return;

    const pattern = detectNamePattern(rawTitle);
    if (pattern) {
      detected.push({ ...base, fieldType: 'pattern', pattern });
      return;
    }

    if (/\bfirst\s*name\b/.test(title) || /\bgiven\s*name\b/.test(title)) {
      detected.push({ ...base, fieldType: 'firstname' });
    } else if (/\bmiddle\s*name\b/.test(title)) {
      detected.push({ ...base, fieldType: 'middlename' });
    } else if (/\blast\s*name\b/.test(title) || /\bsurnames?\b/.test(title) || /\bfamily\s*name\b/.test(title) || /\bmaiden\s*name\b/.test(title)) {
      detected.push({ ...base, fieldType: 'lastname' });
    } else if (isPersonNameTitle(title)) {
      detected.push({ ...base, fieldType: 'fullname' });
    } else if (/\bm\.?i\.?\b/.test(title) || /\bmiddle\s*initial\b/.test(title)) {
      detected.push({ ...base, fieldType: 'mi' });
    } else if (/\bext(ension)?\b/.test(title) || /\bsuffix\b/.test(title)) {
      detected.push({ ...base, fieldType: 'extension' });
    }
  });

  return detected;
}

function normalizeNameTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/^[0-9]+\.\s*/, '')  // strip leading "1. ", "2. " etc.
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldUppercaseNameOutput(title) {
  const letters = String(title || '').match(/[A-Za-z]/g);
  if (!letters || letters.length === 0) return false;
  return !/[a-z]/.test(title) && /[A-Z]/.test(title);
}

function isRelationshipNameTitle(title) {
  const hasRelationship = /\b(parents?|guardians?|mothers?|fathers?|moms?|dads?)\b/.test(title);
  const hasName = /\bname\b/.test(title);
  return hasRelationship && hasName;
}

function detectNamePattern(title) {
  const parts = String(title || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => detectNamePart(part));

  if (parts.length < 2 || parts.some(part => !part)) return null;
  if (!parts.includes('first') || !parts.includes('last')) return null;

  const separator = parts[0] === 'last' ? ', ' : ' ';
  return { parts, separator };
}

function detectNamePart(part) {
  const title = normalizeNameTitle(part);
  if (/\bm\.?i\.?\b/.test(title) || /\bmiddle\s*initial\b/.test(title)) return 'mi';
  if (/\bmiddle\s*names?\b/.test(title)) return 'middle';
  if (/\bfirst\s*names?\b/.test(title) || /\bgiven\s*names?\b/.test(title)) return 'first';
  if (/\blast\s*names?\b/.test(title) || /\bsurnames?\b/.test(title) || /\bfamily\s*names?\b/.test(title) || /\bmaiden\s*names?\b/.test(title)) return 'last';
  return null;
}

function detectAddressQuestions(questions) {
  const detected = [];
  questions.forEach((q, idx) => {
    const title = normalizeNameTitle(q.title || '');
    const rawTitle = q.title || '';
    const titleLower = title.toLowerCase();
    const base = { questionIndex: idx, questionId: q.id, title: rawTitle };

    // Country - but NOT nationality/birth questions
    if (/\b(country|nation)\b/.test(title) && !isAddressFieldContext(title, 'country')) {
      // Only detect if it looks like address context
      if (/\byour\b|\bwhat\b.*\bcountry\b|\bwhich\s+country\b|\bcurrent\b|\bliving\s+in\b/i.test(title)) {
        detected.push({ ...base, fieldType: 'country' });
      }
    }
    // Postal/ZIP code
    else if (/\b(zip|postal|postcode|post\s*code|pin)\s*(code)?\b|\bpincode\b/.test(title)) {
      if (/\byour\b|\bwhat\b.*\bzip\b|\bwhich\b.*\bzip\b|\byour\s+location\b/i.test(title)) {
        detected.push({ ...base, fieldType: 'postalCode' });
      }
    }
    // Barangay
    else if (/\bbarangay\b|\bbrgy\b/.test(title)) {
      detected.push({ ...base, fieldType: 'barangay' });
    }
    // Ward/District
    else if (/\b(ward|ku|district)\b/.test(title)) {
      detected.push({ ...base, fieldType: 'ward' });
    }
    // Address Line 2
    else if (/\b(address\s*line\s*2|address\s*2|line\s*2|addr\s*2)\b|\b(unit|suite|apartment|apt|floor|building|village|subdivision)\b/.test(title)) {
      detected.push({ ...base, fieldType: 'addressLine2' });
    }
    // Address Line 1
    else if (/\b(address\s*line\s*1|address\s*1|line\s*1|addr\s*1)\b/.test(title)) {
      detected.push({ ...base, fieldType: 'addressLine1' });
    }
    // County/Borough
    else if (/\b(county|borough)\b/.test(title)) {
      detected.push({ ...base, fieldType: 'county' });
    }
    // City - but NOT favorite/dream/city of birth
    else if (/\b(city|municipality|town|suburb|locality)\b/.test(title)) {
      if (!/\b(favorite|favourite|favorite|dream|ideal|best|preferred)\s+(city|town)\b/i.test(titleLower)) {
        if (/\byour\b|\bwhat\b.*\bcity\b|\bwhich\s+city\b|\bcity\b.*\byour\b/i.test(title)) {
          detected.push({ ...base, fieldType: 'city' });
        }
      }
    }
    // Region
    else if (/\bregion\b/.test(title) && !/\b(province|state)\b/.test(title)) {
      if (/\byour\b|\bwhat\b.*\bregion\b/i.test(title)) {
        detected.push({ ...base, fieldType: 'region' });
      }
    }
    // Province/State
    else if (/\b(province|state|territory|prefecture|emirate)\b/.test(title)) {
      detected.push({ ...base, fieldType: 'state' });
    }
    // Street
    else if (/\b(street|house|lot|block|blk|street\s*number|street\s*name)\b/.test(title)) {
      if (/\byour\b|\bwhat\b.*\bstreet\b|\bwhich\s+street\b/i.test(title)) {
        detected.push({ ...base, fieldType: 'addressLine1' });
      }
    }
    // Full address
    else if (isSmartTextQuestion(q) && isFullAddressTitle(title)) {
      detected.push({ ...base, fieldType: 'fullAddress' });
    }
  });
  return detected;
}

/**
 * Check if title is about address context vs other contexts (nationality, preference, etc)
 */
function isAddressFieldContext(title, fieldType) {
  const t = title.toLowerCase();

  // Common false positive patterns for address fields
  const falsePositivePatterns = {
    country: [
      /\bcountry\s+of\s+(birth|citizenship|origin|nationality|residency)\b/i,
      /\band\s+country\b/i,
      /\bcountry\s+(and|or)\s+/i,
      /\bwhat\s+(country|is)\b.*\b(from|born|nationality|citizen)\b/i,
      /\bfavorite\s+country\b/i,
      /\bdream\s+country\b/i,
    ],
    city: [
      /\bfavorite\s+(city|town)\b/i,
      /\bfavourite\s+(city|town)\b/i,
      /\bdream\s+(city|town)\b/i,
      /\bideal\s+(city|town)\b/i,
      /\bcity\s+of\s+(birth|origin|dreams)\b/i,
      /\band\s+city\b/i,
    ],
    zip: [
      /\bzip\s+code\s+of\s+(the\s+)?(area|this\s+area|location)\b/i,
    ],
  };

  const patterns = falsePositivePatterns[fieldType] || [];
  for (const pattern of patterns) {
    if (pattern.test(t)) return true; // true = is false positive
  }

  return false;
}

function isFullAddressTitle(title) {
  const t = title.toLowerCase();

  // False positives - address mentions that aren't asking for user's address
  // Check for these patterns first
  if (/\bcountry\s+of\s+(birth|citizenship|origin|residence)\b/i.test(t)) return false;
  if (/\b(business|company|employer|work|office)\s+address\b/i.test(t) && !/\byour\b/i.test(t)) return false;

  // Strong address patterns
  if (/\b(address|adress|location|residence|residency|residential|domicile|dwelling|place)\b/i.test(t)) {
    if (/\byour\b|\bmy\b|\bcurrent\b|\bpresent\b|\bpermanent\b|\bshipping\b|\bbilling\b/i.test(t)) return true;
    if (/^\s*(what\s+is|please\s+provide|enter|give)\s+(your\s+)?(current\s+)?(address|location)/i.test(t)) return true;
    return /\bcurrent\s+address\b|\bhome\s+address\b|\bshipping\s+address\b|\bbilling\s+address\b/i.test(t);
  }

  if (/\b(place\s+of\s+(residence|residency|living)|where\s+(do\s+(you|they)\s+)?(currently\s+)?(live|reside|lived|residing)|where\s+are\s+you\s+located|here\s+do\s+you\s+live)\b/.test(t)) {
    return /\byour\b|\btheir\b|\bour\b|\bhis\b|\bher\b|\bthe\b/i.test(t) || !/^\s*(what\s+is\s+)?the\b/.test(t);
  }

  return false;
}

function isSmartTextQuestion(question) {
  if (!question) return false;
  return ['short_text', 'paragraph'].includes(question.type);
}

function isSchoolNameTitle(title) {
  const t = title.toLowerCase();

  // False positives - school mentions that aren't asking for user's school
  const falsePositives = [
    /\bschool\s+(of\s+)?(thought|medicine|law|business|engineering|arts)\b/i,
    /\bhigh\s+school\s+(diploma|graduate|graduation|certificate)\b/i,
    /\bschool\s+(fees|tuition|policy|calendar)\b/i,
    /\bwhich\s+school\s+(does|would)\b/i,
  ];

  for (const pattern of falsePositives) {
    if (pattern.test(t)) return true; // Return true to EXCLUDE from name detection
  }

  // Strong school patterns
  if (/\b(school|university|college|campus|institution)\b/i.test(t)) {
    if (/\byour\b|\battend\b|\benrolled\b|\bwhere\b|\bwhich\b|\bwhat\b/i.test(t)) return true;
    if (/\bname\s+of\s+(your\s+)?(school|university|college)\b/i.test(t)) return true;
    return false; // Don't match without context
  }

  return false;
}

function isPersonNameTitle(title) {
  const t = title.toLowerCase();

  // False positives - "name" mentions that aren't person's name
  if (/^\s*(what\s+is\s+)?(your|the)?\s*(company|business|employer|organization|organisation|office)\s+name\b/i.test(t)) return false;
  if (/^\s*(product|item|service|brand|course|program|department|team|group|project|event|survey|study|file|image|video|account|username|login)\s+name\b/i.test(t)) return false;
  if (/\bname\s+of\s+(the\s+)?(company|business|employer|organization|organisation|product|service|brand|school|university|department|team|project|event|survey|study|file)\b/i.test(t)) return false;
  if (/^\s*file\s+name\b/i.test(t)) return false;
  if (/^\s*network\s+name\b/i.test(t)) return false;
  if (/^\s*account\s+name\b/i.test(t)) return false;
  if (/^\s*user(name)?\s*name\b/i.test(t)) return false;
  if (/^\s*login\s+name\b/i.test(t)) return false;
  if (/\bname\s+(and\s+email|phone|address)\b/i.test(t) && !/\byour\b/i.test(t)) return false;
  if (/\bname\s+of\s+(the\s+)?(respondent|participant|person)\s*$/i.test(t) && !/\byour\b/i.test(t)) return false;

  // Strong name patterns
  if (/\b(first|last|middle|full|complete)\s*name\b/.test(t)) return true;
  if (/\byour\s+name\b|\bparticipant\s+name\b|\byour\s+(full\s+)?name\b/i.test(t)) return true;
  if (/\bmy\s+name\b/i.test(t)) return true;
  if (t === 'name' || t === 'your name' || t === 'full name') return true;
  if (/^name(\s+[$(]|$)|[\(\[]name[\]\)]$/i.test(t)) return true;
  if (isRelationshipNameTitle(t)) return true;

  // "Name of" with possessive - but exclude non-person entities
  if (/\bname\s+of\b/.test(t)) {
    // Allow if it has person's possessive or direct question for your name
    if (/\byour\b|\bmy\b|\bour\b|\bhis\b|\bher\b|\bthe\s+participant\b|\bthe\s+respondent\b/i.test(t)) return true;
    // Reject if it has any organizational entity
    if (/\b(university|school|college|institution|company|organization|organisation|department|office|agency|program|course|section|club|group|event|project|study|survey|product|brand|service|file|account)\b/i.test(t)) return false;
    // Reject bare "name of..."
    if (/^\s*name\s+of\s+/i.test(t) && !/\b(who|whom|person|individuals?)\b/i.test(t)) return false;
    return true;
  }

  return false;
}

function getAddressFieldLabel(fieldType) {
  const labels = {
    fullAddress: 'Full Address',
    addressLine1: 'Address Line 1',
    addressLine2: 'Address Line 2',
    street: 'Street Address',
    barangay: 'Barangay',
    ward: 'Ward / District',
    chome: 'Chome / Block',
    city: 'City / Municipality',
    county: 'County / District',
    state: 'State / Province / Region',
    province: 'Province',
    prefecture: 'Prefecture',
    region: 'Region',
    suburb: 'Suburb',
    town: 'Town',
    postalCode: 'Postal / ZIP Code',
    zip: 'ZIP Code',
    country: 'Country',
  };
  return labels[fieldType] || fieldType;
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

  // Use the full selected entry exactly as configured.
  const usedFirst = firstName;

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

function formatGeneratedNameForField(generatedName, binding) {
  const valueByPart = {
    fullname: generatedName.fullName,
    firstname: generatedName.firstName,
    first: generatedName.firstName,
    middlename: generatedName.middleName,
    middle: generatedName.middleName,
    lastname: generatedName.lastName,
    last: generatedName.lastName,
    mi: generatedName.mi,
    extension: generatedName.extension,
  };

  let value = '';
  if (binding.fieldType === 'pattern' && binding.pattern?.parts?.length) {
    value = binding.pattern.parts
      .map(part => valueByPart[part])
      .filter(Boolean)
      .join(binding.pattern.separator || ' ');
  } else {
    value = valueByPart[binding.fieldType] || generatedName.fullName;
  }

  return binding.uppercase ? value.toUpperCase() : value;
}

const ADDRESS_PROFILES = {
  PH: {
    country: 'Philippines',
    regionField: 'province',
    localityField: 'city',
    dependentField: 'barangay',
    dependentSource: 'barangays',
    components: ['addressLine1', 'addressLine2', 'barangay', 'city', 'province', 'region', 'postalCode', 'country'],
    streetNames: ['Rizal Street', 'Mabini Street', 'Bonifacio Avenue', 'Mango Avenue', 'Osmena Boulevard', 'Quezon Street'],
    regions: {
      Cebu: {
        regionName: 'Region VII - Central Visayas',
        localities: {
          'Cebu City': { postalCode: '6000', barangays: ['Lahug', 'Mabolo', 'Guadalupe', 'Talamban', 'Capitol Site'] },
          'Mandaue City': { postalCode: '6014', barangays: ['Tipolo', 'Subangdaku', 'Banilad', 'Centro', 'Paknaan'] },
          'Lapu-Lapu City': { postalCode: '6015', barangays: ['Pajo', 'Maribago', 'Basak', 'Mactan', 'Punta Engano'] },
          'Toledo City': { postalCode: '6038', barangays: ['Poblacion', 'Bato', 'Ilihan', 'Luray II', 'Matab-ang'] },
          Barili: { postalCode: '6036', barangays: ['Poblacion', 'Sayaw', 'Mantayupan', 'Azucena', 'Nangka'] },
          Balamban: { postalCode: '6041', barangays: ['Biasong', 'Aliwanay', 'Buanoy', 'Arpili', 'Cantibas'] },
          Argao: { postalCode: '6021', barangays: ['Poblacion', 'Talaga', 'Canbanua', 'Langtad', 'Tulic'] },
        },
      },
      Davao: {
        regionName: 'Region XI - Davao Region',
        localities: {
          'Davao City': { postalCode: '8000', barangays: ['Buhangin', 'Matina', 'Talomo', 'Poblacion', 'Agdao'] },
          'Digos City': { postalCode: '8002', barangays: ['Aplaya', 'Dawis', 'Tres de Mayo', 'Zone 1', 'San Jose'] },
          'Tagum City': { postalCode: '8100', barangays: ['Apokon', 'Magugpo Poblacion', 'Mankilam', 'Visayan Village', 'La Filipina'] },
        },
      },
      Bohol: {
        regionName: 'Region VII - Central Visayas',
        localities: {
          'Tagbilaran City': { postalCode: '6300', barangays: ['Bool', 'Cogon', 'Dao', 'Mansasa', 'Poblacion II'] },
          'Panglao': { postalCode: '6340', barangays: ['Danao', 'Tawala', 'Doljo', 'Poblacion', 'Libaong'] },
          'Talibon': { postalCode: '6325', barangays: ['Poblacion', 'San Jose', 'San Isidro', 'Tanghaligue', 'Zamora'] },
        },
      },
      'Metro Manila': {
        regionName: 'National Capital Region',
        localities: {
          Manila: { postalCode: '1000', barangays: ['Ermita', 'Malate', 'Paco', 'Sampaloc', 'Tondo'] },
          'Quezon City': { postalCode: '1100', barangays: ['Batasan Hills', 'Commonwealth', 'Diliman', 'Novaliches', 'Project 6'] },
          Makati: { postalCode: '1200', barangays: ['Bel-Air', 'Poblacion', 'San Lorenzo', 'Guadalupe Nuevo', 'Forbes Park'] },
          Taguig: { postalCode: '1630', barangays: ['Fort Bonifacio', 'Ususan', 'Pinagsama', 'Western Bicutan', 'Tuktukan'] },
        },
      },
      Cavite: {
        regionName: 'Region IV-A - CALABARZON',
        localities: {
          'Cavite City': { postalCode: '4100', barangays: ['San Roque', 'Caridad', 'Santa Cruz', 'Dalahican', 'Barangay 10'] },
          Dasmarinas: { postalCode: '4114', barangays: ['Salawag', 'Paliparan', 'Sampaloc', 'San Agustin', 'Burol'] },
          Tagaytay: { postalCode: '4120', barangays: ['Mendez Crossing East', 'Silang Junction South', 'Kaybagal South', 'Maharlika East'] },
        },
      },
      Laguna: {
        regionName: 'Region IV-A - CALABARZON',
        localities: {
          'Santa Rosa': { postalCode: '4026', barangays: ['Balibago', 'Tagapo', 'Dila', 'Pulong Santa Cruz', 'Don Jose'] },
          Calamba: { postalCode: '4027', barangays: ['Real', 'Halang', 'Canlubang', 'Pansol', 'Bucal'] },
          'San Pablo City': { postalCode: '4000', barangays: ['San Rafael', 'Del Remedio', 'Concepcion', 'San Francisco', 'Santo Angel'] },
        },
      },
      Pampanga: {
        regionName: 'Region III - Central Luzon',
        localities: {
          'San Fernando': { postalCode: '2000', barangays: ['Dolores', 'San Agustin', 'Sindalan', 'Telabastagan', 'Maimpis'] },
          Angeles: { postalCode: '2009', barangays: ['Balibago', 'Pampang', 'Pandan', 'Cutcut', 'Malabanias'] },
          Mabalacat: { postalCode: '2010', barangays: ['Dau', 'Mabiga', 'Dolores', 'San Francisco', 'Camachiles'] },
        },
      },
    },
  },
  US: {
    country: 'United States',
    regionField: 'state',
    localityField: 'city',
    components: ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'],
    streetNames: ['Main Street', 'Oak Avenue', 'Maple Drive', 'Cedar Lane', 'Washington Street', 'Lakeview Road'],
    regions: {
      California: {
        localities: {
          'Los Angeles': { postalCode: '90012' },
          'San Diego': { postalCode: '92101' },
          'San Jose': { postalCode: '95112' },
        },
      },
      Texas: {
        localities: {
          Houston: { postalCode: '77002' },
          Dallas: { postalCode: '75201' },
          Austin: { postalCode: '78701' },
        },
      },
      'New York': {
        localities: {
          'New York City': { postalCode: '10001' },
          Buffalo: { postalCode: '14202' },
          Rochester: { postalCode: '14604' },
        },
      },
    },
  },
  JP: {
    country: 'Japan',
    regionField: 'prefecture',
    localityField: 'city',
    dependentField: 'ward',
    dependentSource: 'wards',
    components: ['addressLine1', 'addressLine2', 'ward', 'city', 'state', 'postalCode', 'country'],
    streetNames: ['Sakura Dori', 'Chuo Dori', 'Showa Dori', 'Aoyama Dori', 'Nakamise Dori', 'Ekimae Dori'],
    regions: {
      Tokyo: {
        localities: {
          Tokyo: { postalCode: '100-0001', wards: ['Chiyoda', 'Shinjuku', 'Shibuya', 'Minato', 'Taito'] },
          Hachioji: { postalCode: '192-0083', wards: ['Motohongo', 'Yokoyamacho', 'Myojincho', 'Koyasumachi'] },
          Machida: { postalCode: '194-0013', wards: ['Morino', 'Nakamachi', 'Haramachida', 'Tsuruma'] },
        },
      },
      Osaka: {
        localities: {
          Osaka: { postalCode: '530-0001', wards: ['Kita', 'Chuo', 'Naniwa', 'Tennoji', 'Yodogawa'] },
          Sakai: { postalCode: '590-0078', wards: ['Sakai', 'Kita', 'Naka', 'Minami'] },
        },
      },
      Kyoto: {
        localities: {
          Kyoto: { postalCode: '604-8571', wards: ['Nakagyo', 'Shimogyo', 'Sakyo', 'Fushimi'] },
          Uji: { postalCode: '611-0021', wards: ['Uji', 'Kohata', 'Ogura', 'Rokujizo'] },
        },
      },
    },
  },
  GB: {
    country: 'United Kingdom',
    regionField: 'county',
    localityField: 'city',
    components: ['addressLine1', 'addressLine2', 'city', 'county', 'postalCode', 'country'],
    streetNames: ['High Street', 'Station Road', 'Church Lane', 'Victoria Road', 'Queens Road', 'London Road'],
    regions: {
      England: {
        localities: {
          London: { postalCode: 'SW1A 1AA', county: 'Greater London' },
          Manchester: { postalCode: 'M1 1AE', county: 'Greater Manchester' },
          Birmingham: { postalCode: 'B1 1BB', county: 'West Midlands' },
        },
      },
      Scotland: {
        localities: {
          Edinburgh: { postalCode: 'EH1 1YZ', county: 'City of Edinburgh' },
          Glasgow: { postalCode: 'G1 1AA', county: 'Glasgow City' },
        },
      },
    },
  },
  CA: {
    country: 'Canada',
    regionField: 'province',
    localityField: 'city',
    components: ['addressLine1', 'addressLine2', 'city', 'province', 'postalCode', 'country'],
    streetNames: ['King Street', 'Queen Street', 'Maple Avenue', 'Park Road', 'River Drive', 'Main Street'],
    regions: {
      Ontario: { localities: { Toronto: { postalCode: 'M5H 2N2' }, Ottawa: { postalCode: 'K1P 1J1' }, Hamilton: { postalCode: 'L8P 1A1' } } },
      Quebec: { localities: { Montreal: { postalCode: 'H2Y 1C6' }, Quebec: { postalCode: 'G1R 4P5' } } },
      'British Columbia': { localities: { Vancouver: { postalCode: 'V6B 1A1' }, Victoria: { postalCode: 'V8W 1P6' } } },
    },
  },
  AU: {
    country: 'Australia',
    regionField: 'state',
    localityField: 'suburb',
    components: ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'],
    streetNames: ['George Street', 'Queen Street', 'Elizabeth Street', 'King Street', 'Church Street', 'Park Avenue'],
    regions: {
      'New South Wales': { localities: { Sydney: { postalCode: '2000' }, Newcastle: { postalCode: '2300' }, Wollongong: { postalCode: '2500' } } },
      Victoria: { localities: { Melbourne: { postalCode: '3000' }, Geelong: { postalCode: '3220' } } },
      Queensland: { localities: { Brisbane: { postalCode: '4000' }, Cairns: { postalCode: '4870' } } },
    },
  },
  SG: {
    country: 'Singapore',
    regionField: 'region',
    localityField: 'town',
    components: ['addressLine1', 'addressLine2', 'city', 'postalCode', 'country'],
    streetNames: ['Orchard Road', 'North Bridge Road', 'Serangoon Road', 'Tanjong Pagar Road', 'Clementi Avenue', 'Tampines Street'],
    regions: {
      Central: { localities: { Orchard: { postalCode: '238839' }, Novena: { postalCode: '307506' }, 'Tanjong Pagar': { postalCode: '088539' } } },
      East: { localities: { Tampines: { postalCode: '529510' }, Bedok: { postalCode: '469572' }, 'Pasir Ris': { postalCode: '519457' } } },
      West: { localities: { Jurong: { postalCode: '609731' }, Clementi: { postalCode: '129588' } } },
    },
  },
  IN: {
    country: 'India',
    regionField: 'state',
    localityField: 'city',
    components: ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'],
    streetNames: ['MG Road', 'Nehru Road', 'Station Road', 'Park Street', 'Link Road', 'Gandhi Road'],
    regions: {
      Maharashtra: { localities: { Mumbai: { postalCode: '400001' }, Pune: { postalCode: '411001' }, Nagpur: { postalCode: '440001' } } },
      Karnataka: { localities: { Bengaluru: { postalCode: '560001' }, Mysuru: { postalCode: '570001' } } },
      Delhi: { localities: { 'New Delhi': { postalCode: '110001' }, Dwarka: { postalCode: '110075' } } },
    },
  },
  INTL: {
    country: 'International',
    regionField: 'state',
    localityField: 'city',
    components: ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'],
    streetNames: ['Main Street', 'Central Avenue', 'Market Road', 'Park Lane', 'Station Road', 'River Street'],
    regions: {
      Region: {
        localities: {
          Metropolis: { postalCode: '1000' },
          'Central City': { postalCode: '2000' },
          'North District': { postalCode: '3000' },
        },
      },
    },
  },
};

const ADDRESS_API_CACHE = {
  countries: null,
  geocodedStates: new Map(),
  geocodedCities: new Map(),
  psgcProvinces: null,
  psgcZipCodes: null,
  psgcAllLocalities: null,
  psgcAllBarangays: null,
  psgcLocalities: new Map(),
  psgcBarangays: new Map(),
  postalCodes: new Map(),
};

function createGenericAddressProfile(countryCode, countryName) {
  return {
    country: countryName || countryCode,
    regionField: 'state',
    localityField: 'city',
    components: ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'],
    streetNames: ['Main Street', 'Central Avenue', 'Market Road', 'Park Lane', 'Station Road', 'River Street'],
    regions: {},
  };
}

function ensureAddressProfile(countryCode, countryName) {
  const code = String(countryCode || 'INTL').trim().toUpperCase();
  if (!code) return ADDRESS_PROFILES.INTL;
  if (!ADDRESS_PROFILES[code]) {
    ADDRESS_PROFILES[code] = createGenericAddressProfile(code, countryName || code);
  } else if (countryName && ADDRESS_PROFILES[code].country === code) {
    ADDRESS_PROFILES[code].country = countryName;
  }
  return ADDRESS_PROFILES[code];
}

async function hydrateSupportedAddressCountries() {
  if (ADDRESS_API_CACHE.countries) return ADDRESS_API_CACHE.countries;
  const countries = getApiItems(await fetchAddressJson('https://api.geocoded.me/countries?fields=name,iso2'))
    .map(item => ({ code: String(item?.iso2 || item?.code || '').toUpperCase(), name: getItemName(item) }))
    .filter(item => item.code && item.name);
  countries.forEach(country => ensureAddressProfile(country.code, country.name));
  ADDRESS_API_CACHE.countries = countries;
  return countries;
}

async function fetchAddressJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function getApiItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function getItemName(item) {
  return item?.name || item?.commonName || item?.officialName || item?.label || '';
}

function getItemCode(item) {
  return item?.code || item?.iso2 || item?.stateCode || item?.id || getItemName(item);
}

function resetAddressProfileRegions(countryCode, regions) {
  const profile = getAddressProfile(countryCode);
  profile.regions = {};
  regions.forEach(region => {
    if (!region.name) return;
    profile.regions[region.name] = {
      code: region.code || region.name,
      regionName: region.regionName || region.name,
      localities: {},
    };
  });
}

function upsertAddressLocalities(countryCode, regionName, localities) {
  const profile = getAddressProfile(countryCode);
  if (!profile.regions[regionName]) {
    profile.regions[regionName] = { code: regionName, regionName, localities: {} };
  }
  localities.forEach(locality => {
    if (!locality.name) return;
    profile.regions[regionName].localities[locality.name] = {
      ...(profile.regions[regionName].localities[locality.name] || {}),
      code: locality.code || locality.name,
      postalCode: locality.postalCode || profile.regions[regionName].localities[locality.name]?.postalCode || '',
      ...(locality.dependentSource ? { [locality.dependentSource]: locality.dependentOptions || [] } : {}),
    };
  });
}

async function hydrateGeocodedAddressProfile(countryCode, selectedRegion = 'random') {
  const profile = getAddressProfile(countryCode);
  if (countryCode === 'INTL') return;

  if (!ADDRESS_API_CACHE.geocodedStates.has(countryCode)) {
    const url = `https://api.geocoded.me/countries/${encodeURIComponent(countryCode)}/states?fields=name,iso2,code`;
    const states = getApiItems(await fetchAddressJson(url))
      .map(item => ({ name: getItemName(item), code: getItemCode(item) }))
      .filter(item => item.name);
    ADDRESS_API_CACHE.geocodedStates.set(countryCode, states);
    if (states.length) resetAddressProfileRegions(countryCode, states);
  } else if (!Object.keys(profile.regions || {}).length) {
    resetAddressProfileRegions(countryCode, ADDRESS_API_CACHE.geocodedStates.get(countryCode));
  }

  if (!selectedRegion || selectedRegion === 'random') return;
  const region = profile.regions[selectedRegion];
  const regionCode = region?.code || selectedRegion;
  const cacheKey = `${countryCode}:${regionCode}`;
  if (!ADDRESS_API_CACHE.geocodedCities.has(cacheKey)) {
    const url = `https://api.geocoded.me/countries/${encodeURIComponent(countryCode)}/states/${encodeURIComponent(regionCode)}/cities?fields=name,latitude,longitude`;
    const cities = getApiItems(await fetchAddressJson(url))
      .map(item => ({ name: getItemName(item), code: getItemCode(item) }))
      .filter(item => item.name);
    ADDRESS_API_CACHE.geocodedCities.set(cacheKey, cities);
  }
  upsertAddressLocalities(countryCode, selectedRegion, ADDRESS_API_CACHE.geocodedCities.get(cacheKey));
}

async function hydratePhilippinesAddressProfile(selectedRegion = 'random', selectedLocality = 'random') {
  const countryCode = 'PH';
  const zipMap = await getPhilippinesZipCodeMap();
  if (!ADDRESS_API_CACHE.psgcProvinces) {
    const provinces = getApiItems(await fetchAddressJson('https://psgc.cloud/api/v2/provinces'))
      .map(item => ({
        name: getItemName(item),
        code: getItemCode(item),
        regionName: item?.region?.name || item?.region || getItemName(item),
      }))
      .filter(item => item.name);
    ADDRESS_API_CACHE.psgcProvinces = provinces;
    if (provinces.length) resetAddressProfileRegions(countryCode, provinces);
  } else if (!Object.keys(getAddressProfile(countryCode).regions || {}).length) {
    resetAddressProfileRegions(countryCode, ADDRESS_API_CACHE.psgcProvinces);
  }

  if (!selectedRegion || selectedRegion === 'random') {
    if (!ADDRESS_API_CACHE.psgcAllLocalities) {
      const allLocalities = getApiItems(await fetchAddressJson('https://psgc.cloud/api/v2/cities-municipalities'))
        .map(item => ({
          name: getItemName(item),
          code: getItemCode(item),
          postalCode: zipMap.get(getItemCode(item)) || '',
          province: item?.province?.name || item?.province || '',
        }))
        .filter(item => item.name && item.province);
      ADDRESS_API_CACHE.psgcAllLocalities = allLocalities;
    }
    ADDRESS_API_CACHE.psgcAllLocalities.forEach(locality => {
      upsertAddressLocalities(countryCode, locality.province, [{ name: locality.name, code: locality.code, postalCode: locality.postalCode }]);
    });
    await hydrateAllPhilippinesBarangays();
    return;
  }
  const region = getAddressProfile(countryCode).regions[selectedRegion];
  const provinceKey = region?.code || selectedRegion;
  if (!ADDRESS_API_CACHE.psgcLocalities.has(provinceKey)) {
    const url = `https://psgc.cloud/api/v2/provinces/${encodeURIComponent(provinceKey)}/cities-municipalities`;
    const localities = getApiItems(await fetchAddressJson(url))
      .map(item => ({ name: getItemName(item), code: getItemCode(item) }))
      .map(item => ({ ...item, postalCode: zipMap.get(item.code) || '' }))
      .filter(item => item.name);
    ADDRESS_API_CACHE.psgcLocalities.set(provinceKey, localities);
  }
  upsertAddressLocalities(countryCode, selectedRegion, ADDRESS_API_CACHE.psgcLocalities.get(provinceKey));

  if (!selectedLocality || selectedLocality === 'random') return;
  const locality = getAddressProfile(countryCode).regions[selectedRegion]?.localities?.[selectedLocality];
  const localityKey = locality?.code || selectedLocality;
  if (!ADDRESS_API_CACHE.psgcBarangays.has(localityKey)) {
    const url = `https://psgc.cloud/api/v2/cities-municipalities/${encodeURIComponent(localityKey)}/barangays`;
    const barangays = getApiItems(await fetchAddressJson(url))
      .map(item => getItemName(item))
      .filter(Boolean);
    ADDRESS_API_CACHE.psgcBarangays.set(localityKey, barangays);
  }
  locality.barangays = ADDRESS_API_CACHE.psgcBarangays.get(localityKey);
}

async function getPhilippinesZipCodeMap() {
  if (ADDRESS_API_CACHE.psgcZipCodes) return ADDRESS_API_CACHE.psgcZipCodes;

  const [cities, municipalities] = await Promise.all([
    fetchAddressJson('https://psgc.cloud/api/cities').then(getApiItems),
    fetchAddressJson('https://psgc.cloud/api/municipalities').then(getApiItems),
  ]);

  const map = new Map();
  [...cities, ...municipalities].forEach(item => {
    const code = getItemCode(item);
    const zip = item?.zip_code || item?.zipCode || item?.postalCode || '';
    if (code && zip) map.set(code, String(zip));
  });

  ADDRESS_API_CACHE.psgcZipCodes = map;
  return map;
}

async function hydrateAllPhilippinesBarangays() {
  if (!ADDRESS_API_CACHE.psgcAllBarangays) {
    const barangays = getApiItems(await fetchAddressJson('https://psgc.cloud/api/v2/barangays'))
      .map(item => ({
        name: getItemName(item),
        locality: item?.city_municipality?.name || item?.city_municipality || '',
      }))
      .filter(item => item.name && item.locality);
    ADDRESS_API_CACHE.psgcAllBarangays = barangays;
  }

  const profile = getAddressProfile('PH');
  const localityLookup = new Map();
  Object.values(profile.regions || {}).forEach(region => {
    Object.entries(region.localities || {}).forEach(([localityName, localityData]) => {
      localityLookup.set(localityName, localityData);
    });
  });

  ADDRESS_API_CACHE.psgcAllBarangays.forEach(item => {
    const localityData = localityLookup.get(item.locality);
    if (!localityData) return;
    if (!Array.isArray(localityData.barangays)) localityData.barangays = [];
    if (!localityData.barangays.includes(item.name)) localityData.barangays.push(item.name);
  });
}

async function hydratePostalCode(countryCode, selectedRegion = 'random', selectedLocality = 'random') {
  if (countryCode === 'PH') return;
  if (!selectedRegion || selectedRegion === 'random' || !selectedLocality || selectedLocality === 'random') return;
  const match = getAddressLocalityData(countryCode, selectedRegion, selectedLocality);
  if (!match?.data || match.data.postalCode) return;

  const cacheKey = `${countryCode}:${selectedRegion}:${selectedLocality}`;
  if (!ADDRESS_API_CACHE.postalCodes.has(cacheKey)) {
    const url = `https://api.zippopotam.us/${encodeURIComponent(countryCode.toLowerCase())}/${encodeURIComponent(selectedRegion)}/${encodeURIComponent(selectedLocality)}`;
    try {
      const data = await fetchAddressJson(url);
      const postal = data?.places?.[0]?.['post code'] || data?.['post code'] || '';
      ADDRESS_API_CACHE.postalCodes.set(cacheKey, postal);
    } catch (e) {
      ADDRESS_API_CACHE.postalCodes.set(cacheKey, '');
    }
  }

  const postalCode = ADDRESS_API_CACHE.postalCodes.get(cacheKey);
  if (postalCode) match.data.postalCode = postalCode;
}

function createDefaultAddressConfig() {
  const countryCode = 'INTL';
  const profile = getAddressProfile(countryCode);
  return {
    enabled: true,
    fields: [],
    country: profile.country,
    countryCode,
    locationChecked: false,
    regions: getAddressRegionOptions(countryCode),
    provinces: getAddressRegionOptions(countryCode),
    region: 'random',
    province: 'random',
    locality: 'random',
    city: 'random',
    barangay: 'random',
    ward: 'random',
    dependentLocality: 'random',
  };
}

window.createDefaultAddressConfig = createDefaultAddressConfig;

async function detectAddressCountry() {
  const res = await fetch('https://api.country.is/?fields=city,subdivision,postal');
  if (!res.ok) throw new Error(`Country lookup failed: ${res.status}`);
  const data = await res.json();
  ensureAddressProfile(data.country || 'INTL');
  const countryCode = normalizeAddressCountryCode(data.country || 'INTL');
  const profile = getAddressProfile(countryCode);
  return {
    countryCode,
    country: profile.country,
    city: data.city || '',
    subdivision: data.subdivision || '',
    postal: data.postal || '',
  };
}

function ensureDetectedAddressLocation(location = {}) {
  const countryCode = normalizeAddressCountryCode(location.countryCode);
  const profile = getAddressProfile(countryCode);
  const subdivision = String(location.subdivision || '').trim();
  const city = String(location.city || '').trim();
  if (!subdivision && !city) return;

  const regionName = subdivision || 'Detected Area';
  if (!profile.regions[regionName]) {
    profile.regions[regionName] = {
      regionName,
      localities: {},
    };
  }

  if (city && !profile.regions[regionName].localities[city]) {
    profile.regions[regionName].localities[city] = {
      postalCode: String(location.postal || '').trim(),
    };
  } else if (city && location.postal && !profile.regions[regionName].localities[city].postalCode) {
    profile.regions[regionName].localities[city].postalCode = String(location.postal).trim();
  }
}

function normalizeAddressCountryCode(countryCode = 'INTL') {
  const code = String(countryCode || 'INTL').trim().toUpperCase();
  return ADDRESS_PROFILES[code] ? code : 'INTL';
}

function getAddressProfile(countryCode = 'INTL') {
  return ADDRESS_PROFILES[normalizeAddressCountryCode(countryCode)] || ADDRESS_PROFILES.INTL;
}

function getSupportedAddressCountries() {
  return Object.entries(ADDRESS_PROFILES)
    .map(([code, profile]) => ({ code, name: profile.country }))
    .sort((a, b) => (a.code === 'INTL' ? -1 : b.code === 'INTL' ? 1 : a.name.localeCompare(b.name)));
}

function getAddressRegionOptions(countryCode = 'INTL') {
  return Object.keys(getAddressProfile(countryCode).regions || {});
}

function getAddressLocalityOptions(countryCode = 'INTL', regions = []) {
  const profile = getAddressProfile(countryCode);
  const regionNames = regions.length ? regions : getAddressRegionOptions(countryCode);
  return regionNames.flatMap(region => Object.keys(profile.regions[region]?.localities || {}));
}

function getAddressLocalityData(countryCode = 'INTL', region = 'random', locality = 'random') {
  if (!locality || locality === 'random') return null;
  const profile = getAddressProfile(countryCode);
  const regionNames = region && region !== 'random' ? [region] : getAddressRegionOptions(countryCode);
  for (const regionName of regionNames) {
    const localityData = profile.regions[regionName]?.localities?.[locality];
    if (localityData) {
      return { region: regionName, data: localityData };
    }
  }
  return null;
}

function getAddressDependentField(profile) {
  return profile.dependentField || '';
}

function getAddressDependentOptions(countryCode = 'INTL', region = 'random', locality = 'random') {
  const match = getAddressLocalityData(countryCode, region, locality);
  const profile = getAddressProfile(countryCode);
  const sourceKey = profile.dependentSource || profile.dependentField;
  return sourceKey ? (match?.data?.[sourceKey] || []) : [];
}

function getAddressBarangayOptions(countryCode = 'INTL', region = 'random', locality = 'random') {
  return getAddressDependentOptions(countryCode, region, locality);
}

function getAddressPostalCodePreview(countryCode = 'INTL', region = 'random', locality = 'random') {
  const match = getAddressLocalityData(countryCode, region, locality);
  return match?.data?.postalCode || 'Auto by City/Town';
}

function getAddressProvinces(countryCode = 'INTL') {
  return getAddressRegionOptions(countryCode);
}

function getAddressCities(countryCode = 'INTL', provinces = []) {
  return getAddressLocalityOptions(countryCode, provinces);
}

function generateAddress(config = createDefaultAddressConfig()) {
  const countryCode = normalizeAddressCountryCode(config.countryCode);
  const profile = getAddressProfile(countryCode);
  const regionOptions = getAddressRegionOptions(countryCode);
  const configuredRegion = config.region || config.province;
  const configRegions = configuredRegion && configuredRegion !== 'random'
    ? [configuredRegion]
    : (config.regions?.length ? config.regions : (config.provinces?.length ? config.provinces : regionOptions));
  const regions = configRegions.filter(region => profile.regions[region]);
  const state = pickRandom(regions.length ? regions : regionOptions);
  const localityOptions = Object.keys(profile.regions[state]?.localities || {});
  const configuredLocality = config.locality || config.city;
  const city = configuredLocality && configuredLocality !== 'random' && localityOptions.includes(configuredLocality)
    ? configuredLocality
    : pickRandom(localityOptions);
  const regionData = profile.regions[state] || {};
  const localityData = regionData.localities?.[city] || {};
  const addressLine1 = `${Math.floor(Math.random() * 899) + 100} ${pickRandom(profile.streetNames)}`;
  const postalCode = localityData.postalCode || String(Math.floor(Math.random() * 90000) + 10000);
  const dependentField = getAddressDependentField(profile);
  const dependentSource = profile.dependentSource || dependentField;
  const dependentOptions = dependentSource ? (localityData[dependentSource] || []) : [];
  const configuredDependent = config[dependentField] || config.dependentLocality;
  const dependentValue = configuredDependent && configuredDependent !== 'random' && dependentOptions.includes(configuredDependent)
    ? configuredDependent
    : pickRandom(dependentOptions);
  const barangay = dependentField === 'barangay' ? dependentValue : '';
  const ward = dependentField === 'ward' ? dependentValue : '';
  const county = localityData.county || (profile.regionField === 'county' ? state : '');
  const addressLine2 = buildAddressLine2(profile, { barangay, ward, city });
  const address = {
    addressLine1,
    addressLine2,
    street: addressLine1,
    city,
    state,
    province: state,
    region: regionData.regionName || state,
    county,
    barangay,
    ward,
    postalCode,
    zip: postalCode,
    country: profile.country,
  };
  address.fullAddress = buildFullAddress(address, profile);
  return address;
}

function buildFullAddress(address, profile) {
  const parts = [address.addressLine1];
  if (address.addressLine2) parts.push(address.addressLine2);
  if (profile.components.includes('barangay') && address.barangay && !address.addressLine2.includes(address.barangay)) {
    parts.push(address.barangay);
  }
  if (profile.components.includes('ward') && address.ward && !address.addressLine2.includes(address.ward)) {
    parts.push(address.ward);
  }
  parts.push(address.city);
  if (profile.components.includes('county') && address.county) parts.push(address.county);
  if (profile.components.includes('state')) parts.push(address.state);
  if (profile.components.includes('province')) parts.push(address.province);
  if (profile.components.includes('region') && address.region && address.region !== address.province) parts.push(address.region);
  const line = parts.filter(Boolean).join(', ');
  return [line, address.postalCode, address.country].filter(Boolean).join(' ');
}

function buildAddressLine2(profile, address) {
  if (profile.country === 'Philippines' && address.barangay) {
    return `Barangay ${address.barangay}`;
  }
  if (profile.country === 'Japan' && address.ward) {
    return `${address.ward} Ward`;
  }

  const secondaryParts = [
    `Unit ${Math.floor(Math.random() * 40) + 1}`,
    `${Math.floor(Math.random() * 20) + 2}F`,
    `${pickRandom(['North', 'Central', 'Riverside', 'Parkview', 'Greenfield'])} Building`,
    `${pickRandom(['Oak', 'Maple', 'Cedar', 'River', 'Market'])} Village`,
  ];
  return pickRandom(secondaryParts);
}

function getAddressValueForField(address, fieldType) {
  const aliases = {
    addressLine1: 'addressLine1',
    addressLine2: 'addressLine2',
    street: 'addressLine1',
    province: 'province',
    state: 'state',
    region: 'region',
    prefecture: 'state',
    ward: 'ward',
    zip: 'postalCode',
  };
  const key = aliases[fieldType] || fieldType;
  return address[key] || address.fullAddress;
}

function formatGeneratedAddressForField(address, binding) {
  return getAddressValueForField(address, binding.fieldType);
}

function pickRandom(items) {
  if (!items?.length) return '';
  return items[Math.floor(Math.random() * items.length)];
}

function inferAddressCountryFromFields(fields) {
  if (!fields?.length) return null;
  if (fields.some(field => field.fieldType === 'barangay')) {
    return { countryCode: 'PH', country: ADDRESS_PROFILES.PH.country };
  }
  if (fields.some(field => field.fieldType === 'ward')) {
    return { countryCode: 'JP', country: ADDRESS_PROFILES.JP.country };
  }
  return null;
}

// ============ Nationality Smart Detection ============

const NATIONALITIES = [
  'Afghan', 'Albanian', 'Algerian', 'American', 'Andorran', 'Angolan', 'Antiguans', 'Argentine', 'Armenian',
  'Australian', 'Austrian', 'Azerbaijani', 'Bahamian', 'Bahraini', 'Bangladeshi', 'Barbadian', 'Belarusian',
  'Belgian', 'Belizean', 'Beninese', 'Bhutanese', 'Bolivian', 'Bosnian', 'Botswanan', 'Brazilian', 'British',
  'Bruneian', 'Bulgarian', 'Burkinabe', 'Burmese', 'Burundian', 'Cambodian', 'Cameroonian', 'Canadian', 'Cape Verdean',
  'Central African', 'Chadian', 'Chilean', 'Chinese', 'Colombian', 'Comoran', 'Congolese', 'Costa Rican',
  'Croatian', 'Cuban', 'Cypriot', 'Czech', 'Danish', 'Djibouti', 'Dominican', 'Dominican', 'Dutch', 'East Timorese',
  'Ecuadorian', 'Egyptian', 'Emirati', 'Equatorial Guinean', 'Eritrean', 'Estonian', 'Ethiopian', 'Fijian', 'Filipino',
  'Finnish', 'French', 'Gabonese', 'Gambian', 'Georgian', 'German', 'Ghanaian', 'Greek', 'Grenadian', 'Guatemalan',
  'Guinea-Bissau', 'Guinean', 'Guyanese', 'Haitian', 'Herzegovinian', 'Honduran', 'Hungarian', 'Icelandic', 'Indian',
  'Indonesian', 'Iranian', 'Iraqi', 'Irish', 'Israeli', 'Italian', 'Ivorian', 'Jamaican', 'Japanese', 'Jordanian',
  'Kazakh', 'Kenyan', 'Kittian', 'Kuwaiti', 'Kyrgyz', 'Lao', 'Latvian', 'Lebanese', 'Lesotho', 'Liberian',
  'Libyan', 'Liechtenstein', 'Lithuanian', 'Luxembourg', 'Macedonian', 'Malagasy', 'Malawian', 'Malaysian', 'Maldivian',
  'Mali', 'Maltese', 'Marshallese', 'Mauritanian', 'Mauritian', 'Mexican', 'Micronesian', 'Moldovan', 'Monacan',
  'Mongolian', 'Montenegrin', 'Moroccan', 'Mozambican', 'Namibian', 'Nauruan', 'Nepalese', 'New Zealander',
  'Nicaraguan', 'Niger', 'Nigerian', 'North Korean', 'Norwegian', 'Omani', 'Pakistani', 'Palauan', 'Panamanian',
  'Papua New Guinean', 'Paraguayan', 'Peruvian', 'Polish', 'Portuguese', 'Qatari', 'Romanian', 'Russian',
  'Rwandan', 'Saint Lucian', 'Salvadoran', 'Samoan', 'San Marinese', 'Sao Tomean', 'Saudi', 'Senegalese',
  'Serbian', 'Seychellois', 'Sierra Leonean', 'Singaporean', 'Slovak', 'Slovenian', 'Solomon Islander',
  'Somali', 'South African', 'South Korean', 'South Sudanese', 'Spanish', 'Sri Lankan', 'Sudanese', 'Surinamer',
  'Swazi', 'Swedish', 'Swiss', 'Syrian', 'Taiwanese', 'Tajik', 'Tanzanian', 'Thai', 'Togolese', 'Tongan',
  'Trinidadian', 'Tunisian', 'Turkish', 'Turkmen', 'Tuvaluan', 'Ugandan', 'Ukrainian', 'Uruguayan', 'Uzbek',
  'Venezuelan', 'Vietnamese', 'Yemeni', 'Zambian', 'Zimbabwean',
];

// Additional variations with "ese", "ian", "ish" suffixes common in forms
const NATIONALITIES_WITH_ESE = ['Chinese', 'Japanese', 'Portuguese', 'Vietnamese'];
const NATIONALITIES_WITH_IAN = NATIONALITIES.filter(n => n.endsWith('ian') && !n.endsWith('anese'));
const NATIONALITIES_WITH_ISE = ['British', 'Irish'];
const NATIONALITIES_WITH_ISH = ['British', 'Irish', 'Swedish', 'Polish', 'Spanish', 'Turkish', 'Finnish'];

function detectNationalityQuestions(questions) {
  const detected = [];
  questions.forEach((q, idx) => {
    const title = normalizeNameTitle(q.title || '');
    const base = { questionIndex: idx, questionId: q.id, title: q.title };
    if (/\b(nationality|citizenship|citizen|country\s+of\s+(birth|citizenship|origin)|what\s+is\s+your\s+(nationality|citizenship))\b/i.test(title)) {
      detected.push({ ...base, fieldType: 'nationality' });
    } else if (/\b(ethnic\s*(origin|ity)|ethnicity|tribe|race)\b/i.test(title)) {
      detected.push({ ...base, fieldType: 'ethnicity' });
    } else if (/\b(ancestry|ancestral|ancestors|origin\s*(country)?)\b/i.test(title)) {
      detected.push({ ...base, fieldType: 'ancestry' });
    }
  });
  return detected;
}

function createDefaultNationalityConfig() {
  return {
    enabled: true,
    fields: [],
    nationality: 'random', // 'random' or a specific nationality
    pool: 'all', // 'all', 'asian', 'european', 'american', 'african', 'oceanian'
    preferLocal: false, // Prefer the local nationality based on address config
    locationChecked: false,
  };
}

window.createDefaultNationalityConfig = createDefaultNationalityConfig;

function getNationalityPool(poolName) {
  const pools = {
    all: NATIONALITIES,
    asian: ['Afghan', 'Bangladeshi', 'Bhutanese', 'Bruneian', 'Cambodian', 'Chinese', 'Indian', 'Indonesian', 'Iranian', 'Iraqi', 'Japanese', 'Jordanian', 'Kazakh', 'Korean', 'Kuwaiti', 'Kyrgyz', 'Lao', 'Lebanese', 'Malaysian', 'Maldivian', 'Mongolian', 'Myanmar', 'Nepalese', 'Omani', 'Pakistani', 'Palestinian', 'Philippino', 'Qatari', 'Saudi', 'Singaporean', 'Sri Lankan', 'Syrian', 'Taiwanese', 'Tajik', 'Thai', 'Turkish', 'UAE', 'Uzbek', 'Vietnamese', 'Yemeni'],
    european: ['Albanian', 'Andorran', 'Austrian', 'Belgian', 'Bulgarian', 'Croatian', 'Cypriot', 'Czech', 'Danish', 'Dutch', 'Estonian', 'Finnish', 'French', 'German', 'Greek', 'Hungarian', 'Icelandic', 'Irish', 'Italian', 'Latvian', 'Liechtenstein', 'Lithuanian', 'Luxembourg', 'Maltese', 'Monacan', 'Norwegian', 'Polish', 'Portuguese', 'Romanian', 'Russian', 'San Marinese', 'Serbian', 'Slovak', 'Slovenian', 'Spanish', 'Swedish', 'Swiss', 'Ukrainian', 'British'],
    american: ['American', 'Argentine', 'Bahamian', 'Barbadian', 'Belgian', 'Belizean', 'Bolivian', 'Brazilian', 'Canadian', 'Chilean', 'Colombian', 'Costa Rican', 'Cuban', 'Dominican', 'Ecuadorian', 'Salvadoran', 'Grenadian', 'Guatemalan', 'Guyanese', 'Haitian', 'Honduran', 'Jamaican', 'Mexican', 'Nicaraguan', 'Panamanian', 'Paraguayan', 'Peruvian', 'Puerto Rican', 'Saint Lucian', 'Surinamer', 'Trinidadian', 'Uruguayan', 'Venezuelan'],
    african: ['Algerian', 'Angolan', 'Beninese', 'Botswanan', 'Burkinabe', 'Burundian', 'Cameroonian', 'Central African', 'Chadian', 'Congolese', 'Djibouti', 'Egyptian', 'Emirati', 'Eritrean', 'Ethiopian', 'Gabonese', 'Ghanaian', 'Guinean', 'Ivorian', 'Kenyan', 'Lesotho', 'Liberian', 'Libyan', 'Madagascar', 'Malawian', 'Mali', 'Mauritanian', 'Mauritian', 'Moroccan', 'Mozambican', 'Namibian', 'Niger', 'Nigerian', 'Rwandan', 'Senegalese', 'Sierra Leonean', 'Somali', 'South African', 'Sudanese', 'Tanzanian', 'Togolese', 'Tunisian', 'Ugandan', 'Zambian', 'Zimbabwean'],
    oceanian: ['Australian', 'Fijian', 'Kiribati', 'Marshallese', 'Micronesian', 'Nauruan', 'New Zealander', 'Palauan', 'Papua New Guinean', 'Samoan', 'Solomon Islander', 'Tongan', 'Tuvaluan', 'Vanuatu'],
    pinoy: ['Filipino'], // Filipino-specific option for Philippine forms
  };
  return pools[poolName] || pools.all;
}

function generateNationality(config = createDefaultNationalityConfig()) {
  // If address config suggests a country, prefer that nationality
  const addressConfig = window.spammerzState?.autoAddressConfig;
  const addressCountry = addressConfig?.countryCode;

  let resultNationality = null;

  // Check if address config can infer nationality
  if (config.preferLocal && addressCountry) {
    const countryToNationality = {
      PH: 'Filipino',
      JP: 'Japanese',
      CN: 'Chinese',
      KR: 'Korean',
      IN: 'Indian',
      ID: 'Indonesian',
      MY: 'Malaysian',
      TH: 'Thai',
      VN: 'Vietnamese',
      SG: 'Singaporean',
      US: 'American',
      GB: 'British',
      DE: 'German',
      FR: 'French',
      IT: 'Italian',
      ES: 'Spanish',
      BR: 'Brazilian',
      MX: 'Mexican',
      GB: 'British',
    };
    const inferred = countryToNationality[addressCountry];
    if (inferred && NATIONALITIES.includes(inferred)) {
      resultNationality = inferred;
    }
  }

  // If specific nationality is configured
  if (!resultNationality && config.nationality && config.nationality !== 'random') {
    if (NATIONALITIES.includes(config.nationality)) {
      resultNationality = config.nationality;
    }
  }

  // Pick from pool
  if (!resultNationality) {
    const pool = getNationalityPool(config.pool || 'all');
    // Filter to ensure nationality is valid
    const validPool = pool.filter(n => NATIONALITIES.includes(n));
    resultNationality = pickRandom(validPool.length ? validPool : NATIONALITIES);
  }

  return {
    nationality: resultNationality,
    ethnicity: null, // Could be extended
    ancestry: null,
  };
}

function formatGeneratedNationalityForField(binding, generated) {
  if (!generated) return '';
  const { fieldType } = binding;
  if (fieldType === 'nationality') {
    return generated.nationality || '';
  }
  return generated[fieldType] || '';
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
  const autoAddressConfig = s.autoAddressConfig || createDefaultAddressConfig();
  const detectedAddressFields = autoAddressConfig.enabled ? detectAddressQuestions(formData.allQuestions) : [];
  const activeAddressFields = autoAddressConfig.fields?.length ? autoAddressConfig.fields : detectedAddressFields;
  const generatedAddress = autoAddressConfig.enabled ? generateAddress(autoAddressConfig) : null;
  const smartContext = createSmartSurveyContext(formData, s, generatedName, generatedAddress);

  formData.allQuestions.forEach((q, idx) => {
    const cfg = s.answers[idx];
    if (!cfg) return;

    let value = resolvePreviewValueForQuestion(cfg, q);
    if (detectAgeQuestion(q, idx)) {
      value = generateAgeValue(cfg.ageConfig);
    }
    const smartValue = resolveSmartSurveyValue(q, cfg, smartContext, idx);
    if (smartValue !== null) value = smartValue;
    if (generatedName && activeFields.length) {
      const binding = activeFields.find(f => f.questionIndex === idx);
      if (binding) {
        value = formatGeneratedNameForField(generatedName, binding);
      }
    }
    if (generatedAddress && activeAddressFields.length) {
      const binding = activeAddressFields.find(f => f.questionIndex === idx);
      if (binding) value = formatGeneratedAddressForField(generatedAddress, binding);
    }

    applyPreviewValue(wrapper, q, value);
  });
}

function resolvePreviewValue(cfg) {
  const { values, weights, randomize } = cfg;
  if (!values || values.length === 0) return '';
  if (!randomize || values.length === 1) return values[0];
  if (weights && weights.length === values.length) {
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

function createSmartSurveyContext(formData, state, generatedName, generatedAddress) {
  const autoNameConfig = state.autoNameConfig || createDefaultNameConfig();
  const name = generatedName || (autoNameConfig.enabled !== false ? generateName(autoNameConfig) : null);
  const ageQuestionIndex = formData.allQuestions.findIndex(q => detectAgeQuestion(q));
  const ageConfig = ageQuestionIndex >= 0 ? state.answers[ageQuestionIndex]?.ageConfig : null;
  const age = Number(generateAgeValue(ageConfig || { min: 18, max: 30 }));
  const schoolName = generateSchoolName(generatedAddress);
  const nationalityConfig = state.autoNationalityConfig || createDefaultNationalityConfig();
  const nationality = nationalityConfig.enabled ? generateNationality(nationalityConfig) : null;
  return {
    generatedName: name,
    generatedAddress,
    schoolName,
    age,
    nationality,
    countryCode: state.autoAddressConfig?.countryCode || generatedAddress?.countryCode || 'INTL',
  };
}

function resolveSmartSurveyValue(question, cfg, context, idx = 0) {
  const binding = detectSmartSurveyQuestion(question, idx);
  if (!binding) return null;
  const isTypedQuestion = ['short_text', 'paragraph', 'date', 'time'].includes(question.type) || binding.fieldType === 'birthdate' || binding.fieldType === 'date';
  if (!isTypedQuestion && binding.fieldType !== 'consent') return null;
  const raw = generateSmartSurveyValue(binding.fieldType, question, cfg, context);
  if (raw == null || raw === '') return null;
  return coerceSmartValueToQuestionOption(question, raw);
}

function generateSmartSurveyValue(fieldType, question, cfg, context) {
  switch (fieldType) {
    case 'gender':
    case 'sex':
      return pickRandom(getConfiguredGenderOptions(cfg, fieldType));
    case 'email':
      return generateEmailAddress(context.generatedName);
    case 'phone':
      return generatePhoneNumber(context.countryCode);
    case 'birthdate':
      return generateBirthdateFromAge(context.age, question.type);
    case 'date':
      return new Date().toISOString().slice(0, 10); // Today's date: YYYY-MM-DD
    case 'school':
      return context.schoolName;
    case 'course':
      return generateCourseOrStrand(context.schoolName);
    case 'yearLevel':
      return generateYearLevel(context.schoolName);
    case 'occupation': {
      const professions = window.spammerzProfessions || ['Student', 'Employed', 'Self-employed', 'Unemployed'];
      return pickRandom(professions);
    }
    case 'religion':
      return pickRandom(['Roman Catholic', 'Christian', 'Islam', 'Iglesia ni Cristo', 'Prefer not to say']);
    case 'householdSize': {
      const range = normalizeHouseholdConfig(cfg.householdConfig);
      return String(range.min + Math.floor(Math.random() * (range.max - range.min + 1)));
    }
    case 'consent':
      return pickBestConsentOption(question);
    case 'nationality':
      return context.nationality?.nationality || 'Filipino';
    case 'ethnicity':
      return pickRandom(['Filipino', 'Chinese', 'Indian', 'Visayan', 'Ilocano', 'Cebuano', 'Moro', 'Igorot']);
    case 'ancestry':
      return pickRandom(['Filipino', 'Chinese', 'Spanish', 'American', 'Japanese', 'Korean', 'Indian']);
    default:
      return null;
  }
}

function coerceSmartValueToQuestionOption(question, value) {
  if (!question.options?.length && question.type !== 'linear_scale') return value;
  const options = question.type === 'linear_scale'
    ? Array.from({ length: (question.scaleMax || 5) - (question.scaleMin || 1) + 1 }, (_, i) => String((question.scaleMin || 1) + i))
    : question.options;
  const values = Array.isArray(value) ? value : [value];
  for (const candidate of values) {
    const exact = options.find(opt => normalizeNameTitle(opt) === normalizeNameTitle(candidate));
    if (exact) return exact;
    const partial = options.find(opt => normalizeNameTitle(opt).includes(normalizeNameTitle(candidate)) || normalizeNameTitle(candidate).includes(normalizeNameTitle(opt)));
    if (partial) return partial;
  }
  return options[0] || value;
}

function generateEmailAddress(name) {
  const first = normalizeEmailPart(name?.firstName || 'user');
  const last = normalizeEmailPart(name?.lastName || 'respondent');
  const n = Math.floor(Math.random() * 900) + 100;
  return `${first}.${last}${n}@gmail.com`;
}

function normalizeEmailPart(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'user';
}

function generatePhoneNumber(countryCode = 'INTL') {
  if (normalizeAddressCountryCode(countryCode) === 'PH') {
    return `09${String(Math.floor(Math.random() * 1000000000)).padStart(9, '0')}`;
  }
  return `+1${String(Math.floor(Math.random() * 10000000000)).padStart(10, '0')}`;
}

function generateBirthdateFromAge(age = 18, questionType = 'date') {
  const now = new Date();
  const birthYear = now.getFullYear() - (Number.isFinite(age) ? age : 18);
  const month = Math.floor(Math.random() * 12);
  const day = Math.floor(Math.random() * 28) + 1;
  const date = new Date(birthYear, month, day);
  const iso = date.toISOString().slice(0, 10);
  return questionType === 'date' ? iso : iso;
}

function generateSchoolName(address) {
  const city = address?.city || 'National';
  const province = address?.province || address?.state || '';
  const templates = [
    `${city} National High School`,
    `${city} State University`,
    `${city} College`,
    `University of ${city}`,
    province ? `${province} State University` : 'National University',
  ];
  return pickRandom(templates.filter(Boolean));
}

function generateCourseOrStrand(schoolName = '') {
  if (/\b(high\s*school|senior\s*high|national\s*high)\b/i.test(schoolName)) {
    return pickRandom(['STEM', 'HUMSS', 'ABM', 'GAS', 'TVL']);
  }
  const courses = window.spammerzCourses || [
    'BS Information Technology',
    'BS Computer Science',
    'BS Business Administration',
    'BS Hospitality Management',
    'Bachelor of Secondary Education'
  ];
  return pickRandom(courses);
}

function generateYearLevel(schoolName = '') {
  if (/\b(high\s*school|senior\s*high|national\s*high)\b/i.test(schoolName)) {
    return pickRandom(['Grade 11', 'Grade 12']);
  }
  return pickRandom(['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', '6th Year', 'Graduate', 'Postgraduate']);
}

function pickBestConsentOption(question) {
  const options = question.options || [];
  return options.find(opt => /\b(agree|yes|consent|accept|i agree)\b/i.test(opt)) || options[0] || 'I agree';
}

function weightedPreviewPick(values, weights) {
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

function createWeightedSubmissionPlan(formData, state, count) {
  const plan = new Map();
  if (!formData?.allQuestions?.length || count <= 0) return plan;

  formData.allQuestions.forEach((question, qIdx) => {
    const cfg = state.answers[qIdx];
    if (!cfg?.values?.length || !cfg.weights || cfg.weights.length !== cfg.values.length) return;
    if (!cfg.randomize || cfg.values.length <= 1) return;

    const queue = createWeightedValueQueue(cfg.values, cfg.weights, count);
    if (queue.length) plan.set(qIdx, queue);
  });

  return plan;
}

function createWeightedValueQueue(values, weights, count) {
  const counts = calculateWeightedCounts(weights, count);
  const queue = [];

  counts.forEach((itemCount, idx) => {
    for (let i = 0; i < itemCount; i++) queue.push(values[idx]);
  });

  return shuffleArray(queue);
}

function calculateWeightedCounts(weights, count) {
  const safeWeights = weights.map(weight => Math.max(0, Number(weight) || 0));
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return Array(weights.length).fill(0);

  const quotas = safeWeights.map((weight, idx) => {
    const exact = (weight / totalWeight) * count;
    return {
      idx,
      weight,
      base: Math.floor(exact),
      fraction: exact - Math.floor(exact),
    };
  });

  const counts = quotas.map(item => item.base);
  let remaining = count - counts.reduce((sum, itemCount) => sum + itemCount, 0);

  quotas
    .filter(item => item.weight > 0)
    .sort((a, b) => b.fraction - a.fraction || b.weight - a.weight || a.idx - b.idx)
    .forEach(item => {
      if (remaining <= 0) return;
      counts[item.idx] += 1;
      remaining--;
    });

  return counts;
}

function shuffleArray(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function applyPreviewValue(wrapper, question, value) {
  const inputs = getQuestionInputs(wrapper, question);
  if (!inputs || inputs.length === 0) return;

  const type = question.type;
  if (type === 'short_text' || type === 'paragraph') {
    const input = inputs[0];
    setInputValue(input, value);
    return;
  }

  if (type === 'date') {
    const normalized = normalizeDateValue(value);
    if (applySplitInputValues(inputs, question.id, {
      year: normalized.year,
      month: normalized.month,
      day: normalized.day,
    })) {
      return;
    }
    setInputValue(inputs[0], normalized.dateValue);
    return;
  }

  if (type === 'time') {
    const normalized = normalizeTimeValue(value);
    if (applySplitInputValues(inputs, question.id, {
      hour: normalized.hour,
      minute: normalized.minute,
    })) {
      return;
    }
    setInputValue(inputs[0], normalized.timeValue);
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

function setInputValue(input, value) {
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function normalizeDateValue(value) {
  const isValid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isValid ? new Date(value) : new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { dateValue: `${year}-${month}-${day}`, year, month, day };
}

function normalizeTimeValue(value) {
  const match = typeof value === 'string' && value.match(/^(\d{1,2}):(\d{2})$/);
  const now = new Date();
  const hour = String(match ? match[1] : now.getHours()).padStart(2, '0');
  const minute = String(match ? match[2] : now.getMinutes()).padStart(2, '0');
  return { timeValue: `${hour}:${minute}`, hour, minute };
}

function applySplitInputValues(inputs, questionId, parts) {
  if (!Array.isArray(inputs) || inputs.length === 0) return false;
  let matched = false;

  inputs.forEach(input => {
    const name = input.getAttribute('name') || '';
    const label = (input.getAttribute('aria-label') || '').toLowerCase();

    Object.entries(parts).forEach(([key, val]) => {
      if (!val) return;
      if (name === `${questionId}_${key}` || label.includes(key)) {
        setInputValue(input, val);
        matched = true;
      }
    });
  });

  if (matched) return true;

  const values = Object.values(parts).filter(Boolean);
  if (values.length && inputs.length >= values.length) {
    values.forEach((val, idx) => setInputValue(inputs[idx], val));
    return true;
  }

  return false;
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
      if (isRatingQuestion(question)) {
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
        <span class="spammerz-gform-rating-star">&#9733;</span>
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
 * Load names from markdown files
 */
async function loadNamesFromMdFiles() {
  try {
    const getResourceUrl = (path) => (
      window.chrome?.runtime?.getURL ? chrome.runtime.getURL(path) : path
    );
    const [firstNameRes, lastNameRes] = await Promise.all([
      fetch(getResourceUrl('Names/FirstName/firstname.md')),
      fetch(getResourceUrl('Names/LastName/lastname.md'))
    ]);
    if (!firstNameRes.ok || !lastNameRes.ok) {
      throw new Error(`Name source fetch failed: ${firstNameRes.status}/${lastNameRes.status}`);
    }
    const firstNames = await firstNameRes.text();
    const lastNames = await lastNameRes.text();
    return {
      firstNames: firstNames.split(/\r?\n/).map(n => n.trim()).filter(Boolean),
      lastNames: lastNames.split(/\r?\n/).map(n => n.trim()).filter(Boolean)
    };
  } catch (e) {
    return {
      firstNames: ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'James', 'Mary'],
      lastNames: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez']
    };
  }
}

/**
 * Load courses from markdown file
 */
async function loadCoursesFromMdFile() {
  try {
    const getResourceUrl = (path) => (
      window.chrome?.runtime?.getURL ? chrome.runtime.getURL(path) : path
    );
    const res = await fetch(getResourceUrl('options/courses.md'));
    if (!res.ok) {
      throw new Error(`Course source fetch failed: ${res.status}`);
    }
    const text = await res.text();
    return text.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
  } catch (e) {
    return [
      'BS Information Technology',
      'BS Computer Science',
      'BS Business Administration',
      'BS Hospitality Management',
      'Bachelor of Secondary Education'
    ];
  }
}

/**
 * Ensure courses are loaded
 */
async function ensureCoursesLoaded() {
  if (!window.spammerzCourses) {
    window.spammerzCourses = await loadCoursesFromMdFile();
  }
  return window.spammerzCourses;
}

/**
 * Pre-load courses (call this at initialization)
 */
function preloadCourses() {
  ensureCoursesLoaded(); // Fire and forget, will cache
}

/**
 * Load professions from markdown file
 */
async function loadProfessionsFromMdFile() {
  try {
    const getResourceUrl = (path) => (
      window.chrome?.runtime?.getURL ? chrome.runtime.getURL(path) : path
    );
    const res = await fetch(getResourceUrl('options/profession.md'));
    if (!res.ok) {
      throw new Error(`Profession source fetch failed: ${res.status}`);
    }
    const text = await res.text();
    return text.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
  } catch (e) {
    return ['Student', 'Employed', 'Self-employed', 'Unemployed'];
  }
}

/**
 * Ensure professions are loaded
 */
async function ensureProfessionsLoaded() {
  if (!window.spammerzProfessions) {
    window.spammerzProfessions = await loadProfessionsFromMdFile();
  }
  return window.spammerzProfessions;
}

/**
 * Pre-load professions (call this at initialization)
 */
function preloadProfessions() {
  ensureProfessionsLoaded(); // Fire and forget, will cache
}

/**
 * Create default naming configuration
 */
function createDefaultNameConfig() {
  return {
    enabled: true,
    fields: [],
    sources: {
      firstNames: [],
      lastNames: [],
    },
    namesLoadedFromMd: false,
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

  if (s.modalMinimized && !done) {
    container.innerHTML = `
      <div class="spammerz-modal-mini" id="spz-modal-mini">
        <div class="spammerz-modal-mini-title">Submitting</div>
        <div class="spammerz-modal-mini-progress">
          <span id="spz-mini-current">${s.submitted}</span>/<span id="spz-mini-total">${s.count}</span>
          <span class="spammerz-modal-mini-percent" id="spz-mini-percent">${progress}%</span>
        </div>
        <div class="spammerz-modal-mini-bar">
          <div class="spammerz-modal-mini-fill" id="spz-mini-progress" style="width:${progress}%"></div>
        </div>
        <div class="spammerz-modal-mini-actions">
          <button class="spammerz-modal-mini-btn" id="spz-mini-expand" type="button">Expand</button>
          <button class="spammerz-modal-mini-btn danger" id="spz-stop" type="button">Stop</button>
        </div>
      </div>
    `;
    return;
  }

  if (done) {
    container.innerHTML = `
      <div class="spammerz-modal">
        <div class="spammerz-modal-card">
          <div class="spammerz-modal-header">
            <div class="spammerz-modal-title">Submission Complete</div>
            <button class="spammerz-modal-icon-btn" id="spz-close" type="button">&#10005;</button>
          </div>
          <div class="spammerz-modal-body">
            <div class="spammerz-modal-success">
              <div class="spammerz-modal-success-icon">&#10003;</div>
              <div class="spammerz-modal-success-text">All ${s.count} responses submitted</div>
            </div>
            <div class="spammerz-modal-stats">
              <span class="spammerz-stat-success">&#10003; ${s.succeeded} succeeded</span>
              <span class="spammerz-stat-error">&#10007; ${s.failed} failed</span>
            </div>
          </div>
          <div class="spammerz-modal-actions-name">
            <button class="spammerz-btn-outline" id="spz-reset" type="button">Submit Again</button>
            <button class="spammerz-btn-primary" id="spz-close-alt" type="button">Close</button>
          </div>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="spammerz-modal">
        <div class="spammerz-modal-card">
          <div class="spammerz-modal-header">
            <div class="spammerz-modal-title">Submitting Responses</div>
            <div class="spammerz-modal-header-actions">
              <button class="spammerz-modal-icon-btn" id="spz-minimize" type="button">_</button>
              <button class="spammerz-modal-icon-btn" id="spz-close" type="button">&#10005;</button>
            </div>
          </div>
          <div class="spammerz-modal-body">
            <div class="spammerz-modal-progress">
              <div class="spammerz-modal-progress-num">
                <span id="spz-modal-current">${s.submitted}</span>
                <span class="spammerz-modal-sep">/</span>
                <span id="spz-modal-total">${s.count}</span>
              </div>
              <div class="spammerz-modal-progress-bar">
                <div class="spammerz-modal-progress-fill" id="spz-modal-progress" style="width:${progress}%"></div>
              </div>
              <div class="spammerz-modal-percent" id="spz-modal-percent">${progress}%</div>
            </div>
            <div class="spammerz-modal-stats">
              <span class="spammerz-stat-success" id="spz-modal-success">&#10003; ${s.succeeded}</span>
              <span class="spammerz-stat-error" id="spz-modal-failed">&#10007; ${s.failed}</span>
            </div>
          </div>
          <div class="spammerz-modal-actions-name">
            <button class="spammerz-btn-danger" id="spz-stop" type="button">Stop</button>
          </div>
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

  // Randomize all configurable weights
  const randomizeWeightsBtn = document.getElementById('spz-randomize-weights');
  if (randomizeWeightsBtn) {
    randomizeWeightsBtn.onclick = () => {
      const nextAnswers = window.spammerzState.answers.map((cfg, qIdx) => {
        if (!cfg) return cfg;

        const question = formData.allQuestions[qIdx];
        const optionCount = getConfigurableOptionCount(question, cfg);
        if (optionCount <= 1) return cfg;

        return {
          ...cfg,
          mode: 'weighted',
          randomize: true,
          weights: createRandomWeights(optionCount),
        };
      });

      updateState({ answers: nextAnswers });
    };
  }

  // Randomize weights for specific page/section
  document.querySelectorAll('.spammerz-random-page-btn').forEach(btn => {
    btn.onclick = () => {
      const targetPage = parseInt(btn.dataset.page);
      const nextAnswers = window.spammerzState.answers.map((cfg, qIdx) => {
        if (!cfg) return cfg;

        const question = formData.allQuestions[qIdx];
        if (question.pageIndex !== targetPage) return cfg;

        const optionCount = getConfigurableOptionCount(question, cfg);
        if (optionCount <= 1) return cfg;

        return {
          ...cfg,
          mode: 'weighted',
          randomize: true,
          weights: createRandomWeights(optionCount),
        };
      });

      updateState({ answers: nextAnswers });
    };
  });

  // Randomize weights for specific question
  document.querySelectorAll('.spammerz-random-question-btn').forEach(btn => {
    btn.onclick = () => {
      const qIdx = parseInt(btn.dataset.qidx);
      const cfg = window.spammerzState.answers[qIdx];
      if (!cfg) return;

      const question = formData.allQuestions[qIdx];
      const optionCount = getConfigurableOptionCount(question, cfg);
      if (optionCount <= 1) return;

      const newWeights = createRandomWeights(optionCount);
      cfg.mode = 'weighted';
      cfg.randomize = true;
      cfg.weights = newWeights;

      // Update UI
      const weightsList = btn.closest('.spammerz-weights-list');
      if (weightsList) {
        weightsList.querySelectorAll('.spammerz-weight-slider').forEach((slider, idx) => {
          if (idx < newWeights.length) {
            slider.value = newWeights[idx];
            const row = slider.closest('.spammerz-weight-row');
            const valueSpan = row.querySelector('.spammerz-weight-value');
            if (valueSpan) valueSpan.textContent = String(newWeights[idx]);
          }
        });
        weightsList.querySelectorAll('.spammerz-weight-row').forEach((weightRow, idx) => {
          const percentSpan = weightRow.querySelector('.spammerz-weight-percent');
          if (percentSpan) {
            percentSpan.textContent = calculatePercentage(newWeights, idx).toFixed(0) + '%';
          }
        });
        const totalEl = weightsList.querySelector('.spammerz-weights-total');
        if (totalEl) totalEl.textContent = `Total weight: ${newWeights.reduce((a, b) => a + b, 0)}`;
      }

      updateState({ answers: window.spammerzState.answers });
    };
  });

  // Weight sliders
  document.querySelectorAll('.spammerz-weight-slider').forEach(input => {
    input.oninput = (e) => {
      const qIdx = parseInt(e.target.dataset.qidx);
      const optIdx = parseInt(e.target.dataset.optidx);
      const newWeight = parseInt(e.target.value) || 0;

      const cfg = window.spammerzState.answers[qIdx];
      if (cfg && cfg.weights) {
        cfg.weights[optIdx] = newWeight;
        cfg.mode = 'weighted';
        cfg.randomize = true;

        const row = e.target.closest('.spammerz-weight-row');
        const valueSpan = row.querySelector('.spammerz-weight-value');
        if (valueSpan) valueSpan.textContent = String(newWeight);

        row.closest('.spammerz-weights-list')
          ?.querySelectorAll('.spammerz-weight-row')
          .forEach((weightRow, rowIdx) => {
            const percentSpan = weightRow.querySelector('.spammerz-weight-percent');
            if (percentSpan) {
              percentSpan.textContent = calculatePercentage(cfg.weights, rowIdx).toFixed(0) + '%';
            }
          });

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

  document.querySelectorAll('.spammerz-age-input').forEach(input => {
    input.oninput = (e) => {
      const qIdx = parseInt(e.target.dataset.qidx, 10);
      const field = e.target.dataset.ageField;
      const cfg = window.spammerzState.answers[qIdx];
      if (!cfg) return;
      cfg.ageConfig = normalizeAgeConfig({
        ...(cfg.ageConfig || {}),
        [field]: Number.parseInt(e.target.value, 10),
      });
    };
    input.onchange = () => {
      updateState({ answers: window.spammerzState.answers });
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  });

  document.querySelectorAll('.spammerz-smart-gender-option').forEach(input => {
    input.onchange = (e) => {
      const qIdx = Number.parseInt(e.target.dataset.qidx, 10);
      const cfg = window.spammerzState.answers[qIdx];
      if (!cfg) return;
      const selected = Array.from(document.querySelectorAll(`.spammerz-smart-gender-option[data-qidx="${qIdx}"]:checked`)).map(el => el.value);
      cfg.smartConfig = {
        ...(cfg.smartConfig || {}),
        genderOptions: selected.length ? selected : ['Male', 'Female'],
      };
      syncConfigValuesToOptions(cfg, cfg.smartConfig.genderOptions);
      e.target.closest('.spammerz-smart-chip')?.classList.toggle('active', e.target.checked);
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  });

  document.querySelectorAll('[data-smart-field="genderAll"]').forEach(button => {
    button.onclick = (e) => {
      const qIdx = Number.parseInt(e.currentTarget.dataset.qidx, 10);
      const cfg = window.spammerzState.answers[qIdx];
      if (!cfg) return;
      const inputs = Array.from(document.querySelectorAll(`.spammerz-smart-gender-option[data-qidx="${qIdx}"]`));
      inputs.forEach(input => {
        input.checked = true;
        input.closest('.spammerz-smart-chip')?.classList.add('active');
      });
      cfg.smartConfig = {
        ...(cfg.smartConfig || {}),
        genderOptions: inputs.map(input => input.value),
      };
      syncConfigValuesToOptions(cfg, cfg.smartConfig.genderOptions);
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  });

  document.querySelectorAll('.spammerz-household-input').forEach(input => {
    input.oninput = (e) => {
      const qIdx = Number.parseInt(e.target.dataset.qidx, 10);
      const field = e.target.dataset.householdField;
      const cfg = window.spammerzState.answers[qIdx];
      if (!cfg) return;
      cfg.householdConfig = normalizeHouseholdConfig({
        ...(cfg.householdConfig || {}),
        [field]: Number.parseInt(e.target.value, 10),
      });
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

  // Weight mode cards
  document.querySelectorAll('input[name="spz-weight-mode"]').forEach(input => {
    input.onchange = (e) => {
      if (!e.target.checked) return;
      updateState({ weightMode: e.target.value });
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  });

  // Start button - use event delegation to avoid handler issues on re-render
  const container = document.getElementById('spammerz-container');
  if (container) {
    container.onclick = (e) => {
      const startBtn = e.target.closest('#spz-start-btn');
      if (!startBtn) return;
      if (startBtn.disabled) return;
      if (window.spammerzState.running) return;

      // Check for email collection and show blocking modal
      const emailCollectionEnabled = detectEmailCollectionEnabled();
      if (emailCollectionEnabled) {
        showEmailCollectionModal();
        return;
      }

      // Use fresh state from window to avoid closure staleness
      const nextState = {
        ...window.spammerzState,
        running: true,
        submitted: 0,
        succeeded: 0,
        failed: 0,
      };
      updateState(nextState);
      startSubmissionLoop(window.spammerzFormData, nextState, updateState);
    };
  }

  // General Settings button
  const settingsBtn = document.getElementById('spz-general-settings-btn');
  if (settingsBtn) {
    settingsBtn.onclick = async () => {
      if (window.spammerzState.autoNameConfig && !window.spammerzState.autoNameConfig.namesLoadedFromMd) {
        const loaded = await loadNamesFromMdFiles();
        window.spammerzState.autoNameConfig = {
          ...window.spammerzState.autoNameConfig,
          sources: loaded,
          namesLoadedFromMd: true,
        };
        updateState({ autoNameConfig: window.spammerzState.autoNameConfig });
      }
      renderAutoNameModal(window.spammerzState);
    };
  }

  const addressSettingsBtn = document.getElementById('spz-address-settings-btn');
  if (addressSettingsBtn) {
    addressSettingsBtn.onclick = () => {
      renderAutoAddressModal(window.spammerzState);
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

  const autoAddressToggle = document.getElementById('spz-auto-address-toggle');
  if (autoAddressToggle) {
    autoAddressToggle.onchange = (e) => {
      const enabled = e.target.checked;
      const config = window.spammerzState.autoAddressConfig || createDefaultAddressConfig();
      const fields = detectAddressQuestions(window.spammerzFormData.allQuestions);
      updateState({ autoAddressConfig: { ...config, enabled, fields } });
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }

  // Auto Nationality toggle
  const autoNationalityToggle = document.getElementById('spz-auto-nationality-toggle');
  if (autoNationalityToggle) {
    autoNationalityToggle.onchange = (e) => {
      const enabled = e.target.checked;
      const config = window.spammerzState.autoNationalityConfig || createDefaultNationalityConfig();
      const fields = detectNationalityQuestions(formData.allQuestions);
      updateState({ autoNationalityConfig: { ...config, enabled, fields } });
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }

  // Nationality settings button
  const nationalitySettingsBtn = document.getElementById('spz-nationality-settings-btn');
  if (nationalitySettingsBtn) {
    nationalitySettingsBtn.onclick = () => {
      renderAutoNationalityModal(window.spammerzState);
    };
  }

  // Stop button
  const stopBtn = document.getElementById('spz-stop');
  if (stopBtn) {
    stopBtn.onclick = () => {
      window.spammerzState.running = false;
      updateState({ running: false });
    };
  }

  // Close button
  const closeBtn = document.getElementById('spz-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      window.spammerzState.submitted = 0;
      window.spammerzState.succeeded = 0;
      window.spammerzState.failed = 0;
      window.spammerzState.modalMinimized = false;
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }

  const closeAltBtn = document.getElementById('spz-close-alt');
  if (closeAltBtn) {
    closeAltBtn.onclick = () => {
      window.spammerzState.submitted = 0;
      window.spammerzState.succeeded = 0;
      window.spammerzState.failed = 0;
      window.spammerzState.modalMinimized = false;
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
      window.spammerzState.modalMinimized = false;
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }

  // Minimize/expand modal
  const minimizeBtn = document.getElementById('spz-minimize');
  if (minimizeBtn) {
    minimizeBtn.onclick = () => {
      window.spammerzState.modalMinimized = true;
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }

  const miniExpandBtn = document.getElementById('spz-mini-expand');
  if (miniExpandBtn) {
    miniExpandBtn.onclick = () => {
      window.spammerzState.modalMinimized = false;
      window.renderSpammerZUI(formData, window.spammerzState, updateState);
    };
  }
}

/**
 * Start the actual submission loop
 */
async function startSubmissionLoop(formData, state, updateState) {
  const getState = () => window.spammerzState;
  const startIndex = getState().submitted;
  const remainingCount = Math.max(0, getState().count - startIndex);
  const submissionPlan = (getState().weightMode || 'plan') === 'plan'
    ? createWeightedSubmissionPlan(formData, getState(), remainingCount)
    : new Map();

  for (let i = startIndex; i < getState().count; i++) {
    if (!getState().running) break;

    window.spammerzState.submitted = i + 1;
    const planIndex = i - startIndex;

    // Build payload
    const payload = buildLiveFormPayload(formData, getState(), submissionPlan, planIndex);
    if (!payload) {
      break;
    }

    // Submit
    try {
      const liveForm = findLiveFormRoot();
      const actionUrl = liveForm?.getAttribute('action') || formData.actionUrl;
      ensureGoogleFormFields(payload, liveForm);
      logFormData(payload, { maxEntries: 40 });
      logMissingQuestionEntries(payload, formData);
      logMissingEntryDetails(payload, formData);
      logDateTimePayloadIssues(payload);
      logRequiredEmptyValues(payload, formData);
      logSuspiciousPayloadEntries(payload, formData);
      logSentinelFields(payload);
      logEmptyEntryValues(payload);
      logDomRequiredFill(payload);
      logEmptyEntryFill(payload);
      logEmptyEntryDetails(payload, formData);
      logEntryMapOptionMismatches(payload, formData);

      await fetch(actionUrl, {
        method: 'POST',
        body: payload,
        mode: 'no-cors',
      });
      window.spammerzState.succeeded++;
    } catch (err) {
      logSubmitDebug('submit-error', payload, formData, { error: err?.message || String(err) });
      window.spammerzState.failed++;
      // Show email collection warning on failures
      if (window.spammerzState.failed === 1) {
        showEmailCollectionWarning();
      }
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
function buildLiveFormPayload(formData, state, submissionPlan = new Map(), planIndex = 0) {
  const formEl = findLiveFormRoot();
  if (!formEl) return null;

  resetLiveFormInputs(formEl);

  const autoNameConfig = state.autoNameConfig;
  const detectedFields = autoNameConfig?.enabled ? detectNameQuestions(formData.allQuestions) : [];
  const activeFields = autoNameConfig?.fields?.length ? autoNameConfig.fields : detectedFields;
  const generatedName = autoNameConfig?.enabled && detectedFields.length > 0 ? generateName(autoNameConfig) : null;
  const autoAddressConfig = state.autoAddressConfig || createDefaultAddressConfig();
  const detectedAddressFields = autoAddressConfig.enabled ? detectAddressQuestions(formData.allQuestions) : [];
  const activeAddressFields = autoAddressConfig.fields?.length ? autoAddressConfig.fields : detectedAddressFields;
  const generatedAddress = autoAddressConfig.enabled ? generateAddress(autoAddressConfig) : null;
  const autoNationalityConfig = state.autoNationalityConfig || createDefaultNationalityConfig();
  const detectedNationalityFields = autoNationalityConfig.enabled ? detectNationalityQuestions(formData.allQuestions) : [];
  const activeNationalityFields = autoNationalityConfig.fields?.length ? autoNationalityConfig.fields : detectedNationalityFields;
  const smartContext = createSmartSurveyContext(formData, state, generatedName, generatedAddress);
  const resolvedEntries = [];

  formData.allQuestions.forEach((q, idx) => {
    const cfg = state.answers[idx];
    if (!cfg) return;

    const plannedValue = submissionPlan.get(idx)?.[planIndex];
    let value = plannedValue !== undefined ? plannedValue : resolvePreviewValueForQuestion(cfg, q);
    if (detectAgeQuestion(q, idx)) {
      value = generateAgeValue(cfg.ageConfig);
    }
    const smartValue = resolveSmartSurveyValue(q, cfg, smartContext, idx);
    if (smartValue !== null) value = smartValue;
    if (generatedName && activeFields.length) {
      const binding = activeFields.find(f => f.questionIndex === idx);
      if (binding) {
        value = formatGeneratedNameForField(generatedName, binding);
      }
    }
    if (generatedAddress && activeAddressFields.length) {
      const binding = activeAddressFields.find(f => f.questionIndex === idx);
      if (binding) value = formatGeneratedAddressForField(generatedAddress, binding);
    }
    // Apply nationality if detected
    if (smartContext.nationality && smartContext.nationality.nationality) {
      const nationalityBinding = activeNationalityFields?.find(f => f.questionIndex === idx);
      if (nationalityBinding) {
        value = formatGeneratedNationalityForField(nationalityBinding, smartContext.nationality);
      }
    }

    applyPreviewValue(formEl, q, value);
    if (q.id && value !== '' && value != null && canApplyResolvedEntry(q)) {
      resolvedEntries.push({ id: q.id, value });
    }
  });

  const payload = new FormData(formEl);
  applyResolvedEntriesToPayload(payload, resolvedEntries);

  // Fill any entry IDs that weren't in the DOM (grid rows, hidden fields, etc.)
  // using Google's internal FB_PUBLIC_LOAD_DATA_ structure.
  fillMissingEntries(payload, formData);
  ensureRequiredEntriesFilled(payload, formData);
  normalizeSplitDateTimePayload(payload);
  ensureDomRequiredEntriesFilled(payload, formEl, formData);
  fillEmptyEntryValues(payload, formEl, formData);
  ensureSmartBirthdatePayload(payload, formData, smartContext);

  return payload;
}

function applyResolvedEntriesToPayload(payload, entries) {
  entries.forEach(({ id, value }) => {
    payload.delete(id);
    payload.append(id, value);
  });
}

function canApplyResolvedEntry(question) {
  return !['date', 'time', 'grid', 'checkbox_grid'].includes(question.type);
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
  if (entryMap.size === 0) {
    // FB_PUBLIC_LOAD_DATA_ unavailable - fall back to DOM scan
    fillMissingEntriesFromDOM(payload, formDataModel);
  }

  // Build set of keys already present in the payload
  const present = new Set(payload.keys());
  const requiredKeys = getRequiredPayloadKeys(formDataModel);

  entryMap.forEach((options, entryKey) => {
    if (present.has(entryKey)) return; // already filled by DOM
    if (!requiredKeys.has(entryKey)) return;

    if (!options || options.length === 0) {
      // Free-text field
      payload.append(entryKey, getFallbackValueForEntry(entryKey, formDataModel));
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
    if (!q.required) return;
    if (!q.id || present.has(q.id)) return;
    if (!canApplyResolvedEntry(q)) return;

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
  }
}

function getRequiredPayloadKeys(formDataModel) {
  const keys = new Set();
  (formDataModel?.allQuestions || []).forEach(q => {
    if (!q.required) return;
    if (q.id && (canApplyResolvedEntry(q) || q.type === 'date' || q.type === 'time')) keys.add(q.id);
    if ((q.type === 'grid' || q.type === 'checkbox_grid') && Array.isArray(q.gridRowIds)) {
      q.gridRowIds.forEach(rowId => { if (rowId) keys.add(rowId); });
    }
  });
  return keys;
}

function getFallbackValueForEntry(entryKey, formDataModel) {
  const question = (formDataModel?.allQuestions || []).find(q => q.id === entryKey);
  if (!question) return 'Auto response';
  if (question.type === 'date') return new Date().toISOString().slice(0, 10);
  if (question.type === 'time') return new Date().toTimeString().slice(0, 5);
  return 'Auto response';
}

function getFallbackValueForQuestion(question, formEl) {
  if (!question) return 'Auto response';
  if (question.options && question.options.length > 0) {
    return question.options[Math.floor(Math.random() * question.options.length)];
  }
  if (question.type === 'date') return new Date().toISOString().slice(0, 10);
  if (question.type === 'time') return new Date().toTimeString().slice(0, 5);
  const fromDom = pickValueFromDom(formEl, question.id);
  return fromDom ?? 'Auto response';
}

function pickValueFromDom(formEl, entryId) {
  if (!formEl || !entryId) return null;
  const inputs = Array.from(formEl.querySelectorAll(`[name="${entryId}"]`));
  if (!inputs.length) return null;

  const select = inputs.find(input => input.tagName.toLowerCase() === 'select');
  if (select) {
    const option = Array.from(select.options).find(opt => opt.value && opt.value !== '__other__');
    return option ? option.value : null;
  }

  const radio = inputs.filter(input => input.type === 'radio' || input.type === 'checkbox');
  if (radio.length) {
    const pick = radio[Math.floor(Math.random() * radio.length)];
    return pick?.value || null;
  }

  return null;
}

function extractRequiredEntryIdsFromDOM(formEl) {
  if (!formEl) return new Set();
  const required = new Set();
  const blocks = Array.from(formEl.querySelectorAll('[role="listitem"]'));

  blocks.forEach(block => {
    const hasRequired = block.querySelector('[aria-required="true"], .freebirdFormviewerViewItemsItemRequiredAsterisk');
    if (!hasRequired) return;
    block.querySelectorAll('input[name^="entry."], textarea[name^="entry."], select[name^="entry."]')
      .forEach(input => {
        const name = input.getAttribute('name');
        if (name && !name.endsWith('_sentinel')) required.add(name);
      });
  });

  return required;
}

function ensureDomRequiredEntriesFilled(payload, formEl, formDataModel) {
  const requiredIds = extractRequiredEntryIdsFromDOM(formEl);
  if (!requiredIds.size) return;

  const filled = [];
  requiredIds.forEach(entryId => {
    const values = payload.getAll(entryId).map(v => String(v));
    const hasAny = values.length > 0;
    const allEmpty = hasAny ? values.every(v => v === '' || v == null) : true;
    if (hasAny && !allEmpty) return;

    if (hasAny) payload.delete(entryId);
    const question = (formDataModel?.allQuestions || []).find(q => q.id === entryId);
    const value = getFallbackValueForQuestion(question, formEl);
    payload.append(entryId, value);
    filled.push({ id: entryId, value });
  });

  if (filled.length) {
    payload.__spzDomRequiredFilled = filled;
  }
}

function fillEmptyEntryValues(payload, formEl, formDataModel) {
  const filled = [];
  for (const [key, value] of payload.entries()) {
    if (!key.startsWith('entry.') || key.endsWith('_sentinel')) continue;
    if (value !== '' && value != null) continue;

    const question = (formDataModel?.allQuestions || []).find(q => q.id === key);
    if (!question) continue;

    payload.delete(key);
    const fallback = getFallbackValueForQuestion(question, formEl);
    payload.append(key, fallback);
    filled.push({ id: key, value: fallback, title: question.title, type: question.type });
  }

  if (filled.length) {
    payload.__spzEmptyEntryFilled = filled;
  }
}

function ensureRequiredEntriesFilled(payload, formDataModel) {
  if (!formDataModel?.allQuestions?.length) return;
  const replaced = [];

  formDataModel.allQuestions.forEach(q => {
    if (!q.required || !q.id) return;
    const values = payload.getAll(q.id);
    const hasAny = values.length > 0;
    const allEmpty = hasAny ? values.every(v => v === '' || v == null) : true;
    if (hasAny && !allEmpty) return;

    if (hasAny) payload.delete(q.id);

    let value = 'Auto response';
    if (q.options && q.options.length > 0) {
      value = q.options[Math.floor(Math.random() * q.options.length)];
    } else if (q.type === 'date') {
      value = new Date().toISOString().slice(0, 10);
    } else if (q.type === 'time') {
      value = new Date().toTimeString().slice(0, 5);
    }

    payload.append(q.id, value);
    if (q.type === 'date') {
      const normalized = normalizeDateValue(value);
      ensurePayloadField(payload, `${q.id}_year`, normalized.year);
      ensurePayloadField(payload, `${q.id}_month`, normalized.month);
      ensurePayloadField(payload, `${q.id}_day`, normalized.day);
    } else if (q.type === 'time') {
      const normalized = normalizeTimeValue(value);
      ensurePayloadField(payload, `${q.id}_hour`, normalized.hour);
      ensurePayloadField(payload, `${q.id}_minute`, normalized.minute);
    }
    replaced.push({ id: q.id, value });
  });

  if (replaced.length) {
  }
}

function ensurePayloadField(payload, name, value) {
  const values = payload.getAll(name);
  if (!values.length) {
    payload.append(name, value);
    return;
  }
  const allEmpty = values.every(v => v === '' || v == null);
  if (!allEmpty) return;
  payload.delete(name);
  payload.append(name, value);
}

function ensureSmartBirthdatePayload(payload, formDataModel, smartContext) {
  if (!formDataModel?.allQuestions?.length) return;

  formDataModel.allQuestions.forEach((question, idx) => {
    const binding = detectSmartSurveyQuestion(question, idx);
    if (!binding || binding.fieldType !== 'birthdate') return;
    if (!question.id) return;

    const rawValue = generateBirthdateFromAge(smartContext?.age || 18, question.type);
    const normalized = normalizeDateValue(rawValue);

    ensurePayloadFieldValidated(payload, question.id, normalized.dateValue, isValidDateValue);

    if (question.type === 'date') {
      ensurePayloadField(payload, `${question.id}_year`, normalized.year);
      ensurePayloadField(payload, `${question.id}_month`, normalized.month);
      ensurePayloadField(payload, `${question.id}_day`, normalized.day);
    }
  });
}

function normalizeSplitDateTimePayload(payload) {
  const now = new Date();
  const defaults = {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    day: String(now.getDate()).padStart(2, '0'),
    hour: String(now.getHours()).padStart(2, '0'),
    minute: String(now.getMinutes()).padStart(2, '0'),
  };
  const dateValue = `${defaults.year}-${defaults.month}-${defaults.day}`;
  const timeValue = `${defaults.hour}:${defaults.minute}`;

  const entries = Array.from(payload.entries());
  const byBase = new Map();

  entries.forEach(([key, value]) => {
    const match = key.match(/^(entry\.\d+)_(year|month|day|hour|minute)$/);
    if (!match) return;
    const baseId = match[1];
    const part = match[2];
    if (!byBase.has(baseId)) byBase.set(baseId, {});
    byBase.get(baseId)[part] = { key, value };
  });

  byBase.forEach((parts, baseId) => {
    if (parts.year || parts.month || parts.day) {
      if (parts.year) ensurePayloadField(payload, parts.year.key, defaults.year);
      if (parts.month) ensurePayloadField(payload, parts.month.key, defaults.month);
      if (parts.day) ensurePayloadField(payload, parts.day.key, defaults.day);
      ensurePayloadFieldValidated(payload, baseId, dateValue, isValidDateValue);
    }

    if (parts.hour || parts.minute) {
      if (parts.hour) ensurePayloadField(payload, parts.hour.key, defaults.hour);
      if (parts.minute) ensurePayloadField(payload, parts.minute.key, defaults.minute);
      ensurePayloadFieldValidated(payload, baseId, timeValue, isValidTimeValue);
    }
  });
}

function isValidDateValue(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimeValue(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function ensurePayloadFieldValidated(payload, name, value, isValid) {
  const values = payload.getAll(name).map(v => String(v));
  if (!values.length) {
    payload.append(name, value);
    return;
  }
  const allValid = values.every(v => isValid(v));
  if (allValid) return;
  payload.delete(name);
  payload.append(name, value);
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

/**
 * Detects if the Google Form has "Collect email addresses" enabled.
 * This feature requires Google authentication and causes 400 errors when submissions bypass it.
 */
function detectEmailCollectionEnabled() {
  // Method 1: Check FB_PUBLIC_LOAD_DATA_ for email collection setting
  const raw = getFbPublicLoadData();
  if (raw && Array.isArray(raw) && raw.length > 1) {
    try {
      // raw[1] contains form metadata, raw[1][0] contains form settings
      const formSettings = raw[1]?.[0];
      if (Array.isArray(formSettings)) {
        // Settings array structure: check common boolean positions
        // Index 2-4 often contains quiz/email flags
        for (let i = 2; i < Math.min(formSettings.length, 10); i++) {
          const setting = formSettings[i];
          // Check for email collection at specific indices
          if (setting === true && (i === 5 || i === 7)) {
            return true;
          }
          // Check if it's an object with email-related flags
          if (setting && typeof setting === 'object') {
            if (setting.emailCollection || setting.collectEmail) {
              return true;
            }
            // Check nested boolean at positions 5 or 7
            if (setting[5] === true || setting[7] === true) {
              return true;
            }
          }
        }
      }
    } catch (e) {}
  }

  // Method 2: Check for email input field in the form DOM
  const formEl = findLiveFormRoot();
  if (formEl) {
    // Look for email-related inputs or labels
    const emailInputs = formEl.querySelectorAll(
      'input[name*="email" i], input[placeholder*="email" i], input[aria-label*="email" i]'
    );
    if (emailInputs.length > 0) return true;

    // Check for entry fields associated with email
    const entryFields = formEl.querySelectorAll('input[name^="entry."]');
    for (const field of entryFields) {
      const name = (field.name || '').toLowerCase();
      const id = (field.id || '').toLowerCase();
      if (name.includes('email') || id.includes('email')) {
        return true;
      }
    }

    // Check for email-related labels/text
    const emailLabels = formEl.querySelectorAll('.docssharedWizSelectSearchOptionLabel, span, label, div[data-value]');
    for (const label of emailLabels) {
      const text = (label.textContent || '').toLowerCase().trim();
      // Look for "Email Address" or similar email field labels
      if (text === 'email address' || text.includes('email address')) {
        return true;
      }
    }

    // Check URL for email collection parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('usp') === 'sf' || urlParams.get('usp')?.startsWith('email')) {
      return true;
    }
  }

  return false;
}

/**
 * Displays a warning message about email collection requirements.
 * This is shown when submissions fail due to Google Forms' email collection feature.
 */
function showEmailCollectionWarning(permanent = true) {
  // Don't show duplicate warnings
  const existing = document.getElementById('spz-email-warning');
  if (existing) return;

  const container = document.getElementById('spammerz-container') || document.body;
  const warning = document.createElement('div');
  warning.id = 'spz-email-warning';
  warning.innerHTML = `
    <div class="spz-warning-banner">
      <div class="spz-warning-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <div class="spz-warning-content">
        <strong>Email Collection Enabled</strong>
        <p>Submissions are failing because this form requires Google authentication. The form owner must disable "Collect email addresses" in Google Forms settings for SpammerZ to work.</p>
      </div>
      <button class="spz-warning-close" onclick="this.parentElement.remove()">&#10005;</button>
    </div>
  `;

  // Inject styles if not already present
  if (!document.getElementById('spz-warning-styles')) {
    const style = document.createElement('style');
    style.id = 'spz-warning-styles';
    style.textContent = `
      #spammerz-container > .spz-warning-banner,
      .spz-warning-banner {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        background: var(--spammerz-card);
        border: 1px solid rgba(255, 68, 68, 0.3);
        border-radius: 10px;
        padding: 12px 16px;
        font-family: inherit;
        animation: spz-warning-appear 0.3s ease-out;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      }
      @keyframes spz-warning-appear {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .spz-warning-icon {
        color: var(--spammerz-error);
        flex-shrink: 0;
        background: rgba(255, 68, 68, 0.1);
        border-radius: 6px;
        padding: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .spz-warning-content {
        flex: 1;
        min-width: 0;
      }
      .spz-warning-content strong {
        display: block;
        color: var(--spammerz-text);
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .spz-warning-content p {
        color: var(--spammerz-text-muted);
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
      }
      .spz-warning-close {
        background: none;
        border: none;
        color: var(--spammerz-text-muted);
        cursor: pointer;
        padding: 4px;
        font-size: 14px;
        flex-shrink: 0;
        transition: color 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, sans-serif;
      }
      .spz-warning-close:hover {
        color: var(--spammerz-error);
      }
      #spammerz-container .spz-warning-banner {
        position: fixed;
        bottom: 20px;
        right: 20px;
        max-width: 380px;
        z-index: 999999;
      }
    `;
    document.head.appendChild(style);
  }

  // Insert warning at the bottom of container if it's the spammerz container
  if (container.id === 'spammerz-container') {
    container.insertBefore(warning, container.firstChild);
  } else {
    container.appendChild(warning);
  }
}

/**
 * Shows a blocking modal warning when email collection is detected.
 * The user must acknowledge before the spammer can be used.
 */
function showEmailCollectionModal() {
  // Don't show duplicate modals
  const existing = document.getElementById('spz-email-modal');
  if (existing) return;

  const modal = document.createElement('div');
  modal.id = 'spz-email-modal';
  modal.innerHTML = `
    <div class="spz-email-backdrop">
      <div class="spz-email-modal">
        <div class="spz-email-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div class="spz-email-header">
          <h2>Error: Email Collection Enabled</h2>
        </div>
        <div class="spz-email-body">
          <p class="spz-email-desc">This form requires Google account authentication. SpammerZ cannot work with forms that collect email addresses.</p>
          <div class="spz-email-steps">
            <h3>To fix this, the form owner must:</h3>
            <ol>
              <li>Open the form in Google Forms</li>
              <li>Click the <strong>Settings</strong> (gear icon)</li>
              <li>Go to <strong>General</strong> tab</li>
              <li>Find <strong>"Collect email addresses"</strong></li>
              <li>Change it to <strong>"Do not collect"</strong> or use <strong>"Responder Input"</strong></li>
            </ol>
          </div>
          <div class="spz-email-actions">
            <a href="https://support.google.com/a/users/answer/13974922" target="_blank" class="spz-email-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Learn more about email collection settings
            </a>
          </div>
          <p class="spz-email-tip">Tip: Ask the form owner to disable email collection, or use the "Don't collect" / "Responder can type email" option instead.</p>
        </div>
      </div>
    </div>
  `;

  // Inject modal styles
  if (!document.getElementById('spz-email-styles')) {
    const style = document.createElement('style');
    style.id = 'spz-email-styles';
    style.textContent = `
      .spz-email-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(4px);
        z-index: 9999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .spz-email-modal {
        background: var(--spammerz-card);
        border: 1px solid var(--spammerz-border);
        border-radius: 16px;
        width: min(480px, calc(100vw - 32px));
        max-width: 480px;
        overflow: hidden;
        box-shadow:
          0 24px 80px rgba(0, 0, 0, 0.6),
          0 0 0 1px rgba(255, 68, 68, 0.1) inset,
          0 0 60px rgba(255, 68, 68, 0.08);
        animation: modalSlideIn 0.25s ease;
      }
      .spz-email-icon {
        background: linear-gradient(135deg, rgba(255, 68, 68, 0.15), rgba(255, 68, 68, 0.05));
        padding: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .spz-email-icon svg {
        width: 48px;
        height: 48px;
        color: var(--spammerz-error);
        filter: drop-shadow(0 0 20px rgba(255, 68, 68, 0.4));
      }
      .spz-email-header {
        padding: 20px 24px 0 24px;
      }
      .spz-email-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: var(--spammerz-error);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .spz-email-header h2::before {
        content: '';
        display: inline-block;
        width: 4px;
        height: 20px;
        background: var(--spammerz-error);
        border-radius: 2px;
        box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
      }
      .spz-email-body {
        padding: 16px 24px 24px;
      }
      .spz-email-desc {
        margin: 0 0 20px 0;
        font-size: 14px;
        color: var(--spammerz-text-secondary);
        line-height: 1.6;
      }
      .spz-email-steps {
        background: rgba(255, 68, 68, 0.08);
        border: 1px solid rgba(255, 68, 68, 0.2);
        border-radius: 12px;
        padding: 16px 20px;
        margin-bottom: 20px;
      }
      .spz-email-steps h3 {
        margin: 0 0 12px 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--spammerz-text);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .spz-email-steps ol {
        margin: 0;
        padding-left: 20px;
        font-size: 13px;
        color: var(--spammerz-text-secondary);
        line-height: 1.8;
      }
      .spz-email-steps strong {
        color: var(--spammerz-text);
        font-weight: 600;
      }
      .spz-email-actions {
        display: flex;
        justify-content: center;
        margin-bottom: 16px;
      }
      .spz-email-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 16px;
        background: rgba(255, 68, 68, 0.1);
        border: 1px solid rgba(255, 68, 68, 0.3);
        border-radius: 8px;
        color: var(--spammerz-text-secondary);
        text-decoration: none;
        font-size: 13px;
        transition: all 0.15s ease;
      }
      .spz-email-link:hover {
        background: rgba(255, 68, 68, 0.2);
        border-color: rgba(255, 68, 68, 0.5);
        color: var(--spammerz-text);
      }
      .spz-email-tip {
        margin: 0;
        padding: 12px 16px;
        background: var(--spammerz-card);
        border: 1px solid var(--spammerz-border);
        border-radius: 8px;
        font-size: 12px;
        color: var(--spammerz-text-muted);
        line-height: 1.5;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(modal);
}

function logFormData(formData, options = {}) {
  return;
}

function logMissingQuestionEntries(formData, formDataModel) {
  return;
}

function logMissingEntryDetails(formData, formDataModel) {
  return;
}

function logDateTimePayloadIssues(formData) {
  return;
}

function logRequiredEmptyValues(formData, formDataModel) {
  return;
}

function logSuspiciousPayloadEntries(formData, formDataModel) {
  return;
}

function logSentinelFields(formData) {
  return;
}

function logEmptyEntryValues(formData) {
  return;
}

function logDomRequiredFill(formData) {
  return;
}

function logEmptyEntryFill(formData) {
  return;
}

function logEmptyEntryDetails(formData, formDataModel) {
  return;
}

function logEntryMapOptionMismatches(formData, formDataModel) {
  return;
}

function logSubmitDebug(context, formData, formDataModel, extra = {}) {
  return;
}

function findSuspiciousPayloadEntries(formData, formDataModel) {
  const issues = [];
  (formDataModel?.allQuestions || []).forEach(q => {
    if (!q.id) return;
    const values = formData.getAll(q.id).map(v => String(v));
    if (q.required && values.length === 0) {
      issues.push({ id: q.id, title: q.title, type: q.type, issue: 'required missing' });
    }
    if ((q.type === 'multiple_choice' || q.type === 'dropdown' || q.type === 'checkbox') && values.length) {
      const invalid = values.filter(value => q.options?.length && !q.options.includes(value));
      if (invalid.length) {
        issues.push({ id: q.id, title: q.title, type: q.type, issue: 'option value not in form options', invalid, options: q.options });
      }
    }
    if (q.type === 'date' && values.some(value => !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      issues.push({ id: q.id, title: q.title, type: q.type, issue: 'date value is not YYYY-MM-DD', values });
    }
    if ((q.type === 'grid' || q.type === 'checkbox_grid') && q.required && Array.isArray(q.gridRowIds)) {
      const missingRows = q.gridRowIds.filter(rowId => !formData.has(rowId));
      if (missingRows.length) {
        issues.push({ id: q.id, title: q.title, type: q.type, issue: 'required grid rows missing', missingRows });
      }
    }
  });
  return issues;
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
  const currentEl = document.getElementById('spz-modal-current');
  const totalEl = document.getElementById('spz-modal-total');
  const percentEl = document.getElementById('spz-modal-percent');
  const progressFill = document.getElementById('spz-modal-progress');
  const successEl = document.getElementById('spz-modal-success');
  const errorEl = document.getElementById('spz-modal-failed');

  const miniCurrent = document.getElementById('spz-mini-current');
  const miniTotal = document.getElementById('spz-mini-total');
  const miniPercent = document.getElementById('spz-mini-percent');
  const miniProgress = document.getElementById('spz-mini-progress');

  const progress = s.count > 0 ? Math.round((s.submitted / s.count) * 100) : 0;

  if (currentEl) currentEl.textContent = String(s.submitted);
  if (totalEl) totalEl.textContent = String(s.count);
  if (percentEl) percentEl.textContent = `${progress}%`;
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (successEl) successEl.textContent = `\u2713 ${s.succeeded}`;
  if (errorEl) errorEl.textContent = `\u2717 ${s.failed}`;

  if (miniCurrent) miniCurrent.textContent = String(s.submitted);
  if (miniTotal) miniTotal.textContent = String(s.count);
  if (miniPercent) miniPercent.textContent = `${progress}%`;
  if (miniProgress) miniProgress.style.width = `${progress}%`;
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
    checkbox_grid: 'GRID',
    unknown: '???',
  };
  return names[type] || type.toUpperCase();
}

function resolveDelay(baseMs, randomize) {
  if (!randomize) return baseMs;
  const jitter = baseMs * 0.5;
  return baseMs + (Math.random() * jitter * 2 - jitter);
}
