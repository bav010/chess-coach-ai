import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import Board, { type ArrowSpec } from './Board'
import PromoPicker from './PromoPicker'
import { useBoardInput } from '../hooks/useBoardInput'
import { LESSONS, LEVEL_TEXT, compileLesson, lessonLine, type Lesson } from '../lib/lessons'
import { addLine, newRepertoire } from '../lib/repertoire'
import { splitUci } from '../lib/game'
import type { OpeningsData } from '../lib/openingsStore'

type Props = { data: OpeningsData; update: (fn: (d: OpeningsData) => OpeningsData) => void; active: boolean }

const WHITE_ARROW = '#d3ff72'
const BLACK_ARROW = '#ffb066'

/** Уроки дебютов: ходите за свою сторону, соперник отвечает, а после каждого хода — объяснение «почему так». */
export default function OpeningsLessons({ data, update, active }: Props) {
  const [lessonId, setLessonId] = useState<string | null>(null)
  const lesson = LESSONS.find(l => l.id === lessonId) ?? null
  const steps = useMemo(() => (lesson ? compileLesson(lesson) : []), [lesson])
  const [idx, setIdx] = useState(0)
  const [showHint, setShowHint] = useState(true)
  const [forced, setForced] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'info' | 'ok' | 'bad'; text: string }>({ kind: 'info', text: '' })
  const [mistakes, setMistakes] = useState(0)
  const [info, setInfo] = useState('')
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

  function open(l: Lesson) {
    setLessonId(l.id); setIdx(0); setMistakes(0); setForced(false); setInfo(''); countedRef.current = false
    setMsg({ kind: 'info', text: l.intro })
    input.clear()
  }

  function close() { setLessonId(null); setIdx(0); input.clear() }

  // ответ соперника
  useEffect(() => {
    if (!active || !lesson || !next || userTurn) return
    const t = window.setTimeout(() => {
      setIdx(i => i + 1)
      setMsg({ kind: 'info', text: `${next.no}${next.mover === 'w' ? '.' : '…'} ${next.san} — ${next.why}` })
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
    setMsg({ kind: 'ok', text: lesson.outro })
  }, [lesson, finished, mistakes, update])

  function onUserMove(uci: string) {
    if (!next) return
    if (uci === next.uci) {
      setIdx(i => i + 1); setForced(false)
      setMsg({ kind: 'ok', text: `✓ ${next.no}${next.mover === 'w' ? '.' : '…'} ${next.san} — ${next.why}` })
    } else {
      setMistakes(m => m + 1); setForced(true)
      setMsg({ kind: 'bad', text: `✗ В этом дебюте здесь играют ${next.san} (стрелка на доске). Сыграйте его — объяснение появится после хода.` })
    }
  }

  function addToRepertoire() {
    if (!lesson) return
    const name = `Из уроков (${lesson.side === 'w' ? 'белые' : 'чёрные'})`
    update(d => {
      let rep = d.repertoires.find(r => r.name === name && r.side === lesson.side)
      let reps = d.repertoires
      if (!rep) { rep = newRepertoire(name, lesson.side); reps = [...reps, rep] }
      const res = addLine(rep, lessonLine(lesson), lesson.title)
      setInfo(res.status === 'exists' ? 'Эта линия уже есть в репертуаре.' : `Линия добавлена в репертуар «${name}» — теперь её можно тренировать.`)
      return { ...d, repertoires: reps.map(r => (r.id === rep!.id ? res.rep : r)), activeId: rep.id }
    })
  }

  const lastRec = idx > 0 && steps[idx - 1] ? splitUci(steps[idx - 1].uci) : null
  const arrows: ArrowSpec[] = next && userTurn && (showHint || forced)
    ? [{ from: splitUci(next.uci).from as Square, to: splitUci(next.uci).to as Square, rank: 0, label: '★', color: next.mover === 'w' ? WHITE_ARROW : BLACK_ARROW }]
    : []

  if (!lesson) {
    const done = LESSONS.filter(l => data.lessons[l.id]?.done).length
    return <div data-testid="lessons-list">
      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">УРОКИ</div><h2>Выберите дебют для изучения</h2></div><span className="pill" data-testid="lessons-progress">{done} из {LESSONS.length} пройдено</span></div>
        <p className="muted">Вы играете за свою сторону, соперник отвечает ходами дебюта. После каждого хода — короткое объяснение, почему он сделан. На доске стрелка показывает нужный ход (её можно отключить, чтобы проверить себя).</p>
        <div className="lesson-grid">
          {LESSONS.map(l => {
            const pr = data.lessons[l.id]
            return <button key={l.id} className={`lesson-card ${pr?.done ? 'done' : ''}`} onClick={() => open(l)} data-testid={`lesson-${l.id}`}>
              <span className="eco">{l.eco}</span>
              <b>{l.title}</b>
              <span className="lesson-meta">{l.side === 'w' ? '♔ за белых' : '♚ за чёрных'} · {LEVEL_TEXT[l.level]} · {Math.ceil(l.steps.length / 2)} ходов</span>
              <span className="lesson-intro">{l.intro}</span>
              {pr?.done && <em>✓ пройден · раз: {pr.runs}</em>}
            </button>
          })}
        </div>
      </section>
    </div>
  }

  const log = steps.slice(0, idx)
  const lastEntry = log[log.length - 1]
  return <div className="main-grid" data-testid="lesson-view">
    <section className="panel board-panel" data-testid="lesson-board">
      <div className="panel-head"><div><div className="eyebrow">УРОК · {lesson.eco}</div><h2>{lesson.title}</h2></div>
        <span className="pill">{lesson.side === 'w' ? 'вы за белых' : 'вы за чёрных'}</span></div>
      <div className="puzzle-task" data-testid="lesson-progress">
        {finished ? 'Урок пройден' : userTurn ? `Ваш ход (${Math.min(idx + 1, steps.length)} из ${steps.length})` : 'Ответ соперника…'}
      </div>
      <div className="board-wrap">
        <Board chess={chess} orientation={orientation} selected={input.selected} legal={input.legal}
          lastMove={lastRec ? { from: lastRec.from as Square, to: lastRec.to as Square } : null}
          arrows={arrows} onSquareClick={input.onSquare} readOnly={!userTurn} />
      </div>
      {input.promo && <PromoPicker color={lesson.side} onPick={input.pickPromo} onCancel={input.cancelPromo} />}
      <div className={`puzzle-msg lesson-msg ${msg.kind}`} data-testid="lesson-message" role="status"><span className="pulse" /> {msg.text}</div>
      {info && <p className="tiny" data-testid="lesson-info">{info}</p>}
      <div className="board-actions">
        <label className="chip"><input type="checkbox" checked={showHint} onChange={e => setShowHint(e.target.checked)} data-testid="lesson-hint-toggle" /> Подсказывать стрелкой</label>
        {finished && <>
          <button className="btn primary" onClick={() => open(lesson)} data-testid="lesson-again">↻ Пройти ещё раз</button>
          <button className="btn" onClick={addToRepertoire} data-testid="lesson-to-rep">＋ В мой репертуар</button>
        </>}
        <button className="btn" onClick={close} data-testid="lesson-close">← К списку уроков</button>
      </div>
    </section>

    <aside className="right-column">
      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">ХОД УРОКА</div><h2>Что и почему</h2></div><span className="pill">ошибок: {mistakes}</span></div>
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
