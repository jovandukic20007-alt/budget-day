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
  tasks: [],      // {id, text, date:'YYYY-MM-DD'|'', time:'HH:MM'|'', done, doneAt}
  notified: {},   // goalId -> 'YYYY-MM-DD' of the last reminder shown
  taskDone: {},   // Gmail/Classroom item id -> true when ticked off here
};

let state = load();
let viewMonth = monthKey(new Date());
let calMonth = monthKey(new Date());
let calDay = null; // selected day on the calendar, set on first render

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
  renderVision();
  renderExpenses();
  renderGoals();
  renderTasks();
  renderCalendar();
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
  const habits = state.goals.filter((g) => isScheduled(g, t) || (g.habit && g.log[t]));
  $('#today-habits').innerHTML = habits.length
    ? habits.map((g) => `<li class="${g.log[t] ? 'done' : ''}">
        <input type="checkbox" data-habit="${g.id}" ${g.log[t] ? 'checked' : ''} aria-label="Done: ${esc(g.habit)}">
        <span class="grow"><span class="title">${esc(g.habit)}</span><span class="sub">${esc(goalPath(g).join(' › '))}${g.time ? ' · ' + g.time : ''}</span></span>
        <span class="streak">🔥 ${streak(g)}</span></li>`).join('')
    : `<li class="empty">${state.goals.some((g) => g.habit) ? 'Nothing scheduled today. Enjoy the day off.' : 'No habits yet. Add a goal with a habit in Goals.'}</li>`;

  const todays = state.tasks.filter((x) => x.date && (x.date < t ? !x.done : x.date === t)).sort(taskSort);
  $('#today-tasks').innerHTML = todays.length ? todays.map((x) => taskItem(x, x.date !== t)).join('')
    : '<li class="empty">No tasks for today.</li>';

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

// ---------- habit schedules ----------
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]; // Monday first
function dayName(n, style = 'short') { const d = new Date(2026, 0, 4 + n); return d.toLocaleDateString(undefined, { weekday: style }); } // 4 Jan 2026 is a Sunday

