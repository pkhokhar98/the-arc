# Apps Script backend — deploy guide

The backend is one file, `Code.gs`, running as a Google Apps Script web app.
It owns a spreadsheet called **Arc 180** with six tabs: Daily, Checklist, Lifts,
Reading, Weekly, Config. You deploy it once under your own Google account; the
frontend only ever talks to the web app URL.

## 1. Create the script

1. Go to <https://script.google.com> signed in as the account that should own the data.
2. **New project**. Rename it "The Arc".
3. Delete the placeholder in `Code.gs`, paste the whole of `apps-script/Code.gs`.
4. Project settings (gear icon) → tick **Show "appsscript.json" manifest file in editor**.
   Open `appsscript.json` and replace its contents with `apps-script/appsscript.json`
   (this sets the time zone to America/Vancouver and the web-app access level).
5. Save.

## 2. Run setup once

1. In the function dropdown pick `setup`, press **Run**.
2. Approve the permission prompt (it needs Sheets + "run when you are not present"
   for the Sunday trigger). Google shows an "unverified app" warning for your own
   script: Advanced → Go to The Arc (unsafe) → Allow.
3. The execution log prints the spreadsheet URL. Open it: every tab exists, Config is seeded.
4. Triggers (clock icon on the left) now shows `weeklyRollup`, Sunday 9–10 pm.

Config tab keys you can change in the sheet without touching code:
`start_date, total_days, goal_weight, start_weight, protein_target, calorie_target,
diet_break_calories, sleep_target, step_target, deload_weeks, diet_break_weeks`.
The frontend reads these on load and uses them over its built-in constants.

## 3. Deploy as a web app

1. **Deploy → New deployment**. Type: **Web app**.
2. Description: `v1`. Execute as: **Me**. Who has access: **Anyone**.
3. Deploy, then copy the **Web app URL** (ends in `/exec`).

Every later code change needs **Deploy → Manage deployments → edit (pencil) →
Version: New version → Deploy**. The URL stays the same, so the frontend never changes.

## 4. Test it with curl

```bash
export ARC_URL='https://script.google.com/macros/s/XXXX/exec'
```

```bash
curl -sL "$ARC_URL?action=ping"
```
Expect `{"ok":true,"version":"1.0.0",...}`. The `-L` matters: Apps Script answers with a redirect.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$ARC_URL" -H 'Content-Type: text/plain' --data '{"action":"day","day":{"date":"2026-10-19","sleep_hours":7.6,"weight_lb":225,"steps":8400,"session":"Lower A","trained":true,"updated_at":"2026-10-19T23:00:00.000Z","checklist":[{"key":"sleep","label":"7.5 hours minimum","group":"SLEEP","required":true,"done":true}],"lifts":[{"exercise":"Back squat","weight":225,"reps":8}],"reading":[{"book":"Meditations","pages":12}]}}'
```
Expect `302`. Apps Script answers every POST with a redirect to a one-shot echo URL; the write has
already happened by then. Don't add `-L` here: curl turns the redirected POST into a GET and Google
serves a "Sorry, unable to open the file" page, which looks like a failure but isn't. Browsers
follow the same redirect and receive the JSON body fine, which is what the app relies on.
Check the write with the load call:

```bash
curl -sL "$ARC_URL?action=load"
```
Returns `config`, `days` (keyed by date), `weekly`, and today's date in Vancouver time.

```bash
curl -sL "$ARC_URL?action=rollup"
```
Rebuilds the Weekly tab on demand (the trigger does this automatically every Sunday night).

Delete the test row afterwards by clearing the 2026-10-19 rows in the sheet, or just
overwrite it from the app on day one. The app's write for a date replaces the sheet's
rows for that date.

## 5. Put the URL in the frontend

Open `app.js` and set the first constant:

```js
const API_URL = 'https://script.google.com/macros/s/XXXX/exec';
```

You can also paste it on the phone: in the app, open the **Sync** panel at the bottom of the
Log tab and paste the URL there. That copy lives in the browser's localStorage and wins over
the constant, which is handy if you ever redeploy and don't want to touch the code.

## How writes work

* Each save sends the whole day (numbers, every checklist item, lifts, reading) with an
  `updated_at` timestamp. The script replaces that date's rows in all four tabs, so there is
  never a duplicate date and history is never overwritten by an older copy.
* Last writer wins by `updated_at`: an offline write flushed later than a newer write from
  another device is dropped.
* Reads are a single `?action=load` returning everything. 180 days is small, so there is no paging.
* Weekly: `weeklyRollup()` recomputes every row from scratch each Sunday 21:00 Vancouver time.
  The `flags` column names any main lift whose best estimated 1RM has dropped two weeks running.

## Local check without deploying

```bash
node apps-script/test-local.js
```
Runs the script against an in-memory stub of Sheets and checks upsert, stale-write handling,
cumulative pages, and the weekly rollup. It is a logic check only; the curl steps above test
the real deployment.
