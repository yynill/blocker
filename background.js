// ── Blocked sites ──────────────────────────────────────────────────────────
const BLOCKED_SITES = [
  'twitter.com',
  'x.com',
  'reddit.com',
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'tiktok.com',
  'twitch.tv',
  'linkedin.com',
  'netflix.com',
  'crunchyroll.com',
  'disneyplus.com',
];

// ── In-memory state ────────────────────────────────────────────────────────
// Allowed blocked-site tabs: { [tabId]: { domain, reason, startTime } }
let allowedTabs = {};

// Active tab being time-tracked: { tabId, hostname, startTime } | null
let activeSession = null;

// Restore allowedTabs from session storage on service-worker start
chrome.storage.session.get('allowedTabs').then(result => {
  allowedTabs = result.allowedTabs || {};
});

// ── Helpers ────────────────────────────────────────────────────────────────
function getHostname(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function matchedBlockedDomain(hostname) {
  return BLOCKED_SITES.find(
    site => hostname === site || hostname.endsWith('.' + site)
  );
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60), s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60), rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function isTrackableUrl(url) {
  if (!url) return false;
  return !url.startsWith('chrome://') && !url.startsWith('chrome-extension://') && !url.startsWith('about:');
}

function persistAllowedTabs() {
  chrome.storage.session.set({ allowedTabs });
}

// ── All-site time tracking ─────────────────────────────────────────────────
async function flushActive(now = Date.now()) {
  if (!activeSession) return;
  const elapsed = Math.round((now - activeSession.startTime) / 1000);
  if (elapsed > 0) await addSiteTime(activeSession.hostname, elapsed);
  activeSession = null;
}

async function startActive(tabId) {
  await flushActive();
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isTrackableUrl(tab.url)) return;
    const hostname = getHostname(tab.url);
    if (!hostname) return;
    activeSession = { tabId, hostname, startTime: Date.now() };
  } catch { /* tab gone */ }
}

async function addSiteTime(hostname, seconds) {
  const today = new Date().toISOString().slice(0, 10);
  const { siteTime = {} } = await chrome.storage.local.get('siteTime');
  if (!siteTime[today]) siteTime[today] = {};
  siteTime[today][hostname] = (siteTime[today][hostname] || 0) + seconds;
  await chrome.storage.local.set({ siteTime });
}

async function saveLog(entry) {
  const { logs = [] } = await chrome.storage.local.get('logs');
  logs.push({ ...entry, date: new Date(entry.startTime).toISOString() });
  await chrome.storage.local.set({ logs });
}

// ── Intercept navigation to blocked sites ─────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = tab.url;

  // ── Blocker: redirect on loading ──
  if (changeInfo.status === 'loading') {
    if (url && !url.startsWith('chrome-extension://') && !url.startsWith('chrome://')) {
      const hostname = getHostname(url);
      if (hostname) {
        const blockedDomain = matchedBlockedDomain(hostname);
        if (blockedDomain) {
          const session = allowedTabs[tabId];
          if (!session || session.domain !== blockedDomain) {
            const interstitial =
              chrome.runtime.getURL('blocked.html') + '?url=' + encodeURIComponent(url);
            chrome.tabs.update(tabId, { url: interstitial });
            return;
          }
        }
      }
    }
  }

  // ── Tracker: update active session when URL changes in the focused tab ──
  if (changeInfo.status === 'complete' && isTrackableUrl(url)) {
    if (activeSession && activeSession.tabId === tabId) {
      const hostname = getHostname(url);
      if (hostname && hostname !== activeSession.hostname) {
        flushActive().then(() => {
          activeSession = { tabId, hostname, startTime: Date.now() };
        });
      }
    }
  }
});

// ── Tab focus changes ──────────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(({ tabId }) => {
  startActive(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    flushActive();
  } else {
    chrome.tabs.query({ active: true, windowId }, tabs => {
      if (tabs[0]) startActive(tabs[0].id);
    });
  }
});

// ── Tab closed ─────────────────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  // Flush tracker if this was the active tab
  if (activeSession && activeSession.tabId === tabId) {
    flushActive();
  }

  // Log blocked-site session
  const session = allowedTabs[tabId];
  if (session) {
    const timeSpentSeconds = Math.round((Date.now() - session.startTime) / 1000);
    saveLog({
      domain:           session.domain,
      reason:           session.reason,
      startTime:        session.startTime,
      timeSpentSeconds,
      timeSpentDisplay: formatTime(timeSpentSeconds),
    });
    delete allowedTabs[tabId];
    persistAllowedTabs();
  }
});

// ── Message handler ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'allow') {
    const tabId = sender.tab.id;
    const hostname = getHostname(message.url);
    const domain = matchedBlockedDomain(hostname);
    allowedTabs[tabId] = { domain, reason: message.reason, startTime: Date.now() };
    persistAllowedTabs();
    chrome.tabs.update(tabId, { url: message.url });
    sendResponse({ success: true });
    return;
  }

  if (message.action === 'getLogs') {
    chrome.storage.local.get('logs').then(result => {
      sendResponse({ logs: result.logs || [] });
    });
    return true;
  }

  if (message.action === 'getSiteTime') {
    chrome.storage.local.get('siteTime').then(result => {
      sendResponse({ siteTime: result.siteTime || {} });
    });
    return true;
  }

  if (message.action === 'clearLogs') {
    chrome.storage.local.set({ logs: [] }).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'clearSiteTime') {
    chrome.storage.local.set({ siteTime: {} }).then(() => sendResponse({ success: true }));
    return true;
  }
});
