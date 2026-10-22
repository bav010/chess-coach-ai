import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import Board from '../components/Board'
import Icon, { type IconName } from '../components/Icon'
import { dailyPuzzle } from '../lib/dailyPuzzle'
import { dayKey, loadActivity, streakOf } from '../lib/activity'
import type { CloudApi } from '../hooks/useCloud'
import type { GameStat } from '../lib/gameStats'
import type { LastMode } from '../lib/lastMode'
import type { Profile } from '../lib/profile'
import { LEVEL_LABEL, mainTheme } from '../lib/puzzles'
import { THEME_LABEL } from '../lib/puzzleThemes'
import { hrefFor, type RouteName } from '../lib/route'
import { ratingSeries, summarize } from '../lib/statsCalc'
import type { SavedSession } from '../storage'
import { fmtNum, tn, useI18n, type Key } from '../i18n'
import '../styles/home.css'

export type HomeProps = {
  games: GameStat[]; cloud: CloudApi; me: Profile; shownName: string; last: LastMode | null
  sessions?: SavedSession[]; onOpenSession?: (s: SavedSession) => void
}

const OVERVIEW_KEY = 'chess-coach-ai:overview:v1'

const CARDS: { route: RouteName; icon: IconName; title: Key; desc: Key }[] = [
  { route: 'analysis', icon: 'analysis', title: 'app.mode.analysis', desc: 'home.card.analysis.desc' },
  { route: 'play', icon: 'play', title: 'app.mode.play', desc: 'home.card.play.desc' },
  { route: 'tactics', icon: 'tactics', title: 'app.mode.tactics', desc: 'home.card.tactics.desc' },
  { route: 'openings', icon: 'openings', title: 'app.mode.openings', desc: 'home.card.openings.desc' },
  { route: 'stats', icon: 'stats', title: 'nav.stats', desc: 'home.card.stats.desc' },
]

/** Серия дней подряд с любой активностью: партии, задачи, уроки, дебюты, анализ (не рвётся, если сегодня ещё не занимались, но занимались вчера). */
export function dayStreak(games: readonly GameStat[], extraDays: Iterable<string> = [], now = new Date()): number {
  const days = new Set<string>(extraDays)
  for (const g of games) { const d = new Date(g.at); if (!Number.isNaN(d.getTime())) days.add(dayKey(d)) }
  return streakOf(days, now)
}

function readSeen(): boolean { try { return localStorage.getItem(OVERVIEW_KEY) === 'seen' } catch { return false } }
function writeSeen() { try { localStorage.setItem(OVERVIEW_KEY, 'seen') } catch { /* хранилище недоступно */ } }

