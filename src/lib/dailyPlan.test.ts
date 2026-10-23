import { describe, expect, it } from 'vitest'
import { buildPlan, lastGameUnreviewed, openingsDue, type PlanInput } from './dailyPlan'
import { EMPTY_OPENINGS } from './openingsStore'
import { EMPTY_STATS } from './puzzleStats'
import type { GameStat } from './gameStats'

const game = (at: string, review = false): GameStat => ({ key: at, at, src: 'bot', color: 'w', result: '1-0', outcome: 'win', opp: 1200, tc: '-', plies: 40, endgame: false, ...(review ? { review: {} as never } : {}) })
const base: PlanInput = { dailyId: 'p1', dailySolved: false, puzzles: EMPTY_STATS, games: [], openings: EMPTY_OPENINGS, hasSavedGame: false, now: 1_000_000 }
const ids = (i: PlanInput) => buildPlan(i).map(s => s.id)

describe('buildPlan', () => {
  it('без данных: задача дня и партия', () => expect(ids(base)).toEqual(['daily', 'play']))
  it('без задачи дня остаётся партия', () => expect(ids({ ...base, dailyId: null })).toEqual(['play']))
  it('решённая задача помечается выполненной', () => {
    const s = buildPlan({ ...base, dailySolved: true })[0]
    expect(s).toMatchObject({ id: 'daily', done: true })
  })
  it('слабая тема нужна минимум 5 попыток', () => {
    const few = { ...EMPTY_STATS, byTheme: { fork: { tried: 4, solved: 1, firstTry: 0, timeMs: 0 } } }
    expect(ids({ ...base, puzzles: few })).not.toContain('weak')
    const enough = { ...EMPTY_STATS, byTheme: { fork: { tried: 6, solved: 2, firstTry: 0, timeMs: 0 } } }
    expect(buildPlan({ ...base, puzzles: enough })[1]).toMatchObject({ id: 'weak', theme: 'fork', percent: 33 })
  })
  it('личные ошибки добавляют шаг', () => {
    expect(buildPlan({ ...base, mistakesDue: 4 })[1]).toMatchObject({ id: 'mine', due: 4 })
    expect(ids({ ...base, mistakesDue: 0 })).not.toContain('mine')
  })
  it('не больше трёх шагов', () => {
    const enough = { ...EMPTY_STATS, byTheme: { fork: { tried: 6, solved: 2, firstTry: 0, timeMs: 0 } } }
    const p = buildPlan({ ...base, puzzles: enough, games: [game('2026-01-02')], hasSavedGame: true })
    expect(p.length).toBe(3)
    expect(p.map(s => s.id)).toEqual(['daily', 'weak', 'review'])
  })
})

describe('помощники', () => {
  it('нет репертуара — нечего повторять', () => expect(openingsDue(EMPTY_OPENINGS, 1)).toBe(0))
  it('последняя партия: разобрана или нет', () => {
    expect(lastGameUnreviewed([])).toBe(false)
    expect(lastGameUnreviewed([game('2026-01-01'), game('2026-01-02')])).toBe(true)
    expect(lastGameUnreviewed([game('2026-01-01'), game('2026-01-02', true)])).toBe(false)
  })
})
