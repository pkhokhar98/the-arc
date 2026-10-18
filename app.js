'use strict';
/* The Arc — frontend. Vanilla JS, no build step.
   Local state first (localStorage), queued writes flushed to the Apps Script web app.
   Order of this file: constants · protocol · dates · state · sync · today screen · (log, chart, calendar, reading appended below) · boot */

// Paste the Apps Script web app URL here (ends in /exec), or set it in Log → Sync on the phone.
const API_URL = '';

const C = {
  START: '2026-10-19', END: '2027-04-16', TOTAL: 180,
  GOAL: 192, START_W: 225,
  PROTEIN: 210, KCAL: 2550, KCAL_BREAK: 3050,
  SLEEP: 7.5, STEPS: 8000,
  DELOAD: [6, 12, 18, 24], DIET: [10, 11, 20, 21],
  TZ: 'America/Vancouver'
};
// Training time slots are not in the spec; change here if needed.
const TRAIN_TIME = { lift: '14:30', easy: '14:30', long: '08:00' };

// ------------------------------------------------------------------ protocol

const SESSIONS = {
  1: { name: 'Lower A', sub: 'squat emphasis', main: 'Back squat', type: 'lift', lower: true, time: TRAIN_TIME.lift,
       lifts: ['Back squat 4×6-8', 'Romanian deadlift 3×8', 'Leg press 3×10', 'Lying leg curl 3×12'] },
  2: { name: 'Upper A', sub: 'horizontal', main: 'Bench press', type: 'lift', time: TRAIN_TIME.lift,
       lifts: ['Bench press 4×6-8', 'Barbell row 4×8', 'Incline DB press 3×10', 'Lat pulldown 3×10', 'Lateral raise 3×15', 'Barbell curl 3×12', 'Tricep extension 3×12'] },
  3: { name: 'Easy run', sub: '5 km conversational', type: 'run', time: TRAIN_TIME.easy },
  4: { name: 'Lower B', sub: 'hinge emphasis', main: 'Deadlift', type: 'lift', lower: true, time: TRAIN_TIME.lift,
       lifts: ['Deadlift 3×5', 'Goblet squat 3×10', 'Hip thrust 4×10', 'Leg extension 3×12'] },
  5: { name: 'Upper B', sub: 'vertical', main: 'Overhead press', type: 'lift', time: TRAIN_TIME.lift,
       lifts: ['Overhead press 4×8', 'Pull-ups 4×max', 'Dips 3×10', 'Cable row 3×12', 'Face pulls 3×15', 'Hammer curl 3×12', 'Overhead tricep 3×12'] },
  6: { name: 'Long run', sub: '8–10 km · build max 10 % per week', type: 'run', time: TRAIN_TIME.long },
  0: { name: 'Rest + weekly review', sub: 'read the week, write the plan', type: 'rest', time: '' }
};
const MAIN_LIFTS = ['Back squat', 'Bench press', 'Deadlift', 'Overhead press'];
const ABS = ['Cable crunch 3×10-12', 'Hanging leg raise 3×12-15'];
const ACHILLES = [
  { from: 1, to: 4, name: 'Phase 1 · load tolerance', items: ['Seated calf raise 4×15 slow', 'Assisted single-leg 3×8 each'], note: '3 s up, 1 s hold, 3 s down. Wall for balance only.' },
  { from: 5, to: 10, name: 'Phase 2 · unassisted', items: ['Seated calf raise 4×15 slow', 'Freestanding single-leg 3×10 each'] },
  { from: 11, to: 18, name: 'Phase 3 · loaded', items: ['Seated calf raise 4×12 weighted', 'Weighted single-leg 3×10 each'] },
  { from: 19, to: 26, name: 'Phase 4 · eccentric', items: ['Eccentric single-leg 3×12 each', 'Weighted seated raise 3×12'], note: 'Up on two legs, down on one, 4 s descent.' }
];
const BOOKS = [
  { t: 'Meditations', a: 'Marcus Aurelius', p: 256 },
  { t: 'Psycho-Cybernetics', a: 'Maxwell Maltz', p: 336 },
  { t: 'YUSA Guide to Balance', a: 'Yusalife', p: 280 },
  { t: 'Book four', a: 'TBD', p: 300 },
  { t: 'Book five', a: 'TBD', p: 300 }
];

const PROTOCOL = [
  { group: 'Sleep', items: [
    { key: 'sleep', req: true, title: '7.5 hours minimum', sub: 'log last night before anything else', detail: 'sleep' }] },
  { group: 'On waking', note: 'before the phone', items: [
    { key: 'morning_window', req: true, title: 'Morning window, 20 min', sub: 'breath · simran · future self', detail: 'window' },
    { key: 'gargle', title: 'Gargle 60 seconds' }] },
  { group: 'Morning', note: '06:30', items: [
    { key: 'breakfast', title: 'Breakfast, 55 g protein', sub: 'oats · whey · 3 eggs · flax · berries' },
    { key: 'trataka', title: 'Trataka, 5 min' },
    { key: 'am_stack', title: 'Morning stack', sub: 'Omega-3 · D3+K2 · Creatine', detail: 'am_stack' },
    { key: 'deep_work', title: 'Deep work block', sub: 'before meetings open at 07:00 Pacific' }] },
  { group: 'Day', note: '07:00–14:00 PT', items: [
    { key: 'protein', req: true, title: '210 g protein', sub: 'dyn' },
    { key: 'steps', req: true, title: '8,000 steps', detail: 'steps' },
    { key: 'walk', title: 'Walk outside, 15 min' },
    { key: 'close_client', title: 'Close the client day', sub: '17:00 Eastern is 14:00 local' }] },
  { group: 'Train', items: [
    { key: 'train', req: true, title: 'dyn', sub: 'dyn', detail: 'train' }] },
  { group: 'Late day', note: '16:00–18:00', items: [
    { key: 'decompress', req: true, title: 'Decompression, 20 min', sub: 'nothing incoming, no screens' }] },
  { group: 'Evening', items: [
    { key: 'read', req: true, title: 'Read 20 min' },
    { key: 'night_close', req: true, title: 'Night close', sub: 'laptop shut · one line for tomorrow · phone face down' },
    { key: 'pm_stack', title: 'Night stack', sub: 'Magnesium glycinate · Ashwagandha', detail: 'pm_stack' },
    { key: 'rinse', req: true, title: 'Rinse + Pulmicort', sub: 'last rinse of the night · daily through 18 April' }] },
  { group: 'Pre-sleep', items: [
    { key: 'sats', req: true, title: 'SATS', sub: 'relaxation 8 min · body freedom 30 s · one scene 10 min', detail: 'sats' }] }
];

