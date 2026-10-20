import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import { puzzleEngine } from '../engine'
import Board from '../components/Board'
import PromoPicker from '../components/PromoPicker'
import PUZZLES from '../data/puzzles.json'
import {
  ANY_FILTER, LEVEL_LABEL, MATE_FILTER_LABEL, MAX_HINT, hintFor, judgeMove, mainTheme, matches, pickNext, puzzleWhy, solutionSan,
  type Evaluate, type Hint, type Level, type MateFilter, type Puzzle, type PuzzleFilter,
} from '../lib/puzzles'
import { THEME_LABEL, THEME_ORDER } from '../lib/puzzleThemes'
import {
  formatDuration, loadPuzzleStats, recordOutcome, resetPuzzleStats, savePuzzleStats, successPercent, weakThemes,
  type PuzzleStats,
} from '../lib/puzzleStats'
import { splitUci } from '../lib/game'
import { t, tn, useI18n } from '../i18n'

const ALL = PUZZLES as unknown as Puzzle[]

type Status = 'solving' | 'checking' | 'solved' | 'shown'
/** Сообщение хранится функцией: текст строится при показе, поэтому меняет язык вместе с интерфейсом. */
type Msg = { kind: 'info' | 'ok' | 'bad'; text: () => string }
type HintReq = { p: Puzzle; fen: string; level: 1 | 2 | 3; idx: number }

const evaluate: Evaluate = async fen => {
  const a = await puzzleEngine.analyse(fen, { depth: 16, movetime: 1500, multipv: 1 })
  return { cp: a.cp, mate: a.mate, bestMove: a.bestMoveUci }
}

function taskText(p: Puzzle, side: Color): string {
  const who = t(side === 'w' ? 'puzzles.task.white' : 'puzzles.task.black')
  if (p.mate !== null) return tn('puzzles.task.mate', p.mate, { who })
  if (p.kind === 'defense') return t('puzzles.task.defense', { who })
  return t('puzzles.task.win', { who })
}

function replayFen(fen: string, ucis: readonly string[]): Chess {
  const c = new Chess(fen)
  for (const u of ucis) c.move(splitUci(u))
  return c
}

