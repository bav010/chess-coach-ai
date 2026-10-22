import PUZZLES from '../data/puzzles.json'
import { dayKey } from './activity'
import type { Puzzle } from './puzzles'

const ALL = PUZZLES as unknown as Puzzle[]

/** Задача дня: одна и та же в течение местных суток, берётся из проверенной базы. */
export function dailyPuzzle(date = new Date()): Puzzle | null {
  if (!ALL.length) return null
  let h = 5381
  for (const ch of dayKey(date)) h = ((h << 5) + h + ch.charCodeAt(0)) | 0
  return ALL[(h >>> 0) % ALL.length]
}
