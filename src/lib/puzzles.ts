// Тактические задачи: типы, отбор, проверка ходов, подсказки.
// Каждая задача из базы проверена движком при подготовке (src/data/puzzles.json); проверка хода
// пользователя — по сохранённому решению, а отклонения (другой мат, другой выигрыш) проверяет Stockfish.
import { Chess } from 'chess.js'
import { winPercentFor } from './eval'
import { splitUci } from './game'
import { t, tn, type Key } from '../i18n'
import { THEME_IDEA, THEME_ORDER, balance, detectThemes, type ThemeId } from './puzzleThemes'
import { uciToSan } from './san'
import type { PuzzleStats } from './puzzleStats'

export type PuzzleKind = 'mate' | 'win' | 'defense'
export type Level = 1 | 2 | 3

export type Puzzle = {
  id: string
  /** Позиция, в которой ход решающего. */
  fen: string
  /** Решение, ходы UCI: ход решающего, ответ соперника, ход решающего, … */
  line: string[]
  themes: ThemeId[]
  kind: PuzzleKind
  /** Ходов до мата (для матовых задач). */
  mate: number | null
  level: Level
  /** Оценка после лучшего хода, сантипешки с точки зрения решающего (null — мат). */
  cp: number | null
  /** Пояснения для сообщения об успехе. */
  why: string[]
}

/** Названия сложности на текущем языке (геттеры). */
export const LEVEL_LABEL = {} as Record<Level, string>
for (const l of [1, 2, 3] as const) Object.defineProperty(LEVEL_LABEL, l, { enumerable: true, get: () => t(`puzzles.level.${l}`) })

export type MateFilter = 'any' | 'm1' | 'm2' | 'm3' | 'material'

export const MATE_FILTER_LABEL = {} as Record<MateFilter, string>
for (const m of ['any', 'm1', 'm2', 'm3', 'material'] as const) Object.defineProperty(MATE_FILTER_LABEL, m, { enumerable: true, get: () => t(`puzzles.mf.${m}`) })

export type PuzzleFilter = { theme: ThemeId | 'any'; level: Level | 0; mate: MateFilter }
export const ANY_FILTER: PuzzleFilter = { theme: 'any', level: 0, mate: 'any' }

export function matches(p: Puzzle, f: PuzzleFilter): boolean {
  if (f.theme !== 'any' && !p.themes.includes(f.theme)) return false
  if (f.level !== 0 && p.level !== f.level) return false
  if (f.mate === 'm1') return p.mate === 1
  if (f.mate === 'm2') return p.mate === 2
  if (f.mate === 'm3') return p.mate !== null && p.mate >= 3
  if (f.mate === 'material') return p.mate === null
  return true
}

/** Главная тема задачи — по порядку важности. */
export function mainTheme(p: Puzzle): ThemeId {
  const order: ThemeId[] = ['mateCombo', 'fork', 'pin', 'discovered', 'deflection', 'doubleAttack', 'defense', 'mate']
  return order.find(t => p.themes.includes(t)) ?? p.themes[0] ?? 'mate'
}

/** Следующая задача: сначала нерешённые, затем нерешавшиеся неудачно, затем любые; текущая исключается. */
export function pickNext(
  all: readonly Puzzle[], filter: PuzzleFilter, stats: PuzzleStats, excludeId: string | null, rnd: () => number = Math.random,
): Puzzle | null {
  const pool = all.filter(p => matches(p, filter) && p.id !== excludeId)
  if (pool.length === 0) return null
  const fresh = pool.filter(p => !stats.solvedIds.includes(p.id) && !stats.failedIds.includes(p.id))
  const failed = pool.filter(p => stats.failedIds.includes(p.id) && !stats.solvedIds.includes(p.id))
  const src = fresh.length ? fresh : failed.length ? failed : pool
  return src[Math.floor(rnd() * src.length)]
}

// ---------- проверка ходов ----------

export type EngineVerdict = { cp: number | null; mate: number | null; bestMove: string | null }
/** Оценка позиции с точки зрения стороны, чей ход. */
export type Evaluate = (fen: string) => Promise<EngineVerdict>

export type MoveJudgement =
  | { type: 'correct'; /** Ответ соперника (null — решение закончено ходом решающего). */ reply: string | null; done: boolean; alt: boolean }
  /** reason — ключ словаря (puzzles.reason.*); переводится при показе. */
  | { type: 'wrong'; reason: Key }
  | { type: 'unverified'; reason: Key }

/** Сколько ходов решающего содержит решение. */
export const solverMoves = (p: Puzzle) => Math.ceil(p.line.length / 2)

const ALT_WIN_TOLERANCE = 7 // п.п. шансов на победу

function fenAfter(fen: string, uci: string): Chess | null {
  try {
    const c = new Chess(fen)
    c.move(splitUci(uci))
    return c
  } catch { return null }
}

/**
 * Оценивает ход решающего. `played` — уже сыгранные полуходы решения (решающий, ответ, …), `fen` —
 * позиция перед ходом. Совпадение с сохранённым решением — верно без движка; иное — проверяется
 * движком: другой мат не длиннее, или выигрыш/защита с потерей не больше допуска.
 */
