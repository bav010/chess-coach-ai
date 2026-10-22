import { fmtDate as fmtD, useI18n } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import { LineChart, StackedBars, WdlBar } from '../components/Charts'
import type { GameStat } from '../lib/gameStats'
import { loadPuzzleStats } from '../lib/puzzleStats'
import LearningStats from '../components/LearningStats'
import { loadOpenings } from '../lib/openingsStore'
import { DEFAULT_FILTERS, MIN_REVIEWED, applyFilters, movingAverage, ratingSeries, recommend, summarize, type Filters } from '../lib/statsCalc'
import Icon from '../components/Icon'

type Go = 'tactics' | 'openings' | 'analysis' | 'play'
type Props = { active: boolean; games: GameStat[]; onGo: (m: Go) => void }

const fmtDate = (iso: string) => fmtD(Date.parse(iso), { day: '2-digit', month: '2-digit' })
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)

/** Личная панель прогресса: партии, внутренний рейтинг, точность, ошибки, задачи, дебюты, эндшпили, рекомендации, резервная копия. */
export default function StatsView({ active, games, onGo }: Props) {
  const { t, tn, lang } = useI18n()
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS)
  const [tick, setTick] = useState(0)
  const [sec, setSec] = useState<'overview' | 'mistakes' | 'learning' | 'advice'>('overview')
  // задачи и дебюты живут в своих хранилищах — перечитываем при открытии вкладки
  const puzzles = useMemo(() => loadPuzzleStats(), [active, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const openings = useMemo(() => loadOpenings(), [active, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (active) setTick(t => t + 1) }, [active])

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF(x => ({ ...x, [k]: v }))
  const filtered = useMemo(() => applyFilters(games, f), [games, f])
  const sum = useMemo(() => summarize(filtered), [filtered])
  const rating = useMemo(() => ratingSeries(games), [games])
  const shownRating = useMemo(() => { const keys = new Set(filtered.map(g => g.key)); return rating.filter(r => keys.has(r.key)) }, [rating, filtered])
  const reviewedGames = filtered.filter(g => g.review)
  const rec = useMemo(() => recommend(filtered, puzzles), [filtered, puzzles, lang])
  const cur = rating.length ? Math.round(rating[rating.length - 1].rating) : null

  const accSeries = reviewedGames.map(g => ({ y: g.review!.acc ?? 0, label: `${fmtDate(g.at)}${g.opp ? `, ${t('stats.chart.vsBot', { opp: g.opp })}` : ''}` })).filter(p => p.y > 0)
  const ma = movingAverage(accSeries.map(p => p.y))

  const none = games.length === 0
  return <div className="st-page" data-testid="stats-view">
    <section className="panel">
      <div className="panel-head"><div><div className="eyebrow">{t('stats.eyebrow.progress')}</div><h2>{t('stats.title')}</h2></div></div>
      <div className="st-filters" data-testid="stats-filters">
        <label>{t('stats.filters.period')}<select value={f.period} onChange={e => set('period', e.target.value as Filters['period'])} data-testid="f-period">
          {(['all', '7', '30', '90', '365'] as const).map(v => <option key={v} value={v}>{t(`stats.filters.period.${v}`)}</option>)}</select></label>
        <label>{t('stats.filters.color')}<select value={f.color} onChange={e => set('color', e.target.value as Filters['color'])} data-testid="f-color">
          <option value="all">{t('stats.filters.any')}</option><option value="w">{t('stats.filters.white')}</option><option value="b">{t('stats.filters.black')}</option></select></label>
        <label>{t('stats.filters.result')}<select value={f.result} onChange={e => set('result', e.target.value as Filters['result'])} data-testid="f-result">
          <option value="all">{t('stats.filters.any')}</option><option value="win">{t('stats.filters.win')}</option><option value="draw">{t('stats.filters.draw')}</option><option value="loss">{t('stats.filters.loss')}</option></select></label>
        <label>{t('stats.filters.mode')}<select value={f.mode} onChange={e => set('mode', e.target.value as Filters['mode'])} data-testid="f-mode">
          {(['all', 'bot', 'botClock', 'botNoClock', 'analysis'] as const).map(v => <option key={v} value={v}>{t(`stats.filters.mode.${v}`)}</option>)}</select></label>
        <button className="btn quiet" onClick={() => setF(DEFAULT_FILTERS)} data-testid="f-reset"><Icon name="refresh" size={16} />{t('stats.filters.reset')}</button>
      </div>
      {none && <div className="empty-state"><span>♟</span><p>{t('stats.empty.title')}</p><small>{t('stats.empty.text')}</small></div>}
      {!none && filtered.length === 0 && <p className="tiny" data-testid="stats-nomatch">{t('stats.nomatch')}</p>}
    </section>

    <div className="tabs st-tabs" role="tablist" aria-label={t('stats.sec.aria')}>
      {([['overview', 'stats', 'stats.sec.overview'], ['mistakes', 'analysis', 'stats.sec.mistakes'], ['learning', 'tactics', 'stats.sec.learning'], ['advice', 'hint', 'stats.sec.advice']] as const).map(([id, ic, label]) =>
        <button key={id} role="tab" className={`tab ${sec === id ? 'active' : ''}`} aria-selected={sec === id} onClick={() => setSec(id)} data-testid={`stab-${id}`}><Icon name={ic} size={16} /><span>{t(label)}</span></button>)}
    </div>

    {!none && <div hidden={sec !== 'overview'} className="st-sec">
      <section className="st-kpis" data-testid="stats-kpis">
        <div className="st-kpi"><small>{t('stats.kpi.games')}</small><strong data-testid="kpi-games">{sum.total}</strong><em>{t('stats.kpi.finished', { n: sum.finished })}</em></div>
        <div className="st-kpi"><small>{t('stats.kpi.wdl')}</small><strong data-testid="kpi-wdl">{sum.wdl.w} / {sum.wdl.d} / {sum.wdl.l}</strong><em>{t('stats.kpi.score', { pct: pct(sum.scorePct) })}</em></div>
        <div className="st-kpi" title={t('stats.kpi.ratingTip')}><small>{t('stats.kpi.rating')}</small><strong data-testid="kpi-rating">{cur ?? '—'}</strong><em>{rating.length ? t('stats.kpi.ratingOver', { n: rating.length }) : t('stats.kpi.ratingNeed')}</em></div>
        <div className="st-kpi" title={t('stats.kpi.accTip')}><small>{t('stats.kpi.acc')}</small><strong data-testid="kpi-acc">{pct(sum.acc)}</strong><em>{sum.reviewed ? t('stats.kpi.accFrom', { n: sum.reviewed }) : t('stats.kpi.accNeed')}</em></div>
        <div className="st-kpi"><small>{t('stats.kpi.err')}</small><strong data-testid="kpi-err">{sum.per100 ? sum.per100.all : '—'}</strong><em>{sum.per100 ? t('stats.kpi.errBlunders', { n: sum.per100.blunder }) : t('stats.kpi.errNeed')}</em></div>
      </section>
      <p className="tiny st-note">{t('stats.note')}</p>

      <div className="st-grid">
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">{t('stats.rating.eyebrow')}</div><h2>{t('stats.rating.title')}</h2></div></div>
          <LineChart label={t('stats.rating.chart')} series={[{ name: t('stats.rating.series'), color: '#d3ff72', pts: shownRating.map(r => ({ y: r.rating, label: `${fmtDate(r.at)}, ${t('stats.chart.vsBot', { opp: r.opp })}, ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)}` })) }]} />
        </section>
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">{t('stats.acc.eyebrow')}</div><h2>{t('stats.acc.title')}</h2></div></div>
          <LineChart label={t('stats.acc.title')} unit="%" yMin={0} yMax={100} series={[{ name: t('stats.acc.series'), color: '#6cb8ff', pts: accSeries }, { name: t('stats.acc.avg'), color: '#d3ff72', dashed: true, pts: ma.map(y => ({ y, label: '' })) }]} />
          <p className="tiny">{t('stats.acc.only', { n: sum.reviewed, total: sum.decided || sum.total })}</p>
        </section>
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">{t('stats.wdl.eyebrow')}</div><h2>{t('stats.wdl.title')}</h2></div></div>
          <WdlBar {...sum.wdl} />
          {f.mode === 'analysis' && <p className="tiny">{t('stats.wdl.analysisNote')}</p>}
        </section>
      </div>
    </div>}

    {!none && <div hidden={sec !== 'mistakes'} className="st-sec">
      <div className="st-grid">
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">{t('stats.errors.eyebrow')}</div><h2>{t('stats.errors.title')}</h2></div></div>
          <StackedBars label={t('stats.errors.chart')} bars={reviewedGames.map(g => ({ label: `${fmtDate(g.at)}`, parts: [
            { name: t('stats.errors.inaccuracies'), color: '#e0a44f', v: g.review!.counts.inaccuracy ?? 0 }, { name: t('stats.errors.mistakes'), color: '#ff9a52', v: (g.review!.counts.mistake ?? 0) + (g.review!.counts.miss ?? 0) }, { name: t('stats.errors.blunders'), color: '#ff5c5c', v: g.review!.counts.blunder ?? 0 }] }))} />
          {sum.per100 && <p className="tiny" data-testid="err-text">{t('stats.errors.per100', { inaccuracy: sum.per100.inaccuracy, mistake: sum.per100.mistake, miss: sum.per100.miss, blunder: sum.per100.blunder, total: sum.errors.inaccuracy + sum.errors.mistake + sum.errors.miss + sum.errors.blunder })}</p>}
        </section>
      </div>

      <div className="st-grid">
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">{t('stats.phases.eyebrow')}</div><h2>{t('stats.phases.title')}</h2></div></div>
          <table className="st-table"><thead><tr><th>{t('stats.phases.phase')}</th><th>{t('stats.phases.moves')}</th><th>{t('stats.phases.acc')}</th><th>{t('stats.phases.bad')}</th></tr></thead><tbody>
            {(['opening', 'middlegame', 'endgame'] as const).map(p => <tr key={p}><td>{t(`stats.phase.${p}`)}</td><td>{sum.phases[p].n}</td><td>{pct(sum.phases[p].acc)}</td><td>{sum.phases[p].bad}</td></tr>)}
          </tbody></table>
        </section>
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">{t('stats.endgame.eyebrow')}</div><h2>{t('stats.endgame.title')}</h2></div></div>
          {sum.endgame.games === 0 ? <p className="tiny">{t('stats.endgame.none')}</p> : <>
            <p className="st-big" data-testid="endgame-score">{t('stats.endgame.score', { pct: pct(sum.endgame.scorePct) })} <small>{t('stats.endgame.scoreIn', { n: sum.endgame.games })}</small></p>
            <WdlBar {...sum.endgame.wdl} />
            <p className="tiny">{t('stats.endgame.acc', { pct: pct(sum.endgame.acc) })}{sum.endgame.strong.n > 0 && t('stats.endgame.strong', { n: sum.endgame.strong.n, won: sum.endgame.strong.won })}</p></>}
        </section>
      </div>

    </div>}

    <div hidden={sec !== 'learning'} className="st-sec"><LearningStats puzzles={puzzles} openings={openings} onGo={onGo} /></div>

    <section className="panel" data-testid="recs" hidden={sec !== 'advice'}>
        <div className="panel-head"><div><div className="eyebrow">{t('stats.recs.eyebrow')}</div><h2>{t('stats.recs.title')}</h2></div></div>
        {rec.needMore > 0 && <p className="st-info" data-testid="recs-more">{t('stats.recs.needMore', { reviewed: rec.reviewed, min: MIN_REVIEWED, more: tn('stats.recs.more', rec.needMore) })}</p>}
        {rec.recs.length === 0 && rec.needMore === 0 && <p className="st-info" data-testid="recs-none">{t('stats.recs.none', { reviewed: rec.reviewed })}</p>}
        <div className="st-recs">{rec.recs.map(r => <article key={r.id} className="st-rec" data-testid={`rec-${r.id}`}>
          <b>{r.title}</b><p>{r.text}</p>
          <small className="st-basis">{t('stats.recs.basis', { basis: r.basis })}</small>
          <button className="btn" onClick={() => onGo(r.action.go)}>{r.action.label}<Icon name="arrowRight" size={16} /></button>
        </article>)}</div>
      </section>

  </div>
}
