import { describe, expect, it } from 'vitest'
import {
  calibrate, clampElo, humanDelayMs, lineGapCp, paceMs, pickBotMove, slipForElo, thinkTimeMs,
  ENGINE_MAX_ELO, ENGINE_MIN_ELO,
} from './bot'

describe('calibrate', () => {
  it('в диапазоне движка используется UCI_Elo напрямую', () => {
    expect(calibrate(1800)).toMatchObject({ limitStrength: true, uciElo: 1800, slipChance: 0, multipv: 2, depth: null })
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

describe('промахи слабых уровней', () => {
  it('вероятность промаха строго убывает с рейтингом и равна нулю у 1320', () => {
    let prev = Infinity
    for (let e = 400; e <= ENGINE_MIN_ELO; e += 20) {
      const v = slipForElo(e)
      expect(v).toBeLessThan(prev)
      prev = v
    }
    expect(slipForElo(ENGINE_MIN_ELO)).toBe(0)
  })
  it('слабые уровни заметно сильнее прежних (600: не более четверти промахов, раньше — 80%)', () => {
    expect(slipForElo(600)).toBeLessThanOrEqual(0.25)
    expect(slipForElo(400)).toBeLessThan(0.5)
  })
})

describe('humanDelayMs', () => {
  const base = { legalMoves: 30, inCheck: false, gapCp: 60, ply: 30, remainingMs: null, incrementMs: 0, baseMs: null, rnd: () => 0.5 }
  it('чем выше рейтинг, тем короче пауза', () => {
    expect(humanDelayMs({ ...base, elo: 2800 })).toBeLessThan(humanDelayMs({ ...base, elo: 600 }))
  })
  it('вынужденный ход и очевидный ответ — быстро, сложная позиция — дольше', () => {
    const forced = humanDelayMs({ ...base, elo: 1500, legalMoves: 1 })
    const tricky = humanDelayMs({ ...base, elo: 1500, gapCp: 10 })
    const obvious = humanDelayMs({ ...base, elo: 1500, gapCp: 500 })
    expect(forced).toBeLessThan(obvious)
    expect(obvious).toBeLessThan(tricky)
  })
  it('в дебюте почти не думает', () => {
    const opening = humanDelayMs({ ...base, elo: 1500, ply: 2 })
    expect(opening).toBeLessThan(humanDelayMs({ ...base, elo: 1500 }) / 4)
    expect(opening).toBeLessThan(1000)
  })
  it('зависит от длины партии: минутная партия — доли секунды, пятиминутная — секунды', () => {
    const bullet = humanDelayMs({ ...base, elo: 1500, gapCp: 10, baseMs: 60_000, remainingMs: 60_000 })
    const blitz = humanDelayMs({ ...base, elo: 1500, gapCp: 10, baseMs: 300_000, remainingMs: 300_000 })
    expect(bullet).toBeLessThanOrEqual(3750)
    expect(blitz).toBeGreaterThan(bullet * 2)
    expect(blitz).toBeGreaterThan(3000)
  })
  it('не съедает часы: при малом остатке времени пауза короткая', () => {
    const t = humanDelayMs({ ...base, elo: 600, remainingMs: 6000, baseMs: 60_000, rnd: () => 0.999 })
    expect(t).toBeLessThanOrEqual(1800)
    expect(t).toBeGreaterThanOrEqual(250)
  })
  it('паузы разнообразны: при одной и той же позиции разброс значительный', () => {
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    const xs = Array.from({ length: 200 }, () => humanDelayMs({ ...base, elo: 1500, baseMs: 300_000, remainingMs: 250_000, rnd }))
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
    expect(sd / mean).toBeGreaterThan(0.4)
    expect(Math.max(...xs)).toBeGreaterThan(Math.min(...xs) * 4)
  })
  it('всегда в разумных пределах', () => {
    for (const rnd of [() => 0, () => 0.999]) {
      for (const baseMs of [null, 60_000, 600_000]) {
        const t = humanDelayMs({ ...base, elo: 400, gapCp: 0, legalMoves: 45, baseMs, rnd })
        expect(t).toBeGreaterThanOrEqual(250)
        expect(t).toBeLessThanOrEqual(paceMs(baseMs, 0) * 2.5)
      }
    }
  })
})

describe('lineGapCp', () => {
  it('разрыв между первой и второй линиями', () => {
    expect(lineGapCp([{ cp: 50, mate: null }, { cp: -20, mate: null }])).toBe(70)
  })
  it('мат — огромная оценка; одной линии мало', () => {
    expect(lineGapCp([{ cp: null, mate: 2 }, { cp: 100, mate: null }])).toBeGreaterThan(5000)
    expect(lineGapCp([{ cp: 10, mate: null }])).toBeNull()
  })
})
