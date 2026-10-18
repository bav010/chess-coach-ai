import { useCallback, useEffect, useState } from 'react'
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
import { loadProfiles, type ProfileStore } from './lib/profile'
import { useCloud } from './hooks/useCloud'
import { markGamesReset } from './lib/sync'
import { attachReview, backfillReviews, deriveGame, loadGames, saveGames, syncFromSessions, upsertGame, type GameReview, type GameStat } from './lib/gameStats'

type EngineState = 'loading' | 'ready' | 'error'
type Mode = 'analysis' | 'play' | 'tactics' | 'openings' | 'account'

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
  const cloud = useCloud(games)
  // привязка профиля к облачному аккаунту меняет список профилей — обновляем шапку и страницу аккаунта
  useEffect(() => { setProfiles(loadProfiles()) }, [cloud.status, cloud.user?.id])
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
    if (window.confirm('Удалить все сохранённые сессии в этом браузере?')) setSessions(clearSessions())
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
      // партии из режима «Игра с ботом» подписаны «Вы» — по этому восстанавливаем, за кого играл пользователь
      const userColor = p.white === 'Вы' ? 'w' : p.black === 'Вы' ? 'b' : null
      setSeed({ startFen: p.startFen, ucis: p.ucis, userColor, autoReview: true, nonce: Date.now() })
      setMode('analysis')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось открыть партию')
    }
  }

  const engineLabel = engineState === 'ready' ? 'Stockfish готов'
    : engineState === 'loading' ? 'Stockfish загружается…' : 'Stockfish не загрузился'

  const engineStatus = engineState === 'ready' ? 'Сервис онлайн'
    : engineState === 'loading' ? 'Сервис загружается…' : 'Сервис не загрузился'

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark">♞</div>
      <div><div className="brand-name">CHESS COACH <span>AI</span></div><div className="brand-sub">ТВОЙ ПЕРСОНАЛЬНЫЙ ШАХМАТНЫЙ ТРЕНЕР</div></div>
      <div className="top-status" title={engineStatus}><i className={engineState === 'ready' ? 'dot online' : 'dot'} />{""}</div>
      <button className={`avatar-btn ${mode === 'account' ? 'active' : ''} ${cloud.status === 'in' ? 'cloud-on' : ''}`} onClick={() => (mode === 'account' ? setMode(lastMode) : setMode('account'))}
        aria-label={`Аккаунт: ${me.name}`} title="Аккаунт, статистика и настройки" data-testid="account-btn">
        <Avatar profile={me} size={34} /><span className="avatar-name">{me.name}</span>
      </button>
    </header>

    <section className="hero">
      <div><h1>Играй. Думай.<br/><em>Становись сильнее.</em></h1>
        <p>Каждый ход — возможность научиться чему-то новому.</p></div>
        <div className="hero-badge"><span>♟</span><div><b>ТРЕНИРУЙ РАЗУМ</b><small>Превращай ошибки в мастерство.</small></div></div>
    </section>

    <nav className="mode-tabs" role="tablist" aria-label="Режим">
      <button role="tab" aria-selected={mode === 'analysis'} className={`mode-tab ${mode === 'analysis' ? 'active' : ''}`} onClick={() => go('analysis')} data-testid="mode-analysis">Анализ</button>
      <button role="tab" aria-selected={mode === 'play'} className={`mode-tab ${mode === 'play' ? 'active' : ''}`} onClick={() => go('play')} data-testid="mode-play">Игра с ботом</button>
      <button role="tab" aria-selected={mode === 'tactics'} className={`mode-tab ${mode === 'tactics' ? 'active' : ''}`} onClick={() => go('tactics')} data-testid="mode-tactics">Задачи</button>
      <button role="tab" aria-selected={mode === 'openings'} className={`mode-tab ${mode === 'openings' ? 'active' : ''}`} onClick={() => go('openings')} data-testid="mode-openings">Дебюты</button>
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
    <footer><span>CHESS COACH AI <i>•</i> v0.4.1-beta</span></footer>
  </main>
}
