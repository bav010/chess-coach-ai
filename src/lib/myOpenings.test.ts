import { describe, expect, it } from 'vitest'
import { analyseMyOpenings, isWeak, MIN_VERDICT } from './myOpenings'
import { buildCatalog } from './openings'
import { toPgn } from './pgn'
import { START_FEN } from './game'
import type { SavedSession } from '../storage'

const catalog = buildCatalog([
  ['C50', 'Italian Game', 'e2e4 e7e5 g1f3 b8c6 f1c4'],
  ['C53', 'Italian Game: Classical Variation', 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5'],
  ['B20', 'Sicilian Defense', 'e2e4 c7c5'],
])
let id = 0
const session = (ucis: string[], result: SavedSession['result'], me: 'w' | 'b' = 'w', at = '2026-01-01T00:00:00Z'): SavedSession => ({
  id: ++id, created_at: at, result, plies: ucis.length,
  pgn: toPgn(START_FEN, ucis, { White: me === 'w' ? 'You' : 'Bot ~1200', Black: me === 'b' ? 'You' : 'Bot ~1200', Result: result }),
})

describe('analyseMyOpenings', () => {
  it('группирует по семейству и считает результат', () => {
    const s = [
      session(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6'], '1-0'),
      session(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'd7d6'], '0-1'),
      session(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b2b4', 'c5b4'], '1/2-1/2'),
    ]
    const r = analyseMyOpenings(s, catalog)
    expect(r.considered).toBe(3)
    const g = r.groups[0]
    expect(g).toMatchObject({ family: 'Italian Game', color: 'w', games: 3, w: 1, d: 1, l: 1, score: 50 })
    expect(g.variation).toBe('Italian Game: Classical Variation')
  })
  it('находит ход, после которого партия вышла из каталога, и кто его сделал', () => {
    const s = [
      session(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'd7d6'], '1-0'),
      session(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'd7d6'], '1-0'),
    ]
    const g = analyseMyOpenings(s, catalog).groups[0]
    expect(g.exits[0]).toMatchObject({ by: 'opp', ply: 6, label: '3...Nf6', count: 2 })
  })
  it('играя чёрными, отличает свой ход от хода бота', () => {
    const g = analyseMyOpenings([session(['e2e4', 'c7c5', 'g1f3', 'd7d6'], '0-1', 'b')], catalog).groups[0]
    expect(g).toMatchObject({ color: 'b', family: 'Sicilian Defense' })
    expect(g.exits[0]).toMatchObject({ by: 'opp', label: '2.Nf3' })
  })
  it('партии без цвета пользователя и без дебюта пропускаются', () => {
    const own = { ...session(['e2e4', 'c7c5'], '1-0'), pgn: toPgn(START_FEN, ['e2e4', 'c7c5'], { White: 'A', Black: 'B' }) }
    const none = session(['a2a3', 'a7a6'], '1-0')
    const r = analyseMyOpenings([own, none], catalog)
    expect(r.groups).toHaveLength(0)
    expect(r.skipped).toBe(2)
  })
  it('слабым дебют считается только при достаточном числе партий', () => {
    const lose = () => session(['e2e4', 'c7c5', 'g1f3', 'd7d6'], '0-1')
    const few = analyseMyOpenings(Array.from({ length: MIN_VERDICT - 1 }, lose), catalog).groups[0]
    expect(isWeak(few)).toBe(false)
    const enough = analyseMyOpenings(Array.from({ length: MIN_VERDICT }, lose), catalog).groups[0]
    expect(isWeak(enough)).toBe(true)
  })
})
