import { describe, it, expect } from 'vitest'
import { syncLessons } from './lessonSync'
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
