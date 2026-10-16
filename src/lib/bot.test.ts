import { describe, expect, it } from 'vitest'
import { calibrate, clampElo, pickBotMove, thinkTimeMs, ENGINE_MAX_ELO, ENGINE_MIN_ELO } from './bot'

describe('calibrate', () => {
  it('в диапазоне движка используется UCI_Elo напрямую', () => {
    expect(calibrate(1800)).toMatchObject({ limitStrength: true, uciElo: 1800, slipChance: 0, multipv: 1, depth: null })
    expect(calibrate(ENGINE_MIN_ELO).uciElo).toBe(ENGINE_MIN_ELO)
  })
  it('максимум — без ограничения силы', () => {
    expect(calibrate(3200).limitStrength).toBe(false)
    expect(calibrate(ENGINE_MAX_ELO).limitStrength).toBe(true)
  })
  it('ниже диапазона: минимальная сила, малая глубина, промахи', () => {
    const weak = calibrate(600)
    expect(weak.uciElo).toBe(ENGINE_MIN_ELO)
    expect(weak.slipChance).toBeGreaterThan(0.2)
    expect(weak.multipv).toBeGreaterThan(1)
  })
  it('чем ниже рейтинг, тем слабее настройки (монотонность)', () => {
    const s = (e: number) => calibrate(e).slipChance
    expect(s(500)).toBeGreaterThanOrEqual(s(900))
    expect(s(900)).toBeGreaterThanOrEqual(s(1300))
  })
  it('clampElo ограничивает и чистит ввод', () => {
    expect(clampElo(10)).toBe(400)
    expect(clampElo(99999)).toBe(3200)
    expect(clampElo(NaN)).toBe(1500)
    expect(clampElo(1234.6)).toBe(1235)
  })
})

describe('thinkTimeMs', () => {
  it('без часов — фиксированное время, растёт с рейтингом', () => {
    expect(thinkTimeMs(3000, null, 0)).toBeGreaterThan(thinkTimeMs(600, null, 0))
  })
  it('с часами — не больше половины остатка и не меньше минимума', () => {
    expect(thinkTimeMs(2000, 2_000, 0)).toBeLessThanOrEqual(1_000)
    expect(thinkTimeMs(2000, 100, 0)).toBeGreaterThanOrEqual(100)
  })
})

describe('pickBotMove', () => {
  const lines = [{ uci: 'e2e4' }, { uci: 'd2d4' }, { uci: 'g1f3' }]
  it('без промахов — ход движка', () => {
    expect(pickBotMove('e2e4', lines, 0, () => 0.5)).toBe('e2e4')
  })
  it('при промахе — другой вариант из линий, не ход движка', () => {
    const seq = [0.0, 0.7]
    let i = 0
    expect(pickBotMove('e2e4', lines, 0.5, () => seq[i++])).toBe('g1f3')
  })
  it('если ход движка неизвестен — первая линия; пустой список — null', () => {
    expect(pickBotMove(null, lines, 0)).toBe('e2e4')
    expect(pickBotMove(null, [], 1)).toBeNull()
  })
  it('одна линия — промахнуться не из чего', () => {
    expect(pickBotMove('a2a3', [{ uci: 'a2a3' }], 1, () => 0)).toBe('a2a3')
  })
})
