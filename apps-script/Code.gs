/**
 * The Arc — 180-day tracker backend.
 * Google Apps Script web app. Deploy: Execute as me / Anyone with the link.
 *
 * One-time: run setup() from the editor. It creates the "Arc 180" spreadsheet
 * (or adopts the bound one), builds every tab, seeds Config, and installs the
 * Sunday-night weekly rollup trigger.
 *
 * HTTP API (all responses are JSON):
 *   GET  ?action=ping                 -> { ok, version, time }
 *   GET  ?action=load                 -> { ok, config, days, weekly, books }
 *   GET  ?action=rollup               -> runs weeklyRollup(), returns rows
 *   POST {action:"day",   day:{...}}  -> upsert one day (Daily/Checklist/Lifts/Reading)
 *   POST {action:"batch", ops:[{day:{...}}, ...]}  -> upsert many (offline queue flush)
 *   POST {action:"config", config:{key:value}}     -> update Config keys
 *
 * POST bodies are sent as text/plain so the browser skips CORS preflight.
 */

var VERSION = '1.1.0';
var SHEET_NAME = 'Arc 180';
var PROP_ID = 'ARC_SPREADSHEET_ID';
var TZ = 'America/Vancouver';

var TABS = {
  Daily: ['date','day_number','week','sleep_hours','weight_lb','steps','protein_hit','session','trained','anchors_done','anchors_total','clean_day','alcohol_drinks','notes','updated_at'],
  Checklist: ['date','item_key','item_label','group','required','done'],
  Lifts: ['date','exercise','top_set_weight','reps','est_1rm'],
  Reading: ['date','book','pages_today','cumulative_pages'],
  Weekly: ['week','avg_sleep','avg_weight','weight_change','pct_bodyweight_per_week','clean_days','training_sessions','total_pages','alcohol_drinks','flags'],
  Config: ['key','value']
};

var DEFAULT_CONFIG = [
  ['start_date', '2026-10-19'],
  ['total_days', 180],
  ['goal_weight', 192],
  ['start_weight', 225],
  ['protein_target', 210],
  ['calorie_target', 2550],
  ['diet_break_calories', 3050],
  ['sleep_target', 7.5],
  ['step_target', 8000],
  ['deload_weeks', '6,12,18,24'],
  ['diet_break_weeks', '10,11,20,21']
];

var MAIN_LIFTS = ['Back squat', 'Bench press', 'Deadlift', 'Overhead press'];

// ---------------------------------------------------------------- spreadsheet

function getSS() {
  var bound = null;
  try { bound = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (bound) return bound;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_ID);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* fall through, recreate */ }
  }
  var ss = SpreadsheetApp.create(SHEET_NAME);
  props.setProperty(PROP_ID, ss.getId());
  return ss;
}

/**
 * Make every tab match TABS. Columns are matched by header NAME, so a column someone
 * deleted, moved or added by hand in the sheet is repaired instead of scrambling rows:
 * the data is re-read by name and rewritten in the expected order. Unknown columns
 * (e.g. the retired "nicotine") are dropped.
 */
function ensureTabs(ss) {
  var names = Object.keys(TABS);
  names.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var headers = TABS[name];
    var width = Math.max(sh.getLastColumn(), 1);
    var existing = sh.getLastRow() > 0 ? sh.getRange(1, 1, 1, width).getValues()[0] : [];
    while (existing.length && (existing[existing.length - 1] === '' || existing[existing.length - 1] === null)) existing.pop();
    var same = existing.length === headers.length && existing.every(function (h, i) { return h === headers[i]; });
    if (!same) {
      var rows = [];
      if (sh.getLastRow() > 1 && existing.length) {
        var data = sh.getRange(2, 1, sh.getLastRow() - 1, existing.length).getValues();
        rows = data.filter(function (r) { return r[0] !== '' && r[0] !== null; }).map(function (r) {
          var o = {}; existing.forEach(function (h, i) { if (h) o[String(h)] = r[i]; }); return o;
        });
      }
      sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), Math.max(width, headers.length)).clearContent();
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
      if (rows.length) {
        sh.getRange(2, 1, rows.length, headers.length).setValues(rows.map(function (o) {
          return headers.map(function (h) { var v = o[h]; return v === undefined || v === null ? '' : v; });
        }));
      }
    }
    // Keep date columns as plain text so Sheets never turns "2026-10-19" into a Date.
    if (headers[0] === 'date') sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), 1).setNumberFormat('@');
    if (name === 'Config') sh.getRange(1, 2, Math.max(sh.getMaxRows(), 2), 1).setNumberFormat('@');
  });
  // Drop the default "Sheet1" if it is empty and we have our tabs.
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > names.length) ss.deleteSheet(def);
  // Seed Config once.
  var cfg = ss.getSheetByName('Config');
  if (cfg.getLastRow() < 2) cfg.getRange(2, 1, DEFAULT_CONFIG.length, 2).setValues(DEFAULT_CONFIG);
}