function sched(g) {
  return g.schedule || { days: [0, 1, 2, 3, 4, 5, 6], every: 1, start: g.created || todayKey(), end: '' };
}
function mondayOf(d) { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; }
function isScheduled(g, key) {
  if (!g.habit) return false;
  const s = sched(g);
  if (key < s.start || (s.end && key > s.end)) return false;
  const d = parseKey(key);
  if (!s.days.includes(d.getDay())) return false;
  if (s.every > 1) {
    const weeks = Math.round((mondayOf(d) - mondayOf(parseKey(s.start))) / (7 * 864e5));
    if (weeks % s.every !== 0) return false;
  }
  return true;
}
function scheduleText(g) {
  const s = sched(g);
  const days = [...s.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  let txt = days.length === 7 ? 'Every day'
    : days.join() === '1,2,3,4,5' ? 'Weekdays'
    : days.join() === '6,0' ? 'Weekends'
    : days.map((n) => dayName(n)).join(', ');
  if (s.every > 1) txt = `Every ${s.every} weeks · ${txt}`;
  if (s.end) txt += ` · until ${fmtDay(s.end, { day: 'numeric', month: 'short' })}`;
  return txt;
}
// Counts scheduled days done in a row; days off don't break it, and today isn't missed until it's over
function streak(goal) {
  let n = 0;
  const d = new Date();
  const first = sched(goal).start;
  for (let i = 0; i < 730; i++) {
    const k = dateKey(d);
    if (k < first) break;
    if (isScheduled(goal, k)) {
      if (goal.log[k]) n++;
      else if (i > 0) break;
    }
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function scheduleFields(s = { days: [1, 2, 3, 4, 5, 6, 0], every: 1, start: todayKey(), end: '' }) {
  return `<fieldset class="sched">
    <legend>Repeat on</legend>
    <div class="chips">${WEEKDAYS.map((n) => `<label class="chip"><input type="checkbox" name="day" value="${n}" ${s.days.includes(n) ? 'checked' : ''}><span>${dayName(n)}</span></label>`).join('')}</div>
    <div class="grid3">
      <label>How often
        <select name="every">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${s.every === n ? 'selected' : ''}>${n === 1 ? 'Every week' : `Every ${n} weeks`}</option>`).join('')}</select>
      </label>
      <label>Starts
        <input type="date" name="start" value="${s.start}" required>
      </label>
      <label>Ends (optional)
        <input type="date" name="end" value="${s.end || ''}">
      </label>
    </div>
  </fieldset>`;
}
function readSchedule(f) {
  const days = [...f.querySelectorAll('input[name=day]:checked')].map((i) => Number(i.value));
  if (!days.length) { toast('Pick at least one day'); return null; }
  const start = f.start.value || todayKey(), end = f.end.value;
  if (end && end < start) { toast('The end date is before the start'); return null; }
  return { days, every: Number(f.every.value) || 1, start, end };
}

// ---------- goal tree ----------
const closedNodes = new Set(); // sub-goals the viewer collapsed this session
const openStepForms = new Set(); // keeps the step form open while adding several steps
function childrenOf(id) { return state.goals.filter((g) => (g.parentId || null) === id); }
function subtree(id) { return [id, ...childrenOf(id).flatMap((c) => subtree(c.id))]; }
function goalPath(g) { const p = []; let c = g; while (c) { p.unshift(c.title); c = state.goals.find((x) => x.id === c.parentId); } return p; }
function treeStats(g) {
  const all = subtree(g.id).map((id) => state.goals.find((x) => x.id === id));
  const steps = all.flatMap((x) => x.steps);
  return { goals: all.length - 1, steps: steps.length, done: steps.filter((x) => x.done).length, habits: all.filter((x) => x.habit).length };
}
// Options for "Part of": every goal, indented by depth, minus the ones in `exclude`
function parentOptions(selected, exclude = []) {
  const out = [`<option value="">Nothing, it's a big goal</option>`];
  const walk = (pid, depth) => childrenOf(pid).forEach((g) => {
    if (exclude.includes(g.id)) return;
    out.push(`<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${'  '.repeat(depth)}${depth ? '└ ' : ''}${esc(g.title)}</option>`);
    walk(g.id, depth + 1);
  });
  walk(null, 0);
  return out.join('');
}

function goalBody(g) {
  const t = todayKey();
  const parts = [];
  if (g.why) parts.push(`<p class="why">💭 ${esc(g.why)}</p>`);
  if (g.habit) {
    const dots = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dateKey(d);
      const cls = g.log[k] ? 'on' : isScheduled(g, k) ? (i > 0 ? 'miss' : 'due') : 'off';
      dots.push(`<i class="${cls}" title="${fmtDay(k, { weekday: 'short', day: 'numeric', month: 'short' })}"></i>`);
    }
    parts.push(isScheduled(g, t) || g.log[t]
      ? `<label class="habit-box"><input type="checkbox" data-habit="${g.id}" ${g.log[t] ? 'checked' : ''}>
        <span><b>${esc(g.habit)}</b> today${g.time ? ` <span class="muted">· reminder ${g.time}</span>` : ''}</span><span class="streak">🔥 ${streak(g)}</span></label>`
      : `<div class="habit-box off"><span><b>${esc(g.habit)}</b> · day off today</span></div>`);
    parts.push(`<p class="muted sched-line">🔁 ${esc(scheduleText(g))}${g.time ? ` at ${g.time}` : ''}</p><div class="dots" aria-label="Last 14 days">${dots.join('')}</div>`);
  }
  if (g.steps.length) {
    parts.push(`<ul class="list">${g.steps.map((x) => `<li class="${x.done ? 'done' : ''}">
      <input type="checkbox" data-step="${x.id}" ${x.done ? 'checked' : ''}>
      <span class="grow"><span class="title">${esc(x.text)}</span>${x.due ? `<span class="sub ${!x.done && x.due < t ? 'overdue' : ''}">📅 ${fmtDay(x.due, { weekday: 'short', day: 'numeric', month: 'short' })}</span>` : ''}</span>
      <button class="icon-btn" data-del-step="${x.id}" aria-label="Delete step">×</button></li>`).join('')}</ul>`);
  }
  const kids = childrenOf(g.id);
  if (kids.length) parts.push(`<div class="subgoals">${kids.map(goalNode).join('')}</div>`);
  parts.push(`<label class="move">📍 Part of
    <select data-move="${g.id}" aria-label="Move this goal">${parentOptions(g.parentId, subtree(g.id))}</select></label>`);
  parts.push(`<div class="goal-actions">
    <details class="edit-goal" ${openStepForms.has(g.id) ? 'open' : ''} data-step-form="${g.id}">
      <summary class="btn small">+ Step</summary>
      <form class="add-step" data-add-step="${g.id}"><input name="text" placeholder="e.g. Finish the course" maxlength="100" required>
        <input name="due" type="date" aria-label="Due date (optional)" title="Due date (optional)"><button class="btn primary">Add</button></form>
    </details>
    <button class="btn small" data-add-under="${g.id}">+ Goal under this</button>
    <details class="edit-goal">
      <summary class="btn small ghost">Edit</summary>
      <form class="form" data-edit-goal="${g.id}">
        <label>Goal<input name="title" type="text" value="${esc(g.title)}" maxlength="80" required></label>
        <label>Part of<select name="parent">${parentOptions(g.parentId, subtree(g.id))}</select></label>
        <label>Why it matters<input name="why" type="text" value="${esc(g.why || '')}" maxlength="140"></label>
        <div class="grid2">
          <label>Habit<input name="habit" type="text" value="${esc(g.habit)}" placeholder="e.g. Work 1 hour" maxlength="60"></label>
          <label>Remind me at<input name="time" type="time" value="${g.time || ''}"></label>
        </div>
        ${scheduleFields(sched(g))}
        <div class="row gap wrap"><button class="btn primary">Save changes</button><button type="button" class="btn ghost danger" data-del-goal="${g.id}">Delete goal</button></div>
      </form>
    </details>
  </div>`);
  return parts.join('');
}

