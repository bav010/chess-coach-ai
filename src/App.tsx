import { useCallback, useEffect, useMemo, useState } from 'react'
import { analysisEngine } from './engine'
import { usePrefs } from './hooks/usePrefs'
import { addSession, clearSessions, loadSessions, type SavedSession } from './storage'
import { parsePgn } from './lib/pgn'
import AnalysisView, { type GameSeed } from './views/AnalysisView'
import PlayView from './views/PlayView'
import PuzzleView from './views/PuzzleView'
import OpeningsView from './views/OpeningsView'
import AccountView from './views/AccountView'
import Avatar from './components/Avatar'
import LanguageSwitch from './components/LanguageSwitch'
import { cloudConfigured } from './lib/cloud'
import { useI18n } from './i18n'
import { errorText } from './i18n/errors'
import { loadProfiles, type ProfileStore } from './lib/profile'
import { useCloud, useServerStatus } from './hooks/useCloud'
import { markGamesReset } from './lib/sync'
import { attachReview, backfillReviews, deriveGame, loadGames, saveGames, syncFromSessions, upsertGame, type GameReview, type GameStat } from './lib/gameStats'

type EngineState = 'loading' | 'ready' | 'error'
type Mode = 'analysis' | 'play' | 'tactics' | 'openings' | 'account'

const isYou = (n: string | null | undefined) => n === 'You' || n === 'Вы'

