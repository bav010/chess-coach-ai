import type { Color } from 'chess.js'
import { QUALITY, type PositionEval, type ReviewReport as Report } from '../lib/review'
import type { ReviewQuality } from '../lib/prefs'
import ReviewReportView from './ReviewReport'
import { useI18n } from '../i18n'

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
  const { t } = useI18n()
  if (p.records === 0) {
    return <section className="panel"><p className="muted">{t('analysis.review.noGame')}</p></section>
  }
  if (p.review?.running) {
    const pct = p.review.total ? Math.round((p.review.done / p.review.total) * 100) : 0
    return <section className="panel review-progress" data-testid="review-progress">
      <div className="panel-head"><div><div className="eyebrow">{t('analysis.report.eyebrow')}</div><h2>{t('analysis.review.running')}</h2></div><span className="pill">{p.review.done} / {p.review.total}</span></div>
      <div className="progress-bar"><div style={{ width: `${pct}%` }} /></div>
      <p className="tiny">{t('analysis.review.runningNote')}</p>
      <button className="btn" onClick={p.onCancel}>{t('analysis.review.cancel')}</button>
    </section>
  }
  if (p.report) {
    return <>
      <ReviewReportView report={p.report} names={p.names} onGoto={p.onGoto} onTrain={p.onTrain} userColor={p.userColor} trainerSummary={p.trainerSummary} />
      <div className="board-actions"><button className="btn" onClick={p.onStart}>{t('analysis.review.redo')}</button></div>
    </>
  }
  const partial = !!p.review && p.review.evals.some(Boolean)
  return <section className="panel review-start" data-testid="review-start">
    <div className="panel-head"><div><div className="eyebrow">{t('analysis.report.eyebrow')}</div><h2>{t('analysis.review.startTitle')}</h2></div></div>
    <p className="muted">{t('analysis.review.startIntro')}</p>
    <label className="field">{t('analysis.review.quality')}
      <select value={p.quality} onChange={e => p.onQuality(e.target.value as ReviewQuality)}>
        {(Object.keys(QUALITY) as ReviewQuality[]).map(q => <option key={q} value={q}>{t('analysis.review.qualityOption', { label: QUALITY[q].label, depth: QUALITY[q].depth, ms: QUALITY[q].movetime })}</option>)}
      </select>
    </label>
    <button className="btn primary full" onClick={p.onStart} disabled={p.engineError} data-testid="start-review">{partial ? t('analysis.review.resume') : t('analysis.review.start')}</button>
  </section>
}