// ------------------------------------------------------------------ dates

const pad = (n, w = 2) => String(n).padStart(w, '0');
function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(s, n) { const d = parseYMD(s); d.setDate(d.getDate() + n); return ymd(d); }
function daysBetween(a, b) { return Math.round((parseYMD(b) - parseYMD(a)) / 86400000); }
function todayYMD() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: C.TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (e) { return ymd(new Date()); }
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtShort(s) { const d = parseYMD(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; }
function fmtLong(s) { const d = parseYMD(s); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; }

function cfg() {
  const c = S.config || {};
  const n = (k, f) => (c[k] !== undefined && c[k] !== '' && !isNaN(Number(c[k]))) ? Number(c[k]) : f;
  const list = (k, f) => (typeof c[k] === 'string' && c[k].trim()) ? c[k].split(',').map(Number).filter(x => !isNaN(x)) : f;
  return {
    start: (typeof c.start_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(c.start_date)) ? c.start_date.slice(0, 10) : C.START,
    total: n('total_days', C.TOTAL), goal: n('goal_weight', C.GOAL), startW: n('start_weight', C.START_W),
    protein: n('protein_target', C.PROTEIN), kcal: n('calorie_target', C.KCAL), kcalBreak: n('diet_break_calories', C.KCAL_BREAK),
    sleep: n('sleep_target', C.SLEEP), steps: n('step_target', C.STEPS),
    deload: list('deload_weeks', C.DELOAD), diet: list('diet_break_weeks', C.DIET)
  };
}
function dayNumber(date) { return daysBetween(cfg().start, date) + 1; }
function weekOf(date) { return Math.ceil(dayNumber(date) / 7); }
function endDate() { const k = cfg(); return addDays(k.start, k.total - 1); }
function sessionFor(date) { return SESSIONS[parseYMD(date).getDay()]; }
function isDeload(date) { return cfg().deload.includes(weekOf(date)); }
function isDiet(date) { return cfg().diet.includes(weekOf(date)); }
function phaseFor(date) { const w = weekOf(date); return ACHILLES.find(p => w >= p.from && w <= p.to) || null; }
function halveSets(s) { return s.replace(/(\d+)×/, (m, n) => `${Math.ceil(Number(n) / 2)}×`); }

/** Resolved checklist for a date: titles, subtitles, required flags, group names. */
function itemsFor(date) {
  const ses = sessionFor(date), k = cfg(), diet = isDiet(date), deload = isDeload(date);
  const out = [];
  PROTOCOL.forEach(g => g.items.forEach(it => {
    const r = Object.assign({}, it, { group: g.group, req: !!it.req });
    if (it.key === 'protein') {
      r.title = `${k.protein} g protein`;
      r.sub = diet ? `${k.kcalBreak.toLocaleString()} kcal maintenance · diet break · protein unchanged` : `${k.kcal.toLocaleString()} kcal · ${k.protein} P / 80 F / 255 C`;
    }
    if (it.key === 'steps') r.title = `${k.steps.toLocaleString()} steps`;
    if (it.key === 'sleep') r.title = `${k.sleep} hours minimum`;
    if (it.key === 'train') {
      r.title = ses.name;
      r.sub = [ses.time, ses.sub, deload && ses.type === 'lift' ? 'deload · half the sets' : ''].filter(Boolean).join(' · ');
    }
    out.push(r);
  }));
  return out;
}

// ------------------------------------------------------------------ state

const LS = { state: 'arc.state.v1', queue: 'arc.queue.v1', api: 'arc.api', pull: 'arc.lastPull' };
let S = { days: {}, config: {} };
let Q = {};            // date -> ts of last local change not yet confirmed by the server
const view = { date: todayYMD(), tab: 'today', open: new Set() };

function lsGet(k, f) { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (e) { return f; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode / full */ } }

function blankDay(date) {
  return { date, sleep_hours: null, weight_lb: null, steps: null, nicotine: false, alcohol_drinks: 0, notes: '', checks: {}, lifts: {}, pages: {}, updated_at: '' };
}
function getDay(date) { return S.days[date] || blankDay(date); }
function normalizeDay(d) {
  const b = blankDay(d.date);
  const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
  return Object.assign(b, d, {
    sleep_hours: num(d.sleep_hours), weight_lb: num(d.weight_lb), steps: num(d.steps),
    nicotine: !!d.nicotine, alcohol_drinks: num(d.alcohol_drinks) || 0, notes: d.notes || '',
    checks: d.checks || {}, lifts: d.lifts || {}, pages: d.pages || {}, updated_at: d.updated_at || ''
  });
}
function saveLocal() { lsSet(LS.state, S); lsSet(LS.queue, Q); }
function loadLocal() {
  const s = lsGet(LS.state, null);
  if (s && s.days) { S = s; Object.keys(S.days).forEach(k => { S.days[k] = normalizeDay(S.days[k]); }); }
  Q = lsGet(LS.queue, {}) || {};
}

/** Apply a change to a day: patch(day) mutates. Saves, queues, re-renders. */
function mutate(date, patch) {
  const d = getDay(date);
  patch(d);
  // derived ticks: logging sleep / steps sets their anchors
  const k = cfg();
  if (d.sleep_hours !== null) d.checks.sleep = d.sleep_hours >= k.sleep;
  if (d.steps !== null) d.checks.steps = d.steps >= k.steps;
  d.updated_at = new Date().toISOString();
  S.days[date] = d;
  Q[date] = d.updated_at;
  saveLocal();
  render();
  scheduleFlush();
}

function toPayload(date) {
  const d = getDay(date), ses = sessionFor(date);
  return {
    date, sleep_hours: d.sleep_hours ?? '', weight_lb: d.weight_lb ?? '', steps: d.steps ?? '',
    session: ses.name, trained: !!d.checks.train && ses.type !== 'rest',
    nicotine: !!d.nicotine, alcohol_drinks: d.alcohol_drinks || 0, notes: d.notes || '', updated_at: d.updated_at,
    checklist: itemsFor(date).map(i => ({ key: i.key, label: i.title, group: i.group, required: i.req, done: !!d.checks[i.key] })),
    lifts: Object.keys(d.lifts).map(ex => ({ exercise: ex, weight: d.lifts[ex].weight, reps: d.lifts[ex].reps })).filter(l => l.weight > 0 && l.reps > 0),
    reading: Object.keys(d.pages).map(b => ({ book: b, pages: d.pages[b] || 0 }))
  };
}

// ------------------------------------------------------------------ derived metrics

function isClean(date) {
  const d = S.days[date]; if (!d) return false;
  return itemsFor(date).filter(i => i.req).every(i => d.checks[i.key]);
}
function isPartial(date) {
  const d = S.days[date]; if (!d) return false;
  return itemsFor(date).some(i => i.req && d.checks[i.key]) || d.weight_lb !== null || d.sleep_hours !== null;
}
function streak(asOf) {
  let d = isClean(asOf) ? asOf : addDays(asOf, -1), n = 0;
  const start = cfg().start;
  while (d >= start && isClean(d)) { n++; d = addDays(d, -1); }
  return n;
}
function cleanDays() { return Object.keys(S.days).filter(isClean).length; }
function sleepAvg7(asOf) {
  const v = [];
  for (let i = 0; i < 7; i++) { const d = S.days[addDays(asOf, -i)]; if (d && d.sleep_hours !== null) v.push(d.sleep_hours); }
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function weighIns() {
  return Object.keys(S.days).filter(k => S.days[k].weight_lb !== null).sort().map(k => ({ date: k, w: S.days[k].weight_lb }));
}
/** lb per week lost (positive = losing). null until two weigh-ins ≥ 3 days apart. */
function rateInfo() {
  const w = weighIns(); if (w.length < 2) return null;
  const first = w[0], last = w[w.length - 1];
  const days = daysBetween(first.date, last.date); if (days < 3) return null;
  const rate = (first.w - last.w) / (days / 7);
  const pct = rate / last.w * 100;
  return { rate, pct, first, last, days, cls: pct > 1 ? 'bad' : pct >= 0.5 ? 'good' : 'warn' };
}
function sleepCls(v) { return v === null ? '' : v >= 7.5 ? 'good' : v >= 6.5 ? 'warn' : 'bad'; }

// ------------------------------------------------------------------ sync

function apiUrl() { return (lsGet(LS.api, '') || API_URL || '').trim(); }
let flushTimer = null, flushing = false, lastPullAt = 0;
function scheduleFlush(ms = 1200) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms); }

