/* School: subjects, weekly timetable, homework, tests and grades, plus Google Classroom work.
   Uses the state and helpers from app.js (state, save, render, esc, uid, dateKey, parseKey, fmtDay, toast...). */
'use strict';

const SCHOOL_COLORS = ['#4a7bd0', '#d9534f', '#2f8f5b', '#d98a1c', '#8a5cc7', '#3a9ad9', '#c75c9a', '#6b8e23', '#b0723a', '#5f6caf'];
const EXAM_KINDS = { test: 'Test', exam: 'Exam', quiz: 'Quiz', oral: 'Oral exam', project: 'Project' };
const openSubjects = new Set(); // subject cards the viewer opened, kept open across re-renders

function school() {
  const s = (state.school ||= {});
  s.subjects ||= [];  // {id, name, teacher, room, color}
  s.classes ||= [];   // {id, subjectId, day: 0-6 (Sunday 0), start:'HH:MM', end:'HH:MM'}
  s.homework ||= [];  // {id, subjectId, text, due:'YYYY-MM-DD'|'', done, doneAt}
  s.exams ||= [];     // {id, subjectId, kind, title, date, time, gradeId}
  s.grades ||= [];    // {id, subjectId, value, note, date}
  s.scale ||= { min: 1, max: 5 };
  return s;
}

// ---------- helpers ----------
function subjectOf(id) { return school().subjects.find((x) => x.id === id); }
function subjectName(id) { return subjectOf(id)?.name || ''; }
function subjectDot(id) { return `<span class="sdot" style="background:${esc(subjectOf(id)?.color || 'var(--line)')}"></span>`; }
function subjectOptions(selected, blank = 'No subject') {
  return (blank ? `<option value="">${blank}</option>` : '') +
    school().subjects.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
function keyIn(n) { const d = new Date(); d.setDate(d.getDate() + n); return dateKey(d); }
function daysUntil(key) { return Math.round((parseKey(key) - parseKey(todayKey())) / 864e5); }
function shortDay(key) { return fmtDay(key, { weekday: 'short', day: 'numeric', month: 'short' }); }
function relDay(key) {
  const n = daysUntil(key);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 1 && n < 7 ? fmtDay(key, { weekday: 'long' }) : shortDay(key);
}
function countdown(key) {
  const n = daysUntil(key);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? `in ${n} days` : `${-n} day${n === -1 ? '' : 's'} ago`;
}
function nowHHMM() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function classesOn(key) {
  const day = parseKey(key).getDay();
  return school().classes.filter((c) => c.day === day && subjectOf(c.subjectId)).sort((a, b) => a.start.localeCompare(b.start));
}
function hwSort(a, b) { return (a.due || '9999').localeCompare(b.due || '9999'); }
function examLabel(x) { return [EXAM_KINDS[x.kind] || 'Test', subjectName(x.subjectId)].filter(Boolean).join(' · '); }
function fmtGrade(n) { return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''); }
// How good a grade is on the current scale: ok, warn or bad
function gradeLevel(v) {
  const { min, max } = school().scale;
  const lo = Math.min(min, max), hi = Math.max(min, max);
  let p = (v - lo) / ((hi - lo) || 1);
  if (min > max) p = 1 - p; // scales where the smallest number is best, like 1-6
  return p >= 0.7 ? 'ok' : p >= 0.45 ? 'warn' : 'bad';
}
function average(list) { return list.length ? list.reduce((t, g) => t + g.value, 0) / list.length : null; }

// ---------- pieces of UI ----------
function classRow(c, key) {
  const s = subjectOf(c.subjectId);
  const isToday = key === todayKey();
  const now = nowHHMM();
  const live = isToday && c.start <= now && (c.end ? now < c.end : false);
  const meta = [c.start + (c.end ? '–' + c.end : ''), s.room, s.teacher].filter(Boolean).map(esc).join(' · ');
  return `<li class="${isToday && (c.end || c.start) < now && !live ? 'past' : ''}">${subjectDot(c.subjectId)}
    <span class="grow"><span class="title">${esc(s.name)}</span><span class="sub">${meta}</span></span>
    ${live ? '<span class="tag now">Now</span>' : ''}</li>`;
}

