// Edit this list in code to change what's blocked — intentionally not
// exposed as editable UI, so blocking a new site takes real friction.
const BLOCKED_SITES = [
    'linkedin.com', 'x.com', 'twitter.com', 'youtube.com', 'instagram.com',
    'facebook.com', 'reddit.com', 'tiktok.com', 'twitch.tv', 'netflix.com',
    'disneyplus.com', 'pinterest.com', 'openfront.io',
];

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

const MAX_HISTORY = 50;
const BREAK_MS = 10 * 60 * 1000;

function getHostname(url) {
    try { return new URL(url).hostname; } catch { return null; }
}

function matchedBlockedDomain(hostname) {
    return BLOCKED_SITES.find(site => hostname === site || hostname.endsWith('.' + site));
}

// Skips logging a duplicate entry if the same URL got blocked again within
// a few seconds (page reloads/redirect loops shouldn't spam the history).
async function addToHistory(url, domain) {
    const { blockedHistory = [] } = await chrome.storage.local.get('blockedHistory');
    const now = Date.now();
    const last = blockedHistory[0];
    if (last && last.url === url && now - last.time < 3000) return;

    blockedHistory.unshift({ url, domain, time: now });
    blockedHistory.length = Math.min(blockedHistory.length, MAX_HISTORY);
    await chrome.storage.local.set({ blockedHistory });
}

const BREAK_END_ALARM = 'breakEnd';

// Reads pauseUntil fresh from storage on every check rather than caching it
// in a module-level variable — MV3 service workers get suspended and woken
// per event, resetting any in-memory cache, which previously let a stale
// "not paused" reading slip through a race right after a wake-up.
async function blockTabIfNeeded(tabId, url) {
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

    const hostname = getHostname(url);
    if (!hostname) return;

    const blockedDomain = matchedBlockedDomain(hostname);
    if (!blockedDomain) return;

    const { pauseUntil = 0 } = await chrome.storage.sync.get('pauseUntil');
    if (Date.now() < pauseUntil) return;

    addToHistory(url, hostname);
    const interstitial = chrome.runtime.getURL('blocked.html')
        + '?domain=' + encodeURIComponent(hostname)
        + '&url=' + encodeURIComponent(url);
    chrome.tabs.update(tabId, { url: interstitial });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'loading') return;
    blockTabIfNeeded(tabId, tab.url);
});

// A tab left open on a blocked site through a break needs to be caught the
// moment the break ends, not on its next navigation — chrome.alarms survives
// service worker suspension, unlike setTimeout, so it fires reliably even if
// the worker napped for the whole 10 minutes.
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== BREAK_END_ALARM) return;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) blockTabIfNeeded(tab.id, tab.url);
});

// Covers the case where the service worker restarts (extension reload,
// browser restart) mid-break and the alarm never got created for this run.
chrome.storage.sync.get('pauseUntil').then(({ pauseUntil = 0 }) => {
    if (Date.now() < pauseUntil) chrome.alarms.create(BREAK_END_ALARM, { when: pauseUntil });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getBlockedSites') {
        chrome.storage.sync.get('pauseUntil').then(({ pauseUntil = 0 }) => {
            sendResponse({ blockedSites: BLOCKED_SITES, pauseUntil });
        });
        return true;
    } else if (message.action === 'startBreak') {
        const pauseUntil = Date.now() + BREAK_MS;
        Promise.all([
            chrome.storage.sync.set({ pauseUntil }),
            chrome.alarms.create(BREAK_END_ALARM, { when: pauseUntil }),
        ]).then(() => sendResponse({ pauseUntil }));
        return true;
    }
});
