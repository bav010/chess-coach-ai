import type { Color } from 'chess.js'
import { QUALITY, type PositionEval, type ReviewReport as Report } from '../lib/review'
import type { ReviewQuality } from '../lib/prefs'
import ReviewReportView from './ReviewReport'

type Props = {
  records: number
  review: { evals: PositionEval[]; running: boolean; done: number; total: number } | null
  report: Report | null
  reviewComplete: boolean
  names: Record<Color, string>
  userColor: Color | null
  onStart: () => void
  onCancel: () => void
  onGoto: (ply: number) => void
  onTrain: (side: Color | 'both') => void
  trainerSummary: { solved: number; total: number } | null
  quality: ReviewQuality
  onQuality: (q: ReviewQuality) => void
  engineError: boolean
}

/** Вкладка «Разбор партии»: запуск, ход выполнения, отчёт. */
export default function ReviewSection(p: Props) {
  if (p.records === 0) {
    return <section className="panel"><p className="muted">Сыграйте или загрузите партию, чтобы разобрать её.</p></section>
  }
  if (p.review?.running) {
    const pct = p.review.total ? Math.round((p.review.done / p.review.total) * 100) : 0
    return <section className="panel review-progress" data-testid="review-progress">
      <div className="panel-head"><div><div className="eyebrow">РАЗБОР ПАРТИИ</div><h2>Идёт анализ…</h2></div><span className="pill">{p.review.done} / {p.review.total}</span></div>
      <div className="progress-bar"><div style={{ width: `${pct}%` }} /></div>
      <p className="tiny">Каждая позиция анализируется Stockfish. Можно пока листать партию; результаты сохраняются, прерванный разбор можно продолжить.</p>
      <button className="btn" onClick={p.onCancel}>Отменить</button>
    </section>
  }
  if (p.report) {
    return <>
      <ReviewReportView report={p.report} names={p.names} onGoto={p.onGoto} onTrain={p.onTrain} userColor={p.userColor} trainerSummary={p.trainerSummary} />
      <div className="board-actions"><button className="btn" onClick={p.onStart}>Пересчитать разбор</button></div>
    </>
  }
  const partial = !!p.review && p.review.evals.some(Boolean)
  return <section className="panel review-start" data-testid="review-start">
    <div className="panel-head"><div><div className="eyebrow">РАЗБОР ПАРТИИ</div><h2>Работа над ошибками</h2></div></div>
    <p className="muted">Stockfish пройдёт по всем позициям партии, оценит каждый ход, посчитает точность и найдёт ошибки, которые затем можно потренировать.</p>
    <label className="field">Качество разбора
      <select value={p.quality} onChange={e => p.onQuality(e.target.value as ReviewQuality)}>
        {(Object.keys(QUALITY) as ReviewQuality[]).map(q => <option key={q} value={q}>{QUALITY[q].label} — глубина {QUALITY[q].depth}, до {QUALITY[q].movetime} мс на позицию</option>)}
      </select>
    </label>
    <button className="btn primary full" onClick={p.onStart} disabled={p.engineError} data-testid="start-review">{partial ? 'Продолжить разбор' : '🔍 Разобрать партию'}</button>
  </section>
}