function hwItem(h, withDay = true) {
  let when = '';
  let cls = '';
  if (h.due) {
    const n = daysUntil(h.due);
    when = n < 0 ? `Overdue · was due ${shortDay(h.due)}` : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : 'Due ' + shortDay(h.due);
    if (!h.done) cls = n < 0 ? 'overdue' : n <= 1 ? 'due-soon' : '';
    if (!withDay && n >= 0) when = '';
  }
  const sub = [subjectName(h.subjectId), when].filter(Boolean).map(esc).join(' · ');
  return `<li class="${h.done ? 'done' : ''}">
    <input type="checkbox" data-hw="${h.id}" ${h.done ? 'checked' : ''} aria-label="Done: ${esc(h.text)}">
    ${subjectDot(h.subjectId)}
    <span class="grow"><span class="title">${esc(h.text)}</span>${sub ? `<span class="sub ${cls}">${sub}</span>` : ''}</span>
    <button class="icon-btn" data-del-hw="${h.id}" aria-label="Delete homework">×</button></li>`;
}

function examItem(x, withDay = true) {
  const n = daysUntil(x.date);
  const when = [withDay ? relDay(x.date) : '', x.time].filter(Boolean).join(' · ');
  return `<li>${subjectDot(x.subjectId)}
    <span class="grow"><span class="title">${esc(examLabel(x))}</span><span class="sub">${esc([x.title, when].filter(Boolean).join(' · '))}</span></span>
    <span class="tag ${n <= 2 ? 'soon' : ''}">${countdown(x.date)}</span>
    <button class="icon-btn" data-del-exam="${x.id}" aria-label="Delete test">×</button></li>`;
}

