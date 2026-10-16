import { Chess, type PieceSymbol } from 'chess.js'
import { splitUci } from './game'

/** Переводит вариант из UCI в SAN на копии позиции; останавливается на первом нелегальном ходе. */
export function pvToSan(fen: string, pvUci: readonly string[], maxPlies = 8): string[] {
  let walker: Chess
  try { walker = new Chess(fen) } catch { return [] }
  const out: string[] = []
  for (const uci of pvUci.slice(0, maxPlies)) {
    try { out.push(walker.move(splitUci(uci)).san) } catch { break }
  }
  return out
}

/** Один ход UCI → SAN в заданной позиции (или null). */
export function uciToSan(fen: string, uci: string | null | undefined): string | null {
  if (!uci) return null
  return pvToSan(fen, [uci], 1)[0] ?? null
}

/** Вариант с номерами ходов: «12. Nf3 Nc6 13. d4». */
export function formatPv(fen: string, pvUci: readonly string[], maxPlies = 8): string {
  const san = pvToSan(fen, pvUci, maxPlies)
  if (san.length === 0) return ''
  const parts = fen.split(' ')
  let moveNo = Number(parts[5]) || 1
  let white = parts[1] !== 'b'
  const out: string[] = []
  san.forEach((s, i) => {
    if (white) out.push(`${moveNo}.`)
    else if (i === 0) out.push(`${moveNo}...`)
    out.push(s)
    if (!white) moveNo++
    white = !white
  })
  return out.join(' ')
}

export type { PieceSymbol }
