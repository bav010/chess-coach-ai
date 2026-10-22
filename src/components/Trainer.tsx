import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import { analysisEngine } from '../engine'
import { getCached, putCache } from '../lib/analysisCache'
import { winLoss, type Thresholds } from '../lib/classify'
import { formatScore, forColor } from '../lib/eval'
import { splitUci } from '../lib/game'
import { colorGen } from '../lib/glyphs'
import { criticalMoves, positionScore, type ReviewReport } from '../lib/review'
import { explainMove } from '../lib/explain'
import type { TrainerEntry } from '../storage'
import type { ArrowStyle } from './Board'
import Board from './Board'
import PromoPicker from './PromoPicker'
import { t as tg, useI18n, type Key, type Params } from '../i18n'
import Icon from './Icon'

/** Сообщение хранится как ключ + параметры и переводится при показе — смена языка обновляет его на месте. */
type Msg = { k: Key; p?: Params } | null
/** colorKey ('w'/'b') и pieceKey (тип фигуры) превращаются в слова на текущем языке в момент показа. */
function resolveParams(p?: Params): Params | undefined {
  if (!p) return p
  const { colorKey, pieceKey, ...rest } = p
  const out: Params = { ...rest }
  if (colorKey !== undefined) out.color = colorGen(colorKey as Color)
  if (pieceKey !== undefined) out.piece = tg(`analysis.piece.${pieceKey}` as Key)
  return out
}

type Props = {
  report: ReviewReport
  userColor: Color | null
  thresholds: Thresholds
  progress: Record<string, TrainerEntry>
  initialSide: Color | 'both'
  arrowStyle: ArrowStyle
  onProgress: (p: Record<string, TrainerEntry>) => void
  onExit: () => void
}

type Phase = 'try' | 'checking' | 'wrong' | 'solved' | 'revealed'

const EMPTY: TrainerEntry = { attempts: 0, solved: false, firstTry: false, hints: 0, revealed: false }

/**
 * Интерактивная работа над ошибками. Работает на отдельной временной позиции и не трогает исходную партию:
 * все ходы здесь — пробы, а проверяет их Stockfish (или сохранённая оценка лучшего хода).
 */