// ---------- School tab ----------
function renderSchool() {
  if (!$('#view-school')) return;
  const sc = school();
  const t = todayKey();
  const tm = keyIn(1);

  // Subject pickers (keep what the viewer had picked)
  [['#hw-form', 'No subject'], ['#exam-form', 'No subject'], ['#grade-form', '']].forEach(([f, blank]) => {
    const sel = $(f + ' select[name=subject]');
    const keep = sel.value;
    sel.innerHTML = subjectOptions(keep, blank) || '<option value="">Add a subject first</option>';
    if (keep) sel.value = keep;
  });
  $('#school-start').hidden = sc.subjects.length > 0;

  // Today's classes (or the next school day's)
  let dayKey = t;
  let classes = classesOn(t);
  const lastToday = classes.length ? (classes[classes.length - 1].end || classes[classes.length - 1].start) : '';
  if (!classes.length || lastToday < nowHHMM()) {
    for (let i = 1; i <= 7; i++) {
      const k = keyIn(i);
      if (classesOn(k).length) { dayKey = k; classes = classesOn(k); break; }
    }
  }
  $('#school-today-title').textContent = !sc.classes.length ? 'Classes' : dayKey === t ? "Today's classes" : `Classes ${relDay(dayKey) === 'Tomorrow' ? 'tomorrow' : 'on ' + relDay(dayKey)}`;
  $('#school-classes').innerHTML = !sc.classes.length
    ? '<li class="empty">Add your subjects and when you have them at the bottom of this page, and your day shows up here.</li>'
    : classes.map((c) => classRow(c, dayKey)).join('');
  // Things due that day, shown right under the classes
  const dueThen = sc.homework.filter((h) => !h.done && h.due === dayKey);
  const examsThen = sc.exams.filter((x) => x.date === dayKey);
  $('#school-today-extra').innerHTML = (examsThen.length || dueThen.length) ? `<p class="muted school-heads">${[
    examsThen.length ? `📝 ${examsThen.map((x) => esc(examLabel(x))).join(', ')}` : '',
    dueThen.length ? `📚 ${dueThen.length} homework due` : '',
  ].filter(Boolean).join(' · ')}</p>` : '';

  // Homework
  const open = sc.homework.filter((h) => !h.done).sort(hwSort);
  const groups = [
    ['Overdue', open.filter((h) => h.due && h.due < t), true],
    ['Due today', open.filter((h) => h.due === t), false],
    ['Due tomorrow', open.filter((h) => h.due === tm), false],
    ['Later', open.filter((h) => h.due && h.due > tm), true],
    ['No due date', open.filter((h) => !h.due), false],
  ].filter(([, list]) => list.length);
  $('#hw-groups').innerHTML = groups.length
    ? groups.map(([name, list, withDay]) => `<h3>${name} <span class="count">${list.length}</span></h3><ul class="list">${list.map((h) => hwItem(h, withDay)).join('')}</ul>`).join('')
    : '<p class="empty">No homework. 🎉</p>';
  const done = sc.homework.filter((h) => h.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  $('#hw-done').hidden = !done.length;
  $('#hw-done-count').textContent = done.length;
  $('#hw-done-list').innerHTML = done.slice(0, 50).map((h) => hwItem(h)).join('');

  // Tests and exams
  const upcoming = sc.exams.filter((x) => x.date >= t).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  $('#exam-list').innerHTML = upcoming.length ? upcoming.map((x) => examItem(x)).join('') : '<li class="empty">No tests coming up.</li>';
  const ungraded = sc.exams.filter((x) => x.date < t && !x.gradeId).sort((a, b) => b.date.localeCompare(a.date));
  $('#exam-past-wrap').hidden = !ungraded.length;
  $('#exam-past').innerHTML = ungraded.map((x) => `<li>${subjectDot(x.subjectId)}
    <span class="grow"><span class="title">${esc(examLabel(x))}</span><span class="sub">${esc([x.title, shortDay(x.date)].filter(Boolean).join(' · '))}</span></span>
    <form class="exam-grade" data-exam-grade="${x.id}"><input name="value" type="number" step="any" placeholder="Grade" aria-label="Grade for this test" required><button class="btn small primary">Save</button></form>
    <button class="icon-btn" data-del-exam="${x.id}" aria-label="Remove">×</button></li>`).join('');

  // Grades
  const graded = sc.subjects.map((s) => ({ s, list: sc.grades.filter((g) => g.subjectId === s.id).sort((a, b) => a.date.localeCompare(b.date)) }))
    .filter((x) => x.list.length);
  const avgs = graded.map((x) => average(x.list));
  const overall = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  $('#grade-summary').innerHTML = graded.length ? `
    <div class="grade-table">${graded.map(({ s, list }) => {
      const avg = average(list);
      return `<div class="grade-row">${subjectDot(s.id)}<span class="gname">${esc(s.name)}</span>
        <span class="gchips">${list.map((g) => `<span class="gchip ${gradeLevel(g.value)}" title="${esc([g.note, shortDay(g.date)].filter(Boolean).join(' · '))}">${fmtGrade(g.value)}</span>`).join('')}</span>
        <b class="gavg ${gradeLevel(avg)}">${avg.toFixed(2)}</b></div>`;
    }).join('')}</div>
    <p class="overall">Overall average <b class="${gradeLevel(overall)}-text">${overall.toFixed(2)}</b> <span class="muted">· average of your subject averages</span></p>`
    : '<p class="empty">No grades yet. Add one below, or save a grade on a test after you get it back.</p>';
  const recent = [...sc.grades].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  $('#grade-all').hidden = !recent.length;
  $('#grade-all-list').innerHTML = recent.map((g) => `<li>${subjectDot(g.subjectId)}<span class="grow"><span class="title">${esc(subjectName(g.subjectId) || 'Deleted subject')}${g.note ? ' · ' + esc(g.note) : ''}</span><span class="sub">${shortDay(g.date)}</span></span>
    <b class="${gradeLevel(g.value)}-text">${fmtGrade(g.value)}</b><button class="icon-btn" data-del-grade="${g.id}" aria-label="Delete grade">×</button></li>`).join('');
  const sf = $('#scale-form');
  if (document.activeElement?.form !== sf) { sf.min.value = sc.scale.min; sf.max.value = sc.scale.max; }
  $('#grade-form [name=value]').placeholder = `${sc.scale.min}–${sc.scale.max}`;

  // Google Classroom (same items as on Today)
  const cr = classroomItems();
  const ticked = state.taskDone || {};
  const hasGoogle = !!state.settings.clientId;
  $('#school-gc-refresh').hidden = !hasGoogle;
  $('#school-classroom').innerHTML = !hasGoogle
    ? '<li class="empty">Connect Google in <a href="#" data-goto="settings">Settings</a> to see your Classroom work here.</li>'
    : cr.length ? cr.map((w) => {
      const id = 'c' + w.id;
      const n = w.due ? daysUntil(dateKey(new Date(w.due))) : null;
      const when = n === null ? 'No due date' : n < 0 ? `Overdue · was due ${shortDay(dateKey(new Date(w.due)))}` : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : 'Due ' + shortDay(dateKey(new Date(w.due)));
      const cls = ticked[id] || n === null ? '' : n < 0 ? 'overdue' : n <= 1 ? 'due-soon' : '';
      return `<li class="${ticked[id] ? 'done' : ''}"><input type="checkbox" data-gtask="${id}" ${ticked[id] ? 'checked' : ''} aria-label="Mark done">
        <a class="grow" href="${esc(w.link)}" target="_blank" rel="noopener"><span class="title">${esc(w.title)}</span><span class="sub"><span class="${cls}">${when}</span> · ${esc(w.course)}</span></a></li>`;
    }).join('') : '<li class="empty">Nothing from Classroom right now. Tap Refresh to check again.</li>';

  // Timetable: one column per school day
  const days = WEEKDAYS.filter((d) => d >= 1 && d <= 5 || sc.classes.some((c) => c.day === d));
  const todayDay = new Date().getDay();
  $('#timetable').innerHTML = sc.classes.length ? `<div class="tt" style="grid-template-columns:repeat(${days.length},1fr)">${days.map((d) => {
    const list = sc.classes.filter((c) => c.day === d && subjectOf(c.subjectId)).sort((a, b) => a.start.localeCompare(b.start));
    return `<div class="tt-col ${d === todayDay ? 'today' : ''}"><b>${dayName(d)}</b>${list.map((c) => `<span class="tt-class" style="border-color:${esc(subjectOf(c.subjectId).color)}"><small>${c.start}</small>${esc(subjectName(c.subjectId))}</span>`).join('') || '<span class="muted">—</span>'}</div>`;
  }).join('')}</div>` : '';

  // Subjects
  $('#subject-list').innerHTML = sc.subjects.map((s) => {
    const cls = sc.classes.filter((c) => c.subjectId === s.id).sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.start.localeCompare(b.start));
    return `<details class="subject" data-subject-node="${s.id}" ${openSubjects.has(s.id) ? 'open' : ''}>
      <summary>${subjectDot(s.id)}<span class="grow"><b>${esc(s.name)}</b><span class="sub muted">${cls.length ? cls.map((c) => `${dayName(c.day)} ${c.start}`).join(', ') : 'No class times yet'}</span></span></summary>
      <div class="subject-body">
        ${cls.length ? `<ul class="list">${cls.map((c) => `<li><span class="grow">${dayName(c.day, 'long')} · ${c.start}${c.end ? '–' + c.end : ''}</span><button class="icon-btn" data-del-class="${c.id}" aria-label="Remove class time">×</button></li>`).join('')}</ul>` : ''}
        <form class="add-class" data-add-class="${s.id}">
          <select name="day" aria-label="Day">${WEEKDAYS.map((d) => `<option value="${d}">${dayName(d, 'long')}</option>`).join('')}</select>
          <input name="start" type="time" required aria-label="Starts" title="Starts">
          <input name="end" type="time" aria-label="Ends (optional)" title="Ends (optional)">
          <button class="btn small">+ Class time</button>
        </form>
        <form class="form edit-subject" data-edit-subject="${s.id}">
          <div class="grid3">
            <label>Name<input name="name" value="${esc(s.name)}" maxlength="40" required></label>
            <label>Teacher<input name="teacher" value="${esc(s.teacher || '')}" maxlength="40"></label>
            <label>Room<input name="room" value="${esc(s.room || '')}" maxlength="20"></label>
          </div>
          <div class="row gap wrap"><label class="color-pick">Color<input name="color" type="color" value="${esc(s.color)}"></label>
            <button class="btn small primary">Save</button><button type="button" class="btn small ghost danger" data-del-subject="${s.id}">Delete subject</button></div>
        </form>
      </div></details>`;
  }).join('');

  // Badge: homework overdue or due today, plus tests today
  const due = open.filter((h) => h.due && h.due <= t).length + sc.exams.filter((x) => x.date === t).length;
  $('#school-badge').textContent = due || '';
  $('#school-badge').hidden = !due;

  renderTodaySchool();
}