async function apiFetch(method, bodyOrParams) {
  const url = apiUrl(); if (!url) throw new Error('no url');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = method === 'GET'
      ? await fetch(url + '?' + new URLSearchParams(bodyOrParams), { signal: ctrl.signal, redirect: 'follow' })
      : await fetch(url, { method: 'POST', body: JSON.stringify(bodyOrParams), signal: ctrl.signal, redirect: 'follow' });
    const txt = await res.text();
    let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('non-JSON reply (check deploy access = Anyone)'); }
    if (!j.ok) throw new Error(j.error || 'server error');
    return j;
  } finally { clearTimeout(t); }
}

async function flush() {
  const dates = Object.keys(Q);
  if (!dates.length || flushing || !apiUrl() || !navigator.onLine) { renderSync(); return; }
  flushing = true; renderSync('sending');
  const snapshot = Object.assign({}, Q);
  try {
    await apiFetch('POST', { action: 'batch', ops: dates.map(d => ({ day: toPayload(d) })) });
    dates.forEach(d => { if (Q[d] === snapshot[d]) delete Q[d]; });
    saveLocal(); syncErr = '';
  } catch (e) { syncErr = e.message; }
  flushing = false; renderSync();
  if (Object.keys(Q).length && !syncErr) scheduleFlush(500);
}
let syncErr = '';

async function pull(force) {
  if (!apiUrl() || !navigator.onLine) { renderSync(); return; }
  if (!force && Date.now() - lastPullAt < 60000) return;
  lastPullAt = Date.now();
  try {
    const j = await apiFetch('GET', { action: 'load' });
    S.config = j.config || {};
    Object.keys(j.days || {}).forEach(date => {
      if (Q[date]) return;                      // local change pending; local wins until flushed
      const srv = normalizeDay(j.days[date]), loc = S.days[date];
      if (!loc || (srv.updated_at && srv.updated_at > (loc.updated_at || ''))) S.days[date] = srv;
    });
    lsSet(LS.pull, new Date().toISOString()); syncErr = '';
    saveLocal(); render();
  } catch (e) { syncErr = e.message; renderSync(); }
}

