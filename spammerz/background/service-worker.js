/**
 * @fileoverview SpammerZ - Background Service Worker
 * Handles extension lifecycle and state persistence
 */

const SPAMMERZ_NATIVE_HOST = 'com.zheys.spammerz.updater';

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[SpammerZ] Extension installed:', details.reason);
});

function sendNativeUpdaterMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(SPAMMERZ_NATIVE_HOST, payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({
          ok: false,
          installed: false,
          error: error.message || 'Native updater is not available.',
        });
        return;
      }

      resolve(response || {
        ok: false,
        error: 'Native updater returned an empty response.',
      });
    });
  });
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_STATE':
      // Return current state from storage
      chrome.storage.local.get(['history'], (result) => {
        sendResponse({ history: result.history || [] });
      });
      return true;

    case 'SAVE_HISTORY':
      // Save submission history
      chrome.storage.local.get(['history'], (result) => {
        const history = result.history || [];
        history.unshift(message.entry);
        // Keep only last 100 entries
        if (history.length > 100) history.length = 100;
        chrome.storage.local.set({ history });
      });
      break;

    case 'CLEAR_HISTORY':
      chrome.storage.local.remove('history');
      break;

    case 'NATIVE_UPDATER_STATUS':
      sendNativeUpdaterMessage({
        action: 'status',
        extensionId: chrome.runtime.id,
        extensionVersion: chrome.runtime.getManifest().version,
      }).then(sendResponse);
      return true;

    case 'RUN_NATIVE_UPDATER':
      sendNativeUpdaterMessage({
        action: 'update',
        extensionId: chrome.runtime.id,
        extensionVersion: chrome.runtime.getManifest().version,
        remoteVersion: message.remoteVersion || '',
        updateType: message.updateType || '',
      }).then(sendResponse);
      return true;

    case 'RELOAD_EXTENSION':
      sendResponse({ ok: true });
      setTimeout(() => chrome.runtime.reload(), 100);
      return true;

  }
});

// Handle tab updates - refresh content script when form page reloads
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('docs.google.com/forms')) {
    // Content script will auto-reload due to manifest match
  }
});
