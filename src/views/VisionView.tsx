import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Color } from 'chess.js'
import VisionBoard, { type VMark } from '../components/VisionBoard'
import { markActive } from '../lib/activity'
import { tn, useI18n, type Key } from '../i18n'
import { attackPuzzle, attacks, gradeAttacks, knightDistance, knightMoves, knightPuzzle, loadVision, randomSquare, recordRun, saveVision, type Sq, type VPiece, type VisionGame } from '../lib/vision'

const GAMES: VisionGame[] = ['coords', 'knight', 'attacks']
const COORD_SECONDS = 30
const ROUNDS: Record<'knight' | 'attacks', number> = { knight: 10, attacks: 8 }

export default function VisionView() {
  const { t } = useI18n()
  const [game, setGame] = useState<VisionGame>('coords')
  const [store, setStore] = useState(() => loadVision())
  const finish = useCallback((g: VisionGame, score: number, of?: number): boolean => {
    markActive()
    let rec = false
    setStore(s => { const r = recordRun(s, { game: g, score, ...(of ? { of } : {}), at: Date.now() }); rec = r.record; saveVision(r.store); return r.store })
    return rec
  }, [])
  const best = store.best[game]
  return <div className="main-grid" data-testid="vision-view" data-game={game}>
    {game === 'coords' && <Coords key="c" finish={finish} />}
    {game === 'knight' && <Knight key="k" finish={finish} />}
    {game === 'attacks' && <Attacks key="a" finish={finish} />}
    <section className="panel online-side vision-side">
      <div className="panel-head"><div><div className="eyebrow">{t('vision.eyebrow')}</div><h3>{t('vision.title')}</h3></div></div>
      <div className="chips" role="tablist">{GAMES.map(g => <button key={g} role="tab" aria-selected={g === game} className={`chip ${g === game ? 'active' : ''}`} onClick={() => setGame(g)} data-testid={`vision-tab-${g}`}>{t(`vision.game.${g}` as Key)}</button>)}</div>
      <p className="muted">{t(`vision.how.${game}` as Key)}</p>
      <p data-testid="vision-best">{best !== undefined ? <b>{t('vision.best', { n: best })}</b> : <span className="muted">{t('vision.best.none')}</span>}</p>
    </section>
  </div>
}

type FinishProps = { finish: (g: VisionGame, score: number, of?: number) => boolean }
type Flash = Record<Sq, VMark>

function Summary({ score, of, record, extra, onAgain }: { score: number; of?: number; record: boolean; extra?: string; onAgain: () => void }) {
  const { t } = useI18n()
  return <div className="vision-summary" data-testid="vision-summary">
    <h3 data-testid="vision-final">{of ? t('vision.final.of', { n: score, m: of }) : t('vision.final', { n: score })}</h3>
    {extra && <p className="muted">{extra}</p>}
    {record && <p><b data-testid="vision-record">{t('vision.record')}</b></p>}
    <button className="btn primary" onClick={onAgain} data-testid="vision-again">{t('vision.again')}</button>
  </div>
}

