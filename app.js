/* My Day: expenses, goals and Google tasks. All data lives in localStorage on this device. */
'use strict';

const STORE_KEY = 'myday.v1';
const CATEGORIES = ['Food', 'Groceries', 'Transport', 'Shopping', 'Bills', 'Fun', 'Health', 'Education', 'Other'];

const DEFAULT_STATE = {
  settings: {
    currency: 'EUR',
    target: 800,
    limit: 1000,
    clientId: '',
    gmailQuery: 'is:starred -in:trash',
  },
  expenses: [],   // {id, date:'YYYY-MM-DD', amount, category, note}
  goals: [],      // {id, title, habit, time:'HH:MM', steps:[{id,text,done}], log:{'YYYY-MM-DD':true}, created}
  notified: {},   // goalId -> 'YYYY-MM-DD' of the last reminder shown
  taskDone: {},   // Gmail/Classroom item id -> true when ticked off here
};

let state = load();
let viewMonth = monthKey(new Date());

// ---------- storage ----------
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...saved, settings: { ...DEFAULT_STATE.settings, ...saved.settings } };
    }
  } catch (e) { console.warn('Could not load saved data', e); }
  return structuredClone(DEFAULT_STATE);
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save on this device'); }
}

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
function pad(n) { return String(n).padStart(2, '0'); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function todayKey() { return dateKey(new Date()); }
function parseKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d || 1); }
function daysInMonth(mk) { const d = parseKey(mk); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(n) {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: state.settings.currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(n); }
  catch { return n.toFixed(2) + ' ' + state.settings.currency; }
}
function fmtDay(key, opts = { weekday: 'long', day: 'numeric', month: 'long' }) { return parseKey(key).toLocaleDateString(undefined, opts); }
function fmtMonth(mk) { return parseKey(mk).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }
function sum(list) { return list.reduce((t, e) => t + e.amount, 0); }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- budget maths ----------
function monthStats(mk) {
  const items = state.expenses.filter((e) => e.date.startsWith(mk));
  const spent = sum(items);
  const { target, limit } = state.settings;
  const total = daysInMonth(mk);
  const isCurrent = mk === monthKey(new Date());
  const dayOfMonth = isCurrent ? new Date().getDate() : total;
  const daysLeft = isCurrent ? total - dayOfMonth + 1 : 0; // today counts as a day you can still spend
  const avg = spent / Math.max(dayOfMonth, 1);
  const level = spent > limit ? 'bad' : spent > target ? 'warn' : 'ok';
  return { items, spent, target, limit, total, dayOfMonth, daysLeft, avg, level, isCurrent };
}

function monthParagraph(mk) {
  const s = monthStats(mk);
  const parts = [];
  if (!s.isCurrent) {
    parts.push(`In ${fmtMonth(mk)} you spent <b>${money(s.spent)}</b>, about ${money(s.avg)} a day.`);
    if (s.spent > s.limit) parts.push(`That was ${money(s.spent - s.limit)} over your ${money(s.limit)} limit.`);
    else if (s.spent > s.target) parts.push(`That was over your ${money(s.target)} target but under the ${money(s.limit)} limit.`);
    else parts.push(`That's ${money(s.target - s.spent)} under your ${money(s.target)} target. Nice.`);
    return parts.join(' ');
  }
  parts.push(`So far this month you've spent <b>${money(s.spent)}</b> of your ${money(s.target)} target.`);
  if (s.spent <= s.target) {
    const left = s.target - s.spent;
    parts.push(`You have <b>${money(left)}</b> left, which is about <b>${money(left / s.daysLeft)} a day</b> for the ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left.`);
  } else if (s.spent <= s.limit) {
    const left = s.limit - s.spent;
    parts.push(`You're past your target. Only <b>${money(left)}</b> is left before your ${money(s.limit)} limit, about ${money(left / s.daysLeft)} a day.`);
  } else {
    parts.push(`You're <b>${money(s.spent - s.limit)} over</b> your ${money(s.limit)} limit.`);
  }
  // Projection at the current pace
  const projected = s.avg * s.total;
  if (s.dayOfMonth >= 3 && s.spent > 0) {
    if (projected > s.limit) parts.push(`At this pace you'd end the month around ${money(projected)}, over your limit.`);
    else if (projected > s.target) parts.push(`At this pace you'd end around ${money(projected)}, a bit over target.`);
  }
  return parts.join(' ');
}

