// Оценки позиции: нормализация, формат, перевод в шансы на победу.
import type { Color } from 'chess.js'

/**
 * Оценка. Если не сказано иное, она «с точки зрения белых» (+ — лучше белым).
 * cp — сантипешки, mate — число ходов до мата (знак — в чью пользу), final — итог окончившейся партии.
 */
export type Score = {
  cp: number | null
  mate: number | null
  final?: '1-0' | '0-1' | '1/2-1/2'
}

/** UCI выдаёт оценку с точки зрения стороны, чей ход. Переводим в точку зрения белых. */
export function toWhite(score: { cp: number | null; mate: number | null }, turn: Color): Score {
  const sign = turn === 'w' ? 1 : -1
  return {
    cp: score.cp === null ? null : score.cp * sign,
    mate: score.mate === null ? null : score.mate * sign,
  }
}

/** Оценка с точки зрения заданной стороны. */
export function forColor(score: Score, color: Color): Score {
  if (color === 'w') return score
  const flip = (r: Score['final']): Score['final'] => (r === '1-0' ? '0-1' : r === '0-1' ? '1-0' : r)
  return {
    cp: score.cp === null ? null : -score.cp,
    mate: score.mate === null ? null : -score.mate,
    final: flip(score.final),
  }
}

/** Итог окончившейся партии как оценка. */
export function finalScore(result: '1-0' | '0-1' | '1/2-1/2'): Score {
  return { cp: result === '1/2-1/2' ? 0 : null, mate: null, final: result }
}

const MINUS = '−'

/** Единый формат: +1.5, −1.5, 0.0, M3, −M3 (для окончившейся партии — результат). */
export function formatScore(score: Score): string {
  if (score.final) return score.final
  if (score.mate !== null) {
    const m = Math.abs(score.mate)
    return `${score.mate < 0 ? MINUS : ''}M${m}`
  }
  const pawns = (score.cp ?? 0) / 100
  const abs = Math.min(Math.abs(pawns), 99.9)
  const text = abs.toFixed(1)
  if (text === '0.0') return '0.0'
  return `${pawns > 0 ? '+' : MINUS}${text}`
}

/** Шансы белых на победу, 0..100. Формула Lichess: логистическая кривая от сантипешек. */
export function whiteWinPercent(score: Score): number {
  if (score.final) return score.final === '1-0' ? 100 : score.final === '0-1' ? 0 : 50
  if (score.mate !== null) return score.mate > 0 ? 100 : 0
  const cp = Math.max(-1000, Math.min(1000, score.cp ?? 0))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Шансы на победу для заданной стороны, 0..100. */
export function winPercentFor(score: Score, color: Color): number {
  const w = whiteWinPercent(score)
  return color === 'w' ? w : 100 - w
}

/** Доля белой части шкалы преимущества, 0..100 (та же кривая, что и для шансов). */
export function barWhitePercent(score: Score | null): number {
  return score ? whiteWinPercent(score) : 50
}
