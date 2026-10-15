# Chess Coach AI

**A chess trainer that runs entirely in your browser.** Interactive board, position analysis by Stockfish (WebAssembly) and training progress. No server, no sign-up, no backend to install: the site is a set of static files you can host for free on GitHub Pages.

[Русская версия](README.ru.md)

![Screenshot](docs/screenshot.png)

## Features

- Board with legal-move highlights, promotion picker, undo and move list.
- In-browser Stockfish 19 analysis: best move, main line in SAN, evaluation or mate. The result updates as the search deepens.
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

> You cannot open `dist/index.html` via `file://`: browsers do not run the WebAssembly engine from a local file. Use `npm run preview` or any static server.

## How it works

- Rules, legal moves and PGN: [chess.js](https://github.com/jhlywa/chess.js).
- Engine: Stockfish.js 19 *lite single-threaded* build (~1.9 MB) running in a Web Worker and driven over UCI (`src/engine.ts`). It needs no `COOP/COEP` headers, so it works on GitHub Pages.
- Storage: sessions are kept in `localStorage` under `chess-coach-ai:sessions:v1` (`src/storage.ts`).
- Analysis depth and time limit are set in the `engine.analyse(...)` call in `src/App.tsx` (default: depth 14, up to 4 s).

## Roadmap

Play against Stockfish with adjustable strength, tactics puzzles (Lichess open database, CC0), opening trainer with spaced repetition, PGN import and game review, endgame trainers.

## License

**GNU GPL v3 or later** — see [LICENSE](LICENSE). The repository bundles the Stockfish engine (GPLv3), so the whole project is distributed under the same terms.

Credits: [Stockfish](https://github.com/official-stockfish/Stockfish) (GPLv3), [Stockfish.js](https://github.com/nmrugg/stockfish.js) by Nathan Rugg / Chess.com (GPLv3), [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause), [React](https://react.dev/) and [Vite](https://vite.dev/) (MIT).
