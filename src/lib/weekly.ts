// Недельный отчёт: что сделано за неделю (пн–вс по местному времени), сравнение с прошлой неделей, цель и один фокус на следующую.
import { DEFAULT_GOAL, dayKey, type Activity, type WeeklyGoal } from './activity'
import type { GameStat } from './gameStats'

export type WeekDay = { key: string; active: boolean; puzzles: number }
export type WeekReport = {
  start: string
  end: string
  days: WeekDay[]
  games: { n: number; w: number; d: number; l: number }
  /** Средняя точность партий недели, у которых есть разбор; null — разборов нет. */
  acc: number | null
  reviewed: number
  puzzles: { tried: number; solved: number }
  openings: number
  mistakes: number
  activeDays: number
}

/** Понедельник недели, в которую попадает дата (местное время), в 00:00. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export function weekReport(games: readonly GameStat[], activity: Activity, now: Date, weeksBack = 0): WeekReport {
  const start = weekStart(now)
  start.setDate(start.getDate() - 7 * weeksBack)
  const keys: string[] = []
  for (let i = 0; i < 7; i++) { const x = new Date(start); x.setDate(start.getDate() + i); keys.push(dayKey(x)) }
  const set = new Set(keys)
  const days = keys.map(k => ({ key: k, active: activity.days.includes(k), puzzles: activity.counts?.[k]?.puzzles ?? 0 }))
  const sum = (f: 'puzzles' | 'solved' | 'openings' | 'mistakes') => keys.reduce((a, k) => a + (activity.counts?.[k]?.[f] ?? 0), 0)
  // партии: только сыгранные (с ботом), законченные на этой неделе; разбор партий из анализа в «игры» не входит
  const mine = games.filter(g => g.src !== 'analysis' && g.outcome !== null && set.has(dayKey(new Date(g.at))))
  const accs = games.filter(g => set.has(dayKey(new Date(g.at))) && g.review?.acc != null).map(g => g.review!.acc as number)
  return {
    start: keys[0], end: keys[6], days,
    games: { n: mine.length, w: mine.filter(g => g.outcome === 'win').length, d: mine.filter(g => g.outcome === 'draw').length, l: mine.filter(g => g.outcome === 'loss').length },
    acc: accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length * 10) / 10 : null,
    reviewed: accs.length,
    puzzles: { tried: sum('puzzles'), solved: sum('solved') },
    openings: sum('openings'), mistakes: sum('mistakes'),
    activeDays: days.filter(d => d.active).length,
  }
}

export type Focus = 'start' | 'puzzles' | 'play' | 'review' | 'openings' | 'keep'

/** Один совет на следующую неделю по правилам из данных (без догадок): порядок проверки важен. */
export function focusOf(cur: WeekReport, prev: WeekReport, goal: WeeklyGoal = DEFAULT_GOAL): Focus {
  if (cur.activeDays === 0 && prev.activeDays === 0) return 'start'
  if (cur.puzzles.tried < goal.puzzles / 2) return 'puzzles'
  if (cur.games.n < goal.games) return 'play'
  if (cur.acc !== null && prev.acc !== null && cur.acc <= prev.acc - 3) return 'review'
  if (cur.openings === 0) return 'openings'
  return 'keep'
}

export type Progress = { games: number; puzzles: number; days: number }
/** Доля выполнения цели по каждому пункту, 0..1. */
export function goalProgress(cur: WeekReport, goal: WeeklyGoal): Progress {
  const f = (v: number, g: number) => Math.min(1, v / g)
  return { games: f(cur.games.n, goal.games), puzzles: f(cur.puzzles.tried, goal.puzzles), days: f(cur.activeDays, goal.days) }
}
export const goalDone = (p: Progress) => p.games >= 1 && p.puzzles >= 1 && p.days >= 1
