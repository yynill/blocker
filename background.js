// Edit this list in code to change what's blocked — intentionally not
// exposed as editable UI, so blocking a new site takes real friction.
const BLOCKED_SITES = [
  'linkedin.com', 'x.com', 'twitter.com', 'youtube.com', 'instagram.com',
  'facebook.com', 'reddit.com', 'tiktok.com', 'twitch.tv', 'netflix.com',
  'disneyplus.com', 'pinterest.com',
];

let enabled = true;

chrome.storage.sync.get('enabled').then(result => {
  enabled = result.enabled !== false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.enabled) enabled = changes.enabled.newValue !== false;
});

function getHostname(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function matchedBlockedDomain(hostname) {
  return BLOCKED_SITES.find(site => hostname === site || hostname.endsWith('.' + site));
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!enabled) return;
  const url = tab.url;
  if (changeInfo.status !== 'loading') return;
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

  const hostname = getHostname(url);
  if (!hostname) return;

  const blockedDomain = matchedBlockedDomain(hostname);
  if (blockedDomain) {
    const interstitial = chrome.runtime.getURL('blocked.html') + '?domain=' + encodeURIComponent(hostname);
    chrome.tabs.update(tabId, { url: interstitial });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getBlockedSites') {
    sendResponse({ blockedSites: BLOCKED_SITES, enabled });
  }
});
