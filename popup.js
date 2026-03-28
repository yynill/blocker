// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  if (!seconds || seconds < 1) return '< 1s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60), s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60), rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function formatDateTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function toDateKey(isoString) { return isoString.slice(0, 10); }

function friendlyDay(dateKey) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateKey === today) return 'Today';
  if (dateKey === yesterday) return 'Yesterday';
  const d = new Date(dateKey + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Stats bar ──────────────────────────────────────────────────────────────
function renderStats(logs, siteTime) {
  const totalBlocked = logs.reduce((s, l) => s + (l.timeSpentSeconds || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayData = siteTime[today] || {};
  const todayTotal = Object.values(todayData).reduce((a, b) => a + b, 0);

  document.getElementById('stat-sessions').textContent = logs.length;
  document.getElementById('stat-time').textContent = formatTime(totalBlocked);
  document.getElementById('stat-today').textContent = formatTime(todayTotal);
}

// ── All-sites view ─────────────────────────────────────────────────────────
let allDays = [];     // sorted array of date keys, oldest first
let dayIndex = 0;     // index into allDays for current view (0 = today)

function renderAllSites(siteTime) {
  allDays = Object.keys(siteTime).sort(); // oldest → newest
  const today = new Date().toISOString().slice(0, 10);
  if (!allDays.includes(today) && Object.keys(siteTime).length === 0) {
    document.getElementById('allsites-list').innerHTML = '<div class="empty">No browsing data yet.<br>Start browsing and data will appear here.</div>';
    document.getElementById('allsites-total').textContent = '';
    return;
  }
  if (!allDays.includes(today)) allDays.push(today);

  dayIndex = allDays.length - 1; // start at today
  showAllSitesDay();
}

function showAllSitesDay() {
  const dateKey = allDays[dayIndex];
  const siteData = currentSiteTime[dateKey] || {};
  const list = document.getElementById('allsites-list');
  const label = document.getElementById('day-nav-label');
  const totalEl = document.getElementById('allsites-total');

  label.textContent = friendlyDay(dateKey);
  document.getElementById('day-prev').disabled = dayIndex === 0;
  document.getElementById('day-next').disabled = dayIndex === allDays.length - 1;

  const entries = Object.entries(siteData).sort((a, b) => b[1] - a[1]);
  const totalSecs = entries.reduce((s, [, v]) => s + v, 0);

  totalEl.textContent = entries.length
    ? `${entries.length} site${entries.length !== 1 ? 's' : ''} · ${formatTime(totalSecs)} total`
    : '';

  if (entries.length === 0) {
    list.innerHTML = '<div class="empty">No data for this day.</div>';
    return;
  }

  const maxSecs = entries[0][1];
  const blockedSet = new Set(currentBlockedDomains());

  list.innerHTML = entries.map(([hostname, secs]) => {
    const pct = Math.round((secs / maxSecs) * 100);
    const isBlocked = blockedSet.has(hostname) ||
      [...blockedSet].some(d => hostname === d || hostname.endsWith('.' + d));
    const barClass = isBlocked ? 'bar-blocked' : 'bar-normal';
    return `
      <div class="site-row" style="padding: 5px 18px;">
        <span class="site-name" title="${hostname}">${hostname}</span>
        <div class="bar-wrap">
          <div class="bar ${barClass}" style="width:${pct}%"></div>
        </div>
        <span class="site-time">${formatTime(secs)}</span>
      </div>`;
  }).join('');
}

function currentBlockedDomains() {
  // We can't import from background, so we keep a local copy for bar colouring
  return [
    'twitter.com','x.com','reddit.com','facebook.com','instagram.com',
    'youtube.com','tiktok.com','twitch.tv','linkedin.com','netflix.com',
    'crunchyroll.com','disneyplus.com',
  ];
}

// ── Daily blocked summary ──────────────────────────────────────────────────
function renderDaily(logs) {
  const list = document.getElementById('daily-list');
  if (logs.length === 0) {
    list.innerHTML = '<div class="empty">No sessions logged yet.</div>';
    return;
  }

  const byDay = {};
  for (const entry of logs) {
    const day = toDateKey(entry.date);
    if (!byDay[day]) byDay[day] = {};
    byDay[day][entry.domain] = (byDay[day][entry.domain] || 0) + (entry.timeSpentSeconds || 0);
  }

  const days = Object.keys(byDay).sort().reverse();

  list.innerHTML = days.map(day => {
    const sites = byDay[day];
    const dayTotal = Object.values(sites).reduce((a, b) => a + b, 0);
    const maxSecs = Math.max(...Object.values(sites));
    const rows = Object.entries(sites)
      .sort((a, b) => b[1] - a[1])
      .map(([domain, secs]) => {
        const pct = Math.round((secs / maxSecs) * 100);
        return `
          <div class="site-row">
            <span class="site-name">${domain}</span>
            <div class="bar-wrap"><div class="bar bar-blocked" style="width:${pct}%"></div></div>
            <span class="site-time">${formatTime(secs)}</span>
          </div>`;
      }).join('');
    return `
      <div class="day-block">
        <div class="day-header">
          <span class="day-label">${friendlyDay(day)}</span>
          <span class="day-total">${formatTime(dayTotal)} total</span>
        </div>
        ${rows}
      </div>`;
  }).join('');
}

// ── Session log ────────────────────────────────────────────────────────────
function renderLog(logs) {
  const list = document.getElementById('log-list');
  if (logs.length === 0) {
    list.innerHTML = '<div class="empty">No sessions logged yet.</div>';
    return;
  }
  list.innerHTML = [...logs].reverse().map(entry => `
    <div class="log-entry">
      <div class="log-top">
        <span class="log-domain">${entry.domain}</span>
        <span class="log-time">${formatTime(entry.timeSpentSeconds)}</span>
      </div>
      <div class="log-reason">"${entry.reason}"</div>
      <div class="log-date">${formatDateTime(entry.date)}</div>
    </div>`).join('');
}

// ── Export CSV ─────────────────────────────────────────────────────────────
function exportCSV(logs, siteTime) {
  // Sheet 1: blocked sessions
  let csv = 'BLOCKED SITE SESSIONS\nDate,Domain,Reason,Seconds,Time\n';
  csv += logs.map(l =>
    [l.date, l.domain, `"${l.reason.replace(/"/g, '""')}"`,
     l.timeSpentSeconds || 0, formatTime(l.timeSpentSeconds)].join(',')
  ).join('\n');

  // Sheet 2: daily all-sites
  csv += '\n\nALL SITES (DAILY)\nDate,Domain,Seconds,Time\n';
  const dayEntries = [];
  for (const [day, sites] of Object.entries(siteTime)) {
    for (const [hostname, secs] of Object.entries(sites)) {
      dayEntries.push([day, hostname, secs, formatTime(secs)].join(','));
    }
  }
  csv += dayEntries.join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `site-blocker-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Tabs ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  });
});

document.getElementById('day-prev').addEventListener('click', () => {
  if (dayIndex > 0) { dayIndex--; showAllSitesDay(); }
});

document.getElementById('day-next').addEventListener('click', () => {
  if (dayIndex < allDays.length - 1) { dayIndex++; showAllSitesDay(); }
});

// ── Init ───────────────────────────────────────────────────────────────────
let currentLogs = [];
let currentSiteTime = {};

Promise.all([
  new Promise(res => chrome.runtime.sendMessage({ action: 'getLogs' },     r => res(r.logs     || []))),
  new Promise(res => chrome.runtime.sendMessage({ action: 'getSiteTime' }, r => res(r.siteTime || {}))),
]).then(([logs, siteTime]) => {
  currentLogs     = logs;
  currentSiteTime = siteTime;
  renderStats(logs, siteTime);
  renderAllSites(siteTime);
  renderDaily(logs);
  renderLog(logs);
});

document.getElementById('export-btn').addEventListener('click', () => {
  exportCSV(currentLogs, currentSiteTime);
});

document.getElementById('clear-btn').addEventListener('click', () => {
  if (!confirm('Clear all logs and browsing data?')) return;
  Promise.all([
    new Promise(res => chrome.runtime.sendMessage({ action: 'clearLogs' },     r => res(r))),
    new Promise(res => chrome.runtime.sendMessage({ action: 'clearSiteTime' }, r => res(r))),
  ]).then(() => {
    currentLogs     = [];
    currentSiteTime = {};
    renderStats([], {});
    renderAllSites({});
    renderDaily([]);
    renderLog([]);
  });
});
