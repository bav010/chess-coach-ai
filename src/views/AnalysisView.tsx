import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import { analysisEngine } from '../engine'
import AnalysisPanel from '../components/AnalysisPanel'
import Icon from '../components/Icon'
import { hrefFor } from '../lib/route'
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
import { useBoardKeys } from '../hooks/useBoardKeys'
import { useI18n, type Key, type Params } from '../i18n'
import { errorText } from '../i18n/errors'
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

/** Сообщение под доской хранится как ключи перевода (а не готовый текст), чтобы смена языка обновляла и его. */
type MsgPart = { k: Key; p?: Params } | { err: unknown; fb: Key }
type Msg = MsgPart[]
const m1 = (k: Key, p?: Params): Msg => [{ k, p }]

export default function AnalysisView({ seed, prefs, onPrefs, sessions, onSaveSession, onReviewDone, onDownload, onOpenSession, onResetProgress, engineState, engineLabel, active }: Props) {
  const { t, tn } = useI18n()
  const [startFen, setStartFen] = useState(seed?.startFen ?? START_FEN)
  const [ucis, setUcis] = useState<string[]>(seed?.ucis ?? [])
  const [viewPly, setViewPly] = useState(seed?.ucis.length ?? 0)
  const [userColor, setUserColor] = useState<Color | null>(seed?.userColor ?? null)
  const [orientation, setOrientation] = useState<Color>(seed?.userColor ?? 'w')
  const [selected, setSelected] = useState<Square | null>(null)
  const [legal, setLegal] = useState<Square[]>([])
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [msg, setMessage] = useState<Msg>(m1(seed ? 'analysis.view.msgLoaded' : 'analysis.view.msgSelectWhite'))
  const message = msg.map(x => ('err' in x ? errorText(x.err, x.fb) : t(x.k, x.p))).join(' ')
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
        setMessage([{ err: e, fb: 'analysis.err.review' }])
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
  function describe(next: Chess): MsgPart {
    return { k: next.isCheckmate() ? 'analysis.view.msgMate'
      : next.isDraw() ? 'analysis.view.msgDraw'
      : next.isCheck() ? 'analysis.view.msgCheck'
      : 'analysis.view.msgAccepted' }
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
      setMessage(truncated ? [describe(next), { k: 'analysis.view.msgContinued' }] : [describe(next)])
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
        setMessage(m1('analysis.view.msgPromo'))
      } else {
        applyMove(selected, square)
      }
      return
    }
    if (piece && piece.color === chess.turn()) {
      setSelected(square)
      setLegal(chess.moves({ square, verbose: true }).map(m => m.to))
      setMessage(m1(piece.color === 'w' ? 'analysis.view.msgSelectedW' : 'analysis.view.msgSelectedB', { sq: square }))
    } else { clearSelection() }
  }

  function newGame() {
    setStartFen(START_FEN); setUcis([]); setViewPly(0); setUserColor(null); setOrientation('w')
    clearSelection(); setTab('analysis'); setMessage(m1('analysis.view.msgNew'))
  }

  function undo() {
    if (ucis.length === 0) return
    const list = ucis.slice(0, ucis.length - 1)
    setUcis(list); setViewPly(Math.min(viewPly, list.length))
    clearSelection(); setMessage(m1('analysis.view.msgUndone'))
  }

  function loadPgn(p: ParsedPgn) {
    setStartFen(p.startFen); setUcis(p.ucis); setViewPly(p.ucis.length); setUserColor(null); setOrientation('w')
    clearSelection(); setShowImport(false); setTab('analysis')
    setMessage(p.white || p.black ? m1('analysis.view.msgLoadedPlayers', { white: p.white ?? '?', black: p.black ?? '?' }) : m1('analysis.view.msgLoaded'))
  }

  function loadPosition(fen: string) {
    setStartFen(fen); setUcis([]); setViewPly(0); setUserColor(null)
    setOrientation(new Chess(fen).turn())
    clearSelection(); setShowEditor(false); setTab('analysis')
    setMessage(m1('analysis.view.msgPosition'))
  }

  function saveSession() {
    const full = chessAtPly(startFen, ucis, ucis.length)
    const st = statusOf(full)
    onSaveSession({ result: st.over ? st.result : 'in_progress', plies: ucis.length, pgn: toPgn(startFen, ucis, {}) })
    setMessage(m1('analysis.view.msgSaved'))
  }

  const goto = useCallback((ply: number) => {
    setViewPly(Math.max(0, Math.min(ucis.length, ply))); clearSelection()
  }, [ucis.length])

  useBoardKeys(active && !trainerOn, { prev: () => goto(viewPly - 1), next: () => goto(viewPly + 1), first: () => goto(0), last: () => goto(ucis.length), flip: () => setOrientation(o => (o === 'w' ? 'b' : 'w')) })

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
  const names = { w: t('analysis.side.w'), b: t('analysis.side.b') }

  if (trainerOn && report) {
    return <div className="trainer-wrap">
      <Trainer report={report} userColor={userColor} thresholds={prefs.thresholds} progress={trainerProgress}
        initialSide={trainerSide} arrowStyle={arrowStyle} onProgress={onTrainerProgress} onExit={() => setTrainerOn(false)} />
    </div>
  }

  return <div className="main-grid">
    <section className="panel board-panel">
      <div className="panel-head"><div><div className="eyebrow">{t('analysis.view.eyebrow')}</div><h2>{t('analysis.view.title')}</h2></div><span className="pill">{t('analysis.view.localGame')}</span></div>

      <div className="toolbar">
        <label className="toggle"><input type="checkbox" checked={prefs.showPanel} onChange={e => onPrefs({ showPanel: e.target.checked })} data-testid="toggle-panel" /> {t('analysis.view.showAnalysis')}</label>
        <label className="toggle"><input type="checkbox" checked={prefs.showBar} onChange={e => onPrefs({ showBar: e.target.checked })} data-testid="toggle-bar" /> {t('analysis.view.evalBar')}</label>
        <label className="toggle"><input type="checkbox" checked={prefs.showArrows} onChange={e => onPrefs({ showArrows: e.target.checked })} data-testid="toggle-arrows" /> {t('analysis.view.arrows')}</label>
        <label className="toggle"><input type="checkbox" checked={prefs.showMarks} onChange={e => onPrefs({ showMarks: e.target.checked })} data-testid="toggle-marks" /> {t('analysis.view.moveRatings')}</label>
        <a className="icon-btn toolbar-settings" href={hrefFor('settings')} title={t('analysis.view.settings')} aria-label={t('analysis.view.settings')} data-testid="settings-btn"><Icon name="settings" size={18} /></a>
      </div>

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
        <button className="btn" onClick={() => goto(0)} disabled={viewPly === 0} aria-label={t('analysis.view.toStart')}>⏮</button>
        <button className="btn" onClick={() => goto(viewPly - 1)} disabled={viewPly === 0} aria-label={t('analysis.view.back')} data-testid="nav-prev">◀</button>
        <button className="btn" onClick={() => goto(viewPly + 1)} disabled={viewPly >= ucis.length} aria-label={t('analysis.view.forward')} data-testid="nav-next">▶</button>
        <button className="btn" onClick={() => goto(ucis.length)} disabled={viewPly >= ucis.length} aria-label={t('analysis.view.toEnd')}>⏭</button>
        <button className="btn" onClick={() => setOrientation(o => (o === 'w' ? 'b' : 'w'))} data-testid="flip">{t('analysis.view.flip')}</button>
      </div>

      <div className="board-actions">
        <button className="btn primary" onClick={newGame}>{t('analysis.view.newGame')}</button>
        <button className="btn" onClick={undo} disabled={ucis.length === 0}>{t('analysis.view.undo')}</button>
        <button className="btn" onClick={saveSession} disabled={ucis.length === 0}>{t('analysis.view.saveSession')}</button>
        <button className="btn" onClick={() => setShowImport(s => !s)} data-testid="import-btn">{t('analysis.view.loadPgn')}</button>
        <button className={`btn ${showEditor ? 'active' : ''}`} onClick={() => setShowEditor(s => !s)} data-testid="editor-btn">{t('analysis.view.editor')}</button>
      </div>
      {showImport && <PgnImport onLoad={loadPgn} />}
      {showEditor && <PositionEditor initialFen={chess.fen()} onApply={loadPosition} onCancel={() => setShowEditor(false)} />}
    </section>

    <aside className="right-column">
      <div className="tabs" role="tablist">
        <button role="tab" className={`tab ${tab === 'analysis' ? 'active' : ''}`} aria-selected={tab === 'analysis'} onClick={() => setTab('analysis')}>{t('analysis.view.tabAnalysis')}</button>
        <button role="tab" className={`tab ${tab === 'review' ? 'active' : ''}`} aria-selected={tab === 'review'} onClick={() => setTab('review')} data-testid="tab-review">{t('analysis.view.tabReview')}</button>
      </div>
      {tab === 'analysis' && !prefs.showPanel && <section className="panel"><p className="muted">{t('analysis.view.panelHidden')}</p></section>}
      {tab === 'analysis' && prefs.showPanel && <AnalysisPanel fen={fen} turn={chess.turn()} entry={entry} score={score} busy={an.busy} error={an.error}
          engineState={engineState} engineLabel={engineLabel} status={status} live={prefs.showMarks ? viewMove : null} marksOn={prefs.showMarks} analysisOn={analysisOn} />}
      {tab === 'review' && <ReviewSection
        records={records.length} review={review} report={report} reviewComplete={reviewComplete} names={names} userColor={userColor}
        onStart={() => void startReview()} onCancel={cancelReview} onGoto={goto}
        onTrain={s => { setTrainerSide(s); setTrainerOn(true) }} trainerSummary={trainerSummary}
        quality={prefs.reviewQuality} onQuality={q => onPrefs({ reviewQuality: q })} engineError={engineState === 'error'} />}

      <section className="panel moves-panel">
        <div className="panel-head"><div><div className="eyebrow">{t('analysis.view.movesEyebrow')}</div><h2>{t('analysis.view.notation')}</h2></div><span className="move-count">{tn('analysis.view.plies', ucis.length)}</span></div>
        <MoveList records={records} viewPly={viewPly} onSelect={goto} marks={marks} />
      </section>
      <ProgressPanel sessions={sessions} onDownload={onDownload} onOpen={onOpenSession} onReset={onResetProgress} />
    </aside>
  </div>
}

