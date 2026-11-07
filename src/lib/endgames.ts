// Тренажёр эндшпилей: наборы позиций (src/data/endgames.json), проверенные движком Stockfish при генерации
// (scripts/build-endgames.mjs), правила успеха и прогресс ученика. Чистая логика без React.
import type { Chess, Color } from 'chess.js'
import raw from '../data/endgames.json'
import { pk } from './profile'
import { isDue, newCard, schedule, urgency, type CardState, type Grade } from './srs'

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
/** `cards` — расписание повторений (интервальное повторение, как у «Моих ошибок»); у старых сохранений его нет. */
export type EgProgress = { v: 1; solved: Record<string, { at: number; hints: number }>; tries: Record<string, number>; cards?: Record<string, CardState> }
const KEY = 'chess-coach-ai:endgames:v1'
export const EMPTY_EG: EgProgress = { v: 1, solved: {}, tries: {} }
const empty = (): EgProgress => ({ v: 1, solved: {}, tries: {} })

export function loadProgress(): EgProgress {
  try {
    const d = JSON.parse(localStorage.getItem(pk(KEY)) ?? 'null') as Partial<EgProgress> | null
    if (!d || d.v !== 1) return empty()
    return { v: 1, solved: d.solved && typeof d.solved === 'object' ? d.solved : {}, tries: d.tries && typeof d.tries === 'object' ? d.tries : {}, ...(d.cards && typeof d.cards === 'object' ? { cards: d.cards } : {}) }
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

// --- интервальное повторение ---
/**
 * Итог попытки для расписания: решено без подсказок — «good» (интервалы 1, 3, 7… дней), с подсказками — «hard»,
 * не решено (мат ученику, ничья в выигрышной позиции) — «again» (вернётся через 10 минут).
 */
export function gradeEndgame(p: EgProgress, id: string, grade: Grade, now = Date.now()): EgProgress {
  if (!entryById(id)) return p
  return { ...p, cards: { ...p.cards, [id]: schedule(p.cards?.[id] ?? newCard(now), grade, now) } }
}
/** Позиции, которые пора повторить (уже были в тренировке), самые срочные первыми. */
export function dueEndgames(p: EgProgress, now = Date.now()): EndgameEntry[] {
  const cards = p.cards ?? {}
  return ENTRIES.filter(e => cards[e.id] && isDue(cards[e.id], now)).sort((a, b) => urgency(cards[b.id], now) - urgency(cards[a.id], now))
}
/** Первая нерешённая позиция в порядке тем (для «новой» позиции в плане дня). */
export function firstNew(p: EgProgress): EndgameEntry | null {
  for (const g of GROUPS) for (const t of g.topics) { const e = entriesOf(t).find(x => !p.solved[x.id] && !p.cards?.[x.id]); if (e) return e }
  return null
}
/** Объединение двух устройств: решённое — объединением (раньше и с меньшим числом подсказок), карточки — где тренировались позже. */
export function mergeEgProgress(a: EgProgress, b: EgProgress): EgProgress {
  const solved: EgProgress['solved'] = { ...b.solved }
  for (const [k, v] of Object.entries(a.solved)) { const o = solved[k]; solved[k] = o ? { at: Math.min(o.at, v.at), hints: Math.min(o.hints, v.hints) } : v }
  const tries: Record<string, number> = { ...b.tries }
  for (const [k, v] of Object.entries(a.tries)) tries[k] = Math.max(tries[k] ?? 0, v)
  const cards: Record<string, CardState> = { ...b.cards }
  for (const [k, v] of Object.entries(a.cards ?? {})) { const o = cards[k]; cards[k] = !o || v.last >= o.last ? v : o }
  return { v: 1, solved, tries, ...(Object.keys(cards).length ? { cards } : {}) }
}
