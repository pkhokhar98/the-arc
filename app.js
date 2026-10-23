'use strict';
/* The Arc — frontend. Vanilla JS, no build step.
   Local state first (localStorage), queued writes flushed to the Apps Script web app.
   Order of this file: constants · protocol · dates · state · sync · today screen · (log, chart, calendar, reading appended below) · boot */

const BUILD = '2026-10-23a';   // bump with version.json on every release

// Paste the Apps Script web app URL here (ends in /exec), or set it in Log → Sync on the phone.
const API_URL = 'https://script.google.com/macros/s/AKfycby8GfExKVz6mz2ofy1SJ47RvrwynBNgLi_WC_EKDmD-_YO_FT3sEs8RTafTvDsFYZWAhw/exec';

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
// ------------------------------------------------------------------ wake time + day schedule

const SLEEP_MIN = 450;   // 7.5 h
const WORK_START = 420, WORK_END = 840;   // meetings open 07:00 PT, client day closes 14:00 PT
/** Wake time in minutes after midnight: this device's choice, else the sheet's Config wake_time, else 06:00. */
function parseWake(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) { const n = Number(v); return n <= 24 ? Math.round(n * 60) : Math.floor(n / 100) * 60 + (n % 100); }
  const s = String(v), m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const d = new Date(s);
  if (!isNaN(d)) { const [hh, mm] = new Intl.DateTimeFormat('en-CA', { timeZone: C.TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).split(':').map(Number); return hh * 60 + mm; }
  return null;
}
function wakeMin() {
  const local = lsGet('arc.wake', null);
  if (typeof local === 'number') return local;
  return parseWake((S.config || {}).wake_time) ?? 360;
}
function bedMin() { return wakeMin() - SLEEP_MIN + 1440; }   // may exceed 1440 = after midnight
function fmtT(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
function nowMin() {
  try { const [hh, mm] = new Intl.DateTimeFormat('en-CA', { timeZone: C.TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number); return hh * 60 + mm; }
  catch (e) { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
}
function hhmmToMin(s) { const m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }

/** Time slots for every timed item on a date, built from the wake time. Protein and steps run all day, so they have none. */
function scheduleFor(date) {
  const W = wakeMin(), B = bedMin(), ses = sessionFor(date);
  const deep = W + 50 < WORK_START ? [W + 50, WORK_START] : [W + 50, W + 80];
  const tr = ses.type === 'rest' ? [600, 660] : (() => { const t = hhmmToMin(ses.time) ?? 870; return [t, t + 75]; })();
  return [
    { key: 'sleep', t: W, end: W + 5 },
    { key: 'morning_window', t: W, end: W + 20 },
    { key: 'gargle', t: W + 20, end: W + 25 },
    { key: 'breakfast', t: W + 25, end: W + 45 },
    { key: 'am_stack', t: W + 30, end: W + 45 },
    { key: 'trataka', t: W + 45, end: W + 50 },
    { key: 'deep_work', t: deep[0], end: deep[1] },
    { key: 'walk', t: 720, end: 740 },
    { key: 'close_client', t: WORK_END, end: WORK_END + 10 },
    { key: 'train', t: tr[0], end: tr[1] },
    { key: 'decompress', t: 990, end: 1080 },
    { key: 'read', t: B - 75, end: B - 50 },
    { key: 'night_close', t: B - 45, end: B - 40 },
    { key: 'pm_stack', t: B - 40, end: B - 35 },
    { key: 'rinse', t: B - 35, end: B - 30 },
    { key: 'sats', t: B - 20, end: B }
  ].sort((a, b) => a.t - b.t || a.end - b.end);
}
function groupNote(g) {
  const W = wakeMin(), B = bedMin();
  if (g.group === 'Morning') return fmtT(W + 25);
  if (g.group === 'Evening') return `from ${fmtT(B - 75)}`;
  if (g.group === 'Pre-sleep') return `${fmtT(B - 20)} · asleep by ${fmtT(B)}`;
  return g.note;
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
    if (it.key === 'deep_work') r.sub = wakeMin() + 50 < WORK_START ? `${fmtT(wakeMin() + 50)}–07:00 · before meetings open` : 'no room before 07:00 today · take the first gap after a call';
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

const LS = { state: 'arc.state.v1', queue: 'arc.queue.v1', api: 'arc.api', pull: 'arc.lastPull', key: 'arc.key' };
const syncKey = () => String(lsGet(LS.key, '') || '').trim();
const KEY_ERR = 'Sync key missing or wrong';
let S = { days: {}, config: {} };
let Q = {};            // date -> ts of last local change not yet confirmed by the server
const view = { date: todayYMD(), tab: 'today', open: new Set() };

function lsGet(k, f) { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (e) { return f; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode / full */ } }

function blankDay(date) {
  return { date, sleep_hours: null, weight_lb: null, steps: null, alcohol_drinks: 0, notes: '', checks: {}, lifts: {}, pages: {}, updated_at: '' };
}
function getDay(date) { return S.days[date] || blankDay(date); }
function normalizeDay(d) {
  const b = blankDay(d.date);
  const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
  d = Object.assign({}, d); delete d.nicotine;
  return Object.assign(b, d, {
    sleep_hours: num(d.sleep_hours), weight_lb: num(d.weight_lb), steps: num(d.steps),
    alcohol_drinks: num(d.alcohol_drinks) || 0, notes: d.notes || '',
    checks: d.checks || {}, lifts: d.lifts || {}, pages: d.pages || {}, updated_at: d.updated_at || ''
  });
}
function saveLocal() { lsSet(LS.state, S); lsSet(LS.queue, Q); }
function loadLocal() {
  const s = lsGet(LS.state, null);
  if (s && s.days) { S = s; Object.keys(S.days).forEach(k => { S.days[k] = normalizeDay(S.days[k]); }); }
  Q = lsGet(LS.queue, {}) || {};
  // older builds queued a bare timestamp: treat those as "send the whole day"
  Object.keys(Q).forEach(k => { if (typeof Q[k] === 'string') Q[k] = { ts: Q[k], paths: null }; });
}

/** Apply a change to a day: patch(day) mutates. Saves, queues, re-renders. */
/** Field-level paths that differ between two versions of a day: "notes", "checks.read", "lifts.Back squat"… */
const DAY_FIELDS = ['sleep_hours', 'weight_lb', 'steps', 'alcohol_drinks', 'notes'];
const DAY_MAPS = ['checks', 'lifts', 'pages'];
function diffPaths(a, b) {
  const out = [];
  DAY_FIELDS.forEach(f => { if (JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null)) out.push(f); });
  DAY_MAPS.forEach(m => {
    const ka = a[m] || {}, kb = b[m] || {};
    new Set([...Object.keys(ka), ...Object.keys(kb)]).forEach(k => { if (JSON.stringify(ka[k] ?? null) !== JSON.stringify(kb[k] ?? null)) out.push(m + '.' + k); });
  });
  return out;
}
/** Copy only the given paths from src onto dst (a path whose value is gone in src is deleted from dst). */
function applyPaths(dst, src, paths) {
  paths.forEach(p => {
    const i = p.indexOf('.');
    if (i < 0) { dst[p] = src[p]; return; }
    const m = p.slice(0, i), k = p.slice(i + 1);
    dst[m] = dst[m] || {};
    if (src[m] && src[m][k] !== undefined) dst[m][k] = src[m][k]; else delete dst[m][k];
  });
  return dst;
}
function mutate(date, patch) {
  const d = getDay(date), before = JSON.parse(JSON.stringify(d));
  patch(d);
  // derived ticks: logging sleep / steps sets their anchors
  const k = cfg();
  if (d.sleep_hours !== null) d.checks.sleep = d.sleep_hours >= k.sleep;
  if (d.steps !== null) d.checks.steps = d.steps >= k.steps;
  const changed = diffPaths(before, d);
  if (!changed.length) { render(); return; }
  d.updated_at = new Date().toISOString();
  S.days[date] = d;
  const prev = Q[date], paths = prev && prev.paths === null ? null : [...new Set([...((prev && prev.paths) || []), ...changed])];
  Q[date] = { ts: d.updated_at, paths };
  saveLocal();
  render();
  scheduleFlush();
}

function toPayload(date) {
  const d = getDay(date), ses = sessionFor(date);
  return {
    date, sleep_hours: d.sleep_hours ?? '', weight_lb: d.weight_lb ?? '', steps: d.steps ?? '',
    session: ses.name, trained: !!d.checks.train && ses.type !== 'rest',
    alcohol_drinks: d.alcohol_drinks || 0, notes: d.notes || '', updated_at: d.updated_at,
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
    const token = syncKey();
    const res = method === 'GET'
      ? await fetch(url + '?' + new URLSearchParams(Object.assign({}, bodyOrParams, token ? { token } : {})), { signal: ctrl.signal, redirect: 'follow' })
      : await fetch(url, { method: 'POST', body: JSON.stringify(Object.assign({}, bodyOrParams, token ? { token } : {})), signal: ctrl.signal, redirect: 'follow' });
    const txt = await res.text();
    let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('non-JSON reply (check deploy access = Anyone)'); }
    if (!j.ok) throw new Error(j.error === 'unauthorized' ? KEY_ERR : (j.error || 'server error'));
    return j;
  } finally { clearTimeout(t); }
}

/** Pull first, then send. Each queued day is rebuilt from the sheet's copy plus only the fields this
 *  device changed, so a phone and a laptop never wipe each other's entries (e.g. lifts logged elsewhere). */
async function flush() {
  const dates = Object.keys(Q);
  if (!dates.length || flushing || !apiUrl() || !navigator.onLine) { renderSync(); return; }
  flushing = true; renderSync('sending');
  const snapshot = {}; dates.forEach(d => { snapshot[d] = Q[d].ts; });
  try {
    const j = await apiFetch('GET', { action: 'load' });
    absorb(j);
    dates.forEach(date => {
      const q = Q[date], loc = getDay(date);
      if (!q || q.paths === null || !j.days || !j.days[date]) return;   // whole-day send, or the sheet has nothing yet
      const merged = applyPaths(normalizeDay(JSON.parse(JSON.stringify(j.days[date]))), loc, q.paths);
      merged.updated_at = loc.updated_at;
      S.days[date] = merged;
    });
    await apiFetch('POST', { action: 'batch', ops: dates.map(d => ({ day: toPayload(d) })) });
    dates.forEach(d => { if (Q[d] && Q[d].ts === snapshot[d]) delete Q[d]; });
    saveLocal(); syncErr = ''; render();
  } catch (e) { syncErr = e.message; }
  flushing = false; renderSync();
  if (Object.keys(Q).length && !syncErr) scheduleFlush(500);
}
let syncErr = '';

/** Take the sheet's copy of everything this device isn't in the middle of changing. */
function absorb(j) {
  S.config = j.config || {};
  Object.keys(j.days || {}).forEach(date => {
    if (Q[date]) return;                      // local change pending; merged at flush
    const srv = normalizeDay(j.days[date]), loc = S.days[date];
    if (!loc || !loc.updated_at || (srv.updated_at && srv.updated_at > loc.updated_at)) S.days[date] = srv;
  });
  lsSet(LS.pull, new Date().toISOString());
}
async function pull(force) {
  if (!apiUrl() || !navigator.onLine) { renderSync(); return; }
  if (!force && Date.now() - lastPullAt < 60000) return;
  lastPullAt = Date.now();
  try {
    const j = await apiFetch('GET', { action: 'load' });
    absorb(j); syncErr = '';
    saveLocal(); render();
  } catch (e) { syncErr = e.message; renderSync(); }
}

function renderSync(stateOverride) {
  try { renderCastDiag(); } catch (e) { /* cast panel not built yet */ }
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
  mr.textContent = ri ? ri.rate.toFixed(1) : '—'; mr.className = 'metric__v num ' + (ri ? ri.cls : '');
  mr.nextElementSibling.textContent = ri ? `${ri.pct.toFixed(1)}%/wk` : 'lb / wk';
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
      h('div', { class: 'group__h' }, h('span', { class: 'label' }, g.group), h('span', { class: 'label label--dim' }, groupNote(g) || (reqN ? `${doneN}/${reqN}` : ''))));
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


// ------------------------------------------------------------------ next up

function nextUp(date) {
  const d = getDay(date), items = itemsFor(date), now = nowMin();
  const label = key => (items.find(i => i.key === key) || {}).title || key;
  const req = key => !!(items.find(i => i.key === key) || {}).req;
  const open = scheduleFor(date).filter(s => !d.checks[s.key]);
  const cur = open.find(s => now >= s.t && now < s.end);
  const nxt = open.find(s => s.t >= now && s !== cur);
  const late = open.filter(s => s.end <= now && req(s.key) && s !== cur);
  return { cur, nxt, late, label, allDone: !open.length };
}
function renderNext() {
  const box = $('#next'); if (!box) return;
  const today = todayYMD(), live = view.date === today && dayNumber(today) >= 0;
  box.hidden = !live;
  const sel = $('#in-wake');
  if (!sel.options.length) for (let m = 270; m <= 540; m += 15) sel.append(h('option', { value: m }, fmtT(m)));
  sel.value = String(wakeMin());
  if (!live) return;
  if (dayNumber(today) < 1) {
    $('#next-k').textContent = 'Tonight'; $('#next-t').textContent = fmtT(bedMin() - 20);
    $('#next-what').textContent = `Day 1 tomorrow · asleep by ${fmtT(bedMin())}`; $('#next-late').textContent = ''; box.dataset.key = ''; box.classList.remove('is-now'); return;
  }
  const n = nextUp(today);
  if (n.allDone) { $('#next-k').textContent = 'Done'; $('#next-t').textContent = ''; $('#next-what').textContent = 'Every timed anchor is in. Lights out by ' + fmtT(bedMin()) + '.'; box.dataset.key = ''; }
  else if (n.cur) { $('#next-k').textContent = 'Now'; $('#next-t').textContent = `until ${fmtT(n.cur.end)}`; $('#next-what').textContent = n.label(n.cur.key); box.dataset.key = n.cur.key; }
  else if (n.nxt) { $('#next-k').textContent = 'Next up'; $('#next-t').textContent = fmtT(n.nxt.t); $('#next-what').textContent = n.label(n.nxt.key); box.dataset.key = n.nxt.key; }
  else { $('#next-k').textContent = 'Tonight'; $('#next-t').textContent = ''; $('#next-what').textContent = 'Close out what is left, asleep by ' + fmtT(bedMin()) + '.'; box.dataset.key = ''; }
  const names = n.late.slice(0, 3).map(s => ANCHOR_LABEL[s.key] || n.label(s.key)).join(' · ');
  $('#next-late').textContent = n.late.length ? `Still open: ${names}${n.late.length > 3 ? ` +${n.late.length - 3}` : ''}` : '';
  box.classList.toggle('is-now', !!n.cur);
}
function bindNext() {
  $('#in-wake').addEventListener('change', e => {
    const m = Number(e.target.value); lsSet('arc.wake', m);
    if (apiUrl()) apiFetch('POST', { action: 'config', config: { wake_time: Math.floor(m / 60) * 100 + (m % 60) } }).catch(() => {});
    render(); toast(`Wake ${fmtT(m)} · asleep by ${fmtT(bedMin())}`);
  });
  $('#next-main').addEventListener('click', () => {
    const key = $('#next').dataset.key; if (!key) return;
    const row = document.querySelector(`.row[data-key="${key}"]`); if (!row) return;
    row.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
    row.classList.remove('is-flash'); void row.offsetWidth; row.classList.add('is-flash');
  });
  setInterval(() => { if (view.tab === 'today' && !document.hidden) renderNext(); }, 30000);
}

// ------------------------------------------------------------------ render registry + boot

const RENDERERS = [renderToday, renderNext];
function render() { RENDERERS.forEach(fn => { try { fn(); } catch (e) { console.error(fn.name, e); } }); renderSync(); }

function showTab(name) {
  view.tab = name;
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
  document.body.classList.toggle('on-power', name === 'power');
  window.scrollTo({ top: 0 });
  if (name === 'power') { PW.shown = PW.cur = 0; renderPower(); Aura.start(); } else if (typeof Aura !== 'undefined') Aura.stop();
}

function bootCore() {
  loadLocal();
  // Personal link (…/the-arc/#key=…): the key rides in the address, so any tab or home-screen icon opened
  // from it syncs with no setup, even a Private tab. The part after # never leaves the phone.
  if (/^#key=/.test(location.hash)) {
    const k = decodeURIComponent(location.hash.slice(5)).trim();
    if (k && k !== syncKey()) { lsSet(LS.key, k); setTimeout(() => toast('Synced with your personal link'), 600); }
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.view)));
  $('#day-prev').addEventListener('click', () => { view.date = addDays(view.date, -1); view.open.clear(); render(); });
  $('#day-next').addEventListener('click', () => { if (view.date < todayYMD()) { view.date = addDays(view.date, 1); view.open.clear(); render(); } });
  $('#day-today').addEventListener('click', () => { view.date = todayYMD(); view.open.clear(); render(); });
  $('#sync-now').addEventListener('click', async () => { if (!apiUrl() || syncErr === KEY_ERR) { showTab('log'); $('#settings').open = true; $('#in-api').focus(); return; } await flush(); await pull(true); toast(syncErr ? 'Sync failed' : 'Synced'); });
  window.addEventListener('online', () => { flush(); pull(true); });
  // re-sync every 2 minutes while the app is on screen, so a laptop left open picks up phone entries
  setInterval(() => { if (!document.hidden && !Object.keys(Q).length) pull(true); }, 120000);
  window.addEventListener('focus', () => pull(false));
  // a home-screen app can stay frozen on an old version for days: check for a new build when it comes back
  const checkUpdate = async () => {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const v = await r.json();
      if (v.build && v.build !== BUILD && !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement || {}).tagName)) {
        toast('Updating to the latest version…'); saveLocal(); setTimeout(() => location.reload(), 600);
      }
    } catch (e) { /* offline: keep running this build */ }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
  setTimeout(checkUpdate, 4000);
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
  const l = lift ? d.lifts[lift] : null, dr = lift ? LIFT_DRAFT[date] : null;
  // a half-typed set (weight without reps or the reverse) stays on screen until it is complete
  setIf('#in-lift-w', dr ? dr.w : (l ? l.weight : '')); setIf('#in-lift-r', dr ? dr.r : (l ? l.reps : ''));
  if (!lift) $('#lift-hint').textContent = `No main lift on a ${ses.name.toLowerCase()} day.`;
  else if (dr) $('#lift-hint').textContent = dr.w === null ? 'Add the weight to save this set.' : 'Add the reps to save this set.';
  else if (l && l.weight > 0 && l.reps > 0) $('#lift-hint').textContent = `Est. 1RM ${epley(l.weight, l.reps).toFixed(0)} lb (Epley) · ${isDeload(date) ? 'deload week, same load, half the sets' : 'top set only'}`;
  else $('#lift-hint').textContent = 'Top set only. Est. 1RM via Epley: w × (1 + reps/30).';
  $('#alc-v').textContent = d.alcohol_drinks || 0;
  renderChart(); renderLiftTable(); renderCalendar();
}
const epley = (w, r) => w * (1 + r / 30);

