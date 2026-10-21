# The Arc

A 180-day daily protocol ledger. One static page, Google Sheets as the database, works offline,
pins to the iPhone home screen.

```
index.html            page shell, Food reference, markup for all four tabs
style.css             the ledger look: dark, hairlines, Archivo with width/weight axes
app.js                protocol, state, offline queue, sync, every screen
sw.js                 caches the shell so the pinned app opens without signal
manifest.webmanifest  PWA manifest
icon-*.png            home-screen icons
apps-script/Code.gs   the Google Apps Script backend (owns the "Arc 180" spreadsheet)
apps-script/README.md how to paste, deploy and curl-test the backend
apps-script/test-local.js  node harness that runs Code.gs against a Sheets stub
```

## Setting it up, start to finish

### 1. Backend (10 minutes, once)

Follow [apps-script/README.md](apps-script/README.md). You end up with a web app URL ending in `/exec`.

### 2. Put the URL in the frontend

Either edit the first constant in [app.js](app.js):

```js
const API_URL = 'https://script.google.com/macros/s/XXXX/exec';
```

or, on the phone, open **Log → Sync** at the bottom of the Log tab, paste the URL, tap **Save URL**,
then **Test**. The pasted URL is kept in the browser and overrides the constant.

### 3. Deploy the frontend (GitHub Pages)

Repo: <https://github.com/pkhokhar98/the-arc> (public; GitHub Pages on a free plan needs a public repo). Deployed from the `main` branch root. Any push redeploys in about a minute.

```bash
git push origin main
```

Pages URL: <https://pkhokhar98.github.io/the-arc/>. Open it in Safari on the phone → Share → **Add to Home Screen**.
The first open caches the shell, so later opens work with no signal.

Alternative hosts need no changes: drag the folder onto Netlify Drop, or `vercel deploy`. The app is
all relative paths.

## Power tab (the scouter dashboard)

A Dragon Ball Z–themed dashboard over the same local data. It opens straight to it at
<https://pkhokhar98.github.io/the-arc/#power>, which is a good laptop bookmark. All art is drawn in code.

| Panel | What it shows |
|---|---|
| Power level | Cumulative score, see the formula below. Counts up on open, with the scouter lens scanning. |
| Form | Base form 0 · Kaioken 9,000 · Super Saiyan 25,000 · SS2 50,000 · SS3 80,000 · SS God 115,000 · SS Blue 150,000 · Ultra Instinct 190,000. The aura colour follows the form; SS2, SS3 and Ultra Instinct add lightning. A perfect arc lands around 200,000. |
| Last time on The Arc… | A DBZ-narrator recap of your last logged day and a cliffhanger for today. |
| Fighter | Vegeta, Gohan or Trunks (original silhouettes drawn in code). Your pick stands in the hero with the other two flanking, and changes the accent colour, signature attacks and some forms: Vegeta tops out at Ultra Ego, Gohan unlocks Ultimate and Beast, Trunks gets Super Saiyan Rage. Remembered per device. |
| Ki charge | Today's required anchors, 0–10, named after your fighter's charge attack. At full charge a button fires their finisher (Final Flash, Father-Son Kamehameha, Shining Sword Attack) across the screen. |
| Dragon Radar | One Dragon Ball per arc week with six or more clean days (the short final week needs all five). Seven summons the dragon. |
| Scouter stats | Six 0–100 attributes over the last 28 days: STR, SPD, KI, SENZU (recovery), DISC, WIS. |
| Battle log | Clean days per week, last eight weeks, against the six-day line. |
| Weak points | Hit rate per required anchor over the last 14 days; the three lowest under 90 % are tagged. |
| Time chamber | All 26 weeks: done, current, ball earned, deload and diet-break weeks, next rest arc. |
| Power sources | Where the number comes from. |

**Formula.** Base 1,000. Each required anchor ticked +20. A clean day +300, multiplied by
1 + min(streak, 30)/30, so a 30-day streak doubles it. A training session +250. Best est. 1RM of
each main lift ×5. Every page read +2. Every lb lost +500. Each drink −100.

**Sample data** in the top-right swaps in a made-up 72-day run so you can see every panel filled in.
It is generated in memory, never saved and never synced; a striped banner shows while it is on.

**Sagas.** The whole app sits on a painted saga background, switched from the strip at the top of the Power tab: West City, Frieza Saga, Cell Saga, Buu Saga, Beerus Saga, Tournament of Power. Switching plays an episode-style title card. The paintings are original images generated in the style of 1990s TV-anime background art (no characters, logos or show assets), stored in `sagas/` as WebP; only the selected one loads. Each saga brings its own accent colours and ambient particles (cloud wisps, green motes, desert dust, pink smoke, gold sparkles, floating crystals), and the painting slowly pans like an anime background shot, with film grain on top. Your pick is remembered per device.

Every tab uses the same treatment: translucent panels over the painting, title-card headings, scouter numerals, and ticked anchors and clean calendar days drawn as Dragon Balls.

The aura, the background pan, grain and particles respect reduced motion: with it on, everything renders once and stays still.

