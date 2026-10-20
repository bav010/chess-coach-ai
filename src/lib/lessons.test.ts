import { afterEach, describe, expect, it } from 'vitest'
import { LESSONS, LESSONS_RU, LEVEL_TEXT, compileLesson } from './lessons'
import { LESSONS_EN } from '../data/lessonsEn'
import { setLang } from '../i18n'
import { ruName } from './openingNames'

afterEach(() => setLang('en'))

describe('уроки дебютов / opening lessons', () => {
  it('все ходы всех уроков законны и объяснены', () => {
    for (const l of LESSONS) {
      const steps = compileLesson(l)
      expect(steps.length, l.id).toBeGreaterThanOrEqual(8)
      for (const s of steps) expect(s.why.length, `${l.id} ${s.san}`).toBeGreaterThan(5)
    }
  })
  it('идентификаторы уникальны, за обе стороны есть уроки', () => {
    expect(new Set(LESSONS.map(l => l.id)).size).toBe(LESSONS.length)
    expect(LESSONS.some(l => l.side === 'w') && LESSONS.some(l => l.side === 'b')).toBe(true)
  })
  it('у ученика есть хотя бы 4 своих хода в каждом уроке', () => {
    for (const l of LESSONS) expect(compileLesson(l).filter(s => s.mover === l.side).length, l.id).toBeGreaterThanOrEqual(4)
  })
  it('every lesson has non-empty ru and en text for every field, same structure and moves', () => {
    expect(Object.keys(LESSONS_EN).sort()).toEqual(LESSONS_RU.map(l => l.id).sort())
    for (const ru of LESSONS_RU) {
      const en = LESSONS_EN[ru.id]
      expect(en.steps.length, ru.id).toBe(ru.steps.length)
      for (const f of [ru.title, ru.intro, ru.outro, en.title, en.intro, en.outro, ...en.steps, ...ru.steps.map(s => s[1])]) expect(f.trim().length, ru.id).toBeGreaterThan(2)
      for (const f of [en.title, en.intro, en.outro, ...en.steps]) expect(/[А-Яа-яЁё]/.test(f), `${ru.id}: ${f}`).toBe(false)
    }
    setLang('ru'); const ruSteps = LESSONS.map(l => compileLesson(l).map(s => s.uci)); const ruTitles = LESSONS.map(l => l.title)
    setLang('en'); const enSteps = LESSONS.map(l => compileLesson(l).map(s => s.uci)); const enTitles = LESSONS.map(l => l.title)
    expect(enSteps).toEqual(ruSteps)
    expect(enTitles).not.toEqual(ruTitles)
  })
  it('texts follow the current language at access time', () => {
    setLang('ru'); expect(LESSONS[0].title).toBe('Итальянская партия'); expect(LEVEL_TEXT[1]).toBe('для новичка')
    setLang('en'); expect(LESSONS[0].title).toBe('Italian Game'); expect(LEVEL_TEXT[1]).toBe('beginner')
  })
  it('opening names: original in English, Russian family name in ru', () => {
    setLang('en'); expect(ruName('Sicilian Defense: Najdorf Variation')).toBe('Sicilian Defense: Najdorf Variation')
    setLang('ru'); expect(ruName('Sicilian Defense: Najdorf Variation')).toBe('Сицилианская защита: Najdorf Variation')
  })
})