// ---------- the School card on Today ----------
function renderTodaySchool() {
  const sc = school();
  const t = todayKey(), tm = keyIn(1);
  const card = $('#today-school');
  const empty = !sc.subjects.length && !sc.homework.length && !sc.exams.length;
  card.hidden = empty;
  if (empty) return;
  const classes = classesOn(t);
  const now = nowHHMM();
  const next = classes.find((c) => (c.end || c.start) > now);
  const rows = [];
  if (classes.length) {
    rows.push(`<li><span class="dot">🏫</span><span class="grow"><span class="title">${classes.map((c) => esc(subjectName(c.subjectId))).join(', ')}</span>
      <span class="sub">${next ? `${next.start <= now ? 'Now' : 'Next'}: ${esc(subjectName(next.subjectId))} at ${next.start}${subjectOf(next.subjectId).room ? ' · ' + esc(subjectOf(next.subjectId).room) : ''}` : 'Classes are over for today'}</span></span></li>`);
  }
  sc.exams.filter((x) => x.date >= t && daysUntil(x.date) <= 7).sort((a, b) => a.date.localeCompare(b.date)).forEach((x) => rows.push(examItem(x)));
  sc.homework.filter((h) => !h.done && h.due && h.due <= tm).sort(hwSort).forEach((h) => rows.push(hwItem(h)));
  $('#today-school-list').innerHTML = rows.join('') || '<li class="empty">No classes, homework or tests today.</li>';
}

