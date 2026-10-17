import { Chess, type Color } from 'chess.js'
import { LESSONS, type Lesson } from '../data/lessons'

export { LESSONS }
export type { Lesson }

export type CompiledStep = { uci: string; san: string; why: string; mover: Color; fenBefore: string; no: number }

/** Переводит ходы урока в UCI, проверяя их законность. Бросает ошибку на недопустимом ходе. */
export function compileLesson(l: Lesson): CompiledStep[] {
  const c = new Chess()
  return l.steps.map(([san, why]) => {
    const fenBefore = c.fen()
    const mover = c.turn()
    const no = c.moveNumber()
    const m = c.move(san)
    return { uci: `${m.from}${m.to}${m.promotion ?? ''}`, san: m.san, why, mover, fenBefore, no }
  })
}

export const LEVEL_TEXT: Record<1 | 2 | 3, string> = { 1: 'для новичка', 2: 'средний', 3: 'сложнее' }

/** Урок записывается в репертуар как линия (UCI). */
export const lessonLine = (l: Lesson): string[] => compileLesson(l).map(s => s.uci)