function renderSync(stateOverride) {
  const el = $('#sync'), txt = $('#sync-text'); if (!el) return;
  const q = Object.keys(Q).length, url = apiUrl();
  el.className = 'sync';
  if (!url) { el.classList.add('is-unset'); txt.textContent = 'Sheet not connected'; }
  else if (stateOverride === 'sending') { el.classList.add('is-queued'); txt.textContent = 'Sending…'; }
  else if (syncErr) { el.classList.add('is-err'); txt.textContent = q ? `${q} queued · ${syncErr}` : syncErr; }
  else if (!navigator.onLine) { el.classList.add('is-queued'); txt.textContent = q ? `Offline · ${q} queued` : 'Offline'; }
  else if (q) { el.classList.add('is-queued'); txt.textContent = `${q} queued`; }
  else {
    const p = lsGet(LS.pull, ''); el.classList.add('is-ok');
    txt.textContent = p ? `Synced · ${new Date(p).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Connected';
  }
  const qc = $('#q-count'); if (qc) qc.textContent = q;
  const lp = $('#last-pull'); if (lp) { const p = lsGet(LS.pull, ''); lp.textContent = p ? new Date(p).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never'; }
  const ss = $('#settings-state'); if (ss) ss.textContent = url ? (syncErr ? 'error' : 'connected') : 'not set';
}

// ------------------------------------------------------------------ dom helpers

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, v === true ? '' : v);
  });
  kids.flat().forEach(k => { if (k === null || k === undefined || k === false) return; el.append(k.nodeType ? k : document.createTextNode(String(k))); });
  return el;
}
let toastT = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 1800); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHEV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

// ------------------------------------------------------------------ today screen

function renderToday() {
  const date = view.date, k = cfg(), dn = dayNumber(date), wk = weekOf(date), ses = sessionFor(date), today = todayYMD();
  const pre = dn < 1, post = dn > k.total;
  $('#daynum').textContent = pad(Math.min(Math.max(dn, 0), 999), 3);
  $('#daynum').classList.toggle('is-pre', pre || post);
  $('#dayof').textContent = pre ? `Starts ${fmtShort(k.start)}` : post ? `Arc complete · ${k.total} days` : `OF ${k.total} · WEEK ${wk}`;
  $('#daydate').textContent = (date === today ? 'Today · ' : '') + fmtShort(date);
  $('#day-today').hidden = date === today;
  $('#day-next').disabled = date >= today;
  $('#day-prev').disabled = date <= addDays(k.start, -7);
  $('#session-label').textContent = ses.type === 'rest' ? 'Sunday' : 'Session';
  $('#session-name').textContent = ses.name;
  $('#session-time').textContent = [ses.time, ses.main || ses.sub].filter(Boolean).join(' · ');
  $('#foot-range').textContent = `${fmtLong(k.start)} – ${fmtLong(endDate())}`;

  // banners
  const ph = phaseFor(date), lower = !!ses.lower;
  $('#banner-phase').classList.toggle('is-on', !!ph && lower && !pre);
  if (ph) $('#banner-phase-text').textContent = `${ph.name} · weeks ${ph.from}–${ph.to}` + (ph.note ? ` · ${ph.note}` : '');
  $('#banner-deload').classList.toggle('is-on', isDeload(date) && !pre);
  $('#banner-deload-week').textContent = wk;
  $('#banner-diet').classList.toggle('is-on', isDiet(date) && !pre);
  $('#banner-diet-week').textContent = wk;

  // metrics
  const w = weighIns(), last = w.length ? w[w.length - 1].w : null;
  $('#m-weight').innerHTML = last !== null ? esc(last.toFixed(1)) : '—';
  const sa = sleepAvg7(date); const ms = $('#m-sleep'); ms.textContent = sa !== null ? sa.toFixed(1) : '—'; ms.className = 'metric__v num ' + sleepCls(sa);
  const ri = rateInfo(); const mr = $('#m-rate');
  mr.innerHTML = ri ? `${esc(ri.rate.toFixed(1))}<small>${esc(ri.pct.toFixed(1))}%</small>` : '—'; mr.className = 'metric__v num ' + (ri ? ri.cls : '');
  $('#m-streak').textContent = streak(today);
  $('#m-clean').textContent = cleanDays();

  renderChecklist();
}

function detailFor(it, date) {
  const d = getDay(date), ses = sessionFor(date), k = cfg();
  switch (it.detail) {
    case 'sleep': return h('div', {},
      h('div', { class: 'inline-input' },
        h('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '0', max: '16', placeholder: 'hours', value: d.sleep_hours ?? '', 'aria-label': 'Sleep hours', id: 'ck-sleep',
          onchange: e => mutate(date, x => { x.sleep_hours = e.target.value === '' ? null : Number(e.target.value); }) }),
        h('span', { class: 'hint' }, `≥ ${k.sleep} h ticks this automatically`)));
    case 'steps': return h('div', {},
      h('div', { class: 'inline-input' },
        h('input', { type: 'number', inputmode: 'numeric', step: '100', min: '0', placeholder: 'steps', value: d.steps ?? '', 'aria-label': 'Steps', id: 'ck-steps',
          onchange: e => mutate(date, x => { x.steps = e.target.value === '' ? null : Number(e.target.value); }) }),
        h('span', { class: 'hint' }, `≥ ${k.steps.toLocaleString()} ticks this automatically`)));
    case 'window': return h('ol', {},
      h('li', {}, 'Register body freedom — 30 s'),
      h('li', {}, 'Double inhale nose, long exhale mouth — ×2'),
      h('li', {}, 'Box breathing 4-4-4-4 — 4 rounds'),
      h('li', {}, 'Waheguru Simran, inhale Wahe exhale Guru — 11 min'),
      h('li', {}, 'Future self, one intention, present tense — 5 min'));
    case 'am_stack': return h('ul', { class: 'li-plain' },
      h('li', {}, 'Omega-3 — 2 g EPA/DHA'), h('li', {}, 'Vitamin D3 + K2 — 2000 IU / 100 mcg'), h('li', {}, 'Creatine — 5 g'));
    case 'pm_stack': return h('ul', { class: 'li-plain' },
      h('li', {}, 'Magnesium glycinate — 400 mg'), h('li', {}, 'Ashwagandha KSM-66 — 600 mg'));
    case 'sats': return h('ol', {},
      h('li', {}, 'Progressive relaxation — 8 min'), h('li', {}, 'Body freedom — 30 s'), h('li', {}, 'One scene, first person — 10 min'));
    case 'train': {
      const deload = isDeload(date);
      if (ses.type === 'lift') {
        const ph = phaseFor(date);
        const wrap = h('div', {});
        wrap.append(h('ul', { class: 'li-plain' }, ses.lifts.map(l => h('li', {}, deload ? halveSets(l) : l))));
        if (ses.lower) {
          wrap.append(h('div', { class: 'det-h' }, 'Abs'), h('ul', { class: 'li-plain' }, ABS.map(l => h('li', {}, deload ? halveSets(l) : l))));
          if (ph) wrap.append(h('div', { class: 'det-h' }, `Achilles · ${ph.name}`), h('ul', { class: 'li-plain' }, ph.items.map(l => h('li', {}, deload ? halveSets(l) : l))), ph.note ? h('div', { class: 'det-sub' }, ph.note) : null);
        }
        wrap.append(h('div', { class: 'det-sub' }, deload ? 'Deload: same loads, half the sets. Still counts as a training day.' : `Main lift: ${ses.main}. Log the top set in Log.`));
        return wrap;
      }
      if (ses.type === 'run') return h('div', {}, ses.sub + (ses.name === 'Long run' ? '. Keep it conversational; the 10 % cap is on distance.' : '. Nose breathing if you can hold it.'));
      return h('div', {}, 'Rest. Weekly review: read the Log tab for the week, write next week\'s one line, Sunday prep in Food.');
    }
    default: return null;
  }
}

function renderChecklist() {
  const date = view.date, d = getDay(date), root = $('#checklist');
  root.replaceChildren();
  const items = itemsFor(date);
  PROTOCOL.forEach(g => {
    const its = items.filter(i => i.group === g.group);
    const reqN = its.filter(i => i.req).length, doneN = its.filter(i => i.req && d.checks[i.key]).length;
    const sec = h('section', { class: 'group' },
      h('div', { class: 'group__h' }, h('span', { class: 'label' }, g.group), h('span', { class: 'label label--dim' }, g.note || (reqN ? `${doneN}/${reqN}` : ''))));
    its.forEach(it => {
      const done = !!d.checks[it.key], open = view.open.has(it.key), detail = detailFor(it, date);
      const row = h('div', { class: 'row' + (done ? ' is-done' : '') + (open ? ' is-open' : ''), 'data-key': it.key });
      const main = h('div', { class: 'row__main' },
        h('button', { type: 'button', class: 'row__tap', 'aria-pressed': done ? 'true' : 'false',
            onclick: () => mutate(date, x => { x.checks[it.key] = !x.checks[it.key]; }) },
          h('span', { class: 'ring' + (it.req ? ' ring--req' : ''), 'aria-hidden': 'true' }),
          h('span', { class: 'row__text' }, h('div', { class: 'row__title' }, it.title), it.sub ? h('div', { class: 'row__sub' }, it.sub) : null)),
        detail ? h('button', { type: 'button', class: 'row__chev', 'aria-label': 'Details', 'aria-expanded': open ? 'true' : 'false', html: CHEV,
            onclick: () => { view.open.has(it.key) ? view.open.delete(it.key) : view.open.add(it.key); renderChecklist(); } }) : null);
      row.append(main);
      if (detail) row.append(h('div', { class: 'row__detail' }, detail));
      sec.append(row);
    });
    root.append(sec);
  });
}

// ------------------------------------------------------------------ render registry + boot

const RENDERERS = [renderToday];
function render() { RENDERERS.forEach(fn => { try { fn(); } catch (e) { console.error(fn.name, e); } }); renderSync(); }

function showTab(name) {
  view.tab = name;
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
  window.scrollTo({ top: 0 });
}

function bootCore() {
  loadLocal();
  $$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.view)));
  $('#day-prev').addEventListener('click', () => { view.date = addDays(view.date, -1); view.open.clear(); render(); });
  $('#day-next').addEventListener('click', () => { if (view.date < todayYMD()) { view.date = addDays(view.date, 1); view.open.clear(); render(); } });
  $('#day-today').addEventListener('click', () => { view.date = todayYMD(); view.open.clear(); render(); });
  $('#sync-now').addEventListener('click', async () => { if (!apiUrl()) { showTab('log'); $('#settings').open = true; $('#in-api').focus(); return; } await flush(); await pull(true); toast(syncErr ? 'Sync failed' : 'Synced'); });
  window.addEventListener('online', () => { flush(); pull(true); });
  window.addEventListener('offline', renderSync);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { const t = todayYMD(); if (view.date !== t && view.date > t) view.date = t; render(); flush(); pull(false); } });
  // midnight rollover while the app stays open
  setInterval(() => { const t = todayYMD(); if (t !== view._lastToday) { view._lastToday = t; render(); } }, 60000);
  view._lastToday = todayYMD();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ================================================================== LOG

function renderLog() {
  const date = view.date, d = getDay(date), ses = sessionFor(date), today = todayYMD();
  $('#log-date').textContent = (date === today ? 'today · ' : '') + fmtShort(date);
  const setIf = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v ?? ''; };
  setIf('#in-weight', d.weight_lb); setIf('#in-sleep', d.sleep_hours); setIf('#in-steps', d.steps); setIf('#in-notes', d.notes);
  const lift = ses.main || null;
  $('#lift-label').textContent = lift ? `Main lift · ${lift}` : 'Main lift';
  $('#in-lift-w').disabled = !lift; $('#in-lift-r').disabled = !lift;
  const l = lift ? d.lifts[lift] : null;
  setIf('#in-lift-w', l ? l.weight : ''); setIf('#in-lift-r', l ? l.reps : '');
  if (!lift) $('#lift-hint').textContent = `No main lift on a ${ses.name.toLowerCase()} day.`;
  else if (l && l.weight > 0 && l.reps > 0) $('#lift-hint').textContent = `Est. 1RM ${epley(l.weight, l.reps).toFixed(0)} lb (Epley) · ${isDeload(date) ? 'deload week, same load, half the sets' : 'top set only'}`;
  else $('#lift-hint').textContent = 'Top set only. Est. 1RM via Epley: w × (1 + reps/30).';
  $('#in-nic').classList.toggle('is-on', !!d.nicotine); $('#in-nic').setAttribute('aria-checked', d.nicotine ? 'true' : 'false');
  $('#alc-v').textContent = d.alcohol_drinks || 0;
  renderChart(); renderLiftTable(); renderCalendar();
}
const epley = (w, r) => w * (1 + r / 30);

function readLogInputs() {
  const date = view.date, ses = sessionFor(date);
  const num = id => { const v = $(id).value; return v === '' ? null : Number(v); };
  mutate(date, d => {
    d.weight_lb = num('#in-weight'); d.sleep_hours = num('#in-sleep'); d.steps = num('#in-steps'); d.notes = $('#in-notes').value.trim();
    if (ses.main) {
      const w = num('#in-lift-w'), r = num('#in-lift-r');
      if (w > 0 && r > 0) d.lifts[ses.main] = { weight: w, reps: r }; else delete d.lifts[ses.main];
    }
  });
}

function bindLog() {
  ['#in-weight', '#in-sleep', '#in-steps', '#in-lift-w', '#in-lift-r'].forEach(id => $(id).addEventListener('change', readLogInputs));
  $('#in-notes').addEventListener('blur', () => { if ($('#in-notes').value.trim() !== (getDay(view.date).notes || '')) readLogInputs(); });
  $('#log-save').addEventListener('click', () => { readLogInputs(); $('#log-status').textContent = 'Saved on device' + (apiUrl() ? ', sending' : ''); flush(); setTimeout(() => { $('#log-status').textContent = ''; }, 2500); });
  $('#in-nic').addEventListener('click', () => mutate(view.date, d => { d.nicotine = !d.nicotine; }));
  $('#alc-minus').addEventListener('click', () => mutate(view.date, d => { d.alcohol_drinks = Math.max(0, (d.alcohol_drinks || 0) - 1); }));
  $('#alc-plus').addEventListener('click', () => mutate(view.date, d => { d.alcohol_drinks = (d.alcohol_drinks || 0) + 1; }));
  // settings
  $('#in-api').value = lsGet(LS.api, '') || API_URL;
  $('#api-save').addEventListener('click', () => { lsSet(LS.api, $('#in-api').value.trim()); syncErr = ''; renderSync(); toast('URL saved'); flush(); pull(true); });
  $('#api-test').addEventListener('click', async () => {
    const st = $('#api-status'); st.textContent = 'Testing…';
    lsSet(LS.api, $('#in-api').value.trim());
    try { const j = await apiFetch('GET', { action: 'ping' }); st.textContent = `OK · backend v${j.version}`; syncErr = ''; pull(true); }
    catch (e) { st.textContent = 'Failed: ' + e.message; }
  });
  $('#export-json').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), state: S, queue: Q }, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `arc-${todayYMD()}.json` }); document.body.append(a); a.click(); a.remove();
  });
}

// ------------------------------------------------------------------ weight chart

function renderChart() {
  const root = $('#chart'), k = cfg(), w = weighIns();
  root.replaceChildren();
  const W = 560, H = 230, PL = 34, PR = 12, PT = 12, PB = 26;
  const x0 = 1, x1 = k.total;
  const sx = dn => PL + (dn - x0) / (x1 - x0) * (W - PL - PR);
  const ws = w.map(p => p.w);
  const yMin = Math.floor((Math.min(k.goal, ...ws) - 4) / 5) * 5;
  const yMax = Math.ceil((Math.max(k.startW, ...ws) + 4) / 5) * 5;
  const sy = v => PT + (yMax - v) / (yMax - yMin) * (H - PT - PB);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Weight over the arc, goal ${k.goal} lb`);
  const el = (t, a, parent = svg) => { const e = document.createElementNS(ns, t); Object.entries(a).forEach(([q, v]) => e.setAttribute(q, v)); parent.append(e); return e; };
  // grid + y axis
  const grid = el('g', { class: 'grid' }), axis = el('g', { class: 'axis' });
  const step = (yMax - yMin) > 40 ? 10 : 5;
  for (let v = yMin; v <= yMax; v += step) { el('line', { x1: PL, x2: W - PR, y1: sy(v), y2: sy(v) }, grid); el('text', { x: PL - 6, y: sy(v) + 3, 'text-anchor': 'end' }, axis).textContent = v; }
  // x axis: month starts
  let m = parseYMD(k.start); m = new Date(m.getFullYear(), m.getMonth() + 1, 1, 12);
  while (ymd(m) <= endDate()) { const dn = dayNumber(ymd(m)); el('text', { x: sx(dn), y: H - 8, 'text-anchor': 'middle' }, axis).textContent = MON[m.getMonth()].toUpperCase(); m = new Date(m.getFullYear(), m.getMonth() + 1, 1, 12); }
  // corridor from first weigh-in
  if (w.length) {
    const f = w[0], fd = Math.max(1, dayNumber(f.date));
    const slow = [], fast = [];
    for (let dn = fd; dn <= x1; dn += 3) { const t = (dn - fd) / 7; slow.push([sx(dn), sy(f.w * Math.pow(0.995, t))]); fast.push([sx(dn), sy(f.w * Math.pow(0.99, t))]); }
    const poly = slow.map(p => p.join(',')).concat(fast.slice().reverse().map(p => p.join(','))).join(' ');
    el('polygon', { class: 'corridor', points: poly });
    el('polyline', { class: 'corridor-edge', points: slow.map(p => p.join(',')).join(' ') });
    el('polyline', { class: 'corridor-edge', points: fast.map(p => p.join(',')).join(' ') });
  }
  // goal
  el('line', { class: 'goal', x1: PL, x2: W - PR, y1: sy(k.goal), y2: sy(k.goal) });
  el('text', { x: W - PR, y: sy(k.goal) - 4, 'text-anchor': 'end', fill: 'var(--brass)', 'font-size': '10', 'font-family': 'var(--font)' }).textContent = `${k.goal} GOAL`;
  // actual
  const pts = w.map(p => ({ x: sx(Math.max(0, dayNumber(p.date))), y: sy(p.w), p }));
  if (pts.length) {
    el('polyline', { class: 'line', points: pts.map(p => `${p.x},${p.y}`).join(' ') });
    pts.forEach((p, i) => el('circle', { class: 'pt' + (i === pts.length - 1 ? ' pt--last' : ''), cx: p.x, cy: p.y, r: i === pts.length - 1 ? 4 : 2.5 }));
  } else {
    el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', fill: 'var(--dim)', 'font-size': '12', 'font-family': 'var(--font)' }).textContent = 'No weigh-ins yet. Log weight to start the corridor.';
  }
  // hover / touch readout
  const hov = el('g', { class: 'hover', style: 'display:none' });
  const hl = el('line', { y1: PT, y2: H - PB }, hov), hc = el('circle', { r: 4 }, hov);
  const tipBg = el('rect', { class: 'tip-bg', rx: 3, height: 18 }, hov), tip = el('text', { class: 'tip', y: 0 }, hov);
  const show = clientX => {
    if (!pts.length) return;
    const r = svg.getBoundingClientRect(); const x = (clientX - r.left) / r.width * W;
    let best = pts[0]; pts.forEach(p => { if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; });
    hov.style.display = ''; hl.setAttribute('x1', best.x); hl.setAttribute('x2', best.x); hc.setAttribute('cx', best.x); hc.setAttribute('cy', best.y);
    tip.textContent = `${best.p.w.toFixed(1)} lb · ${fmtShort(best.p.date)}`;
    const tw = tip.textContent.length * 6.2 + 12; let tx = Math.min(Math.max(best.x - tw / 2, PL), W - PR - tw); const ty = Math.max(PT, best.y - 28);
    tipBg.setAttribute('x', tx); tipBg.setAttribute('y', ty); tipBg.setAttribute('width', tw); tip.setAttribute('x', tx + 6); tip.setAttribute('y', ty + 13);
  };
  svg.addEventListener('pointermove', e => show(e.clientX)); svg.addEventListener('pointerdown', e => show(e.clientX));
  svg.addEventListener('pointerleave', () => { hov.style.display = 'none'; });
  root.append(svg);

  // projection
  const ri = rateInfo(), pr = $('#projection');
  if (!w.length) pr.textContent = 'Log your first weigh-in to start the corridor and the projection.';
  else if (!ri) pr.textContent = `First weigh-in ${w[0].w.toFixed(1)} lb on ${fmtShort(w[0].date)}. A second weigh-in at least three days later starts the projection.`;
  else if (ri.rate <= 0) pr.innerHTML = `No downward trend yet: <b>${esc(ri.last.w.toFixed(1))} lb</b> vs ${esc(ri.first.w.toFixed(1))} at the start.`;
  else {
    const weeks = (ri.last.w - k.goal) / ri.rate;
    const when = addDays(ri.last.date, Math.round(weeks * 7));
    const over = when > endDate();
    pr.innerHTML = `At the current rate (<b class="${ri.cls}">${esc(ri.rate.toFixed(2))} lb/wk · ${esc(ri.pct.toFixed(2))} %</b>) you reach <b>${esc(k.goal)} lb</b> around <b>${esc(fmtLong(when))}</b>, in ${esc(Math.round(weeks))} weeks${over ? ', after the arc ends' : ''}.` +
      (ri.cls === 'bad' ? ' Faster than 1 % a week costs muscle. Eat to the number.' : ri.cls === 'warn' ? ' Under 0.5 % a week. Check the protein and the steps before the calories.' : '');
  }
}

