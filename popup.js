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

const BLOCKED_DOMAINS = [
  'twitter.com','x.com','reddit.com','facebook.com','instagram.com',
  'youtube.com','tiktok.com','twitch.tv','linkedin.com','netflix.com',
  'crunchyroll.com','disneyplus.com',
];

// ── Visit count helper ─────────────────────────────────────────────────────
function todayVisits(domain) {
  const today = new Date().toISOString().slice(0, 10);
  return (currentVisitCount[today] || {})[domain] || 0;
}

// ── Stats bar ──────────────────────────────────────────────────────────────
function renderStats(logs, inProgress, siteTime) {
  const completedTime = logs.reduce((s, l) => s + (l.timeSpentSeconds || 0), 0);
  const inProgressTime = inProgress.reduce((s, p) => s + (p.timeSpentSeconds || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayTotal = Object.values(siteTime[today] || {}).reduce((a, b) => a + b, 0);

  document.getElementById('stat-sessions').textContent = logs.length + inProgress.length;
  document.getElementById('stat-time').textContent = formatTime(completedTime + inProgressTime);
  document.getElementById('stat-today').textContent = formatTime(todayTotal);
}

// ── All-sites view ─────────────────────────────────────────────────────────
let allDays = [];
let dayIndex = 0;

function initAllSites(siteTime) {
  allDays = Object.keys(siteTime).sort();
  const today = new Date().toISOString().slice(0, 10);
  if (!allDays.includes(today)) allDays.push(today);
  dayIndex = allDays.length - 1;
  showAllSitesDay();
}

function showAllSitesDay() {
  const dateKey = allDays[dayIndex];
  const siteData = currentSiteTime[dateKey] || {};
  const list = document.getElementById('allsites-list');

  document.getElementById('day-nav-label').textContent = friendlyDay(dateKey);
  document.getElementById('day-prev').disabled = dayIndex === 0;
  document.getElementById('day-next').disabled = dayIndex === allDays.length - 1;

  const entries = Object.entries(siteData).sort((a, b) => b[1] - a[1]);
  const totalSecs = entries.reduce((s, [, v]) => s + v, 0);

  document.getElementById('allsites-total').textContent = entries.length
    ? `${entries.length} site${entries.length !== 1 ? 's' : ''} · ${formatTime(totalSecs)} total`
    : '';

  if (entries.length === 0) {
    list.innerHTML = '<div class="empty">No data for this day.</div>';
    return;
  }

  const maxSecs = entries[0][1];
  list.innerHTML = entries.map(([hostname, secs]) => {
    const pct = Math.round((secs / maxSecs) * 100);
    const isBlocked = BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
    const badge = isBlocked
      ? `<span style="font-size:9px;font-weight:600;color:#c0392b;background:#2d1414;border:1px solid #5a2020;border-radius:3px;padding:1px 4px;margin-left:5px;vertical-align:middle;letter-spacing:0.03em;">BLOCKED</span>`
      : '';
    return `
      <div class="site-row" style="padding:5px 18px;">
        <span class="site-name" title="${hostname}">${hostname}${badge}</span>
        <div class="bar-wrap">
          <div class="bar ${isBlocked ? 'bar-blocked' : 'bar-normal'}" style="width:${pct}%"></div>
        </div>
        <span class="site-time">${formatTime(secs)}</span>
      </div>`;
  }).join('');
}

// ── Daily blocked summary ──────────────────────────────────────────────────
function renderDaily(logs, inProgress) {
  const list = document.getElementById('daily-list');
  const today = new Date().toISOString().slice(0, 10);

  // Build totals from completed sessions
  const byDay = {};
  for (const entry of logs) {
    const day = toDateKey(entry.date);
    if (!byDay[day]) byDay[day] = {};
    byDay[day][entry.domain] = (byDay[day][entry.domain] || 0) + (entry.timeSpentSeconds || 0);
  }

  // Merge in-progress sessions into today
  for (const p of inProgress) {
    if (!byDay[today]) byDay[today] = {};
    byDay[today][p.domain] = (byDay[today][p.domain] || 0) + p.timeSpentSeconds;
  }

  if (Object.keys(byDay).length === 0) {
    list.innerHTML = '<div class="empty">No sessions logged yet.</div>';
    return;
  }

  const days = Object.keys(byDay).sort().reverse();
  list.innerHTML = days.map(day => {
    const sites = byDay[day];
    const dayTotal = Object.values(sites).reduce((a, b) => a + b, 0);
    const maxSecs = Math.max(...Object.values(sites));

    // Which domains are currently live today
    const liveDomainsToday = new Set(inProgress.map(p => p.domain));

    const rows = Object.entries(sites)
      .sort((a, b) => b[1] - a[1])
      .map(([domain, secs]) => {
        const pct    = Math.round((secs / maxSecs) * 100);
        const isLive = day === today && liveDomainsToday.has(domain);
        const visits = (currentVisitCount[day] || {})[domain] || 0;
        const visitLabel = visits > 0 ? `<span style="color:#555;font-size:10px;">${visits}x</span>` : '';
        return `
          <div class="site-row">
            <span class="site-name">${domain} ${visitLabel}</span>
            <div class="bar-wrap"><div class="bar bar-blocked" style="width:${pct}%"></div></div>
            <span class="site-time">${isLive ? '🔴 ' : ''}${formatTime(secs)}</span>
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
function worthItBadge(worthIt) {
  if (worthIt === true)  return ' <span style="color:#5cb85c;font-size:10px;">✓ worth it</span>';
  if (worthIt === false) return ' <span style="color:#e05252;font-size:10px;">✗ waste of time</span>';
  return '';
}

function renderLog(logs, inProgress) {
  const list = document.getElementById('log-list');

  if (logs.length === 0 && inProgress.length === 0) {
    list.innerHTML = '<div class="empty">No sessions logged yet.</div>';
    return;
  }

  // In-progress entries at top
  const liveRows = inProgress
    .slice()
    .sort((a, b) => b.startTime - a.startTime)
    .map(p => {
      const visits = todayVisits(p.domain);
      return `
        <div class="log-entry log-live">
          <div class="log-top">
            <span class="log-domain">${p.domain}</span>
            <span class="log-time log-time-live">🔴 ${formatTime(p.timeSpentSeconds)}</span>
          </div>
          <div class="log-reason">"${p.reason}"</div>
          <div class="log-date">In progress · visit #${visits} today · started ${formatDateTime(new Date(p.startTime).toISOString())}</div>
        </div>`;
    }).join('');

  // Completed entries
  const doneRows = [...logs].reverse().map(entry => `
    <div class="log-entry">
      <div class="log-top">
        <span class="log-domain">${entry.domain}</span>
        <span class="log-time">${formatTime(entry.timeSpentSeconds)}${worthItBadge(entry.worthIt)}</span>
      </div>
      <div class="log-reason">"${entry.reason}"</div>
      <div class="log-date">${formatDateTime(entry.date)}</div>
    </div>`).join('');

  list.innerHTML = liveRows + doneRows;
}

// ── Export CSV ─────────────────────────────────────────────────────────────
function exportCSV(logs, siteTime) {
  let csv = 'BLOCKED SITE SESSIONS\nDate,Domain,Reason,Seconds,Time\n';
  csv += logs.map(l =>
    [l.date, l.domain, `"${l.reason.replace(/"/g, '""')}"`,
     l.timeSpentSeconds || 0, formatTime(l.timeSpentSeconds)].join(',')
  ).join('\n');

  csv += '\n\nALL SITES (DAILY)\nDate,Domain,Seconds,Time\n';
  const rows = [];
  for (const [day, sites] of Object.entries(siteTime))
    for (const [hostname, secs] of Object.entries(sites))
      rows.push([day, hostname, secs, formatTime(secs)].join(','));
  csv += rows.join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `site-blocker-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Live update (always running) ───────────────────────────────────────────
let liveInterval = null;

function startLiveUpdate() {
  if (liveInterval) return;
  liveInterval = setInterval(() => {
    chrome.runtime.sendMessage({ action: 'getLiveData' }, r => {
      if (!r) return;
      currentLogs       = r.logs;
      currentSiteTime   = r.siteTime;
      currentInProgress = r.inProgress;
      currentVisitCount = r.visitCount || {};

      // Keep allDays in sync without resetting dayIndex
      const today = new Date().toISOString().slice(0, 10);
      const updated = Object.keys(currentSiteTime).sort();
      if (!updated.includes(today)) updated.push(today);
      allDays = updated;
      if (dayIndex >= allDays.length) dayIndex = allDays.length - 1;

      renderStats(currentLogs, currentInProgress, currentSiteTime);
      showAllSitesDay();
      renderDaily(currentLogs, currentInProgress);
      renderLog(currentLogs, currentInProgress);
    });
  }, 1000);
}

function stopLiveUpdate() {
  if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
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
let currentLogs       = [];
let currentSiteTime   = {};
let currentInProgress = [];
let currentVisitCount = {};

chrome.runtime.sendMessage({ action: 'getLiveData' }, r => {
  currentLogs       = r.logs        || [];
  currentSiteTime   = r.siteTime    || {};
  currentInProgress = r.inProgress  || [];
  currentVisitCount = r.visitCount  || {};

  renderStats(currentLogs, currentInProgress, currentSiteTime);
  initAllSites(currentSiteTime);
  renderDaily(currentLogs, currentInProgress);
  renderLog(currentLogs, currentInProgress);
  startLiveUpdate();
});

window.addEventListener('unload', stopLiveUpdate);

document.getElementById('export-btn').addEventListener('click', () => {
  exportCSV(currentLogs, currentSiteTime);
});

document.getElementById('clear-btn').addEventListener('click', () => {
  if (!confirm('Clear all logs and browsing data?')) return;
  Promise.all([
    new Promise(res => chrome.runtime.sendMessage({ action: 'clearLogs' },       r => res(r))),
    new Promise(res => chrome.runtime.sendMessage({ action: 'clearSiteTime' },   r => res(r))),
    new Promise(res => chrome.runtime.sendMessage({ action: 'clearVisitCount' }, r => res(r))),
  ]).then(() => {
    currentLogs = []; currentSiteTime = {}; currentInProgress = []; currentVisitCount = {};
    renderStats([], [], {});
    initAllSites({});
    renderDaily([], []);
    renderLog([], []);
  });
});