function todayParagraph() {
  const t = todayKey();
  const items = state.expenses.filter((e) => e.date === t);
  if (!items.length) return 'You haven\'t logged anything today yet.';
  const spent = sum(items);
  const byCat = {};
  items.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const [topCat, topAmt] = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  let txt = `Today you spent <b>${money(spent)}</b> on ${items.length} thing${items.length === 1 ? '' : 's'}`;
  txt += items.length > 1 ? `, mostly ${esc(topCat)} (${money(topAmt)}).` : ` (${esc(topCat)}).`;
  const s = monthStats(monthKey(new Date()));
  // Allowance for today is what was left this morning, spread over the remaining days
  const before = s.spent - spent;
  const cap = before < s.target ? s.target : s.limit;
  const dailyAllowance = Math.max(cap - before, 0) / s.daysLeft;
  if (dailyAllowance > 0) {
    txt += spent <= dailyAllowance
      ? ` That's within your daily allowance of ${money(dailyAllowance)}.`
      : ` That's ${money(spent - dailyAllowance)} more than your daily allowance of ${money(dailyAllowance)}.`;
  }
  return txt;
}

function barHTML(mk) {
  const s = monthStats(mk);
  const scale = Math.max(s.limit, s.spent) * 1.05 || 1;
  const pct = (v) => (v / scale) * 100;
  return `<div class="bar" role="img" aria-label="Spent ${money(s.spent)} of ${money(s.target)} target">
    <div class="bar-fill ${s.level === 'ok' ? '' : s.level}" style="width:${pct(s.spent)}%"></div>
    <div class="bar-mark" style="left:${pct(s.target)}%"></div>
    <div class="bar-mark" style="left:${pct(s.limit)}%"></div>
  </div>
  <p class="bar-legend muted"><span>Spent ${money(s.spent)}</span><span>Target ${money(s.target)} · Limit ${money(s.limit)}</span></p>`;
}

// ---------- rendering ----------
function render() {
  renderPill();
  renderToday();
  renderExpenses();
  renderGoals();
  renderSettings();
}

function renderPill() {
  const s = monthStats(monthKey(new Date()));
  const pill = $('#month-pill');
  pill.className = 'pill ' + (s.level === 'ok' ? '' : s.level);
  pill.textContent = s.spent <= s.target ? `${money(s.target - s.spent)} left` : s.spent <= s.limit ? `${money(s.limit - s.spent)} to limit` : 'Over limit';
}

function renderToday() {
  $('#today-date').textContent = fmtDay(todayKey());
  $('#today-money-text').innerHTML = todayParagraph() + '</p><p class="summary">' + monthParagraph(monthKey(new Date()));
  $('#today-bar').innerHTML = barHTML(monthKey(new Date()));

  const t = todayKey();
  const habits = state.goals.filter((g) => g.habit);
  $('#today-habits').innerHTML = habits.length
    ? habits.map((g) => `<li class="${g.log[t] ? 'done' : ''}">
        <input type="checkbox" data-habit="${g.id}" ${g.log[t] ? 'checked' : ''} aria-label="Done: ${esc(g.habit)}">
        <span class="grow"><span class="title">${esc(g.habit)}</span><span class="sub">${esc(g.title)}${g.time ? ' · ' + g.time : ''}</span></span>
        <span class="streak">🔥 ${streak(g)}</span></li>`).join('')
    : '<li class="empty">No habits yet. Add a goal with a daily habit in Goals.</li>';

  if (window.Google) Google.renderTasks();
}

function renderExpenses() {
  const mk = viewMonth;
  $('#month-label').textContent = fmtMonth(mk);
  $('#month-next').disabled = mk >= monthKey(new Date());
  $('#month-text').innerHTML = monthParagraph(mk);
  $('#month-bar').innerHTML = barHTML(mk);

  const s = monthStats(mk);
  const byCat = {};
  s.items.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $('#cat-breakdown').innerHTML = cats.map(([c, v]) => `<div class="cat-row"><span>${esc(c)}</span>
      <div class="cat-track"><div style="width:${(v / s.spent) * 100}%"></div></div><span>${money(v)}</span></div>`).join('');

  const days = {};
  s.items.forEach((e) => { (days[e.date] ||= []).push(e); });
  const keys = Object.keys(days).sort().reverse();
  $('#day-list').innerHTML = keys.length ? keys.map((k, i) => {
    const list = days[k];
    return `<details class="day" ${i === 0 ? 'open' : ''}>
      <summary><span>${fmtDay(k, { weekday: 'short', day: 'numeric', month: 'short' })} <span class="muted">· ${list.length} item${list.length === 1 ? '' : 's'}</span></span><span>${money(sum(list))}</span></summary>
      <ul class="list">${list.map((e) => `<li><span class="grow"><span class="title">${esc(e.note || e.category)}</span><span class="sub">${esc(e.category)}</span></span>
        <span>${money(e.amount)}</span><button class="icon-btn" data-del-exp="${e.id}" aria-label="Delete">×</button></li>`).join('')}</ul>
    </details>`;
  }).join('') : '<p class="empty">Nothing logged this month.</p>';
}

