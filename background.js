// ── Blocked sites ──────────────────────────────────────────────────────────
const BLOCKED_SITES = [
  'twitter.com', 'x.com', 'reddit.com', 'facebook.com', 'instagram.com',
  'youtube.com', 'tiktok.com', 'twitch.tv', 'linkedin.com', 'netflix.com',
  'crunchyroll.com', 'disneyplus.com', 'pinterest.com',
];

// ── In-memory state ────────────────────────────────────────────────────────
let allowedTabs   = {}; // { [tabId]: { domain, reason, startTime } }
let activeSession = null; // { tabId, hostname, startTime }

// Tabs currently mid-navigation (port disconnect = navigation, not closure)
const navigatingTabs = new Set();

// Tabs that already have session.js injected
const injectedTabs = new Set();

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
  return url && !url.startsWith('chrome://') &&
    !url.startsWith('chrome-extension://') && !url.startsWith('about:');
}

function persistAllowedTabs() {
  chrome.storage.session.set({ allowedTabs });
}

// ── Storage helpers ────────────────────────────────────────────────────────
async function saveLog(entry) {
  const { logs = [] } = await chrome.storage.local.get('logs');
  logs.push({ ...entry, date: new Date(entry.startTime).toISOString() });
  await chrome.storage.local.set({ logs });
}

async function addSiteTime(hostname, seconds) {
  const today = new Date().toISOString().slice(0, 10);
  const { siteTime = {} } = await chrome.storage.local.get('siteTime');
  if (!siteTime[today]) siteTime[today] = {};
  siteTime[today][hostname] = (siteTime[today][hostname] || 0) + seconds;
  await chrome.storage.local.set({ siteTime });
}

async function addVisitCount(domain) {
  const today = new Date().toISOString().slice(0, 10);
  const { visitCount = {} } = await chrome.storage.local.get('visitCount');
  if (!visitCount[today]) visitCount[today] = {};
  visitCount[today][domain] = (visitCount[today][domain] || 0) + 1;
  await chrome.storage.local.set({ visitCount });
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

// ── Reflection window ──────────────────────────────────────────────────────
function showReflection(id, domain, reason, timeSpentSeconds) {
  const params = new URLSearchParams({
    id: String(id), domain, reason, time: formatTime(timeSpentSeconds),
  });
  chrome.windows.create({
    url:     chrome.runtime.getURL('reflect.html') + '?' + params.toString(),
    type:    'popup',
    width:   400,
    height:  310,
    focused: true,
  });
}

// ── Content script port — reliable tab-close detection ────────────────────
// When a tab is allowed we inject session.js which opens a port.
// Port disconnect fires reliably when the tab closes (Cmd+W or any other way).
// We use navigatingTabs to distinguish a close from an in-page navigation.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'blocked-session') return;

  const tabId = port.sender?.tab?.id;
  if (!tabId || !allowedTabs[tabId]) return;

  // Capture session info now — allowedTabs may be cleaned up by the time
  // onDisconnect fires.
  const capturedSession = { ...allowedTabs[tabId] };

  port.onDisconnect.addListener(() => {
    if (navigatingTabs.has(tabId)) {
      // Disconnect was caused by navigation within the site, not a tab close.
      navigatingTabs.delete(tabId);
      return;
    }

    // Tab was closed — save log and show reflection.
    const timeSpentSeconds = Math.round((Date.now() - capturedSession.startTime) / 1000);
    const id = Date.now();

    saveLog({
      id,
      domain:           capturedSession.domain,
      reason:           capturedSession.reason,
      startTime:        capturedSession.startTime,
      timeSpentSeconds,
      timeSpentDisplay: formatTime(timeSpentSeconds),
      worthIt:          null,
    });

    if (timeSpentSeconds >= 5) {
      showReflection(id, capturedSession.domain, capturedSession.reason, timeSpentSeconds);
    }

    delete allowedTabs[tabId];
    persistAllowedTabs();
  });
});

