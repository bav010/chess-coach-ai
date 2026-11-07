import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import Board from '../components/Board'
import PromoPicker from '../components/PromoPicker'
import Icon from '../components/Icon'
import { useBoardInput } from '../hooks/useBoardInput'
import { analysisEngine, botEngine } from '../engine'
import { useI18n, type Key } from '../i18n'
import { bump } from '../lib/activity'
import { ENTRIES, GROUPS, HOLD_MOVES, entriesOf, entryById, judge, loadProgress, markSolved, markTry, nextUnsolved, saveProgress, solvedCount, type EgProgress, type EndgameEntry, type Verdict } from '../lib/endgames'
import { splitUci } from '../lib/game'
import { hrefFor, navigate } from '../lib/route'
import { uciToSan } from '../lib/san'

/** Партия из позиции с начальными ходами: пересобирается заново, чтобы сохранялась история для троекратного повторения. */
const build = (fen: string, moves: readonly string[]): Chess => { const c = new Chess(fen); for (const u of moves) c.move(splitUci(u)); return c }

export default function EndgamesView({ arg }: { arg: string | null }) {
  const entry = entryById(arg)
  const [progress, setProgress] = useState<EgProgress>(() => loadProgress())
  const update = useCallback((fn: (p: EgProgress) => EgProgress) => setProgress(p => { const n = fn(p); saveProgress(n); return n }), [])
  return entry ? <Trainer key={entry.id} entry={entry} progress={progress} update={update} /> : <Overview progress={progress} />
}

function Overview({ progress }: { progress: EgProgress }) {
  const { t } = useI18n()
  const total = ENTRIES.length, done = ENTRIES.filter(e => progress.solved[e.id]).length
  return <div className="st-sec" data-testid="eg-overview">
    <section className="panel">
      <div className="panel-head"><div><div className="eyebrow">{t('eg.eyebrow')}</div><h2>{t('eg.title')}</h2></div><span className="pill" data-testid="eg-total">{t('eg.progress', { n: done, m: total })}</span></div>
      <p className="muted">{t('eg.intro')}</p>
      <p className="muted"><small>{t('eg.verified')}</small></p>
    </section>
    {GROUPS.map(g => <section className="panel" key={g.id}>
      <div className="panel-head"><div><h3>{t(`eg.group.${g.id}` as Key)}</h3></div></div>
      <div className="online-tiles" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {g.topics.map(id => {
          const list = entriesOf(id), n = solvedCount(progress, id), first = nextUnsolved(progress, id) ?? list[0]
          const goal = list.every(x => x.goal === list[0].goal) ? list[0].goal : 'mixed'
          return <a key={id} className="online-tile" href={hrefFor('endgames', first.id)} data-testid={`eg-topic-${id}`} data-done={n === list.length}>
            <b>{t(`eg.topic.${id}.title` as Key)}</b>
            <small>{t(`eg.goal.${goal}.short` as Key)} · {t('eg.progress', { n, m: list.length })}{n === list.length ? ' ✓' : ''}</small>
          </a>
        })}
      </div>
    </section>)}
  </div>
}

