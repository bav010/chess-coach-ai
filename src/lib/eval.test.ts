import { describe, expect, it } from 'vitest'
import { barWhitePercent, finalScore, forColor, formatScore, toWhite, whiteWinPercent, winPercentFor } from './eval'

describe('toWhite: оценка движка относительно стороны, чей ход', () => {
  it('ход белых — знак сохраняется', () => {
    expect(toWhite({ cp: 150, mate: null }, 'w')).toEqual({ cp: 150, mate: null })
  })
  it('ход чёрных — знак меняется (и для сантипешек, и для мата)', () => {
    expect(toWhite({ cp: 150, mate: null }, 'b')).toEqual({ cp: -150, mate: null })
    expect(toWhite({ cp: null, mate: 3 }, 'b')).toEqual({ cp: null, mate: -3 })
    expect(toWhite({ cp: null, mate: -2 }, 'b')).toEqual({ cp: null, mate: 2 })
  })
})

describe('formatScore', () => {
  it('единый формат', () => {
    expect(formatScore({ cp: 150, mate: null })).toBe('+1.5')
    expect(formatScore({ cp: -150, mate: null })).toBe('−1.5')
    expect(formatScore({ cp: 0, mate: null })).toBe('0.0')
    expect(formatScore({ cp: 3, mate: null })).toBe('0.0')
    expect(formatScore({ cp: -4, mate: null })).toBe('0.0')
    expect(formatScore({ cp: null, mate: 3 })).toBe('M3')
    expect(formatScore({ cp: null, mate: -3 })).toBe('−M3')
  })
  it('результат окончившейся партии', () => {
    expect(formatScore(finalScore('1-0'))).toBe('1-0')
    expect(formatScore(finalScore('1/2-1/2'))).toBe('1/2-1/2')
  })
  it('огромные оценки не ломают формат', () => {
    expect(formatScore({ cp: 123456, mate: null })).toBe('+99.9')
  })
})

describe('шансы на победу и шкала', () => {
  it('равная позиция — 50%', () => {
    expect(whiteWinPercent({ cp: 0, mate: null })).toBeCloseTo(50, 5)
    expect(barWhitePercent(null)).toBe(50)
  })
  it('перевес белых увеличивает белую часть, чёрных — уменьшает', () => {
    expect(whiteWinPercent({ cp: 200, mate: null })).toBeGreaterThan(60)
    expect(whiteWinPercent({ cp: -200, mate: null })).toBeLessThan(40)
  })
  it('мат и результат — крайние значения', () => {
    expect(whiteWinPercent({ cp: null, mate: 2 })).toBe(100)
    expect(whiteWinPercent({ cp: null, mate: -2 })).toBe(0)
    expect(whiteWinPercent(finalScore('0-1'))).toBe(0)
  })
  it('для чёрных шансы зеркальны', () => {
    const s = { cp: 300, mate: null }
    expect(winPercentFor(s, 'w') + winPercentFor(s, 'b')).toBeCloseTo(100, 5)
  })
  it('forColor разворачивает знак', () => {
    expect(forColor({ cp: 50, mate: null }, 'b')).toEqual({ cp: -50, mate: null, final: undefined })
  })
})