export default function PuzzleView({ active }: { active: boolean }) {
  const { lang } = useI18n()
  const [stats, setStats] = useState<PuzzleStats>(() => loadPuzzleStats())
  const [filter, setFilter] = useState<PuzzleFilter>(ANY_FILTER)
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [played, setPlayed] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('solving')
  const [msg, setMsg] = useState<Msg>({ kind: 'info', text: () => t('puzzles.msg.start') })
  const [hintReq, setHintReq] = useState<HintReq | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [selected, setSelected] = useState<Square | null>(null)
  const [legal, setLegal] = useState<Square[]>([])
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [engineErr, setEngineErr] = useState(false)
  const [, setTick] = useState(0)

  const flags = useRef({ recorded: false, failed: false, hints: 0, elapsed: 0 })
  const statsRef = useRef(stats)
  statsRef.current = stats
  const playedRef = useRef<string[]>([])
  const timers = useRef<number[]>([])
  const token = useRef(0)

  useEffect(() => { savePuzzleStats(stats) }, [stats])
  useEffect(() => { if (active) puzzleEngine.start().catch(() => setEngineErr(true)) }, [active])
  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  // таймер решения: идёт, пока вкладка открыта и задача не закончена
  useEffect(() => {
    if (!active || !puzzle || status === 'solved' || status === 'shown') return
    const id = window.setInterval(() => { flags.current.elapsed += 500; setTick(t => t + 1) }, 500)
    return () => clearInterval(id)
  }, [active, puzzle, status])

  const setPlayedBoth = useCallback((next: string[]) => { playedRef.current = next; setPlayed(next) }, [])
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }

  const record = useCallback((p: Puzzle, result: 'solved' | 'failed') => {
    const f = flags.current
    if (f.recorded) return
    f.recorded = true
    setStats(s => recordOutcome(s, { puzzleId: p.id, themes: p.themes, result, hintsUsed: f.hints, timeMs: f.elapsed }))
  }, [])

  const load = useCallback((p: Puzzle) => {
    token.current++
    timers.current.forEach(clearTimeout); timers.current = []
    flags.current = { recorded: false, failed: false, hints: 0, elapsed: 0 }
    setPuzzle(p); setPlayedBoth([]); setStatus('solving'); setHintReq(null); setHintLevel(0)
    setSelected(null); setLegal([]); setPromo(null)
    const side = new Chess(p.fen).turn()
    setMsg({ kind: 'info', text: () => taskText(p, side) })
  }, [setPlayedBoth])

  const next = useCallback((f: PuzzleFilter = filter) => {
    const p = pickNext(ALL, f, statsRef.current, puzzle?.id ?? null)
    if (!p) { setPuzzle(null); setMsg({ kind: 'bad', text: () => t('puzzles.msg.none') }); return }
    load(p)
  }, [filter, load, puzzle])

  function changeFilter(patch: Partial<PuzzleFilter>) {
    const f = { ...filter, ...patch }
    setFilter(f)
    next(f)
  }

  const chess = useMemo(() => (puzzle ? replayFen(puzzle.fen, played) : null), [puzzle, played])
  const solver: Color = puzzle ? new Chess(puzzle.fen).turn() : 'w'
  const solverTurn = !!chess && chess.turn() === solver
  const canMove = !!puzzle && status === 'solving' && solverTurn && !promo

  function onSquare(sq: Square) {
    if (!canMove || !chess) return
    const piece = chess.get(sq)
    if (selected && legal.includes(sq)) {
      const mover = chess.get(selected)
      if (mover?.type === 'p' && (sq[1] === '8' || sq[1] === '1')) { setPromo({ from: selected, to: sq }); return }
      void tryMove(`${selected}${sq}`)
      return
    }
    if (piece && piece.color === solver) {
      setSelected(sq)
      setLegal(chess.moves({ square: sq, verbose: true }).map(m => m.to))
    } else { setSelected(null); setLegal([]) }
  }

  async function tryMove(uci: string) {
    if (!puzzle || !chess) return
    setSelected(null); setLegal([]); setPromo(null); setHintReq(null)
    const my = token.current
    const cur = playedRef.current
    const fen = chess.fen()
    setStatus('checking')
    setMsg({ kind: 'info', text: () => t('puzzles.msg.checking') })
    const j = await judgeMove(puzzle, cur, fen, uci, evaluate)
    if (my !== token.current) return
    if (j.type === 'unverified') {
      setStatus('solving'); setMsg({ kind: 'bad', text: () => t('puzzles.msg.unverified', { reason: t(j.reason) }) }); return
    }
    if (j.type === 'wrong') {
      flags.current.failed = true
      record(puzzle, 'failed')
      setStatus('solving')
      setMsg({ kind: 'bad', text: () => t('puzzles.msg.wrong', { reason: t(j.reason) }) })
      return
    }
    const withMove = [...cur, uci]
    setPlayedBoth(withMove)
    const finish = () => {
      setStatus('solved')
      if (!flags.current.failed) {
        record(puzzle, 'solved')
        setMsg({ kind: 'ok', text: () => t(j.alt ? 'puzzles.msg.solvedAlt' : 'puzzles.msg.solved') })
      } else {
        setMsg({ kind: 'ok', text: () => t('puzzles.msg.solvedLate') })
      }
    }
    if (j.reply) {
      setMsg({ kind: 'ok', text: () => t('puzzles.msg.replying') })
      later(() => {
        if (my !== token.current) return
        const all = [...withMove, j.reply!]
        setPlayedBoth(all)
        if (j.done) finish()
        else { setStatus('solving'); setMsg({ kind: 'ok', text: () => t('puzzles.msg.continueYourMove') }) }
      }, 600)
    } else if (j.done) finish()
    else { setStatus('solving'); setMsg({ kind: 'ok', text: () => t('puzzles.msg.continue') }) }
  }

  async function showHint() {
    if (!puzzle || !chess || hintLevel >= MAX_HINT || status !== 'solving') return
    const level = (hintLevel + 1) as 1 | 2 | 3
    const onScript = played.every((m, k) => m === puzzle.line[k])
    let p = puzzle
    let idx = played.length
    if (!onScript) {
      try {
        const v = await evaluate(chess.fen())
        if (!v.bestMove) return
        p = { ...puzzle, line: [v.bestMove] }; idx = 0
      } catch { setMsg({ kind: 'bad', text: () => t('puzzles.msg.hintFail') }); return }
    }
    flags.current.hints++
    setHintLevel(level)
    setHintReq({ p, fen: chess.fen(), level, idx })
  }

  function retry() {
    if (!puzzle) return
    token.current++
    timers.current.forEach(clearTimeout); timers.current = []
    setPlayedBoth([]); setStatus('solving'); setSelected(null); setLegal([]); setPromo(null); setHintReq(null); setHintLevel(0)
    setMsg({ kind: 'info', text: () => t('puzzles.msg.retry', { task: taskText(puzzle, solver) }) })
  }

  function showSolution() {
    if (!puzzle || status === 'checking') return
    if (!flags.current.recorded) { flags.current.failed = true; record(puzzle, 'failed') }
    token.current++
    const my = token.current
    timers.current.forEach(clearTimeout); timers.current = []
    setPlayedBoth([]); setSelected(null); setLegal([]); setPromo(null); setHintReq(null)
    setStatus('shown')
    setMsg({ kind: 'info', text: () => t('puzzles.msg.solution') })
    puzzle.line.forEach((_, i) => later(() => { if (my === token.current) setPlayedBoth(puzzle.line.slice(0, i + 1)) }, 700 * (i + 1)))
  }

  function resetAll() {
    if (window.confirm(t('puzzles.confirm.reset'))) setStats(resetPuzzleStats())
  }

  // подсказка пересчитывается при смене языка, не сбрасывая уровень подсказок
  const hint = useMemo<Hint | null>(() => (hintReq ? hintFor(hintReq.p, hintReq.fen, hintReq.level, hintReq.idx) : null), [hintReq, lang])
  const weak = weakThemes(stats)
  const lastMove = played.length && puzzle ? (() => { const u = splitUci(played[played.length - 1]); return { from: u.from as Square, to: u.to as Square } })() : null
  const total = ALL.length
  const available = ALL.filter(p => matches(p, filter)).length
  const showExplain = puzzle && (status === 'solved' || status === 'shown')
  const arrows = hint?.level === 3 && hint.square && hint.target ? [{ from: hint.square as Square, to: hint.target as Square, rank: 0 }] : []
  const themeStats = THEME_ORDER.map(t => ({ t, s: stats.byTheme[t] })).filter(x => x.s)

  return <div className="main-grid" data-testid="puzzle-view">
    <section className="panel board-panel puzzle-panel" data-testid="puzzle-board" data-puzzle-id={puzzle?.id ?? ''} data-fen={puzzle?.fen ?? ''}>
      <div className="panel-head">
        <div><div className="eyebrow">{t('puzzles.eyebrow.tactics')}</div><h2>{t('puzzles.title')}</h2></div>
        {puzzle && <span className="pill">{LEVEL_LABEL[puzzle.level]} · {THEME_LABEL[mainTheme(puzzle)]}</span>}
      </div>
      {chess && puzzle
        ? <>
          <div className="puzzle-task" data-testid="puzzle-task">{taskText(puzzle, solver)}</div>
          <div className="board-wrap">
            <Board chess={chess} orientation={solver} selected={selected} legal={legal} lastMove={lastMove}
              hint={hint?.level === 2 ? (hint.square as Square) : hint?.level === 3 ? (hint.square as Square) : null}
              arrows={arrows} onSquareClick={onSquare} readOnly={!canMove} />
          </div>
          {promo && <PromoPicker color={solver} onPick={p => void tryMove(`${promo.from}${promo.to}${p}`)} onCancel={() => { setPromo(null); setSelected(null); setLegal([]) }} />}
        </>
        : <div className="empty-state"><span>♞</span><p>{t('puzzles.empty.title')}</p><small>{available === 0 ? t('puzzles.empty.noMatches') : t('puzzles.empty.pressNext')}</small></div>}

      <div className={`puzzle-msg ${msg.kind}`} data-testid="puzzle-message" role="status"><span className="pulse" /> {msg.text()}</div>
      {engineErr && <p className="error-text">{t('puzzles.engineErr')}</p>}
      {hint && <div className="puzzle-hint" data-testid="hint-text"><b>{t('puzzles.hint.title', { level: hint.level, max: MAX_HINT })}</b><span>{hint.text}</span></div>}

      {showExplain && puzzle && <div className="puzzle-explain" data-testid="puzzle-explain">
        <b>{status === 'solved' && !flags.current.failed ? t('puzzles.explain.good') : t('puzzles.explain.solution')}</b>
        <code data-testid="puzzle-solution">{solutionSan(puzzle)}</code>
        {puzzleWhy(puzzle).map((w, i) => <p key={i}>{w}</p>)}
      </div>}

      <div className="board-actions">
        <button className="btn primary" onClick={() => next()} data-testid="next-btn">{t('puzzles.btn.next')}</button>
        <button className="btn" onClick={retry} disabled={!puzzle || status === 'checking'} data-testid="retry-btn">{t('puzzles.btn.retry')}</button>
        <button className="btn" onClick={() => void showHint()} disabled={!puzzle || status !== 'solving' || hintLevel >= MAX_HINT} data-testid="hint-btn">{t('puzzles.btn.hint', { level: hintLevel, max: MAX_HINT })}</button>
        <button className="btn" onClick={showSolution} disabled={!puzzle || status === 'checking' || status === 'shown'} data-testid="solution-btn">{t('puzzles.btn.solution')}</button>
      </div>
      <p className="tiny">{t('puzzles.note.base', { total, time: formatDuration(flags.current.elapsed) })}</p>
    </section>

    <aside className="right-column">
      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">{t('puzzles.pick.eyebrow')}</div><h2>{t('puzzles.pick.title')}</h2></div><span className="pill" data-testid="available-count">{tn('puzzles.pick.count', available)}</span></div>
        <div className="chip-group"><small>{t('puzzles.pick.theme')}</small></div>
        <div className="chips" data-testid="theme-chips">
          <button className={`chip ${filter.theme === 'any' ? 'active' : ''}`} onClick={() => changeFilter({ theme: 'any' })} data-testid="theme-any">{t('puzzles.pick.anyTheme')}</button>
          {THEME_ORDER.map(t => <button key={t} className={`chip ${filter.theme === t ? 'active' : ''}`} onClick={() => changeFilter({ theme: t })} data-testid={`theme-${t}`}>{THEME_LABEL[t]}</button>)}
        </div>
        <div className="chip-group" style={{ marginTop: 14 }}><small>{t('puzzles.pick.level')}</small></div>
        <div className="chips" data-testid="level-chips">
          {([0, 1, 2, 3] as const).map(l => <button key={l} className={`chip ${filter.level === l ? 'active' : ''}`} onClick={() => changeFilter({ level: l as Level | 0 })} data-testid={`level-${l}`}>{l === 0 ? t('puzzles.level.any') : LEVEL_LABEL[l]}</button>)}
        </div>
        <div className="chip-group" style={{ marginTop: 14 }}><small>{t('puzzles.pick.type')}</small></div>
        <div className="chips" data-testid="mate-chips">
          {(Object.keys(MATE_FILTER_LABEL) as MateFilter[]).map(m => <button key={m} className={`chip ${filter.mate === m ? 'active' : ''}`} onClick={() => changeFilter({ mate: m })} data-testid={`mate-${m}`}>{MATE_FILTER_LABEL[m]}</button>)}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">{t('puzzles.stats.eyebrow')}</div><h2>{t('puzzles.stats.title')}</h2></div></div>
        <div className="stats">
          <div><strong data-testid="stat-solved">{stats.solved}</strong><small>{t('puzzles.stats.solved')}</small></div>
          <div><strong data-testid="stat-percent">{successPercent(stats)}%</strong><small>{tn('puzzles.stats.percent', stats.attempted)}</small></div>
          <div><strong data-testid="stat-clean">{stats.clean}</strong><small>{t('puzzles.stats.clean')}</small></div>
          <div><strong data-testid="stat-time">{formatDuration(stats.timeMs)}</strong><small>{t('puzzles.stats.time')}</small></div>
        </div>
        {themeStats.length > 0 && <table className="puzzle-themes" data-testid="theme-table"><thead><tr><th>{t('puzzles.stats.colTheme')}</th><th>{t('puzzles.stats.colSolved')}</th><th>%</th><th>{t('puzzles.stats.colTime')}</th></tr></thead><tbody>
          {themeStats.map(({ t, s }) => <tr key={t}><td>{THEME_LABEL[t]}</td><td>{s!.solved}/{s!.tried}</td><td>{Math.round((s!.solved / s!.tried) * 100)}%</td><td>{formatDuration(s!.timeMs)}</td></tr>)}
        </tbody></table>}
        {weak.length > 0 && <div className="weak-box" data-testid="weak-themes">
          <b>{t('puzzles.weak.title')}</b>
          <div className="chips">{weak.slice(0, 3).map(w => <button key={w.theme} className="chip" onClick={() => changeFilter({ theme: w.theme, mate: 'any', level: 0 })} data-testid={`weak-${w.theme}`}>{THEME_LABEL[w.theme]} · {w.percent}%</button>)}</div>
          <p className="tiny">{t('puzzles.weak.note')}</p>
        </div>}
        <p className="progress-note">{t('puzzles.stats.storage')}</p>
        <button className="btn" onClick={resetAll} disabled={stats.attempted === 0} data-testid="reset-puzzle-stats">{t('puzzles.btn.reset')}</button>
      </section>
    </aside>
  </div>
}
