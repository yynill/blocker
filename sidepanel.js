const breakBtn      = document.getElementById('break-btn');
const historyListEl = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const incognitoWarningEl = document.getElementById('incognito-warning');
const fixIncognitoBtn = document.getElementById('fix-incognito-btn');

// Extensions can't grant themselves Incognito access — only the user can via
// chrome://extensions. Nag until they do, since that toggle is otherwise a
// silent, total bypass of every block.
chrome.extension.isAllowedIncognitoAccess().then(allowed => {
  incognitoWarningEl.classList.toggle('visible', !allowed);
});

fixIncognitoBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderHistory(blockedHistory) {
  if (blockedHistory.length === 0) {
    historyListEl.innerHTML = '<div class="empty">Nothing blocked yet.</div>';
    return;
  }
  historyListEl.innerHTML = blockedHistory.map(entry => `
    <div class="history-row">
      <div class="history-domain">${escapeHtml(entry.domain)}</div>
      <div class="history-time">${new Date(entry.time).toLocaleString()}</div>
      <div class="history-url" data-url="${escapeHtml(entry.url)}" title="Click to copy">${escapeHtml(entry.url)}</div>
    </div>
  `).join('');
}

async function loadHistory() {
  const { blockedHistory = [] } = await chrome.storage.local.get('blockedHistory');
  renderHistory(blockedHistory);
}

historyListEl.addEventListener('click', async (e) => {
  const urlEl = e.target.closest('.history-url');
  if (!urlEl) return;
  await navigator.clipboard.writeText(urlEl.dataset.url);
  const original = urlEl.textContent;
  urlEl.textContent = 'Copied!';
  setTimeout(() => { urlEl.textContent = original; }, 1000);
});

clearHistoryBtn.addEventListener('click', () => {
  chrome.storage.local.set({ blockedHistory: [] });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.blockedHistory) {
    renderHistory(changes.blockedHistory.newValue || []);
  }
});

let pauseUntil = 0;
let countdownInterval = null;

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function stopCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

function renderBreak() {
  const remaining = pauseUntil - Date.now();
  if (remaining > 0) {
    breakBtn.textContent = `⏸ Paused — ${formatRemaining(remaining)} left`;
    breakBtn.classList.add('paused');
    breakBtn.disabled = true;
  } else {
    breakBtn.textContent = '☕ 10 min free';
    breakBtn.classList.remove('paused');
    breakBtn.disabled = false;
    stopCountdown();
  }
}

function startCountdown() {
  stopCountdown();
  countdownInterval = setInterval(renderBreak, 1000);
}

breakBtn.addEventListener('click', () => {
  if (breakBtn.disabled) return;
  chrome.runtime.sendMessage({ action: 'startBreak' }, r => {
    pauseUntil = r.pauseUntil;
    renderBreak();
    startCountdown();
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.pauseUntil) {
    pauseUntil = changes.pauseUntil.newValue || 0;
    renderBreak();
    if (pauseUntil - Date.now() > 0) startCountdown();
  }
});

chrome.runtime.sendMessage({ action: 'getBlockedSites' }, r => {
  pauseUntil = r.pauseUntil || 0;
  renderBreak();
  if (pauseUntil - Date.now() > 0) startCountdown();
});

loadHistory();
