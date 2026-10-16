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
- Training sessions saved in `localStorage`, progress counters, PGN download.
- Your data never leaves the device: no accounts, no analytics (only Google Fonts are loaded from the network).
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
- **Bot ELO is approximate.** From 1320 to 3190 the real Stockfish option `UCI_Elo` limits strength; 3200 = full strength. Below 1320 Stockfish has no limit option, so the bot plays at 1320 level and additionally picks another of its top-5 candidate moves with a probability that grows as the rating drops (table `LOW_ELO_SLIP` in `src/lib/bot.ts`; tuned with engine-vs-engine matches and user feedback, steps between neighbouring low levels are small). The bot also waits a human-like time before moving: longer for higher ratings and harder positions, shorter for forced or obvious moves, and always bounded by the clock (`humanDelayMs`).
- **Text explanations** only state verifiable facts (capture, check, mate, evaluation change, best line); Stockfish itself does not explain moves.
- Material balance counts captured pieces (P=1, N=B=3, R=5, Q=9) and is independent of the engine evaluation.

### Tests

`npm test` runs unit tests (rules, captures, clocks, evaluation formatting, classification, bot calibration, PGN, review report).

## Roadmap

Tactics puzzles (Lichess open database, CC0), opening trainer with spaced repetition, endgame trainers, drag-and-drop pieces.

## License

**GNU GPL v3 or later** — see [LICENSE](LICENSE). The repository bundles the Stockfish engine (GPLv3), so the whole project is distributed under the same terms.

Credits: [Stockfish](https://github.com/official-stockfish/Stockfish) (GPLv3), [Stockfish.js](https://github.com/nmrugg/stockfish.js) by Nathan Rugg / Chess.com (GPLv3), [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause), [React](https://react.dev/) and [Vite](https://vite.dev/) (MIT).
