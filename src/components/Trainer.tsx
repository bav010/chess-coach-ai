import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import { analysisEngine } from '../engine'
import { getCached, putCache } from '../lib/analysisCache'
import { winLoss, type Thresholds } from '../lib/classify'
import { formatScore, forColor } from '../lib/eval'
import { splitUci } from '../lib/game'
import { PIECE_NAME, colorGen } from '../lib/glyphs'
import { criticalMoves, positionScore, type ReviewReport } from '../lib/review'
import { explainMove } from '../lib/explain'
import type { TrainerEntry } from '../storage'
import type { ArrowStyle } from './Board'
import Board from './Board'
import PromoPicker from './PromoPicker'

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
  const [message, setMessage] = useState('')
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
    setMessage(item ? `Найдите лучший ход за ${colorGen(item.record.color)}. В партии здесь был сыгран ${item.record.san}.` : '')
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, side])

  function update(patch: Partial<TrainerEntry>) {
    const next = { ...(progressRef.current[key] ?? EMPTY), ...patch }
    onProgress({ ...progressRef.current, [key]: next })
  }

  if (!item) {
    return <section className="panel trainer-panel" data-testid="trainer">
      <div className="panel-head"><div><div className="eyebrow">ТРЕНАЖЁР</div><h2>Работа над ошибками</h2></div></div>
      <p className="muted">Для выбранной стороны ошибок не найдено.</p>
      <div className="board-actions">
        {userColor && side !== 'both' && <button className="btn" onClick={() => setSide('both')}>Показать ошибки обеих сторон</button>}
        <button className="btn primary" onClick={onExit}>Вернуться к партии</button>
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
      setMessage(firstTry ? 'Верно! Это лучший ход — с первой попытки.' : 'Верно! Это лучший ход.')
      return
    }
    if (uci === item!.record.uci) {
      update({ attempts })
      setPhase('wrong')
      setMessage(`Это тот же ход, что был сыгран в партии (${item!.record.san}). Попробуйте другой.`)
      return
    }
    setPhase('checking'); setMessage('Проверяю ход движком…')
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
          setPhase('try'); setMessage('Движок недоступен — не удалось проверить ход.')
          return
        }
      }
    }
    const score = positionScore(afterFen, ev)
    if (!score) { setPhase('try'); setMessage('Не удалось оценить ход.'); return }
    const loss = winLoss(item!.before, score, mover)
    const san = board.history()[0]
    if (loss < thresholds.inaccuracy) {
      update({ attempts, solved: true, firstTry: entry.solved ? entry.firstTry : firstTry })
      setPhase('solved'); setShownFen(item!.record.fenBefore)
      setMessage(`Хороший ход: ${san} почти не хуже лучшего (потеря ${loss.toFixed(1)} п. п.). Лучший по движку — ${item!.bestSan ?? '—'}.`)
    } else {
      update({ attempts })
      setPhase('wrong')
      setMessage(`Не лучший ход: ${san} — оценка для ${colorGen(mover)} ${formatScore(forColor(score, mover))}, потеря около ${loss.toFixed(0)} п. п. Попробуйте ещё раз или возьмите подсказку.`)
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
    setMessage(`Найдите лучший ход за ${colorGen(mover)}.`)
  }

  function hint() {
    const level = Math.min(2, hintLevel + 1)
    setHintLevel(level)
    update({ hints: entry.hints + 1 })
    if (phase === 'wrong') retry()
    if (level === 1) setMessage('Подсказка: ходить нужно подсвеченной фигурой.')
    else if (bestFrom) {
      const piece = new Chess(item!.record.fenBefore).get(bestFrom.from)
      setMessage(`Подсказка: ходит ${piece ? PIECE_NAME[piece.type] : 'фигура'} с ${bestFrom.from}.`)
    }
  }

  function reveal() {
    update({ revealed: true })
    setPhase('revealed'); setShownFen(item!.record.fenBefore); setSelected(null); setLegal([]); setPromo(null)
    setMessage(`Лучший ход: ${item!.bestSan ?? '—'}.`)
  }

  const go = (d: number) => setIdx(i => Math.max(0, Math.min(list.length - 1, i + d)))
  const i = Math.min(idx, list.length - 1)

  return <section className="panel trainer-panel" data-testid="trainer">
    <div className="panel-head"><div><div className="eyebrow">ТРЕНАЖЁР</div><h2>Работа над ошибками</h2></div>
      <span className="pill">{i + 1} из {list.length}</span></div>
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
          {phase === 'wrong' && <button className="btn primary" onClick={retry}>Повторить</button>}
          {!revealedNow && <button className="btn" onClick={hint} disabled={hintLevel >= 2 || phase === 'checking'}>Подсказка</button>}
          {!revealedNow && <button className="btn" onClick={reveal} disabled={phase === 'checking'}>Показать лучший ход</button>}
          {revealedNow && <button className="btn" onClick={() => { setPhase('try'); setShownFen(item.record.fenBefore); setHintLevel(0); setMessage(`Найдите лучший ход за ${colorGen(mover)}.`) }}>Решить ещё раз</button>}
        </div>
        {revealedNow && <div className="explain-box" data-testid="trainer-solution">
          <p><b>Лучший ход: {item.bestSan ?? '—'}</b>{item.pvSan.length > 1 ? ` · вариант: ${item.pvSan.join(' ')}` : ''}</p>
          <ul>{explainMove(item).map((l, k) => <li key={k}>{l}</li>)}</ul>
        </div>}
        <div className="board-actions">
          <button className="btn" onClick={() => go(-1)} disabled={i === 0}>← Предыдущая</button>
          <button className="btn primary" onClick={() => go(1)} disabled={i >= list.length - 1}>Следующая →</button>
        </div>
        <div className="trainer-stats" data-testid="trainer-stats">
          <div><strong>{stats.solved}/{list.length}</strong><small>решено</small></div>
          <div><strong>{stats.first}</strong><small>с первой попытки</small></div>
          <div><strong>{stats.hints}</strong><small>подсказок</small></div>
          <div><strong>{stats.repeat.length}</strong><small>повторить</small></div>
        </div>
        {userColor && <div className="board-actions">
          <button className={`btn ${side === userColor ? 'active' : ''}`} onClick={() => { setSide(userColor); setIdx(0) }}>Мои ошибки</button>
          <button className={`btn ${side === 'both' ? 'active' : ''}`} onClick={() => { setSide('both'); setIdx(0) }}>Все ошибки</button>
        </div>}
        <button className="btn full" onClick={onExit}>↩ Вернуться к исходной партии</button>
      </div>
    </div>
  </section>
}