function downloadPgn(s: SavedSession) {
  const blob = new Blob([s.pgn], { type: 'application/x-chess-pgn' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `chess-coach-${s.created_at.slice(0, 10)}-${s.id}.pgn`
  link.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('analysis')
  const [lastMode, setLastMode] = useState<Exclude<Mode, 'account'>>('analysis')
  const [profiles, setProfiles] = useState<ProfileStore>(() => loadProfiles())
  const me = profiles.list.find(p => p.id === profiles.current) ?? profiles.list[0]
  function go(m: Mode) { if (m !== 'account') setLastMode(m); setMode(m) }
  const [seed, setSeed] = useState<GameSeed | null>(null)
  const [engineState, setEngineState] = useState<EngineState>('loading')
  const [sessions, setSessions] = useState<SavedSession[]>(() => loadSessions())
  const [prefs, updatePrefs] = usePrefs()
  // Личная статистика: одна запись на партию; при запуске подтягиваем уже сохранённые сессии и разборы (без дублей)
  const [games, setGames] = useState<GameStat[]>(() => {
    const g = backfillReviews(syncFromSessions(loadGames(), loadSessions()))
    saveGames(g)
    return g
  })
  const cloudToken = useMemo(() => [games, me], [games, me])
  const cloud = useCloud(cloudToken)
  const server = useServerStatus()
  const shownName = !me.ready && cloud.user ? cloud.user.email.split('@')[0] : me.name
  // привязка профиля к облачному аккаунту меняет список профилей — обновляем шапку и страницу аккаунта
  useEffect(() => { setProfiles(loadProfiles()) }, [cloud.status, cloud.user?.id])
  // после входа без завершённой настройки (имя и аватарка) сразу открываем настройку аккаунта
  const needSetup = cloud.status === 'in' && !me.ready
  useEffect(() => { if (needSetup) setMode('account') }, [needSetup])
  function changeGames(fn: (g: GameStat[]) => GameStat[]) {
    setGames(cur => { const next = fn(cur); if (next !== cur) saveGames(next); return next })
  }

  // Движок грузится заранее, пока пользователь осматривается (≈2 МБ).
  useEffect(() => {
    analysisEngine.start().then(() => setEngineState('ready')).catch(() => setEngineState('error'))
  }, [])

  function saveSession(s: Pick<SavedSession, 'result' | 'plies' | 'pgn'>) {
    const list = addSession(s)
    setSessions(list)
    const g = deriveGame(list[0])
    if (g) changeGames(cur => upsertGame(cur, g))
  }

  const reviewDone = useCallback((key: string, review: GameReview) => changeGames(cur => attachReview(cur, key, review)), [])

  function resetProgress() {
    if (window.confirm(t('app.confirm.resetSessions'))) setSessions(clearSessions())
  }

  /** Разбор сыгранной партии: переходим в режим анализа с этой партией (исходная остаётся в истории сессий). */
  function reviewGame(game: Omit<GameSeed, 'nonce'>) {
    setSeed({ ...game, nonce: Date.now() })
    setMode('analysis')
  }

  /** Сохранённая партия — в режим анализа одним кликом (с запуском разбора). */
  function openSession(s: SavedSession) {
    try {
      const p = parsePgn(s.pgn)
      // партии из режима «Игра с ботом» подписаны «You» (раньше — «Вы») — по этому восстанавливаем, за кого играл пользователь
      const userColor = isYou(p.white) ? 'w' : isYou(p.black) ? 'b' : null
      setSeed({ startFen: p.startFen, ucis: p.ucis, userColor, autoReview: true, nonce: Date.now() })
      setMode('analysis')
    } catch (e) {
      window.alert(errorText(e, 'app.err.openGame'))
    }
  }

  const engineLabel = engineState === 'ready' ? t('app.engine.ready')
    : engineState === 'loading' ? t('app.engine.loading') : t('app.engine.error')

  // «Сервис онлайн» отражает доступность облачного сервера (Supabase); без облака — готовность движка
  const serverText = server === 'online' ? t('app.status.tip.ok') : server === 'offline' ? t('app.status.tip.fail') : t('app.status.tip.checking')
  const statusText = cloudConfigured
    ? (server === 'online' ? t('app.status.online') : server === 'offline' ? t('app.status.offline') : t('app.status.loading'))
    : (engineState === 'ready' ? t('app.status.online') : engineState === 'loading' ? t('app.status.loading') : t('app.status.error'))
  const statusDot = cloudConfigured ? (server === 'online' ? 'dot online' : server === 'offline' ? 'dot offline' : 'dot') : (engineState === 'ready' ? 'dot online' : 'dot')
  const engineStatus = (cloudConfigured ? `${t('app.status.tip.server', { state: serverText })}\n` : '') + t('app.status.tip.engine', { state: engineLabel })
  const authPending = cloud.status === 'loading'
  const signedOut = cloud.status === 'out'

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark">♞</div>
      <div><div className="brand-name">CHESS COACH <span>AI</span></div><div className="brand-sub">{t('app.brandSub')}</div></div>
      <div className="top-status" title={engineStatus} role="status" data-testid="top-status" data-state={cloudConfigured ? server : engineState}><i className={statusDot} />{statusText}</div>
      <LanguageSwitch compact />
      {signedOut || authPending
        ? <button className={`signin-btn ${mode === 'account' ? 'active' : ''}`} disabled={authPending} onClick={() => (mode === 'account' ? setMode(lastMode) : setMode('account'))}
            title={authPending ? t('app.signin.checking') : t('app.signin.title')} data-testid="signin-btn">{authPending ? '…' : t('app.signin')}</button>
        : <button className={`avatar-btn ${mode === 'account' ? 'active' : ''} ${cloud.status === 'in' ? 'cloud-on' : ''}`} onClick={() => (mode === 'account' ? setMode(lastMode) : setMode('account'))}
            aria-label={t('app.account.aria', { name: shownName })} title={t('app.account.title')} data-testid="account-btn">
            <Avatar profile={me} size={34} /><span className="avatar-name">{shownName}</span>
          </button>}
    </header>

    {cloud.news && <div className="sync-banner" role="status" data-testid="sync-news"><span>{t('app.sync.newer')}</span>
      <button className="btn" disabled={cloud.busy} onClick={() => void cloud.applyNews()} data-testid="sync-news-apply">{cloud.busy ? t('app.sync.refreshing') : t('app.sync.refresh')}</button></div>}

    <section className="hero">
      <div><h1>{t('app.hero.line1')}<br/><em>{t('app.hero.line2')}</em></h1>
        <p>{t('app.hero.sub')}</p></div>
        <div className="hero-badge"><span>♟</span><div><b>{t('app.hero.badge')}</b><small>{t('app.hero.badgeSub')}</small></div></div>
    </section>

    <nav className="mode-tabs" role="tablist" aria-label={t('app.nav.aria')}>
      <button role="tab" aria-selected={mode === 'analysis'} className={`mode-tab ${mode === 'analysis' ? 'active' : ''}`} onClick={() => go('analysis')} data-testid="mode-analysis">{t('app.mode.analysis')}</button>
      <button role="tab" aria-selected={mode === 'play'} className={`mode-tab ${mode === 'play' ? 'active' : ''}`} onClick={() => go('play')} data-testid="mode-play">{t('app.mode.play')}</button>
      <button role="tab" aria-selected={mode === 'tactics'} className={`mode-tab ${mode === 'tactics' ? 'active' : ''}`} onClick={() => go('tactics')} data-testid="mode-tactics">{t('app.mode.tactics')}</button>
      <button role="tab" aria-selected={mode === 'openings'} className={`mode-tab ${mode === 'openings' ? 'active' : ''}`} onClick={() => go('openings')} data-testid="mode-openings">{t('app.mode.openings')}</button>
    </nav>

    {/* Оба режима остаются смонтированными: партия с ботом и её часы не теряются при переключении вкладок */}
    <div hidden={mode !== 'analysis'}>
      <AnalysisView key={seed?.nonce ?? 0} seed={seed} prefs={prefs} onPrefs={updatePrefs} sessions={sessions}
        onSaveSession={saveSession} onReviewDone={reviewDone} onDownload={downloadPgn} onOpenSession={openSession} onResetProgress={resetProgress}
        engineState={engineState} engineLabel={engineLabel} active={mode === 'analysis'} />
    </div>
    <div hidden={mode !== 'play'}>
      <PlayView prefs={prefs} onPrefs={updatePrefs} sessions={sessions} onSaveSession={saveSession}
        onDownload={downloadPgn} onOpenSession={openSession} onResetProgress={resetProgress} onReview={reviewGame} engineError={engineState === 'error'} />
    </div>
    <div hidden={mode !== 'tactics'}>
      <PuzzleView active={mode === 'tactics'} />
    </div>
    <div hidden={mode !== 'openings'}>
      <OpeningsView active={mode === 'openings'} />
    </div>
    <div hidden={mode !== 'account'}>
      <AccountView active={mode === 'account'} games={games} profiles={profiles} cloud={cloud} onProfiles={setProfiles}
        onGo={m => go(m)} onBack={() => setMode(lastMode)} onResetGames={() => { markGamesReset(); saveGames([]); setGames([]) }} />
    </div>
    <footer><span>CHESS COACH AI <i>•</i> v0.4.2-beta</span></footer>
  </main>
}
