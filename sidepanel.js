const unlockBtn      = document.getElementById('unlock-btn');
const relockBtn      = document.getElementById('relock-btn');
const waitPanel      = document.getElementById('wait-panel');
const waitLabelEl    = document.getElementById('wait-label');
const progressFillEl = document.getElementById('progress-fill');
const waitCancelBtn  = document.getElementById('wait-cancel-btn');
const codePanel      = document.getElementById('code-panel');
const codeDisplayEl  = document.getElementById('code-display');
const codeTimerEl    = document.getElementById('code-timer');
const codeInput      = document.getElementById('code-input');
const codeErrorEl    = document.getElementById('code-error');
const codeConfirmBtn = document.getElementById('code-confirm-btn');
const codeCancelBtn  = document.getElementById('code-cancel-btn');
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

const WAIT_MS = 60 * 1000;

let unlockUntil = 0;
let codeExpiresAt = 0;
let waitStartedAt = 0;
let unlockCountdownInterval = null;
let codeCountdownInterval = null;
let waitInterval = null;

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function stopUnlockCountdown() {
  if (unlockCountdownInterval) clearInterval(unlockCountdownInterval);
  unlockCountdownInterval = null;
}

function stopCodeCountdown() {
  if (codeCountdownInterval) clearInterval(codeCountdownInterval);
  codeCountdownInterval = null;
}

function stopWait() {
  if (waitInterval) clearInterval(waitInterval);
  waitInterval = null;
}

function showIdle() {
  stopUnlockCountdown();
  stopCodeCountdown();
  stopWait();
  waitPanel.classList.remove('visible');
  progressFillEl.style.width = '0%';
  codePanel.classList.remove('visible');
  codeInput.value = '';
  codeErrorEl.textContent = '';
  unlockBtn.classList.remove('unlocked');
  unlockBtn.disabled = false;
  unlockBtn.textContent = '🔓 Unlock everything (1h)';
  relockBtn.classList.remove('visible');
}

function renderUnlockState() {
  const remaining = unlockUntil - Date.now();
  if (remaining > 0) {
    stopCodeCountdown();
    codePanel.classList.remove('visible');
    unlockBtn.classList.add('unlocked');
    unlockBtn.disabled = true;
    unlockBtn.textContent = `🔓 Unlocked — ${formatRemaining(remaining)} left`;
    relockBtn.classList.add('visible');
  } else {
    showIdle();
  }
}

function startUnlockCountdown() {
  stopUnlockCountdown();
  unlockCountdownInterval = setInterval(renderUnlockState, 1000);
}

function renderCodeTimer() {
  const remaining = codeExpiresAt - Date.now();
  if (remaining > 0) {
    codeTimerEl.textContent = `Code expires in ${formatRemaining(remaining)}`;
  } else {
    showIdle();
  }
}

// Requesting the code immediately would make the "friction" purely typing
// effort, which becomes a mindless reflex. Making the button wait 60s before
// the code even exists forces an actual pause the urge has to survive.
function renderWait() {
  const elapsed = Date.now() - waitStartedAt;
  const remaining = WAIT_MS - elapsed;
  if (remaining <= 0) {
    stopWait();
    waitPanel.classList.remove('visible');
    beginCodeEntry();
    return;
  }
  progressFillEl.style.width = `${Math.min(100, (elapsed / WAIT_MS) * 100)}%`;
  waitLabelEl.textContent = `Hold on… ${Math.ceil(remaining / 1000)}s`;
}

function startWait() {
  waitStartedAt = Date.now();
  progressFillEl.style.width = '0%';
  waitPanel.classList.add('visible');
  unlockBtn.disabled = true;
  renderWait();
  stopWait();
  waitInterval = setInterval(renderWait, 100);
}

function beginCodeEntry() {
  unlockBtn.disabled = true;
  chrome.runtime.sendMessage({ action: 'requestUnlockCode' }, r => {
    unlockBtn.disabled = false;
    codeExpiresAt = r.expiresAt;
    codeDisplayEl.textContent = r.code;
    codeErrorEl.textContent = '';
    codeInput.value = '';
    codePanel.classList.add('visible');
    renderCodeTimer();
    stopCodeCountdown();
    codeCountdownInterval = setInterval(renderCodeTimer, 1000);
    codeInput.focus();
  });
}

unlockBtn.addEventListener('click', () => {
  if (unlockBtn.disabled) return;
  startWait();
});

waitCancelBtn.addEventListener('click', showIdle);

relockBtn.addEventListener('click', () => {
  relockBtn.disabled = true;
  chrome.runtime.sendMessage({ action: 'relock' }, () => {
    relockBtn.disabled = false;
    unlockUntil = 0;
    showIdle();
  });
});

// The entire point of the code is the friction of typing it by hand — a
// pasted code is just a copy-paste click-through, no different from a
// single confirm button.
codeInput.addEventListener('paste', e => e.preventDefault());
codeInput.addEventListener('drop', e => e.preventDefault());

function submitCode() {
  const entered = codeInput.value.trim();
  if (!entered) return;
  chrome.runtime.sendMessage({ action: 'submitUnlockCode', code: entered }, r => {
    if (r && r.ok) {
      unlockUntil = r.unlockUntil;
      renderUnlockState();
      startUnlockCountdown();
    } else if (r && r.reason === 'expired') {
      codeErrorEl.textContent = 'Code expired — try again.';
      showIdle();
    } else {
      codeErrorEl.textContent = 'Wrong code.';
      codeInput.value = '';
      codeInput.focus();
    }
  });
}

codeConfirmBtn.addEventListener('click', submitCode);
codeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitCode();
});
codeCancelBtn.addEventListener('click', showIdle);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.unlockUntil) {
    unlockUntil = changes.unlockUntil.newValue || 0;
    if (unlockUntil - Date.now() > 0) {
      renderUnlockState();
      startUnlockCountdown();
    } else {
      showIdle();
    }
  }
});

chrome.runtime.sendMessage({ action: 'getBlockedSites' }, r => {
  unlockUntil = r.unlockUntil || 0;
  if (unlockUntil - Date.now() > 0) {
    renderUnlockState();
    startUnlockCountdown();
  }
});

loadHistory();
