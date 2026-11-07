import { describe, expect, it } from 'vitest'
import { buildSession, sessionProgress, type TrainInput } from './train'

const base: TrainInput = { dailyId: 'p1', dailySolved: false, dailyTried: false, mistakes: 0, openingsDue: 0, endgameDue: [], endgameNew: null, weakTheme: null, today: {} }
const ids = (i: TrainInput) => buildSession(i).map(b => b.id)

describe('buildSession', () => {
  it('без данных остаются только задача дня и обычные задачи', () => {
    expect(ids(base)).toEqual(['daily', 'puzzles'])
    expect(ids({ ...base, dailyId: null })).toEqual(['puzzles'])
  })
  it('блок появляется, только если есть материал, и ограничен лимитом', () => {
    const b = buildSession({ ...base, mistakes: 12, openingsDue: 3, endgameDue: ['kqk1', 'krk1', 'kqk2'], endgameNew: 'kqk3' })
    const by = Object.fromEntries(b.map(x => [x.id, x]))
    expect(by.mistakes.target).toBe(5)
    expect(by.openings.target).toBe(3)
    expect(by.endgames.target).toBe(2)
    expect(by.endgames.arg).toBe('kqk1')
  })
  it('новый эндшпиль предлагается, только если нечего повторять', () => {
    expect(buildSession({ ...base, endgameNew: 'kqk1' }).find(b => b.id === 'endgames')).toMatchObject({ target: 1, arg: 'kqk1' })
    expect(buildSession({ ...base, endgameDue: ['krk2'], endgameNew: 'kqk1' }).find(b => b.id === 'endgames')?.arg).toBe('krk2')
  })
  it('цель не уменьшается по мере выполнения', () => {
    const before = buildSession({ ...base, mistakes: 4 }).find(b => b.id === 'mistakes')!
    const after = buildSession({ ...base, mistakes: 1, today: { mistakes: 3 } }).find(b => b.id === 'mistakes')!
    expect(before.target).toBe(4); expect(after.target).toBe(4); expect(after.done).toBe(3)
  })
  it('блок остаётся показанным, если всё сделано за сегодня', () => {
    expect(ids({ ...base, openingsDue: 0, today: { openings: 2 } })).toContain('openings')
  })
  it('задача дня не засчитывается дважды в обычные задачи', () => {
    const p = buildSession({ ...base, dailyTried: true, today: { puzzles: 3 } }).find(b => b.id === 'puzzles')!
    expect(p.done).toBe(2)
    expect(buildSession({ ...base, dailyTried: true, today: { puzzles: 0 } }).find(b => b.id === 'puzzles')!.done).toBe(0)
  })
})

describe('sessionProgress', () => {
  it('считает выполненное, процент и оставшееся время', () => {
    const b = buildSession({ ...base, dailySolved: true, mistakes: 2, today: { mistakes: 1, puzzles: 1 } })
    // daily 1/1, mistakes 1/3, puzzles 1/5 (задача дня не пытались → 1 решённая)
    const p = sessionProgress(b)
    expect(p.done).toBe(1 + 1 + 1); expect(p.total).toBe(1 + 3 + 5)
    expect(p.percent).toBe(33)
    expect(p.minutesLeft).toBe(Math.ceil(2 * 1.5 + 4 * 1))
    expect(p.complete).toBe(false)
  })
  it('сессия завершена, когда все цели выполнены', () => {
    expect(sessionProgress(buildSession({ ...base, dailySolved: true, today: { puzzles: 5 } })).complete).toBe(true)
  })
})