// ---------- calendar ----------
function schoolDay(key) {
  const sc = school();
  return {
    classes: classesOn(key),
    homework: sc.homework.filter((h) => h.due === key),
    exams: sc.exams.filter((x) => x.date === key),
  };
}
function schoolMarks(key) {
  const d = schoolDay(key);
  return [
    ...d.exams.map(() => '<i class="m-exam"></i>'),
    ...d.homework.map((h) => `<i class="m-hw ${h.done ? 'done' : ''}"></i>`),
  ];
}
function schoolRows(key) {
  const d = schoolDay(key);
  const rows = [];
  if (d.classes.length) rows.push(`<li><span class="dot">🏫</span><span class="grow"><span class="title">${d.classes.map((c) => esc(subjectName(c.subjectId))).join(', ')}</span>
    <span class="sub">${d.classes.map((c) => c.start).join(' · ')}</span></span></li>`);
  d.exams.forEach((x) => rows.push(examItem(x, false)));
  d.homework.forEach((h) => rows.push(hwItem(h, false)));
  return rows;
}

// ---------- evening reminder ----------
function checkSchoolReminder() {
  const t = todayKey();
  if (nowHHMM() < '18:00' || state.notified.school === t) return;
  const tm = keyIn(1);
  const sc = school();
  const exams = sc.exams.filter((x) => x.date === tm);
  const hw = sc.homework.filter((h) => !h.done && h.due === tm);
  state.notified.school = t; save();
  if (!exams.length && !hw.length) return;
  notify('School tomorrow', [
    exams.map((x) => examLabel(x)).join(', '),
    hw.length ? `${hw.length} homework due: ${hw.map((h) => h.text).slice(0, 3).join(', ')}` : '',
  ].filter(Boolean).join(' · '));
}

