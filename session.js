// Establishes a persistent port so the background can detect when this tab closes.
// This is injected into allowed blocked-site tabs by the background script.
chrome.runtime.connect({ name: 'blocked-session' });
