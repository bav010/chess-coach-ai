import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { engine, type Analysis } from './engine'
import { addSession, clearSessions, loadSessions, summarize, type SavedSession, type SessionResult } from './storage'

const glyph: Record<string, string> = {
  wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙',
  bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟',
}
type EngineState = 'loading' | 'ready' | 'error'

/** Переводит вариант из UCI (e2e4) в SAN (e4) на копии позиции. */
function pvToSan(fen: string, pvUci: string[]): string[] {
  const walker = new Chess(fen)
  const out: string[] = []
  for (const uci of pvUci.slice(0, 8)) {
    try {
      out.push(walker.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san)
    } catch { break }
  }
  return out
}

function formatAnalysis(fen: string, a: Analysis): string {
  const san = pvToSan(fen, a.pvUci)
  const evaluation = a.mate !== null
    ? (a.mate > 0 ? `Мат в ${a.mate} в пользу стороны, чей ход` : `Мат через ${-a.mate} против стороны, чей ход`)
    : `Оценка для стороны, чей ход: ${((a.cp ?? 0) / 100).toFixed(2)} пешки`
  return `Лучший ход: ${san[0] ?? 'не найден'}\nВариант: ${san.join(' ')}\n${evaluation}\nГлубина: ${a.depth}`
}

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
  const [game, setGame] = useState(() => new Chess())
  const [selected, setSelected] = useState<Square | null>(null)
  const [legal, setLegal] = useState<Square[]>([])
  const [message, setMessage] = useState('Выбери белую фигуру, затем клетку для хода.')
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const analysisFen = useRef('')
  const [engineState, setEngineState] = useState<EngineState>('loading')
  const [analysis, setAnalysis] = useState('')
  const [sessions, setSessions] = useState<SavedSession[]>(() => loadSessions())
  const [busy, setBusy] = useState(false)

  const moves = game.history()
  const stats = summarize(sessions)

  const board = useMemo(() => {
    const rows: (Square[])[] = []
    for (let rank = 8; rank >= 1; rank--) {
      const row: Square[] = []
      for (let file = 0; file < 8; file++) row.push(`${'abcdefgh'[file]}${rank}` as Square)
      rows.push(row)
    }
    return rows
  }, [])

  // Движок грузится заранее, пока пользователь осматривается (≈2 МБ).
  useEffect(() => {
    engine.start().then(() => setEngineState('ready')).catch(() => setEngineState('error'))
  }, [])

  function resetAnalysis() {
    if (analysisFen.current) engine.stop()
    analysisFen.current = ''
    setAnalysis('')
  }

  function describe(next: Chess) {
    return next.isCheckmate() ? 'Мат! Отличная работа.'
      : next.isDraw() ? 'Ничья.'
      : next.isCheck() ? 'Шах! Проверь безопасность короля.'
      : 'Ход принят.'
  }

  function applyMove(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') {
    try {
      const next = new Chess()
      next.loadPgn(game.pgn())
      next.move({ from, to, promotion })
      setGame(next)
      setSelected(null); setLegal([]); setPromo(null)
      resetAnalysis()
      setMessage(describe(next))
    } catch { setSelected(null); setLegal([]); setPromo(null) }
  }

  function chooseSquare(square: Square) {
    if (game.isGameOver() || promo) return
    const piece = game.get(square)
    if (selected && legal.includes(square)) {
      const mover = game.get(selected)
      const lastRank = square[1] === '8' || square[1] === '1'
      if (mover?.type === 'p' && lastRank) {
        setPromo({ from: selected, to: square })
        setMessage('Выбери фигуру для превращения пешки.')
      } else {
        applyMove(selected, square)
      }
      return
    }
    if (piece && piece.color === game.turn()) {
      setSelected(square)
      setLegal(game.moves({ square, verbose: true }).map(m => m.to))
      setMessage(`Выбрана ${piece.color === 'w' ? 'белая' : 'чёрная'} фигура на ${square}.`)
    } else {
      setSelected(null); setLegal([])
    }
  }

  function newGame() {
    setGame(new Chess()); setSelected(null); setLegal([]); setPromo(null)
    resetAnalysis(); setMessage('Новая партия. Белые ходят первыми.')
  }

  function undo() {
    const copy = new Chess()
    copy.loadPgn(game.pgn())
    if (copy.undo()) {
      setGame(copy)
      setSelected(null); setLegal([]); setPromo(null); resetAnalysis()
      setMessage('Последний ход отменён.')
    }
  }

  async function analyzePosition() {
    if (game.isGameOver()) { setAnalysis('Партия окончена — анализировать нечего.'); return }
    const fen = game.fen()
    analysisFen.current = fen
    setBusy(true); setAnalysis('Думаю…')
    try {
      const result = await engine.analyse(fen, {
        depth: 14,
        movetime: 4000,
        onProgress: a => { if (analysisFen.current === fen) setAnalysis(formatAnalysis(fen, a) + '\n(идёт анализ…)') },
      })
      if (analysisFen.current !== fen) return // позиция уже изменилась — результат устарел
      setAnalysis(result.pvUci.length ? formatAnalysis(fen, result) : 'Движок не вернул вариант.')
    } catch (e) {
      if (analysisFen.current === fen) {
        setEngineState('error')
        setAnalysis(e instanceof Error ? e.message : 'Ошибка анализа')
      }
    } finally { setBusy(false) }
  }

  function saveSession() {
    const result: SessionResult = game.isCheckmate() ? (game.turn() === 'w' ? '0-1' : '1-0')
      : game.isDraw() ? '1/2-1/2' : 'in_progress'
    setSessions(addSession({ result, plies: moves.length, pgn: game.pgn() }))
    setMessage('Тренировочная сессия сохранена в этом браузере.')
  }

  function resetProgress() {
    if (window.confirm('Удалить все сохранённые сессии в этом браузере?')) setSessions(clearSessions())
  }

  const engineLabel = engineState === 'ready' ? 'Stockfish готов'
    : engineState === 'loading' ? 'Stockfish загружается…' : 'Stockfish не загрузился'

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark">♞</div>
      <div><div className="brand-name">CHESS COACH <span>AI</span></div><div className="brand-sub">ТВОЙ ПЕРСОНАЛЬНЫЙ ШАХМАТНЫЙ ТРЕНЕР</div></div>
      <div className="top-status"><i className={engineState === 'ready' ? 'dot online' : 'dot'} />{engineLabel}</div>
    </header>

    <section className="hero">
      <div><div className="eyebrow">ТРЕНИРОВОЧНАЯ СТАНЦИЯ / 01</div><h1>Играй. Думай.<br/><em>Становись сильнее.</em></h1>
        <p>Каждый ход — возможность научиться чему-то новому.</p></div>
      <div className="hero-badge"><span>♟</span><div><b>ТВОЙ ПРОГРЕСС</b><small>Хранится только в твоём браузере</small></div></div>
    </section>

    <div className="main-grid">
      <section className="panel board-panel">
        <div className="panel-head"><div><div className="eyebrow">ПРАКТИКА</div><h2>Шахматная доска</h2></div><span className="pill">Локальная партия</span></div>
        <div className="board" role="grid" aria-label="Шахматная доска">
          {board.flatMap((row) => row.map((sq) => {
            const piece = game.get(sq)
            const dark = ((sq.charCodeAt(0) - 97) + Number(sq[1])) % 2 === 1
            const isSelected = selected === sq
            const canMove = legal.includes(sq)
            return <button key={sq} className={`square ${dark ? 'dark' : 'light'} ${isSelected ? 'selected' : ''} ${canMove ? 'can-move' : ''}`}
              onClick={() => chooseSquare(sq)} aria-label={`${sq}${piece ? ` ${piece.color === 'w' ? 'белая' : 'чёрная'} фигура` : ''}`}>
              {piece && <span className={`piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`}>{glyph[piece.color + piece.type]}</span>}
              {canMove && !piece && <span className="move-dot" />}
              {sq[0] === 'a' && <small className="rank-label">{sq[1]}</small>}
              {sq[1] === '1' && <small className="file-label">{sq[0]}</small>}
            </button>
          })) }
        </div>
        {promo && <div className="promo-picker" role="dialog" aria-label="Превращение пешки">
          {(['q', 'r', 'b', 'n'] as const).map(p => <button key={p} className="btn" onClick={() => applyMove(promo.from, promo.to, p)}>
            {glyph[game.turn() + p]} {{ q: 'Ферзь', r: 'Ладья', b: 'Слон', n: 'Конь' }[p]}</button>)}
          <button className="btn" onClick={() => { setPromo(null); setSelected(null); setLegal([]) }}>Отмена</button>
        </div>}
        <div className="board-message"><span className="pulse"/> {message}</div>
        <div className="board-actions">
          <button className="btn primary" onClick={newGame}>＋ Новая партия</button>
          <button className="btn" onClick={undo} disabled={moves.length === 0}>↶ Отменить ход</button>
          <button className="btn" onClick={saveSession} disabled={moves.length === 0}>Сохранить сессию</button>
        </div>
        <div className="hint"><b>Совет тренера</b><span>Перед ходом проверь шахи, взятия и угрозы — сначала свои, затем соперника.</span></div>
      </section>

      <aside className="right-column">
        <section className="panel analysis-panel">
          <div className="panel-head"><div><div className="eyebrow">ПОМОЩНИК</div><h2>Анализ позиции</h2></div><span className={`engine-icon ${engineState === 'ready' ? 'ready' : ''}`}>⌘</span></div>
          <p className="muted">Stockfish работает прямо в твоём браузере: ищет сильные ходы и оценивает позицию.</p>
          <div className="engine-status"><span className={`status-square ${engineState === 'ready' ? 'ready' : ''}`}/><span>{engineLabel}</span></div>
          <button className="btn primary full" onClick={analyzePosition} disabled={busy || engineState === 'error'}>{busy ? 'Анализируем…' : '⌕  Анализировать позицию'}</button>
          {analysis && <pre className="analysis-result">{analysis}</pre>}
          {engineState === 'error' && <p className="tiny">Не удалось загрузить движок. Обнови страницу; нужен современный браузер с поддержкой WebAssembly.</p>}
        </section>

        <section className="panel moves-panel">
          <div className="panel-head"><div><div className="eyebrow">ХОД ПАРТИИ</div><h2>Нотация</h2></div><span className="move-count">{moves.length} полуходов</span></div>
          <div className="move-list">
            {moves.length === 0 ? <div className="empty-state"><span>♘</span><p>Твоя партия начинается здесь.</p><small>Сделай ход на доске</small></div> :
              Array.from({length: Math.ceil(moves.length / 2)}, (_, i) => <div className="move-row" key={i}><span>{i + 1}.</span><b>{moves[i * 2] ?? '…'}</b><b>{moves[i * 2 + 1] ?? ''}</b></div>)}
          </div>
        </section>

        <section className="panel progress-panel">
          <div className="panel-head"><div><div className="eyebrow">ТВОЯ АКАДЕМИЯ</div><h2>Прогресс</h2></div><span className="progress-icon">↗</span></div>
          <div className="stats">
            <div><strong>{stats.sessions}</strong><small>Сессий сохранено</small></div>
            <div><strong>{stats.plies}</strong><small>Полуходов сыграно</small></div>
          </div>
          {sessions.length > 0 && <ul className="session-list">
            {sessions.slice(0, 5).map(s => <li key={s.id}>
              <span>{new Date(s.created_at).toLocaleDateString('ru-RU')}</span>
              <span>{s.result === 'in_progress' ? 'не закончена' : s.result}</span>
              <span>{s.plies} п.</span>
              <button className="link-btn" onClick={() => downloadPgn(s)}>PGN</button>
            </li>)}
          </ul>}
          <div className="progress-note">Данные хранятся в localStorage этого браузера и не отправляются никуда.
            {sessions.length > 0 && <> <button className="link-btn" onClick={resetProgress}>Сбросить</button></>}</div>
        </section>
      </aside>
    </div>
    <footer><span>CHESS COACH AI <i>•</i> MVP 0.1.1</span><span>Сначала понимание. Потом рейтинг.</span></footer>
  </main>
}
