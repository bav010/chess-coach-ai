import { Chess, type Color } from 'chess.js'
import { PIECE_VALUE, splitUci } from './game'

function balance(chess: Chess, color: Color): number {
  let sum = 0
  for (const row of chess.board()) for (const c of row) {
    if (c) sum += (c.color === color ? 1 : -1) * PIECE_VALUE[c.type]
  }
  return sum
}

/**
 * Жертва материала по варианту движка: на сколько единиц (П=1, К=С=3, Л=5, Ф=9) ходящий остаётся
 * «в минусе» после каждого ответа соперника в первых четырёх полуходах варианта (берётся наименьшее из
 * значений, поэтому временный размен, который тут же возвращается, жертвой не считается).
 * 0 — жертвы нет или вариант слишком короткий, чтобы судить.
 */
export function sacrificeValue(fenBefore: string, pv: readonly string[], mover: Color): number {
  let chess: Chess
  try { chess = new Chess(fenBefore) } catch { return 0 }
  const start = balance(chess, mover)
  let least = Infinity
  for (let i = 0; i < Math.min(pv.length, 4); i++) {
    try { chess.move(splitUci(pv[i])) } catch { break }
    if (i % 2 === 1) least = Math.min(least, start - balance(chess, mover))
  }
  return Number.isFinite(least) ? Math.max(0, least) : 0
}
