// «Зрение доски»: тренировка координат, ходов коня и полей, которые бьёт фигура. Чистая логика без React.
import { pk } from './profile'

export type Sq = string // 'a1'…'h8'
export type Rng = () => number
export const FILES = 'abcdefgh'
export const ALL_SQUARES: readonly Sq[] = FILES.split('').flatMap(f => [1, 2, 3, 4, 5, 6, 7, 8].map(r => `${f}${r}`))
const fileOf = (s: Sq) => s.charCodeAt(0) - 97
const rankOf = (s: Sq) => Number(s[1]) - 1
const sq = (f: number, r: number): Sq | null => (f < 0 || f > 7 || r < 0 || r > 7 ? null : `${FILES[f]}${r + 1}`)

export function randomSquare(rng: Rng = Math.random, not: readonly Sq[] = []): Sq {
  const pool = ALL_SQUARES.filter(s => !not.includes(s))
  return pool[Math.floor(rng() * pool.length)]
}

// --- конь ---
const KN: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
export function knightMoves(from: Sq): Sq[] {
  return KN.map(([df, dr]) => sq(fileOf(from) + df, rankOf(from) + dr)).filter((s): s is Sq => s !== null)
}
/** Наименьшее число ходов коня между клетками (обход в ширину). */
export function knightDistance(a: Sq, b: Sq): number {
  if (a === b) return 0
  const seen = new Set<Sq>([a]); let layer: Sq[] = [a]
  for (let d = 1; d <= 6; d++) {
    const next: Sq[] = []
    for (const s of layer) for (const n of knightMoves(s)) { if (n === b) return d; if (!seen.has(n)) { seen.add(n); next.push(n) } }
    layer = next
  }
  return 6
}
/** Пара клеток для задачи «доведи коня»: расстояние от 2 до 4 ходов. */
export function knightPuzzle(rng: Rng = Math.random): { from: Sq; to: Sq; best: number } {
  for (;;) {
    const from = randomSquare(rng), to = randomSquare(rng, [from]), best = knightDistance(from, to)
    if (best >= 2 && best <= 4) return { from, to, best }
  }
}

// --- какие поля бьёт фигура на пустой доске ---
export type VPiece = 'n' | 'b' | 'r' | 'q' | 'k'
export const VPIECES: readonly VPiece[] = ['n', 'b', 'r', 'q', 'k']
const RAYS: Record<'b' | 'r' | 'q', [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
}
export function attacks(piece: VPiece, from: Sq): Sq[] {
  if (piece === 'n') return knightMoves(from)
  if (piece === 'k') return RAYS.q.map(([df, dr]) => sq(fileOf(from) + df, rankOf(from) + dr)).filter((s): s is Sq => s !== null)
  const out: Sq[] = []
  for (const [df, dr] of RAYS[piece]) for (let k = 1; k < 8; k++) { const s = sq(fileOf(from) + df * k, rankOf(from) + dr * k); if (!s) break; out.push(s) }
  return out
}
export function attackPuzzle(rng: Rng = Math.random): { piece: VPiece; from: Sq } {
  const piece = VPIECES[Math.floor(rng() * VPIECES.length)]
  return { piece, from: randomSquare(rng) }
}
/** Сравнение ответа с правильным набором: верные, лишние и пропущенные клетки. */
export function gradeAttacks(answer: readonly Sq[], truth: readonly Sq[]): { ok: Sq[]; extra: Sq[]; missed: Sq[]; perfect: boolean } {
  const a = new Set(answer), t = new Set(truth)
  const ok = [...a].filter(s => t.has(s)), extra = [...a].filter(s => !t.has(s)), missed = [...t].filter(s => !a.has(s))
  return { ok, extra, missed, perfect: extra.length === 0 && missed.length === 0 }
}

// --- результаты ---
export type VisionGame = 'coords' | 'knight' | 'attacks'
export type VisionRun = { game: VisionGame; score: number; of?: number; at: number }
export type VisionStore = { v: 1; best: Partial<Record<VisionGame, number>>; runs: VisionRun[] }
export const EMPTY_VISION: VisionStore = { v: 1, best: {}, runs: [] }
export const MAX_RUNS = 30
const KEY = 'chess-coach-ai:vision:v1'

export function recordRun(s: VisionStore, r: VisionRun): { store: VisionStore; record: boolean } {
  const prev = s.best[r.game]
  const record = r.score > 0 && (prev === undefined || r.score > prev)
  return { store: { v: 1, best: record ? { ...s.best, [r.game]: r.score } : s.best, runs: [r, ...s.runs].slice(0, MAX_RUNS) }, record }
}
export function loadVision(): VisionStore {
  try {
    const d = JSON.parse(localStorage.getItem(pk(KEY)) ?? 'null') as VisionStore | null
    return d && d.v === 1 && d.best && Array.isArray(d.runs) ? d : EMPTY_VISION
  } catch { return EMPTY_VISION }
}
export function saveVision(s: VisionStore) { try { localStorage.setItem(pk(KEY), JSON.stringify(s)) } catch { /* хранилище недоступно */ } }
