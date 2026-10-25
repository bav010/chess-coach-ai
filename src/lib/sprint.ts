// «На время»: серия задач на 3 минуты. Хранит только итоги забегов (рекорд, число забегов, последние результаты);
// статистику задач из библиотеки не трогает, чтобы два экрана не перезаписывали друг друга.
import { pk } from './profile'

export type SprintRun = { at: string; score: number; mistakes: number; level: 0 | 1 | 2 | 3; seconds: number }
export type SprintStore = { v: 1; best: number; runs: number; history: SprintRun[] }
export const EMPTY_SPRINT: SprintStore = { v: 1, best: 0, runs: 0, history: [] }
export const RUN_SECONDS = 180
export const MAX_MISTAKES = 3
const HISTORY = 20

export type RecordResult = { store: SprintStore; record: boolean }

/** Записывает забег. Рекордом считается результат строго выше прежнего лучшего (первый забег с нулём рекордом не считается). */
export function recordRun(s: SprintStore, run: SprintRun): RecordResult {
  const record = run.score > s.best
  const history = [run, ...s.history].slice(0, HISTORY)
  return { record, store: { v: 1, best: Math.max(s.best, run.score), runs: s.runs + 1, history } }
}

/** Объединение двух устройств: история по времени без дублей, рекорд — максимум, число забегов — не меньше известного. */
export function mergeSprint(a: SprintStore, b: SprintStore): SprintStore {
  const seen = new Set<string>()
  const history = [...a.history, ...b.history].filter(r => (seen.has(r.at) ? false : (seen.add(r.at), true)))
    .sort((x, y) => y.at.localeCompare(x.at)).slice(0, HISTORY)
  return { v: 1, best: Math.max(a.best, b.best, ...history.map(r => r.score)), runs: Math.max(a.runs, b.runs, history.length), history }
}

/** Точность забега: решено / (решено + ошибки), % (null, если ничего не было). */
export const runAccuracy = (score: number, mistakes: number): number | null => (score + mistakes === 0 ? null : Math.round((score / (score + mistakes)) * 100))

const BASE = 'chess-coach-ai:sprint:v1'
export function loadSprint(): SprintStore {
  try {
    const raw = localStorage.getItem(pk(BASE))
    const d = (raw ? JSON.parse(raw) : null) as Partial<SprintStore> | null
    if (d && d.v === 1 && typeof d.best === 'number' && typeof d.runs === 'number' && Array.isArray(d.history)) return { v: 1, best: d.best, runs: d.runs, history: d.history }
  } catch { /* повреждённые данные — начинаем сначала */ }
  return EMPTY_SPRINT
}
export function saveSprint(s: SprintStore) { try { localStorage.setItem(pk(BASE), JSON.stringify(s)) } catch { /* хранилище недоступно */ } }
