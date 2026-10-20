import type { Color } from 'chess.js'
import { CLASS_LABEL, CLASS_ORDER, isCritical } from '../lib/classify'
import MoveMark from './MoveMark'
import { forColor, formatScore, whiteWinPercent } from '../lib/eval'
import { colorName } from '../lib/glyphs'
import type { ReviewMove, ReviewReport as Report } from '../lib/review'
import { useI18n } from '../i18n'

type Props = {
  report: Report
  names: Record<Color, string>
  onGoto: (ply: number) => void
  onTrain: (side: Color | 'both') => void
  userColor: Color | null
  trainerSummary: { solved: number; total: number } | null
}

const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}%`)

function moveLabel(m: ReviewMove): string {
  const n = Math.ceil(m.ply / 2)
  return `${n}${m.record.color === 'w' ? '.' : '...'} ${m.record.san}`
}

function MoveRow({ m, onGoto, extra }: { m: ReviewMove; onGoto: (ply: number) => void; extra?: string }) {
  const { t } = useI18n()
  const own = m.record.color
  return <li>
    <button className="link-btn" onClick={() => onGoto(m.ply)}>{moveLabel(m)}</button>
    <span className={`badge cls-${m.cls}`}><MoveMark cls={m.cls} className="tiny-mark" /> {CLASS_LABEL[m.cls]}</span>
    <span className="muted-s">{colorName(own)}: {formatScore(forColor(m.before, own))} → {formatScore(forColor(m.after, own))}{m.bestSan && !m.playedIsBest ? t('analysis.report.better', { san: m.bestSan }) : ''}{extra ? `, ${extra}` : ''}</span>
  </li>
}

function Graph({ values, onGoto }: { values: (number | null)[]; onGoto: (ply: number) => void }) {
  const { t } = useI18n()
  const W = 300, H = 70
  const n = values.length
  if (n < 2) return null
  const x = (i: number) => (i / (n - 1)) * W
  const y = (v: number) => H - (v / 100) * H
  const pts = values.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ')
  return <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('analysis.report.graphAria')} preserveAspectRatio="none">
    <rect x="0" y="0" width={W} height={H} className="graph-bg" />
    <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="graph-mid" />
    <polyline points={pts} fill="none" className="graph-line" />
    {values.map((v, i) => v === null ? null :
      <circle key={i} cx={x(i)} cy={y(v)} r={3.5} className="graph-dot" onClick={() => onGoto(i)}><title>{t('analysis.report.dot', { i, v: v.toFixed(0) })}</title></circle>)}
  </svg>
}

/** Итоговый отчёт по партии. Все числа берутся из сохранённых оценок движка. */
export default function ReviewReport({ report, names, onGoto, onTrain, userColor, trainerSummary }: Props) {
  const { t, tn } = useI18n()
  const sides: Color[] = ['w', 'b']
  const critical = report.moves.filter(m => isCritical(m.cls)).length
  return <section className="panel review-panel" data-testid="review-report">
    <div className="panel-head"><div><div className="eyebrow">{t('analysis.report.eyebrow')}</div><h2>{t('analysis.report.title')}</h2></div><span className="pill">{tn('analysis.report.moves', report.moves.length)}</span></div>

    <div className="acc-grid">
      {sides.map(c => <div key={c} className="acc-card" data-side={c}>
        <small>{names[c]}</small>
        <strong data-testid={`accuracy-${c}`}>{pct(report.accuracy[c])}</strong>
        <span className="muted-s">{t('analysis.report.accuracy')}</span>

      </div>)}
    </div>

    <div className="sub-head">{t('analysis.report.classes')}</div>
    <table className="class-table" data-testid="class-table"><tbody>
      {CLASS_ORDER.map(c => <tr key={c} className={`row-${c} ${report.counts.w[c] + report.counts.b[c] === 0 ? 'zero' : ''}`}>
        <td className="cn-w" data-testid={`cnt-w-${c}`}>{report.counts.w[c]}</td>
        <td className="cn-label"><MoveMark cls={c} /> {CLASS_LABEL[c]}</td>
        <td className="cn-b" data-testid={`cnt-b-${c}`}>{report.counts.b[c]}</td>
      </tr>)}
    </tbody></table>

    <div className="sub-head">{t('analysis.report.graph')}</div>
    <Graph values={report.graph} onGoto={onGoto} />

    {report.phases.length > 0 && <>
      <div className="sub-head">{t('analysis.report.phases')}</div>
      <table className="phase-table"><tbody>
        {report.phases.map(p => <tr key={p.phase}><td>{t(`analysis.report.${p.phase}`)}</td><td>{names.w}: {pct(p.white)}</td><td>{names.b}: {pct(p.black)}</td></tr>)}
      </tbody></table>
    </>}

    {report.keyMoments.length > 0 && <>
      <div className="sub-head">{t('analysis.report.key')}</div>
      <ul className="moment-list">{report.keyMoments.map(m => <MoveRow key={m.ply} m={m} onGoto={onGoto} />)}</ul>
    </>}
    {report.swings.length > 0 && <>
      <div className="sub-head">{t('analysis.report.swings')}</div>
      <ul className="moment-list">{report.swings.map(m => <MoveRow key={m.ply} m={m} onGoto={onGoto}
        extra={t('analysis.report.winChances', { a: whiteWinPercent(m.before).toFixed(0), b: whiteWinPercent(m.after).toFixed(0) })} />)}</ul>
    </>}
    {report.worstDecisions.length > 0 && <>
      <div className="sub-head">{t('analysis.report.worst')}</div>
      <ul className="moment-list">{report.worstDecisions.map(m => <MoveRow key={m.ply} m={m} onGoto={onGoto} extra={`−${m.loss.toFixed(0)} ${t('analysis.pp')}`} />)}</ul>
    </>}
    {report.bestDecisions.length > 0 && <>
      <div className="sub-head">{t('analysis.report.best')}</div>
      <ul className="moment-list">{report.bestDecisions.map(m => <MoveRow key={m.ply} m={m} onGoto={onGoto}
        extra={m.gapToSecond !== null ? t('analysis.report.secondWorse', { n: m.gapToSecond.toFixed(0) }) : undefined} />)}</ul>
    </>}

    <div className="train-box">
      <div><b>{t('analysis.report.trainTitle')}</b>
        <p className="muted-s">{critical === 0 ? t('analysis.report.noMistakes') : t('analysis.report.trainCount', { n: critical })}
          {trainerSummary && trainerSummary.total > 0 ? ` ${t('analysis.report.trainSolved', { solved: trainerSummary.solved, total: trainerSummary.total })}` : ''}</p></div>
      {critical > 0 && <div className="board-actions">
        {userColor && <button className="btn primary" onClick={() => onTrain(userColor)}>{t('analysis.report.myMistakes')}</button>}
        <button className={`btn ${userColor ? '' : 'primary'}`} onClick={() => onTrain('both')}>{t('analysis.report.allMistakes')}</button>
      </div>}
    </div>

    <details className="method"><summary>{t('analysis.report.how')}</summary>
      <p className="tiny">{t('analysis.report.methodText')}</p>
    </details>
  </section>
}
