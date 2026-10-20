import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getLang, setLang } from '../i18n'
import { START_FEN } from './game'
import { emptySetup, indexSquare, setupFromFen, setupToFen, squareIndex, validateSetup } from './position'

describe('position', () => {
  const prev = getLang()
  beforeAll(() => setLang('en'))
  afterAll(() => setLang(prev))
  it('FEN туда и обратно (начальная позиция)', () => {
    expect(setupToFen(setupFromFen(START_FEN))).toBe(START_FEN)
  })
  it('индексы клеток', () => {
    expect(squareIndex('a8')).toBe(0); expect(squareIndex('h1')).toBe(63); expect(indexSquare(squareIndex('e4'))).toBe('e4')
  })
  it('начальная позиция допустима, пустая — нет', () => {
    expect(validateSetup(setupFromFen(START_FEN))).toBeNull()
    expect(validateSetup(emptySetup())).toMatch(/king/)
  })
  it('два короля, пешка на последней линии, шах стороне не на ходу — ошибки', () => {
    const s = setupFromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1')
    const two = { ...s, cells: s.cells.slice() }; two.cells[squareIndex('a1')] = 'wk'
    expect(validateSetup(two)).toMatch(/exactly/)
    const pawn = { ...s, cells: s.cells.slice() }; pawn.cells[squareIndex('a8')] = 'wp'
    expect(validateSetup(pawn)).toMatch(/Pawns/)
    // чёрный король под шахом ладьи, а ходят белые
    expect(validateSetup(setupFromFen('4k3/8/8/8/8/8/8/4RK2 w - - 0 1'))).toMatch(/in check/)
    expect(validateSetup(setupFromFen('4k3/8/8/8/8/8/8/4RK2 b - - 0 1'))).toBeNull()
  })
  it('невозможные права на рокировку отбрасываются', () => {
    const s = setupFromFen('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1')
    expect(setupToFen(s)).toBe('4k3/8/8/8/8/8/8/4K3 w - - 0 1')
  })
  it('понятные ошибки для неверного FEN', () => {
    expect(() => setupFromFen('abc')).toThrow(/8 ranks/)
    expect(() => setupFromFen('9/8/8/8/8/8/8/8 w - - 0 1')).toThrow()
  })
  it('сообщения следуют языку', () => {
    setLang('ru')
    expect(validateSetup(emptySetup())).toMatch(/короля/)
    setLang('en')
    expect(validateSetup(emptySetup())).toMatch(/king/)
  })
})
