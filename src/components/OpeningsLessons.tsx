import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import Board, { type ArrowSpec } from './Board'
import PromoPicker from './PromoPicker'
import { useBoardInput } from '../hooks/useBoardInput'
import { useI18n } from '../i18n'
import { LESSONS, compileLesson, type Lesson } from '../lib/lessons'
import { lessonRepName } from '../lib/lessonSync'
import { splitUci } from '../lib/game'
import type { OpeningsData } from '../lib/openingsStore'
import Icon from './Icon'

type Props = { data: OpeningsData; update: (fn: (d: OpeningsData) => OpeningsData) => void; active: boolean; onLesson?: (title: string | null) => void; leaveKey?: number }

/** Сообщение хранится структурой (а не текстом), чтобы при смене языка пересобираться на новом языке. */
type Msg = { kind: 'info' | 'ok' | 'bad'; ref: { k: 'none' } | { k: 'intro' } | { k: 'outro' } | { k: 'step'; i: number; ok: boolean } | { k: 'wrong'; i: number } }

const WHITE_ARROW = '#d3ff72'
const BLACK_ARROW = '#ffb066'

/** Уроки дебютов: ходите за свою сторону, соперник отвечает, а после каждого хода — объяснение «почему так». */
export default function OpeningsLessons({ data, update, active, onLesson, leaveKey = 0 }: Props) {
  const { t, tn, lang } = useI18n()
  const [lessonId, setLessonId] = useState<string | null>(null)
  const lesson = LESSONS.find(l => l.id === lessonId) ?? null
  const steps = useMemo(() => (lesson ? compileLesson(lesson) : []), [lesson, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  const [idx, setIdx] = useState(0)
  const [showHint, setShowHint] = useState(true)
  const [forced, setForced] = useState(false)
  const [msg, setMsg] = useState<Msg>({ kind: 'info', ref: { k: 'none' } })
  const [mistakes, setMistakes] = useState(0)
  const [styleF, setStyleF] = useState<'all' | 'attack' | 'defense'>('all')
  const [sideF, setSideF] = useState<'all' | Color>('all')
  const countedRef = useRef(false)
  const logRef = useRef<HTMLOListElement>(null)
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight }, [idx])

  const chess = useMemo(() => {
    const c = new Chess()
    for (let i = 0; i < idx; i++) c.move(splitUci(steps[i].uci))
    return c
  }, [idx, steps])

  const finished = !!lesson && idx >= steps.length
  const next = lesson && !finished ? steps[idx] : null
  const userTurn = !!next && next.mover === lesson!.side
  const orientation: Color = lesson?.side ?? 'w'
  const input = useBoardInput(chess, userTurn ? lesson!.side : null, onUserMove)

  function open(l: Lesson, hints = true) {
    setShowHint(hints)
    setLessonId(l.id); setIdx(0); setMistakes(0); setForced(false); countedRef.current = false
    setMsg({ kind: 'info', ref: { k: 'intro' } })
    input.clear()
  }

  function close() { setLessonId(null); setIdx(0); input.clear() }
  useEffect(() => { onLesson?.(lesson?.title ?? null) }, [lesson, onLesson])
  useEffect(() => { if (leaveKey > 0) close() }, [leaveKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ответ соперника
  useEffect(() => {
    if (!active || !lesson || !next || userTurn) return
    const t = window.setTimeout(() => {
      setIdx(i => i + 1)
      setMsg({ kind: 'info', ref: { k: 'step', i: idx, ok: false } })
    }, idx === 0 ? 400 : 900)
    return () => clearTimeout(t)
  }, [active, lesson, next, userTurn, idx])

  // завершение урока
  useEffect(() => {
    if (!lesson || !finished || countedRef.current) return
    countedRef.current = true
    update(d => {
      const cur = d.lessons[lesson.id] ?? { done: false, runs: 0, mistakes: 0 }
      return { ...d, lessons: { ...d.lessons, [lesson.id]: { done: true, runs: cur.runs + 1, mistakes: cur.mistakes + mistakes } } }
    })
    setMsg({ kind: 'ok', ref: { k: 'outro' } })
  }, [lesson, finished, mistakes, update])

  function onUserMove(uci: string) {
    if (!next) return
    if (uci === next.uci) {
      setIdx(i => i + 1); setForced(false)
      setMsg({ kind: 'ok', ref: { k: 'step', i: idx, ok: true } })
    } else {
      setMistakes(m => m + 1); setForced(true)
      setMsg({ kind: 'bad', ref: { k: 'wrong', i: idx } })
    }
  }

  const stepText = (i: number, ok: boolean) => { const st = steps[i]; return st ? `${ok ? '✓ ' : ''}${st.no}${st.mover === 'w' ? '.' : '…'} ${st.san} — ${st.why}` : '' }
  const msgText = !lesson ? '' : msg.ref.k === 'intro' ? lesson.intro : msg.ref.k === 'outro' ? lesson.outro
    : msg.ref.k === 'step' ? stepText(msg.ref.i, msg.ref.ok) : msg.ref.k === 'wrong' ? t('openings.lessons.wrongMove', { san: steps[msg.ref.i]?.san ?? '' }) : ''
  const lastRec = idx > 0 && steps[idx - 1] ? splitUci(steps[idx - 1].uci) : null
  const arrows: ArrowSpec[] = next && userTurn && (showHint || forced)
    ? [{ from: splitUci(next.uci).from as Square, to: splitUci(next.uci).to as Square, rank: 0, label: '★', color: next.mover === 'w' ? WHITE_ARROW : BLACK_ARROW }]
    : []

  if (!lesson) {
    const done = LESSONS.filter(l => data.lessons[l.id]?.done).length
    const visible = LESSONS.filter(l => (styleF === 'all' || l.style === styleF) && (sideF === 'all' || l.side === sideF))
    const groups = [
      { key: 'attack', title: t('openings.lessons.group.attack.title'), text: t('openings.lessons.group.attack.text'), items: visible.filter(l => l.style === 'attack') },
      { key: 'defense', title: t('openings.lessons.group.defense.title'), text: t('openings.lessons.group.defense.text'), items: visible.filter(l => l.style === 'defense') },
    ]
    return <div data-testid="lessons-list">
      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">{t('openings.lessons.eyebrow')}</div><h2>{t('openings.lessons.pick')}</h2></div><span className="pill" data-testid="lessons-progress">{t('openings.lessons.progress', { done, total: LESSONS.length })}</span></div>
        <p className="muted">{t('openings.lessons.intro')}</p>
        <div className="filter-row"><div className="filter-block"><div className="sub-head">{t('openings.lessons.style')}</div><div className="chips">
          {(['all', 'attack', 'defense'] as const).map(k => <button key={k} className={`chip ${styleF === k ? 'active' : ''}`} onClick={() => setStyleF(k)} data-testid={`style-${k}`}>{t(`openings.lessons.style.${k}`)}</button>)}
          </div></div>
          <div className="filter-block"><div className="sub-head">{t('openings.lessons.sideLabel')}</div><div className="chips">
          {(['all', 'w', 'b'] as const).map(k => <button key={k} className={`chip ${sideF === k ? 'active' : ''}`} onClick={() => setSideF(k)} data-testid={`side-filter-${k}`}>{t(`openings.lessons.side.${k}`)}</button>)}
          </div></div></div>
        {visible.length === 0 && <p className="muted" style={{ marginTop: 14 }}>{t('openings.lessons.none')}</p>}
        {groups.filter(g => g.items.length > 0).map(g => <div key={g.key} className="lesson-group" data-testid={`group-${g.key}`}>
          <h3>{g.title} <span className="pill">{g.items.length}</span></h3>
          <p className="tiny">{g.text}</p>
          <div className="lesson-grid">
            {g.items.map(l => {
              const pr = data.lessons[l.id]
              return <div key={l.id} className={`lesson-card ${pr?.done ? 'done' : ''}`}>
                <button className="lesson-open" onClick={() => open(l)} data-testid={`lesson-${l.id}`}>
                  <span className="eco">{l.eco}</span>
                  <b>{l.title}</b>
                  <span className="lesson-meta"><Icon name={l.side === 'w' ? 'discW' : 'discB'} size={12} className="side-dot" />{l.side === 'w' ? t('openings.lessons.forWhite') : t('openings.lessons.forBlack')} · {t(`openings.lessons.level.${l.level}`)} · {tn('openings.lessons.moves', Math.ceil(l.steps.length / 2))}</span>
                  <span className="lesson-intro">{l.intro}</span>
                </button>
                {pr?.done && <div className="lesson-done"><em>{t('openings.lessons.doneRuns', { n: pr.runs })}</em>
                  <button className="btn" onClick={() => open(l, false)} data-testid={`repeat-${l.id}`}>{t('openings.lessons.repeatNoHints')}</button></div>}
              </div>
            })}
          </div>
        </div>)}
      </section>
    </div>
  }

  const log = steps.slice(0, idx)
  const lastEntry = log[log.length - 1]
  return <div className="main-grid" data-testid="lesson-view">
    <section className="panel board-panel" data-testid="lesson-board">
      <div className="panel-head"><div><div className="eyebrow">{t('openings.lessons.lessonEyebrow', { eco: lesson.eco })}</div><h2>{lesson.title}</h2></div>
        <span className="pill">{lesson.side === 'w' ? t('openings.lessons.youWhite') : t('openings.lessons.youBlack')}</span></div>
      <div className="puzzle-task" data-testid="lesson-progress">
        {finished ? t('openings.lessons.finished') : userTurn ? t('openings.lessons.yourMove', { n: Math.min(idx + 1, steps.length), total: steps.length }) : t('openings.lessons.opponent')}
      </div>
      <div className="board-wrap">
        <Board chess={chess} orientation={orientation} selected={input.selected} legal={input.legal}
          lastMove={lastRec ? { from: lastRec.from as Square, to: lastRec.to as Square } : null}
          arrows={arrows} onSquareClick={input.onSquare} readOnly={!userTurn} />
      </div>
      {input.promo && <PromoPicker color={lesson.side} onPick={input.pickPromo} onCancel={input.cancelPromo} />}
      <div className={`puzzle-msg lesson-msg ${msg.kind}`} data-testid="lesson-message" role="status"><span className="pulse" /> {msgText}</div>
      {finished && <p className="tiny" data-testid="lesson-info">{t('openings.lessons.counted', { name: lessonRepName(lesson.side) })}</p>}
      <div className="action-bar">
        {finished && <button className="btn primary" onClick={() => open(lesson)} data-testid="lesson-again"><Icon name="refresh" size={16} />{t('openings.lessons.again')}</button>}
        <label className="switch-chip"><input type="checkbox" checked={showHint} onChange={e => setShowHint(e.target.checked)} data-testid="lesson-hint-toggle" /><Icon name="hint" size={16} /><span>{t('openings.lessons.hintToggle')}</span></label>
        <button className="btn quiet" onClick={close} data-testid="lesson-close"><Icon name="arrowLeft" size={16} />{t('openings.lessons.back')}</button>
      </div>
    </section>

    <aside className="right-column">
      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">{t('openings.lessons.logEyebrow')}</div><h2>{t('openings.lessons.logTitle')}</h2></div><span className="pill">{t('openings.lessons.mistakes', { n: mistakes })}</span></div>
        {log.length === 0 && <p className="muted">{lesson.intro}</p>}
        <ol className="lesson-log" data-testid="lesson-log" ref={logRef}>
          {log.map((s, i) => <li key={i} className={`${s.mover === lesson.side ? 'mine' : 'opp'} ${s === lastEntry ? 'last' : ''}`}>
            <b>{s.no}{s.mover === 'w' ? '.' : '…'} {s.san}</b><span>{s.why}</span>
          </li>)}
        </ol>
      </section>
    </aside>
  </div>
}
