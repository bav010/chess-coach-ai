import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import { puzzleEngine } from '../engine'
import Board from './Board'
import Icon from './Icon'
import PromoPicker from './PromoPicker'
import PUZZLES from '../data/puzzles.json'
import { LEVEL_LABEL, judgeMove, type Evaluate, type Level, type Puzzle } from '../lib/puzzles'
import { splitUci } from '../lib/game'
import { bump, markActive } from '../lib/activity'
import { MAX_MISTAKES, RUN_SECONDS, loadSprint, recordRun, runAccuracy, saveSprint, type SprintStore } from '../lib/sprint'
import { fmtDate, t, tn, useI18n } from '../i18n'

const ALL = PUZZLES as unknown as Puzzle[]
type Phase = 'idle' | 'running' | 'done'
type Msg = { kind: 'info' | 'ok' | 'bad'; text: () => string }
type LevelFilter = 0 | Level

const evaluate: Evaluate = async fen => {
  const a = await puzzleEngine.analyse(fen, { depth: 14, movetime: 900, multipv: 1 })
  return { cp: a.cp, mate: a.mate, bestMove: a.bestMoveUci }
}
const replayFen = (fen: string, ucis: readonly string[]) => { const c = new Chess(fen); for (const u of ucis) c.move(splitUci(u)); return c }
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** «На время»: 3 минуты, решайте задачи подряд. Ошибка засчитывается, задача сменяется; после 3 ошибок забег заканчивается. */
export default function TimedRun({ active }: { active: boolean }) {
  const { lang } = useI18n()
  const [store, setStore] = useState<SprintStore>(() => loadSprint())
  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState<LevelFilter>(0)
  const [left, setLeft] = useState(RUN_SECONDS)
  const [score, setScore] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [played, setPlayed] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Square | null>(null)
  const [legal, setLegal] = useState<Square[]>([])
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [msg, setMsg] = useState<Msg>({ kind: 'info', text: () => '' })
  const [engineErr, setEngineErr] = useState(false)
  const [isRecord, setIsRecord] = useState(false)

  const run = useRef({ deadline: 0, score: 0, mistakes: 0, used: new Set<string>(), token: 0, timers: [] as number[] })
  const playedRef = useRef<string[]>([])
  const levelRef = useRef(level); levelRef.current = level
  const storeRef = useRef(store); storeRef.current = store

  useEffect(() => { if (active) puzzleEngine.start().catch(() => setEngineErr(true)) }, [active])
  const later = (fn: () => void, ms: number) => { run.current.timers.push(window.setTimeout(fn, ms)) }
  const clearTimers = () => { run.current.timers.forEach(clearTimeout); run.current.timers = [] }
  useEffect(() => () => clearTimers(), [])

  const setPlayedBoth = (p: string[]) => { playedRef.current = p; setPlayed(p) }

  const pickPuzzle = useCallback((): Puzzle | null => {
    const lv = levelRef.current
    let pool = ALL.filter(p => (lv === 0 || p.level === lv) && !run.current.used.has(p.id))
    if (pool.length === 0) { run.current.used.clear(); pool = ALL.filter(p => lv === 0 || p.level === lv) }
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
  }, [])

  const load = useCallback(() => {
    const p = pickPuzzle()
    if (!p) return
    run.current.used.add(p.id)
    setPuzzle(p); setPlayedBoth([]); setSelected(null); setLegal([]); setPromo(null); setBusy(false)
    const side = new Chess(p.fen).turn()
    setMsg({ kind: 'info', text: () => t(side === 'w' ? 'puzzles.task.white' : 'puzzles.task.black') })
  }, [pickPuzzle])

  const finish = useCallback((record: boolean) => {
    clearTimers(); run.current.token++
    setPhase('done'); setBusy(false); setPromo(null); setSelected(null); setLegal([])
    if (!record) return
    markActive()
    const r = run.current
    bump('puzzles', r.score + r.mistakes); bump('solved', r.score)
    const out = recordRun(storeRef.current, { at: new Date().toISOString(), score: r.score, mistakes: r.mistakes, level: levelRef.current, seconds: RUN_SECONDS })
    setIsRecord(out.record); setStore(out.store); saveSprint(out.store)
  }, [])

  function start() {
    clearTimers(); run.current = { deadline: Date.now() + RUN_SECONDS * 1000, score: 0, mistakes: 0, used: new Set(), token: run.current.token + 1, timers: [] }
    setScore(0); setMistakes(0); setLeft(RUN_SECONDS); setIsRecord(false); setPhase('running'); load()
  }

  // обратный отсчёт; уход с вкладки во время забега отменяет его без записи результата
  useEffect(() => {
    if (phase !== 'running') return
    if (!active) { setPhase('idle'); clearTimers(); run.current.token++; return }
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((run.current.deadline - Date.now()) / 1000))
      setLeft(s)
      if (s <= 0) finish(true)
    }, 250)
    return () => clearInterval(id)
  }, [phase, active, finish])

  const chess = useMemo(() => (puzzle ? replayFen(puzzle.fen, played) : null), [puzzle, played])
  const solver: Color = puzzle ? new Chess(puzzle.fen).turn() : 'w'
  const canMove = phase === 'running' && !!puzzle && !busy && !!chess && chess.turn() === solver && !promo

  function onSquare(sq: Square) {
    if (!canMove || !chess) return
    const piece = chess.get(sq)
    if (selected && legal.includes(sq)) {
      const mover = chess.get(selected)
      if (mover?.type === 'p' && (sq[1] === '8' || sq[1] === '1')) { setPromo({ from: selected, to: sq }); return }
      void tryMove(`${selected}${sq}`); return
    }
    if (piece && piece.color === solver) { setSelected(sq); setLegal(chess.moves({ square: sq, verbose: true }).map(m => m.to)) }
    else { setSelected(null); setLegal([]) }
  }

  async function tryMove(uci: string) {
    if (!puzzle || !chess) return
    setSelected(null); setLegal([]); setPromo(null); setBusy(true)
    const token = run.current.token
    const cur = playedRef.current
    const j = await judgeMove(puzzle, cur, chess.fen(), uci, evaluate)
    if (token !== run.current.token) return
    if (j.type === 'unverified') { setMsg({ kind: 'info', text: () => t('puzzles.sprint.skipped') }); later(() => { if (token === run.current.token) load() }, 600); return }
    if (j.type === 'wrong') {
      run.current.mistakes++; setMistakes(run.current.mistakes)
      setMsg({ kind: 'bad', text: () => t('puzzles.sprint.wrong') })
      if (run.current.mistakes >= MAX_MISTAKES) { later(() => finish(true), 700); return }
      later(() => { if (token === run.current.token) load() }, 800)
      return
    }
    const withMove = [...cur, uci]
    setPlayedBoth(withMove)
    const done = () => { run.current.score++; setScore(run.current.score); setMsg({ kind: 'ok', text: () => t('puzzles.sprint.right') }); later(() => { if (token === run.current.token) load() }, 450) }
    if (j.reply) {
      later(() => {
        if (token !== run.current.token) return
        setPlayedBoth([...withMove, j.reply!])
        if (j.done) done(); else { setBusy(false); setMsg({ kind: 'ok', text: () => t('puzzles.msg.continueYourMove') }) }
      }, 450)
    } else if (j.done) done()
    else setBusy(false)
  }

  const last = played.length && puzzle ? (() => { const u = splitUci(played[played.length - 1]); return { from: u.from as Square, to: u.to as Square } })() : null
  const acc = runAccuracy(score, mistakes)

  return <div className="main-grid" data-testid="sprint-view" data-phase={phase} data-lang={lang}>
    <section className="panel board-panel puzzle-panel" data-testid="sprint-board" data-puzzle-id={phase === 'running' ? puzzle?.id ?? '' : ''}>
      <div className="panel-head">
        <div><div className="eyebrow">{t('puzzles.sprint.eyebrow')}</div><h2>{t('puzzles.sprint.title')}</h2></div>
        {phase !== 'idle' && <span className="pill" data-testid="sprint-level">{level === 0 ? t('puzzles.sprint.anyLevel') : LEVEL_LABEL[level]}</span>}
      </div>

      {phase === 'running' && <div className="sprint-hud">
        <div><small>{t('puzzles.sprint.time')}</small><strong className={left <= 10 ? 'warn' : ''} data-testid="sprint-time">{clock(left)}</strong></div>
        <div><small>{t('puzzles.sprint.score')}</small><strong data-testid="sprint-score">{score}</strong></div>
        <div><small>{t('puzzles.sprint.mistakes')}</small><strong data-testid="sprint-mistakes">{mistakes}/{MAX_MISTAKES}</strong></div>
      </div>}

      {phase === 'running' && puzzle && chess && <>
        <div className="board-wrap"><Board chess={chess} orientation={solver} selected={selected} legal={legal} lastMove={last} onSquareClick={onSquare} readOnly={!canMove} /></div>
        {promo && <PromoPicker color={solver} onPick={p => void tryMove(`${promo.from}${promo.to}${p}`)} onCancel={() => { setPromo(null); setSelected(null); setLegal([]) }} />}
        <div className={`puzzle-msg ${msg.kind}`} data-testid="sprint-message" role="status"><span className="pulse" /> {msg.text()}</div>
        {engineErr && <p className="error-text">{t('puzzles.engineErr')}</p>}
        <div className="action-bar"><button className="btn quiet" onClick={() => finish(false)} data-testid="sprint-stop"><Icon name="flag" size={16} />{t('puzzles.sprint.stop')}</button></div>
      </>}

      {phase === 'idle' && <div className="empty-state" data-testid="sprint-idle">
        <span>♞</span><p>{t('puzzles.sprint.idle.title')}</p><small>{t('puzzles.sprint.idle.text', { min: RUN_SECONDS / 60, n: MAX_MISTAKES })}</small>
        <div className="chips" role="group" aria-label={t('puzzles.sprint.levelAria')}>
          {([0, 1, 2, 3] as const).map(l => <button key={l} type="button" className={`chip ${level === l ? 'active' : ''}`} aria-pressed={level === l} onClick={() => setLevel(l)} data-testid={`sprint-level-${l}`}>{l === 0 ? t('puzzles.sprint.anyLevel') : LEVEL_LABEL[l]}</button>)}
        </div>
        <button className="btn primary big" onClick={start} data-testid="sprint-start"><Icon name="play2" size={18} />{t('puzzles.sprint.start')}</button>
      </div>}

      {phase === 'done' && <div className="empty-state sprint-result" data-testid="sprint-done">
        <span>{isRecord ? '★' : '♞'}</span>
        <p data-testid="sprint-final">{tn('puzzles.sprint.result', score)}</p>
        {isRecord && <small className="home-solved" data-testid="sprint-record"><Icon name="check" size={16} />{t('puzzles.sprint.newRecord')}</small>}
        <small>{acc === null ? t('puzzles.sprint.noAttempts') : t('puzzles.sprint.accuracy', { acc, m: mistakes })}</small>
        <button className="btn primary big" onClick={start} data-testid="sprint-again"><Icon name="refresh" size={18} />{t('puzzles.sprint.again')}</button>
        <button className="btn quiet" onClick={() => setPhase('idle')} data-testid="sprint-back">{t('puzzles.sprint.back')}</button>
      </div>}
    </section>

    <aside className="right-column">
      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">{t('puzzles.sprint.stats.eyebrow')}</div><h2>{t('puzzles.sprint.stats.title')}</h2></div></div>
        <div className="stats">
          <div><strong data-testid="sprint-best">{store.best}</strong><small>{t('puzzles.sprint.best')}</small></div>
          <div><strong data-testid="sprint-runs">{store.runs}</strong><small>{t('puzzles.sprint.runs')}</small></div>
        </div>
        {store.history.length > 0 && <table className="st-table" data-testid="sprint-history"><thead><tr><th>{t('puzzles.sprint.h.date')}</th><th>{t('puzzles.sprint.h.score')}</th><th>{t('puzzles.sprint.h.level')}</th></tr></thead><tbody>
          {store.history.slice(0, 6).map(r => <tr key={r.at}><td>{fmtDate(Date.parse(r.at))}</td><td>{r.score}</td><td>{r.level === 0 ? t('puzzles.sprint.anyLevel') : LEVEL_LABEL[r.level as Level]}</td></tr>)}
        </tbody></table>}
        <p className="progress-note">{t('puzzles.sprint.note')}</p>
      </section>
    </aside>
  </div>
}
