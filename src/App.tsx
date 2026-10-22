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
import Icon, { type IconName } from './components/Icon'
import Drawer from './components/Drawer'
import ModeBar from './components/ModeBar'
import HomeView from './views/HomeView'
import CommandPalette from './components/CommandPalette'
import SettingsView from './views/SettingsView'
import HelpView from './views/HelpView'
import { MODES, hrefFor, navigate, useRoute, type ModeName, type RouteName } from './lib/route'
import { saveLast, loadLast } from './lib/lastMode'
import { errorText } from './i18n/errors'
import { loadProfiles, type ProfileStore } from './lib/profile'
import { useCloud, useServerStatus } from './hooks/useCloud'
import { markGamesReset } from './lib/sync'
import { attachReview, backfillReviews, deriveGame, loadGames, saveGames, syncFromSessions, upsertGame, type GameReview, type GameStat } from './lib/gameStats'

type EngineState = 'loading' | 'ready' | 'error'

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
  const route = useRoute()
  const [menuOpen, setMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const [profiles, setProfiles] = useState<ProfileStore>(() => loadProfiles())
  const me = profiles.list.find(p => p.id === profiles.current) ?? profiles.list[0]
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
  useEffect(() => { if (needSetup) navigate('stats') }, [needSetup])
  // последний открытый режим — для кнопки «Продолжить» на главной
  useEffect(() => { if ((MODES as readonly string[]).includes(route.name)) saveLast({ name: route.name as ModeName, arg: route.arg, at: Date.now() }) }, [route.name, route.arg])
  useEffect(() => { setMenuOpen(false); window.scrollTo?.(0, 0) }, [route.name])
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
    navigate('analysis')
  }

  /** Сохранённая партия — в режим анализа одним кликом (с запуском разбора). */
  function openSession(s: SavedSession) {
    try {
      const p = parsePgn(s.pgn)
      // партии из режима «Игра с ботом» подписаны «You» (раньше — «Вы») — по этому восстанавливаем, за кого играл пользователь
      const userColor = isYou(p.white) ? 'w' : isYou(p.black) ? 'b' : null
      setSeed({ startFen: p.startFen, ucis: p.ucis, userColor, autoReview: true, nonce: Date.now() })
      navigate('analysis')
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

  const onAccountRoute = route.name === 'stats' || route.name === 'profile' || route.name === 'account'
  const accountTab = route.name === 'profile' ? 'profile' : route.name === 'account' ? 'account' : 'stats'
  const TITLES: Partial<Record<RouteName, { icon: IconName; title: string }>> = {
    analysis: { icon: 'analysis', title: t('app.mode.analysis') }, play: { icon: 'play', title: t('app.mode.play') },
    tactics: { icon: 'tactics', title: t('app.mode.tactics') }, openings: { icon: 'openings', title: t('app.mode.openings') },
    stats: { icon: 'stats', title: t('nav.stats') }, profile: { icon: 'user', title: t('nav.profile') }, account: { icon: 'cloud', title: t('nav.account') },
    settings: { icon: 'settings', title: t('nav.settings') }, help: { icon: 'help', title: t('nav.help') },
  }
  const bar = TITLES[route.name]
  const accountGo = () => navigate(cloud.status === 'out' || cloud.status === 'loading' ? 'stats' : 'stats')

  return <main className="app-shell">
    <a className="skip-link" href="#main">{t('nav.skip')}</a>
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={() => setMenuOpen(o => !o)} aria-label={t('nav.menu')} title={t('nav.menu')} aria-expanded={menuOpen} data-testid="menu-btn"><Icon name="menu" size={22} /></button>
      <a className="brand" href={hrefFor('home')} aria-label={t('nav.logo')} title={t('nav.logo')} data-testid="logo">
        <div className="brand-mark">♞</div>
        <div><div className="brand-name">CHESS COACH <span>AI</span></div><div className="brand-sub">{t('app.brandSub')}</div></div>
      </a>
      <button className="icon-btn cmdk-btn" onClick={() => setPaletteOpen(true)} aria-label={t('palette.openTip')} title={t('palette.openTip')} data-testid="cmdk-btn"><Icon name="search" size={20} /></button>
      <div className="top-status" title={engineStatus} role="status" data-testid="top-status" data-state={cloudConfigured ? server : engineState}><i className={statusDot} />{statusText}</div>
      {signedOut || authPending
        ? <button className="signin-btn" disabled={authPending} onClick={accountGo}
            title={authPending ? t('app.signin.checking') : t('app.signin.title')} data-testid="signin-btn"><Icon name="user" size={16} /><span>{authPending ? '…' : t('app.signin')}</span></button>
        : <button className={`avatar-btn ${onAccountRoute ? 'active' : ''} ${cloud.status === 'in' ? 'cloud-on' : ''}`} onClick={() => navigate('profile')}
            aria-label={t('app.account.aria', { name: shownName })} title={t('app.account.title')} data-testid="account-btn">
            <Avatar profile={me} size={34} /><span className="avatar-name">{shownName}</span>
          </button>}
    </header>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    <Drawer open={menuOpen} onClose={closeMenu} current={route.name} />

    {cloud.news && <div className="sync-banner" role="status" data-testid="sync-news"><span>{t('app.sync.newer')}</span>
      <button className="btn" disabled={cloud.busy} onClick={() => void cloud.applyNews()} data-testid="sync-news-apply">{cloud.busy ? t('app.sync.refreshing') : t('app.sync.refresh')}</button></div>}

    <div id="main" className="page" tabIndex={-1}>
    {bar && <ModeBar icon={bar.icon} title={bar.title} />}

    {route.name === 'home' && <HomeView games={games} cloud={cloud} me={me} shownName={shownName} last={loadLast()} sessions={sessions} onOpenSession={openSession} />}

    {/* Режимы остаются смонтированными: партия с ботом и её часы не теряются при уходе на другую страницу */}
    <div hidden={route.name !== 'analysis'}>
      <AnalysisView key={seed?.nonce ?? 0} seed={seed} prefs={prefs} onPrefs={updatePrefs} sessions={sessions}
        onSaveSession={saveSession} onReviewDone={reviewDone} onDownload={downloadPgn} onOpenSession={openSession} onResetProgress={resetProgress}
        engineState={engineState} engineLabel={engineLabel} active={route.name === 'analysis'} />
    </div>
    <div hidden={route.name !== 'play'}>
      <PlayView prefs={prefs} onPrefs={updatePrefs} sessions={sessions} onSaveSession={saveSession}
        onDownload={downloadPgn} onOpenSession={openSession} onResetProgress={resetProgress} onReview={reviewGame} engineError={engineState === 'error'} />
    </div>
    <div hidden={route.name !== 'tactics'}>
      <PuzzleView active={route.name === 'tactics'} puzzleId={route.name === 'tactics' ? route.arg : null} />
    </div>
    <div hidden={route.name !== 'openings'}>
      <OpeningsView active={route.name === 'openings'} />
    </div>
    <div hidden={!onAccountRoute}>
      <AccountView active={onAccountRoute} tab={accountTab} games={games} profiles={profiles} cloud={cloud} onProfiles={setProfiles}
        onGo={m => navigate(m)} onResetGames={() => { markGamesReset(); saveGames([]); setGames([]) }} />
    </div>
    {route.name === 'settings' && <SettingsView prefs={prefs} onPrefs={updatePrefs} />}
    {route.name === 'help' && <HelpView />}
    </div>
    <footer><span>CHESS COACH AI <i>•</i> MVP 0.1.3</span></footer>
  </main>
}