function streak(goal) {
  let n = 0;
  const d = new Date();
  if (!goal.log[dateKey(d)]) d.setDate(d.getDate() - 1); // today not done yet doesn't break the streak
  while (goal.log[dateKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function calendarLink(goal) {
  const [h, m] = (goal.time || '18:00').split(':').map(Number);
  const start = new Date(); start.setHours(h, m, 0, 0);
  if (start < new Date()) start.setDate(start.getDate() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const f = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${goal.habit || 'Work on goal'}: ${goal.title}`,
    dates: `${f(start)}/${f(end)}`,
    recur: 'RRULE:FREQ=DAILY',
    details: `Daily habit for your goal "${goal.title}".`,
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

function renderGoals() {
  const t = todayKey();
  $('#goal-list').innerHTML = state.goals.length ? state.goals.map((g) => {
    const done = g.steps.filter((s) => s.done).length;
    const pct = g.steps.length ? (done / g.steps.length) * 100 : 0;
    const dots = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dateKey(d);
      dots.push(`<i class="${g.log[k] ? 'on' : ''}" title="${fmtDay(k, { day: 'numeric', month: 'short' })}"></i>`);
    }
    return `<article class="card" data-goal="${g.id}">
      <div class="goal-head"><h2>${esc(g.title)}</h2><span class="streak">🔥 ${streak(g)} day streak</span></div>
      ${g.habit ? `<label class="habit-box"><input type="checkbox" data-habit="${g.id}" ${g.log[t] ? 'checked' : ''}>
        <span><b>${esc(g.habit)}</b> today${g.time ? ` <span class="muted">· reminder ${g.time}</span>` : ''}</span></label>
        <div class="dots" aria-label="Last 14 days">${dots.join('')}</div>` : ''}
      <div class="progress"><div style="width:${pct}%"></div></div>
      <p class="muted">${g.steps.length ? `${done} of ${g.steps.length} steps done` : 'Break it into steps below.'}</p>
      <ul class="list">${g.steps.map((s) => `<li class="${s.done ? 'done' : ''}">
        <input type="checkbox" data-step="${s.id}" ${s.done ? 'checked' : ''}>
        <span class="grow"><span class="title">${esc(s.text)}</span></span>
        <button class="icon-btn" data-del-step="${s.id}" aria-label="Delete step">×</button></li>`).join('')}</ul>
      <form class="add-step" data-add-step="${g.id}"><input name="text" placeholder="Add a step, e.g. Complete the course" maxlength="100" required><button class="btn">Add</button></form>
      <div class="goal-actions">
        ${g.habit ? `<a class="btn small" href="${calendarLink(g)}" target="_blank" rel="noopener">📅 Add daily reminder to Google Calendar</a>` : ''}
        <button class="btn small ghost danger" data-del-goal="${g.id}">Delete goal</button>
      </div>
    </article>`;
  }).join('') : '<p class="empty">No goals yet. Try "Learn Claude Code" with the habit "Work 1 hour".</p>';
}

function renderSettings() {
  const bf = $('#budget-form');
  bf.target.value = state.settings.target;
  bf.limit.value = state.settings.limit;
  bf.currency.value = state.settings.currency;
  const gf = $('#google-form');
  gf.clientId.value = state.settings.clientId;
  gf.gmailQuery.value = state.settings.gmailQuery;
  const status = !('Notification' in window) ? 'This browser does not support notifications.'
    : Notification.permission === 'granted' ? 'Notifications are on.'
    : Notification.permission === 'denied' ? 'Notifications are blocked in your browser settings.' : '';
  $('#notif-status').textContent = status;
  $('#notif-btn').hidden = !('Notification' in window) || Notification.permission !== 'default';
}

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  try { sessionStorage.setItem('myday.tab', name); } catch {}
  window.scrollTo(0, 0);
}

// ---------- events ----------
function bind() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) { e.preventDefault(); showTab(go.dataset.goto); if (go.dataset.focus) $('#' + go.dataset.focus).focus(); }
  });

  $('#exp-category').innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join('');
  $('#exp-date').value = todayKey();

  $('#exp-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const amount = parseFloat(f.amount.value.replace(',', '.'));
    if (!(amount > 0)) { toast('Enter an amount above 0'); return; }
    state.expenses.push({ id: uid(), date: f.date.value || todayKey(), amount: Math.round(amount * 100) / 100, category: f.category.value, note: f.note.value.trim() });
    save();
    viewMonth = f.date.value.slice(0, 7);
    f.amount.value = ''; f.note.value = ''; f.date.value = todayKey();
    render();
    toast(`Saved ${money(amount)}`);
  });

  $('#day-list').addEventListener('click', (e) => {
    const id = e.target.dataset.delExp;
    if (!id) return;
    const exp = state.expenses.find((x) => x.id === id);
    if (exp && confirm(`Delete ${money(exp.amount)} (${exp.note || exp.category})?`)) {
      state.expenses = state.expenses.filter((x) => x.id !== id);
      save(); render();
    }
  });

  $('#month-prev').addEventListener('click', () => { const d = parseKey(viewMonth); d.setMonth(d.getMonth() - 1); viewMonth = monthKey(d); renderExpenses(); });
  $('#month-next').addEventListener('click', () => { const d = parseKey(viewMonth); d.setMonth(d.getMonth() + 1); viewMonth = monthKey(d); renderExpenses(); });

  $('#goal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    state.goals.push({ id: uid(), title: f.title.value.trim(), habit: f.habit.value.trim(), time: f.time.value, steps: [], log: {}, created: todayKey() });
    save(); f.reset(); f.time.value = '18:00';
    render();
  });

  // Habit checkboxes appear on Today and Goals
  document.addEventListener('change', (e) => {
    const hid = e.target.dataset.habit;
    if (hid) {
      const g = state.goals.find((x) => x.id === hid);
      if (!g) return;
      if (e.target.checked) g.log[todayKey()] = true; else delete g.log[todayKey()];
      save(); render();
      if (e.target.checked) toast(`Nice! ${streak(g)} day streak`);
    }
    const sid = e.target.dataset.step;
    if (sid) {
      for (const g of state.goals) {
        const s = g.steps.find((x) => x.id === sid);
        if (s) { s.done = e.target.checked; save(); renderGoals(); }
      }
    }
  });

  $('#goal-list').addEventListener('submit', (e) => {
    const gid = e.target.dataset.addStep;
    if (!gid) return;
    e.preventDefault();
    const g = state.goals.find((x) => x.id === gid);
    g.steps.push({ id: uid(), text: e.target.text.value.trim(), done: false });
    save(); renderGoals();
    document.querySelector(`[data-add-step="${gid}"] input`).focus();
  });

  $('#goal-list').addEventListener('click', (e) => {
    const sid = e.target.dataset.delStep;
    if (sid) { state.goals.forEach((g) => { g.steps = g.steps.filter((s) => s.id !== sid); }); save(); renderGoals(); }
    const gid = e.target.dataset.delGoal;
    if (gid) {
      const g = state.goals.find((x) => x.id === gid);
      if (confirm(`Delete the goal "${g.title}" and its history?`)) { state.goals = state.goals.filter((x) => x.id !== gid); save(); render(); }
    }
  });

  $('#budget-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const target = Number(f.target.value), limit = Number(f.limit.value);
    if (limit < target) { toast('The limit should be at least the target'); return; }
    Object.assign(state.settings, { target, limit, currency: f.currency.value });
    save(); render(); toast('Budget saved');
  });

  $('#google-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.settings.clientId = e.target.clientId.value.trim();
    state.settings.gmailQuery = e.target.gmailQuery.value.trim() || DEFAULT_STATE.settings.gmailQuery;
    save(); toast('Saved');
  });

  $('#notif-btn').addEventListener('click', async () => {
    const p = await Notification.requestPermission();
    renderSettings();
    if (p === 'granted') { notify('Reminders are on', 'You\'ll get a nudge at each goal\'s reminder time.'); }
  });

  $('#export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `myday-backup-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.expenses) || !Array.isArray(data.goals)) throw new Error('bad file');
      if (!confirm('Replace everything on this device with the backup?')) return;
      state = { ...DEFAULT_STATE, ...data, settings: { ...DEFAULT_STATE.settings, ...data.settings } };
      save(); render(); toast('Backup restored');
    } catch { toast('That file is not a My Day backup'); }
    e.target.value = '';
  });
}

// ---------- reminders ----------
async function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
  if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: title });
  else new Notification(title, { body });
}

function checkReminders() {
  const now = new Date();
  const t = todayKey();
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  for (const g of state.goals) {
    if (!g.habit || !g.time || g.log[t] || state.notified[g.id] === t) continue;
    if (hhmm >= g.time) {
      state.notified[g.id] = t; save();
      notify(`Time for: ${g.habit}`, `Goal: ${g.title}`);
    }
  }
}

// ---------- start ----------
window.MyDay = { get state() { return state; }, save, render, toast, todayKey, esc };
bind();
let initialTab = 'today';
try { initialTab = sessionStorage.getItem('myday.tab') || 'today'; } catch {}
showTab(initialTab);
render();
checkReminders();
setInterval(checkReminders, 30 * 1000);
// Refresh "today" when the app comes back after midnight or after a while
let lastDay = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (todayKey() !== lastDay) { lastDay = todayKey(); viewMonth = monthKey(new Date()); $('#exp-date').value = lastDay; render(); }
    checkReminders();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed', e));
}

