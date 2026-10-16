// Кэш результатов анализа по позициям: позволяет не пересчитывать то, что уже посчитано
// (переходы по истории, скрытие/показ панели, разбор партии, тренировка).
import { Chess } from 'chess.js'
import type { Analysis, PvLine } from '../engine'

export type CacheEntry = {
  /** Линии с точки зрения стороны, чей ход. */
  lines: PvLine[]
  depth: number
  multipv: number
  /** Поиск завершён сам (а не прерван пользователем). */
  complete: boolean
  /** Лимит времени, с которым считали, мс — чтобы быстрые результаты не подменяли глубокие. */
  movetime: number
}

const store = new Map<string, CacheEntry>()

/** Ключ позиции: без счётчиков ходов, чтобы совпадали транспозиции. */
export const positionKey = (fen: string): string => fen.split(' ').slice(0, 4).join(' ')

export function peekCache(fen: string): CacheEntry | undefined {
  return store.get(positionKey(fen))
}

/** Готовый результат, если он не хуже запрошенного. */
export function getCached(fen: string, multipv: number, movetime: number): CacheEntry | undefined {
  const e = store.get(positionKey(fen))
  return e && e.complete && e.multipv >= multipv && e.movetime >= movetime ? e : undefined
}

export function putCache(fen: string, a: Analysis, multipv: number, movetime: number, complete: boolean) {
  if (a.lines.length === 0) return
  const key = positionKey(fen)
  const old = store.get(key)
  // не затираем более полный результат прерванным
  if (old && old.complete && !complete && old.multipv >= multipv) return
  store.set(key, { lines: a.lines, depth: a.depth, multipv, complete, movetime })
}

export function clearCache() {
  store.clear()
}

/** Позиция, в которой движку нечего считать (мат, пат, нет материала). */
export function isTerminalFen(fen: string): boolean {
  try {
    const c = new Chess(fen)
    return c.isCheckmate() || c.isStalemate() || c.isInsufficientMaterial()
  } catch {
    return true
  }
}
