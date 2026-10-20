import type { Color, PieceSymbol } from 'chess.js'
import { t } from '../i18n'

/** Символы фигур для доски (контурные — белые, заливка — чёрные). */
export const glyph: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
}

/** Заливные значки для списков взятых фигур (цвет задаётся стилем). */
const FILLED: Record<PieceSymbol, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
export const capturedGlyph = (type: PieceSymbol): string => FILLED[type]

/** Названия фигур на текущем языке (читаются в момент обращения, поэтому следуют за сменой языка). */
export const PIECE_NAME = {} as Record<PieceSymbol, string>
for (const k of ['p', 'n', 'b', 'r', 'q', 'k'] as const) {
  Object.defineProperty(PIECE_NAME, k, { enumerable: true, get: () => t(`analysis.piece.${k}`) })
}

export const colorName = (c: Color): string => t(`analysis.color.${c}`)

/** «белых» / «чёрных» — для оборотов «оценка для …», «ход за …». */
export const colorGen = (c: Color): string => t(`analysis.colorGen.${c}`)
