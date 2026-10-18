// Статистика решения задач. Хранится в localStorage (статический сайт, без сервера).
import { pk } from './profile'
import { THEME_ORDER, type ThemeId } from './puzzleThemes'

export type ThemeStat = { tried: number; solved: number; firstTry: number; timeMs: number }

export type PuzzleStats = {
  v: 1
  /** Задач с результатом (решена или провалена). */
  attempted: number
  /** Решено без показа решения и без ошибок до этого — зачёт. */
  solved: number
  /** Решено с первой попытки и без подсказок. */
  clean: number
  timeMs: number
  byTheme: Partial<Record<ThemeId, ThemeStat>>
  solvedIds: string[]
  failedIds: string[]
}

export const EMPTY_STATS: PuzzleStats = { v: 1, attempted: 0, solved: 0, clean: 0, timeMs: 0, byTheme: {}, solvedIds: [], failedIds: [] }

export type Outcome = {
  puzzleId: string
  themes: readonly ThemeId[]
  /** solved — решена без ошибок и без показа решения; failed — ошибка или показ решения. */
  result: 'solved' | 'failed'
  hintsUsed: number
  timeMs: number
}

/**
 * Записывает итог одной задачи. Решённой считается только задача, решённая без ошибки и без показа
 * решения; любая ошибка или «Показать решение» — это провал (повторное решение после неё в зачёт не идёт).
 */
export function recordOutcome(s: PuzzleStats, o: Outcome): PuzzleStats {
  const solved = o.result === 'solved'
  const byTheme = { ...s.byTheme }
  for (const t of o.themes) {
    const cur = byTheme[t] ?? { tried: 0, solved: 0, firstTry: 0, timeMs: 0 }
    byTheme[t] = {
      tried: cur.tried + 1,
      solved: cur.solved + (solved ? 1 : 0),
      firstTry: cur.firstTry + (solved && o.hintsUsed === 0 ? 1 : 0),
      timeMs: cur.timeMs + o.timeMs,
    }
  }
  const without = (ids: string[]) => ids.filter(x => x !== o.puzzleId)
  return {
    ...s,
    attempted: s.attempted + 1,
    solved: s.solved + (solved ? 1 : 0),
    clean: s.clean + (solved && o.hintsUsed === 0 ? 1 : 0),
    timeMs: s.timeMs + o.timeMs,
    byTheme,
    solvedIds: solved ? [...without(s.solvedIds), o.puzzleId] : without(s.solvedIds),
    failedIds: solved ? without(s.failedIds) : [...without(s.failedIds), o.puzzleId],
  }
}

export const successPercent = (s: PuzzleStats) => (s.attempted === 0 ? 0 : Math.round((s.solved / s.attempted) * 100))

export type WeakTheme = { theme: ThemeId; tried: number; percent: number }

/** Слабые темы: хотя бы 2 попытки и успех ниже 70 %, худшие первыми (при равенстве — где больше попыток). */
export function weakThemes(s: PuzzleStats, minTried = 2): WeakTheme[] {
  const out: WeakTheme[] = []
  for (const t of THEME_ORDER) {
    const st = s.byTheme[t]
    if (!st || st.tried < minTried) continue
    const percent = Math.round((st.solved / st.tried) * 100)
    if (percent < 70) out.push({ theme: t, tried: st.tried, percent })
  }
  return out.sort((a, b) => a.percent - b.percent || b.tried - a.tried)
}

export function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} с`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} мин ${sec % 60} с`
  return `${Math.floor(m / 60)} ч ${m % 60} мин`
}

const BASE = 'chess-coach-ai:puzzles:v1'

export function loadPuzzleStats(): PuzzleStats {
  try {
    const raw = localStorage.getItem(pk(BASE))
    if (!raw) return EMPTY_STATS
    const d = JSON.parse(raw) as Partial<PuzzleStats>
    if (d.v !== 1 || typeof d.attempted !== 'number') return EMPTY_STATS
    return {
      ...EMPTY_STATS, ...d,
      byTheme: d.byTheme && typeof d.byTheme === 'object' ? d.byTheme : {},
      solvedIds: Array.isArray(d.solvedIds) ? d.solvedIds : [],
      failedIds: Array.isArray(d.failedIds) ? d.failedIds : [],
    }
  } catch { return EMPTY_STATS }
}

export function savePuzzleStats(s: PuzzleStats) {
  try { localStorage.setItem(pk(BASE), JSON.stringify(s)) } catch { /* хранилище недоступно — статистика только на время сессии */ }
}

export function resetPuzzleStats(): PuzzleStats {
  try { localStorage.removeItem(pk(BASE)) } catch { /* ничего */ }
  return EMPTY_STATS
}
