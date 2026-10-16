// Классификация ходов и точность — единая для всего приложения.
//
// Методика (приближённая, не официальный показатель какого-либо сервиса):
//  1. Для хода берём оценку позиции до хода (по лучшему ходу движка) и после сыгранного хода,
//     переводим их в шансы на победу (0..100%) с точки зрения того, кто ходил.
//  2. Потеря = max(0, шансы_до − шансы_после) в процентных пунктах.
//  3. Категории по порогам потери (DEFAULT_THRESHOLDS); особые оценки — см. review.ts.
//  4. Точность хода = 103.1668·exp(−0.04354·потеря) − 3.1669, ограничена 0..100 (кривая Lichess);
//     точность стороны — среднее по её ходам.
// Результат зависит от глубины анализа и параметров движка и является оценкой, а не истиной.
import type { Color } from 'chess.js'
import { forColor, winPercentFor, type Score } from './eval'

export type Thresholds = {
  /** Потеря до этого значения — «отличный» ход (почти не хуже лучшего, хотя и не первая линия движка). */
  best: number
  /** Потеря шансов на победу (п. п.), с которой ход считается неточностью. */
  inaccuracy: number
  mistake: number
  blunder: number
}

export const DEFAULT_THRESHOLDS: Thresholds = { best: 2, inaccuracy: 5, mistake: 10, blunder: 15 }

export type MoveClass =
  | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book'
  | 'inaccuracy' | 'mistake' | 'miss' | 'blunder'

/** Порядок показа — от лучшего к худшему. */
export const CLASS_ORDER: MoveClass[] = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder',
]

export const CLASS_LABEL: Record<MoveClass, string> = {
  brilliant: 'Блестящий ход',
  great: 'Сильный ход',
  best: 'Лучший ход',
  excellent: 'Отличный ход',
  good: 'Хороший ход',
  book: 'Дебютный ход',
  inaccuracy: 'Неточность',
  mistake: 'Ошибка',
  miss: 'Упущенный шанс',
  blunder: 'Зевок',
}

export const CLASS_MARK: Record<MoveClass, string> = {
  brilliant: '!!', great: '!', best: '★', excellent: '👍', good: '✓', book: '📖',
  inaccuracy: '?!', mistake: '?', miss: '✕', blunder: '??',
}

/** «Плохие» оценки. */
export const isBad = (c: MoveClass): boolean => c === 'inaccuracy' || c === 'mistake' || c === 'miss' || c === 'blunder'
/** Критические ходы — по ним строится тренировка. */
export const isCritical = (c: MoveClass): boolean => c === 'mistake' || c === 'miss' || c === 'blunder'
/** Какие оценки рисовать значком на доске и в нотации (хорошие и отличные ходы — без значка, чтобы не шуметь). */
export const hasIcon = (c: MoveClass): boolean => c !== 'good' && c !== 'excellent'

/** Потеря шансов на победу (п. п.) для ходившей стороны. Оценки — с точки зрения белых. */
export function winLoss(before: Score, after: Score, mover: Color): number {
  const b = winPercentFor(before, mover)
  const a = winPercentFor(after, mover)
  return Math.max(0, b - a)
}

/**
 * Базовая категория по потере. Особые оценки (блестящий, сильный, дебютный, упущенный шанс)
 * надстраиваются поверх неё в review.ts — им нужен контекст позиции.
 */
export function classify(loss: number, playedIsBest: boolean, t: Thresholds = DEFAULT_THRESHOLDS): MoveClass {
  if (playedIsBest) return 'best'
  if (loss <= t.best) return 'excellent'
  if (loss < t.inaccuracy) return 'good'
  if (loss < t.mistake) return 'inaccuracy'
  if (loss < t.blunder) return 'mistake'
  return 'blunder'
}

export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))
}

export function sideAccuracy(losses: readonly number[]): number | null {
  if (losses.length === 0) return null
  return losses.reduce((s, l) => s + moveAccuracy(l), 0) / losses.length
}

/** Ход «вернул оценку в пользу ходившего» — для отладки и текстов: разница оценок для стороны. */
export function scoreDelta(before: Score, after: Score, mover: Color): { before: Score; after: Score } {
  return { before: forColor(before, mover), after: forColor(after, mover) }
}
