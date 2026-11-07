// Вкладка «Онлайн» в статистике: итоги партий с друзьями и случайными соперниками (данные аккаунта, хранятся на сервере).
import { useEffect, useMemo, useState } from 'react'
import { WdlBar } from './Charts'
import { useI18n, type Key } from '../i18n'
import type { CloudApi } from '../hooks/useCloud'
import { cloudConfigured } from '../lib/cloud'
import type { OnlineGame } from '../lib/online'
import { listFinished } from '../lib/onlineApi'
import { myRating, type MyRating } from '../lib/onlineApi'
import { summarizeOnline, type Wdl } from '../lib/onlineStats'
import { hrefFor } from '../lib/route'

const rowText = (w: Wdl) => `${w.wins} / ${w.draws} / ${w.losses}`

export default function OnlineStats({ cloud, active }: { cloud: CloudApi; active: boolean }) {
  const { t, tn } = useI18n()
  const uid = cloud.status === 'in' ? cloud.user?.id ?? null : null
  const [games, setGames] = useState<OnlineGame[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [rt, setRt] = useState<MyRating | null>(null)

  useEffect(() => {
    if (!active || !uid) return
    let live = true
    setFailed(false)
    myRating().then(r => { if (live) setRt(r) }).catch(() => { /* без рейтинга */ })
    listFinished(uid).then(r => { if (live) setGames(r) }).catch(() => { if (live) { setFailed(true); setGames(g => g ?? []) } })
    return () => { live = false }
  }, [active, uid])

  const s = useMemo(() => (uid && games ? summarizeOnline(games, uid) : null), [games, uid])

  if (!cloudConfigured) return <section className="panel" data-testid="ostats-off"><p className="muted">{t('online.off.text')}</p></section>
  if (!uid) return <section className="panel" data-testid="ostats-signin"><p className="muted">{t('ostats.signin')}</p><a className="btn primary" href={hrefFor('account')}>{t('app.signin')}</a></section>
  if (!s) return <section className="panel"><p className="muted">{t('online.loading')}</p></section>
  if (s.total.games === 0) return <section className="panel empty-state" data-testid="ostats-empty"><span>♟</span><p>{t('ostats.empty.title')}</p>
    <small>{failed ? t('online.err.network') : t('ostats.empty.text')}</small><a className="btn primary" href={hrefFor('online')}>{t('online.title')}</a></section>

  return <div className="st-sec" data-testid="ostats">
    <section className="st-kpis">
      {rt && <div className="st-kpi"><small>{t('ostats.rating')}</small><strong data-testid="ostats-rating">{rt.rating}</strong><em>{t('ostats.peak', { n: rt.peak })}</em></div>}
      <div className="st-kpi"><small>{t('ostats.games')}</small><strong data-testid="ostats-games">{s.total.games}</strong><em>{s.avgPlies !== null ? t('ostats.avgPlies', { n: s.avgPlies }) : ''}</em></div>
      <div className="st-kpi"><small>{t('stats.kpi.wdl')}</small><strong data-testid="ostats-wdl">{rowText(s.total)}</strong><em>{t('stats.kpi.score', { pct: s.winRate === null ? '—' : `${s.winRate}%` })}</em></div>
      <div className="st-kpi"><small>{t('ostats.streak')}</small><strong>{s.streak ? (s.streak.kind === 'win' ? tn('ostats.streak.win', s.streak.n) : tn('ostats.streak.loss', s.streak.n)) : '—'}</strong></div>
    </section>
    <div className="st-grid">
      <section className="panel"><div className="panel-head"><div><h2>{t('stats.wdl.title')}</h2></div></div>
        <WdlBar w={s.total.wins} d={s.total.draws} l={s.total.losses} />
        <ul className="st-bars online-rows">
          {(['w', 'b'] as const).map(c => <li key={c}><span>{t(c === 'w' ? 'online.color.w' : 'online.color.b')}</span><b>{rowText(s.byColor[c])}</b><small>{tn('ostats.gamesN', s.byColor[c].games)}</small></li>)}
        </ul>
      </section>
      <section className="panel"><div className="panel-head"><div><h2>{t('ostats.form')}</h2></div></div>
        <div className="online-form" data-testid="ostats-form">{s.form.map((o, i) => <span key={i} className={`online-form-dot ${o}`} title={t(`online.res.${o}` as Key)}>{t(`ostats.form.${o}` as Key)}</span>)}</div>
        <h3 className="online-sub">{t('ostats.byTc')}</h3>
        <ul className="st-bars online-rows">{s.byTc.map(x => <li key={x.tc}><span>{x.tc === 'none' ? t('online.time.none') : x.tc}</span><b>{rowText(x.wdl)}</b><small>{tn('ostats.gamesN', x.wdl.games)}</small></li>)}</ul>
      </section>
      <section className="panel"><div className="panel-head"><div><h2>{t('ostats.endings')}</h2></div></div>
        <ul className="st-bars online-rows">{Object.entries(s.endings).sort((a, b) => b[1] - a[1]).map(([r, n]) =>
          <li key={r}><span>{t(`online.reason.${r}` as Key)}</span><b>{n}</b><small /></li>)}</ul>
        {s.opponents.length > 0 && <><h3 className="online-sub">{t('ostats.opponents')}</h3>
          <ul className="st-bars online-rows">{s.opponents.map(o => <li key={o.name}><span>{o.name}</span><b>{rowText(o.wdl)}</b><small>{tn('ostats.gamesN', o.wdl.games)}</small></li>)}</ul></>}
      </section>
    </div>
    <p className="tiny st-note">{t('ostats.note')}</p>
  </div>
}
