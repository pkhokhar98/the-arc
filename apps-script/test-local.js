// Local harness: runs Code.gs against an in-memory stub of the Apps Script runtime.
//   node apps-script/test-local.js
// It is a logic check only; the real deploy is still tested with curl (see README).
const fs = require('fs'); const vm = require('vm'); const path = require('path');

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.cell(this.r + i, this.c + j)); out.push(row); } return out; }
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v))); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, ''); return this; }
  setFontWeight() { return this; } setNumberFormat() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  cell(r, c) { const row = this.rows[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; }
  set(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getLastRow() { let last = 0; this.rows.forEach((row, i) => { if (row.some(v => v !== '' && v !== null && v !== undefined)) last = i + 1; }); return last; }
  getMaxRows() { return Math.max(1000, this.rows.length); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  setFrozenRows() {}
}
class Spreadsheet {
  constructor() { this.sheets = [new Sheet('Sheet1')]; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  getId() { return 'local-id'; } getUrl() { return 'https://docs.google.com/spreadsheets/d/local-id'; }
}
const ss = new Spreadsheet();
const props = {};
const sandbox = {
  SpreadsheetApp: { getActiveSpreadsheet: () => null, openById: () => ss, create: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ _s: s, setMimeType() { return this; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ScriptApp: { WeekDay: { SUNDAY: 'SUNDAY' }, getProjectTriggers: () => [], newTrigger: () => ({ timeBased() { return this; }, onWeekDay() { return this; }, atHour() { return this; }, inTimezone() { return this; }, create() { sandbox._trig = true; } }) },
  Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
  Logger: { log: console.log },
  console,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), sandbox);
const get = (q) => JSON.parse(sandbox.doGet({ parameter: q })._s);
const post = (b) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(b) } })._s);
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

sandbox.setup();
assert(Object.keys(sandbox.TABS).every(n => ss.getSheetByName(n)), 'setup created every tab');
assert(ss.getSheetByName('Config').getLastRow() === 12, 'config seeded (11 keys)');
assert(sandbox._trig, 'weekly trigger installed');
assert(get({ action: 'ping' }).ok, 'ping');

const checklist = [
  { key: 'sleep', label: '7.5 hours minimum', group: 'SLEEP', required: true, done: true },
  { key: 'morning_window', label: 'Morning window, 20 min', group: 'ON WAKING', required: true, done: true },
  { key: 'gargle', label: 'Gargle 60 seconds', group: 'ON WAKING', required: false, done: false },
  { key: 'protein', label: '210 g protein', group: 'DAY', required: true, done: true },
];
const r1 = post({ action: 'day', day: { date: '2026-10-19', sleep_hours: 7.8, weight_lb: 225, steps: 9000, session: 'Lower A', trained: true, nicotine: false, alcohol_drinks: 0, notes: 'day one', updated_at: '2026-10-19T20:00:00.000Z', checklist, lifts: [{ exercise: 'Back squat', weight: 225, reps: 8 }], reading: [{ book: 'Meditations', pages: 12 }] } });
assert(r1.ok && r1.dates[0] === '2026-10-19', 'day upsert');
let L = get({ action: 'load' });
assert(L.days['2026-10-19'].checks.protein === true && L.days['2026-10-19'].checks.gargle === false, 'checklist round-trips');
assert(L.days['2026-10-19'].lifts['Back squat'].est_1rm === 285, 'Epley 1RM 225x8 = 285');
assert(L.days['2026-10-19'].pages['Meditations'] === 12, 'reading round-trips');
assert(ss.getSheetByName('Daily').cell(2, 10) === 3 && ss.getSheetByName('Daily').cell(2, 11) === 3 && ss.getSheetByName('Daily').cell(2, 12) === true, 'anchors 3/3, clean_day true');

// stale write is ignored, newer write wins
post({ action: 'day', day: { date: '2026-10-19', sleep_hours: 1, updated_at: '2026-10-19T10:00:00.000Z', checklist } });
assert(get({ action: 'load' }).days['2026-10-19'].sleep_hours === 7.8, 'stale write ignored');
post({ action: 'day', day: { date: '2026-10-19', sleep_hours: 6.9, steps: 9000, weight_lb: 225, updated_at: '2026-10-20T10:00:00.000Z', checklist: checklist.map(c => ({ ...c, done: c.key !== 'protein' })) } });
L = get({ action: 'load' });
assert(L.days['2026-10-19'].sleep_hours === 6.9 && ss.getSheetByName('Daily').cell(2, 12) === false, 'newer write wins, clean_day flips false');
assert(ss.getSheetByName('Daily').getLastRow() === 2, 'still one Daily row for the date');
assert(ss.getSheetByName('Checklist').getLastRow() === 5, 'checklist rows replaced, not duplicated');

// batch + cumulative pages + rollup
const ops = [];
for (let d = 20; d <= 31; d++) ops.push({ day: { date: `2026-10-${d}`, sleep_hours: 7 + (d % 3) * 0.5, weight_lb: 225 - (d - 19) * 0.3, trained: d % 7 !== 6, nicotine: d === 25, alcohol_drinks: d === 24 ? 2 : 0, updated_at: new Date().toISOString(), checklist: checklist.map(c => ({ ...c, done: d % 4 !== 0 })), reading: [{ book: 'Meditations', pages: 10 }], lifts: d % 7 === 1 ? [{ exercise: 'Back squat', weight: 230 - (d > 25 ? 20 : 0), reps: 6 }] : [] } });
const rb = post({ action: 'batch', ops });
assert(rb.ok && rb.dates.length === 12, 'batch of 12 days');
const reading = ss.getSheetByName('Reading').rows.slice(1);
assert(reading[reading.length - 1][3] === 132, 'cumulative pages 12 + 12*10 = 132');
const W = get({ action: 'rollup' }).weekly;
assert(W.length === 2 && W[0].week === 1 && W[1].week === 2, 'two weekly rows');
assert(W[0].training_sessions === 5, 'week 1 training sessions = 5 (day 19 rewritten without trained)');
assert(W[1].weight_change < 0 && W[1].pct_bodyweight_per_week < 0, 'weight change negative in week 2');
assert(W[0].total_pages === 72, 'week 1 pages 12 + 6*10 = 72');
assert(W[0].nicotine_days === 1 && W[0].alcohol_drinks === 2 && W[1].nicotine_days === 0, 'nicotine/alcohol counted in week 1');
const rc = post({ action: 'config', config: { goal_weight: 190 } });
assert(rc.ok && rc.config.goal_weight === 190, 'config update');
console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nall checks passed');
