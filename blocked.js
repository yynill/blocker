const params = new URLSearchParams(window.location.search);
const targetUrl = params.get('url');

// Show the domain we're blocking
try {
  document.getElementById('domain-name').textContent = new URL(targetUrl).hostname;
} catch {
  document.getElementById('domain-name').textContent = targetUrl;
}

document.getElementById('proceed-btn').addEventListener('click', () => {
  const reason = document.getElementById('reason').value.trim();
  const errorEl = document.getElementById('error-msg');

  if (!reason) {
    errorEl.textContent = 'Please enter a reason before proceeding.';
    return;
  }
  errorEl.textContent = '';

  chrome.runtime.sendMessage({ action: 'allow', url: targetUrl, reason });
});

// Also allow submitting with Enter (but Shift+Enter adds newline as normal)
document.getElementById('reason').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('proceed-btn').click();
  }
});
