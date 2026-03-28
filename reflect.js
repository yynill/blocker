const params = new URLSearchParams(window.location.search);
const id     = parseInt(params.get('id'));
const domain = params.get('domain');
const time   = params.get('time');
const reason = params.get('reason');

document.getElementById('domain').textContent = domain;
document.getElementById('time').textContent   = time;
document.getElementById('reason').textContent = `"${reason}"`;

function respond(worthIt) {
  chrome.runtime.sendMessage({ action: 'updateReflection', id, worthIt }, () => {
    window.close();
  });
}

document.getElementById('btn-yes').addEventListener('click', () => respond(true));
document.getElementById('btn-no').addEventListener('click',  () => respond(false));
