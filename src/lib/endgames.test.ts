import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { ENTRIES, GROUPS, HOLD_MOVES, entriesOf, judge, markSolved, markTry, nextUnsolved, solvedCount, type EgProgress } from './endgames'

const kingOf = (c: Chess, color: 'w' | 'b') => c.board().flat().find(x => x && x.type === 'k' && x.color === color)!

describe('набор эндшпилей', () => {
  it('позиции законны: оба короля, партия не окончена, нет шаха стороне, которая не ходит', () => {
    expect(ENTRIES.length).toBeGreaterThan(40)
    for (const e of ENTRIES) {
      const c = new Chess(e.fen)
      expect(c.isGameOver(), e.id).toBe(false)
      const other = c.turn() === 'w' ? 'b' : 'w'
      expect(c.isAttacked(kingOf(c, other).square, c.turn()), e.id).toBe(false)
    }
  })
  it('id уникальны, темы из групп существуют, у каждой темы есть позиции', () => {
    expect(new Set(ENTRIES.map(e => e.id)).size).toBe(ENTRIES.length)
    for (const g of GROUPS) for (const t of g.topics) expect(entriesOf(t).length, t).toBeGreaterThan(0)
    for (const e of ENTRIES) expect(GROUPS.some(g => g.topics.includes(e.topic)), e.id).toBe(true)
  })
  it('каждая позиция проверена движком: цель согласована с оценкой', () => {
    for (const e of ENTRIES) {
      expect(e.eval.depth, e.id).toBeGreaterThanOrEqual(22)
      if (e.goal === 'win') expect((e.eval.mate !== null && e.eval.mate > 0) || (e.eval.cp ?? 0) >= 300, e.id).toBe(true)
      else expect(e.eval.mate === null && Math.abs(e.eval.cp ?? 99) <= 15, e.id).toBe(true)
    }
  })
  it('ученик защищается за чёрных в задачах на ничью и атакует за белых в задачах на выигрыш', () => {
    for (const e of ENTRIES) expect(e.user, e.id).toBe(e.goal === 'draw' ? 'b' : 'w')
  })
  it('материал соответствует теме', () => {
    const count = (fen: string) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').split('').sort().join('')
    const want: Record<string, string> = { kqk: 'KQk', krk: 'KRk', kbbk: 'BBKk', kbnk: 'BKNk', kqkr: 'KQkr', qvpawn: 'KQkp', wrongbishop: 'BKPk', lucena: 'KPRkr', philidor: 'KPRkr', kpk: 'KPk' }
    for (const e of ENTRIES) if (want[e.topic]) expect(count(e.fen), e.id).toBe(want[e.topic].split('').sort().join(''))
  })
})

describe('judge', () => {
  const win = { goal: 'win' as const, user: 'w' as const }
  const draw = { goal: 'draw' as const, user: 'b' as const }
  it('мат ученика — успех, мат ученику — поражение', () => {
    expect(judge(new Chess('k7/8/1K6/8/8/8/8/Q7 w - - 0 1'), win, 3)).toBe('playing')
    expect(judge(new Chess('R5k1/8/6K1/8/8/8/8/8 b - - 0 1'), win, 3)).toBe('solved')
    expect(judge(new Chess('R5k1/8/6K1/8/8/8/8/8 b - - 0 1'), { goal: 'draw', user: 'b' }, 3)).toBe('lost')
  })
  it('пат при цели «выиграть» — не успех, при цели «ничья» — успех', () => {
    const stalemate = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'
    expect(judge(new Chess(stalemate), win, 3)).toBe('drawn')
    expect(judge(new Chess(stalemate), draw, 3)).toBe('solved')
  })
  it('в задаче на ничью нужно продержаться HOLD_MOVES ходов', () => {
    const c = new Chess('4k3/8/1r6/3KP3/8/8/8/R7 b - - 0 1')
    expect(judge(c, draw, HOLD_MOVES - 1)).toBe('playing')
    expect(judge(c, draw, HOLD_MOVES)).toBe('solved')
    expect(judge(c, win, HOLD_MOVES)).toBe('playing')
  })
})

describe('прогресс', () => {
  it('считает решённые, хранит лучшее число подсказок и выбирает следующую нерешённую', () => {
    let p: EgProgress = { v: 1, solved: {}, tries: {} }
    const ids = entriesOf('kqk').map(e => e.id)
    p = markTry(p, ids[0]); p = markTry(p, ids[0])
    expect(p.tries[ids[0]]).toBe(2)
    p = markSolved(p, ids[0], 2, 100); p = markSolved(p, ids[0], 1, 200)
    expect(p.solved[ids[0]]).toEqual({ at: 100, hints: 1 })
    expect(solvedCount(p, 'kqk')).toBe(1)
    expect(nextUnsolved(p, 'kqk', ids[0])?.id).toBe(ids[1])
    for (const id of ids) p = markSolved(p, id, 0)
    expect(nextUnsolved(p, 'kqk')).toBeNull()
  })
})
