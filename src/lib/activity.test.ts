import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dayKey, loadActivity, markActive, markDaily, mergeActivity, streakOf } from './activity'
import { dayStreak } from '../views/HomeView'

const d = (s: string) => new Date(`${s}T12:00:00`)

describe('activity', () => {
  beforeEach(() => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, clear: () => m.clear() })
  })
  it('streak continues through any activity, not only games', () => {
    const days = new Set(['2026-10-20', '2026-10-21', '2026-10-22'])
    expect(streakOf(days, d('2026-10-22'))).toBe(3)
    expect(streakOf(new Set(['2026-10-21']), d('2026-10-22'))).toBe(1)
    expect(streakOf(new Set(['2026-10-19']), d('2026-10-22'))).toBe(0)
  })
  it('combines games and other activity', () => {
    const g = [{ at: d('2026-10-21').toISOString() }] as never
    expect(dayStreak(g, ['2026-10-22'], d('2026-10-22'))).toBe(2)
  })
  it('markActive is idempotent and daily result is not downgraded', () => {
    markActive(d('2026-10-22')); markActive(d('2026-10-22'))
    expect(loadActivity().days).toEqual(['2026-10-22'])
    markDaily('p1', true, d('2026-10-22')); markDaily('p1', false, d('2026-10-22'))
    expect(loadActivity().daily[dayKey(d('2026-10-22'))]).toEqual({ id: 'p1', ok: true })
  })
  it('merges by union', () => {
    const m = mergeActivity({ v: 1, days: ['2026-10-20'], daily: {} }, { v: 1, days: ['2026-10-21'], daily: { '2026-10-21': { id: 'x', ok: true } } })
    expect(m.days).toEqual(['2026-10-20', '2026-10-21']); expect(m.daily['2026-10-21'].ok).toBe(true)
  })
})