function goalBadges(g) {
  const st = treeStats(g);
  const b = [];
  if (g.habit) b.push(`🔁 ${esc(g.habit)}${isScheduled(g, todayKey()) ? (g.log[todayKey()] ? ' ✓' : ' · today') : ''}`);
  if (st.steps) b.push(`${st.done}/${st.steps} steps`);
  if (st.goals) b.push(`${st.goals} goal${st.goals === 1 ? '' : 's'} below`);
  return b.map((x) => `<span class="badge">${x}</span>`).join('');
}

function goalNode(g) {
  return `<details class="node" data-node="${g.id}" ${closedNodes.has(g.id) ? '' : 'open'}>
    <summary><span class="node-title">${esc(g.title)}</span><span class="badges">${goalBadges(g)}</span></summary>
    <div class="node-body">${goalBody(g)}</div>
  </details>`;
}

function renderGoals() {
  const roots = childrenOf(null);
  $('#goal-list').innerHTML = roots.length ? roots.map((g) => {
    const st = treeStats(g);
    const pct = st.steps ? (st.done / st.steps) * 100 : 0;
    return `<article class="card big-goal" data-goal="${g.id}">
      <p class="eyebrow">Big goal</p>
      <h2>${esc(g.title)}</h2>
      ${st.steps ? `<div class="progress"><div style="width:${pct}%"></div></div>
      <p class="muted">${st.done} of ${st.steps} steps done${st.goals ? ` across ${st.goals + 1} goals` : ''}</p>` : ''}
      ${goalBody(g)}
    </article>`;
  }).join('') : '<p class="empty">No goals yet. Start with a big one, like "Be rich" or "End phone addiction", then add the goals that get you there.</p>';
  $('#goal-form select[name=parent]').innerHTML = parentOptions($('#goal-form select[name=parent]').value);
}

