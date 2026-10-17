// Интервальное повторение: простая схема в духе SM-2. Сложные карточки возвращаются чаще, усвоенные — реже.
export type CardState = {
  /** Текущий интервал, дни. */
  ivl: number
  /** Лёгкость: во сколько раз растёт интервал после верного ответа. */
  ease: number
  /** Когда повторить, мс (unix). */
  due: number
  reps: number
  lapses: number
  correct: number
  wrong: number
  last: number
}

export type Grade = 'again' | 'hard' | 'good'

const DAY = 86_400_000
const MIN = 60_000
export const MIN_EASE = 1.3
export const RETRY_AFTER_MS = 10 * MIN

export const newCard = (now: number): CardState => ({ ivl: 0, ease: 2.5, due: now, reps: 0, lapses: 0, correct: 0, wrong: 0, last: 0 })

export function schedule(c: CardState, grade: Grade, now: number): CardState {
  if (grade === 'again') {
    return { ...c, ivl: 0, ease: Math.max(MIN_EASE, c.ease - 0.2), due: now + RETRY_AFTER_MS, lapses: c.lapses + 1, wrong: c.wrong + 1, reps: 0, last: now }
  }
  const reps = c.reps + 1
  let ivl: number
  let ease = c.ease
  if (grade === 'hard') {
    ease = Math.max(MIN_EASE, ease - 0.15)
    ivl = reps === 1 ? 1 : Math.max(1, c.ivl * 1.2)
  } else {
    ivl = reps === 1 ? 1 : reps === 2 ? 3 : Math.max(c.ivl + 1, c.ivl * ease)
  }
  ivl = Math.min(ivl, 365)
  return { ...c, ivl, ease, due: now + ivl * DAY, reps, correct: c.correct + 1, last: now }
}

export const isDue = (c: CardState, now: number) => c.due <= now

export type Mastery = 'new' | 'learning' | 'learned'
export function mastery(c: CardState | undefined): Mastery {
  if (!c || c.reps === 0 && c.correct === 0 && c.wrong === 0) return 'new'
  return c.ivl >= 7 ? 'learned' : 'learning'
}

/** Приоритет карточки к повторению: чем больше, тем раньше. Просроченные и «трудные» — выше. */
export function urgency(c: CardState, now: number): number {
  const overdueDays = Math.max(0, (now - c.due) / DAY)
  return overdueDays + c.lapses * 0.5 + (2.5 - c.ease)
}