// ------------------------------------------------------------------ lifts table

function bestPerWeek(lift) {
  const best = {};
  Object.keys(S.days).forEach(date => { const l = S.days[date].lifts[lift]; if (!l || !(l.weight > 0 && l.reps > 0)) return; const wk = weekOf(date), v = epley(l.weight, l.reps); if (!best[wk] || v > best[wk]) best[wk] = v; });
  return best;
}
function renderLiftTable() {
  const t = $('#lifts-table'); t.replaceChildren();
  t.append(h('thead', {}, h('tr', {}, h('th', {}, 'Lift'), h('th', { class: 'r' }, 'First'), h('th', { class: 'r' }, 'Latest'), h('th', { class: 'r' }, 'Best'))));
  const tb = h('tbody', {});
  MAIN_LIFTS.forEach(lift => {
    const entries = Object.keys(S.days).sort().map(date => ({ date, l: S.days[date].lifts[lift] })).filter(e => e.l && e.l.weight > 0 && e.l.reps > 0);
    if (!entries.length) { tb.append(h('tr', {}, h('td', { class: 'dimmed' }, lift), h('td', { class: 'r dimmed' }, '—'), h('td', { class: 'r dimmed' }, '—'), h('td', { class: 'r dimmed' }, '—'))); return; }
    const first = epley(entries[0].l.weight, entries[0].l.reps), last = epley(entries[entries.length - 1].l.weight, entries[entries.length - 1].l.reps);
    const best = Math.max(...entries.map(e => epley(e.l.weight, e.l.reps)));
    const bw = bestPerWeek(lift), wks = Object.keys(bw).map(Number).sort((a, b) => a - b);
    let flag = '';
    if (wks.length >= 3) { const [a, b, c] = wks.slice(-3).map(x => bw[x]); if (c < b && b < a) flag = 'Down two weeks running. Fuelling, not programming.'; }
    tb.append(h('tr', {},
      h('td', {}, lift, flag ? h('div', { class: 'flag' }, flag) : null),
      h('td', { class: 'r' }, first.toFixed(0)),
      h('td', { class: 'r' }, last.toFixed(0), last > first ? h('span', { class: 'up' }, ' ↑') : null),
      h('td', { class: 'r' }, best.toFixed(0))));
  });
  t.append(tb);
}

