// Edit this list in code to change what's blocked — intentionally not
// exposed as editable UI, so blocking a new site takes real friction.
const BLOCKED_SITES = [
    'linkedin.com', 'x.com', 'twitter.com', 'youtube.com', 'instagram.com',
    'facebook.com', 'reddit.com', 'tiktok.com', 'twitch.tv', 'netflix.com',
    'disneyplus.com', 'pinterest.com', 'openfront.io',
];

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

const MAX_HISTORY = 50;
const UNLOCK_MS = 60 * 60 * 1000;
const CODE_TTL_MS = 3 * 60 * 1000;
// Excludes 0/O/1/I/L — characters that get misread when hand-typing a code
// off the screen, which would add friction for the wrong reason.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
}

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

const UNLOCK_END_ALARM = 'unlockEnd';

// Reads unlockUntil fresh from storage on every check rather than caching it
// in a module-level variable — MV3 service workers get suspended and woken
// per event, resetting any in-memory cache, which previously let a stale
// "not unlocked" reading slip through a race right after a wake-up.
async function blockTabIfNeeded(tabId, url) {
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

    const hostname = getHostname(url);
    if (!hostname) return;

    const blockedDomain = matchedBlockedDomain(hostname);
    if (!blockedDomain) return;

    const { unlockUntil = 0 } = await chrome.storage.sync.get('unlockUntil');
    if (Date.now() < unlockUntil) return;

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

// A tab left open on a blocked site through an unlock window needs to be
// caught the moment it ends, not on its next navigation — chrome.alarms
// survives service worker suspension, unlike setTimeout, so it fires
// reliably even if the worker napped for the whole hour.
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== UNLOCK_END_ALARM) return;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) blockTabIfNeeded(tab.id, tab.url);
});

// Covers the case where the service worker restarts (extension reload,
// browser restart) mid-unlock and the alarm never got created for this run.
chrome.storage.sync.get('unlockUntil').then(({ unlockUntil = 0 }) => {
    if (Date.now() < unlockUntil) chrome.alarms.create(UNLOCK_END_ALARM, { when: unlockUntil });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getBlockedSites') {
        chrome.storage.sync.get('unlockUntil').then(({ unlockUntil = 0 }) => {
            sendResponse({ blockedSites: BLOCKED_SITES, unlockUntil });
        });
        return true;
    } else if (message.action === 'requestUnlockCode') {
        const code = generateCode();
        const expiresAt = Date.now() + CODE_TTL_MS;
        chrome.storage.session.set({ pendingCode: code, pendingCodeExpiresAt: expiresAt })
            .then(() => sendResponse({ code, expiresAt }));
        return true;
    } else if (message.action === 'submitUnlockCode') {
        const entered = (message.code || '').trim().toUpperCase();
        chrome.storage.session.get(['pendingCode', 'pendingCodeExpiresAt']).then(async ({ pendingCode, pendingCodeExpiresAt = 0 }) => {
            if (!pendingCode || Date.now() > pendingCodeExpiresAt) {
                sendResponse({ ok: false, reason: 'expired' });
                return;
            }
            if (entered !== pendingCode) {
                sendResponse({ ok: false, reason: 'mismatch' });
                return;
            }
            const unlockUntil = Date.now() + UNLOCK_MS;
            await Promise.all([
                chrome.storage.sync.set({ unlockUntil }),
                chrome.alarms.create(UNLOCK_END_ALARM, { when: unlockUntil }),
                chrome.storage.session.remove(['pendingCode', 'pendingCodeExpiresAt']),
            ]);
            sendResponse({ ok: true, unlockUntil });
        });
        return true;
    } else if (message.action === 'relock') {
        Promise.all([
            chrome.storage.sync.set({ unlockUntil: 0 }),
            chrome.alarms.clear(UNLOCK_END_ALARM),
        ]).then(async () => {
            const tabs = await chrome.tabs.query({});
            await Promise.all(tabs.map(tab => blockTabIfNeeded(tab.id, tab.url)));
            sendResponse({ ok: true });
        });
        return true;
    }
});
