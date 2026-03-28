const MIN_CHARS = 20;

const params    = new URLSearchParams(window.location.search);
const targetUrl = params.get('url');
const textarea  = document.getElementById('reason');
const counterEl = document.getElementById('char-counter');
const errorEl   = document.getElementById('error-msg');

try {
  document.getElementById('domain-name').textContent = new URL(targetUrl).hostname;
} catch {
  document.getElementById('domain-name').textContent = targetUrl;
}

// ── Character counter ──────────────────────────────────────────────────────
textarea.addEventListener('input', () => {
  const len = textarea.value.trim().length;
  counterEl.textContent = `${len} / ${MIN_CHARS}`;
  counterEl.classList.toggle('met', len >= MIN_CHARS);
});

// ── Submit ─────────────────────────────────────────────────────────────────
function tryProceed() {
  const reason = textarea.value.trim();
  errorEl.textContent = '';

  if (!reason) {
    errorEl.textContent = 'Please enter a reason before proceeding.';
    return;
  }
  if (reason.length < MIN_CHARS) {
    errorEl.textContent = `Reason must be at least ${MIN_CHARS} characters.`;
    return;
  }

  chrome.runtime.sendMessage({ action: 'allow', url: targetUrl, reason });
}

document.getElementById('proceed-btn').addEventListener('click', tryProceed);

textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); tryProceed(); }
});
