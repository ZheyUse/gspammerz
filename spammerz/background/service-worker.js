/**
 * @fileoverview SpammerZ - Background Service Worker
 * Handles extension lifecycle and state persistence
 */

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[SpammerZ] Extension installed:', details.reason);
});

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
  }
});

// Handle tab updates - refresh content script when form page reloads
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('docs.google.com/forms')) {
    // Content script will auto-reload due to manifest match
  }
});