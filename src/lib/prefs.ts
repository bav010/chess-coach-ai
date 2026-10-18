import { pk } from './profile'
import { DEFAULT_THRESHOLDS, type Thresholds } from './classify'

export type ReviewQuality = 'fast' | 'normal' | 'deep'

export type Prefs = {
  showPanel: boolean
  showBar: boolean
  showArrows: boolean
  /** Значки и разбор оценки хода (блестящий, ошибка, зевок…). */
  showMarks: boolean
  arrowOpacity: number
  arrowWidth: number
  arrowCount: number
  numbering: boolean
  /** Сколько вариантов запрашивать у движка (MultiPV). */
  multipv: number
  autoReview: boolean
  reviewQuality: ReviewQuality
  thresholds: Thresholds
}

export const DEFAULT_PREFS: Prefs = {
  showPanel: true,
  showBar: true,
  showArrows: true,
  showMarks: true,
  arrowOpacity: 0.85,
  arrowWidth: 0.16,
  arrowCount: 3,
  numbering: true,
  multipv: 3,
  autoReview: false,
  reviewQuality: 'normal',
  thresholds: DEFAULT_THRESHOLDS,
}

const BASE = 'chess-coach-ai:prefs:v1'

const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(pk(BASE))
    if (!raw) return DEFAULT_PREFS
    const d = JSON.parse(raw) as Partial<Prefs>
    const t = (d.thresholds ?? {}) as Partial<Thresholds>
    return {
      showPanel: d.showPanel ?? DEFAULT_PREFS.showPanel,
      showBar: d.showBar ?? DEFAULT_PREFS.showBar,
      showArrows: d.showArrows ?? DEFAULT_PREFS.showArrows,
      showMarks: d.showMarks ?? DEFAULT_PREFS.showMarks,
      arrowOpacity: clamp(d.arrowOpacity, 0.2, 1, DEFAULT_PREFS.arrowOpacity),
      arrowWidth: clamp(d.arrowWidth, 0.06, 0.3, DEFAULT_PREFS.arrowWidth),
      arrowCount: Math.round(clamp(d.arrowCount, 0, 5, DEFAULT_PREFS.arrowCount)),
      numbering: d.numbering ?? DEFAULT_PREFS.numbering,
      multipv: Math.round(clamp(d.multipv, 1, 5, DEFAULT_PREFS.multipv)),
      autoReview: d.autoReview ?? DEFAULT_PREFS.autoReview,
      reviewQuality: d.reviewQuality === 'fast' || d.reviewQuality === 'deep' ? d.reviewQuality : 'normal',
      thresholds: {
        best: clamp(t.best, 0, 5, DEFAULT_THRESHOLDS.best),
        inaccuracy: clamp(t.inaccuracy, 1, 30, DEFAULT_THRESHOLDS.inaccuracy),
        mistake: clamp(t.mistake, 2, 40, DEFAULT_THRESHOLDS.mistake),
        blunder: clamp(t.blunder, 3, 60, DEFAULT_THRESHOLDS.blunder),
      },
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(p: Prefs) {
  try { localStorage.setItem(pk(BASE), JSON.stringify(p)) } catch { /* приватный режим */ }
}
