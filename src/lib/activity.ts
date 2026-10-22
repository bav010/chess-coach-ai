// Журнал активности: в какие дни пользователь что-то делал на сайте (задача, партия, урок, дебют, анализ).
// По нему считается «ударный режим»; здесь же — итог задачи дня. Хранится по профилю и синхронизируется (объединением).
import { pk } from './profile'

export type DailyResult = { id: string; ok: boolean }
export type Activity = { v: 1; days: string[]; daily: Record<string, DailyResult> }

const KEY = 'chess-coach-ai:activity:v1'
const MAX_DAYS = 800
export const EMPTY_ACTIVITY: Activity = { v: 1, days: [], daily: {} }

const pad = (n: number) => String(n).padStart(2, '0')
/** Ключ местных суток вида 2026-10-22. */
export const dayKey = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function loadActivity(): Activity {
  try {
    const d = JSON.parse(localStorage.getItem(pk(KEY)) ?? 'null') as Partial<Activity> | null
    if (!d || d.v !== 1) return EMPTY_ACTIVITY
    return {
      v: 1,
      days: Array.isArray(d.days) ? d.days.filter(x => typeof x === 'string') : [],
      daily: d.daily && typeof d.daily === 'object' ? d.daily : {},
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

export function mergeActivity(a: Activity, b: Activity): Activity {
  const days = [...new Set([...a.days, ...b.days])].sort().slice(-MAX_DAYS)
  const daily: Record<string, DailyResult> = { ...b.daily }
  for (const [k, v] of Object.entries(a.daily)) { const o = daily[k]; daily[k] = o && o.id === v.id ? { id: v.id, ok: v.ok || o.ok } : o?.ok && !v.ok ? o : v }
  return { v: 1, days, daily }
}

/** Серия дней подряд с активностью; не рвётся, если сегодня ещё ничего не делали, но делали вчера. */
export function streakOf(days: ReadonlySet<string>, now: Date = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}