/** Run this once from the editor. */
function setup() {
  var ss = getSS();
  ensureTabs(ss);
  installTriggers();
  Logger.log('Arc 180 ready: ' + ss.getUrl());
  return ss.getUrl();
}

function installTriggers() {
  var have = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'weeklyRollup'; });
  if (have) return;
  ScriptApp.newTrigger('weeklyRollup')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(21).inTimezone(TZ).create();
}

// ---------------------------------------------------------------- helpers

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fmtDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

function toBool(v) { return v === true || v === 'TRUE' || v === 'true' || v === 1; }
function num(v) { if (v === '' || v === null || v === undefined) return ''; var n = Number(v); return isNaN(n) ? '' : n; }

function todayStr() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

function parseDate(s) { var p = s.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12); }
function dayNumber(dateStr, startStr) {
  return Math.round((parseDate(dateStr) - parseDate(startStr)) / 86400000) + 1;
}

/** Read a tab into an array of objects keyed by header. */
function readTab(ss, name) {
  var sh = ss.getSheetByName(name);
  var headers = TABS[name];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return rows.filter(function (r) { return r[0] !== '' && r[0] !== null; }).map(function (r) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = (h === 'date') ? fmtDate(r[i]) : r[i]; });
    return o;
  });
}

/** Replace the whole body of a tab with these object rows. */
function writeTab(ss, name, objs) {
  var sh = ss.getSheetByName(name);
  var headers = TABS[name];
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), headers.length)).clearContent();
  if (!objs.length) return;
  var rows = objs.map(function (o) { return headers.map(function (h) { var v = o[h]; return v === undefined || v === null ? '' : v; }); });
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function getConfig(ss) {
  var cfg = {};
  readTab(ss, 'Config').forEach(function (r) { cfg[r.key] = (r.value instanceof Date) ? fmtDate(r.value) : r.value; });
  return cfg;
}

// ---------------------------------------------------------------- HTTP

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    switch (p.action || 'ping') {
      case 'ping': return json({ ok: true, version: VERSION, time: new Date().toISOString() });
      case 'load': return json(loadAll());
      case 'rollup': return json({ ok: true, weekly: weeklyRollup() });
      default: return json({ ok: false, error: 'unknown action ' + p.action });
    }
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json({ ok: false, error: 'bad json' }); }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var ss = getSS();
    ensureTabs(ss);
    var cfg = getConfig(ss);
    var res;
    switch (body.action) {
      case 'day':
        res = { ok: true, dates: [upsertDay(ss, cfg, body.day)] };
        break;
      case 'batch':
        var done = [];
        (body.ops || []).forEach(function (op) { if (op && op.day) done.push(upsertDay(ss, cfg, op.day)); });
        res = { ok: true, dates: done };
        break;
      case 'config':
        res = { ok: true, config: setConfig(ss, body.config || {}) };
        break;
      default:
        res = { ok: false, error: 'unknown action ' + body.action };
    }
    return json(res);
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ---------------------------------------------------------------- writes

/**
 * day = {
 *   date, sleep_hours, weight_lb, steps, session, trained, alcohol_drinks, notes, updated_at,
 *   checklist: [{key, label, group, required, done}],
 *   lifts: [{exercise, weight, reps}],
 *   reading: [{book, pages}]
 * }
 */
