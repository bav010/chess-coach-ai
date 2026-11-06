import { describe, expect, it } from 'vitest'
import type { OnlineGame } from './online'
import { summarizeOnline, tcLabel } from './onlineStats'

const ME = 'me'
let n = 0
const g = (o: Partial<OnlineGame>): OnlineGame => ({
  id: `g${++n}`, code: 'abcdef12', creator: ME, white: ME, black: 'x', white_name: 'Me', black_name: 'Bob', moves: ['e2e4', 'e7e5'], base_ms: 300000, inc_ms: 3000,
  white_ms: 0, black_ms: 0, turn_started: null, status: 'finished', result: '1-0', reason: 'checkmate', draw_offer: null, updated_at: `2026-01-0${(n % 9) + 1}T10:00:00Z`, ...o,
})

describe('summarizeOnline', () => {
  it('считает победы, ничьи и поражения с точки зрения игрока, цвета тоже', () => {
    const s = summarizeOnline([
      g({ result: '1-0' }),                                                   // белыми выиграл
      g({ white: 'x', black: ME, white_name: 'Bob', black_name: 'Me', result: '1-0' }), // чёрными проиграл
      g({ result: '1/2-1/2', reason: 'agreed' }),
    ], ME)
    expect(s.total).toEqual({ games: 3, wins: 1, draws: 1, losses: 1 })
    expect(s.byColor.w.games).toBe(2); expect(s.byColor.b.losses).toBe(1)
    expect(s.winRate).toBe(50)
    expect(s.endings).toEqual({ checkmate: 2, agreed: 1 })
  })
  it('не учитывает прерванные, ожидающие и чужие партии', () => {
    const s = summarizeOnline([
      g({ status: 'finished', result: null, reason: 'aborted' }), g({ status: 'waiting', result: null }), g({ status: 'active', result: null }),
      g({ white: 'a', black: 'b' }),
    ], ME)
    expect(s.total.games).toBe(0); expect(s.winRate).toBeNull(); expect(s.avgPlies).toBeNull(); expect(s.streak).toBeNull()
  })
  it('серия, форма, контроли времени и соперники', () => {
    const list = [
      g({ updated_at: '2026-02-01T00:00:00Z', result: '0-1' }),
      g({ updated_at: '2026-02-02T00:00:00Z', result: '1-0' }),
      g({ updated_at: '2026-02-03T00:00:00Z', result: '1-0', base_ms: 0, inc_ms: 0 }),
    ]
    const s = summarizeOnline(list, ME)
    expect(s.form).toEqual(['loss', 'win', 'win'])
    expect(s.streak).toEqual({ kind: 'win', n: 2 })
    expect(s.byTc[0]).toMatchObject({ tc: '5+3' }); expect(s.byTc[1].tc).toBe('none')
    expect(s.opponents[0]).toMatchObject({ name: 'Bob' })
    expect(s.avgPlies).toBe(2)
  })
  it('метка контроля времени', () => { expect(tcLabel({ base_ms: 900000, inc_ms: 10000 })).toBe('15+10'); expect(tcLabel({ base_ms: 0, inc_ms: 0 })).toBe('none') })
})
