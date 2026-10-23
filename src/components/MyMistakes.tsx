import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import Board from './Board'
import Icon from './Icon'
import PromoPicker from './PromoPicker'
import { splitUci } from '../lib/game'
import { markActive } from '../lib/activity'
import { backfillFromReviews, countMistakes, gradeMistake, loadMistakes, planMistakes, saveMistakes, type MistakeItem, type MistakeStore } from '../lib/mistakes'
import { hrefFor } from '../lib/route'
import { t, tn, useI18n } from '../i18n'

type Status = 'solving' | 'solved' | 'shown'
type Msg = { kind: 'info' | 'ok' | 'bad'; text: () => string }
const SESSION = 15

/** Личные задачи: позиции из ваших разобранных партий, где был ошибочный ход. Нужно найти лучший ход движка. */
export default function MyMistakes({ active }: { active: boolean }) {
  const { lang } = useI18n()
  const [store, setStore] = useState<MistakeStore>(() => backfillFromReviews(loadMistakes()))
  const [queue, setQueue] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  const [status, setStatus] = useState<Status>('solving')
  const [msg, setMsg] = useState<Msg>({ kind: 'info', text: () => '' })
  const [selected, setSelected] = useState<Square | null>(null)
  const [legal, setLegal] = useState<Square[]>([])
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [fen, setFen] = useState<string | null>(null)
  const [wrongTries, setWrongTries] = useState(0)
  const graded = useRef(false)
  const storeRef = useRef(store); storeRef.current = store

  useEffect(() => { saveMistakes(store) }, [store])
  // новая сессия при открытии вкладки: просроченные и свежие ошибки
  useEffect(() => {
    if (!active) return
    const fresh = backfillFromReviews(storeRef.current)
    if (fresh !== storeRef.current) setStore(fresh)
    const q = planMistakes(fresh, Date.now(), SESSION).map(m => m.id)
    setQueue(q); setIdx(0)
  }, [active])

  const item: MistakeItem | null = queue[idx] ? store.items[queue[idx]] ?? null : null
  const chess = useMemo(() => (item ? new Chess(item.fen) : null), [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!item) return
    setStatus('solving'); setSelected(null); setLegal([]); setPromo(null); setFen(item.fen); setWrongTries(0); graded.current = false
    setMsg({ kind: 'info', text: () => t('puzzles.mine.task', { who: t(item.color === 'w' ? 'puzzles.task.white' : 'puzzles.task.black') }) })
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => countMistakes(store, Date.now()), [store, queue, idx, status])

  function grade(ok: boolean) {
    if (!item || graded.current) return
    graded.current = true
    setStore(s => gradeMistake(s, item.id, ok, Date.now()))
    markActive()
  }

  const canMove = !!item && status === 'solving'
  function onSquare(sq: Square) {
    if (!canMove || !chess || !item) return
    const piece = chess.get(sq)
    if (selected && legal.includes(sq)) {
      const mover = chess.get(selected)
      if (mover?.type === 'p' && (sq[1] === '8' || sq[1] === '1')) { setPromo({ from: selected, to: sq }); return }
      attempt(`${selected}${sq}`)
      return
    }
    if (piece && piece.color === item.color) { setSelected(sq); setLegal(chess.moves({ square: sq, verbose: true }).map(m => m.to)) }
    else { setSelected(null); setLegal([]) }
  }

  function attempt(uci: string) {
    if (!item) return
    setSelected(null); setLegal([]); setPromo(null)
    if (uci === item.bestUci) {
      grade(wrongTries === 0)
      const c = new Chess(item.fen); c.move(splitUci(uci)); setFen(c.fen())
      setStatus('solved')
      setMsg({ kind: 'ok', text: () => t(wrongTries === 0 ? 'puzzles.mine.right' : 'puzzles.mine.rightLate', { best: item.bestSan, played: item.playedSan, loss: item.loss }) })
    } else {
      grade(false); setWrongTries(n => n + 1)
      setMsg({ kind: 'bad', text: () => t('puzzles.mine.notTop') })
    }
  }

  function showAnswer() {
    if (!item) return
    grade(false)
    const c = new Chess(item.fen); c.move(splitUci(item.bestUci)); setFen(c.fen())
    setStatus('shown')
    setMsg({ kind: 'info', text: () => t('puzzles.mine.answer', { best: item.bestSan, played: item.playedSan, loss: item.loss }) })
  }

  function next() { setIdx(i => i + 1) }

  const board = fen ? new Chess(fen) : chess
  const last = status !== 'solving' && item ? (() => { const u = splitUci(item.bestUci); return { from: u.from as Square, to: u.to as Square } })() : null
  const finished = queue.length > 0 && idx >= queue.length
  const stateKey = lang // подписи пересчитываются при смене языка

  return <div className="main-grid" data-testid="mine-view" data-lang={stateKey}>
    <section className="panel board-panel puzzle-panel">
      <div className="panel-head">
        <div><div className="eyebrow">{t('puzzles.mine.eyebrow')}</div><h2>{t('puzzles.mine.title')}</h2></div>
        {queue.length > 0 && !finished && <span className="pill" data-testid="mine-progress">{idx + 1} / {queue.length}</span>}
      </div>
      {item && board
        ? <>
          <div className="puzzle-task" data-testid="mine-task">{t('puzzles.mine.task', { who: t(item.color === 'w' ? 'puzzles.task.white' : 'puzzles.task.black') })}</div>
          <div className="board-wrap">
            <Board chess={board} orientation={item.color} selected={selected} legal={legal} lastMove={last} onSquareClick={onSquare} readOnly={!canMove} />
          </div>
          {promo && <PromoPicker color={item.color} onPick={p => attempt(`${promo.from}${promo.to}${p}`)} onCancel={() => { setPromo(null); setSelected(null); setLegal([]) }} />}
          <div className={`puzzle-msg ${msg.kind}`} data-testid="mine-message" role="status"><span className="pulse" /> {msg.text()}</div>
          <div className="action-bar puzzle-actions">
            {status === 'solving'
              ? <button className="btn quiet" onClick={showAnswer} data-testid="mine-answer"><Icon name="eye" size={16} />{t('puzzles.mine.showAnswer')}</button>
              : <button className="btn primary" onClick={next} data-testid="mine-next"><Icon name="arrowRight" size={16} />{idx + 1 >= queue.length ? t('puzzles.mine.finish') : t('puzzles.btn.next')}</button>}
          </div>
        </>
        : <div className="empty-state" data-testid="mine-empty">
          <span>♞</span>
          {counts.total === 0
            ? <><p>{t('puzzles.mine.none.title')}</p><small>{t('puzzles.mine.none.text')}</small>
              <a className="btn primary big" href={hrefFor('analysis')} data-testid="mine-to-analysis"><Icon name="analysis" size={18} />{t('puzzles.mine.none.cta')}</a></>
            : <><p>{finished ? t('puzzles.mine.done.title') : t('puzzles.mine.idle.title')}</p><small>{finished ? t('puzzles.mine.done.text') : t('puzzles.mine.idle.text')}</small>
              <button className="btn primary big" onClick={() => { setQueue(planMistakes(store, Date.now(), SESSION).map(m => m.id)); setIdx(0) }} data-testid="mine-again" disabled={planMistakes(store, Date.now(), 1).length === 0}><Icon name="refresh" size={18} />{t('puzzles.mine.again')}</button></>}
        </div>}
    </section>
    <aside className="right-column">
      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">{t('puzzles.mine.stats.eyebrow')}</div><h2>{t('puzzles.mine.stats.title')}</h2></div></div>
        <div className="stats">
          <div><strong data-testid="mine-total">{counts.total}</strong><small>{t('puzzles.mine.stats.total')}</small></div>
          <div><strong data-testid="mine-due">{counts.due + counts.fresh}</strong><small>{t('puzzles.mine.stats.due')}</small></div>
          <div><strong data-testid="mine-learned">{counts.learned}</strong><small>{t('puzzles.mine.stats.learned')}</small></div>
        </div>
        <p className="progress-note">{t('puzzles.mine.note')}</p>
        <p className="tiny">{tn('puzzles.mine.basis', counts.total)}</p>
      </section>
    </aside>
  </div>
}
