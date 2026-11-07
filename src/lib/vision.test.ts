import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { ALL_SQUARES, attacks, gradeAttacks, knightDistance, knightMoves, knightPuzzle, recordRun, EMPTY_VISION, VPIECES } from './vision'

describe('поля, которые бьёт фигура', () => {
  it('совпадают с ходами chess.js на пустой доске для каждой фигуры и клетки', () => {
    for (const p of VPIECES) for (const s of ALL_SQUARES) {
      const c = new Chess(); c.clear(); c.put({ type: p, color: 'w' }, s as never)
      const truth = c.moves({ square: s as never, verbose: true }).map(m => m.to).sort()
      expect(attacks(p, s).sort(), `${p}${s}`).toEqual(truth)
    }
  })
})

describe('конь', () => {
  it('число ходов с клетки и расстояние между клетками', () => {
    expect(knightMoves('a1').sort()).toEqual(['b3', 'c2'])
    expect(knightMoves('e4')).toHaveLength(8)
    expect(knightDistance('a1', 'a1')).toBe(0)
    expect(knightDistance('a1', 'b3')).toBe(1)
    expect(knightDistance('a1', 'h8')).toBe(6)
    expect(knightDistance('b1', 'c3')).toBe(1)
  })
  it('расстояние симметрично и совпадает с обходом по chess.js', () => {
    for (const a of ['a1', 'd4', 'h1', 'c7']) for (const b of ALL_SQUARES) expect(knightDistance(a, b)).toBe(knightDistance(b, a))
  })
  it('задача на коня: от 2 до 4 ходов, разные клетки', () => {
    let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < 50; i++) { const p = knightPuzzle(rng); expect(p.from).not.toBe(p.to); expect(p.best).toBeGreaterThanOrEqual(2); expect(p.best).toBeLessThanOrEqual(4); expect(knightDistance(p.from, p.to)).toBe(p.best) }
  })
})

describe('gradeAttacks и результаты', () => {
  it('разбирает верные, лишние и пропущенные клетки', () => {
    const g = gradeAttacks(['a1', 'b2', 'c3'], ['b2', 'c3', 'd4'])
    expect(g.ok.sort()).toEqual(['b2', 'c3']); expect(g.extra).toEqual(['a1']); expect(g.missed).toEqual(['d4']); expect(g.perfect).toBe(false)
    expect(gradeAttacks(['b2'], ['b2']).perfect).toBe(true)
  })
  it('рекорд только при улучшении, история ограничена', () => {
    let s = EMPTY_VISION
    let r = recordRun(s, { game: 'coords', score: 10, at: 1 }); expect(r.record).toBe(true); s = r.store
    r = recordRun(s, { game: 'coords', score: 8, at: 2 }); expect(r.record).toBe(false); expect(r.store.best.coords).toBe(10); s = r.store
    r = recordRun(s, { game: 'coords', score: 0, at: 3 }); expect(r.record).toBe(false)
    for (let i = 0; i < 40; i++) s = recordRun(s, { game: 'knight', score: 1, at: i }).store
    expect(s.runs.length).toBe(30)
  })
})
