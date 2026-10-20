// Хранение репертуаров и прогресса повторений в localStorage (статический сайт, без сервера).
import { pk } from './profile'
import { LocalizedError } from '../i18n/errors'
import type { Repertoire } from './repertoire'
import type { CardState } from './srs'

export type LessonProgress = { done: boolean; runs: number; mistakes: number }

export type OpeningsData = {
  v: 1
  /** Пройденные уроки: ключ — id урока. */
  lessons: Record<string, LessonProgress>
  repertoires: Repertoire[]
  cards: Record<string, CardState>
  activeId: string | null
  stats: { answered: number; correct: number; timeMs: number; sessions: number }
}

export const EMPTY_OPENINGS: OpeningsData = { v: 1, lessons: {}, repertoires: [], cards: {}, activeId: null, stats: { answered: 0, correct: 0, timeMs: 0, sessions: 0 } }

const BASE = 'chess-coach-ai:openings:v1'

export function loadOpenings(): OpeningsData {
  try {
    const raw = localStorage.getItem(pk(BASE))
    if (!raw) return EMPTY_OPENINGS
    const d = JSON.parse(raw) as Partial<OpeningsData>
    if (d.v !== 1 || !Array.isArray(d.repertoires)) return EMPTY_OPENINGS
    return {
      ...EMPTY_OPENINGS, ...d,
      repertoires: d.repertoires.filter(r => r && Array.isArray(r.lines)).map(r => ({ ...r, notes: r.notes ?? {} })),
      cards: d.cards && typeof d.cards === 'object' ? d.cards : {},
      lessons: d.lessons && typeof d.lessons === 'object' ? d.lessons : {},
      stats: { ...EMPTY_OPENINGS.stats, ...(d.stats ?? {}) },
    }
  } catch { return EMPTY_OPENINGS }
}

export function saveOpenings(d: OpeningsData) {
  try { localStorage.setItem(pk(BASE), JSON.stringify(d)) } catch { /* хранилище недоступно — данные только на время сессии */ }
}

export function exportOpenings(d: OpeningsData): string { return JSON.stringify(d, null, 1) }

export function importOpenings(text: string): OpeningsData {
  const d = JSON.parse(text) as Partial<OpeningsData>
  if (d.v !== 1 || !Array.isArray(d.repertoires)) throw new LocalizedError('openings.store.notRepFile')
  return { ...EMPTY_OPENINGS, ...d, repertoires: d.repertoires, cards: d.cards ?? {}, lessons: d.lessons ?? {}, stats: { ...EMPTY_OPENINGS.stats, ...(d.stats ?? {}) } } as OpeningsData
}
