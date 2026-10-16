import type { Color, PieceSymbol } from 'chess.js'

/** Символы фигур для доски (контурные — белые, заливка — чёрные). */
export const glyph: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
}

/** Заливные значки для списков взятых фигур (цвет задаётся стилем). */
const FILLED: Record<PieceSymbol, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
export const capturedGlyph = (type: PieceSymbol): string => FILLED[type]

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король',
}

export const colorName = (c: Color): string => (c === 'w' ? 'белые' : 'чёрные')

/** «белых» / «чёрных» — для оборотов «оценка для …», «ход за …». */
export const colorGen = (c: Color): string => (c === 'w' ? 'белых' : 'чёрных')
