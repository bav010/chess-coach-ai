# Chess Coach AI

**A chess trainer that runs entirely in your browser.** Interactive board, position analysis by Stockfish (WebAssembly) and training progress. No server, no sign-up, no backend to install: the site is a set of static files you can host for free on GitHub Pages.

[Русская версия](README.ru.md)

![Screenshot](docs/screenshot.png)

## Features

- Saved sessions can be opened for analysis (and review) in one click with the *Анализ* button — no PGN download needed.
- Board with legal-move highlights, promotion picker, undo, last-move highlight and a clickable move list (also ←/→ keys).
- **Analysis mode.** Automatic in-browser Stockfish 19 analysis after every move or history step (stale searches are cancelled, results cached): evaluation (`+1.5`, `−1.5`, `0.0`, `M3`), best lines in SAN, vertical evaluation bar, best-move arrows (brightness, thickness, count, numbering configurable), text explanation of the last move. The analysis panel, evaluation bar, arrows and move ratings can each be switched off independently. Load games from PGN (paste or file).
- **Play vs bot.** Strength from ≈400 to 3200 ELO (presets + custom), colour choice (white/black/random, board flips), time controls (Bullet/Blitz/Rapid/Classical presets or custom time, increment, delay), independent clocks and flag-fall rules, captured pieces with material balance, undo, restart, resign, draw offer, correct mate/stalemate/threefold/50-move/insufficient-material detection.
- **Game review.** After a game (or for any loaded PGN) Stockfish goes through all positions and builds a report: accuracy per side, inaccuracy/mistake/blunder counts, key moments, biggest swings, best/worst decisions, phases and a win-chance graph.
- **Mistake trainer.** Replays your mistakes from the position before the move: find the better move, get hints, retry, see the best line. The original game is never modified; progress is saved locally.
- **Position editor.** In Analysis, «Расставить позицию» opens a board editor: place or remove any pieces, choose the side to move and castling rights, paste a FEN, or start from the current position; illegal positions (missing king, pawns on the first/last rank, side not to move in check) are rejected with an explanation. Then analyse and play on from that position.
- **Opening lessons.** In "Дебюты → Уроки": 32 short guided lessons for White or Black, split into **Attack** (take the initiative: Italian, Evans Gambit, Ruy Lopez, Scotch, King's Gambit, Vienna, Sicilian, Dragon, Sveshnikov, Queen's Gambit, London, English, Catalan, King's Indian, Grünfeld, Dutch…) and **Defence** (solid openings and answers to aggression: Caro-Kann, French, Scandinavian, Slav, Nimzo-Indian, Pirc, Alekhine, Philidor, defences against the Scholar's-mate attempt, the Ng5 attack, the King's Gambit and the London), with filters by style and side. You make your own moves, the opponent answers, and after every move the reason for it is explained ("why this move"); an arrow shows the move (can be switched off to test yourself); a finished lesson can be repeated without hints and is added to the repertoire "Из уроков" automatically. In training, the mode *Repeat learned* re-drills completed lessons and lines whose positions are all learned (interval 7+ days). In the catalogue, a chosen line loads from the start with numbered arrows showing the order of moves (light = White, orange = Black).
- **Accounts.** With cloud accounts enabled, the top-right button "Sign up / Sign in" is the first step: sign up or sign in by email, then set a name and an avatar (emoji, colour or your own photo), and only then statistics, profile and settings open. Every account is tied to an email; sync is automatic. Games played before signing in are linked to the account. Without Supabase the app runs in local mode (no sign-in).
- **Languages.** English by default; switch to Russian with the EN/RU button in the header or in Account → Settings. The choice is remembered and applied instantly without reloading the game. Chess notation (SAN/PGN/FEN) is never translated; all texts live in `src/i18n/`.
- **Navigation and look.** A home page (greeting, "Continue", quiet stats, mode cards, puzzle of the day, short overview); each mode opens full screen with its own address (`#/analysis`, `#/tactics/<id>`…), so the browser Back button works; the logo and the "Home" button return to the home page; a side menu (☰) lists every section; Settings (language, light/dark/system theme, board colours, hints and review) and Help. Shortcuts: ←/→ previous/next move, Home/End first/last, F flip the board, Esc close the menu.
- **Server status.** The "Service online" indicator in the header reflects whether the Supabase server is reachable.
- **Statistics and progress.** In the account, "Статистика": games, wins/draws/losses, an in-app rating (Elo formula against the bot's nominal strength — *not* a FIDE or Chess.com rating), rating and accuracy charts, error counts and rate per 100 moves, accuracy by game stage, endgame results, puzzle and opening progress. Filters by period, colour, result and mode. Personal recommendations appear only after at least 5 reviewed games and always show the data they are based on. Each game is stored once (no duplicates), data stays in the browser, with a JSON backup/restore. Accuracy shows how close moves are to the engine's best, it is not a win probability.
- **Opening trainer.** A "Дебюты" mode. *Study*: a catalogue of 3 865 named openings with ECO codes (search by name or code, filter A–E), a variation tree (continuations from the current position, the most developed one marked ★), step through moves with the position shown on the board, view from White or Black, optional separate Stockfish evaluation. *Repertoire*: create repertoires for White or Black, add lines from the board, edit names, notes per line and per position. *Training*: you see a position and must recall your next move; the opponent answers with the moves stored in the repertoire. A wrong move shows the correct one and the position returns soon; spaced repetition (1 → 3 → ~7 days and beyond, difficult positions come back more often). Progress and repertoires persist in the browser and can be exported/imported as a file. Catalogue data: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0), rebuilt by `scripts/build-openings.ts`; it is kept separate from Stockfish results.
- **Tactics trainer.** A separate "Задачи" mode: pick a theme (fork, pin, double attack, discovered attack, deflection, mating combinations, tactical defence), a difficulty and a type (mate in 1 / 2 / 3+, win material). Every move is checked after you play it, three progressive hints (idea → piece → move), explanation of the combination after success, buttons *Next / Try again / Show solution*. Stats (solved, success %, time, per theme) are stored in the browser; weak themes are suggested for more practice.
- Training sessions saved in `localStorage`, progress counters, PGN download.
- Without cloud accounts your data never leaves the device; with them only your progress is stored in your own Supabase project. No analytics (only Google Fonts are loaded from the network).
- Works on mobile and on any static host.

## Quick start

Requires [Node.js](https://nodejs.org/) 20+.

```bash
git clone https://github.com/bav010/chess_trainer_ai.git
cd  chess_trainer_ai
npm install
npm run dev
```
**Windows:** You can simply double-click `start_chess_coach.bat` — it will automatically install the packages and open the website.

| Command | Description |
| --- | --- |
| `npm run dev` | dev server with hot reload |
| `npm run build` | type-check and build into `dist/` |
| `npm run preview` | serve the production build locally |
| `npm run typecheck` | TypeScript check only |
| `npm test` | unit tests (vitest) |

> You cannot open `dist/index.html` via `file://`: browsers do not run the WebAssembly engine from a local file. Use `npm run preview` or any static server.

## How it works

- Rules, legal moves and PGN: [chess.js](https://github.com/jhlywa/chess.js).
- Engine: Stockfish.js 19 *lite single-threaded* build (~1.9 MB) running in a Web Worker and driven over UCI (`src/engine.ts`). It needs no `COOP/COEP` headers, so it works on GitHub Pages.
- Storage: sessions are kept in `localStorage` under `chess-coach-ai:sessions:v1` (`src/storage.ts`).
- Two independent engine instances (two Web Workers): one for analysis/review, one for the bot, so they never interfere.
- Game model: start position + list of UCI moves is the single source of truth (`src/lib/game.ts`); board, history, captures, status and analysis are derived from it.
- Analysis depth/time: `src/hooks/useAnalysis.ts` (live: depth 22 / up to 6 s; review: see the quality setting, 12–18 depth).

### Methodology and limits

- **Evaluation** is shown from White's point of view; engine scores (side to move) are converted. Win chance = `50 + 50·(2/(1+e^(−0.00368208·cp)) − 1)` (Lichess curve); the bar uses the same curve.
- **Move classification** (chess.com-style icons on the board, in the move list and in the report table): brilliant, great, best, excellent, good, book, inaccuracy, mistake, miss, blunder. Loss = drop of the mover's win chance after the move vs. the best line. Defaults: excellent ≤ 2, good < 5, inaccuracy ≥ 5, mistake ≥ 10, blunder ≥ 15 percentage points (editable in Settings). *Best* = engine's first line. *Great* = the only good move (second-best line is ≥ 15 pp worse, not a simple recapture). *Brilliant* = best move that sacrifices material (still ≥ 2 down after the first 4 plies of the engine line) in a position that was not already winning and stays at least equal. *Miss* = loss ≥ 5 pp right after the opponent's mistake (or a missed mate) while the position does not collapse. *Book* = move from a small built-in list of opening lines (not a full ECO database). These special classes are heuristics built on the engine's evaluations, not official chess.com criteria.
- **Accuracy** per move = `103.1668·e^(−0.04354·loss) − 3.1669` (0–100), per side = average. It is an approximate method, not an official figure of any service, and depends on analysis depth.
- **Bot ELO is approximate.** From 1320 to 3190 the real Stockfish option `UCI_Elo` limits strength; 3200 = full strength. Below 1320 Stockfish has no limit option, so the bot plays at 1320 level and additionally picks another of its top-5 candidate moves with a probability that grows as the rating drops (table `LOW_ELO_SLIP` in `src/lib/bot.ts`; tuned with engine-vs-engine matches and user feedback, steps between neighbouring low levels are small). The bot also waits a human-like time before moving: scaled to the game length (a 1-minute game: fractions of a second per move, 5 minutes: seconds), shorter the higher the rating, almost none in the opening and for forced or obvious moves, longer in sharp positions, with random variation and occasional long thinks; never pressing the clock (`humanDelayMs`).
- **Text explanations** only state verifiable facts (capture, check, mate, evaluation change, best line); Stockfish itself does not explain moves.
- Material balance counts captured pieces (P=1, N=B=3, R=5, Q=9) and is independent of the engine evaluation.

### Puzzle database

`src/data/puzzles.json` is a static, engine-verified set (no server needed). It was generated offline with Stockfish 19 (`scripts/gen-puzzles.ts`): positions come from self-play of a weakened engine; a position becomes a puzzle only if a deep search (depth 20) proves a **unique** solution — a forced mate (`score mate`, no equally short alternative), a winning tactic whose best move beats the second-best line by ≥20 win-percentage points, or a defence against a real threat (a null-move search shows the opponent wins if you pass). Themes are detected from the position geometry of the verified line (`src/lib/puzzleThemes.ts`); positions without a recognisable theme are dropped, nothing unverified is shown as a puzzle. `scripts/build-puzzles.ts` rebuilds the JSON. The current set has 486 puzzles: 220 mates (in 1–4), 130 defences, and by theme 69 forks, 36 pins, 29 double attacks, 25 discovered attacks, 12 deflections (rarer themes are harder to find in games; extend the set with the generator). At runtime a move that differs from the stored solution is verified by the in-browser Stockfish (another mate of the same length, or an equivalent win), so correct alternative solutions are accepted; a wrong move is never counted as success.

### Tests

`npm test` runs unit tests (rules, captures, clocks, evaluation formatting, classification, bot calibration and think-time, PGN, review report, puzzle checking, hints, statistics and the puzzle database).

## Roadmap

Tactics puzzles (Lichess open database, CC0), opening trainer with spaced repetition, endgame trainers, drag-and-drop pieces.

## License

**GNU GPL v3 or later** — see [LICENSE](LICENSE). The repository bundles the Stockfish engine (GPLv3), so the whole project is distributed under the same terms.

Credits: [Stockfish](https://github.com/official-stockfish/Stockfish) (GPLv3), [Stockfish.js](https://github.com/nmrugg/stockfish.js) by Nathan Rugg / Chess.com (GPLv3), [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause), [React](https://react.dev/) and [Vite](https://vite.dev/) (MIT).

## Cloud accounts (email and password sign-in)

By default accounts are local (no password, data stays in the browser). To enable **real email/password sign-in and sync between devices**, connect a free [Supabase](https://supabase.com) project. The site stays static on GitHub Pages: Supabase stores passwords (the app never sees them) and each user's data is protected by row-level security.

1. Create a Supabase project, open the **SQL Editor**, paste `docs/supabase.sql` and **Run** it (creates the `user_data` table, "each user sees only their own row" policies and the delete-account function).
2. **Authentication → Sign In / Providers → Email** (called "Providers" in older dashboards): open the Email provider and make sure it is enabled. The **Confirm email** switch is in the same panel: when on, a link is mailed after sign-up and sign-in works only after confirming; when off, users can sign in immediately. Dashboard labels may change over time.
3. **Authentication → URL Configuration**: set *Site URL* to your site (e.g. `https://YOUR-LOGIN.github.io/chess-coach-ai/`) and add it to *Redirect URLs* (needed for confirmation and password-reset emails).
4. **Project settings → API**: copy the *Project URL* and the *anon public* key. These are public values. **Never put the `service_role` key in the app.**
5. Locally, create `.env.local` from `.env.example`. On GitHub Pages add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under *Settings → Secrets and variables → Actions → Variables* (the `pages.yml` workflow passes them to the build) and redeploy.

The app then requires sign-in for statistics: sign-up/sign-in by email, password reset and change, account deletion. Sync is fully automatic: on sign-in the device's data is merged with the cloud data without loss, changes are pushed in the background (and when the tab is hidden), and if another device saved newer progress a banner offers to update. Merging only adds data (games, opening cards, finished lessons, solved puzzles); resetting game statistics syncs, deleting repertoires on another device does not yet. Signing out hides the account's data on this device. Without Supabase the app runs in local mode.

## Piece sets

Settings → Pieces offers Classic (cburnett), Merida, Chessnut, Flat and a font-glyph set, plus size, shadow, highlight styles, move animation, sounds and figurine notation. Artwork comes from the Lichess piece collection under GPL-2.0-or-later / Apache-2.0; see `src/assets/pieces/CREDITS.md`.

## Quick jump

Press Ctrl+K (⌘K on Mac) or the search button in the header to jump to any section or run a quick action (theme, language, puzzle of the day).
