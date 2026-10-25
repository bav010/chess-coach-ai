import { describe, expect, it } from 'vitest'
import { EMPTY_SPRINT, mergeSprint, recordRun, runAccuracy, type SprintRun } from './sprint'

const run = (score: number, at = `2026-10-0${score}T10:00:00Z`): SprintRun => ({ at, score, mistakes: 1, level: 0, seconds: 180 })

describe('sprint', () => {
  it('рекорд — только строго выше прежнего', () => {
    const a = recordRun(EMPTY_SPRINT, run(5))
    expect(a.record).toBe(true)
    expect(recordRun(a.store, run(5, 'x')).record).toBe(false)
    const c = recordRun(a.store, run(7))
    expect(c).toMatchObject({ record: true, store: { best: 7, runs: 2 } })
  })
  it('нулевой первый результат не рекорд', () => expect(recordRun(EMPTY_SPRINT, run(0)).record).toBe(false))
  it('история ограничена 20 последними', () => {
    let s = EMPTY_SPRINT
    for (let i = 0; i < 25; i++) s = recordRun(s, run(1, `2026-10-${String(i + 1).padStart(2, '0')}`)).store
    expect(s.history).toHaveLength(20)
    expect(s.runs).toBe(25)
    expect(s.history[0].at).toBe('2026-10-25')
  })
  it('слияние: рекорд — максимум, дубли по времени убираются', () => {
    const a = recordRun(recordRun(EMPTY_SPRINT, run(3)).store, run(9)).store
    const b = recordRun(EMPTY_SPRINT, run(3)).store
    const m = mergeSprint(a, b)
    expect(m.best).toBe(9)
    expect(m.history.map(r => r.score).sort()).toEqual([3, 9])
    expect(m.runs).toBe(2)
  })
  it('точность', () => {
    expect(runAccuracy(0, 0)).toBeNull()
    expect(runAccuracy(6, 2)).toBe(75)
  })
})