/** Главная: приветствие, «Продолжить», краткая статистика, карточки режимов, задача дня, обзор и быстрые ссылки. */
export default function HomeView({ games, cloud, me, last, sessions = [], onOpenSession }: HomeProps) {
  const { t, lang } = useI18n()
  const [overviewOpen, setOverviewOpen] = useState(() => !readSeen())
  useEffect(() => { writeSeen() }, [])

  const sum = useMemo(() => summarize(games), [games])
  const rating = useMemo(() => ratingSeries(games), [games])
  const curRating = rating.length ? Math.round(rating[rating.length - 1].rating) : null
  const activity = useMemo(() => loadActivity(), [])
  const streak = useMemo(() => dayStreak(games, activity.days), [games, activity])

  const puzzle = useMemo(() => dailyPuzzle(), [])
  const today = activity.daily[dayKey()]
  const solved = !!puzzle && !!today && today.id === puzzle.id && today.ok
  const tried = !!puzzle && !!today && today.id === puzzle.id && !today.ok
  const chess = useMemo(() => (puzzle ? new Chess(puzzle.fen) : null), [puzzle])
  const side = chess?.turn() ?? 'w'

  const statsShown = cloud.status === 'off' || (cloud.status === 'in' && me.ready)
  const dash = '—'
  const pct = (v: number | null) => (v === null ? dash : `${Math.round(v)}%`)
  const last0 = sessions[0]

  return <div className="home" data-testid="home-view" data-lang={lang}>
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-text">
        <h1 id="home-title">{t('app.hero.line1')}<br /><em>{t('app.hero.line2')}</em></h1>
        <p>{t('app.hero.sub')}</p>
        {last
          ? <a className="home-cta" href={hrefFor(last.name, last.arg)} data-testid="home-continue">
              <Icon name="play2" size={18} /><span><b>{t('home.continue', { mode: t(`app.mode.${last.name}`) })}</b><small>{t('home.continue.hint')}</small></span><Icon name="arrowRight" size={18} />
            </a>
          : <a className="home-cta" href={hrefFor('play')} data-testid="home-continue">
              <Icon name="play2" size={18} /><span><b>{t('home.start')}</b><small>{t('home.start.hint')}</small></span><Icon name="arrowRight" size={18} />
            </a>}
      </div>
      <div className="home-badge"><Icon name="board" size={26} /><div><b>{t('app.hero.badge')}</b><small>{t('app.hero.badgeSub')}</small></div></div>
    </section>

    {cloud.status !== 'loading' && <section className="home-stats" aria-label={t('home.stats.aria')} data-testid="home-stats">
      {statsShown && <>
        <div className="home-stat" title={t('home.stats.ratingTip')}><small>{t('home.stats.rating')}</small><strong data-testid="home-stat-rating">{curRating ?? dash}</strong></div>
        <div className="home-stat" title={t('home.stats.accTip')}><small>{t('home.stats.accuracy')}</small><strong>{pct(sum.acc)}</strong></div>
        <div className="home-stat"><small>{t('home.stats.games')}</small><strong>{fmtNum(games.length)}</strong></div>
        <div className="home-stat"><Icon name="flame" size={14} className="home-flame" /><small>{t('home.stats.streak')}</small><strong>{streak ? tn('home.stats.streakVal', streak) : dash}</strong></div>
        <a className="home-more" href={hrefFor('stats')} data-testid="home-stats-details">{games.length === 0 ? t('home.stats.empty') : t('home.stats.details')}<Icon name="next" size={14} /></a>
      </>}
      {cloud.status === 'out' && <a className="home-note" href={hrefFor('stats')} data-testid="home-invite"><Icon name="user" size={16} /><span>{t('home.invite')}</span><b>{t('app.signin')}</b></a>}
      {cloud.status === 'in' && !me.ready && <a className="home-note" href={hrefFor('stats')} data-testid="home-setup"><Icon name="user" size={16} /><span>{t('home.setup')}</span><b>{t('home.setup.link')}</b></a>}
    </section>}

    <nav className="home-cards" aria-label={t('home.modes.aria')}>
      {CARDS.map(c => <a key={c.route} className="home-card" href={hrefFor(c.route)} data-testid={`home-card-${c.route}`}>
        <span className="home-card-icon"><Icon name={c.icon} size={26} /></span>
        <b>{t(c.title)}</b>
        <span className="home-card-desc">{t(c.desc)}</span>
        <Icon name="arrowRight" size={16} className="home-card-go" />
      </a>)}
    </nav>

    <div className="home-lower">
      {puzzle && chess && <section className="home-daily panel" aria-labelledby="home-daily-h" data-testid="home-daily">
        <div className="home-daily-board" aria-label={t('home.daily.board')}>
          <Board chess={chess} orientation={side} selected={null} legal={[]} onSquareClick={() => undefined} readOnly />
        </div>
        <div className="home-daily-info">
          <div className="eyebrow">{t('home.daily.eyebrow')}</div>
          <h2 id="home-daily-h">{t('home.daily.title')}</h2>
          <p className="home-daily-side"><i className={`home-dot ${side === 'w' ? 'w' : 'b'}`} />{t(side === 'w' ? 'home.daily.white' : 'home.daily.black')}</p>
          <dl className="home-daily-meta">
            <div><dt>{t('home.daily.theme')}</dt><dd>{THEME_LABEL[mainTheme(puzzle)]}</dd></div>
            <div><dt>{t('home.daily.level')}</dt><dd>{LEVEL_LABEL[puzzle.level]}</dd></div>
          </dl>
          {solved && <p className="home-solved" data-testid="home-daily-solved"><Icon name="check" size={16} />{t('home.daily.solvedNote')}</p>}
          {tried && <p className="tiny" data-testid="home-daily-tried">{t('home.daily.triedNote')}</p>}
          <a className={`btn ${solved ? '' : 'primary'}`} href={hrefFor('tactics', puzzle.id)} data-testid="home-daily-solve"><Icon name="tactics" size={16} />{solved ? t('home.daily.solved') : t('home.daily.solve')}</a>
        </div>
      </section>}

      <div className="home-side">
        <section className="home-overview panel" data-testid="home-overview">
          <details open={overviewOpen} onToggle={e => setOverviewOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary><Icon name="help" size={16} />{t('home.overview.title')}</summary>
            <ol className="home-steps">
              {([['play', 's1'], ['analysis', 's2'], ['tactics', 's3']] as [IconName, 's1' | 's2' | 's3'][]).map(([ic, k], i) => <li key={k}>
                <span className="home-step-n"><Icon name={ic} size={18} /></span>
                <div><b>{i + 1}. {t(`home.overview.${k}.title`)}</b><small>{t(`home.overview.${k}.text`)}</small></div>
              </li>)}
            </ol>
          </details>
        </section>
        <nav className="home-quick" aria-label={t('home.quick.aria')}>
          {last0 && onOpenSession && <button type="button" className="btn" onClick={() => onOpenSession(last0)} data-testid="home-quick-review"><Icon name="analysis" size={16} />{t('home.quick.review')}</button>}
          <a className="btn" href={hrefFor('openings')} data-testid="home-quick-openings"><Icon name="openings" size={16} />{t('home.quick.openings')}</a>
        </nav>
      </div>
    </div>
  </div>
}
