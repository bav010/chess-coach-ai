import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { BOOK_LINES, isBookMove } from './book'
import { START_FEN } from './game'

describe('книга дебютов', () => {
  it('все линии корректны и разыгрываются целиком', () => {
    for (const line of BOOK_LINES) {
      const chess = new Chess()
      for (const san of line.split(' ')) expect(() => chess.move(san), `${line} @ ${san}`).not.toThrow()
    }
  })
  it('определяет теоретические ходы и не путает с чужими', () => {
    const c = new Chess()
    const before = c.fen()
    c.move('e4')
    expect(isBookMove(before, c.fen(), 1)).toBe(true)
    const odd = new Chess()
    odd.move('h4')
    expect(isBookMove(START_FEN, odd.fen(), 1)).toBe(false)
  })
  it('после выхода из книги ходы не считаются дебютными', () => {
    const c = new Chess()
    for (const m of ['e4', 'e5', 'Nf3', 'Nc6']) c.move(m)
    const before = c.fen()
    c.move('a3')
    expect(isBookMove(before, c.fen(), 5)).toBe(false)
  })
})