function upsertDay(ss, cfg, day) {
  var date = fmtDate(day.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad date ' + day.date);
  var start = cfg.start_date ? fmtDate(cfg.start_date) : '2026-10-19';
  var dn = dayNumber(date, start);
  var week = Math.ceil(dn / 7);

  var checklist = day.checklist || [];
  var required = checklist.filter(function (c) { return c.required; });
  var anchorsDone = required.filter(function (c) { return c.done; }).length;
  var proteinItem = checklist.filter(function (c) { return c.key === 'protein'; })[0];

  // Daily — last-writer-wins on updated_at.
  var daily = readTab(ss, 'Daily');
  var existing = daily.filter(function (r) { return r.date === date; })[0];
  var incomingTs = day.updated_at || new Date().toISOString();
  if (existing && existing.updated_at && String(existing.updated_at) > String(incomingTs)) {
    return date; // server copy is newer; keep it
  }
  var row = {
    date: date,
    day_number: dn,
    week: week,
    sleep_hours: num(day.sleep_hours),
    weight_lb: num(day.weight_lb),
    steps: num(day.steps),
    protein_hit: proteinItem ? !!proteinItem.done : false,
    session: day.session || '',
    trained: !!day.trained,
    anchors_done: anchorsDone,
    anchors_total: required.length,
    clean_day: required.length > 0 && anchorsDone === required.length,
    alcohol_drinks: num(day.alcohol_drinks) || 0,
    notes: day.notes || '',
    updated_at: incomingTs
  };
  var rest = daily.filter(function (r) { return r.date !== date; });
  rest.push(row);
  rest.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  writeTab(ss, 'Daily', rest);

  // Checklist — one row per item per day.
  if (checklist.length) {
    var cl = readTab(ss, 'Checklist').filter(function (r) { return r.date !== date; });
    checklist.forEach(function (c) {
      cl.push({ date: date, item_key: c.key, item_label: c.label, group: c.group, required: !!c.required, done: !!c.done });
    });
    cl.sort(byDate);
    writeTab(ss, 'Checklist', cl);
  }

  // Lifts — top set per exercise per day, Epley 1RM.
  if (day.lifts) {
    var lifts = readTab(ss, 'Lifts').filter(function (r) { return r.date !== date; });
    day.lifts.forEach(function (l) {
      var w = Number(l.weight), reps = Number(l.reps);
      if (!l.exercise || !(w > 0) || !(reps > 0)) return;
      lifts.push({ date: date, exercise: l.exercise, top_set_weight: w, reps: reps, est_1rm: Math.round(w * (1 + reps / 30) * 10) / 10 });
    });
    lifts.sort(byDate);
    writeTab(ss, 'Lifts', lifts);
  }

  // Reading — pages per book per day, cumulative recomputed per book.
  if (day.reading) {
    var reading = readTab(ss, 'Reading').filter(function (r) { return r.date !== date; });
    day.reading.forEach(function (r) {
      var pages = Number(r.pages);
      if (!r.book || !(pages !== 0) ) return;
      reading.push({ date: date, book: r.book, pages_today: pages, cumulative_pages: 0 });
    });
    reading.sort(byDate);
    var cum = {};
    reading.forEach(function (r) { cum[r.book] = (cum[r.book] || 0) + Number(r.pages_today || 0); r.cumulative_pages = cum[r.book]; });
    writeTab(ss, 'Reading', reading);
  }
  return date;
}

function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }

function setConfig(ss, updates) {
  var rows = readTab(ss, 'Config');
  Object.keys(updates).forEach(function (k) {
    var hit = rows.filter(function (r) { return r.key === k; })[0];
    if (hit) hit.value = updates[k]; else rows.push({ key: k, value: updates[k] });
  });
  writeTab(ss, 'Config', rows);
  return getConfig(ss);
}

// ---------------------------------------------------------------- reads