// ---------- events ----------
function bindSchool() {
  const hwf = $('#hw-form');
  hwf.due.value = keyIn(1);
  document.querySelectorAll('[data-hw-date]').forEach((b) => b.addEventListener('click', () => {
    hwf.due.value = b.dataset.hwDate === 'none' ? '' : keyIn(Number(b.dataset.hwDate));
  }));
  hwf.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = hwf.text.value.trim();
    if (!text) return;
    school().homework.push({ id: uid(), subjectId: hwf.subject.value, text, due: hwf.due.value, done: false });
    save(); hwf.text.value = ''; render(); hwf.text.focus();
    toast('Homework added');
  });

  const ef = $('#exam-form');
  ef.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!ef.date.value) { toast('Pick the date of the test'); return; }
    school().exams.push({ id: uid(), subjectId: ef.subject.value, kind: ef.kind.value, title: ef.title.value.trim(), date: ef.date.value, time: ef.time.value });
    save(); ef.title.value = ''; ef.time.value = ''; render();
    toast(`${EXAM_KINDS[ef.kind.value]} added, ${countdown(ef.date.value)}`);
  });

  const gf = $('#grade-form');
  gf.date.value = todayKey();
  gf.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!gf.subject.value) { toast('Add a subject first, at the bottom of this page'); return; }
    const value = parseFloat(String(gf.value.value).replace(',', '.'));
    if (!Number.isFinite(value)) { toast('Enter a grade'); return; }
    school().grades.push({ id: uid(), subjectId: gf.subject.value, value, note: gf.note.value.trim(), date: gf.date.value || todayKey() });
    save(); gf.value.value = ''; gf.note.value = ''; gf.date.value = todayKey(); render();
    toast(`Grade ${fmtGrade(value)} saved`);
  });

  $('#scale-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const min = Number(e.target.min.value), max = Number(e.target.max.value);
    if (min === max) { toast('The two ends of the scale must differ'); return; }
    school().scale = { min, max };
    save(); render(); toast('Grading scale saved');
  });

  $('#subject-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    const sc = school();
    if (sc.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) { toast(`${name} is already there`); return; }
    const color = SCHOOL_COLORS[sc.subjects.length % SCHOOL_COLORS.length];
    const s = { id: uid(), name, teacher: '', room: '', color };
    sc.subjects.push(s);
    openSubjects.add(s.id);
    save(); e.target.name.value = ''; render(); e.target.name.focus();
    toast(`${name} added. Open it to add when you have it.`);
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scroll]');
    if (!b) return;
    const el = document.getElementById(b.dataset.scroll);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector('input')?.focus({ preventScroll: true });
  });
  $('#school-gc-refresh').addEventListener('click', () => window.Google && Google.refresh(false));

  const view = $('#view-school');
  view.addEventListener('toggle', (e) => {
    const id = e.target.dataset?.subjectNode;
    if (id) { if (e.target.open) openSubjects.add(id); else openSubjects.delete(id); }
  }, true);

  view.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.dataset.addClass) {
      e.preventDefault();
      if (f.end.value && f.end.value <= f.start.value) { toast('The class ends before it starts'); return; }
      school().classes.push({ id: uid(), subjectId: f.dataset.addClass, day: Number(f.day.value), start: f.start.value, end: f.end.value });
      const day = f.day.value;
      save(); render();
      const nf = $(`[data-add-class="${f.dataset.addClass}"]`);
      if (nf) { nf.day.value = day; nf.start.focus(); }
      toast('Class time added');
    } else if (f.dataset.editSubject) {
      e.preventDefault();
      const s = subjectOf(f.dataset.editSubject);
      Object.assign(s, { name: f.name.value.trim() || s.name, teacher: f.teacher.value.trim(), room: f.room.value.trim(), color: f.color.value });
      save(); render(); toast('Saved');
    } else if (f.dataset.examGrade) {
      e.preventDefault();
      const x = school().exams.find((y) => y.id === f.dataset.examGrade);
      const value = parseFloat(String(f.value.value).replace(',', '.'));
      if (!Number.isFinite(value)) return;
      if (!x.subjectId) { toast('This test has no subject, so the grade can\'t be counted'); return; }
      const g = { id: uid(), subjectId: x.subjectId, value, note: [EXAM_KINDS[x.kind], x.title].filter(Boolean).join(': '), date: x.date };
      school().grades.push(g);
      x.gradeId = g.id;
      save(); render(); toast(`Grade ${fmtGrade(value)} saved`);
    }
  });

  document.addEventListener('change', (e) => {
    const id = e.target.dataset.hw;
    if (id) {
      const h = school().homework.find((y) => y.id === id);
      h.done = e.target.checked; h.doneAt = h.done ? Date.now() : undefined;
      save(); render();
      if (h.done) toast('Homework done ✓');
    }
      });

  document.addEventListener('click', (e) => {
    const d = e.target.dataset;
    const sc = school();
    if (d.delHw) { sc.homework = sc.homework.filter((y) => y.id !== d.delHw); save(); render(); }
    if (d.delExam) {
      const x = sc.exams.find((y) => y.id === d.delExam);
      if (!confirm(`Remove ${examLabel(x)} on ${shortDay(x.date)}?`)) return;
      sc.exams = sc.exams.filter((y) => y.id !== d.delExam); save(); render();
    }
    if (d.delGrade) {
      sc.grades = sc.grades.filter((y) => y.id !== d.delGrade);
      sc.exams.forEach((x) => { if (x.gradeId === d.delGrade) delete x.gradeId; });
      save(); render();
    }
    if (d.delClass) { sc.classes = sc.classes.filter((y) => y.id !== d.delClass); save(); render(); }
    if (d.delSubject) {
      const s = subjectOf(d.delSubject);
      const n = [
        [sc.homework.filter((h) => h.subjectId === s.id).length, 'homework'],
        [sc.exams.filter((x) => x.subjectId === s.id).length, 'tests'],
        [sc.grades.filter((g) => g.subjectId === s.id).length, 'grades'],
      ].filter(([c]) => c).map(([c, w]) => `${c} ${w}`);
      if (!confirm(`Delete ${s.name}${n.length ? ` with its ${n.join(', ')}` : ''}?`)) return;
      const keep = (x) => x.subjectId !== s.id;
      Object.assign(sc, { subjects: sc.subjects.filter((x) => x.id !== s.id), classes: sc.classes.filter(keep), homework: sc.homework.filter(keep), exams: sc.exams.filter(keep), grades: sc.grades.filter(keep) });
      save(); render(); toast(`${s.name} deleted`);
    }
  });

  $('#hw-clear').addEventListener('click', () => {
    if (!confirm('Remove all finished homework?')) return;
    school().homework = school().homework.filter((h) => !h.done);
    save(); render();
  });
}
