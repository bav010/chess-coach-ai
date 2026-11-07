// «Тренировка дня»: одна короткая сессия из того, что вам сейчас нужнее всего. Блок появляется, только если для него есть материал
// (ошибки к повторению, дебютные позиции, эндшпили, слабая тема). Прогресс берётся из дневных счётчиков активности.
import type { DayCounts } from './activity'
import type { RouteName } from './route'
import type { ThemeId } from './puzzleThemes'

export type BlockId = 'daily' | 'mistakes' | 'openings' | 'endgames' | 'puzzles'
export type Block = { id: BlockId; target: number; done: number; minutes: number; route: RouteName; arg: string | null; theme?: ThemeId }

export type TrainInput = {
  dailyId: string | null
  dailySolved: boolean
  /** Пытались ли сегодня решить задачу дня (счётчик задач учитывает и её). */
  dailyTried: boolean
  /** Ошибки: просроченные и новые. */
  mistakes: number
  openingsDue: number
  /** Эндшпили к повторению (id, самые срочные первыми) и первая новая позиция. */
  endgameDue: readonly string[]
  endgameNew: string | null
  weakTheme: ThemeId | null
  today: DayCounts
}

/** Сколько элементов блока берём за один раз и сколько минут занимает один элемент. */
export const CAP: Record<Exclude<BlockId, 'daily'>, number> = { mistakes: 5, openings: 5, endgames: 2, puzzles: 5 }
export const MINUTES: Record<BlockId, number> = { daily: 3, mistakes: 1.5, openings: 1, endgames: 4, puzzles: 1 }

export function buildSession(i: TrainInput): Block[] {
  const out: Block[] = []
  const t = i.today
  if (i.dailyId) out.push({ id: 'daily', target: 1, done: i.dailySolved ? 1 : 0, minutes: MINUTES.daily, route: 'tactics', arg: i.dailyId })

  // цель не уменьшается по мере выполнения: «осталось» + «уже сделано сегодня», не больше лимита
  const m = i.mistakes + (t.mistakes ?? 0)
  if (m > 0) out.push({ id: 'mistakes', target: Math.min(CAP.mistakes, m), done: t.mistakes ?? 0, minutes: MINUTES.mistakes, route: 'tactics', arg: 'mine' })
  const o = i.openingsDue + (t.openings ?? 0)
  if (o > 0) out.push({ id: 'openings', target: Math.min(CAP.openings, o), done: t.openings ?? 0, minutes: MINUTES.openings, route: 'openings', arg: null })

  const eg = i.endgameDue.length + (t.endgames ?? 0)
  const egTarget = eg > 0 ? Math.min(CAP.endgames, eg) : i.endgameNew ? 1 : 0
  if (egTarget > 0) out.push({ id: 'endgames', target: egTarget, done: t.endgames ?? 0, minutes: MINUTES.endgames, route: 'endgames', arg: i.endgameDue[0] ?? i.endgameNew })

  // обычные задачи; задача дня в счётчик входит, поэтому вычитаем её
  const solvedPuzzles = Math.max(0, (t.puzzles ?? 0) - (i.dailyTried ? 1 : 0))
  out.push({ id: 'puzzles', target: CAP.puzzles, done: solvedPuzzles, minutes: MINUTES.puzzles, route: 'tactics', arg: null, ...(i.weakTheme ? { theme: i.weakTheme } : {}) })
  return out
}

export type SessionProgress = { done: number; total: number; percent: number; minutesLeft: number; complete: boolean }
export function sessionProgress(blocks: readonly Block[]): SessionProgress {
  let done = 0, total = 0, left = 0
  for (const b of blocks) { done += Math.min(b.done, b.target); total += b.target; left += Math.max(0, b.target - b.done) * b.minutes }
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, minutesLeft: Math.ceil(left), complete: total > 0 && done >= total }
}
