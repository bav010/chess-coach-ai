import { describe, expect, it } from 'vitest'
import { LESSONS, compileLesson } from './lessons'

describe('уроки дебютов', () => {
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
})
