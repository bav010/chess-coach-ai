# Testing guide

> Русская версия: [TESTING.md](TESTING.md)

Three levels of checks: types, unit tests and end-to-end (e2e) browser scenarios. Run the first two before every release; run the third after big UI changes.

## 1. Quick check (1–2 minutes)

```bash
npm install
npx tsc -b          # strict type check, must print no errors
npx vitest run      # unit tests (205), including EN/RU dictionary parity
npx vite build      # build into dist/
```

If the dictionary parity test fails, either the English dictionary contains Cyrillic or a key exists in one language but not the other.

## 2. End-to-end scenarios (e2e)

The `e2e/` folder holds Python + Playwright scripts. They open a real browser, play games, solve puzzles, walk through the modes and print each step. Success is the line `errors []` at the end (no console errors).

### Setup (once)

```bash
pip install playwright
playwright install chromium
```

The scripts point to the browser at `/opt/pw-browsers/chromium`. Replace it with your own path, or drop the `executable_path=...` argument so Playwright uses its installed Chromium.

### Serving the build

The scripts expect the site at `http://127.0.0.1:4173/chess-coach-ai/`. The `/chess-coach-ai/` part comes from `base` in the Vite config.

```bash
mkdir serve && ln -s "$(pwd)/dist" serve/chess-coach-ai
cd serve && python3 -m http.server 4173 --bind 127.0.0.1
```

Keep the server running and start the scripts from another terminal:

```bash
cd e2e
python3 e2e1.py     # analysis
python3 e2e3.py     # play vs bot
python3 e2e14.py    # etc.
```

### What the scenarios cover

| Scripts | What they check |
|---|---|
| e2e1–e2e2, e2e4, e2e8 | analysis, moves, position editor |
| e2e3, e2e5 | play vs bot, clocks, colour choice |
| e2e6–e2e7, e2e9 | puzzles, puzzle statistics |
| e2e10–e2e12 | openings: lessons, study, training |
| e2e14 | other modes and saving |
| e2e16–e2e21 | sign-in, cloud sync, server status, language |
| e2e22–e2e24 | additional UI scenarios |
| contrast.py | text contrast in light and dark themes: `python3 contrast.py light dark` |

`legacy/` holds old scenarios for removed features (local multi-accounts); there is no need to run them.

### Cloud scenarios (e2e16–e2e21)

They need a separate build with a mocked Supabase. A real server is not used: requests are intercepted in `e2e16.py`.

```bash
VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test \
  npx vite build --outDir dist-cloud
mkdir serve2 && ln -s "$(pwd)/dist-cloud" serve2/chess-coach-ai
cd serve2 && python3 -m http.server 4174 --bind 127.0.0.1
```

Limitation: this verifies the app's logic, not a real Supabase. Before a release, do one manual sign-in against the real project.

## 3. Common problems

- **A script hangs waiting for `top-status`**: the server is not running on the expected port, or the wrong path is open (it must be `/chess-coach-ai/`).
- **"strict mode violation … resolved to N elements"**: four modes are mounted at once (hidden), so use a selector with `:visible`.
- **A selector containing `+`** (for example `tc-10+5`) must be quoted: `[data-testid="tc-10+5"]`.
- **A script waits for Russian text**: it was written for Russian, and its start sets `localStorage.setItem('chess-coach-ai:lang:v1','ru')`. The default language is English.
- **The server died between runs** (in some environments): start the server and the script in one command.

## 4. Manual pre-release checklist

1. Play a game against the bot, run a review, save it.
2. Solve a puzzle and check that the home screen shows it as solved and the streak continues.
3. Finish an opening lesson and open training.
4. Switch the language (Settings): the game and position must not reset.
5. Light and dark themes, on phone and desktop.
6. With the cloud: sign up, sign out, sign in, a second browser, the "new data available" banner.
