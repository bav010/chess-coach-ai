import { describe, expect, it } from 'vitest'
import { ChessClock, fromPreset, formatClock, TIME_PRESETS } from './clock'

const mk = (w: number, b: number, inc = 0, delay = 0) =>
  new ChessClock({ whiteMs: w, blackMs: b, incrementMs: inc, delayMs: delay })

describe('ChessClock', () => {
  it('время уменьшается только у стороны, чей ход', () => {
    const c = mk(60_000, 60_000)
    c.start('w', 0)
    expect(c.remaining('w', 5_000)).toBe(55_000)
    expect(c.remaining('b', 5_000)).toBe(60_000)
  })
  it('после хода добавляется приращение и часы переключаются', () => {
    const c = mk(60_000, 60_000, 2_000)
    c.start('w', 0)
    c.press('w', 10_000) // белые думали 10 с: 60−10+2 = 52
    expect(c.remaining('w', 10_000)).toBe(52_000)
    expect(c.activeSide).toBe('b')
    expect(c.remaining('b', 14_000)).toBe(56_000)
    expect(c.remaining('w', 14_000)).toBe(52_000) // у белых не идёт
  })
  it('независимые начальные времена сторон', () => {
    const c = mk(300_000, 60_000)
    expect(c.remaining('w', 0)).toBe(300_000)
    expect(c.remaining('b', 0)).toBe(60_000)
  })
  it('задержка: первые секунды хода не списываются', () => {
    const c = mk(60_000, 60_000, 0, 3_000)
    c.start('w', 0)
    expect(c.remaining('w', 2_000)).toBe(60_000)
    expect(c.remaining('w', 5_000)).toBe(58_000)
  })
  it('флажок: достигнут ноль', () => {
    const c = mk(5_000, 60_000)
    c.start('w', 0)
    expect(c.flagged(4_999)).toBeNull()
    expect(c.flagged(5_000)).toBe('w')
    expect(c.remaining('w', 99_000)).toBe(0)
  })
  it('stop замораживает часы', () => {
    const c = mk(60_000, 60_000)
    c.start('w', 0)
    c.stop(7_000)
    expect(c.remaining('w', 50_000)).toBe(53_000)
    expect(c.flagged(999_999)).toBeNull()
  })
  it('snapshot/restore (отмена хода) возвращает время и запускает нужную сторону', () => {
    const c = mk(60_000, 60_000, 1_000)
    c.start('w', 0)
    const s0 = c.snapshot(0)
    c.press('w', 4_000)
    c.press('b', 9_000)
    c.restore(s0, 'w', 20_000)
    expect(c.remaining('w', 20_000)).toBe(60_000)
    expect(c.remaining('b', 20_000)).toBe(60_000)
    expect(c.activeSide).toBe('w')
    expect(c.remaining('w', 25_000)).toBe(55_000)
  })
})

describe('пресеты и формат', () => {
  it('есть Bullet, Blitz, Rapid, Classical с несколькими пресетами', () => {
    expect(TIME_PRESETS.map(g => g.category)).toEqual(['Bullet', 'Blitz', 'Rapid', 'Classical'])
    for (const g of TIME_PRESETS) expect(g.items.length).toBeGreaterThanOrEqual(2)
  })
  it('fromPreset', () => {
    expect(fromPreset({ id: '5+3', label: '5+3', minutes: 5, incrementSec: 3 }))
      .toEqual({ whiteMs: 300_000, blackMs: 300_000, incrementMs: 3_000, delayMs: 0 })
  })
  it('formatClock', () => {
    expect(formatClock(300_000)).toBe('5:00')
    expect(formatClock(65_000)).toBe('1:05')
    expect(formatClock(3_725_000)).toBe('1:02:05')
    expect(formatClock(9_400)).toBe('0:09.4')
    expect(formatClock(-5)).toBe('0:00.0')
  })
})
