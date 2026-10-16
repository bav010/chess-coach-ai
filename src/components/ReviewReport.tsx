import type { Color } from 'chess.js'
import { CLASS_LABEL, CLASS_ORDER, isCritical } from '../lib/classify'
import MoveMark from './MoveMark'
import { forColor, formatScore, whiteWinPercent } from '../lib/eval'
import { colorName } from '../lib/glyphs'
import type { ReviewMove, ReviewReport as Report } from '../lib/review'

type Props = {
  report: Report
  names: Record<Color, string>
  onGoto: (ply: number) => void
  onTrain: (side: Color | 'both') => void
  userColor: Color | null
  trainerSummary: { solved: number; total: number } | null
}

const PHASE_LABEL = { opening: 'Дебют', middlegame: 'Миттельшпиль', endgame: 'Эндшпиль' } as const

const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}%`)

function moveLabel(m: ReviewMove): string {
  const n = Math.ceil(m.ply / 2)
  return `${n}${m.record.color === 'w' ? '.' : '...'} ${m.record.san}`
}

function MoveRow({ m, onGoto, extra }: { m: ReviewMove; onGoto: (ply: number) => void; extra?: string }) {
  const own = m.record.color
  return <li>
    <button className="link-btn" onClick={() => onGoto(m.ply)}>{moveLabel(m)}</button>
    <span className={`badge cls-${m.cls}`}><MoveMark cls={m.cls} className="tiny-mark" /> {CLASS_LABEL[m.cls]}</span>
    <span className="muted-s">{colorName(own)}: {formatScore(forColor(m.before, own))} → {formatScore(forColor(m.after, own))}{m.bestSan && !m.playedIsBest ? `, лучше ${m.bestSan}` : ''}{extra ? `, ${extra}` : ''}</span>
  </li>
}

function Graph({ values, onGoto }: { values: (number | null)[]; onGoto: (ply: number) => void }) {
  const W = 300, H = 70
  const n = values.length
  if (n < 2) return null
  const x = (i: number) => (i / (n - 1)) * W
  const y = (v: number) => H - (v / 100) * H
  const pts = values.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ')
  return <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График шансов белых на победу" preserveAspectRatio="none">
    <rect x="0" y="0" width={W} height={H} className="graph-bg" />
    <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="graph-mid" />
    <polyline points={pts} fill="none" className="graph-line" />
    {values.map((v, i) => v === null ? null :
      <circle key={i} cx={x(i)} cy={y(v)} r={3.5} className="graph-dot" onClick={() => onGoto(i)}><title>{`После хода ${i}: ${v.toFixed(0)}% у белых`}</title></circle>)}
  </svg>
}

/** Итоговый отчёт по партии. Все числа берутся из сохранённых оценок движка. */
export default function ReviewReport({ report, names, onGoto, onTrain, userColor, trainerSummary }: Props) {
  const sides: Color[] = ['w', 'b']
  const critical = report.moves.filter(m => isCritical(m.cls)).length
  return <section className="panel review-panel" data-testid="review-report">
    <div className="panel-head"><div><div className="eyebrow">РАЗБОР ПАРТИИ</div><h2>Итоги</h2></div><span className="pill">{report.moves.length} ходов</span></div>

    <div className="acc-grid">
      {sides.map(c => <div key={c} className="acc-card" data-side={c}>
        <small>{names[c]}</small>
        <strong data-testid={`accuracy-${c}`}>{pct(report.accuracy[c])}</strong>
        <span className="muted-s">точность (оценка)</span>

      </div>)}
    </div>

    <div className="sub-head">Оценки ходов</div>
    <table className="class-table" data-testid="class-table"><tbody>
      {CLASS_ORDER.map(c => <tr key={c} className={`row-${c} ${report.counts.w[c] + report.counts.b[c] === 0 ? 'zero' : ''}`}>
        <td className="cn-w" data-testid={`cnt-w-${c}`}>{report.counts.w[c]}</td>
        <td className="cn-label"><MoveMark cls={c} /> {CLASS_LABEL[c]}</td>
        <td className="cn-b" data-testid={`cnt-b-${c}`}>{report.counts.b[c]}</td>
      </tr>)}
    </tbody></table>

    <div className="sub-head">Шансы белых по ходу партии</div>
    <Graph values={report.graph} onGoto={onGoto} />

    {report.phases.length > 0 && <>
      <div className="sub-head">Стадии партии (точность)</div>
      <table className="phase-table"><tbody>
        {report.phases.map(p => <tr key={p.phase}><td>{PHASE_LABEL[p.phase]}</td><td>{names.w}: {pct(p.white)}</td><td>{names.b}: {pct(p.black)}</td></tr>)}
      </tbody></table>
    </>}

    {report.keyMoments.length > 0 && <>
      <div className="sub-head">Ключевые моменты</div>
      <ul className="moment-list">{report.keyMoments.map(m => <MoveRow key={m.ply} m={m} onGoto={onGoto} />)}</ul>
    </>}
    {report.swings.length > 0 && <>
      <div className="sub-head">Резкие перепады оценки</div>
      <ul className="moment-list">{report.swings.map(m => <MoveRow key={m.ply} m={m} onGoto={onGoto}
        extra={`шансы белых ${whiteWinPercent(m.before).toFixed(0)}% → ${whiteWinPercent(m.after).toFixed(0)}%`} />)}</ul>
    </>}
    {report.worstDecisions.length > 0 && <>
      <div className="sub-head">Худшие решения</div>
      <ul className="moment-list">{report.worstDecisions.map(m => <MoveRow key={m.ply} m={m} onGoto={onGoto} extra={`−${m.loss.toFixed(0)} п. п.`} />)}</ul>
    </>}
    {report.bestDecisions.length > 0 && <>
      <div className="sub-head">Лучшие решения (единственный сильный ход)</div>
      <ul className="moment-list">{report.bestDecisions.map(m => <MoveRow key={m.ply} m={m} onGoto={onGoto}
        extra={m.gapToSecond !== null ? `второй вариант хуже на ${m.gapToSecond.toFixed(0)} п. п.` : undefined} />)}</ul>
    </>}

    <div className="train-box">
      <div><b>Работа над ошибками</b>
        <p className="muted-s">{critical === 0 ? 'Ошибок и грубых ошибок не найдено — тренировать нечего.' : `Позиций для тренировки: ${critical}.`}
          {trainerSummary && trainerSummary.total > 0 ? ` Решено: ${trainerSummary.solved} из ${trainerSummary.total}.` : ''}</p></div>
      {critical > 0 && <div className="board-actions">
        {userColor && <button className="btn primary" onClick={() => onTrain(userColor)}>Мои ошибки</button>}
        <button className={`btn ${userColor ? '' : 'primary'}`} onClick={() => onTrain('both')}>Все ошибки</button>
      </div>}
    </div>

    <details className="method"><summary>Как считается оценка ходов</summary>
      <p className="tiny">Для каждого хода берутся оценки Stockfish до и после него, переводятся в шансы на победу (кривая Lichess),
        потеря = на сколько п. п. они упали у ходившего. Лучший — первая линия движка; отличный — потеря до 2 п. п.; хороший — до 5; неточность от 5, ошибка от 10, зевок от 15 п. п. (пороги меняются в настройках).
        Упущенный шанс — ход с потерей 5+ п. п., когда соперник только что ошибся (или был мат), но позиция не рухнула. Сильный ход — единственный хороший ход (второй вариант движка хуже на 15+ п. п.).
        Блестящий — лучший ход с жертвой материала (минус 2+ после первых четырёх полуходов варианта) в позиции, которая не была уже выигранной, и после которого позиция не хуже равной.
        Дебютный — ход из небольшого встроенного списка дебютных линий (не полная база).
        Точность хода = 103.1668·e^(−0.04354·потеря) − 3.1669, точность стороны — среднее по её ходам. Это приближённая методика,
        а не официальный показатель какого-либо сайта; результат зависит от глубины разбора.</p>
    </details>
  </section>
}