// ------------------------------------------------------------------ calendar

function renderCalendar() {
  const root = $('#cal'), k = cfg(), today = todayYMD(), end = endDate();
  root.replaceChildren();
  let cur = k.start;
  const months = [];
  while (cur <= end) {
    const d = parseYMD(cur), key = `${d.getFullYear()}-${d.getMonth()}`;
    let mo = months[months.length - 1];
    if (!mo || mo.key !== key) { mo = { key, label: MON[d.getMonth()], cells: [] }; months.push(mo); }
    mo.cells.push(cur); cur = addDays(cur, 1);
  }
  months.forEach(mo => {
    const cells = h('div', { class: 'cal__cells' });
    mo.cells.forEach(date => {
      let cls = 'cell';
      if (date > today) cls += ' cell--future';
      else if (isClean(date)) cls += ' cell--clean';
      else if (isPartial(date)) cls += ' cell--partial';
      else cls += ' cell--missed';
      if (isDeload(date)) cls += ' cell--deload';
      if (isDiet(date)) cls += ' cell--diet';
      if (date === today) cls += ' cell--today';
      cells.append(h('button', { type: 'button', class: cls, title: `${fmtShort(date)} · day ${dayNumber(date)}`, 'aria-label': `${fmtShort(date)}, day ${dayNumber(date)}`,
        onclick: () => { if (date <= today) { view.date = date; view.open.clear(); render(); showTab('today'); } } }));
    });
    root.append(h('div', { class: 'cal__month' }, h('div', { class: 'cal__label' }, mo.label), cells));
  });
}