function loadAll() {
  var ss = getSS();
  ensureTabs(ss);
  var days = {};
  readTab(ss, 'Daily').forEach(function (r) {
    days[r.date] = {
      date: r.date,
      sleep_hours: num(r.sleep_hours),
      weight_lb: num(r.weight_lb),
      steps: num(r.steps),
      session: r.session,
      trained: toBool(r.trained),
      alcohol_drinks: num(r.alcohol_drinks) || 0,
      notes: r.notes || '',
      updated_at: r.updated_at || '',
      checks: {},
      lifts: {},
      pages: {}
    };
  });
  readTab(ss, 'Checklist').forEach(function (r) {
    if (days[r.date]) days[r.date].checks[r.item_key] = toBool(r.done);
  });
  readTab(ss, 'Lifts').forEach(function (r) {
    if (days[r.date]) days[r.date].lifts[r.exercise] = { weight: num(r.top_set_weight), reps: num(r.reps), est_1rm: num(r.est_1rm) };
  });
  readTab(ss, 'Reading').forEach(function (r) {
    if (days[r.date]) days[r.date].pages[r.book] = num(r.pages_today);
  });
  return {
    ok: true,
    version: VERSION,
    config: getConfig(ss),
    days: days,
    weekly: readTab(ss, 'Weekly'),
    server_time: new Date().toISOString(),
    today: todayStr()
  };
}

// ---------------------------------------------------------------- weekly rollup

/** Rebuilds the Weekly tab from Daily / Lifts / Reading. Trigger: Sunday 21:00 Vancouver. */
function weeklyRollup() {
  var ss = getSS();
  ensureTabs(ss);
  var daily = readTab(ss, 'Daily');
  var lifts = readTab(ss, 'Lifts');
  var reading = readTab(ss, 'Reading');
  var cfg = getConfig(ss);
  var start = cfg.start_date ? fmtDate(cfg.start_date) : '2026-10-19';
  var weekOf = function (date) { return Math.ceil(dayNumber(date, start) / 7); };

  var weeks = {};
  var touch = function (w) { if (!weeks[w]) weeks[w] = { week: w, sleep: [], weight: [], clean: 0, train: 0, pages: 0, nic: 0, alc: 0, best: {} }; return weeks[w]; };
  daily.forEach(function (r) {
    var w = touch(Number(r.week) || weekOf(r.date));
    if (r.sleep_hours !== '') w.sleep.push(Number(r.sleep_hours));
    if (r.weight_lb !== '') w.weight.push(Number(r.weight_lb));
    if (toBool(r.clean_day)) w.clean++;
    if (toBool(r.trained)) w.train++;
    w.alc += Number(r.alcohol_drinks) || 0;
  });
  reading.forEach(function (r) { touch(weekOf(r.date)).pages += Number(r.pages_today) || 0; });
  lifts.forEach(function (r) {
    var w = touch(weekOf(r.date));
    var v = Number(r.est_1rm) || 0;
    if (!w.best[r.exercise] || v > w.best[r.exercise]) w.best[r.exercise] = v;
  });

  var avg = function (a) { return a.length ? Math.round(a.reduce(function (s, x) { return s + x; }, 0) / a.length * 100) / 100 : ''; };
  var keys = Object.keys(weeks).map(Number).sort(function (a, b) { return a - b; });
  var out = [];
  var prevAvgW = '';
  keys.forEach(function (k) {
    var w = weeks[k];
    var avgW = avg(w.weight);
    var change = (avgW !== '' && prevAvgW !== '') ? Math.round((avgW - prevAvgW) * 100) / 100 : '';
    var pct = (change !== '' && prevAvgW) ? Math.round(change / prevAvgW * 10000) / 100 : '';
    var flags = [];
    MAIN_LIFTS.forEach(function (lift) {
      var a = w.best[lift], b = weeks[k - 1] && weeks[k - 1].best[lift], c = weeks[k - 2] && weeks[k - 2].best[lift];
      if (a && b && c && a < b && b < c) flags.push(lift + ' est. 1RM down two weeks running — check fuelling');
    });
    out.push({
      week: k, avg_sleep: avg(w.sleep), avg_weight: avgW, weight_change: change, pct_bodyweight_per_week: pct,
      clean_days: w.clean, training_sessions: w.train, total_pages: w.pages, alcohol_drinks: w.alc,
      flags: flags.join('; ')
    });
    if (avgW !== '') prevAvgW = avgW;
  });
  writeTab(ss, 'Weekly', out);
  return out;
}
