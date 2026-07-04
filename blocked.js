const params = new URLSearchParams(window.location.search);
document.getElementById('domain-name').textContent = params.get('domain') || '';

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

if (BLOCKED_LINES.length > 0) {
  document.getElementById('headline').textContent = pickRandomExcluding(BLOCKED_LINES, 'lastBlockedLine');
}

if (BLOCKED_IMAGES.length > 0) {
  const imgEl = document.getElementById('blocked-image');
  imgEl.src = chrome.runtime.getURL('images/' + pickRandomExcluding(BLOCKED_IMAGES, 'lastBlockedImage'));
  imgEl.classList.add('visible');
}

document.getElementById('close-btn').addEventListener('click', () => {
  chrome.tabs.getCurrent(tab => {
    if (tab) chrome.tabs.remove(tab.id);
  });
});
