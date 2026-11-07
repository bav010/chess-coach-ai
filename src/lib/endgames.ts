// Тренажёр эндшпилей: наборы позиций (src/data/endgames.json), проверенные движком Stockfish при генерации
// (scripts/build-endgames.mjs), правила успеха и прогресс ученика. Чистая логика без React.
import type { Chess, Color } from 'chess.js'
import raw from '../data/endgames.json'
import { pk } from './profile'

export type Goal = 'win' | 'draw'
export type EndgameEntry = {
  id: string
  topic: string
  group: string
  goal: Goal
  /** Кем играет ученик. */
  user: Color
  level: 1 | 2 | 3
  fen: string
  /** Оценка движка при проверке (с точки зрения ученика): цель «win» — мат или ≥ +3 пешки, «draw» — около нуля. */
  eval: { cp: number | null; mate: number | null; depth: number }
}

export const ENTRIES: readonly EndgameEntry[] = (raw as { entries: EndgameEntry[] }).entries

/** Темы в порядке показа, сгруппированы по разделам. */
export const GROUPS: { id: string; topics: string[] }[] = [
  { id: 'basic', topics: ['kqk', 'krk', 'kbbk', 'kbnk'] },
  { id: 'pawn', topics: ['opposition', 'oppdraw', 'kpk', 'rookpawn'] },
  { id: 'rook', topics: ['lucena', 'philidor'] },
  { id: 'queen', topics: ['qvpawn', 'kqkr'] },
  { id: 'bishop', topics: ['wrongbishop'] },
]

export const entriesOf = (topic: string): EndgameEntry[] => ENTRIES.filter(e => e.topic === topic)
export const entryById = (id: string | null | undefined): EndgameEntry | null => (id ? ENTRIES.find(e => e.id === id) ?? null : null)

/** Сколько ходов нужно продержаться в позиции с целью «ничья» (если ничья по правилам не наступила раньше). */
export const HOLD_MOVES = 30

export type Verdict = 'playing' | 'solved' | 'lost' | 'drawn' | 'failed'

/**
 * Итог по позиции. Цель «win»: мат ученика — успех, любая ничья — «drawn» (не получилось выиграть), мат ученику — «lost».
 * Цель «draw»: ничья по правилам или HOLD_MOVES ходов без поражения — успех, мат ученику — «lost».
 * `userMoves` — сколько ходов сделал ученик.
 */
export function judge(chess: Chess, e: Pick<EndgameEntry, 'goal' | 'user'>, userMoves: number): Verdict {
  if (chess.isCheckmate()) return chess.turn() === e.user ? 'lost' : 'solved'
  if (chess.isGameOver()) return e.goal === 'draw' ? 'solved' : 'drawn'
  if (e.goal === 'draw' && userMoves >= HOLD_MOVES) return 'solved'
  return 'playing'
}

// --- прогресс ---
export type EgProgress = { v: 1; solved: Record<string, { at: number; hints: number }>; tries: Record<string, number> }
const KEY = 'chess-coach-ai:endgames:v1'
const empty = (): EgProgress => ({ v: 1, solved: {}, tries: {} })

export function loadProgress(): EgProgress {
  try {
    const d = JSON.parse(localStorage.getItem(pk(KEY)) ?? 'null') as Partial<EgProgress> | null
    if (!d || d.v !== 1) return empty()
    return { v: 1, solved: d.solved && typeof d.solved === 'object' ? d.solved : {}, tries: d.tries && typeof d.tries === 'object' ? d.tries : {} }
  } catch { return empty() }
}
export function saveProgress(p: EgProgress) { try { localStorage.setItem(pk(KEY), JSON.stringify(p)) } catch { /* ничего */ } }

export function markTry(p: EgProgress, id: string): EgProgress { return { ...p, tries: { ...p.tries, [id]: (p.tries[id] ?? 0) + 1 } } }
export function markSolved(p: EgProgress, id: string, hints: number, now = Date.now()): EgProgress {
  const prev = p.solved[id]
  return { ...p, solved: { ...p.solved, [id]: { at: prev?.at ?? now, hints: prev ? Math.min(prev.hints, hints) : hints } } }
}
export const solvedCount = (p: EgProgress, topic: string): number => entriesOf(topic).filter(e => p.solved[e.id]).length
/** Следующая нерешённая позиция темы после `afterId` (по кругу); null, если все решены. */
export function nextUnsolved(p: EgProgress, topic: string, afterId?: string): EndgameEntry | null {
  const list = entriesOf(topic); if (!list.length) return null
  const start = afterId ? list.findIndex(e => e.id === afterId) + 1 : 0
  for (let i = 0; i < list.length; i++) { const e = list[(start + i) % list.length]; if (!p.solved[e.id] && e.id !== afterId) return e }
  return null
}
