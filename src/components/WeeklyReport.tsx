// Недельный отчёт и цель недели (вкладка «Неделя» в статистике).
import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { fmtDate, fmtNum, useI18n, type Key } from '../i18n'
import { DEFAULT_GOAL, GOAL_MAX, loadActivity, setGoal, type WeeklyGoal } from '../lib/activity'
import type { GameStat } from '../lib/gameStats'
import { hrefFor } from '../lib/route'
import { focusOf, goalDone, goalProgress, weekReport, type Focus } from '../lib/weekly'

const FOCUS_LINK: Record<Focus, ReturnType<typeof hrefFor> | null> = {
  start: hrefFor('play'), puzzles: hrefFor('tactics'), play: hrefFor('play'), review: hrefFor('analysis'), openings: hrefFor('openings'), keep: null,
}

export function GoalBars({ games, compact = false }: { games: readonly GameStat[]; compact?: boolean }) {
  const { t } = useI18n()
  const [tick, setTick] = useState(0)
  useEffect(() => { setTick(x => x + 1) }, [games])
  const act = useMemo(() => loadActivity(), [games, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const goal = act.goal ?? DEFAULT_GOAL
  const cur = useMemo(() => weekReport(games, act, new Date()), [games, act])
  const p = goalProgress(cur, goal)
  const rows: [string, Key, number, number, number][] = [
    ['games', 'week.goal.games', cur.games.n, goal.games, p.games], ['puzzles', 'week.goal.puzzles', cur.puzzles.tried, goal.puzzles, p.puzzles], ['days', 'week.goal.days', cur.activeDays, goal.days, p.days],
  ]
  return <div className={`goal-bars ${compact ? 'compact' : ''}`} data-testid="goal-bars" data-done={goalDone(p)}>
    {rows.map(([id, label, v, g, f]) => <div key={id} className="goal-row" data-testid={`goal-${id}`}>
      <span>{t(label)}</span><b>{Math.min(v, 9999)} / {g}</b>
      <div className="goal-track" role="progressbar" aria-valuenow={Math.round(f * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t(label)}><i style={{ width: `${f * 100}%` }} /></div>
    </div>)}
  </div>
}

export default function WeeklyReport({ games, active }: { games: readonly GameStat[]; active: boolean }) {
  const { t, lang } = useI18n()
  const [back, setBack] = useState<0 | 1>(0)
  const [tick, setTick] = useState(0)
  useEffect(() => { if (active) setTick(x => x + 1) }, [active])
  const act = useMemo(() => loadActivity(), [tick, games]) // eslint-disable-line react-hooks/exhaustive-deps
  const goal = act.goal ?? DEFAULT_GOAL
  const now = useMemo(() => new Date(), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = useMemo(() => weekReport(games, act, now, back), [games, act, now, back])
  const prev = useMemo(() => weekReport(games, act, now, back + 1), [games, act, now, back])
  const focus = focusOf(cur, prev, goal)
  const p = goalProgress(cur, goal)
  const day = (k: string) => new Date(`${k}T12:00:00`)
  const wd = (k: string) => new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(day(k))
  const range = `${fmtDate(day(cur.start).getTime(), { day: '2-digit', month: '2-digit' })} – ${fmtDate(day(cur.end).getTime(), { day: '2-digit', month: '2-digit' })}`
  const delta = (a: number | null, b: number | null, unit = '') => (a === null || b === null ? null : `${a - b > 0 ? '+' : a - b < 0 ? '−' : '±'}${fmtNum(Math.abs(Math.round((a - b) * 10) / 10))}${unit}`)
  const dGames = delta(cur.games.n, prev.games.n), dPuz = delta(cur.puzzles.tried, prev.puzzles.tried), dAcc = delta(cur.acc, prev.acc, ' ' + t('week.pts'))
  const empty = cur.activeDays === 0 && cur.games.n === 0

  function change(k: keyof WeeklyGoal, dir: 1 | -1) {
    const step = k === 'puzzles' ? 5 : 1
    const next = { ...goal, [k]: Math.max(1, Math.min(GOAL_MAX[k], goal[k] + dir * step)) }
    setGoal(next); setTick(x => x + 1)
  }

  return <div className="st-sec" data-testid="weekly">
    <section className="panel">
      <div className="panel-head"><div><div className="eyebrow">{t('week.eyebrow')}</div><h2>{t('week.title')} <small data-testid="week-range">{range}</small></h2></div>
        <div className="chips" role="group" aria-label={t('week.pick')}>
          <button className={`chip ${back === 0 ? 'active' : ''}`} aria-pressed={back === 0} onClick={() => setBack(0)} data-testid="week-this">{t('week.this')}</button>
          <button className={`chip ${back === 1 ? 'active' : ''}`} aria-pressed={back === 1} onClick={() => setBack(1)} data-testid="week-prev">{t('week.prev')}</button>
        </div></div>
      <div className="week-days" role="img" aria-label={t('week.days.aria', { n: cur.activeDays })} data-testid="week-days">
        {cur.days.map(d => <div key={d.key} className={`week-day ${d.active ? 'on' : ''}`} title={`${d.key}: ${t('week.day.puzzles', { n: d.puzzles })}`}><i />{wd(d.key)}</div>)}
      </div>
      {empty && <p className="muted" data-testid="week-empty">{t('week.empty')}</p>}
    </section>

    <section className="st-kpis" data-testid="week-kpis">
      <div className="st-kpi"><small>{t('week.kpi.games')}</small><strong data-testid="wk-games">{cur.games.n}</strong><em>{cur.games.w} / {cur.games.d} / {cur.games.l}{dGames ? ` · ${t('week.vsPrev', { d: dGames })}` : ''}</em></div>
      <div className="st-kpi"><small>{t('week.kpi.acc')}</small><strong data-testid="wk-acc">{cur.acc === null ? '—' : `${Math.round(cur.acc)}%`}</strong><em>{cur.reviewed ? `${t('week.kpi.reviewed', { n: cur.reviewed })}${dAcc ? ` · ${t('week.vsPrev', { d: dAcc })}` : ''}` : t('week.kpi.noReview')}</em></div>
      <div className="st-kpi"><small>{t('week.kpi.puzzles')}</small><strong data-testid="wk-puzzles">{cur.puzzles.solved} / {cur.puzzles.tried}</strong><em>{dPuz ? t('week.vsPrev', { d: dPuz }) : ''}</em></div>
      <div className="st-kpi"><small>{t('week.kpi.openings')}</small><strong>{cur.openings}</strong></div>
      <div className="st-kpi"><small>{t('week.kpi.mistakes')}</small><strong>{cur.mistakes}</strong></div>
    </section>

    <div className="st-grid">
      <section className="panel" data-testid="week-goal">
        <div className="panel-head"><div><h2>{t('week.goal.title')}</h2></div>{back === 0 && goalDone(p) && <span className="pill good" data-testid="goal-reached">{t('week.goal.done')}</span>}</div>
        <GoalBars games={games} />
        <h3 className="online-sub">{t('week.goal.edit')}</h3>
        <div className="goal-edit">
          {(['games', 'puzzles', 'days'] as const).map(k => <div key={k} className="goal-step"><span>{t(`week.goal.${k}` as Key)}</span>
            <button className="btn icon-only" onClick={() => change(k, -1)} aria-label={t('week.goal.less')} data-testid={`goal-minus-${k}`}>−</button>
            <b data-testid={`goal-val-${k}`}>{goal[k]}</b>
            <button className="btn icon-only" onClick={() => change(k, 1)} aria-label={t('week.goal.more')} data-testid={`goal-plus-${k}`}>+</button></div>)}
        </div>
        {back === 1 && <p className="tiny">{t('week.goal.note')}</p>}
      </section>
      <section className="panel" data-testid="week-focus" data-focus={focus}>
        <div className="panel-head"><div><h2>{t('week.focus.title')}</h2></div></div>
        <p>{t(`week.focus.${focus}` as Key)}</p>
        <p className="tiny">{t(`week.focus.why.${focus}` as Key)}</p>
        {FOCUS_LINK[focus] && <a className="btn primary" href={FOCUS_LINK[focus]!} data-testid="week-focus-go"><Icon name="arrowRight" size={16} />{t(`week.focus.go.${focus}` as Key)}</a>}
      </section>
    </div>
    <p className="tiny st-note">{t('week.note')}</p>
  </div>
}
