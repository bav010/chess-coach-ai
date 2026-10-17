import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import Board from './Board'
import PromoPicker from './PromoPicker'
import { useBoardInput } from '../hooks/useBoardInput'
import { countCards, planDrill, type DrillMode } from '../lib/drill'
import { splitUci } from '../lib/game'
import { cardSpecs, posKey, repMovesAt, type CardSpec, type RepLine } from '../lib/repertoire'
import { uciToSan } from '../lib/san'
import { isDue, newCard, schedule, type Grade } from '../lib/srs'
import type { OpeningsData } from '../lib/openingsStore'

type Props = {
  data: OpeningsData
  update: (fn: (d: OpeningsData) => OpeningsData) => void
  active: boolean
}

type Phase = 'user' | 'learn'
type Drill = { line: RepLine; path: string[]; phase: Phase; graded: string[]; hint: boolean }
type Mistake = { fen: string; played: string; expected: string; line: string }
type Session = { queue: RepLine[]; idx: number; answered: number; correct: number; mistakes: Mistake[]; retries: Record<string, number>; startedAt: number }

const fmtDue = (ms: number) => {
  const d = Math.round(ms / 86_400_000)
  return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} дн.`
}

/** Тренировка по репертуару: вспомните ход, соперник отвечает заранее заданным ходом. Интервальное повторение. */
export default function OpeningsTrainer({ data, update, active }: Props) {
  const rep = data.repertoires.find(r => r.id === data.activeId) ?? null
  const [mode, setMode] = useState<DrillMode>('due')
  const [session, setSession] = useState<Session | null>(null)
  const [summary, setSummary] = useState<Session | null>(null)
  const [drill, setDrill] = useState<Drill | null>(null)
  const [msg, setMsg] = useState<{ kind: 'info' | 'ok' | 'bad'; text: string }>({ kind: 'info', text: '' })
  const [correctMove, setCorrectMove] = useState<string | null>(null)
  const [hintSq, setHintSq] = useState<Square | null>(null)
  const [, setTick] = useState(0)
  const dataRef = useRef(data); dataRef.current = data
  const sessionRef = useRef(session); sessionRef.current = session
  const drillRef = useRef(drill); drillRef.current = drill

  const now = Date.now()
  const specs = useMemo(() => (rep ? new Map(cardSpecs(rep).map(s => [s.key, s])) : new Map<string, CardSpec>()), [rep])
  const doneLessons = useMemo(() => new Set(Object.entries(data.lessons).filter(([, v]) => v.done).map(([k]) => k)), [data.lessons])
  const counts = rep ? countCards(rep, data.cards, now, doneLessons) : null
  const plan = rep ? planDrill(rep, data.cards, now, mode, 12, doneLessons) : null

  const chess = useMemo(() => {
    const c = new Chess()
    for (const u of drill?.path ?? []) c.move(splitUci(u))
    return c
  }, [drill?.path])
  const spec = drill && rep && chess.turn() === rep.side ? specs.get(posKey(chess.fen())) ?? null : null
  const myTurn = !!drill && !!spec

  const input = useBoardInput(chess, myTurn ? rep!.side : null, onUserMove)

  // ---- ход соперника (заранее заданные ответы) и конец линии
  useEffect(() => {
    if (!active || !drill || !rep) return
    if (chess.turn() === rep.side) {
      if (!spec) finishLine('Линия пройдена.')
      return
    }
    const t = window.setTimeout(() => {
      const d = drillRef.current
      if (!d) return
      const onLine = d.path.every((m, i) => m === d.line.moves[i]) && d.line.moves.length > d.path.length
      const options = onLine ? [d.line.moves[d.path.length]] : repMovesAt(rep, d.path)
      if (options.length === 0) { finishLine('Линия пройдена.'); return }
      const reply = options[Math.floor(Math.random() * options.length)]
      setDrill({ ...d, path: [...d.path, reply] })
    }, d0(drill.path.length))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill?.path, active])

  function d0(len: number) { return len === 0 ? 150 : 600 }

  function startDrill(line: RepLine) {
    setDrill({ line, path: [], phase: 'user', graded: [], hint: false })
    setCorrectMove(null); setHintSq(null)
    setMsg({ kind: 'info', text: `Линия «${line.name}». Вспомните следующий ход.` })
  }

  function begin() {
    if (!rep || !plan || plan.lines.length === 0) return
    const s: Session = { queue: plan.lines, idx: 0, answered: 0, correct: 0, mistakes: [], retries: {}, startedAt: Date.now() }
    setSummary(null); setSession(s)
    startDrill(s.queue[0])
  }

  function finishSession(s: Session) {
    const elapsed = Date.now() - s.startedAt
    update(d => ({ ...d, stats: { answered: d.stats.answered + s.answered, correct: d.stats.correct + s.correct, timeMs: d.stats.timeMs + elapsed, sessions: d.stats.sessions + 1 } }))
    setSummary(s); setSession(null); setDrill(null)
  }

  function finishLine(text: string) {
    const s = sessionRef.current
    if (!s) return
    const next = s.idx + 1
    if (next >= s.queue.length) { finishSession(s); return }
    const ns = { ...s, idx: next }
    setSession(ns)
    setMsg({ kind: 'ok', text: `${text} Следующая линия.` })
    startDrill(ns.queue[next])
  }

  function grade(spec: CardSpec, g: Grade) {
    const t = Date.now()
    update(d => {
      const cur = d.cards[spec.id] ?? newCard(t)
      // верный ответ по карточке, которой ещё не пора, не двигает расписание (иначе интервалы раздувались бы повторной практикой)
      const due = isDue(cur, t) || !d.cards[spec.id]
      const next = g === 'again' ? schedule(cur, 'again', t) : due ? schedule(cur, g, t) : { ...cur, correct: cur.correct + 1, last: t }
      return { ...d, cards: { ...d.cards, [spec.id]: next } }
    })
  }

  function onUserMove(uci: string) {
    const d = drillRef.current, s = sessionRef.current
    if (!d || !s || !rep || !spec) return
    const san = (u: string) => uciToSan(chess.fen(), u) ?? u
    const ok = spec.expected.includes(uci)
    if (d.phase === 'learn') {
      if (ok) { setDrill({ ...d, path: [...d.path, uci], phase: 'user', hint: false }); setCorrectMove(null); setMsg({ kind: 'ok', text: '✓ Запомните этот ход — он вернётся в повторение.' }) }
      else setMsg({ kind: 'bad', text: `Нужен ход ${spec.expected.map(san).join(' или ')}. Сыграйте его.` })
      return
    }
    const first = !d.graded.includes(spec.id)
    if (ok) {
      if (first) {
        grade(spec, d.hint ? 'hard' : 'good')
        setSession({ ...s, answered: s.answered + 1, correct: s.correct + 1 })
      }
      setDrill({ ...d, path: [...d.path, uci], graded: first ? [...d.graded, spec.id] : d.graded, hint: false })
      setHintSq(null); setCorrectMove(null)
      const n = rep.notes[spec.key]
      setMsg({ kind: 'ok', text: `✓ Верно: ${san(uci)}.${n ? ` 📝 ${n}` : ''}` })
      return
    }
    // ошибка: показываем правильный ход, карточка вернётся скоро, линия — в конец сессии
    if (first) grade(spec, 'again')
    const retries = { ...s.retries }
    const queue = s.queue.slice()
    if ((retries[d.line.id] ?? 0) < 2) { retries[d.line.id] = (retries[d.line.id] ?? 0) + 1; queue.push(d.line) }
    setSession({ ...s, queue, retries, answered: first ? s.answered + 1 : s.answered, mistakes: first ? [...s.mistakes, { fen: chess.fen(), played: san(uci), expected: spec.expected.map(san).join(' / '), line: d.line.name }] : s.mistakes })
    setDrill({ ...d, phase: 'learn', graded: first ? [...d.graded, spec.id] : d.graded })
    setCorrectMove(spec.expected[0]); setHintSq(null)
    setMsg({ kind: 'bad', text: `✗ Не тот ход (${san(uci)}). Правильно: ${spec.expected.map(san).join(' или ')}.${rep.notes[spec.key] ? ` 📝 ${rep.notes[spec.key]}` : ''} Сыграйте его — позиция вернётся в повторение позже.` })
  }

  function showHint() {
    const d = drillRef.current
    if (!d || !spec || d.phase !== 'user') return
    setDrill({ ...d, hint: true })
    setHintSq(splitUci(spec.expected[0]).from as Square)
    setMsg({ kind: 'info', text: 'Подсказка: сходите фигурой с выделенной клетки. Верный ответ с подсказкой засчитается как «трудно».' })
  }

  function stop() { if (session) finishSession(session); else { setDrill(null) } }

  const arrows = correctMove ? [{ from: splitUci(correctMove).from as Square, to: splitUci(correctMove).to as Square, rank: 0 }] : []
  const lastU = drill?.path.length ? splitUci(drill.path[drill.path.length - 1]) : null
  const progress = session ? `Линия ${Math.min(session.idx + 1, session.queue.length)} из ${session.queue.length} · ход ${Math.floor((drill?.path.length ?? 0) / 2) + 1}` : ''
  const st = data.stats
  const nextDueMs = rep ? Math.min(...Object.entries(data.cards).filter(([k]) => k.startsWith(`${rep.id}|`)).map(([, c]) => c.due), Infinity) : Infinity

  return <div className="main-grid" data-testid="openings-trainer">
    <section className="panel board-panel" data-testid="trainer-board">
      <div className="panel-head"><div><div className="eyebrow">ТРЕНИРОВКА</div><h2>Повторение дебютов</h2></div>{rep && <span className="pill">{rep.name} · {rep.side === 'w' ? 'белые' : 'чёрные'}</span>}</div>
      {!rep && <div className="empty-state"><span>♞</span><p>Сначала создайте репертуар</p><small>Вкладка «Изучение» → «Репертуар».</small></div>}
      {rep && drill && <>
        <div className="puzzle-task" data-testid="trainer-progress">{progress}{drill ? ` · ${drill.line.name}` : ''}</div>
        <div className="board-wrap">
          <Board chess={chess} orientation={rep.side} selected={input.selected} legal={input.legal} lastMove={lastU ? { from: lastU.from as Square, to: lastU.to as Square } : null}
            hint={hintSq} arrows={arrows} onSquareClick={input.onSquare} readOnly={!myTurn} />
        </div>
        {input.promo && <PromoPicker color={rep.side} onPick={input.pickPromo} onCancel={input.cancelPromo} />}
        <div className={`puzzle-msg ${msg.kind}`} data-testid="trainer-message" role="status"><span className="pulse" /> {myTurn ? msg.text : msg.text || 'Соперник отвечает…'}</div>
        <div className="board-actions">
          <button className="btn" onClick={showHint} disabled={!myTurn || drill.phase !== 'user'} data-testid="trainer-hint">💡 Подсказка</button>
          <button className="btn" onClick={stop} data-testid="trainer-stop">Завершить</button>
        </div>
      </>}
      {rep && !drill && !summary && <div className="trainer-start" data-testid="trainer-start">
        <p className="muted">Вы видите позицию и вспоминаете свой следующий ход. Ответы соперника — те, что заданы в репертуаре. Ошибочные позиции возвращаются чаще, хорошо выученные — реже.</p>
        {data.repertoires.length > 1 && <label className="rep-select" style={{ display: 'block', margin: '10px 0' }}>
          <span className="tiny">Репертуар для тренировки: </span>
          <select value={rep.id} onChange={e => update(d => ({ ...d, activeId: e.target.value }))} data-testid="trainer-rep-select">
            {data.repertoires.map(r => <option key={r.id} value={r.id}>{r.name} · {r.side === 'w' ? 'белые' : 'чёрные'} · линий: {r.lines.length}</option>)}
          </select>
        </label>}
        <div className="chips">
          <button className={`chip ${mode === 'due' ? 'active' : ''}`} onClick={() => setMode('due')} data-testid="mode-due">К повторению{counts ? ` (${counts.due + counts.new})` : ''}</button>
          <button className={`chip ${mode === 'learned' ? 'active' : ''}`} onClick={() => setMode('learned')} data-testid="mode-learned">Повторить выученное{counts ? ` (${counts.learnedLines})` : ''}</button>
          <button className={`chip ${mode === 'all' ? 'active' : ''}`} onClick={() => setMode('all')} data-testid="mode-all">Все линии</button>
        </div>
        <div className="board-actions" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={begin} disabled={!plan || plan.lines.length === 0} data-testid="trainer-begin">▶ Начать тренировку{plan ? ` (${plan.lines.length} лин.)` : ''}</button>
        </div>
        {plan && plan.lines.length === 0 && <p className="tiny" data-testid="trainer-empty">{rep.lines.length === 0 ? 'В репертуаре нет линий — добавьте их на вкладке «Каталог и репертуар» или пройдите урок.' : mode === 'learned' ? 'Выученных линий пока нет. Линия считается выученной, когда вы прошли по ней урок или верно отвечаете на все её позиции с интервалом 7+ дней.' : `На сегодня всё повторено.${Number.isFinite(nextDueMs) ? ` Следующее повторение ${fmtDue(nextDueMs - now)}.` : ''} Можно выбрать «Все линии».`}</p>}
      </div>}
      {summary && !drill && <div className="trainer-summary" data-testid="trainer-summary">
        <b>Тренировка завершена</b>
        <p>Ответов: {summary.answered}, верно: {summary.correct}{summary.answered ? ` (${Math.round((summary.correct / summary.answered) * 100)}%)` : ''}.</p>
        {summary.mistakes.length > 0 && <><p>Над чем поработать — эти позиции вернутся в повторение:</p>
          <ul>{summary.mistakes.map((m, i) => <li key={i}><b>{m.line}</b>: вы сыграли {m.played}, нужно {m.expected}</li>)}</ul></>}
        <div className="board-actions"><button className="btn primary" onClick={() => setSummary(null)} data-testid="trainer-back">Готово</button></div>
      </div>}
    </section>

    <aside className="right-column">
      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">ПРОГРЕСС</div><h2>Статистика дебютов</h2></div></div>
        {counts && <div className="stats">
          <div><strong data-testid="cnt-due">{counts.due + counts.new}</strong><small>к повторению (новых {counts.new})</small></div>
          <div><strong data-testid="cnt-learned">{counts.learned}</strong><small>выучено из {counts.total}</small></div>
          <div><strong data-testid="cnt-percent">{st.answered ? Math.round((st.correct / st.answered) * 100) : 0}%</strong><small>верных ответов ({st.answered})</small></div>
          <div><strong>{st.sessions}</strong><small>тренировок</small></div>
        </div>}
        {!counts && <p className="muted">Создайте репертуар, чтобы видеть прогресс.</p>}
        <p className="progress-note">Прогресс хранится в этом браузере и сохраняется после перезапуска. Сложные позиции показываются чаще, после верных ответов интервал растёт: 1 → 3 → ~7 дней и дальше.</p>
      </section>
    </aside>
  </div>
}
