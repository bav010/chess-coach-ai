// Журнал активности: в какие дни пользователь что-то делал на сайте (задача, партия, урок, дебют, анализ).
// По нему считается «ударный режим»; здесь же — итог задачи дня. Хранится по профилю и синхронизируется (объединением).
import { pk } from './profile'

export type DailyResult = { id: string; ok: boolean }
/** Счётчики действий за день (для недельного отчёта). */
export type DayCounts = { puzzles?: number; solved?: number; openings?: number; mistakes?: number; endgames?: number }
/** Цель недели: партий, задач и активных дней. */
export type WeeklyGoal = { games: number; puzzles: number; days: number }
export type Activity = { v: 1; days: string[]; daily: Record<string, DailyResult>; counts?: Record<string, DayCounts>; goal?: WeeklyGoal }

const KEY = 'chess-coach-ai:activity:v1'
const MAX_DAYS = 800
export const EMPTY_ACTIVITY: Activity = { v: 1, days: [], daily: {} }

const pad = (n: number) => String(n).padStart(2, '0')
/** Ключ местных суток вида 2026-10-22. */
export const dayKey = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const DEFAULT_GOAL: WeeklyGoal = { games: 3, puzzles: 20, days: 4 }
export const GOAL_MAX: WeeklyGoal = { games: 50, puzzles: 500, days: 7 }
export function isGoal(g: unknown): g is WeeklyGoal {
  const x = g as WeeklyGoal | null
  return !!x && [x.games, x.puzzles, x.days].every(n => Number.isInteger(n) && n >= 1) && x.games <= GOAL_MAX.games && x.puzzles <= GOAL_MAX.puzzles && x.days <= GOAL_MAX.days
}

export function loadActivity(): Activity {
  try {
    const d = JSON.parse(localStorage.getItem(pk(KEY)) ?? 'null') as Partial<Activity> | null
    if (!d || d.v !== 1) return EMPTY_ACTIVITY
    return {
      v: 1,
      days: Array.isArray(d.days) ? d.days.filter(x => typeof x === 'string') : [],
      daily: d.daily && typeof d.daily === 'object' ? d.daily : {},
      ...(d.counts && typeof d.counts === 'object' ? { counts: d.counts } : {}),
      ...(isGoal(d.goal) ? { goal: d.goal } : {}),
    }
  } catch { return EMPTY_ACTIVITY }
}

export function saveActivity(a: Activity) {
  try { localStorage.setItem(pk(KEY), JSON.stringify(a)) } catch { /* хранилище недоступно */ }
}

/** Отмечает сегодняшний день активным (любое действие: ход в партии, задача, урок, дебют). */
export function markActive(now: Date = new Date()) {
  const a = loadActivity()
  const k = dayKey(now)
  if (a.days.includes(k)) return
  saveActivity({ ...a, days: [...a.days, k].sort().slice(-MAX_DAYS) })
}

/** Записывает итог задачи дня (решённая не перезаписывается неудачей). */
export function markDaily(puzzleId: string, ok: boolean, now: Date = new Date()) {
  const a = loadActivity()
  const k = dayKey(now)
  const cur = a.daily[k]
  if (cur && cur.id === puzzleId && cur.ok) return
  saveActivity({ ...a, days: a.days.includes(k) ? a.days : [...a.days, k].sort().slice(-MAX_DAYS), daily: { ...a.daily, [k]: { id: puzzleId, ok: ok || (cur?.id === puzzleId && cur.ok) } } })
}

/** Прибавляет к счётчикам сегодняшнего дня (и отмечает день активным). */
export function bump(kind: keyof DayCounts, n = 1, now: Date = new Date()) {
  if (n <= 0) return
  const a = loadActivity()
  const k = dayKey(now)
  const cur = a.counts?.[k] ?? {}
  saveActivity({ ...a, days: a.days.includes(k) ? a.days : [...a.days, k].sort().slice(-MAX_DAYS),
    counts: { ...pruneCounts(a.counts), [k]: { ...cur, [kind]: (cur[kind] ?? 0) + n } } })
}
/** Счётчики хранятся не дольше MAX_DAYS последних дней. */
function pruneCounts(c: Record<string, DayCounts> | undefined): Record<string, DayCounts> {
  const keys = Object.keys(c ?? {}).sort().slice(-MAX_DAYS)
  return Object.fromEntries(keys.map(k => [k, c![k]]))
}
export function setGoal(goal: WeeklyGoal) { saveActivity({ ...loadActivity(), goal }) }

function mergeCounts(a: Record<string, DayCounts> | undefined, b: Record<string, DayCounts> | undefined): Record<string, DayCounts> | undefined {
  if (!a && !b) return undefined
  const out: Record<string, DayCounts> = {}
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const x = a?.[k] ?? {}, y = b?.[k] ?? {}
    out[k] = { puzzles: Math.max(x.puzzles ?? 0, y.puzzles ?? 0), solved: Math.max(x.solved ?? 0, y.solved ?? 0), openings: Math.max(x.openings ?? 0, y.openings ?? 0), mistakes: Math.max(x.mistakes ?? 0, y.mistakes ?? 0), endgames: Math.max(x.endgames ?? 0, y.endgames ?? 0) }
  }
  return pruneCounts(out)
}

export function mergeActivity(a: Activity, b: Activity): Activity {
  const days = [...new Set([...a.days, ...b.days])].sort().slice(-MAX_DAYS)
  const daily: Record<string, DailyResult> = { ...b.daily }
  for (const [k, v] of Object.entries(a.daily)) { const o = daily[k]; daily[k] = o && o.id === v.id ? { id: v.id, ok: v.ok || o.ok } : o?.ok && !v.ok ? o : v }
  const counts = mergeCounts(a.counts, b.counts)
  const goal = a.goal ?? b.goal
  return { v: 1, days, daily, ...(counts ? { counts } : {}), ...(goal ? { goal } : {}) }
}

/** Серия дней подряд с активностью; не рвётся, если сегодня ещё ничего не делали, но делали вчера. */
export function streakOf(days: ReadonlySet<string>, now: Date = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}
