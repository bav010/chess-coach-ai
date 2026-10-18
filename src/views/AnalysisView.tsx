import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import { analysisEngine } from '../engine'
import AnalysisPanel from '../components/AnalysisPanel'
import AnalysisSettings from '../components/AnalysisSettings'
import Board, { type ArrowSpec } from '../components/Board'
import EvalBar from '../components/EvalBar'
import MoveList from '../components/MoveList'
import PgnImport from '../components/PgnImport'
import PositionEditor from '../components/PositionEditor'
import PromoPicker from '../components/PromoPicker'
import ProgressPanel from '../components/ProgressPanel'
import ReviewSection from '../components/ReviewSection'
import Trainer from '../components/Trainer'
import { usePositionAnalysis } from '../hooks/useAnalysis'
import { isTerminalFen } from '../lib/analysisCache'
import { hasIcon, isCritical, type MoveClass } from '../lib/classify'
import { finalScore, type Score } from '../lib/eval'
import { START_FEN, chessAtPly, replay, statusOf } from '../lib/game'
import { toPgn, type ParsedPgn } from '../lib/pgn'
import type { Prefs } from '../lib/prefs'
import {
  assessMove, buildReport, positionScore, runReview,
  type PositionEval, type ReviewMove,
} from '../lib/review'
import { summarizeReview, type GameReview } from '../lib/gameStats'
import { gameKey, loadReview, saveReview, type SavedSession, type TrainerEntry } from '../storage'

export type GameSeed = {
  startFen: string
  ucis: string[]
  userColor: Color | null
  /** Сразу запустить разбор партии. */
  autoReview?: boolean
  nonce: number
}

type Props = {
  seed: GameSeed | null
  prefs: Prefs
  onPrefs: (patch: Partial<Prefs>) => void
  sessions: SavedSession[]
  onSaveSession: (s: Pick<SavedSession, 'result' | 'plies' | 'pgn'>) => void
  /** Разбор партии завершён — итог попадает в личную статистику. */
  onReviewDone?: (key: string, review: GameReview) => void
  onDownload: (s: SavedSession) => void
  onOpenSession: (s: SavedSession) => void
  onResetProgress: () => void
  engineState: 'loading' | 'ready' | 'error'
  engineLabel: string
  /** Вкладка «Анализ» сейчас видна (иначе анализ и клавиши отключены). */
  active: boolean
}

type Tab = 'analysis' | 'review'

type ReviewState = { evals: PositionEval[]; running: boolean; done: number; total: number }

const NAMES: Record<Color, string> = { w: 'Белые', b: 'Чёрные' }