function Trainer({ entry: e, progress, update }: { entry: EndgameEntry; progress: EgProgress; update: (fn: (p: EgProgress) => EgProgress) => void }) {
  const { t } = useI18n()
  const [moves, setMoves] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [hints, setHints] = useState(0)
  const [hint, setHint] = useState<{ from: Square; uci: string; san: string } | null>(null)
  const [hintBusy, setHintBusy] = useState(false)
  const [err, setErr] = useState(false)
  const [run, setRun] = useState(0)
  const reported = useRef<string>('')
  const chess = useMemo(() => build(e.fen, moves), [e.fen, moves])
  const userMoves = useMemo(() => { const first = new Chess(e.fen).turn(); return moves.filter((_, i) => (i % 2 === 0 ? first : first === 'w' ? 'b' : 'w') === e.user).length }, [moves, e.fen, e.user])
  const verdict: Verdict = judge(chess, e, userMoves)
  const myTurn = verdict === 'playing' && chess.turn() === e.user && !busy

  // новая попытка: сбрасываем партию и считаем попытку
  useEffect(() => {
    setMoves([]); setHints(0); setHint(null); setErr(false); reported.current = ''
    update(p => markTry(p, e.id))
    botEngine.stop(); void botEngine.newGame().catch(() => undefined)
  }, [e.id, run, update])

  const play = useCallback((uci: string) => { setHint(null); setMoves(m => [...m, uci]) }, [])
  const input = useBoardInput(chess, myTurn ? e.user : null, play)

  // ход соперника (движок на полной силе)
  useEffect(() => {
    if (verdict !== 'playing' || chess.turn() === e.user) return
    let live = true
    setBusy(true)
    botEngine.search(e.fen, moves, { depth: 18, movetime: 700 }).then(a => {
      if (!live) return
      setBusy(false)
      if (a.bestMoveUci) play(a.bestMoveUci); else setErr(true)
    }).catch(() => { if (live) { setBusy(false); setErr(true) } })
    return () => { live = false; botEngine.stop(); setBusy(false) }
  }, [chess, verdict, e.fen, e.user, moves, play])

  // итог: прогресс и счётчик активности
  useEffect(() => {
    if (verdict !== 'solved' || reported.current === `${e.id}:${run}`) return
    reported.current = `${e.id}:${run}`
    update(p => markSolved(p, e.id, hints)); bump('puzzles', 1)
  }, [verdict, e.id, run, hints, update])

  async function askHint() {
    if (!myTurn || hintBusy) return
    setHintBusy(true)
    try {
      const a = await analysisEngine.analyse(chess.fen(), { depth: 18, movetime: 1500 })
      const u = a.bestMoveUci
      if (u) { setHints(h => h + 1); setHint({ from: u.slice(0, 2) as Square, uci: u, san: uciToSan(chess.fen(), u) ?? u }) }
    } catch { setErr(true) } finally { setHintBusy(false) }
  }

  const list = entriesOf(e.topic)
  const idx = list.findIndex(x => x.id === e.id)
  const nxt = nextUnsolved(progress, e.topic, e.id) ?? list[(idx + 1) % list.length]
  const lastUci = moves[moves.length - 1]
  const last = lastUci ? (() => { const u = splitUci(lastUci); return { from: u.from, to: u.to } })() : null
  const status = verdict === 'solved' ? t(e.goal === 'win' ? 'eg.verdict.solved.win' : 'eg.verdict.solved.draw')
    : verdict === 'lost' ? t('eg.verdict.lost') : verdict === 'drawn' ? t('eg.verdict.drawn')
    : err ? t('eg.err.engine') : busy ? t('eg.status.bot') : t(e.goal === 'win' ? 'eg.status.you.win' : 'eg.status.you.draw', { n: Math.max(0, HOLD_MOVES - userMoves) })

  return <div className="main-grid" data-testid="eg-trainer" data-verdict={verdict} data-topic={e.topic} data-id={e.id}>
    <section className="panel board-panel play-panel">
      <div className="panel-head"><div><div className="eyebrow">{t('eg.eyebrow')}</div><h2>{t(`eg.topic.${e.topic}.title` as Key)}</h2></div>
        <span className="pill">{t(e.user === 'w' ? 'eg.side.w' : 'eg.side.b')}</span></div>
      <div className="board-wrap"><Board chess={chess} orientation={e.user} selected={input.selected} legal={input.legal} lastMove={last} hint={hint?.from ?? null}
        onSquareClick={input.onSquare} readOnly={!myTurn} /></div>
      {input.promo && <PromoPicker color={e.user} onPick={input.pickPromo} onCancel={input.cancelPromo} />}
      <div className="board-message" role="status" data-testid="eg-status"><span className="pulse" /> {status}</div>
      {hint && <div className="board-message" data-testid="eg-hint" data-uci={hint.uci}>{t('eg.hint.text', { san: hint.san })}</div>}
      <div className="action-bar">
        <button className="btn" disabled={!myTurn || hintBusy} onClick={() => void askHint()} data-testid="eg-hint-btn"><Icon name="hint" size={16} />{t('eg.btn.hint')}</button>
        <button className="btn" onClick={() => setRun(r => r + 1)} data-testid="eg-restart"><Icon name="refresh" size={16} />{t('eg.btn.restart')}</button>
        {verdict === 'solved' && nxt && nxt.id !== e.id && <button className="btn primary" onClick={() => navigate('endgames', nxt.id)} data-testid="eg-next"><Icon name="arrowRight" size={16} />{t('eg.btn.next')}</button>}
      </div>
    </section>
    <section className="panel online-side">
        <div className="panel-head"><div><h3>{t(`eg.topic.${e.topic}.title` as Key)}</h3></div><span className="pill">{t(`eg.level.${e.level}` as Key)}</span></div>
        <p data-testid="eg-goal"><b>{t(e.goal === 'win' ? 'eg.goal.win' : 'eg.goal.draw', { n: HOLD_MOVES })}</b></p>
        <p className="muted">{t(`eg.topic.${e.topic}.text` as Key)}</p>
        <div className="field-label">{t('eg.positions')}</div>
        <div className="chips">{list.map((x, i) => <a key={x.id} className={`chip ${x.id === e.id ? 'active' : ''}`} href={hrefFor('endgames', x.id)} data-testid={`eg-chip-${x.id}`} data-solved={!!progress.solved[x.id]}>
          {i + 1}{progress.solved[x.id] ? ' ✓' : ''}</a>)}</div>
        <p className="muted"><small>{t('eg.verified')}</small></p>
        <a className="btn" href={hrefFor('endgames')} data-testid="eg-back"><Icon name="arrowLeft" size={16} />{t('eg.btn.all')}</a>
      </section>
  </div>
}