// ---------- координаты ----------
function Coords({ finish }: FinishProps) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<'idle' | 'run' | 'over'>('idle')
  const [side, setSide] = useState<'w' | 'b' | 'r'>('w')
  const [labels, setLabels] = useState(true)
  const [orient, setOrient] = useState<Color>('w')
  const [target, setTarget] = useState<Sq>('e4')
  const [score, setScore] = useState(0), [errors, setErrors] = useState(0)
  const [left, setLeft] = useState(COORD_SECONDS), [record, setRecord] = useState(false)
  const [flash, setFlash] = useState<Flash>({})
  const endAt = useRef(0), flashT = useRef<ReturnType<typeof setTimeout>>(undefined), scoreRef = useRef(0)

  const start = () => {
    setOrient(side === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : side); setScore(0); scoreRef.current = 0; setErrors(0); setRecord(false); setFlash({})
    setTarget(randomSquare()); endAt.current = Date.now() + COORD_SECONDS * 1000; setLeft(COORD_SECONDS); setPhase('run')
  }
  useEffect(() => {
    if (phase !== 'run') return
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000)); setLeft(s)
      if (s <= 0) { clearInterval(id); setPhase('over'); setRecord(finish('coords', scoreRef.current)) }
    }, 200)
    return () => clearInterval(id)
  }, [phase, finish])
  useEffect(() => () => clearTimeout(flashT.current), [])

  const click = (s: Sq) => {
    if (phase !== 'run') return
    const ok = s === target
    setFlash({ [s]: ok ? 'ok' : 'bad' }); clearTimeout(flashT.current); flashT.current = setTimeout(() => setFlash({}), 350)
    if (ok) { scoreRef.current += 1; setScore(scoreRef.current); setTarget(randomSquare(Math.random, [s])) } else setErrors(e => e + 1)
  }
  const acc = score + errors ? Math.round((score / (score + errors)) * 100) : 0
  return <section className="panel board-panel play-panel" data-testid="vision-coords" data-phase={phase}>
    <div className="panel-head"><div><div className="eyebrow">{t('vision.eyebrow')}</div><h2>{t('vision.game.coords')}</h2></div>
      {phase === 'run' && <span className="pill" data-testid="vision-time">{left} {t('vision.sec')}</span>}</div>
    {phase === 'idle' && <div className="vision-setup">
      <div className="field-label">{t('vision.side')}</div>
      <div className="chips">{(['w', 'b', 'r'] as const).map(x => <button key={x} className={`chip ${side === x ? 'active' : ''}`} onClick={() => setSide(x)} data-testid={`vision-side-${x}`}>{t(`vision.side.${x}` as Key)}</button>)}</div>
      <label className="chip" style={{ marginTop: 10 }}><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)} data-testid="vision-labels" />{t('vision.labels')}</label>
      <p><button className="btn primary big" onClick={start} data-testid="vision-start">{t('vision.start')}</button></p>
    </div>}
    {phase === 'run' && <div className="vision-prompt" data-testid="vision-target" aria-live="polite">{target}</div>}
    {phase === 'run' && <div className="muted" data-testid="vision-score">{t('vision.score', { n: score })}</div>}
    {phase !== 'over' && <div className="board-wrap"><VisionBoard orientation={orient} marks={flash} onSquare={click} labels={labels} readOnly={phase !== 'run'} /></div>}
    {phase === 'over' && <Summary score={score} record={record} extra={t('vision.acc', { p: acc, e: errors })} onAgain={() => setPhase('idle')} />}
  </section>
}

// ---------- ход коня ----------
function Knight({ finish }: FinishProps) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<'idle' | 'run' | 'done' | 'over'>('idle')
  const [round, setRound] = useState(0), [score, setScore] = useState(0), [record, setRecord] = useState(false)
  const [pz, setPz] = useState(() => knightPuzzle())
  const [cur, setCur] = useState<Sq>('a1'), [path, setPath] = useState<Sq[]>([]), [moves, setMoves] = useState(0)
  const [flash, setFlash] = useState<Flash>({}), [showMoves, setShowMoves] = useState(false)
  const flashT = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(flashT.current), [])

  const begin = (r: number) => { const p = knightPuzzle(); setPz(p); setCur(p.from); setPath([]); setMoves(0); setRound(r); setPhase('run'); setFlash({}) }
  const start = () => { setScore(0); setRecord(false); begin(1) }
  const click = (s: Sq) => {
    if (phase !== 'run') return
    if (!knightMoves(cur).includes(s)) { setFlash({ [s]: 'bad' }); clearTimeout(flashT.current); flashT.current = setTimeout(() => setFlash({}), 350); return }
    setPath(p => [...p, cur]); setCur(s); setMoves(m => m + 1)
    if (s === pz.to) { setPhase('done'); if (moves + 1 === pz.best) setScore(x => x + 1) }
  }
  const next = () => {
    if (round >= ROUNDS.knight) { setPhase('over'); setRecord(finish('knight', score, ROUNDS.knight)) } else begin(round + 1)
  }
  const marks: Record<Sq, VMark> = { ...Object.fromEntries(path.map(p => [p, 'path' as VMark])), [pz.to]: phase === 'done' ? 'ok' : 'target', ...flash }
  if (showMoves && phase === 'run') for (const m of knightMoves(cur)) if (!marks[m]) marks[m] = 'sel'
  const optimal = moves === pz.best
  return <section className="panel board-panel play-panel" data-testid="vision-knight" data-phase={phase}>
    <div className="panel-head"><div><div className="eyebrow">{t('vision.eyebrow')}</div><h2>{t('vision.game.knight')}</h2></div>
      {(phase === 'run' || phase === 'done') && <span className="pill" data-testid="vision-round">{t('vision.round', { n: round, m: ROUNDS.knight })}</span>}</div>
    {phase === 'idle' && <div className="vision-setup">
      <label className="chip"><input type="checkbox" checked={showMoves} onChange={e => setShowMoves(e.target.checked)} data-testid="vision-showmoves" />{t('vision.showMoves')}</label>
      <p><button className="btn primary big" onClick={start} data-testid="vision-start">{t('vision.start')}</button></p>
    </div>}
    {(phase === 'run' || phase === 'done') && <>
      <div className="vision-prompt" data-testid="vision-target">{pz.from} → {pz.to}</div>
      <div className="muted" data-testid="vision-info">{phase === 'run' ? t('vision.knight.info', { n: moves }) : optimal ? t('vision.knight.opt', { n: moves }) : t('vision.knight.more', { n: moves, b: pz.best })}</div>
      <div className="board-wrap"><VisionBoard orientation="w" pieces={[{ sq: cur, type: 'n', color: 'w' }]} marks={marks} onSquare={click} readOnly={phase !== 'run'} /></div>
      {phase === 'done' && <p><button className="btn primary" onClick={next} data-testid="vision-next">{round >= ROUNDS.knight ? t('vision.finish') : t('vision.next')}</button></p>}
    </>}
    {phase === 'over' && <Summary score={score} of={ROUNDS.knight} record={record} extra={t('vision.knight.sum')} onAgain={() => setPhase('idle')} />}
  </section>
}

