import { useEffect, useState } from 'react'
import { analysisEngine } from './engine'
import { usePrefs } from './hooks/usePrefs'
import { addSession, clearSessions, loadSessions, type SavedSession } from './storage'
import AnalysisView, { type GameSeed } from './views/AnalysisView'
import PlayView from './views/PlayView'

type EngineState = 'loading' | 'ready' | 'error'
type Mode = 'analysis' | 'play'

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
  const [seed, setSeed] = useState<GameSeed | null>(null)
  const [engineState, setEngineState] = useState<EngineState>('loading')
  const [sessions, setSessions] = useState<SavedSession[]>(() => loadSessions())
  const [prefs, updatePrefs] = usePrefs()

  // Движок грузится заранее, пока пользователь осматривается (≈2 МБ).
  useEffect(() => {
    analysisEngine.start().then(() => setEngineState('ready')).catch(() => setEngineState('error'))
  }, [])

  function saveSession(s: Pick<SavedSession, 'result' | 'plies' | 'pgn'>) {
    setSessions(addSession(s))
  }

  function resetProgress() {
    if (window.confirm('Удалить все сохранённые сессии в этом браузере?')) setSessions(clearSessions())
  }

  /** Разбор сыгранной партии: переходим в режим анализа с этой партией (исходная остаётся в истории сессий). */
  function reviewGame(game: Omit<GameSeed, 'nonce'>) {
    setSeed({ ...game, nonce: Date.now() })
    setMode('analysis')
  }

  const engineLabel = engineState === 'ready' ? 'Stockfish готов'
    : engineState === 'loading' ? 'Stockfish загружается…' : 'Stockfish не загрузился'

  const engineStatus = engineState === 'ready' ? 'Сервис онлайн'
    : engineState === 'loading' ? 'Сервис загружается…' : 'Сервис не загрузился'

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark">♞</div>
      <div><div className="brand-name">CHESS COACH <span>AI</span></div><div className="brand-sub">ТВОЙ ПЕРСОНАЛЬНЫЙ ШАХМАТНЫЙ ТРЕНЕР</div></div>
      <div className="top-status" title={engineStatus}><i className={engineState === 'ready' ? 'dot online' : 'dot'} />{"Сервис онлайн"}</div>
    </header>

    <section className="hero">
      <div><h1>Играй. Думай.<br/><em>Становись сильнее.</em></h1>
        <p>Каждый ход — возможность научиться чему-то новому.</p></div>
        <div className="hero-badge"><span>♟</span><div><b>ТРЕНИРУЙ РАЗУМ</b><small>Превращай ошибки в мастерство.</small></div></div>
    </section>

    <nav className="mode-tabs" role="tablist" aria-label="Режим">
      <button role="tab" aria-selected={mode === 'analysis'} className={`mode-tab ${mode === 'analysis' ? 'active' : ''}`} onClick={() => setMode('analysis')} data-testid="mode-analysis">Анализ</button>
      <button role="tab" aria-selected={mode === 'play'} className={`mode-tab ${mode === 'play' ? 'active' : ''}`} onClick={() => setMode('play')} data-testid="mode-play">Игра с ботом</button>
    </nav>

    {/* Оба режима остаются смонтированными: партия с ботом и её часы не теряются при переключении вкладок */}
    <div hidden={mode !== 'analysis'}>
      <AnalysisView key={seed?.nonce ?? 0} seed={seed} prefs={prefs} onPrefs={updatePrefs} sessions={sessions}
        onSaveSession={saveSession} onDownload={downloadPgn} onResetProgress={resetProgress}
        engineState={engineState} engineLabel={engineLabel} active={mode === 'analysis'} />
    </div>
    <div hidden={mode !== 'play'}>
      <PlayView prefs={prefs} onPrefs={updatePrefs} sessions={sessions} onSaveSession={saveSession}
        onDownload={downloadPgn} onResetProgress={resetProgress} onReview={reviewGame} engineError={engineState === 'error'} />
    </div>
    <footer><span>CHESS COACH AI <i>•</i> MVP 0.2.1</span></footer>
  </main>
}
