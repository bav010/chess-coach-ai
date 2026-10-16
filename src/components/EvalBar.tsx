import type { Color } from 'chess.js'
import { barWhitePercent, formatScore, type Score } from '../lib/eval'

type Props = {
  /** Оценка с точки зрения белых; null — пока нет данных. */
  score: Score | null
  /** Какая сторона внизу доски. */
  orientation: Color
  busy?: boolean
}

/** Вертикальная шкала преимущества. Использует уже полученную оценку, сама ничего не считает. */
export default function EvalBar({ score, orientation, busy }: Props) {
  const pct = barWhitePercent(score)
  const label = score ? formatScore(score) : '…'
  const whiteLeads = pct >= 50
  // белая часть растёт от той стороны, которая у белых внизу/вверху доски
  const flipped = orientation === 'b'
  return <div className={`eval-bar ${flipped ? 'flipped' : ''} ${busy ? 'busy' : ''}`} role="img"
    aria-label={`Оценка позиции: ${label}`} data-pct={pct.toFixed(1)}>
    <div className="eval-bar-white" style={{ height: `${pct}%` }} />
    <span className={`eval-bar-label ${whiteLeads ? 'on-white' : 'on-black'} ${whiteLeads !== flipped ? 'at-bottom' : 'at-top'}`}>{label}</span>
  </div>
}