export default function AnalysisView({ seed, prefs, onPrefs, sessions, onSaveSession, onReviewDone, onDownload, onOpenSession, onResetProgress, engineState, engineLabel, active }: Props) {
  const [startFen, setStartFen] = useState(seed?.startFen ?? START_FEN)
  const [ucis, setUcis] = useState<string[]>(seed?.ucis ?? [])
  const [viewPly, setViewPly] = useState(seed?.ucis.length ?? 0)
  const [userColor, setUserColor] = useState<Color | null>(seed?.userColor ?? null)
  const [orientation, setOrientation] = useState<Color>(seed?.userColor ?? 'w')
  const [selected, setSelected] = useState<Square | null>(null)
  const [legal, setLegal] = useState<Square[]>([])
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [message, setMessage] = useState(seed ? 'Партия загружена. Листайте ходы или запустите разбор.' : 'Выбери белую фигуру, затем клетку для хода.')
  const [showSettings, setShowSettings] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [tab, setTab] = useState<Tab>('analysis')
  const [trainerOn, setTrainerOn] = useState(false)
  const [trainerSide, setTrainerSide] = useState<Color | 'both'>('both')
  const [review, setReview] = useState<ReviewState | null>(null)
  const [trainerProgress, setTrainerProgress] = useState<Record<string, TrainerEntry>>({})
  const reviewAbort = useRef<AbortController | null>(null)

  const rep = useMemo(() => replay(startFen, ucis), [startFen, ucis])
  const records = rep.records
  const chess = useMemo(() => chessAtPly(startFen, ucis, viewPly), [startFen, ucis, viewPly])
  const fen = chess.fen()
  const status = useMemo(() => statusOf(chess), [chess])
  const gKey = useMemo(() => gameKey(startFen, ucis), [startFen, ucis])
  const fens = useMemo(() => [startFen, ...records.map(r => r.fenAfter)], [startFen, records])
  const reviewRunning = !!review?.running

  // ---------- анализ текущей позиции ----------
  const analysisOn = prefs.showPanel || prefs.showBar || prefs.showArrows
  const toAnalyse = useMemo(() => {
    if (status.over) return []
    const list = [fen]
    if (viewPly > 0) list.push(records[viewPly - 1].fenBefore)
    if (viewPly > 1) list.push(records[viewPly - 2].fenBefore)
    if (viewPly < records.length) list.push(records[viewPly].fenAfter)
    return list
  }, [fen, status.over, viewPly, records])
  const an = usePositionAnalysis({ fens: toAnalyse, enabled: active && analysisOn && !reviewRunning && !trainerOn, multipv: prefs.multipv })
  const entry = status.over ? undefined : an.get(fen)

  const score: Score | null = status.over ? finalScore(status.result) : entry ? positionScore(fen, { depth: entry.depth, lines: entry.lines }) : null

  const arrows: ArrowSpec[] = useMemo(() => {
    if (!prefs.showArrows || !entry || status.over) return []
    const legalMoves = new Set(chess.moves({ verbose: true }).map(m => `${m.from}${m.to}`))
    const out: ArrowSpec[] = []
    entry.lines.slice(0, prefs.arrowCount).forEach((l, i) => {
      const uci = l.pv[0]
      if (uci && legalMoves.has(uci.slice(0, 4))) out.push({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, rank: i })
    })
    return out
  }, [prefs.showArrows, prefs.arrowCount, entry, status.over, chess])

  // Оценка последнего хода «вживую» по уже посчитанным позициям (до и после)
  const live: ReviewMove | null = (() => {
    if (viewPly === 0) return null
    const rec = records[viewPly - 1]
    const ev = (fenX: string) => { const e = an.get(fenX); return e ? { depth: e.depth, lines: e.lines } : null }
    const beforeEval = ev(rec.fenBefore)
    const afterEval = status.over ? null : ev(rec.fenAfter)
    if (!beforeEval || (!afterEval && !status.over)) return null
    // предыдущий ход соперника — нужен, чтобы отличить «упущенный шанс» от обычной ошибки
    let prevLoss: number | null = null
    if (viewPly > 1) {
      const pe = ev(records[viewPly - 2].fenBefore)
      if (pe) prevLoss = assessMove(records[viewPly - 2], viewPly - 2, pe, beforeEval, prefs.thresholds)?.loss ?? null
    }
    return assessMove(rec, viewPly - 1, beforeEval, afterEval, prefs.thresholds,
      { prevRecord: viewPly > 1 ? records[viewPly - 2] : null, prevLoss })
  })()

  // ---------- разбор партии ----------
  const reviewComplete = !!review && !review.running && review.evals.length === fens.length &&
    review.evals.every((e, i) => e !== null || isTerminalFen(fens[i]))
  const report = useMemo(
    () => (reviewComplete && review ? buildReport(startFen, records, review.evals, prefs.thresholds) : null),
    [reviewComplete, review, startFen, records, prefs.thresholds],
  )

  const startReview = useCallback(async () => {
    reviewAbort.current?.abort()
    const ac = new AbortController()
    reviewAbort.current = ac
    const initial = review?.evals ?? []
    setReview({ evals: initial, running: true, done: 0, total: fens.length })
    setTab('review')
    try {
      const evals = await runReview(analysisEngine, startFen, records, prefs.reviewQuality,
        (done, total, evs) => { if (!ac.signal.aborted) setReview({ evals: evs.slice(), running: true, done, total }) },
        ac.signal, initial)
      if (ac.signal.aborted) return
      setReview({ evals, running: false, done: fens.length, total: fens.length })
      const complete = evals.every((e, i) => e !== null || isTerminalFen(fens[i]))
      if (complete) {
        saveReview({
          key: gKey, created_at: new Date().toISOString(), startFen, ucis, userColor, evals,
          trainer: loadReview(gKey)?.trainer ?? {},
        })
        const sum = summarizeReview(startFen, ucis, evals, userColor)
        if (sum) onReviewDone?.(gKey, sum)
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        setReview(r => (r ? { ...r, running: false } : r))
        setMessage(e instanceof Error ? e.message : 'Ошибка разбора партии')
      }
    }
  }, [review, fens, startFen, records, prefs.reviewQuality, gKey, ucis, userColor, onReviewDone])

  function cancelReview() {
    reviewAbort.current?.abort()
    setReview(r => (r ? { ...r, running: false } : r))
  }

  // Сменилась партия: останавливаем разбор и поднимаем сохранённый разбор (если есть)
  const startReviewRef = useRef(startReview)
  startReviewRef.current = startReview
  const autoStarted = useRef(false)
  useEffect(() => {
    reviewAbort.current?.abort()
    setTrainerOn(false)
    const stored = loadReview(gKey)
    if (stored && stored.evals.length === fens.length) {
      setReview({ evals: stored.evals, running: false, done: fens.length, total: fens.length })
      setTrainerProgress(stored.trainer ?? {})
    } else {
      setReview(null)
      setTrainerProgress({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gKey])

  useEffect(() => {
    if (seed?.autoReview && !autoStarted.current && records.length > 0) {
      autoStarted.current = true
      const stored = loadReview(gKey)
      if (!(stored && stored.evals.length === fens.length)) void startReviewRef.current()
      else setTab('review')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => reviewAbort.current?.abort(), [])

  function onTrainerProgress(p: Record<string, TrainerEntry>) {
    setTrainerProgress(p)
    if (review && reviewComplete) {
      saveReview({ key: gKey, created_at: new Date().toISOString(), startFen, ucis, userColor, evals: review.evals, trainer: p })
    }
  }

  // ---------- ходы и навигация ----------
  function describe(next: Chess) {
    return next.isCheckmate() ? 'Мат! Отличная работа.'
      : next.isDraw() ? 'Ничья.'
      : next.isCheck() ? 'Шах! Проверь безопасность короля.'
      : 'Ход принят. Жду следующий ход.'
  }

  function clearSelection() { setSelected(null); setLegal([]); setPromo(null) }

  function applyMove(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') {
    try {
      const next = new Chess(fen)
      next.move({ from, to, promotion })
      const uci = `${from}${to}${promotion ?? ''}`
      const truncated = viewPly < ucis.length
      const list = [...ucis.slice(0, viewPly), uci]
      setUcis(list); setViewPly(list.length)
      clearSelection()
      setMessage(describe(next) + (truncated ? ' (продолжение партии с этой позиции)' : ''))
    } catch { clearSelection() }
  }

  function chooseSquare(square: Square) {
    if (status.over || promo) return
    const piece = chess.get(square)
    if (selected && legal.includes(square)) {
      const mover = chess.get(selected)
      const lastRank = square[1] === '8' || square[1] === '1'
      if (mover?.type === 'p' && lastRank) {
        setPromo({ from: selected, to: square })
        setMessage('Выбери фигуру для превращения пешки.')
      } else {
        applyMove(selected, square)
      }
      return
    }
    if (piece && piece.color === chess.turn()) {
      setSelected(square)
      setLegal(chess.moves({ square, verbose: true }).map(m => m.to))
      setMessage(`Выбрана ${piece.color === 'w' ? 'белая' : 'чёрная'} фигура на ${square}.`)
    } else { clearSelection() }
  }

  function newGame() {
    setStartFen(START_FEN); setUcis([]); setViewPly(0); setUserColor(null); setOrientation('w')
    clearSelection(); setTab('analysis'); setMessage('Новая партия. Белые ходят первыми.')
  }

  function undo() {
    if (ucis.length === 0) return
    const list = ucis.slice(0, ucis.length - 1)
    setUcis(list); setViewPly(Math.min(viewPly, list.length))
    clearSelection(); setMessage('Последний ход отменён.')
  }

  function loadPgn(p: ParsedPgn) {
    setStartFen(p.startFen); setUcis(p.ucis); setViewPly(p.ucis.length); setUserColor(null); setOrientation('w')
    clearSelection(); setShowImport(false); setTab('analysis')
    setMessage(`Партия загружена${p.white || p.black ? `: ${p.white ?? '?'} — ${p.black ?? '?'}` : ''}. Листайте ходы или запустите разбор.`)
  }

  function loadPosition(fen: string) {
    setStartFen(fen); setUcis([]); setViewPly(0); setUserColor(null)
    setOrientation(new Chess(fen).turn())
    clearSelection(); setShowEditor(false); setTab('analysis')
    setMessage('Позиция расставлена. Анализ запущен: можно играть ходы за обе стороны.')
  }

  function saveSession() {
    const full = chessAtPly(startFen, ucis, ucis.length)
    const st = statusOf(full)
    onSaveSession({ result: st.over ? st.result : 'in_progress', plies: ucis.length, pgn: toPgn(startFen, ucis, {}) })
    setMessage('Тренировочная сессия сохранена в этом браузере.')
  }

  const goto = useCallback((ply: number) => {
    setViewPly(Math.max(0, Math.min(ucis.length, ply))); clearSelection()
  }, [ucis.length])

  useEffect(() => {
    if (trainerOn || !active) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goto(viewPly - 1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goto(viewPly + 1) }
      else if (e.key === 'Home') goto(0)
      else if (e.key === 'End') goto(ucis.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goto, viewPly, ucis.length, trainerOn, active])

  const viewMove: ReviewMove | null = report?.moves.find(m => m.ply === viewPly) ?? live
  const marks = useMemo(() => {
    const m = new Map<number, MoveClass>()
    if (!prefs.showMarks) return m
    if (report) report.moves.forEach(x => m.set(x.ply, x.cls))
    else if (live) m.set(live.ply, live.cls)
    return m
  }, [report, live, prefs.showMarks])

  const arrowStyle = { opacity: prefs.arrowOpacity, width: prefs.arrowWidth, numbering: prefs.numbering }
  const lastRec = viewPly > 0 ? records[viewPly - 1] : null
  const trainerSummary = report
    ? { solved: Object.values(trainerProgress).filter(e => e.solved).length, total: report.moves.filter(m => isCritical(m.cls)).length }
    : null
  const names = { w: NAMES.w, b: NAMES.b }

  if (trainerOn && report) {
    return <div className="trainer-wrap">
      <Trainer report={report} userColor={userColor} thresholds={prefs.thresholds} progress={trainerProgress}
        initialSide={trainerSide} arrowStyle={arrowStyle} onProgress={onTrainerProgress} onExit={() => setTrainerOn(false)} />
    </div>
  }

  return <div className="main-grid">
    <section className="panel board-panel">
      <div className="panel-head"><div><div className="eyebrow">АНАЛИЗ</div><h2>Шахматная доска</h2></div><span className="pill">Локальная партия</span></div>

      <div className="toolbar">
        <label className="toggle"><input type="checkbox" checked={prefs.showPanel} onChange={e => onPrefs({ showPanel: e.target.checked })} data-testid="toggle-panel" /> Показывать анализ</label>
        <label className="toggle"><input type="checkbox" checked={prefs.showBar} onChange={e => onPrefs({ showBar: e.target.checked })} data-testid="toggle-bar" /> Шкала оценки</label>
        <label className="toggle"><input type="checkbox" checked={prefs.showArrows} onChange={e => onPrefs({ showArrows: e.target.checked })} data-testid="toggle-arrows" /> Стрелки</label>
        <label className="toggle"><input type="checkbox" checked={prefs.showMarks} onChange={e => onPrefs({ showMarks: e.target.checked })} data-testid="toggle-marks" /> Оценка ходов</label>
        <button className="link-btn" onClick={() => setShowSettings(s => !s)} data-testid="settings-btn">{showSettings ? 'Скрыть настройки' : 'Настройки'}</button>
      </div>
      {showSettings && <AnalysisSettings prefs={prefs} onChange={onPrefs} />}

      <div className="board-row">
        {prefs.showBar && <EvalBar score={score} orientation={orientation} busy={an.busy} />}
        <div className="board-wrap">
          <Board chess={chess} orientation={orientation} selected={selected} legal={legal}
            lastMove={lastRec ? { from: lastRec.from, to: lastRec.to } : null}
            arrows={arrows} arrowStyle={arrowStyle} onSquareClick={chooseSquare}
            mark={prefs.showMarks && viewMove && lastRec && hasIcon(viewMove.cls) ? { square: lastRec.to, cls: viewMove.cls } : null} />
        </div>
      </div>

      {promo && <PromoPicker color={chess.turn()} onPick={p => applyMove(promo.from, promo.to, p)} onCancel={() => { clearSelection() }} />}
      <div className="board-message"><span className="pulse"/> {message}</div>

      <div className="nav-row">
        <button className="btn" onClick={() => goto(0)} disabled={viewPly === 0} aria-label="В начало">⏮</button>
        <button className="btn" onClick={() => goto(viewPly - 1)} disabled={viewPly === 0} aria-label="Назад" data-testid="nav-prev">◀</button>
        <button className="btn" onClick={() => goto(viewPly + 1)} disabled={viewPly >= ucis.length} aria-label="Вперёд" data-testid="nav-next">▶</button>
        <button className="btn" onClick={() => goto(ucis.length)} disabled={viewPly >= ucis.length} aria-label="В конец">⏭</button>
        <button className="btn" onClick={() => setOrientation(o => (o === 'w' ? 'b' : 'w'))} data-testid="flip">⇅ Перевернуть</button>
      </div>

      <div className="board-actions">
        <button className="btn primary" onClick={newGame}>＋ Новая партия</button>
        <button className="btn" onClick={undo} disabled={ucis.length === 0}>↶ Отменить ход</button>
        <button className="btn" onClick={saveSession} disabled={ucis.length === 0}>Сохранить сессию</button>
        <button className="btn" onClick={() => setShowImport(s => !s)} data-testid="import-btn">Загрузить PGN</button>
        <button className={`btn ${showEditor ? 'active' : ''}`} onClick={() => setShowEditor(s => !s)} data-testid="editor-btn">Расставить позицию</button>
      </div>
      {showImport && <PgnImport onLoad={loadPgn} />}
      {showEditor && <PositionEditor initialFen={chess.fen()} onApply={loadPosition} onCancel={() => setShowEditor(false)} />}
    </section>

    <aside className="right-column">
      <div className="tabs" role="tablist">
        <button role="tab" className={`tab ${tab === 'analysis' ? 'active' : ''}`} aria-selected={tab === 'analysis'} onClick={() => setTab('analysis')}>Анализ</button>
        <button role="tab" className={`tab ${tab === 'review' ? 'active' : ''}`} aria-selected={tab === 'review'} onClick={() => setTab('review')} data-testid="tab-review">Разбор партии</button>
      </div>
      {tab === 'analysis' && !prefs.showPanel && <section className="panel"><p className="muted">Панель анализа скрыта. Включите «Показывать анализ» над доской — позиция и результаты сохранены.</p></section>}
      {tab === 'analysis' && prefs.showPanel && <AnalysisPanel fen={fen} turn={chess.turn()} entry={entry} score={score} busy={an.busy} error={an.error}
          engineState={engineState} engineLabel={engineLabel} status={status} live={prefs.showMarks ? viewMove : null} marksOn={prefs.showMarks} analysisOn={analysisOn} />}
      {tab === 'review' && <ReviewSection
        records={records.length} review={review} report={report} reviewComplete={reviewComplete} names={names} userColor={userColor}
        onStart={() => void startReview()} onCancel={cancelReview} onGoto={goto}
        onTrain={s => { setTrainerSide(s); setTrainerOn(true) }} trainerSummary={trainerSummary}
        quality={prefs.reviewQuality} onQuality={q => onPrefs({ reviewQuality: q })} engineError={engineState === 'error'} />}

      <section className="panel moves-panel">
        <div className="panel-head"><div><div className="eyebrow">ХОД ПАРТИИ</div><h2>Нотация</h2></div><span className="move-count">{ucis.length} полуходов</span></div>
        <MoveList records={records} viewPly={viewPly} onSelect={goto} marks={marks} />
      </section>
      <ProgressPanel sessions={sessions} onDownload={onDownload} onOpen={onOpenSession} onReset={onResetProgress} />
    </aside>
  </div>
}