## Wake time, Next up, and the coach

**Wake time** drives the day. Set it from the **Wake** picker on Today (this device), or as `wake_time` in the sheet's
Config tab as HHMM (`700` = 07:00), which every device falls back to. The morning items run from wake
(window, gargle, breakfast at +25 min, trataka, deep work until meetings open at 07:00), and the evening runs
back from bedtime = wake − 7.5 h (reading, night close, rinse, SATS 20 min before lights out). The group
headers show the resulting times.

**Next up** on Today shows what is due now (or next), when, and any earlier required anchors still open.
Tap it to jump to that row.

**The coach** sits in the bottom-right corner on every tab. It is a different character each day, rotating through **The cast** (Goku, Vegeta, Gohan, Trunks, Piccolo, Krillin, Master Roshi, Whis, Frieza) among those you've given a picture; with no pictures yet it rotates through all nine and shows their emblem. Once a day it opens a speech bubble
with one thing to lock in on, chosen from your data in this order: an anchor that slipped yesterday, your
weakest anchor over 14 days (under 80 %), a short 7-day sleep average, losing weight too fast, a diet-break week,
today's lift (with your last top set to beat) or run, otherwise the streak. It adds a public-domain quote that fits
(Marcus Aurelius, Seneca, Epictetus, Franklin, Durant) and an original line in the fighter's voice.
Tap the portrait any time to reopen it.

**Pictures** come from you, in The cast panel on the Power tab: **Photo** stores an image on this device only (IndexedDB); **Link** stores an image address in the sheet's Config as `cast_links`, so every device gets it. Nothing you add is committed to this public repo. Vegeta, Gohan and Trunks use the same pictures in the Power hero and fighter cards.

## How the data flows

* Every tap writes to local state (`localStorage`) and re-renders at once. Nothing waits on the network.
* Each changed date is queued along with exactly which fields this device changed. About a second later the app
  pulls the sheet's copy, lays only those fields over it, and sends the merged day as one `batch` POST. A phone and a
  laptop therefore never wipe each other's entries (a lift logged on one survives a tick on the other).
* On open, on returning to the app, and when the connection comes back, the app pulls `?action=load`
  and reconciles: a date with a pending local write keeps the local copy; otherwise the newer
  `updated_at` wins. So the laptop and the phone converge without a server round-trip per tap.
* The sheet holds one row per day in `Daily`, one row per item per day in `Checklist`, plus `Lifts`,
  `Reading`, `Weekly` (rebuilt by trigger every Sunday 21:00 Vancouver) and `Config`.

**Don't add, delete or move columns in the sheet by hand.** Since backend 1.1.0 the script matches columns by
header name and repairs a hand-edited tab on the next request, but deleting a column under an older backend
shifts every row. The app re-syncs every 2 minutes while it is open, and a home-screen install updates itself
when a new build is published (`version.json`; bump it together with `BUILD` in app.js).

## Where the numbers come from

| Metric | Rule |
|---|---|
| Rate / wk | (first weigh-in − latest) ÷ weeks between them. Green 0.5–1.0 % of current bodyweight, amber below, red above. Needs two weigh-ins ≥ 3 days apart. |
| 7d sleep | mean of logged sleep over the last 7 days. Green ≥ 7.5, amber ≥ 6.5, red below. |
| Streak | consecutive clean days back from today (today counts if already clean, otherwise from yesterday). |
| Clean | every required anchor ticked (10 of them: sleep, morning window, protein, steps, train, decompression, read, night close, rinse, SATS). |
| Est. 1RM | Epley: w × (1 + reps ÷ 30), top set only. ↑ when latest beats first. Flagged when the week's best drops two weeks running. |
| Corridor | from the first weigh-in: 0.5 % and 1.0 % per week compounded, to day 180. |
| Projection | latest weight minus goal, divided by the rate above. |
| Reading finish | pages read ÷ days since the first log for that book, applied to the pages left. |

Logging sleep ≥ 7.5 h or steps ≥ 8,000 ticks those anchors automatically (and unticks on a lower number).
The sleep and steps rows have the input inside their expandable detail, so both can be done from Today.

## Things that are deliberate choices, not spec

* **Training time slots** are not in the spec. `TRAIN_TIME` in app.js: lifts and the easy run 14:30
  (after the client day closes), long run 08:00. Change there.
* **Sunday** keeps the TRAIN anchor as "Rest + weekly review"; ticking it means the review happened.
  `trained` is written as false on Sundays regardless.
* **Deload weeks** halve the set count shown in the training detail (rounded up); loads unchanged.
* **Past days** can be opened with the ‹ › arrows beside the counter or by tapping a calendar cell,
  for the ones you forgot to tick. The future is not editable.
* `Daily` has an extra `updated_at` column beyond the spec; it is what makes two devices reconcile.
  `Weekly` has an extra `flags` column for the lift-drop warning.
* The service worker caches the shell only. Data never goes through it.

## Development

```bash
python3 -m http.server 8787
```

Open <http://localhost:8787>. No build step. `node apps-script/test-local.js` checks the backend logic.
