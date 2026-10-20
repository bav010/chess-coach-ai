// Произвольная расстановка фигур: модель, перевод в FEN и проверка допустимости позиции.
import { t } from '../i18n'
import { Chess, type Color, type Square } from 'chess.js'
import { START_FEN } from './game'

/** 64 клетки в порядке FEN: a8, b8, … h8, a7, … h1. Значение — «wk», «bp» и т. п. или null. */
export type Cells = (string | null)[]

export type Castling = { K: boolean; Q: boolean; k: boolean; q: boolean }

export type Setup = { cells: Cells; turn: Color; castling: Castling }

export const emptySetup = (): Setup => ({ cells: Array<string | null>(64).fill(null), turn: 'w', castling: { K: false, Q: false, k: false, q: false } })

export const squareIndex = (sq: string): number => (8 - Number(sq[1])) * 8 + (sq.charCodeAt(0) - 97)
export const indexSquare = (i: number): Square => `${'abcdefgh'[i % 8]}${8 - Math.floor(i / 8)}` as Square

export function setupFromFen(fen: string): Setup {
  const parts = fen.trim().split(/\s+/)
  const rows = (parts[0] ?? '').split('/')
  if (rows.length !== 8) throw new Error(t('play.pos.rows'))
  const cells: Cells = []
  for (const row of rows) {
    let n = 0
    for (const ch of row) {
      if (/[1-8]/.test(ch)) { for (let k = 0; k < Number(ch); k++) cells.push(null); n += Number(ch) }
      else if (/[pnbrqkPNBRQK]/.test(ch)) { cells.push(`${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toLowerCase()}`); n++ }
      else throw new Error(t('play.pos.badChar', { ch }))
    }
    if (n !== 8) throw new Error(t('play.pos.rowLen'))
  }
  const turn: Color = parts[1] === 'b' ? 'b' : 'w'
  const c = parts[2] ?? '-'
  return { cells, turn, castling: { K: c.includes('K'), Q: c.includes('Q'), k: c.includes('k'), q: c.includes('q') } }
}

/** Права на рокировку, которые возможны при данной расстановке (король и ладья на местах). */
export function feasibleCastling(cells: Cells): Castling {
  const at = (sq: string) => cells[squareIndex(sq)]
  return {
    K: at('e1') === 'wk' && at('h1') === 'wr',
    Q: at('e1') === 'wk' && at('a1') === 'wr',
    k: at('e8') === 'bk' && at('h8') === 'br',
    q: at('e8') === 'bk' && at('a8') === 'br',
  }
}

export function setupToFen(s: Setup): string {
  const rows: string[] = []
  for (let r = 0; r < 8; r++) {
    let row = '', empty = 0
    for (let f = 0; f < 8; f++) {
      const c = s.cells[r * 8 + f]
      if (!c) { empty++; continue }
      if (empty) { row += empty; empty = 0 }
      row += c[0] === 'w' ? c[1].toUpperCase() : c[1]
    }
    if (empty) row += empty
    rows.push(row)
  }
  const ok = feasibleCastling(s.cells)
  const rights = `${s.castling.K && ok.K ? 'K' : ''}${s.castling.Q && ok.Q ? 'Q' : ''}${s.castling.k && ok.k ? 'k' : ''}${s.castling.q && ok.q ? 'q' : ''}` || '-'
  return `${rows.join('/')} ${s.turn} ${rights} - 0 1`
}

/** Текст ошибки, если позицию нельзя анализировать, иначе null. */
export function validateSetup(s: Setup): string | null {
  const count = (code: string) => s.cells.filter(c => c === code).length
  if (count('wk') !== 1) return count('wk') === 0 ? t('play.pos.noWK') : t('play.pos.manyWK')
  if (count('bk') !== 1) return count('bk') === 0 ? t('play.pos.noBK') : t('play.pos.manyBK')
  for (let i = 0; i < 8; i++) {
    for (const j of [i, 56 + i]) if (s.cells[j]?.[1] === 'p') return t('play.pos.pawnRank')
  }
  for (const c of ['w', 'b']) {
    if (count(`${c}p`) > 8) return t(c === 'w' ? 'play.pos.pawnsW' : 'play.pos.pawnsB')
    if (s.cells.filter(x => x?.[0] === c).length > 16) return t(c === 'w' ? 'play.pos.piecesW' : 'play.pos.piecesB')
  }
  let chess: Chess
  try { chess = new Chess(setupToFen(s)) } catch { return t('play.pos.load') }
  // сторона, которая не ходит, не может стоять под шахом
  const idle: Color = s.turn === 'w' ? 'b' : 'w'
  const king = indexSquare(s.cells.indexOf(`${idle}k`))
  if (chess.isAttacked(king, s.turn)) return t(idle === 'w' ? 'play.pos.checkW' : 'play.pos.checkB')
  return null
}

export const START_SETUP = (): Setup => setupFromFen(START_FEN)
