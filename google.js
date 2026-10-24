/* Gmail + Google Classroom tasks, read-only, straight from the browser with Google Identity Services. */
'use strict';

window.Google = (() => {
  const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  ].join(' ');
  const TOKEN_KEY = 'myday.gtoken';
  const CACHE_KEY = 'myday.gtasks';

  let tokenClient = null;
  let loading = false;
  let lastError = '';

  const $ = (s) => document.querySelector(s);
  const S = () => window.MyDay.state;

  function getToken() {
    try {
      const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      return t && t.expires > Date.now() + 60000 ? t.access : null;
    } catch { return null; }
  }
  function setToken(access, seconds) {
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ access, expires: Date.now() + seconds * 1000 })); } catch {}
  }
  function getCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } }
  function setCache(c) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {} }
  function connected() { return !!getCache() || !!getToken(); }

  function ensureClient() {
    const id = S().settings.clientId;
    if (!id) throw new Error('Add your OAuth client ID in Settings first (see README).');
    if (!window.google?.accounts?.oauth2) throw new Error('Google sign-in is still loading. Try again in a moment.');
    if (!tokenClient || tokenClient._id !== id) {
      tokenClient = google.accounts.oauth2.initTokenClient({ client_id: id, scope: SCOPES, callback: () => {} });
      tokenClient._id = id;
    }
    return tokenClient;
  }

  // Ask Google for a token. prompt '' reuses an earlier consent without a popup where possible.
  function requestToken(prompt) {
    return new Promise((resolve, reject) => {
      let client;
      try { client = ensureClient(); } catch (e) { reject(e); return; }
      client.callback = (resp) => {
        if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
        setToken(resp.access_token, Number(resp.expires_in) || 3600);
        resolve(resp.access_token);
      };
      client.error_callback = (err) => reject(new Error(err.message || err.type || 'Sign-in was closed'));
      client.requestAccessToken({ prompt });
    });
  }

  async function api(url, token) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401) { sessionStorage.removeItem(TOKEN_KEY); throw new Error('Google sign-in expired. Tap Refresh.'); }
    if (!r.ok) {
      let msg = r.status + '';
      try { msg = (await r.json()).error.message; } catch {}
      throw new Error(msg);
    }
    return r.json();
  }

  async function fetchGmail(token) {
    const q = encodeURIComponent(S().settings.gmailQuery);
    const list = await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${q}`, token);
    const msgs = await Promise.all((list.messages || []).map((m) =>
      api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, token)));
    return msgs.map((m) => {
      const h = (n) => (m.payload.headers.find((x) => x.name === n) || {}).value || '';
      return {
        id: m.id,
        subject: h('Subject') || '(no subject)',
        from: h('From').replace(/<.*>/, '').replace(/"/g, '').trim(),
        date: Number(m.internalDate),
        link: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
      };
    });
  }

  function dueOf(w) {
    if (!w.dueDate) return null;
    const { year, month, day } = w.dueDate;
    const t = w.dueTime || {};
    return Date.UTC(year, month - 1, day, t.hours ?? 23, t.minutes ?? 59);
  }

  async function fetchClassroom(token) {
    const courses = (await api('https://classroom.googleapis.com/v1/courses?studentId=me&courseStates=ACTIVE&pageSize=30', token)).courses || [];
    const now = Date.now(), DAY = 864e5;
    const perCourse = await Promise.all(courses.map(async (c) => {
      const [work, subs] = await Promise.all([
        api(`https://classroom.googleapis.com/v1/courses/${c.id}/courseWork?courseWorkStates=PUBLISHED&orderBy=dueDate%20desc&pageSize=30`, token).catch(() => ({})),
        api(`https://classroom.googleapis.com/v1/courses/${c.id}/courseWork/-/studentSubmissions?userId=me&pageSize=100`, token).catch(() => ({})),
      ]);
      const finished = new Set((subs.studentSubmissions || [])
        .filter((s) => s.state === 'TURNED_IN' || s.state === 'RETURNED').map((s) => s.courseWorkId));
      return (work.courseWork || [])
        .filter((w) => !finished.has(w.id))
        .map((w) => ({ id: w.id, title: w.title, course: c.name, due: dueOf(w), created: Date.parse(w.creationTime), link: w.alternateLink }))
        // Keep: due from 7 days ago up to 21 days ahead, or no due date and posted in the last 14 days
        .filter((w) => w.due ? (w.due > now - 7 * DAY && w.due < now + 21 * DAY) : w.created > now - 14 * DAY);
    }));
    return perCourse.flat().sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
  }

  async function refresh(interactive) {
    if (loading) return;
    loading = true; lastError = ''; renderTasks();
    try {
      let token = getToken();
      if (!token) token = await requestToken(interactive ? 'consent' : '');
      const [gmail, classroom] = await Promise.all([
        fetchGmail(token).catch((e) => ({ error: 'Gmail: ' + e.message })),
        fetchClassroom(token).catch((e) => ({ error: 'Classroom: ' + e.message })),
      ]);
      setCache({ gmail, classroom, at: Date.now() });
    } catch (e) {
      lastError = e.message;
    }
    loading = false;
    renderTasks();
  }

  function doneMap() { const s = S(); return (s.taskDone ||= {}); }

  function itemHTML(id, title, sub, link, extraClass = '') {
    const done = doneMap()[id];
    return `<li class="${done ? 'done' : ''}">
      <input type="checkbox" data-gtask="${id}" ${done ? 'checked' : ''} aria-label="Mark done">
      <a class="grow" href="${link}" target="_blank" rel="noopener"><span class="title">${window.MyDay.esc(title)}</span>
      <span class="sub ${extraClass}">${sub}</span></a></li>`;
  }

  function dueText(due) {
    if (!due) return { text: 'No due date', cls: '' };
    const d = new Date(due);
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().toDateString())) / 864e5);
    const when = days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : days < 0 ? `Overdue by ${-days} day${days === -1 ? '' : 's'}`
      : 'Due ' + d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return { text: when, cls: days < 0 ? 'overdue' : days <= 1 ? 'due-soon' : '' };
  }

  function renderTasks() {
    const esc = window.MyDay.esc;
    const cache = getCache();
    const status = $('#google-status');
    $('#google-refresh').hidden = !S().settings.clientId;
    $('#google-refresh').textContent = loading ? 'Loading…' : 'Refresh';

    if (!S().settings.clientId) {
      status.innerHTML = 'Not connected yet. Add your Google client ID in <a href="#" data-goto="settings">Settings</a>.';
    } else if (lastError) {
      status.textContent = lastError;
    } else if (cache) {
      status.textContent = 'Updated ' + new Date(cache.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } else {
      status.textContent = 'Tap Refresh to load your tasks.';
    }

    const g = cache?.gmail;
    $('#gmail-list').innerHTML = !g ? '<li class="empty">—</li>'
      : g.error ? `<li class="empty">${esc(g.error)}</li>`
      : g.length ? g.map((m) => itemHTML('g' + m.id, m.subject, esc(m.from), m.link)).join('')
      : '<li class="empty">No emails match. Star an email in Gmail to make it a task.</li>';

    const c = cache?.classroom;
    $('#classroom-list').innerHTML = !c ? '<li class="empty">—</li>'
      : c.error ? `<li class="empty">${esc(c.error)}</li>`
      : c.length ? c.map((w) => { const d = dueText(w.due); return itemHTML('c' + w.id, w.title, `<span class="${d.cls}">${d.text}</span> · ${esc(w.course)}`, w.link); }).join('')
      : '<li class="empty">Nothing due. 🎉</li>';
  }

  function disconnect() {
    const t = getToken();
    if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {});
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CACHE_KEY); } catch {}
    renderTasks();
    window.MyDay.toast('Disconnected from Google');
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#google-refresh').addEventListener('click', () => refresh(false));
    $('#google-connect').addEventListener('click', () => { refresh(true).then(() => window.MyDay.toast(lastError || 'Connected')); });
    $('#google-disconnect').addEventListener('click', disconnect);
    document.addEventListener('change', (e) => {
      const id = e.target.dataset.gtask;
      if (!id) return;
      if (e.target.checked) doneMap()[id] = true; else delete doneMap()[id];
      window.MyDay.save(); renderTasks();
    });
    // Load fresh tasks when the app opens, if we still hold a valid token
    if (getToken()) refresh(false);
  });

  return { renderTasks, refresh, connected };
})();