function renderVision() {
  const roots = childrenOf(null);
  $('#vision-card').hidden = !roots.length;
  $('#vision-list').innerHTML = roots.map((g) => {
    const kids = childrenOf(g.id);
    return `<li><b>${esc(g.title)}</b>${g.why ? `<span class="sub">${esc(g.why)}</span>` : ''}
      ${kids.length ? `<ul>${kids.map((k) => `<li>${esc(k.title)}${k.habit && isScheduled(k, todayKey()) ? ` <span class="${k.log[todayKey()] ? 'ok-text' : 'due-soon'}">· ${k.log[todayKey()] ? 'done today' : 'today'}</span>` : ''}</li>`).join('')}</ul>` : ''}</li>`;
  }).join('');
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

// ---------- tasks ----------
function taskSort(a, b) { return (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99').localeCompare(b.time || '99'); }
function taskWhen(x, withDay = true) {
  const t = todayKey();
  if (!x.date) return x.time || '';
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const day = x.date === t ? 'Today' : x.date === dateKey(tomorrow) ? 'Tomorrow' : fmtDay(x.date, { weekday: 'short', day: 'numeric', month: 'short' });
  return [withDay ? day : '', x.time].filter(Boolean).join(' · ');
}
function taskItem(x, withDay = true) {
  const late = !x.done && x.date && (x.date < todayKey() || (x.date === todayKey() && x.time && x.time < new Date().toTimeString().slice(0, 5)));
  const when = taskWhen(x, withDay);
  return `<li class="${x.done ? 'done' : ''}">
    <input type="checkbox" data-task="${x.id}" ${x.done ? 'checked' : ''} aria-label="Done: ${esc(x.text)}">
    <span class="grow"><span class="title">${esc(x.text)}</span>${when ? `<span class="sub ${late ? 'overdue' : ''}">${late && x.date < todayKey() ? 'Overdue · ' : ''}${esc(when)}</span>` : ''}</span>
    <button class="icon-btn" data-del-task="${x.id}" aria-label="Delete task">×</button></li>`;
}
function renderTasks() {
  const t = todayKey();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tm = dateKey(tomorrow);
  const open = state.tasks.filter((x) => !x.done).sort(taskSort);
  const groups = [
    ['Overdue', open.filter((x) => x.date && x.date < t), true],
    ['Today', open.filter((x) => x.date === t), false],
    ['Tomorrow', open.filter((x) => x.date === tm), false],
    ['Later', open.filter((x) => x.date && x.date > tm), true],
    ['Anytime', open.filter((x) => !x.date), false],
  ].filter(([, list]) => list.length);
  $('#task-groups').innerHTML = groups.length
    ? groups.map(([name, list, withDay]) => `<h3>${name} <span class="count">${list.length}</span></h3><ul class="list">${list.map((x) => taskItem(x, withDay)).join('')}</ul>`).join('')
    : '<p class="empty">Nothing to do. Add a task above.</p>';
  const done = state.tasks.filter((x) => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  $('#tasks-done').hidden = !done.length;
  $('#tasks-done-count').textContent = done.length;
  $('#tasks-done-list').innerHTML = done.slice(0, 50).map((x) => taskItem(x)).join('');
  const due = open.filter((x) => x.date && x.date <= t).length;
  $('#tasks-badge').textContent = due || '';
  $('#tasks-badge').hidden = !due;
}

// ---------- calendar ----------
function classroomItems() {
  try { const c = JSON.parse(localStorage.getItem('myday.gtasks') || 'null'); return Array.isArray(c?.classroom) ? c.classroom : []; }
  catch { return []; }
}

// Everything that belongs to one day: habits, steps due, Classroom work due, money spent
function dayAgenda(key, classroom) {
  const habits = state.goals.filter((g) => isScheduled(g, key) || (g.habit && g.log[key]));
  const steps = [];
  state.goals.forEach((g) => g.steps.forEach((s) => { if (s.due === key) steps.push({ goal: g, step: s }); }));
  const school = classroom.filter((w) => w.due && dateKey(new Date(w.due)) === key);
  const spent = state.expenses.filter((e) => e.date === key);
  const tasks = state.tasks.filter((x) => x.date === key).sort(taskSort);
  return { habits, steps, school, spent, tasks };
}

function renderCalendar() {
  const grid = $('#cal-grid');
  if (!grid) return;
  const t = todayKey();
  if (!calDay) calDay = t;
  const classroom = classroomItems();
  const first = parseKey(calMonth);
  $('#cal-label').textContent = fmtMonth(calMonth);
  $('#cal-head').innerHTML = WEEKDAYS.map((n) => `<span>${dayName(n, 'narrow')}</span>`).join('');

  const lead = (first.getDay() + 6) % 7; // blank cells before the 1st, weeks start on Monday
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell blank"></span>');
  for (let d = 1; d <= daysInMonth(calMonth); d++) {
    const key = `${calMonth}-${pad(d)}`;
    const a = dayAgenda(key, classroom);
    const marks = [];
    a.habits.forEach((g) => marks.push(`<i class="m-habit ${g.log[key] ? 'done' : key < t ? 'missed' : ''}"></i>`));
    a.steps.forEach(({ step }) => marks.push(`<i class="m-step ${step.done ? 'done' : ''}"></i>`));
    a.school.forEach(() => marks.push('<i class="m-school"></i>'));
    a.tasks.forEach((x) => marks.push(`<i class="m-task ${x.done ? 'done' : ''}"></i>`));
    const spent = sum(a.spent);
    cells.push(`<button class="cal-cell ${key === t ? 'today' : ''} ${key === calDay ? 'sel' : ''}" data-cal-day="${key}" aria-label="${fmtDay(key)}">
      <span class="num">${d}</span><span class="marks">${marks.slice(0, 6).join('')}</span>${spent ? `<span class="amt">${Math.round(spent)}</span>` : ''}</button>`);
  }
  grid.innerHTML = cells.join('');

  // Details for the selected day
  const a = dayAgenda(calDay, classroom);
  const canTick = calDay <= t;
  const rows = [];
  a.tasks.forEach((x) => rows.push(taskItem(x, false)));
  a.habits.forEach((g) => rows.push(`<li class="${g.log[calDay] ? 'done' : ''}">
    ${canTick ? `<input type="checkbox" data-habit="${g.id}" data-date="${calDay}" ${g.log[calDay] ? 'checked' : ''}>` : '<span class="dot m-habit"></span>'}
    <span class="grow"><span class="title">${esc(g.habit)}</span><span class="sub">🔁 ${esc(g.title)}${g.time ? ' · ' + g.time : ''}</span></span></li>`));
  a.steps.forEach(({ goal, step }) => rows.push(`<li class="${step.done ? 'done' : ''}">
    <input type="checkbox" data-step="${step.id}" ${step.done ? 'checked' : ''}>
    <span class="grow"><span class="title">${esc(step.text)}</span><span class="sub">🎯 Step for ${esc(goal.title)}</span></span></li>`));
  a.school.forEach((w) => rows.push(`<li><span class="dot m-school"></span>
    <a class="grow" href="${w.link}" target="_blank" rel="noopener"><span class="title">${esc(w.title)}</span><span class="sub">🏫 Due · ${esc(w.course)}</span></a></li>`));
  if (a.spent.length) rows.push(`<li><span class="dot m-money"></span><span class="grow"><span class="title">Spent ${money(sum(a.spent))}</span>
    <span class="sub">${a.spent.map((e) => esc(e.note || e.category)).join(', ')}</span></span></li>`);
  $('#cal-day-title').textContent = calDay === t ? 'Today' : fmtDay(calDay);
  $('#cal-day-list').innerHTML = rows.join('') || '<li class="empty">Nothing planned for this day.</li>';
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

  $('#goal-form .sched-slot').outerHTML = scheduleFields();
  $('#cal-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cal-day]');
    if (b) { calDay = b.dataset.calDay; renderCalendar(); }
  });
  const moveCal = (n) => { const d = parseKey(calMonth); d.setMonth(d.getMonth() + n); calMonth = monthKey(d); renderCalendar(); };
  $('#cal-prev').addEventListener('click', () => moveCal(-1));
  $('#cal-next').addEventListener('click', () => moveCal(1));
  $('#cal-today').addEventListener('click', () => { calMonth = monthKey(new Date()); calDay = todayKey(); renderCalendar(); });

  const addTask = (f) => {
    const text = f.text.value.trim();
    if (!text) return;
    state.tasks.push({ id: uid(), text, date: f.date ? f.date.value : todayKey(), time: f.time ? f.time.value : '', done: false });
    save(); f.text.value = ''; if (f.time) f.time.value = ''; if (f.date) f.date.value = todayKey();
    render(); f.text.focus();
    toast('Task added');
  };
  $('#task-form').addEventListener('submit', (e) => { e.preventDefault(); addTask(e.target); });
  $('#today-task-form').addEventListener('submit', (e) => { e.preventDefault(); addTask(e.target); });
  $('#task-date').value = todayKey();
  document.querySelectorAll('[data-task-date]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(); d.setDate(d.getDate() + Number(b.dataset.taskDate));
    $('#task-date').value = b.dataset.taskDate === 'none' ? '' : dateKey(d);
  }));
  document.addEventListener('change', (e) => {
    const id = e.target.dataset.task;
    if (!id) return;
    const x = state.tasks.find((y) => y.id === id);
    x.done = e.target.checked; x.doneAt = x.done ? Date.now() : undefined;
    save(); render();
    if (x.done) toast('Done ✓');
  });
  document.addEventListener('click', (e) => {
    const id = e.target.dataset.delTask;
    if (!id) return;
    state.tasks = state.tasks.filter((y) => y.id !== id);
    save(); render();
  });
  $('#tasks-clear').addEventListener('click', () => {
    if (!confirm('Remove all finished tasks?')) return;
    state.tasks = state.tasks.filter((y) => !y.done);
    save(); render();
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
    const habit = f.habit.value.trim();
    const schedule = habit ? readSchedule(f) : undefined;
    if (habit && !schedule) return;
    const parentId = f.parent.value || null;
    state.goals.push({ id: uid(), parentId, title: f.title.value.trim(), why: f.why.value.trim(), habit, time: habit ? f.time.value : '', schedule, steps: [], log: {}, created: todayKey() });
    if (parentId) closedNodes.delete(parentId);
    save(); f.reset(); f.time.value = '18:00'; f.querySelector('.sched').outerHTML = scheduleFields();
    f.querySelector('.habit-opt').open = false;
    render();
    toast(parentId ? 'Goal added' : 'Big goal added');
  });

  // Habit checkboxes appear on Today and Goals
  document.addEventListener('change', (e) => {
    const hid = e.target.dataset.habit;
    if (hid) {
      const g = state.goals.find((x) => x.id === hid);
      if (!g) return;
      const day = e.target.dataset.date || todayKey();
      if (e.target.checked) g.log[day] = true; else delete g.log[day];
      save(); render();
      if (e.target.checked) toast(`Nice! ${streak(g)} day streak`);
    }
    const mid = e.target.dataset.move;
    if (mid) {
      const g = state.goals.find((x) => x.id === mid);
      g.parentId = e.target.value || null;
      if (g.parentId) closedNodes.delete(g.parentId);
      save(); render();
      const parent = state.goals.find((x) => x.id === g.parentId);
      toast(parent ? `Moved under "${parent.title}"` : `"${g.title}" is now a big goal`);
      document.querySelector(`[data-goal="${g.id}"], [data-node="${g.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const sid = e.target.dataset.step;
    if (sid) {
      for (const g of state.goals) {
        const s = g.steps.find((x) => x.id === sid);
        if (s) { s.done = e.target.checked; save(); renderGoals(); renderCalendar(); }
      }
    }
  });

  $('#goal-list').addEventListener('submit', (e) => {
    const eid = e.target.dataset.editGoal;
    if (eid) {
      e.preventDefault();
      const f = e.target, g = state.goals.find((x) => x.id === eid);
      const schedule = readSchedule(f);
      if (!schedule) return;
      Object.assign(g, { title: f.title.value.trim(), parentId: f.parent.value || null, why: f.why.value.trim(), habit: f.habit.value.trim(), time: f.time.value, schedule });
      delete state.notified[g.id];
      save(); render(); toast('Saved');
      return;
    }
    const gid = e.target.dataset.addStep;
    if (!gid) return;
    e.preventDefault();
    const g = state.goals.find((x) => x.id === gid);
    g.steps.push({ id: uid(), text: e.target.text.value.trim(), due: e.target.due.value || '', done: false });
    save(); renderGoals(); renderCalendar();
    document.querySelector(`[data-add-step="${gid}"] input`).focus();
  });

  $('#goal-list').addEventListener('toggle', (e) => {
    const id = e.target.dataset?.node;
    if (id) { if (e.target.open) closedNodes.delete(id); else closedNodes.add(id); }
    const sf = e.target.dataset?.stepForm;
    if (sf) {
      if (e.target.open) { openStepForms.add(sf); e.target.querySelector('input').focus(); } else openStepForms.delete(sf);
    }
  }, true);

  $('#goal-list').addEventListener('click', (e) => {
    const sid = e.target.dataset.delStep;
    if (sid) { state.goals.forEach((g) => { g.steps = g.steps.filter((s) => s.id !== sid); }); save(); renderGoals(); }
    const gid = e.target.dataset.delGoal;
    if (gid) {
      const g = state.goals.find((x) => x.id === gid);
      const ids = subtree(gid);
      const extra = ids.length > 1 ? ` and the ${ids.length - 1} goal${ids.length === 2 ? '' : 's'} under it` : '';
      if (confirm(`Delete "${g.title}"${extra}?`)) { state.goals = state.goals.filter((x) => !ids.includes(x.id)); save(); render(); }
    }
    const under = e.target.dataset.addUnder;
    if (under) {
      const f = $('#goal-form');
      f.parent.value = under;
      f.scrollIntoView({ behavior: 'smooth', block: 'start' });
      f.title.focus({ preventScroll: true });
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
    if (!g.time || !isScheduled(g, t) || g.log[t] || state.notified[g.id] === t) continue;
    if (hhmm >= g.time) {
      state.notified[g.id] = t; save();
      notify(`Time for: ${g.habit}`, `Goal: ${g.title}`);
    }
  }
  for (const x of state.tasks) {
    const key = 'task:' + x.id;
    if (x.done || x.date !== t || !x.time || state.notified[key] || hhmm < x.time) continue;
    state.notified[key] = t; save();
    notify(`Task: ${x.text}`, `Planned for ${x.time}`);
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
    if (todayKey() !== lastDay) { lastDay = todayKey(); viewMonth = monthKey(new Date()); $('#exp-date').value = lastDay; $('#task-date').value = lastDay; render(); }
    checkReminders();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); }))
    .catch((e) => console.warn('Service worker failed', e));
}