export async function judgeMove(p: Puzzle, played: readonly string[], fen: string, uci: string, evaluate: Evaluate): Promise<MoveJudgement> {
  const i = played.length
  const onScript = played.every((m, k) => m === p.line[k])
  const after = fenAfter(fen, uci)
  if (!after) return { type: 'wrong', reason: 'puzzles.reason.illegal' }

  if (onScript && uci === p.line[i]) {
    const reply = p.line[i + 1] ?? null
    return { type: 'correct', reply, done: after.isCheckmate() || i + 2 >= p.line.length, alt: false }
  }
  if (after.isCheckmate()) return { type: 'correct', reply: null, done: true, alt: !onScript || uci !== p.line[i] }

  const made = i / 2 + 1 // сколько ходов решающего уже сделано, включая этот
  if (p.kind === 'mate' && p.mate !== null && made >= p.mate) return { type: 'wrong', reason: 'puzzles.reason.notInTime' }
  if (after.isDraw() || after.isGameOver()) return { type: 'wrong', reason: 'puzzles.reason.draw' }

  let v: EngineVerdict
  try { v = await evaluate(after.fen()) } catch { return { type: 'unverified', reason: 'puzzles.reason.unverified' } }

  // v — с точки зрения соперника (его очередь)
  const solverMate = v.mate !== null && v.mate < 0 ? -v.mate : null
  const solverCp = v.cp === null ? null : -v.cp
  let ok = false
  if (p.kind === 'mate' && p.mate !== null) {
    ok = solverMate !== null && solverMate <= p.mate - made
  } else {
    const target = p.cp ?? 300
    const winNow = solverMate !== null ? 100 : v.mate !== null ? 0 : winPercentFor({ cp: solverCp, mate: null }, 'w')
    const winBest = winPercentFor({ cp: target, mate: null }, 'w')
    ok = winNow >= winBest - ALT_WIN_TOLERANCE && (p.kind === 'defense' || (solverCp ?? 10_000) >= 150)
  }
  if (!ok) return { type: 'wrong', reason: p.kind === 'mate' ? 'puzzles.reason.notMate' : 'puzzles.reason.losesWin' }

  const reply = v.bestMove
  const done = made >= solverMoves(p)
  return { type: 'correct', reply: done && p.kind !== 'defense' ? null : reply, done, alt: true }
}

// ---------- подсказки ----------

export type Hint = { level: 1 | 2 | 3; text: string; square?: string; target?: string }

export const MAX_HINT = 3

/** Подсказка нужного уровня для текущего хода решающего (idx — номер полухода решения). */
export function hintFor(p: Puzzle, fen: string, level: 1 | 2 | 3, idx = 0): Hint {
  const uci = p.line[idx]
  if (level === 1) {
    const t = mainTheme(p)
    const base = p.mate !== null ? `${tn('puzzles.hint.mateIn', p.mate)} ` : ''
    return { level, text: `${base}${THEME_IDEA[t]}` }
  }
  if (!uci) return { level, text: '' }
  const { from, to } = splitUci(uci)
  const piece = new Chess(fen).get(from)
  const name = piece ? t(`puzzles.pc.nom.${piece.type}`) : t('puzzles.pc.any')
  if (level === 2) return { level, text: t('puzzles.hint.piece', { from, name }), square: from }
  return { level, text: t('puzzles.hint.move', { san: uciToSan(fen, uci) ?? uci, from, to }), square: from, target: to }
}

/** Решение в виде записи ходов: «23.Qxh7+ Kxh7 24.Rh3#». */
export function solutionSan(p: Puzzle): string {
  const c = new Chess(p.fen)
  let n = Number(p.fen.split(' ')[5]) || 1
  const out: string[] = []
  p.line.forEach((u, i) => {
    const white = c.turn() === 'w'
    const m = c.move(splitUci(u))
    out.push(white ? `${n}.${m.san}` : i === 0 ? `${n}...${m.san}` : m.san)
    if (!white) n++
  })
  return out.join(' ')
}

export const THEMES_FOR_UI: ThemeId[] = THEME_ORDER

/**
 * Пояснение к решению на текущем языке: строится по позиции и линии (а не берётся из сохранённого текста),
 * поэтому при смене языка меняется без перезагрузки. Если определение тем разошлось с базой — показываем сохранённое.
 */
export function puzzleWhy(p: Puzzle): string[] {
  try {
    const det = detectThemes(p.fen, p.line, { mate: p.kind === 'mate' ? p.mate : null, defense: p.kind === 'defense' })
    if (det.explain.length === 0 || det.themes.join() !== p.themes.join()) return p.why
    const out = [...det.explain]
    if (p.kind === 'win') {
      const c = new Chess(p.fen)
      const solver = c.turn()
      const base = balance(c, solver)
      for (const u of p.line) c.move(splitUci(u))
      out.push(t('puzzles.why.result', { gain: balance(c, solver) - base }))
    }
    return out
  } catch { return p.why }
}
