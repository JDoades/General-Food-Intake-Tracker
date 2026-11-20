# Ish

A free, private, rough food tracker that lives on your phone.

You log whole meals ("spaghetti bolognese", "chippy tea", "meal deal"), not ingredients, and Ish shows your day as a rounded percentage: **"About 60% of today's food"**. It's made to keep a rough eye on how much you eat, so you don't overeat, without tipping into obsessive counting.

- **Rough on purpose.** The day is shown to the nearest 5%. Portions are Small, Normal or Large. No weighing, no grams.
- **Calm.** Going over 100% gets a short, calm note, not a red warning. The ring also marks where a good amount for the day starts, so eating too little shows up too.
- **Sensible floor.** A custom daily amount can't go below 1,200.
- **Private.** No accounts, no cookies, no tracking, no server. Everything stays on the phone.
- **Works offline.** Install it to your home screen and it works with no signal.
- **Photo guessing (optional).** Take a photo and Ish suggests what the dish might be, using a small model that runs on the phone. The photo never leaves it.

## Install it on your phone

The app is hosted with GitHub Pages at:

**https://jdoades.github.io/General-Food-Intake-Tracker/**

**iPhone (Safari):** open the link, tap **Share**, then **Add to Home Screen**. Open Ish from the home screen icon from then on.
> On iPhone, Safari and the home screen app keep **separate** data. Install first, then log from the home screen app.

**Android (Chrome):** open the link and tap **Install** (or menu, then **Install app** / **Add to Home screen**).

## Back up your data

All data lives inside the app on your phone. If the app is deleted, the data goes with it, so back up now and then (Ish reminds you after a month).

In **Settings > Your data**:

- **Save backup file**: saves a small `.json` file. On iPhone this opens the share sheet, so you can Save to Files, AirDrop it, or email it to yourself.
- **Copy backup code**: copies a text code (starts with `ISH1:`). Paste it into Notes or a message to yourself.
- **Restore from a file / code**: choose to **add** the backup to what's there, or **replace** everything. A restore can be undone once.

## What's in the food list

About 370 common UK dishes and drinks: breakfasts, home meals, takeaways, chippy food, pub food, meal deals, bakery snacks, puddings, fruit, sides, hot drinks, soft drinks and alcohol, plus quick sizes ("Light meal", "Big meal") for when you'd rather not name it. You can add your own dishes, and star favourites so they appear on the home screen for one-tap logging.

Every calorie figure is a rough estimate for a typical UK portion, based on general nutrition knowledge (typical pack labels and portion guidance). They aren't individually sourced, and they're not meant to be exact.

## Privacy, in detail

- Data is stored in the browser's local storage for the app, on the phone only. Nothing is ever sent anywhere.
- No cookies are used. (Cookies were considered, but browsers send cookies to the server with every request, and iPhone deletes them after 7 days.)
- `index.html` has a strict Content Security Policy: the page can only load files from, and talk to, its own site. No other site can be contacted, even by accident.
- The only download after installing is the optional photo model, from the same site as the app.
- Photos for photo guessing are turned into numbers in memory, then discarded. They're never saved or uploaded.
- The end-to-end test checks there are no cookies and that every network request is a plain GET for one of the app's own files.

## Photo guessing

Ish uses **MobileCLIP-S0**, a small open model from Apple that matches images to text. When the app is built, the model's text half turns every dish name in the food list into a 512-number "fingerprint". On the phone, the image half turns your photo into a fingerprint, and Ish suggests the closest dishes. Because it matches against Ish's own list, it knows British dishes, not just a fixed set.

- One-time download of about **37 MB** (22.9 MB model plus 14.8 MB engine), then it works offline. Remove it any time in Settings.
- It guesses the dish, not the amount. You still pick the portion.
- Similar-looking dishes get mixed up (bolognese, chilli, lasagne), which is why it offers four choices.
- Your own custom dishes can't be photo-matched (that would need the much larger text model on the phone).
- In testing on 30 photos of 15 common UK meals, the top suggestion was right for 26, and the right dish was in the four suggestions for 28.

> **Why not Apple Intelligence?** Apple only lets native iPhone apps use it. Web apps can't reach it, so Ish carries its own small model instead.

## Hosting with GitHub Pages (one-time setup)

1. In the repo on GitHub, go to **Settings > Pages**.
2. Under **Build and deployment > Source**, choose **GitHub Actions**.
3. Push to `main` (or this branch), or run the **Deploy to GitHub Pages** workflow by hand from the **Actions** tab.

The workflow runs the unit tests, then publishes the `app/` folder as-is. There's no build step.

## Development

Everything the app needs is already committed in `app/`, so you can just serve it:

```sh
npm run serve        # http://localhost:8080 (needs Python 3)
npm test             # unit tests, Node 22+, no install needed
npm run e2e          # full browser test (needs Playwright with Chromium available)
```

Maintenance scripts (run `npm install` first; these are the only dependencies, and they're for building, not shipped):

| Command | What it does |
|---|---|
| `npm run photo-index` | Re-download the photo model and rebuild dish fingerprints. **Run this whenever `app/js/foods.js` changes.** A unit test fails if you forget. |
| `npm run vendor` | Copy ONNX Runtime Web from `node_modules` into `app/vendor/ort/`. |
| `npm run stamp` | Update the service worker's version after changing any app file, so phones pick up the new version. A unit test fails if you forget. |
| `npm run icons` | Redraw the app icons. |
| `node tools/eval-photo.mjs <folder> [--compare]` | Check photo-guess accuracy on your own test photos, named like `fish-and-chips__1.jpg`. |

### Layout

```
app/                    the whole app, served as static files
  index.html            page shell and privacy policy (CSP)
  sw.js                 service worker (offline cache)
  js/calc.js            percentages, rounding, portions, day boundaries
  js/search.js          forgiving dish search
  js/store.js           local storage, validation, migrations
  js/backup.js          export and import
  js/foods.js           the UK food list
  js/photo*.js          photo guessing (page side, worker, maths)
  js/ui/                screens and shared pieces
  model/, vendor/ort/   photo model and engine (downloaded on demand)
tests/                  unit tests and the end-to-end browser test
tools/                  build scripts
```

## Not medical advice

Ish gives a rough picture of your day, not dietary advice. If you ever get worried about your eating, [Beat](https://www.beateatingdisorders.org.uk) has good advice.

## Licence

Ish is released under the [IDGAFPL](https://github.com/My2ndAngelic/IDGAFPL) (full version). See [LICENSE](LICENSE).

Bundled third-party files keep their own licences:

- `app/vendor/ort/`: ONNX Runtime Web, by Microsoft, MIT licence.
- `app/model/vision_model.onnx`: MobileCLIP-S0, by Apple, under Apple's licence in `app/model/LICENSE-MobileCLIP.txt` (redistributed unmodified via the `Xenova/mobileclip_s0` ONNX export).
