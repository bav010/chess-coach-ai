import { describe, expect, it } from 'vitest'
import { EMPTY_ACTIVITY, mergeActivity, isGoal, type Activity } from './activity'
import type { GameStat } from './gameStats'
import { focusOf, goalDone, goalProgress, weekReport, weekStart } from './weekly'

const NOW = new Date(2026, 10, 5, 12) // чт 5 ноября 2026
const act = (days: string[], counts: Activity['counts'] = {}): Activity => ({ ...EMPTY_ACTIVITY, days, counts })
const game = (at: string, o: Partial<GameStat> = {}): GameStat => ({ key: at, at, src: 'bot', color: 'w', result: '1-0', outcome: 'win', opp: 1000, tc: null, plies: 40, endgame: false, ...o })

describe('weekly', () => {
  it('неделя начинается в понедельник', () => {
    expect(weekStart(NOW).getDay()).toBe(1)
    expect(weekStart(new Date(2026, 10, 8, 23)).getDate()).toBe(2) // воскресенье относится к неделе с пн 2 ноября
    expect(weekStart(new Date(2026, 10, 2)).getDate()).toBe(2)
  })
  it('считает партии, точность, задачи и активные дни только за свою неделю', () => {
    const a = act(['2026-11-02', '2026-11-04', '2026-10-30'], {
      '2026-11-02': { puzzles: 5, solved: 3, openings: 2 }, '2026-11-04': { puzzles: 10, solved: 9, mistakes: 4 }, '2026-10-30': { puzzles: 99 },
    })
    const gs = [
      game(new Date(2026, 10, 3, 10).toISOString(), { review: { v: 1, acc: 80 } as never }),
      game(new Date(2026, 10, 4, 10).toISOString(), { outcome: 'loss', result: '0-1', review: { v: 1, acc: 70 } as never }),
      game(new Date(2026, 10, 4, 11).toISOString(), { src: 'analysis', outcome: null, color: null }),
      game(new Date(2026, 9, 30, 10).toISOString()),
    ]
    const r = weekReport(gs, a, NOW)
    expect(r.games).toEqual({ n: 2, w: 1, d: 0, l: 1 })
    expect(r.acc).toBe(75); expect(r.reviewed).toBe(2)
    expect(r.puzzles).toEqual({ tried: 15, solved: 12 }); expect(r.openings).toBe(2); expect(r.mistakes).toBe(4)
    expect(r.activeDays).toBe(2); expect(r.days).toHaveLength(7)
    const prev = weekReport(gs, a, NOW, 1)
    expect(prev.games.n).toBe(1); expect(prev.puzzles.tried).toBe(99)
  })
  it('фокус: порядок правил', () => {
    const empty = weekReport([], act([]), NOW)
    expect(focusOf(empty, empty)).toBe('start')
    const some = { ...empty, activeDays: 1 }
    expect(focusOf(some, empty)).toBe('puzzles')
    const p = { ...some, puzzles: { tried: 30, solved: 20 } }
    expect(focusOf(p, empty)).toBe('play')
    const g = { ...p, games: { n: 3, w: 1, d: 1, l: 1 }, acc: 70, openings: 3 }
    expect(focusOf(g, { ...empty, acc: 80 })).toBe('review')
    expect(focusOf({ ...g, acc: 79 }, { ...empty, acc: 80 })).toBe('keep')
    expect(focusOf({ ...g, openings: 0, acc: 79 }, { ...empty, acc: 80 })).toBe('openings')
  })
  it('прогресс цели ограничен единицей', () => {
    const r = { ...weekReport([], act([]), NOW), games: { n: 6, w: 0, d: 0, l: 0 }, puzzles: { tried: 10, solved: 5 }, activeDays: 4 }
    const p = goalProgress(r, { games: 3, puzzles: 20, days: 4 })
    expect(p).toEqual({ games: 1, puzzles: 0.5, days: 1 }); expect(goalDone(p)).toBe(false)
  })
  it('слияние счётчиков берёт максимум; цель проверяется', () => {
    const m = mergeActivity(act([], { '2026-11-02': { puzzles: 5 } }), { ...act([], { '2026-11-02': { puzzles: 8, solved: 1 } }), goal: { games: 2, puzzles: 10, days: 3 } })
    expect(m.counts!['2026-11-02']).toMatchObject({ puzzles: 8, solved: 1 }); expect(m.goal).toEqual({ games: 2, puzzles: 10, days: 3 })
    expect(isGoal({ games: 0, puzzles: 5, days: 3 })).toBe(false); expect(isGoal({ games: 3, puzzles: 20, days: 8 })).toBe(false); expect(isGoal({ games: 3, puzzles: 20, days: 4 })).toBe(true)
  })
})
