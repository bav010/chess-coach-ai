import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS, classify, moveAccuracy, sideAccuracy, winLoss } from './classify'

describe('winLoss', () => {
  it('потеря считается для ходившей стороны', () => {
    // белые были на +2.0, после хода стало −1.0
    const loss = winLoss({ cp: 200, mate: null }, { cp: -100, mate: null }, 'w')
    expect(loss).toBeGreaterThan(25)
  })
  it('для чёрных знак зеркальный', () => {
    const loss = winLoss({ cp: -200, mate: null }, { cp: 100, mate: null }, 'b')
    expect(loss).toBeGreaterThan(25)
  })
  it('улучшение позиции — потеря 0', () => {
    expect(winLoss({ cp: 0, mate: null }, { cp: 100, mate: null }, 'w')).toBe(0)
  })
  it('в уже выигранной позиции небольшая потеря сантипешек почти не штрафуется (контекст)', () => {
    const decided = winLoss({ cp: 900, mate: null }, { cp: 700, mate: null }, 'w')
    const equal = winLoss({ cp: 0, mate: null }, { cp: -200, mate: null }, 'w')
    expect(decided).toBeLessThan(equal)
  })
  it('упущенный мат — большая потеря', () => {
    expect(winLoss({ cp: null, mate: 2 }, { cp: 100, mate: null }, 'w')).toBeGreaterThan(30)
  })
})

describe('classify', () => {
  const t = DEFAULT_THRESHOLDS
  it('совпадение с лучшим ходом — best при любой потере шума', () => {
    expect(classify(0.5, true)).toBe('best')
    expect(classify(3, true)).toBe('best')
  })
  it('пороги', () => {
    expect(classify(t.best, false)).toBe('excellent')
    expect(classify(t.best + 1, false)).toBe('good')
    expect(classify(t.inaccuracy, false)).toBe('inaccuracy')
    expect(classify(t.mistake, false)).toBe('mistake')
    expect(classify(t.blunder, false)).toBe('blunder')
    expect(classify(60, false)).toBe('blunder')
  })
  it('пороги настраиваются', () => {
    expect(classify(8, false, { ...t, inaccuracy: 2, mistake: 6, blunder: 7 })).toBe('blunder')
  })
})

describe('точность', () => {
  it('идеальный ход — около 100%, плохой — близко к 0', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0)
    expect(moveAccuracy(80)).toBeLessThan(5)
    expect(moveAccuracy(80)).toBeGreaterThanOrEqual(0)
  })
  it('убывает с потерей', () => {
    expect(moveAccuracy(5)).toBeGreaterThan(moveAccuracy(10))
  })
  it('точность стороны — среднее; без ходов — null', () => {
    expect(sideAccuracy([])).toBeNull()
    expect(sideAccuracy([0, 0])).toBeCloseTo(100, 0)
    const mixed = sideAccuracy([0, 30])!
    expect(mixed).toBeGreaterThan(moveAccuracy(30))
    expect(mixed).toBeLessThan(100)
  })
})