const LIFT_DRAFT = {};   // date -> { w, r } while only one of weight / reps is filled in
function readLogInputs() {
  const date = view.date, ses = sessionFor(date);
  const num = id => { const v = $(id).value; return v === '' ? null : Number(v); };
  mutate(date, d => {
    d.weight_lb = num('#in-weight'); d.sleep_hours = num('#in-sleep'); d.steps = num('#in-steps'); d.notes = $('#in-notes').value.trim();
    if (ses.main) {
      const w = num('#in-lift-w'), r = num('#in-lift-r');
      if (w > 0 && r > 0) { d.lifts[ses.main] = { weight: w, reps: r }; delete LIFT_DRAFT[date]; }
      else if (w === null && r === null) { delete d.lifts[ses.main]; delete LIFT_DRAFT[date]; }   // both cleared on purpose
      else LIFT_DRAFT[date] = { w, r };                                                          // half-typed: keep it, don't touch the saved set
    }
  });
}

function bindLog() {
  ['#in-weight', '#in-sleep', '#in-steps', '#in-lift-w', '#in-lift-r'].forEach(id => $(id).addEventListener('change', readLogInputs));
  // also save a moment after typing stops, and when the app is left mid-entry (no blur, so no change event)
  let logT = 0;
  const logSoon = () => { clearTimeout(logT); logT = setTimeout(readLogInputs, 1500); };
  ['#in-weight', '#in-sleep', '#in-steps', '#in-lift-w', '#in-lift-r', '#in-notes'].forEach(id => $(id).addEventListener('input', logSoon));
  const logNow = () => { if (view.tab !== 'log') return; clearTimeout(logT); readLogInputs(); flush(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') logNow(); });
  window.addEventListener('pagehide', logNow);
  $$('.tab').forEach(t => t.addEventListener('pointerdown', () => { if (view.tab === 'log') { clearTimeout(logT); readLogInputs(); } }));
  ['#day-prev', '#day-next', '#day-today'].forEach(id => $(id).addEventListener('pointerdown', () => { if (view.tab === 'log') { clearTimeout(logT); readLogInputs(); } }));
  $('#in-notes').addEventListener('blur', () => { if ($('#in-notes').value.trim() !== (getDay(view.date).notes || '')) readLogInputs(); });
  $('#log-save').addEventListener('click', () => { readLogInputs(); $('#log-status').textContent = 'Saved on device' + (apiUrl() ? ', sending' : ''); flush(); setTimeout(() => { $('#log-status').textContent = ''; }, 2500); });
  $('#alc-minus').addEventListener('click', () => mutate(view.date, d => { d.alcohol_drinks = Math.max(0, (d.alcohol_drinks || 0) - 1); }));
  $('#alc-plus').addEventListener('click', () => mutate(view.date, d => { d.alcohol_drinks = (d.alcohol_drinks || 0) + 1; }));
  // settings
  $('#in-api').value = lsGet(LS.api, '') || API_URL;
  $('#in-key').value = syncKey();
  const saveSync = () => { const u = $('#in-api').value.trim(); lsSet(LS.api, u === API_URL ? '' : u); lsSet(LS.key, $('#in-key').value.trim()); };
  $('#api-save').addEventListener('click', () => { saveSync(); syncErr = ''; renderSync(); toast('Sync settings saved'); flush(); pull(true); });
  $('#api-test').addEventListener('click', async () => {
    const st = $('#api-status'); st.textContent = 'Testing…'; saveSync();
    try {
      const p = await apiFetch('GET', { action: 'ping' });
      if (!p.locked) { st.textContent = `Connected · backend v${p.version} has no key check yet (paste the new Code.gs)`; syncErr = ''; pull(true); return; }
      await apiFetch('GET', { action: 'check' });
      st.textContent = `Connected · key accepted · backend v${p.version}`; syncErr = ''; flush(); pull(true);
    } catch (e) { st.textContent = e.message === KEY_ERR ? 'Reached the sheet, but the key is wrong. Run makeToken() in Apps Script and paste its key.' : 'Failed: ' + e.message; }
  });
  $('#key-link').addEventListener('click', () => {
    const k = $('#in-key').value.trim() || syncKey(), st = $('#api-status');
    if (!k) { st.textContent = 'Paste your sync key first.'; return; }
    const link = location.origin + location.pathname + '#key=' + encodeURIComponent(k);
    $('#key-link-out').value = link; $('#key-link-out').hidden = false;
    const done = () => { st.textContent = 'Personal link copied. Send it to your phone and open it there. Don\'t share it: it opens your data.'; };
    try { navigator.clipboard.writeText(link).then(done, () => { $('#key-link-out').select(); st.textContent = 'Link selected below. Copy it and send it to your phone.'; }); }
    catch (e) { $('#key-link-out').select(); st.textContent = 'Link selected below. Copy it and send it to your phone.'; }
  });
  $('#key-show').addEventListener('click', () => { const i = $('#in-key'); i.type = i.type === 'password' ? 'text' : 'password'; $('#key-show').textContent = i.type === 'password' ? 'Show' : 'Hide'; });
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

// ================================================================== POWER (scouter dashboard)

const TIERS = [
  { min: 0,      name: 'Base form',         jp: '通常',             aura: '#8FB8FF', aura2: '#EAF2FF' },
  { min: 9000,   name: 'Kaioken',           jp: '界王拳',           aura: '#FF3B30', aura2: '#FFB199' },
  { min: 25000,  name: 'Super Saiyan',      jp: '超サイヤ人',       aura: '#FFD23F', aura2: '#FFF6C2' },
  { min: 50000,  name: 'Super Saiyan 2',    jp: '超サイヤ人2',      aura: '#FFD23F', aura2: '#FFFFFF', bolts: true },
  { min: 80000,  name: 'Super Saiyan 3',    jp: '超サイヤ人3',      aura: '#FFC21A', aura2: '#FFF0A0', bolts: true },
  { min: 115000, name: 'Super Saiyan God',  jp: '超サイヤ人ゴッド', aura: '#FF4D6D', aura2: '#FFC2CF' },
  { min: 150000, name: 'Super Saiyan Blue', jp: '超サイヤ人ブルー', aura: '#34C8FF', aura2: '#D6F5FF' },
  { min: 190000, name: 'Ultra Instinct',    jp: '身勝手の極意',     aura: '#C9D6EA', aura2: '#FFFFFF', bolts: true }
];
const ANCHOR_LABEL = { sleep: 'Sleep 7.5 h', morning_window: 'Morning window', protein: 'Protein target', steps: 'Steps target', train: 'Training session',
  decompress: 'Decompression', read: 'Read 20 min', night_close: 'Night close', rinse: 'Rinse + Pulmicort', sats: 'SATS' };
const REDUCE = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
const PW = { sample: false, sampleS: null, shown: 0, cur: 0, countRaf: 0, countT: 0, fighter: 'vegeta' };
const fmtN = n => Math.round(n).toLocaleString('en-US');
const abbr = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));

function withState(st, fn) { const prev = S; S = st; try { return fn(); } finally { S = prev; } }
const sumPages = day => Object.values(day.pages || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const arcDates = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
function tierIndex(p) { let i = 0; TIERS.forEach((t, j) => { if (p >= t.min) i = j; }); return i; }

/** Cumulative power, its sources, and the live streak. Pure over S. */
function powerReport(today) {
  const k = cfg(), last = today < endDate() ? today : endDate();
  const src = { discipline: 0, training: 0, strength: 0, wisdom: 0, gravity: 0, penalties: 0 };
  let streak = 0, best = 0;
  if (today >= k.start) arcDates(k.start, last).forEach(d => {
    const day = S.days[d];
    if (!day) { if (d < today) streak = 0; return; }
    const req = itemsFor(d).filter(i => i.req), done = req.filter(i => day.checks[i.key]).length;
    src.discipline += done * 20;
    if (done === req.length) { streak++; best = Math.max(best, streak); src.discipline += Math.round(300 * (1 + Math.min(streak, 30) / 30)); }
    else if (d < today) streak = 0;
    if (day.checks.train && sessionFor(d).type !== 'rest') src.training += 250;
    src.wisdom += sumPages(day) * 2;
    src.penalties -= 100 * (day.alcohol_drinks || 0);
  });
  MAIN_LIFTS.forEach(l => {
    let top = 0;
    Object.keys(S.days).forEach(d => { const x = S.days[d].lifts && S.days[d].lifts[l]; if (d >= k.start && x && x.weight > 0 && x.reps > 0) top = Math.max(top, epley(x.weight, x.reps)); });
    src.strength += Math.round(top * 5);
  });
  const w = weighIns();
  if (w.length > 1) src.gravity = Math.max(0, Math.round((w[0].w - w[w.length - 1].w) * 500));
  const total = Math.max(0, 1000 + Object.values(src).reduce((a, b) => a + b, 0));
  return { total, src, streak, best, mult: 1 + Math.min(streak, 30) / 30 };
}

/** One entry per arc week that has started: clean count, what a Dragon Ball needs, whether it's earned. */
function arcWeeks(today) {
  const k = cfg(), end = endDate(), out = [];
  for (let w = 1; w <= Math.ceil(k.total / 7); w++) {
    const ws = addDays(k.start, (w - 1) * 7);
    const len = Math.min(7, daysBetween(ws, end) + 1), we = addDays(ws, len - 1);
    const need = Math.min(6, len);
    let clean = 0;
    if (ws <= today) arcDates(ws, we < today ? we : today).forEach(d => { if (isClean(d)) clean++; });
    out.push({ w, ws, we, len, need, clean, started: ws <= today, done: we < today, now: ws <= today && today <= we, earned: ws <= today && clean >= need,
      deload: k.deload.includes(w), diet: k.diet.includes(w) });
  }
  return out;
}

/** Six 0–100 attributes over the last 28 completed days (today counts once it's clean). */
function scouterStats(today) {
  const k = cfg();
  const from = addDays(today, -28) > k.start ? addDays(today, -28) : k.start;
  const dates = from <= addDays(today, -1) ? arcDates(from, addDays(today, -1)) : [];
  if (today >= k.start && isClean(today)) dates.push(today);
  if (!dates.length) return null;
  const has = (d, key) => !!(S.days[d] && S.days[d].checks[key]);
  const rate = (key, pred) => { const ds = pred ? dates.filter(pred) : dates; return ds.length ? ds.filter(d => has(d, key)).length / ds.length : null; };
  const avg = (...xs) => { const v = xs.filter(x => x !== null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  const liftDay = d => sessionFor(d).type === 'lift', runDay = d => sessionFor(d).type === 'run';
  const gains = MAIN_LIFTS.map(l => {
    const es = Object.keys(S.days).sort().map(d => S.days[d].lifts && S.days[d].lifts[l]).filter(x => x && x.weight > 0 && x.reps > 0);
    return es.length > 1 ? epley(es[es.length - 1].weight, es[es.length - 1].reps) / epley(es[0].weight, es[0].reps) - 1 : null;
  }).filter(x => x !== null);
  const adherence = rate('train', liftDay);
  const str = gains.length ? 0.75 * (adherence ?? 0) + 0.25 * Math.min(1, Math.max(0, avg(...gains)) / 0.15) : (adherence ?? 0);
  const pagesPerDay = dates.reduce((s, d) => s + (S.days[d] ? sumPages(S.days[d]) : 0), 0) / dates.length;
  const arcPace = BOOKS.reduce((s, b) => s + b.p, 0) / k.total;
  return [
    { k: 'STR', name: 'Strength: lift-day adherence and est. 1RM gain', v: str },
    { k: 'SPD', name: 'Speed: run days and steps', v: avg(rate('train', runDay), rate('steps')) },
    { k: 'KI', name: 'Ki: morning window, decompression, SATS', v: avg(rate('morning_window'), rate('decompress'), rate('sats')) },
    { k: 'SENZU', name: 'Recovery: sleep, protein, rinse', v: avg(rate('sleep'), rate('protein'), rate('rinse')) },
    { k: 'DISC', name: 'Discipline: clean days and night close', v: avg(dates.filter(isClean).length / dates.length, rate('night_close')) },
    { k: 'WIS', name: 'Wisdom: reading and page pace', v: avg(rate('read'), Math.min(1, pagesPerDay / arcPace)) }
  ].map(x => Object.assign(x, { v: Math.round(Math.max(0, Math.min(1, x.v)) * 100) })).concat([{ days: dates.length }]);
}

// ---------- svg builders

const STARS = { 1: [[0, 0]], 2: [[-.2, -.16], [.2, .16]], 3: [[0, -.24], [-.22, .15], [.22, .15]], 4: [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]],
  5: [[0, -.27], [-.26, -.06], [.26, -.06], [-.16, .25], [.16, .25]], 6: [[-.19, -.26], [.19, -.26], [-.29, 0], [.29, 0], [-.19, .26], [.19, .26]],
  7: [[0, 0], [0, -.3], [.27, -.15], [.27, .15], [0, .3], [-.27, .15], [-.27, -.15]] };
function starPts(cx, cy, r) {
  const p = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push((cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1)); }
  return p.join(' ');
}
function ballSVG(n) {
  const id = 'db' + n + Math.random().toString(36).slice(2, 6), size = n === 1 ? 13 : n <= 4 ? 10 : 8.5;
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${n}-star Dragon Ball"><defs><radialGradient id="${id}" cx="38%" cy="32%" r="70%">
<stop offset="0" stop-color="#FFF4C4"/><stop offset=".32" stop-color="#FFC54D"/><stop offset=".72" stop-color="#F7931E"/><stop offset="1" stop-color="#B9520A"/></radialGradient></defs>
<circle cx="50" cy="50" r="46" fill="url(#${id})" stroke="#7A3606" stroke-width="1.5"/>
${STARS[n].map(([x, y]) => `<polygon points="${starPts(50 + x * 64, 54 + y * 64, size)}" fill="#D7261E"/>`).join('')}
<ellipse cx="35" cy="27" rx="15" ry="8" fill="#fff" fill-opacity=".55" transform="rotate(-32 35 27)"/></svg>`;
}

function radarSVG(stats) {
  const W = 320, H = 296, cx = 160, cy = 150, R = 90, n = stats.length;
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const poly = f => stats.map((s, i) => pt(i, f(s)).map(v => v.toFixed(1)).join(',')).join(' ');
  let g = '';
  [.25, .5, .75, 1].forEach(f => { g += `<polygon class="g-line" points="${poly(() => R * f)}"/>`; });
  stats.forEach((s, i) => { const [x, y] = pt(i, R); g += `<line class="g-axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; });
  g += `<polygon class="r-area" points="${poly(s => Math.max(3, R * s.v / 100))}"/>`;
  stats.forEach((s, i) => { const [x, y] = pt(i, Math.max(3, R * s.v / 100)); g += `<circle class="r-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>`; });
  stats.forEach((s, i) => {
    const [x, y] = pt(i, R + 24), anchor = x < cx - 8 ? 'end' : x > cx + 8 ? 'start' : 'middle';
    const ty = i === 0 ? y - 8 : i === n / 2 ? y + 2 : y - 4;
    g += `<g><title>${esc(s.name)}: ${s.v}</title><text class="t-key" x="${x.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}">${s.k}</text>` +
         `<text class="t-val" x="${x.toFixed(1)}" y="${(ty + 15).toFixed(1)}" text-anchor="${anchor}">${s.v}</text></g>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scouter stats: ${stats.map(s => s.k + ' ' + s.v).join(', ')}">${g}</svg>`;
}

function barsSVG(weeks) {
  const W = 340, H = 176, PL = 22, PR = 10, PT = 22, PB = 24, slots = 8, band = (W - PL - PR) / slots;
  const sy = v => PT + (7 - v) / 7 * (H - PT - PB);
  let g = '';
  [0, 7].forEach(v => { g += `<line class="g-line" x1="${PL}" x2="${W - PR}" y1="${sy(v)}" y2="${sy(v)}"/><text class="t-hud" x="${PL - 6}" y="${sy(v) + 3}" text-anchor="end">${v}</text>`; });
  g += `<line class="b-line" x1="${PL}" x2="${W - PR}" y1="${sy(6)}" y2="${sy(6)}"/>`;
  weeks.forEach((wk, i) => {
    const x = PL + i * band + band * 0.2, bw = band * 0.6, y = sy(Math.max(wk.clean, 0.06)), h = Math.max(1, sy(0) - y);
    g += `<g><title>Week ${wk.w}: ${wk.clean} clean of ${wk.len}${wk.now ? ' so far' : ''}${wk.earned ? ', Dragon Ball earned' : ''}</title>` +
         `<rect class="${wk.earned ? 'b-on' : 'b-off'}${wk.now ? ' b-now' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>` +
         `<text class="t-val" x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${wk.clean}</text>` +
         `<text class="t-hud" x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${wk.now ? 'NOW' : 'W' + wk.w}</text></g>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Clean days per week">${g}</svg>`;
}


// ---------- fighters (original silhouettes drawn for this app; viewBox 0 0 240 300)

const SIL = {
vegeta: `
<g class="sil">
 <path d="M98,108 L92,92 L82,88 L89,78 L79,64 L91,61 L84,42 L98,48 L95,24 L108,36 L110,8 L120,30 L127,-2 L133,28 L145,10 L144,40 L157,34 L151,56 L161,60 L152,75 L159,86 L146,91 L142,108
  C142,129 133,144 120,148 C107,144 98,129 98,108 Z"/>
 <path d="M109,136 L131,136 L133,166 L107,166 Z"/>
 <path d="M60,300 L62,186 C66,170 90,160 110,159 L130,159 C150,160 174,170 178,186 L180,300 Z"/>
 <path d="M28,170 C30,154 46,148 64,150 L88,156 C92,170 90,186 84,196 L44,200 C32,196 27,184 28,170 Z"/>
 <path d="M212,170 C210,154 194,148 176,150 L152,156 C148,170 150,186 156,196 L196,200 C208,196 213,184 212,170 Z"/>
 <path d="M40,226 C40,212 54,206 74,207 L166,207 C186,206 200,212 200,226 L200,238 C200,252 186,258 166,257 L74,257 C54,258 40,252 40,238 Z"/>
</g>
<g class="ln">
 <path d="M104,160 L120,182 L136,160"/>
 <path d="M100,104 L111,100 L120,92 L129,100 L140,104"/>
 <path d="M58,232 L182,232"/>
 <path d="M112,118 L118,121 M128,121 L134,118"/>
 <path d="M70,196 C88,204 152,204 170,196"/>
</g>`,
gohan: `
<g class="sil">
 <path d="M97,110 L68,102 L86,92 L56,78 L86,74 L68,50 L98,60 L96,30 L114,50 L124,20 L133,48 L152,26 L151,56 L176,48 L162,72 L188,74 L160,88 L180,100 L146,102 L143,110
  C143,130 134,145 120,149 C106,145 97,130 97,110 Z"/>
 <path d="M109,138 L131,138 L134,166 L106,166 Z"/>
 <path d="M34,300 L42,198 C46,176 76,164 106,161 L134,161 C164,164 194,176 198,198 L206,300 Z"/>
</g>
<g class="ln">
 <path d="M121,86 C117,96 113,108 112,124"/>
 <path d="M100,162 L120,204 L140,162"/>
 <path d="M112,119 L118,122 M126,122 L132,119"/>
 <path d="M48,250 L60,214 M192,250 L180,214"/>
 <path d="M76,300 L80,250 M164,300 L160,250"/>
</g>`,
trunks: `
<g class="sil">
 <g transform="rotate(-24 70 160)">
  <rect x="62" y="56" width="15" height="88" rx="3"/>
  <rect x="44" y="140" width="51" height="12" rx="3"/>
  <circle cx="69.5" cy="52" r="9"/>
  <rect x="64" y="150" width="11" height="60"/>
 </g>
 <path d="M97,108 L86,92 L92,84 L80,70 L95,69 L89,48 L106,57 L110,32 L122,50 L131,26 L136,51 L151,40 L149,63 L163,66 L152,82 L159,92 L143,108
  C143,129 134,144 120,148 C106,144 97,129 97,108 Z"/>
 <path d="M109,137 L131,137 L133,166 L107,166 Z"/>
 <path d="M46,300 L54,192 C60,174 84,164 106,161 L134,161 C156,164 180,174 186,192 L194,300 Z"/>
 <path d="M98,150 L108,176 L120,163 L132,176 L142,150 L136,146 L120,160 L104,146 Z"/>
</g>
<g class="ln">
 <path d="M70,182 L176,296" class="ln--strap"/>
 <path d="M110,180 L116,300 M130,180 L124,300"/>
 <path d="M112,118 L118,121 M127,121 L133,118"/>
 <path d="M120,40 L119,58"/>
</g>`
};
const FIGHTERS = {
  vegeta: { name: 'Vegeta', title: 'Prince of all Saiyans', kanji: '王', c: '#4D7BFF', c2: '#E8EEFF',
    charge: 'Galick Gun', move: 'Final Flash', beam: '#FFE45C',
    tiers: { 7: { name: 'Ultra Ego', jp: '我儘の極意', aura: '#A23CFF', aura2: '#F2C8FF', bolts: true } } },
  gohan: { name: 'Gohan', title: 'The scholar warrior', kanji: '飯', c: '#9B5CFF', c2: '#FFB347',
    charge: 'Masenko', move: 'Father-Son Kamehameha', beam: '#5FD0FF',
    tiers: { 5: { name: 'Ultimate', jp: 'アルティメット', aura: '#E6EBFF', aura2: '#FFFFFF' }, 7: { name: 'Beast', jp: 'ビースト', aura: '#B7A6FF', aura2: '#FFFFFF', bolts: true } } },
  trunks: { name: 'Trunks', title: 'Warrior from the future', kanji: '剣', c: '#B9A2FF', c2: '#7FD3FF',
    charge: 'Burning Attack', move: 'Shining Sword Attack', beam: '#FFC94A',
    tiers: { 4: { name: 'Super Saiyan Rage', jp: '超サイヤ人怒り', aura: '#FFD23F', aura2: '#BFF0FF', bolts: true } } }
};
const fighter = () => FIGHTERS[PW.fighter] || FIGHTERS.vegeta;
const formFor = i => i < 0 || i >= TIERS.length ? null : Object.assign({}, TIERS[i], (fighter().tiers || {})[i] || {});
const silSVG = (key, cls) => `<svg class="${cls}" viewBox="0 -6 240 306" aria-hidden="true" focusable="false">${SIL[key]}</svg>`;


// ---------- fighter art (the user's own images, kept on this device only — IndexedDB, never synced or committed)

const ArtDB = {
  p: null,
  open() {
    if (!this.p) this.p = new Promise((res, rej) => {
      try { const r = indexedDB.open('arc-art', 1); r.onupgradeneeded = () => r.result.createObjectStore('art'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
      catch (e) { rej(e); }
    });
    return this.p;
  },
  async run(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('art', mode), req = fn(tx.objectStore('art')); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); }); },
  get(k) { return this.run('readonly', st => st.get(k)); },
  put(k, v) { return this.run('readwrite', st => st.put(v, k)); },
  del(k) { return this.run('readwrite', st => st.delete(k)); }
};
const CAST = {
  goku:    { name: 'Goku', c: '#FF8A1E', k: '悟', title: 'Raised by Grandpa Gohan, trained by everyone' },
  vegeta:  { name: 'Vegeta', c: '#4D7BFF', k: '王', title: 'Prince of all Saiyans' },
  gohan:   { name: 'Gohan', c: '#9B5CFF', k: '飯', title: 'The scholar warrior' },
  trunks:  { name: 'Trunks', c: '#B9A2FF', k: '剣', title: 'Warrior from the future' },
  piccolo: { name: 'Piccolo', c: '#4FB04A', k: '魔', title: 'The mentor' },
  krillin: { name: 'Krillin', c: '#FFB347', k: '亀', title: 'Strongest human' },
  roshi:   { name: 'Master Roshi', c: '#E8C547', k: '仙', title: 'The turtle hermit' },
  whis:    { name: 'Whis', c: '#5FD0FF', k: '天', title: 'Angel attendant' },
  frieza:  { name: 'Frieza', c: '#C77DFF', k: '冷', title: 'Emperor of the universe' }
};
let LINKS = {};
function mergeLinks() {
  const before = JSON.stringify(LINKS);
  let sheet = {};
  try { const v = (S.config || {}).cast_links; sheet = typeof v === 'string' && v.trim() ? JSON.parse(v) : (v && typeof v === 'object' ? v : {}); } catch (e) {}
  LINKS = Object.assign({}, sheet, lsGet('arc.castLinks', {}) || {});
  if (PW.ready && JSON.stringify(LINKS) !== before) { applyFighter(); renderCast(); }
}
/** A picture for a cast member: this device's photo first, then a synced link. */
function artFor(k) {
  if (ART[k]) return ART[k];
  if (LINKS[k]) return { url: LINKS[k], cut: !!((lsGet('arc.castCut', {}) || {})[k]), link: true };
  return null;
}
const emblem = (k, cls = '') => `<span class="emblem ${cls} pw-jp" style="--c:${(CAST[k] || {}).c || '#FFD23F'}" aria-hidden="true">${(CAST[k] || {}).k || '?'}</span>`;
const ART_STATE = {};   // cast key -> 'ok' | 'failed', for the status shown in The cast
const artImg = (k, cls) => { const a = artFor(k); return a ? `<img class="${cls} ${a.cut ? 'is-cut' : 'is-boxed'}" src="${esc(a.url)}" alt="" draggable="false" referrerpolicy="no-referrer" data-k="${k}" onload="artLoaded(this)" onerror="artFailed(this)">` : ''; };
/** A picture loaded: note it so The cast can say so. */
function artLoaded(img) { ART_STATE[img.dataset.k] = 'ok'; castStatusFor(img.dataset.k); }
/** A picture failed: retry once with a normal referrer (some image hosts insist on one), then fall back to the emblem. */
function artFailed(img) {
  const k = img.dataset.k;
  if (!img.dataset.retried) { img.dataset.retried = '1'; img.referrerPolicy = 'strict-origin-when-cross-origin'; img.src = img.src.split('#')[0] + '#r'; return; }
  ART_STATE[k] = 'failed';
  const span = document.createElement('span'); span.innerHTML = emblem(k); img.replaceWith(span.firstChild || span);
  castStatusFor(k);
}
function castStatusFor(k) {
  const el = document.querySelector(`.cast__src[data-k="${k}"]`); if (!el) return;
  const a = artFor(k); if (!a) { el.textContent = 'no picture yet'; return; }
  const st = ART_STATE[k], src = a.link ? 'link' : 'photo';
  el.textContent = st === 'ok' ? `${src} · showing` : st === 'failed' ? `${src} · couldn't load, tap Link to replace` : `${src} · loading…`;
  el.classList.toggle('is-bad', st === 'failed');
}

function probeCut(url) {
  return new Promise(res => {
    const i = new Image(); i.crossOrigin = 'anonymous'; i.referrerPolicy = 'no-referrer';
    i.onload = () => {
      try {
        const w = 120, hh = Math.max(1, Math.round(120 * i.naturalHeight / i.naturalWidth)), cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
        const cx = cv.getContext('2d'); cx.drawImage(i, 0, 0, w, hh); const d = cx.getImageData(0, 0, w, hh).data;
        let clear = 0, tot = 0; const pr = (x, y) => { tot++; if (d[(y * w + x) * 4 + 3] < 200) clear++; };
        for (let x = 0; x < w; x += 3) { pr(x, 0); pr(x, hh - 1); } for (let y = 0; y < hh; y += 3) { pr(0, y); pr(w - 1, y); }
        res(clear / tot > 0.3);
      } catch (e) { res(false); }
    };
    i.onerror = () => res(false);
    i.src = url;
  });
}
async function saveLink(k, url) {
  url = (url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) throw new Error('Paste the full link, starting with https://');
  if (url) await new Promise((res, rej) => { const i = new Image(); i.referrerPolicy = 'no-referrer'; i.onload = res; i.onerror = () => rej(new Error('That link did not open as an image. Use the address of the image itself (right-click or long-press it, then copy image address).')); i.src = url; });
  const cut = url ? await probeCut(url) : false;
  const local = lsGet('arc.castLinks', {}) || {}; local[k] = url; lsSet('arc.castLinks', local);
  const cuts = lsGet('arc.castCut', {}) || {}; cuts[k] = cut; lsSet('arc.castCut', cuts);
  mergeLinks();
  if (apiUrl()) { const out = {}; Object.keys(LINKS).forEach(x => { if (LINKS[x]) out[x] = LINKS[x]; }); apiFetch('POST', { action: 'config', config: { cast_links: JSON.stringify(out) } }).catch(() => {}); }
  return cut;
}

const ART = {};   // cast member -> { url, cut } from this device

async function loadArt() {
  mergeLinks();
  for (const k of Object.keys(CAST)) {
    try { const v = await ArtDB.get(k); if (v && v.blob) ART[k] = { url: URL.createObjectURL(v.blob), cut: !!v.cut }; } catch (e) { /* no IndexedDB: silhouettes stay */ }
  }
  applyFighter(); renderCast();
}

function readImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { res(img); URL.revokeObjectURL(url); };
    img.onerror = () => { rej(new Error('That file isn\'t an image this browser can open. Try a PNG or JPEG.')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** Downscale to ≤1400 px, detect a transparent background, store as PNG (cut-out) or JPEG (photo). */
async function ingestArt(key, file) {
  const img = await readImage(file);
  const sc = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * sc)), hgt = Math.max(1, Math.round(img.naturalHeight * sc));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, hgt);
  let clear = 0, total = 0;
  try {
    const d = cx.getImageData(0, 0, w, hgt).data, step = Math.max(1, Math.floor(Math.min(w, hgt) / 60));
    const probe = (x, y) => { total++; if (d[(y * w + x) * 4 + 3] < 200) clear++; };
    for (let x = 0; x < w; x += step) { probe(x, 0); probe(x, hgt - 1); }
    for (let y = 0; y < hgt; y += step) { probe(0, y); probe(w - 1, y); }
  } catch (e) { /* tainted canvas can't happen for a local file; treat as photo */ }
  const cut = total > 0 && clear / total > 0.3;
  const blob = await new Promise(r => cv.toBlob(r, cut ? 'image/png' : 'image/jpeg', 0.9));
  if (!blob) throw new Error('Could not process that image.');
  await ArtDB.put(key, { blob, cut, added: new Date().toISOString() });
  if (ART[key]) URL.revokeObjectURL(ART[key].url);
  ART[key] = { url: URL.createObjectURL(blob), cut };
  return cut;
}
async function removeArt(key) {
  try { await ArtDB.del(key); } catch (e) {}
  if (ART[key]) { URL.revokeObjectURL(ART[key].url); delete ART[key]; }
}
const figure = (key, cls) => artFor(key) ? artImg(key, `${cls} pw-art`) : silSVG(key, cls);

function renderCast() {
  const g = $('#cast-grid'); if (!g) return;
  mergeLinks();
  g.innerHTML = Object.keys(CAST).map(k => { const c = CAST[k], a = artFor(k);
    return `<div class="cast__c" style="--c:${c.c}"><div class="cast__pic">${a ? artImg(k, 'cast__img') : emblem(k)}</div>` +
      `<div class="cast__n">${esc(c.name)}</div><div class="cast__src" data-k="${k}">${a ? (a.link ? 'link · loading…' : 'photo · loading…') : 'no picture yet'}</div>` +
      `<div class="cast__b"><button type="button" data-act="photo" data-k="${k}">Photo</button><button type="button" data-act="link" data-k="${k}">Link</button>` +
      (a ? `<button type="button" data-act="del" data-k="${k}" aria-label="Remove ${esc(c.name)} picture">✕</button>` : '') + `</div></div>`; }).join('');
  Object.keys(CAST).forEach(castStatusFor);
  renderCastDiag();
}
/** What this device has received, so a missing-pictures screenshot says why. Also refreshed on every sync. */
function renderCastDiag() {
  const diag = $('#cast-diag'); if (!diag || typeof LINKS === 'undefined') return;
  const linked = Object.keys(LINKS).filter(k => LINKS[k]).length, photos = Object.keys(ART).length, last = lsGet(LS.pull, '');
  const keyProblem = syncErr === KEY_ERR || (!syncKey() && apiUrl());
  diag.classList.toggle('is-bad', !!(syncErr || keyProblem || !apiUrl()));
  diag.textContent = `This device: app ${BUILD} · ${linked} picture link${linked === 1 ? '' : 's'} from your sheet · ${photos} photo${photos === 1 ? '' : 's'} stored here · ` +
    (!apiUrl() ? 'sheet not connected: open Log → Sync' : keyProblem ? 'sync key missing or wrong: open Log → Sync, paste the key, tap Test' :
     syncErr ? `sync problem: ${syncErr}` : last ? `last synced ${new Date(last).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'not synced yet');
}

function applyFighter() {
  const f = fighter(), root = $('#view-power');
  root.style.setProperty('--pw-acc', f.c); root.style.setProperty('--pw-acc2', f.c2); root.style.setProperty('--beam', f.beam);
  $('#pw-kanji').textContent = f.kanji;
  if (typeof renderCoach === 'function' && $('#coach')) renderCoach();
  const others = Object.keys(FIGHTERS).filter(k => k !== PW.fighter);
  $('#pw-cast').innerHTML = figure(others[0], 'pw-f pw-f--l') + figure(others[1], 'pw-f pw-f--r') + figure(PW.fighter, 'pw-f pw-f--main');
  $('#pw-roster').innerHTML = Object.keys(FIGHTERS).map(k => { const x = FIGHTERS[k];
    return `<button type="button" class="pw-card" data-f="${k}" aria-pressed="${k === PW.fighter}" style="--c:${x.c}">` +
      figure(k, 'pw-card__art') + `<span class="pw-card__n">${x.name}</span><span class="pw-card__t">${esc(x.title)}</span>` +
      `<span class="pw-card__m">${esc(x.move)}</span></button>`; }).join('');
}

/** "Last time on The Arc..." built from the most recent logged day before today. */
function recapLine(today) {
  const k = cfg(), dn = dayNumber(today);
  if (dn < 1) return { e: 'Next time on The Arc…', b: `The training begins ${fmtShort(k.start)}. ${k.total} days. ${k.startW} lb to ${k.goal}. <b>Power up.</b>` };
  let prev = null;
  for (let d = addDays(today, -1); d >= k.start; d = addDays(d, -1)) if (S.days[d]) { prev = d; break; }
  if (!prev) return { e: 'Day 1 of The Arc…', b: `The scouter is watching. <b>Ten anchors stand between you and full power.</b>` };
  const day = S.days[prev], req = itemsFor(prev).filter(i => i.req), done = req.filter(i => day.checks[i.key]);
  const bits = [`${done.length} of ${req.length} anchors`];
  if (day.sleep_hours !== null) bits.push(`${day.sleep_hours} h of sleep`);
  Object.keys(day.lifts || {}).forEach(l => { const x = day.lifts[l]; if (x.weight > 0) bits.push(`${l.toLowerCase()} ${x.weight} × ${x.reps}`); });
  Object.keys(day.pages || {}).forEach(b => { if (day.pages[b] > 0) bits.push(`${day.pages[b]} pages of ${b}`); });
  if (day.weight_lb !== null) bits.push(`${day.weight_lb} lb on the scale`);
  const streakNow = powerReport(today).streak, miss = req.find(i => !day.checks[i.key]);
  const hook = isClean(prev)
    ? (streakNow > 1 ? `The streak stands at ${streakNow}. Can it survive day ${dn}?` : `A clean day. Can you stack another on day ${dn}?`)
    : `${ANCHOR_LABEL[miss.key] || miss.title} slipped. Will day ${dn} be different?`;
  return { e: 'Last time on The Arc…', b: `Day ${dayNumber(prev)}: ${esc(bits.join(', '))}. <b>${esc(hook)}</b>` };
}

function fireBeam() {
  const f = fighter(), fx = h('div', { class: 'pw-beam', style: `--beam:${f.beam}`, 'aria-hidden': 'true' }, h('i'), h('b', {}, f.move + '!'));
  document.body.append(fx);
  const hero = $('#pw-hero'); hero.classList.remove('is-shake'); void hero.offsetWidth; hero.classList.add('is-shake');
  setTimeout(() => fx.remove(), 1500);
}


// ---------- sagas: painted backgrounds + theme, app-wide

const SAGAS = [
  { k: 'westcity', name: 'West City', sub: 'Capsule Corp', jp: '西の都', c: '#2B7FE0', c2: '#FFD23F', pos: '18% 62%', fx: 'wisps', fxc: '#FFFFFF' },
  { k: 'frieza', name: 'Frieza Saga', sub: 'Planet Namek', jp: 'フリーザ編', c: '#B57BFF', c2: '#7FE0B0', pos: '50% 60%', fx: 'motes', fxc: '#D8FFE9' },
  { k: 'cell', name: 'Cell Saga', sub: 'The Cell Games', jp: 'セル編', c: '#7BC74D', c2: '#FFD23F', pos: '50% 66%', fx: 'dust', fxc: '#F0D6A0' },
  { k: 'buu', name: 'Buu Saga', sub: 'Majin Buu', jp: '魔人ブウ編', c: '#FF6FB5', c2: '#FFB347', pos: '50% 55%', fx: 'smoke', fxc: '#FF9ACB' },
  { k: 'beerus', name: 'Beerus Saga', sub: 'Battle of Gods', jp: '破壊神ビルス編', c: '#9B6BFF', c2: '#FFD27A', pos: '55% 55%', fx: 'sparkle', fxc: '#FFE7A0' },
  { k: 'top', name: 'Tournament of Power', sub: 'The Null Realm', jp: '力の大会編', c: '#5FD0FF', c2: '#FF7AD9', pos: '50% 62%', fx: 'shards', fxc: '#E4F6FF' }
];
const sagaOf = k => SAGAS.find(s => s.k === k) || SAGAS[0];
const SG = { k: 'westcity', front: 'a' };

function applySaga(k, announce) {
  const s = sagaOf(k); SG.k = s.k; lsSet('arc.saga', s.k);
  const root = document.documentElement;
  root.dataset.saga = s.k;
  root.style.setProperty('--saga', s.c); root.style.setProperty('--saga2', s.c2);
  const url = `sagas/${s.k}.webp`;
  // crossfade the two background layers
  const next = SG.front === 'a' ? 'b' : 'a', el = $('#bg-' + next), old = $('#bg-' + SG.front);
  const show = () => { el.style.backgroundImage = `url("${url}")`; el.style.setProperty('--focus', s.pos); el.classList.add('is-on'); old.classList.remove('is-on'); SG.front = next; };
  const img = new Image(); img.onload = show; img.onerror = show; img.src = url;
  const hero = $('#pw-hero'); if (hero) hero.style.setProperty('--saga-img', `url("${url}")`);
  $('#saga-name').textContent = s.name; $('#saga-jp').textContent = s.jp;
  $('#pw-brand-t').textContent = `${s.name} · ${s.sub}`;
  $$('#saga-row .saga__opt').forEach(b => b.setAttribute('aria-checked', b.dataset.k === s.k ? 'true' : 'false'));
  Fx.theme(s);
  if (announce) sagaCard(s);
}
function renderSagaRow() {
  $('#saga-row').innerHTML = SAGAS.map(s => `<button type="button" class="saga__opt" role="radio" data-k="${s.k}" aria-checked="false" style="--c:${s.c}">` +
    `<span class="saga__thumb" style="background-image:url('sagas/${s.k}-thumb.webp')"></span><span class="saga__t">${esc(s.name)}</span></button>`).join('');
}
function sagaCard(s) {
  const card = $('#saga-card');
  $('#saga-card-jp').textContent = s.jp; $('#saga-card-name').textContent = s.name; $('#saga-card-sub').textContent = s.sub;
  card.style.setProperty('--c', s.c); card.style.setProperty('--c2', s.c2);
  card.classList.remove('is-on'); void card.offsetWidth; card.classList.add('is-on');
  clearTimeout(SG.cardT); SG.cardT = setTimeout(() => card.classList.remove('is-on'), REDUCE ? 900 : 1700);
}

/** Ambient particles drawn over the painting, one style per saga. */
const Fx = {
  on: false, ready: false, raf: 0, w: 0, h: 0, t: 0, ps: [], kind: 'wisps', col: '#FFFFFF',
  init() {
    this.cv = $('#bg-fx'); if (!this.cv || !this.cv.getContext) return;
    this.ctx = this.cv.getContext('2d'); this.ready = true;
    window.addEventListener('resize', () => this.size());
  },
  size() {
    if (!this.ready) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seed();
  },
  theme(s) { this.kind = s.fx; this.col = s.fxc; if (this.ready) { this.seed(); if (!this.on) this.draw(); } },
  count() { return { wisps: 7, motes: 36, dust: 46, smoke: 10, sparkle: 42, shards: 26 }[this.kind] || 20; },
  make(initial) {
    const w = this.w, h = this.h, r = Math.random, k = this.kind;
    const p = { x: r() * w, y: initial ? r() * h : h + 20, a: r() * 6.3, va: (r() - 0.5) * 0.02, life: 0, ph: r() * 6.3 };
    if (k === 'wisps') Object.assign(p, { y: h * (0.05 + r() * 0.4), vx: 0.12 + r() * 0.2, vy: 0, s: 60 + r() * 120, x: initial ? r() * w : -200 });
    if (k === 'motes') Object.assign(p, { vx: (r() - 0.5) * 0.2, vy: -(0.15 + r() * 0.4), s: 1.2 + r() * 2.4 });
    if (k === 'dust') Object.assign(p, { x: initial ? r() * w : -10, y: h * (0.35 + r() * 0.65), vx: 1.2 + r() * 2.2, vy: (r() - 0.4) * 0.4, s: 0.8 + r() * 1.8 });
    if (k === 'smoke') Object.assign(p, { vx: 0.15 + r() * 0.3, vy: -(0.1 + r() * 0.25), s: 50 + r() * 90 });
    if (k === 'sparkle') Object.assign(p, { y: initial ? r() * h : r() * h, vx: 0, vy: -(r() * 0.12), s: 0.8 + r() * 2.2 });
    if (k === 'shards') Object.assign(p, { vx: (r() - 0.5) * 0.3, vy: -(0.2 + r() * 0.6), s: 3 + r() * 7 });
    return p;
  },
  seed() { this.ps = []; for (let i = 0; i < this.count(); i++) this.ps.push(this.make(true)); },
  step() {
    this.t++;
    this.ps.forEach((p, i) => {
      p.x += p.vx + (this.kind === 'motes' ? Math.sin((this.t + i * 40) * 0.01) * 0.15 : 0); p.y += p.vy; p.a += p.va; p.life++;
      if (p.y < -150 || p.x > this.w + 220 || p.x < -260 || p.y > this.h + 160) this.ps[i] = this.make(false);
    });
  },
  draw() {
    const c = this.ctx, k = this.kind; if (!c) return;
    c.clearRect(0, 0, this.w, this.h);
    this.ps.forEach(p => {
      if (k === 'wisps' || k === 'smoke') {
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
        g.addColorStop(0, this.col + (k === 'smoke' ? '30' : '22')); g.addColorStop(1, this.col + '00');
        c.fillStyle = g; c.beginPath(); c.ellipse(p.x, p.y, p.s * (k === 'wisps' ? 1.8 : 1), p.s * 0.6, 0, 0, 7); c.fill();
      } else if (k === 'shards') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.globalAlpha = 0.75;
        c.fillStyle = this.col; c.beginPath(); c.moveTo(0, -p.s * 1.6); c.lineTo(p.s * 0.6, 0); c.lineTo(0, p.s * 1.6); c.lineTo(-p.s * 0.6, 0); c.closePath(); c.fill();
        c.fillStyle = 'rgba(160,120,255,0.5)'; c.beginPath(); c.moveTo(0, -p.s * 1.6); c.lineTo(p.s * 0.6, 0); c.lineTo(0, 0); c.closePath(); c.fill();
        c.restore(); c.globalAlpha = 1;
      } else {
        const tw = k === 'sparkle' ? 0.25 + 0.75 * Math.abs(Math.sin(p.ph + this.t * 0.03)) : 0.8;
        c.globalAlpha = tw; c.fillStyle = this.col;
        c.beginPath(); c.arc(p.x, p.y, p.s, 0, 7); c.fill();
        if (k !== 'dust') { c.globalAlpha = tw * 0.25; c.beginPath(); c.arc(p.x, p.y, p.s * 3.2, 0, 7); c.fill(); }
        if (k === 'sparkle' && p.s > 2) { c.globalAlpha = tw * 0.6; c.fillRect(p.x - p.s * 3, p.y - 0.5, p.s * 6, 1); c.fillRect(p.x - 0.5, p.y - p.s * 3, 1, p.s * 6); }
        c.globalAlpha = 1;
      }
    });
  },
  start() {
    if (!this.ready) this.init(); if (!this.ready) return;
    if (!this.w) this.size();
    if (REDUCE || this.on) { this.draw(); return; }
    this.on = true;
    const loop = () => { if (!this.on) return; this.step(); this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  },
  stop() { this.on = false; cancelAnimationFrame(this.raf); }
};

// ---------- ki aura (canvas)

const Aura = {
  on: false, ready: false, raf: 0, parts: [], bolts: [], rocks: [], w: 0, h: 0, c1: '#8FB8FF', c2: '#EAF2FF', boltsOn: false, power: 1,
  init() {
    this.cv = $('#pw-aura');
    if (!this.cv || !this.cv.getContext) return;
    this.ctx = this.cv.getContext('2d'); this.ready = true; this.makeSprite();
    if ('ResizeObserver' in window) new ResizeObserver(() => this.size()).observe($('#pw-hero'));
  },
  size() {
    const r = $('#pw-hero').getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.on) this.still();
  },
  makeSprite() {
    const s = document.createElement('canvas'); s.width = s.height = 64;
    const g = s.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, this.c2); gr.addColorStop(0.18, this.c1); gr.addColorStop(0.55, this.c1 + '66'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); this.sprite = s;
  },
  style(tier, idx) {
    const changed = tier.aura !== this.c1 || tier.aura2 !== this.c2;
    this.c1 = tier.aura; this.c2 = tier.aura2; this.boltsOn = !!tier.bolts; this.power = 0.75 + idx * 0.16;
    if (changed && this.ready) { this.makeSprite(); if (!this.on) this.still(); }
  },
  spawn() {
    const off = (Math.random() + Math.random()) - 1, spread = Math.min(this.w * 0.5, 340);
    this.parts.push({ x: this.w / 2 + off * spread * 0.8, y: this.h - 30 - Math.random() * this.h * 0.18, vx: -off * 0.2 + (Math.random() - 0.5) * 0.3,
      vy: -(1.3 + Math.random() * 2.3) * this.power, r: (14 + Math.random() * 26) * (1 - Math.abs(off) * 0.35), life: 0,
      max: (60 + Math.random() * 60) * (1.2 - Math.abs(off) * 0.55) * Math.min(1.6, this.h / 380) });
  },
  bolt() {
    const pts = [[this.w / 2 + (Math.random() - 0.5) * this.w * 0.7, this.h * (0.45 + Math.random() * 0.5)]];
    for (let i = 0; i < 6; i++) { const [x, y] = pts[pts.length - 1]; pts.push([x + (Math.random() - 0.5) * 30, y - 10 - Math.random() * 18]); }
    this.bolts.push({ pts, life: 7 });
  },
  step() {
    const n = Math.round(2 + 2 * this.power);
    for (let i = 0; i < n; i++) this.spawn();
    this.parts.forEach(p => { p.x += p.vx + Math.sin((p.life + p.x) * 0.06) * 0.4; p.y += p.vy; p.life++; });
    this.parts = this.parts.filter(p => p.life < p.max && p.y > -60);
    if (this.boltsOn && Math.random() < 0.06) this.bolt();
    if (Math.random() < 0.022 * this.power * Math.min(1.4, this.w / 600)) {
      const r = 3 + Math.random() * 9, pts = [];
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, rr = r * (0.6 + Math.random() * 0.5); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      this.rocks.push({ x: Math.random() * this.w, y: this.h - 30 - Math.random() * 30, vy: -(0.25 + Math.random() * 0.6) * this.power, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.04, pts });
    }
    this.rocks.forEach(o => { o.y += o.vy; o.a += o.va; }); this.rocks = this.rocks.filter(o => o.y > this.h * 0.3);
    this.bolts.forEach(b => b.life--); this.bolts = this.bolts.filter(b => b.life > 0);
  },
  draw() {
    const c = this.ctx; c.clearRect(0, 0, this.w, this.h); c.globalCompositeOperation = 'lighter';
    this.parts.forEach(p => {
      const t = p.life / p.max, r = p.r * (1 - t * 0.45);
      c.globalAlpha = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.34;
      c.drawImage(this.sprite, p.x - r * 0.7, p.y - r * 1.7, r * 1.4, r * 3.4);
    });
    this.bolts.forEach(b => {
      c.globalAlpha = b.life / 7; c.strokeStyle = this.c2; c.lineWidth = 2; c.shadowColor = this.c1; c.shadowBlur = 14;
      c.beginPath(); b.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.shadowBlur = 0;
    });
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#0B1026'; c.strokeStyle = this.c1; c.lineWidth = 1;
    this.rocks.forEach(o => {
      c.save(); c.translate(o.x, o.y); c.rotate(o.a); c.globalAlpha = Math.max(0, Math.min(1, (this.h - o.y) / 80, (o.y - this.h * 0.3) / (this.h * 0.25)));
      c.beginPath(); o.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); c.stroke(); c.restore();
    });
    c.globalAlpha = 1;
  },
  still() { if (!this.ready || !this.w) return; this.parts = []; this.bolts = []; this.rocks = []; for (let i = 0; i < 140; i++) this.step(); this.bolts = []; this.draw(); },
  start() {
    if (!this.ready) this.init(); if (!this.ready) return;
    this.size();
    if (REDUCE || this.on) return;
    this.on = true;
    const loop = () => { if (!this.on) return; this.step(); this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  },
  stop() { this.on = false; cancelAnimationFrame(this.raf); }
};

function countTo(to) {
  const el = $('#pw-power'), lens = $('#pw-lens-read'), from = PW.cur || 0;
  cancelAnimationFrame(PW.countRaf); clearTimeout(PW.countT);
  el.setAttribute('aria-label', 'Power level ' + fmtN(to));
  const land = () => { cancelAnimationFrame(PW.countRaf); PW.cur = PW.shown = to; el.textContent = fmtN(to); lens.textContent = abbr(to); revealStamp(to); };
  if (REDUCE || document.hidden || from === to) { land(); return; }
  const t0 = performance.now(), dur = from === 0 ? 1700 : 600;
  const tick = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
    PW.cur = Math.round(from + (to - from) * e);
    el.textContent = fmtN(PW.cur);
    lens.textContent = p < 1 ? String(Math.floor(Math.random() * 99999)).padStart(5, '0') : abbr(to);
    if (p < 1) PW.countRaf = requestAnimationFrame(tick); else { clearTimeout(PW.countT); land(); }
  };
  PW.countRaf = requestAnimationFrame(tick);
  PW.countT = setTimeout(land, dur + 400);   // frames can be paused (background tab); always land on the number
}
function revealStamp(p) {
  const st = $('#pw-stamp');
  st.hidden = p <= 9000;
  if (st.hidden || REDUCE) return;
  st.classList.remove('is-in'); void st.offsetWidth; st.classList.add('is-in');
  let seen = false; try { seen = sessionStorage.getItem('arc.9000') === '1'; sessionStorage.setItem('arc.9000', '1'); } catch (e) {}
  if (!seen) { const h = $('#pw-hero'); h.classList.remove('is-shake'); void h.offsetWidth; h.classList.add('is-shake'); }
}

// ---------- render

function renderPower() {
  if (view.tab !== 'power') return;
  const st = PW.sample ? (PW.sampleS || (PW.sampleS = sampleState())) : S;
  withState(st, () => drawPower(todayYMD()));
}

function drawPower(today) {
  const k = cfg(), rep = powerReport(today), ti = tierIndex(rep.total), tier = formFor(ti), next = formFor(ti + 1), f = fighter();
  const hero = $('#pw-hero'), dn = dayNumber(today);
  const rc = recapLine(today);
  $('#pw-recap').innerHTML = `<div class="pw-recap__e">${rc.e}</div><div class="pw-recap__b">${rc.b}</div>`;
  hero.style.setProperty('--aura', tier.aura); hero.style.setProperty('--aura2', tier.aura2);
  $('#view-power').style.setProperty('--tier', tier.aura); $('#view-power').style.setProperty('--tier2', tier.aura2);
  Aura.style(tier, ti);

  // hero
  $('#pw-hud').textContent = dn < 1 ? `Arc starts ${fmtShort(k.start)} · scouter calibrating`
    : dn > k.total ? `Arc complete · ${k.total} days` : `Target locked · day ${pad(dn, 3)} / ${k.total} · week ${weekOf(today)}`;
  countTo(rep.total);
  if (rep.total <= 9000) $('#pw-stamp').hidden = true;
  $('#pw-tier').textContent = tier.name;
  $('#pw-tierjp').textContent = tier.jp;
  if (next) {
    $('#pw-next-fill').style.width = ((rep.total - tier.min) / (next.min - tier.min) * 100).toFixed(1) + '%';
    $('#pw-next').innerHTML = `Next form · <b>${esc(next.name)}</b> at ${fmtN(next.min)} · ${fmtN(next.min - rep.total)} to go`;
  } else {
    $('#pw-next-fill').style.width = '100%';
    $('#pw-next').innerHTML = '<b>Final form.</b> Hold it to day 180.';
  }
  const req = itemsFor(today).filter(i => i.req), dayT = S.days[today];
  const doneT = req.filter(i => dayT && dayT.checks[i.key]).length, full = doneT === req.length;
  $('#pw-segs').innerHTML = req.map((_, i) => `<i class="pw-seg${i < doneT ? ' is-on' : ''}"></i>`).join('');
  $('#pw-charge-t').textContent = `${doneT}/${req.length}`;
  $('#pw-charge').classList.toggle('is-full', full);
  $('#pw-charge-k').textContent = `${f.charge} charge · today`;
  if (full) $('#pw-ready').innerHTML = `<button type="button" class="pw-fire" id="pw-fire">Fire ${esc(f.move)}</button>`;
  else $('#pw-ready').textContent = dn < 1 ? 'Charging starts on day 1' : `${req.length - doneT} anchor${req.length - doneT === 1 ? '' : 's'} to full charge`;

  // totals strip
  const arcSoFar = dn < 1 ? [] : arcDates(k.start, today < endDate() ? today : endDate());
  const clean = arcSoFar.filter(isClean).length;
  const w = weighIns(), lost = w.length > 1 ? w[0].w - w[w.length - 1].w : 0, cur = w.length ? w[w.length - 1].w : null;
  const pages = Object.keys(S.days).filter(d => d >= k.start).reduce((s, d) => s + sumPages(S.days[d]), 0);
  const finished = BOOKS.filter(b => Object.keys(S.days).reduce((s, d) => s + (S.days[d].pages[b.t] || 0), 0) >= b.p).length;
  $('#pw-stats').innerHTML = [
    [rep.streak, 'd', 'Streak', `Kaioken ×${rep.mult.toFixed(2)}${rep.best > rep.streak ? ` · best ${rep.best}` : ''}`],
    [clean, `/${arcSoFar.length || 0}`, 'Clean days', arcSoFar.length ? `${Math.round(clean / arcSoFar.length * 100)}% of the arc so far` : 'Starts day 1'],
    [lost > 0 ? lost.toFixed(1) : '0', 'lb', 'Gravity', cur !== null ? `${cur.toFixed(1)} lb now · ${Math.max(0, cur - k.goal).toFixed(1)} to ${k.goal}` : `${k.startW} → ${k.goal} lb`],
    [fmtN(pages), 'pp', 'Wisdom', `${finished} of ${BOOKS.length} books finished`]
  ].map(([v, u, kk, s]) => `<div class="pw-stat"><div class="pw-stat__v">${v}<small>${esc(u)}</small></div><div class="pw-stat__k">${kk}</div><div class="pw-stat__s">${esc(s)}</div></div>`).join('');

  // dragon balls
  const weeks = arcWeeks(today), earned = weeks.filter(x => x.earned).length;
  const summons = Math.floor(earned / 7), lit = earned === 0 ? 0 : earned - 7 * Math.floor((earned - 1) / 7);
  $('#pw-balls').innerHTML = [1, 2, 3, 4, 5, 6, 7].map(n => `<div class="pw-ball ${n <= lit ? 'is-on' : 'is-off'}">${ballSVG(n)}</div>`).join('');
  const nowWk = weeks.find(x => x.now);
  let note = `<b>${earned}</b> Dragon Ball${earned === 1 ? '' : 's'} earned over the arc. A week with six clean days earns one.`;
  if (nowWk) {
    const left = daysBetween(today, nowWk.we);
    note += nowWk.earned ? ` This week's ball is <b>already yours</b>.`
      : nowWk.clean + left + (isClean(today) ? 0 : 1) >= nowWk.need
        ? ` This week: <b>${nowWk.clean}</b> clean, need ${nowWk.need}, ${left + 1} day${left ? 's' : ''} left including today.`
        : ` This week's ball is out of reach. Set up next week.`;
  } else if (dn < 1) note = 'Dragon Balls start on day 1. A week with six clean days earns one; collect seven to summon the dragon.';
  $('#pw-balls-note').innerHTML = note + (summons ? `<div class="pw-wish">Shenron summoned ×${summons}. Make the wish count.</div>` : '');

  // scouter stats
  const stats = scouterStats(today);
  if (!stats) { $('#pw-radar').innerHTML = '<div class="pw-empty">Scouter calibrating · readings after day 1</div>'; $('#pw-radar-note').textContent = ''; }
  else {
    const info = stats.pop();
    $('#pw-radar').innerHTML = radarSVG(stats);
    $('#pw-radar-note').textContent = `Last ${info.days} day${info.days === 1 ? '' : 's'}. STR lift days and 1RM gain · SPD runs and steps · KI morning window, decompression, SATS · SENZU sleep, protein, rinse · DISC clean days, night close · WIS reading.`;
  }

  // battle log
  const started = weeks.filter(x => x.started).slice(-8);
  $('#pw-bars').innerHTML = started.length ? barsSVG(started) : '<div class="pw-empty">No battles yet · week 1 starts day 1</div>';

  // weak points
  const from14 = addDays(today, -14) > k.start ? addDays(today, -14) : k.start;
  const win = from14 <= addDays(today, -1) ? arcDates(from14, addDays(today, -1)) : [];
  if (!win.length) $('#pw-weak').innerHTML = '<div class="pw-empty">No openings found yet · check back after day 2</div>';
  else {
    const rows = req.map(it => ({ key: it.key, label: ANCHOR_LABEL[it.key] || it.title, p: Math.round(win.filter(d => S.days[d] && S.days[d].checks[it.key]).length / win.length * 100) }))
      .sort((a, b) => a.p - b.p);
    $('#pw-weak').innerHTML = rows.map((r, i) => {
      const col = r.p >= 85 ? 'var(--pw-scouter)' : r.p >= 60 ? 'var(--pw-ki)' : 'var(--pw-red)';
      return `<div class="pw-wrow"><span class="pw-wrow__n">${esc(r.label)}${i < 3 && r.p < 90 ? '<span class="pw-tag">Weak</span>' : ''}</span>` +
        `<span class="pw-wrow__b"><i style="width:${r.p}%;background:${col}"></i></span><span class="pw-wrow__p" style="color:${col}">${r.p}%</span></div>`;
    }).join('');
  }

  // time chamber
  $('#pw-chamber').innerHTML = weeks.map(x => {
    const cls = ['pw-wk', x.done ? 'is-done' : '', x.now ? 'is-now' : '', x.earned ? 'is-ball' : '', x.deload ? 'is-deload' : '', x.diet ? 'is-diet' : ''].join(' ');
    return `<div class="${cls}" title="Week ${x.w} · ${fmtShort(x.ws)}${x.deload ? ' · deload' : ''}${x.diet ? ' · diet break' : ''}">${x.w}</div>`;
  }).join('');
  const nd = weeks.find(x => x.deload && x.ws > today), nb = weeks.find(x => x.diet && x.ws > today);
  const parts = [];
  if (dn < 1) parts.push(`The chamber opens <b>${fmtShort(k.start)}</b>. ${k.total} days, ${weeks.length} weeks.`);
  else parts.push(`<b>${Math.max(0, k.total - dn)}</b> days left in the chamber.`);
  if (nd) parts.push(`Next deload: week ${nd.w}, ${fmtShort(nd.ws)} (in ${daysBetween(today, nd.ws)} days).`);
  if (nb) parts.push(`Next diet break: week ${nb.w}, ${fmtShort(nb.ws)}.`);
  $('#pw-chamber-note').innerHTML = parts.join(' ');

  // power sources
  const srcRows = [['Base', 1000], ['Discipline', rep.src.discipline], ['Training', rep.src.training], ['Strength', rep.src.strength],
    ['Wisdom', rep.src.wisdom], ['Gravity', rep.src.gravity], ['Penalties', rep.src.penalties]];
  const mx = Math.max(...srcRows.map(r => Math.abs(r[1])), 1);
  $('#pw-src').innerHTML = srcRows.map(([n, v]) => `<div class="pw-srow${v < 0 ? ' is-neg' : ''}"><span class="pw-srow__n">${n}</span>` +
    `<span class="pw-srow__b"><i style="width:${(Math.abs(v) / mx * 100).toFixed(1)}%"></i></span><span class="pw-srow__v">${v < 0 ? '−' : ''}${fmtN(Math.abs(v))}</span></div>`).join('');
}

/** A believable 72-day run ending today, for previewing the dashboard. Never saved or synced. */
function sampleState() {
  const today = todayYMD(), n = 72, start = addDays(today, -n);
  let seed = 20261019;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const base = { 'Back squat': 225, 'Bench press': 185, 'Deadlift': 275, 'Overhead press': 115 };
  const inc = { 'Back squat': 5, 'Bench press': 2.5, 'Deadlift': 10, 'Overhead press': 2.5 };
  const st = { days: {}, config: { start_date: start } };
  const read = BOOKS.map(() => 0);
  return withState(st, () => {
    for (let i = 0; i <= n; i++) {
      const d = addDays(start, i), ses = sessionFor(d), isToday = i === n, good = !isToday && rnd() < 0.72;
      const slip = { sats: 0.35, decompress: 0.45, protein: 0.6, night_close: 0.7 };
      const checks = {};
      itemsFor(d).forEach(it => { checks[it.key] = it.req ? (good || rnd() < (slip[it.key] ?? 0.85)) : rnd() < 0.72; });
      if (isToday) Object.keys(checks).forEach(key => { checks[key] = ['sleep', 'morning_window', 'gargle', 'breakfast', 'am_stack', 'deep_work', 'protein', 'steps', 'train'].includes(key); });
      const sleep = +(checks.sleep ? 7.5 + rnd() * 1.1 : 6.2 + rnd() * 1.2).toFixed(1);
      const steps = Math.round(checks.steps ? 8000 + rnd() * 4000 : 5000 + rnd() * 2900);
      const lifts = {};
      if (ses.main && checks.train) lifts[ses.main] = { weight: base[ses.main] + Math.floor(i / 7) * inc[ses.main], reps: 6 + Math.floor(rnd() * 3) };
      const pages = {};
      if (checks.read) { const b = read.findIndex((r, j) => r < BOOKS[j].p); if (b >= 0) { const p = Math.min(BOOKS[b].p - read[b], 9 + Math.floor(rnd() * 10)); read[b] += p; pages[BOOKS[b].t] = p; } }
      st.days[d] = normalizeDay({ date: d, sleep_hours: sleep, steps, weight_lb: i % 2 === 0 && !isToday ? +(225 - i * 0.17 + (rnd() - 0.5) * 1.3).toFixed(1) : null,
        alcohol_drinks: i === 30 ? 3 : rnd() < 0.04 ? 1 : 0, notes: '', checks, lifts, pages, updated_at: '' });
    }
    return st;
  });
}

function bindPower() {
  PW.fighter = FIGHTERS[lsGet('arc.fighter', 'vegeta')] ? lsGet('arc.fighter', 'vegeta') : 'vegeta';
  applyFighter();
  $('#pw-roster').addEventListener('click', e => {
    const b = e.target.closest('.pw-card'); if (!b || b.dataset.f === PW.fighter) return;
    PW.fighter = b.dataset.f; lsSet('arc.fighter', PW.fighter); applyFighter(); renderPower();
    toast(`${fighter().name} steps in`);
  });
  $('#pw-ready').addEventListener('click', e => { if (e.target.closest('#pw-fire')) fireBeam(); });
  let castKey = null;
  const castStatus = t => { $('#cast-status').textContent = t; };
  $('#cast-grid').addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    castKey = b.dataset.k; const name = CAST[castKey].name;
    if (b.dataset.act === 'photo') { $('#cast-link').hidden = true; $('#cast-file').click(); }
    if (b.dataset.act === 'link') { $('#cast-link').hidden = false; $('#cast-link-l').textContent = `Image link for ${name}`; $('#cast-url').value = LINKS[castKey] || ''; $('#cast-url').focus(); }
    if (b.dataset.act === 'del') {
      await removeArt(castKey); if (LINKS[castKey]) await saveLink(castKey, '');
      applyFighter(); renderCast(); renderCoach(); castStatus(`${name}'s picture removed.`);
    }
  });
  $('#cast-file').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file || !castKey) return;
    const name = CAST[castKey].name; castStatus(`Powering up ${name}…`);
    try { const cut = await ingestArt(castKey, file); applyFighter(); renderCast(); renderCoach(); castStatus(cut ? `${name} added as a cut-out.` : `${name} added. A transparent PNG blends into the aura best.`); }
    catch (err) { castStatus(err.message || 'Could not add that image.'); }
  });
  $('#cast-link').addEventListener('submit', async e => {
    e.preventDefault(); if (!castKey) return;
    const name = CAST[castKey].name; castStatus(`Checking ${name}'s link…`);
    try { await saveLink(castKey, $('#cast-url').value); $('#cast-link').hidden = true; applyFighter(); renderCast(); renderCoach(); castStatus(`${name} saved. The link syncs to your sheet, so your other devices get it too.`); }
    catch (err) { castStatus(err.message); }
  });
  $('#cast-cancel').addEventListener('click', () => { $('#cast-link').hidden = true; castStatus(''); });
  loadArt().then(() => { PW.ready = true; });
  renderSagaRow();
  $('#saga-row').addEventListener('click', e => { const b = e.target.closest('.saga__opt'); if (b && b.dataset.k !== SG.k) applySaga(b.dataset.k, true); });
  applySaga(lsGet('arc.saga', 'westcity'), false);
  Fx.start();
  $('#pw-sample').addEventListener('click', () => {
    PW.sample = !PW.sample;
    $('#pw-sample').setAttribute('aria-pressed', PW.sample ? 'true' : 'false');
    $('#pw-ribbon').hidden = !PW.sample;
    PW.shown = PW.cur = 0; renderPower();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Aura.stop(); Fx.stop(); } else { Fx.start(); if (view.tab === 'power') Aura.start(); } });
}

