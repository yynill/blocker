const params = new URLSearchParams(window.location.search);
document.getElementById('domain-name').textContent = params.get('domain') || '';

const savedUrl = params.get('url');
if (savedUrl) {
  const savedUrlEl = document.getElementById('saved-url');
  savedUrlEl.textContent = savedUrl;
  savedUrlEl.href = savedUrl;
  document.getElementById('saved-url-row').classList.add('visible');

  document.getElementById('copy-btn').addEventListener('click', async (e) => {
    await navigator.clipboard.writeText(savedUrl);
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1200);
  });
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Avoids picking the same item twice in a row, so plain randomness
// doesn't feel repetitive on a small pool of lines/images.
function pickRandomExcluding(arr, storageKey) {
  const last = localStorage.getItem(storageKey);
  const pool = arr.length > 1 ? arr.filter(item => item !== last) : arr;
  const pick = pickRandom(pool);
  localStorage.setItem(storageKey, pick);
  return pick;
}

fetch(chrome.runtime.getURL('content.json'))
  .then(r => r.json())
  .then(({ lines, images }) => {
    if (lines.length > 0) {
      document.getElementById('headline').textContent = pickRandomExcluding(lines, 'lastBlockedLine');
    }

    if (images.length > 0) {
      const imgEl = document.getElementById('blocked-image');
      imgEl.src = chrome.runtime.getURL('images/' + pickRandomExcluding(images, 'lastBlockedImage'));
      imgEl.classList.add('visible');
    }
  });

document.getElementById('close-btn').addEventListener('click', () => {
  chrome.tabs.getCurrent(tab => {
    if (tab) chrome.tabs.remove(tab.id);
  });
});