// ── Navigation / blocker ───────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = tab.url;

  if (changeInfo.status === 'loading') {
    // Mark navigation so port disconnect doesn't trigger reflection
    if (allowedTabs[tabId]) navigatingTabs.add(tabId);

    if (url && !url.startsWith('chrome-extension://') && !url.startsWith('chrome://')) {
      const hostname = getHostname(url);
      if (hostname) {
        const blockedDomain = matchedBlockedDomain(hostname);
        if (blockedDomain) {
          // Re-read session storage in case SW just restarted
          if (!allowedTabs[tabId]) {
            const { allowedTabs: stored = {} } = await chrome.storage.session.get('allowedTabs');
            allowedTabs = stored;
          }
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

  if (changeInfo.status === 'complete' && isTrackableUrl(url)) {
    // Inject session tracking script once per allowed tab session
    if (allowedTabs[tabId] && !injectedTabs.has(tabId)) {
      injectedTabs.add(tabId);
      navigatingTabs.delete(tabId);
      chrome.scripting.executeScript({ target: { tabId }, files: ['session.js'] })
        .catch(() => { injectedTabs.delete(tabId); /* retry next load */ });
    }

    // Update active browsing session if URL changed
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

// ── Tab focus ──────────────────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(({ tabId }) => startActive(tabId));

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
// Primary close handling is done by the port's onDisconnect above.
// This is a fallback for cases where session.js injection failed.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (activeSession?.tabId === tabId) flushActive();
  navigatingTabs.delete(tabId);
  injectedTabs.delete(tabId);

  // If port handler already cleaned up, allowedTabs[tabId] will be gone — skip.
  if (!allowedTabs[tabId]) {
    const { allowedTabs: stored = {} } = await chrome.storage.session.get('allowedTabs');
    allowedTabs = stored;
  }
  const session = allowedTabs[tabId];
  if (!session) return;

  // Fallback log save (no reflection since we can't reliably open a window here)
  const timeSpentSeconds = Math.round((Date.now() - session.startTime) / 1000);
  saveLog({
    id:               Date.now(),
    domain:           session.domain,
    reason:           session.reason,
    startTime:        session.startTime,
    timeSpentSeconds,
    timeSpentDisplay: formatTime(timeSpentSeconds),
    worthIt:          null,
  });
  delete allowedTabs[tabId];
  persistAllowedTabs();
});

// ── Messages ───────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'allow') {
    const tabId = sender.tab.id;
    const hostname = getHostname(message.url);
    const domain = matchedBlockedDomain(hostname);
    allowedTabs[tabId] = { domain, reason: message.reason, startTime: Date.now() };
    persistAllowedTabs();
    addVisitCount(domain);
    chrome.tabs.update(tabId, { url: message.url });
    sendResponse({ success: true });
    return;
  }

  if (message.action === 'getLiveData') {
    chrome.storage.local.get(['siteTime', 'logs', 'visitCount']).then(result => {
      const siteTime = JSON.parse(JSON.stringify(result.siteTime || {}));
      if (activeSession) {
        const elapsed = Math.round((Date.now() - activeSession.startTime) / 1000);
        const today = new Date().toISOString().slice(0, 10);
        if (!siteTime[today]) siteTime[today] = {};
        siteTime[today][activeSession.hostname] =
          (siteTime[today][activeSession.hostname] || 0) + elapsed;
      }
      const inProgress = Object.entries(allowedTabs).map(([tabId, s]) => ({
        tabId:            parseInt(tabId),
        domain:           s.domain,
        reason:           s.reason,
        startTime:        s.startTime,
        timeSpentSeconds: Math.round((Date.now() - s.startTime) / 1000),
      }));
      sendResponse({
        siteTime,
        logs:       result.logs       || [],
        visitCount: result.visitCount || {},
        inProgress,
      });
    });
    return true;
  }

  if (message.action === 'updateReflection') {
    chrome.storage.local.get('logs').then(result => {
      const logs = result.logs || [];
      const entry = logs.find(l => l.id === message.id);
      if (entry) entry.worthIt = message.worthIt;
      chrome.storage.local.set({ logs }).then(() => sendResponse({ success: true }));
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

  if (message.action === 'clearVisitCount') {
    chrome.storage.local.set({ visitCount: {} }).then(() => sendResponse({ success: true }));
    return true;
  }
});
