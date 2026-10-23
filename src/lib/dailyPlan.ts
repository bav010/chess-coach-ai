// «Сегодняшний план»: до трёх шагов из данных пользователя. Ничего не выдумываем: шаг появляется, только если для него есть основание.
import { countCards } from './drill'
import type { GameStat } from './gameStats'
import type { OpeningsData } from './openingsStore'
import type { PuzzleStats } from './puzzleStats'
import { weakThemes } from './puzzleStats'
import type { ThemeId } from './puzzleThemes'

export type PlanStep =
  | { id: 'daily'; puzzleId: string; done: boolean }
  | { id: 'openings'; due: number }
  | { id: 'mine'; due: number }
  | { id: 'weak'; theme: ThemeId; percent: number; tried: number }
  | { id: 'review' }
  | { id: 'play' }

export type PlanInput = {
  /** id задачи дня или null, если её нет. */
  dailyId: string | null
  dailySolved: boolean
  puzzles: PuzzleStats
  games: readonly GameStat[]
  openings: OpeningsData
  /** Есть ли сохранённая партия, которую можно открыть на разбор. */
  hasSavedGame: boolean
  /** Личные задачи из ошибок, готовые к тренировке (просроченные и новые). */
  mistakesDue?: number
  now: number
}

export const MAX_STEPS = 3
/** Минимум попыток по теме, чтобы назвать её слабой (как в рекомендациях статистики). */
export const WEAK_MIN_TRIED = 5

/** Повторы дебютов: сколько позиций пора повторить или изучить в активном репертуаре. */
export function openingsDue(d: OpeningsData, now: number): number {
  const rep = d.repertoires.find(r => r.id === d.activeId) ?? d.repertoires[0]
  if (!rep || rep.lines.length === 0) return 0
  const done = new Set(Object.entries(d.lessons).filter(([, v]) => v.done).map(([k]) => k))
  const c = countCards(rep, d.cards, now, done)
  return c.due + c.new
}

/** Последняя партия ещё не разобрана. */
export function lastGameUnreviewed(games: readonly GameStat[]): boolean {
  if (games.length === 0) return false
  const last = games.reduce((a, b) => (a.at >= b.at ? a : b))
  return !last.review
}

export function buildPlan(i: PlanInput): PlanStep[] {
  const steps: PlanStep[] = []
  if (i.dailyId) steps.push({ id: 'daily', puzzleId: i.dailyId, done: i.dailySolved })

  const rest: PlanStep[] = []
  const due = openingsDue(i.openings, i.now)
  if (due > 0) rest.push({ id: 'openings', due })
  if ((i.mistakesDue ?? 0) > 0) rest.push({ id: 'mine', due: i.mistakesDue! })
  const w = weakThemes(i.puzzles, WEAK_MIN_TRIED)[0]
  if (w) rest.push({ id: 'weak', theme: w.theme, percent: w.percent, tried: w.tried })
  if (i.hasSavedGame && lastGameUnreviewed(i.games)) rest.push({ id: 'review' })
  rest.push({ id: 'play' })

  return [...steps, ...rest].slice(0, MAX_STEPS)
}