// ---------- coach: your fighter, bottom right, one lock-in a day

// Public-domain lines only (Long 1862/1890, Gummere 1917, Franklin, Durant 1926).
const QUOTES = [
  { t: 'start', q: 'In the morning when thou risest unwillingly, let this thought be present: I am rising to the work of a human being.', by: 'Marcus Aurelius, Meditations V.1' },
  { t: 'start', q: 'Begin at once to live, and count each separate day as a separate life.', by: 'Seneca, Letters CI' },
  { t: 'start', q: 'First say to yourself what you would be; and then do what you have to do.', by: 'Epictetus, Discourses III.23' },
  { t: 'sleep', q: 'Early to bed and early to rise, makes a man healthy, wealthy, and wise.', by: 'Benjamin Franklin, Poor Richard’s Almanack' },
  { t: 'sleep', q: 'Lost time is never found again.', by: 'Benjamin Franklin, Poor Richard’s Almanack' },
  { t: 'mind', q: 'Nowhere either with more quiet or more freedom from trouble does a man retire than into his own soul.', by: 'Marcus Aurelius, Meditations IV.3' },
  { t: 'mind', q: 'Confine thyself to the present.', by: 'Marcus Aurelius, Meditations VII.29' },
  { t: 'mind', q: 'We suffer more often in imagination than in reality.', by: 'Seneca, Letters XIII' },
  { t: 'mind', q: 'Such as are thy habitual thoughts, such also will be the character of thy mind; for the soul is dyed by the thoughts.', by: 'Marcus Aurelius, Meditations V.16' },
  { t: 'food', q: 'Eat to live, and not live to eat.', by: 'Benjamin Franklin, Poor Richard’s Almanack' },
  { t: 'food', q: 'Very little indeed is necessary for living a happy life.', by: 'Marcus Aurelius, Meditations VII.67' },
  { t: 'train', q: 'It is difficulties which show what men are.', by: 'Epictetus, Discourses I.24' },
  { t: 'train', q: 'Do every act of thy life as if it were the last.', by: 'Marcus Aurelius, Meditations II.5' },
  { t: 'read', q: 'If you would be a good reader, read; if a writer, write.', by: 'Epictetus, Discourses II.18' },
  { t: 'discipline', q: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', by: 'Will Durant, The Story of Philosophy' },
  { t: 'discipline', q: 'No longer talk at all about the kind of man that a good man ought to be, but be such.', by: 'Marcus Aurelius, Meditations X.16' },
  { t: 'discipline', q: 'While we are postponing, life speeds by.', by: 'Seneca, Letters I' },
  { t: 'rest', q: 'Very little indeed is necessary for living a happy life.', by: 'Marcus Aurelius, Meditations VII.67' },
  { t: 'review', q: 'Confine thyself to the present.', by: 'Marcus Aurelius, Meditations VII.29' }
];
// Original lines written in each fighter's voice. {x} is today's lock-in, lowercased.
const VOICE = {
  goku:    ['Hey, it\'s me, Goku! {X} first, then let\'s eat!', 'Ooh, {x}? That sounds like a great workout!', 'Gotta get stronger! Today we start with {x}.',
            'If I can push past my limits, you can push through {x}.', 'Chi-Chi says {x} comes first. She\'s scary when she\'s right.'],
  piccolo: ['Focus. {X}. Nothing else matters until it\'s done.', 'You call that discipline? Prove it with {x}.', 'I didn\'t train you to skip {x}.',
            'Quiet your mind. {X}. Then fight.', 'Weakness is a habit. Break it with {x}.'],
  krillin: ['Hey, I\'m just a human and even I can handle {x}!', 'No Dragon Balls needed for {x}, buddy.', 'Trust me, skipping {x} never ends well. Ask me how I know.',
            'Six dots on my forehead, one job for you: {x}.', 'I\'ve been knocked out more times than anyone. Still, {x}. Every day.'],
  roshi:   ['Work hard, rest well, eat plenty. Today that means {x}.', 'Even a turtle gets there. Steady on {x}.', 'Back in my day we delivered milk up mountains. You can manage {x}.',
            'Three hundred years of training taught me one thing: {x}, every single day.', 'Hohoho! {X} first. Then you may relax on the beach.'],
  whis:    ['Oh my, {x}? How delightful. Do try to keep up.', 'Mastery begins by not overthinking {x}.', 'Lord Beerus has destroyed planets for less than skipping {x}. Hohoho.',
            'A calm mind is a fast mind. {X}, please.', 'I\'ll be watching from the staff. {X}, if you would.'],
  frieza:  ['Oh, how adorable. You think you can skip {x}? Try it.', 'I\'ll allow you to live, provided you handle {x}.', 'Even my soldiers manage {x}. Don\'t disappoint me.',
            'Hohoho. {X}. Fail, and I\'ll be forced to transform.', 'You monkeys never learn. {X}, today, without excuses.'],
  vegeta: ['Hmph. {X}. Even a third-class warrior could manage that much.', 'A prince of all Saiyans doesn\'t skip {x}. Neither do you.',
           'Your power level is watching. Don\'t embarrass me over {x}.', 'Get {x} done and maybe I\'ll stop calling you Kakarot.', 'Pride is earned in the boring reps. Today that\'s {x}.'],
  gohan:  ['Study first, fight second. Today that means {x}.', 'You\'re stronger than you think. Just do {x} and see.',
           'My mom would make me do {x} before anything else. She\'d be right.', 'Piccolo trained me to finish the basics first. {X}, then the rest.', 'Lock in on {x}. Calm mind, full power.'],
  trunks: ['Where I\'m from, the ones who skipped {x} didn\'t make it. Don\'t skip it.', 'I came back from the future for one reason: {x}.',
           'Sword\'s sharp, plan\'s simple. {X}.', 'In my timeline nobody had a streak like yours. Protect it: {x}.', 'Mom built a time machine. You can manage {x}.']
};
const ANCHOR_X = { sleep: 'sleep', morning_window: 'the morning window', protein: 'your protein', steps: 'your steps', train: 'training', decompress: 'the decompression',
  read: 'your reading', night_close: 'the night close', rinse: 'the Pulmicort rinse', sats: 'SATS' };
const TOPIC = { sleep: 'sleep', morning_window: 'mind', sats: 'mind', decompress: 'mind', protein: 'food', breakfast: 'food', steps: 'train', walk: 'train',
  train: 'train', read: 'read', night_close: 'discipline', rinse: 'discipline' };

function dayIndex(date) { return Math.floor(parseYMD(date).getTime() / 86400000); }

/** Today's single focus, chosen from the data: slipped anchor, weakest anchor, sleep, pace, session, streak. */
function coachFocus(today) {
  const k = cfg(), dn = dayNumber(today), ses = sessionFor(today), B = bedMin(), W = wakeMin();
  const prev = addDays(today, -1);
  if (dn < 1) return { lock: 'Day 1 starts tomorrow', why: `Alarm at ${fmtT(W)}. Asleep by ${fmtT(B)} tonight so the sleep anchor counts from the first morning.`, t: 'start', x: 'an early night' };
  if (ses.type === 'rest') return { lock: 'Weekly review', why: 'Read the week in the Log tab, write one line for next week, then Sunday prep: two chickens, six sweet potatoes, a dozen eggs, a kilo of turkey.', t: 'review', x: 'the weekly review' };
  const reqPrev = dayNumber(prev) >= 1 ? itemsFor(prev).filter(i => i.req) : [];
  const pd = S.days[prev];
  if (pd && reqPrev.length) {
    const miss = reqPrev.find(i => !pd.checks[i.key]);
    if (miss) { const slot = scheduleFor(today).find(s => s.key === miss.key); return { lock: ANCHOR_LABEL[miss.key] || miss.title, why: `It slipped yesterday${slot ? `. Today it's at ${fmtT(slot.t)}` : ''}. One anchor is the difference between a clean day and a partial one.`, t: TOPIC[miss.key] || 'discipline', x: ANCHOR_X[miss.key] }; }
  }
  const from = addDays(today, -14) > k.start ? addDays(today, -14) : k.start, win = from <= prev ? arcDates(from, prev) : [];
  if (win.length >= 4) {
    const rows = itemsFor(today).filter(i => i.req).map(i => ({ i, p: win.filter(d => S.days[d] && S.days[d].checks[i.key]).length / win.length })).sort((a, b) => a.p - b.p);
    if (rows[0].p < 0.8) return { lock: ANCHOR_LABEL[rows[0].i.key] || rows[0].i.title, why: `${Math.round(rows[0].p * 100)}% over the last 14 days. It's the anchor holding the streak back.`, t: TOPIC[rows[0].i.key] || 'discipline', x: ANCHOR_X[rows[0].i.key] };
  }
  const sa = sleepAvg7(today);
  if (sa !== null && sa < 7) return { lock: 'Sleep', why: `7-day average is ${sa.toFixed(1)} h. Asleep by ${fmtT(B)} tonight; SATS starts ${fmtT(B - 20)}.`, t: 'sleep', x: 'sleep' };
  const ri = rateInfo();
  if (ri && ri.cls === 'bad') return { lock: 'Eat to the number', why: `Losing ${ri.pct.toFixed(1)}% a week. Faster than 1% costs muscle. Hit ${(isDiet(today) ? k.kcalBreak : k.kcal).toLocaleString()} kcal and ${k.protein} g protein.`, t: 'food', x: 'eating to the number' };
  if (isDiet(today)) return { lock: 'Maintenance calories', why: `Diet break: ${k.kcalBreak.toLocaleString()} kcal this week. Protein stays at ${k.protein} g.`, t: 'food', x: 'eating at maintenance' };
  if (ses.type === 'lift') {
    const hist = Object.keys(S.days).filter(d => d < today && S.days[d].lifts && S.days[d].lifts[ses.main]).sort();
    const last = hist.length ? S.days[hist[hist.length - 1]].lifts[ses.main] : null;
    if (isDeload(today)) return { lock: `${ses.name}, deload`, why: 'Same loads, half the sets. Leave the gym wanting more.', t: 'rest', x: 'the deload' };
    return { lock: `${ses.main} top set`, why: last ? `Last time ${last.weight} × ${last.reps} (est. 1RM ${Math.round(epley(last.weight, last.reps))}). Beat it by one rep.` : `${ses.name} at ${ses.time}. Log the top set after.`, t: 'train', x: `the ${ses.main.toLowerCase()} top set` };
  }
  if (ses.type === 'run') return { lock: ses.name, why: `${ses.sub}. Conversational pace; the work is showing up.`, t: 'train', x: `the ${ses.name.toLowerCase()}` };
  const st = powerReport(today).streak;
  return { lock: 'Keep the streak', why: st ? `${st} clean day${st === 1 ? '' : 's'} in a row. Ten anchors, no exceptions.` : 'Ten anchors today. Start a streak.', t: 'discipline', x: 'the streak' };
}
function coachOfDay(today) {
  const all = Object.keys(CAST), withArt = all.filter(k => artFor(k)), pool = withArt.length ? withArt : all;
  return pool[dayIndex(today) % pool.length];
}
function coachMessage(today) {
  const key = coachOfDay(today), f = CAST[key], idx = dayIndex(today);
  const focus = coachFocus(today);
  const pool = QUOTES.filter(q => q.t === focus.t), qt = (pool.length ? pool : QUOTES)[idx % (pool.length || QUOTES.length)];
  const lines = VOICE[key], x = focus.x || focus.lock.toLowerCase(), X = x.charAt(0).toUpperCase() + x.slice(1);
  const line = lines[idx % lines.length].replace('{x}', x).replace('{X}', X);
  return { f, focus, qt, line };
}

const faceHTML = key => artFor(key) ? artImg(key, 'coach__img') : emblem(key, 'emblem--face');

function renderCoach() {
  const el = $('#coach'); if (!el) return;
  mergeLinks();
  const today = todayYMD(), m = coachMessage(today), key = coachOfDay(today), seen = lsGet('arc.coach', '') === today;
  el.style.setProperty('--c', m.f.c);
  $('#coach-face').innerHTML = faceHTML(key) + (seen ? '' : '<span class="coach__dot" aria-hidden="true">!</span>');
  $('#coach-pic').innerHTML = artFor(key) ? artImg(key, 'coach__big') : emblem(key, 'emblem--big') +
    `<button type="button" class="coach__add" data-k="${key}">Add a picture of ${esc(m.f.name)}</button>`;
  $('#coach-title').textContent = m.f.title;
  $('#coach-face').setAttribute('aria-label', `${m.f.name}'s message for today${seen ? '' : ', new'}`);
  $('#coach-who').textContent = m.f.name;
  $('#coach-day').textContent = dayNumber(today) >= 1 ? `Day ${pad(dayNumber(today), 3)}` : 'Day 0';
  $('#coach-lock').textContent = m.focus.lock;
  $('#coach-why').textContent = m.focus.why;
  $('#coach-q').textContent = '“' + m.qt.q + '”';
  $('#coach-by').textContent = m.qt.by;
  $('#coach-line').textContent = m.line;
  $('#coach-foot').textContent = `Wake ${fmtT(wakeMin())} · asleep by ${fmtT(bedMin())}`;
}
function coachOpen(open) {
  const el = $('#coach'); el.classList.toggle('is-open', open);
  $('#coach-face').setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) { lsSet('arc.coach', todayYMD()); renderCoach(); }
}
function bindCoach() {
  $('#coach-face').addEventListener('click', () => coachOpen(!$('#coach').classList.contains('is-open')));
  $('#coach-ok').addEventListener('click', () => coachOpen(false));
  $('#coach-x').addEventListener('click', () => coachOpen(false));
  $('#coach-pic').addEventListener('click', e => {
    if (!e.target.closest('.coach__add')) return;
    coachOpen(false); showTab('power');
    setTimeout(() => { const p = $('.pw-castp'); if (p) p.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' }); }, 80);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') coachOpen(false); });
  renderCoach();
  if (lsGet('arc.coach', '') !== todayYMD()) setTimeout(() => coachOpen(true), 1400);
}

// ================================================================== BOOT

RENDERERS.push(renderLog, renderReading, renderPower, renderCoach, renderCast);
bootCore();
bindLog();
bindNext();
bindPower();
bindCoach();
if (location.hash === '#power') showTab('power');
render();
pull(true);
scheduleFlush(300);