// ---------- какие поля бьёт фигура ----------
function Attacks({ finish }: FinishProps) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<'idle' | 'answer' | 'checked' | 'over'>('idle')
  const [round, setRound] = useState(0), [score, setScore] = useState(0), [record, setRecord] = useState(false)
  const [pz, setPz] = useState<{ piece: VPiece; from: Sq }>(() => attackPuzzle())
  const [picked, setPicked] = useState<Sq[]>([])
  const truth = useMemo(() => attacks(pz.piece, pz.from), [pz])
  const grade = useMemo(() => gradeAttacks(picked, truth), [picked, truth])

  const begin = (r: number) => { setPz(attackPuzzle()); setPicked([]); setRound(r); setPhase('answer') }
  const start = () => { setScore(0); setRecord(false); begin(1) }
  const click = (s: Sq) => { if (phase === 'answer' && s !== pz.from) setPicked(p => (p.includes(s) ? p.filter(x => x !== s) : [...p, s])) }
  const check = () => { setPhase('checked'); if (grade.perfect) setScore(x => x + 1) }
  const next = () => { if (round >= ROUNDS.attacks) { setPhase('over'); setRecord(finish('attacks', score, ROUNDS.attacks)) } else begin(round + 1) }
  const marks: Record<Sq, VMark> = {}
  if (phase === 'answer') for (const s of picked) marks[s] = 'sel'
  if (phase === 'checked') { for (const s of grade.ok) marks[s] = 'ok'; for (const s of grade.extra) marks[s] = 'bad'; for (const s of grade.missed) marks[s] = 'miss' }
  return <section className="panel board-panel play-panel" data-testid="vision-attacks" data-phase={phase}>
    <div className="panel-head"><div><div className="eyebrow">{t('vision.eyebrow')}</div><h2>{t('vision.game.attacks')}</h2></div>
      {(phase === 'answer' || phase === 'checked') && <span className="pill" data-testid="vision-round">{t('vision.round', { n: round, m: ROUNDS.attacks })}</span>}</div>
    {phase === 'idle' && <div className="vision-setup"><p><button className="btn primary big" onClick={start} data-testid="vision-start">{t('vision.start')}</button></p></div>}
    {(phase === 'answer' || phase === 'checked') && <>
      <div className="vision-prompt" data-testid="vision-target">{t(`vision.piece.${pz.piece}` as Key)} {pz.from}</div>
      <div className="muted" data-testid="vision-info">{phase === 'answer' ? t('vision.attacks.info', { n: picked.length }) : grade.perfect ? t('vision.attacks.perfect') : t('vision.attacks.wrong', { x: grade.extra.length, m: grade.missed.length })}</div>
      <div className="board-wrap"><VisionBoard orientation="w" pieces={[{ sq: pz.from, type: pz.piece, color: 'w' }]} marks={marks} onSquare={click} readOnly={phase !== 'answer'} /></div>
      <p>{phase === 'answer'
        ? <button className="btn primary" disabled={picked.length === 0} onClick={check} data-testid="vision-check">{t('vision.check')}</button>
        : <button className="btn primary" onClick={next} data-testid="vision-next">{round >= ROUNDS.attacks ? t('vision.finish') : t('vision.next')}</button>}</p>
    </>}
    {phase === 'over' && <Summary score={score} of={ROUNDS.attacks} record={record} extra={tn('vision.attacks.sum', score)} onAgain={() => setPhase('idle')} />}
  </section>
}
