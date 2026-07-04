const params = new URLSearchParams(window.location.search);
document.getElementById('domain-name').textContent = params.get('domain') || '';

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

if (BLOCKED_LINES.length > 0) {
  document.getElementById('headline').textContent = pickRandom(BLOCKED_LINES);
}

if (BLOCKED_IMAGES.length > 0) {
  const imgEl = document.getElementById('blocked-image');
  imgEl.src = chrome.runtime.getURL('images/' + pickRandom(BLOCKED_IMAGES));
  imgEl.classList.add('visible');
}

document.getElementById('close-btn').addEventListener('click', () => {
  chrome.tabs.getCurrent(tab => {
    if (tab) chrome.tabs.remove(tab.id);
  });
});
