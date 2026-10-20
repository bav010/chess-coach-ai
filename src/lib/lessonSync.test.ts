import { describe, it, expect } from 'vitest'
import { syncLessons, repLabel, lineLabel, isLessonRep } from './lessonSync'
import { setLang, getLang } from '../i18n'
import { LESSONS } from '../data/lessons'
import { countCards, planDrill } from './drill'
import type { OpeningsData } from './openingsStore'

const empty = (): OpeningsData => ({ v: 1, lessons: {}, repertoires: [], cards: {}, activeId: '', stats: {} } as unknown as OpeningsData)

describe('syncLessons', () => {
  it('ничего не меняет без пройденных уроков', () => {
    const d = empty()
    expect(syncLessons(d)).toBe(d)
  })
  it('пройденный урок попадает в репертуар и в «выученное»', () => {
    const l = LESSONS[0]
    const d = syncLessons({ ...empty(), lessons: { [l.id]: { done: true, runs: 1, mistakes: 0 } } } as OpeningsData)
    expect(d.repertoires.length).toBe(1)
    const rep = d.repertoires[0]
    expect(rep.side).toBe(l.side)
    expect(syncLessons(d)).toBe(d)
    const done = new Set([l.id])
    expect(countCards(rep, d.cards, Date.now(), done).learnedLines).toBe(1)
    expect(planDrill(rep, d.cards, Date.now(), 'learned', 12, done).lines.length).toBeGreaterThan(0)
    expect(countCards(rep, d.cards, Date.now()).learnedLines).toBe(0)
  })
})

describe('названия на текущем языке', () => {
  it('коды и прежние русские названия переводятся при показе, пользовательские — нет', () => {
    const prev = getLang()
    try {
      setLang('en')
      expect(repLabel({ name: '@lessons:w', side: 'w' })).toBe('From lessons (white)')
      expect(repLabel({ name: 'Из уроков (чёрные)', side: 'b' })).toBe('From lessons (black)')
      expect(repLabel({ name: '@side:b', side: 'b' })).toBe('Black')
      expect(repLabel({ name: 'My Sicilian', side: 'b' })).toBe('My Sicilian')
      expect(lineLabel({ name: '@line:untitled' })).toBe('Untitled')
      setLang('ru')
      expect(repLabel({ name: '@lessons:b', side: 'b' })).toBe('Из уроков (чёрные)')
      expect(lineLabel({ name: '@line:mine' })).toBe('Моя линия')
      expect(isLessonRep({ name: 'Из уроков (белые)' })).toBe(true)
    } finally { setLang(prev) }
  })
  it('репертуар уроков хранит код, а не переведённый текст', () => {
    const l = LESSONS[0]
    const d = syncLessons({ ...empty(), lessons: { [l.id]: { done: true, runs: 1, mistakes: 0 } } } as OpeningsData)
    expect(d.repertoires[0].name).toBe(`@lessons:${l.side}`)
    expect(d.repertoires[0].lines[0].name).toBe(`@lesson:${l.id}`)
  })
})
