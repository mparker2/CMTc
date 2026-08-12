# CMT Connections

A mobile-first, front-end-only wedding puzzle inspired by Connections. Guests find 16 words around the Cambridge Museum of Technology, enter them on their phones and solve four groups. It uses plain HTML, CSS and JavaScript with no dependencies or build step.

## Project files

- `index.html` – page structure and accessible controls
- `styles.css` – responsive wedding-style presentation
- `assets/` – the watercolour background, knotwork border, CMT wheel logo and locally hosted fonts used by the theme
- `config.js` – all player-facing text, puzzle answers, category presentation, scoring and the results endpoint
- `app.js` – game, persistence, rendering and submission logic
- `google-apps-script.js` – example Google Sheets receiver; this file is not loaded by the website
- `tests/game-logic.test.mjs` – logic tests using Node's built-in test runner

## Run locally

Serve the folder with any static web server. For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

The site can also be opened directly from `index.html`, but using a local server more closely matches GitHub Pages.

Run the logic tests with:

```bash
node --test tests/game-logic.test.mjs
```

## Edit the puzzle

Only edit `config.js` for normal puzzle changes.

Each item in `PUZZLE.categories` needs:

- one unique title;
- one of `yellow`, `green`, `blue` or `purple`, used exactly once;
- exactly four unique words.

Matching ignores case, leading/trailing whitespace, repeated internal whitespace and equivalent Unicode forms. German umlauts may also be entered with an `e` or omitted, so `Bächle`, `Baechle` and `Bachle` all match `BÄCHLE`. The value from `config.js` is always used for display.

The pastel background and foreground colours live in `PUZZLE.palette`. Starting score, incorrect-guess penalty and completion rankings live in `PUZZLE.score`.

### Change the wording

All player-facing wording is in `PUZZLE.text` in `config.js`, including the welcome instructions, labels, buttons, temporary banners, completion panel, copy-result wording and accessibility labels. The puzzle name is `PUZZLE.title`.

Some phrases contain placeholders in braces, such as:

```js
wordAdded: "{word} added.",
wordsFound: "Words found: {found} / {total}",
wrongGroup: "Not a group — {penalty} {points} deducted.",
```

You can change the surrounding wording, but retain any values in braces that you still want the game to insert. Use `\n` inside a configured phrase to start a new line, as in `welcomeTitle`.

The `label` beside each colour in `PUZZLE.palette` is spoken by screen readers when describing emoji results, so edit those labels too if the rest of the interface is translated.

If you change the answers after anyone has already opened the game, also change `storageKey`, for example from `cmt-connections-game-v2` to `cmt-connections-game-v3`. This prevents an old saved game being restored against a new puzzle.

## Send completed results to Google Sheets

1. Create a Google Sheet.
2. In the sheet, open **Extensions → Apps Script**.
3. Replace the editor contents with `google-apps-script.js` from this project and save it.
4. Choose **Deploy → New deployment**.
5. Select **Web app** as the deployment type.
6. Set **Execute as** to yourself and **Who has access** to **Anyone**. Authorise the script when prompted.
7. Deploy and copy the web-app URL ending in `/exec`.
8. Paste that URL into the first setting in `config.js`:

```js
const RESULTS_ENDPOINT = "https://script.google.com/macros/s/…/exec";
```

The receiver creates a `Results` sheet if necessary and writes this header:

```text
team_name | score | start_timestamp | end_timestamp | category_order | guess_history | session_id
```

It uses the session ID to ignore repeat submissions. Keep that check: browsers cannot read a normal Google Apps Script response reliably when sending cross-origin in `no-cors` mode. The game marks a request as sent once the browser dispatches it; definite network failures remain saved locally and retry on the next load or when the device comes online.

If you later change `google-apps-script.js`, create a new web-app deployment version. The endpoint is not a secret, so do not collect sensitive information with it.

## Deploy on GitHub Pages

1. Create a GitHub repository and put these files at the repository root.
2. Push the repository to GitHub.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the branch (normally `main`) and the root folder (`/`), then save.

GitHub will show the public URL when deployment finishes. No GitHub Actions workflow or build command is required.

Before sharing the link, test it once in a private/incognito window and complete a throwaway game. Check that a single row appears in the sheet, then delete that row if desired.

## State and privacy

Game progress is stored only in that browser's `localStorage`. It includes the team name, entered words, tile positions, score, guesses and completion/submission state. The full answer key and category mapping remain in `config.js`. Resetting the game removes the saved local session after confirmation.