// ================================================================== READING

function bookStats(book) {
  const dates = Object.keys(S.days).filter(d => (S.days[d].pages[book.t] || 0) !== 0).sort();
  const total = dates.reduce((s, d) => s + (S.days[d].pages[book.t] || 0), 0);
  const first = dates[0] || null;
  const span = first ? Math.max(1, daysBetween(first, todayYMD()) + 1) : 0;
  const rate = span ? total / span : 0;
  const remaining = Math.max(0, book.p - total);
  const finish = (rate > 0 && remaining > 0) ? addDays(todayYMD(), Math.ceil(remaining / rate)) : null;
  return { total, first, rate, remaining, finish, pct: Math.min(100, total / book.p * 100) };
}
function renderReading() {
  const root = $('#books'), date = view.date, d = getDay(date);
  root.replaceChildren();
  let sum = 0;
  BOOKS.forEach(b => {
    const s = bookStats(b); sum += Math.min(s.total, b.p);
    const todayP = d.pages[b.t] || 0;
    const bump = n => mutate(date, x => { const cur = x.pages[b.t] || 0; const others = s.total - cur; let v = cur + n; v = Math.max(0, Math.min(v, b.p - others)); if (v === 0) delete x.pages[b.t]; else x.pages[b.t] = v; });
    let proj;
    if (s.total >= b.p) proj = 'Finished.';
    else if (!s.first) proj = `${b.p} pp · not started`;
    else if (s.finish) proj = `${s.rate.toFixed(1)} pp/day · finish ~${fmtShort(s.finish)}${s.finish > endDate() ? ' (after the arc)' : ''}`;
    else proj = `${s.remaining} pp left`;
    root.append(h('div', { class: 'book' + (s.total >= b.p ? ' is-done' : '') },
      h('div', { class: 'book__top' }, h('div', {}, h('div', { class: 'book__t' }, b.t), h('div', { class: 'book__a' }, `${b.a} · ${b.p} pp`)),
        h('div', { class: 'book__pct num' }, `${Math.floor(s.pct)}`, h('small', {}, '%'))),
      h('div', { class: 'bar' }, h('i', { style: `width:${s.pct}%` })),
      h('div', { class: 'book__meta' }, h('div', { class: 'book__proj' }, `${s.total} / ${b.p} · ${proj}`),
        h('div', { class: 'book__btns' }, h('span', { class: 'today num' }, todayP ? `+${todayP} ${date === todayYMD() ? 'today' : fmtShort(date)}` : ''),
          h('button', { type: 'button', class: 'btn btn--sm', onclick: () => bump(-10), 'aria-label': `${b.t} minus 10 pages` }, '−10'),
          h('button', { type: 'button', class: 'btn btn--sm', onclick: () => bump(10), 'aria-label': `${b.t} plus 10 pages` }, '+10'),
          h('button', { type: 'button', class: 'btn btn--sm', onclick: () => bump(25), 'aria-label': `${b.t} plus 25 pages` }, '+25')))));
  });
  $('#read-total').textContent = sum.toLocaleString();
  $('#read-total-all').textContent = BOOKS.reduce((s, b) => s + b.p, 0).toLocaleString();
  $('#food-kcal').textContent = `${(isDiet(todayYMD()) ? cfg().kcalBreak : cfg().kcal).toLocaleString()} kcal${isDiet(todayYMD()) ? ' · diet break' : ''}`;
}

// ================================================================== BOOT

RENDERERS.push(renderLog, renderReading);
bootCore();
bindLog();
render();
pull(true);
scheduleFlush(300);