export default function Trainer({ report, userColor, thresholds, progress, initialSide, arrowStyle, onProgress, onExit }: Props) {
  const { t } = useI18n()
  const [side, setSide] = useState<Color | 'both'>(initialSide)
  const list = useMemo(() => criticalMoves(report, side), [report, side])
  const [idx, setIdx] = useState(0)
  const item = list[Math.min(idx, list.length - 1)] ?? null
  const key = item ? String(item.ply) : ''
  const entry = progress[key] ?? EMPTY

  const [phase, setPhase] = useState<Phase>('try')
  const [shownFen, setShownFen] = useState('')
  const [selected, setSelected] = useState<Square | null>(null)
  const [legal, setLegal] = useState<Square[]>([])
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [msg, setMessage] = useState<Msg>(null)
  const message = msg ? t(msg.k, resolveParams(msg.p)) : ''
  const [hintLevel, setHintLevel] = useState(0)
  const progressRef = useRef(progress)
  progressRef.current = progress
  const abortRef = useRef<AbortController | null>(null)

  // Сброс состояния при смене позиции для тренировки
  useEffect(() => {
    abortRef.current?.abort()
    setPhase(progressRef.current[key]?.solved || progressRef.current[key]?.revealed ? 'solved' : 'try')
    setShownFen(item?.record.fenBefore ?? '')
    setSelected(null); setLegal([]); setPromo(null); setHintLevel(0)
    setMessage(item ? { k: 'analysis.trainer.find', p: { colorKey: item.record.color, san: item.record.san } } : null)
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, side])

  function update(patch: Partial<TrainerEntry>) {
    const next = { ...(progressRef.current[key] ?? EMPTY), ...patch }
    onProgress({ ...progressRef.current, [key]: next })
  }

  if (!item) {
    return <section className="panel trainer-panel" data-testid="trainer">
      <div className="panel-head"><div><div className="eyebrow">{t('analysis.trainer.eyebrow')}</div><h2>{t('analysis.trainer.title')}</h2></div></div>
      <p className="muted">{t('analysis.trainer.none')}</p>
      <div className="board-actions">
        {userColor && side !== 'both' && <button className="btn" onClick={() => setSide('both')}>{t('analysis.trainer.showBoth')}</button>}
        <button className="btn primary" onClick={onExit}>{t('analysis.trainer.backToGame')}</button>
      </div>
    </section>
  }

  const mover = item.record.color
  const chess = new Chess(shownFen || item.record.fenBefore)
  const revealedNow = phase === 'solved' || phase === 'revealed'
  const bestFrom = item.bestUci ? splitUci(item.bestUci) : null
  const arrows = revealedNow && bestFrom ? [{ from: bestFrom.from, to: bestFrom.to, rank: 0 }] : []
  const hintSquare = hintLevel >= 1 && !revealedNow && bestFrom ? bestFrom.from : null

  const stats = list.reduce((s, m) => {
    const e = progress[String(m.ply)]
    if (e?.solved) s.solved++
    if (e?.solved && e.firstTry) s.first++
    s.hints += e?.hints ?? 0
    if (e && (e.revealed || (e.attempts > 0 && !e.firstTry))) s.repeat.push(m.ply)
    return s
  }, { solved: 0, first: 0, hints: 0, repeat: [] as number[] })

  async function attempt(uci: string) {
    const from = splitUci(uci).from
    const board = new Chess(item!.record.fenBefore)
    let afterFen: string
    try { board.move(splitUci(uci)); afterFen = board.fen() } catch { return }
    setShownFen(afterFen)
    setSelected(null); setLegal([]); setPromo(null)
    const attempts = entry.attempts + 1
    const firstTry = attempts === 1

    if (uci === item!.bestUci) {
      update({ attempts, solved: true, firstTry: entry.solved ? entry.firstTry : firstTry })
      setPhase('solved'); setShownFen(item!.record.fenBefore)
      setMessage({ k: firstTry ? 'analysis.trainer.correctFirst' : 'analysis.trainer.correct' })
      return
    }
    if (uci === item!.record.uci) {
      update({ attempts })
      setPhase('wrong')
      setMessage({ k: 'analysis.trainer.same', p: { san: item!.record.san } })
      return
    }
    setPhase('checking'); setMessage({ k: 'analysis.trainer.checking' })
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    let ev = null as { depth: number; lines: NonNullable<ReturnType<typeof getCached>>['lines'] } | null
    const cached = getCached(afterFen, 1, 800)
    if (cached) ev = { depth: cached.depth, lines: cached.lines }
    else {
      const terminal = new Chess(afterFen)
      if (!(terminal.isCheckmate() || terminal.isStalemate() || terminal.isInsufficientMaterial())) {
        try {
          const a = await analysisEngine.analyse(afterFen, { depth: 14, movetime: 800, multipv: 1, signal: ac.signal })
          if (ac.signal.aborted) return
          putCache(afterFen, a, 1, 800, true)
          ev = a.lines.length ? { depth: a.depth, lines: a.lines } : null
        } catch {
          if (ac.signal.aborted) return
          setPhase('try'); setMessage({ k: 'analysis.trainer.noEngine' })
          return
        }
      }
    }
    const score = positionScore(afterFen, ev)
    if (!score) { setPhase('try'); setMessage({ k: 'analysis.trainer.cantEval' }); return }
    const loss = winLoss(item!.before, score, mover)
    const san = board.history()[0]
    if (loss < thresholds.inaccuracy) {
      update({ attempts, solved: true, firstTry: entry.solved ? entry.firstTry : firstTry })
      setPhase('solved'); setShownFen(item!.record.fenBefore)
      setMessage({ k: 'analysis.trainer.goodMove', p: { san, loss: loss.toFixed(1), best: item!.bestSan ?? '—' } })
    } else {
      update({ attempts })
      setPhase('wrong')
      setMessage({ k: 'analysis.trainer.notBest', p: { san, colorKey: mover, score: formatScore(forColor(score, mover)), loss: loss.toFixed(0) } })
    }
  }

  function onSquare(sq: Square) {
    if (phase === 'checking' || revealedNow || promo) return
    const board = new Chess(item!.record.fenBefore)
    if (phase === 'wrong') return
    const piece = board.get(sq)
    if (selected && legal.includes(sq)) {
      const p = board.get(selected)
      if (p?.type === 'p' && (sq[1] === '8' || sq[1] === '1')) { setPromo({ from: selected, to: sq }); return }
      void attempt(`${selected}${sq}`)
      return
    }
    if (piece && piece.color === mover) {
      setSelected(sq)
      setLegal(board.moves({ square: sq, verbose: true }).map(m => m.to))
    } else { setSelected(null); setLegal([]) }
  }

  function retry() {
    setPhase('try'); setShownFen(item!.record.fenBefore); setSelected(null); setLegal([])
    setMessage({ k: 'analysis.trainer.findShort', p: { colorKey: mover } })
  }

  function hint() {
    const level = Math.min(2, hintLevel + 1)
    setHintLevel(level)
    update({ hints: entry.hints + 1 })
    if (phase === 'wrong') retry()
    if (level === 1) setMessage({ k: 'analysis.trainer.hint1' })
    else if (bestFrom) {
      const piece = new Chess(item!.record.fenBefore).get(bestFrom.from)
      setMessage({ k: 'analysis.trainer.hint2', p: { pieceKey: piece ? piece.type : 'generic', sq: bestFrom.from } })
    }
  }

  function reveal() {
    update({ revealed: true })
    setPhase('revealed'); setShownFen(item!.record.fenBefore); setSelected(null); setLegal([]); setPromo(null)
    setMessage({ k: 'analysis.trainer.revealed', p: { san: item!.bestSan ?? '—' } })
  }

  const go = (d: number) => setIdx(i => Math.max(0, Math.min(list.length - 1, i + d)))
  const i = Math.min(idx, list.length - 1)

  return <section className="panel trainer-panel" data-testid="trainer">
    <div className="panel-head"><div><div className="eyebrow">{t('analysis.trainer.eyebrow')}</div><h2>{t('analysis.trainer.title')}</h2></div>
      <span className="pill">{t('analysis.trainer.of', { i: i + 1, n: list.length })}</span></div>
    <div className="trainer-grid">
      <div>
        <div className="board-wrap">
          <Board chess={chess} orientation={mover} selected={selected} legal={legal} hint={hintSquare}
            arrows={arrows} arrowStyle={arrowStyle} onSquareClick={onSquare} readOnly={revealedNow || phase === 'checking'} />
        </div>
        {promo && <PromoPicker color={mover} onPick={p => void attempt(`${promo.from}${promo.to}${p}`)} onCancel={() => { setPromo(null); setSelected(null); setLegal([]) }} />}
      </div>
      <div className="trainer-side">
        <div className={`board-message trainer-message ${phase}`} data-testid="trainer-message" data-phase={phase}><span className="pulse" /> {message}</div>
        <div className="board-actions">
          {phase === 'wrong' && <button className="btn primary" onClick={retry}>{t('analysis.trainer.retry')}</button>}
          {!revealedNow && <button className="btn" onClick={hint} disabled={hintLevel >= 2 || phase === 'checking'}>{t('analysis.trainer.hint')}</button>}
          {!revealedNow && <button className="btn" onClick={reveal} disabled={phase === 'checking'}>{t('analysis.trainer.reveal')}</button>}
          {revealedNow && <button className="btn" onClick={() => { setPhase('try'); setShownFen(item.record.fenBefore); setHintLevel(0); setMessage({ k: 'analysis.trainer.findShort', p: { colorKey: mover } }) }}>{t('analysis.trainer.again')}</button>}
        </div>
        {revealedNow && <div className="explain-box" data-testid="trainer-solution">
          <p><b>{t('analysis.trainer.solution', { san: item.bestSan ?? '—' })}</b>{item.pvSan.length > 1 ? t('analysis.trainer.line', { pv: item.pvSan.join(' ') }) : ''}</p>
          <ul>{explainMove(item).map((l, k) => <li key={k}>{l}</li>)}</ul>
        </div>}
        <div className="board-actions">
          <button className="btn" onClick={() => go(-1)} disabled={i === 0}><Icon name="arrowLeft" size={16} />{t('analysis.trainer.prev')}</button>
          <button className="btn primary" onClick={() => go(1)} disabled={i >= list.length - 1}>{t('analysis.trainer.next')}<Icon name="arrowRight" size={16} /></button>
        </div>
        <div className="trainer-stats" data-testid="trainer-stats">
          <div><strong>{stats.solved}/{list.length}</strong><small>{t('analysis.trainer.solved')}</small></div>
          <div><strong>{stats.first}</strong><small>{t('analysis.trainer.first')}</small></div>
          <div><strong>{stats.hints}</strong><small>{t('analysis.trainer.hints')}</small></div>
          <div><strong>{stats.repeat.length}</strong><small>{t('analysis.trainer.repeat')}</small></div>
        </div>
        {userColor && <div className="board-actions">
          <button className={`btn ${side === userColor ? 'active' : ''}`} onClick={() => { setSide(userColor); setIdx(0) }}>{t('analysis.report.myMistakes')}</button>
          <button className={`btn ${side === 'both' ? 'active' : ''}`} onClick={() => { setSide('both'); setIdx(0) }}>{t('analysis.report.allMistakes')}</button>
        </div>}
        <button className="btn full" onClick={onExit}><Icon name="back" size={16} />{t('analysis.trainer.back')}</button>
      </div>
    </div>
  </section>
}
