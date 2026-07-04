const listEl    = document.getElementById('site-list');
const toggleBtn = document.getElementById('toggle-btn');

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
