const listEl        = document.getElementById('site-list');
const toggleBtn     = document.getElementById('toggle-btn');
const historyListEl = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

function render(blockedSites) {
  if (blockedSites.length === 0) {
    listEl.innerHTML = '<div class="empty">No sites blocked.</div>';
    return;
  }
  listEl.innerHTML = blockedSites
    .slice().sort()
    .map(domain => `<div class="site-row">${domain}</div>`)
    .join('');
}

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

function renderToggle(enabled) {
  toggleBtn.textContent = `Blocker: ${enabled ? 'ON' : 'OFF'}`;
  toggleBtn.classList.toggle('off', !enabled);
  toggleBtn.dataset.enabled = enabled;
}

toggleBtn.addEventListener('click', () => {
  const enabled = toggleBtn.dataset.enabled !== 'true';
  chrome.storage.sync.set({ enabled });
  renderToggle(enabled);
});

chrome.runtime.sendMessage({ action: 'getBlockedSites' }, r => {
  render(r.blockedSites || []);
  renderToggle(r.enabled !== false);
});

loadHistory();
