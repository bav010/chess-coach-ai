import { useMemo } from 'react'
import PUZZLES from '../data/puzzles.json'
import { countCards, isLearnedLine } from '../lib/drill'
import { LESSONS } from '../lib/lessons'
import type { OpeningsData } from '../lib/openingsStore'
import { LEVEL_LABEL, type Level, type Puzzle } from '../lib/puzzles'
import { formatDuration, successPercent, type PuzzleStats } from '../lib/puzzleStats'
import { THEME_LABEL, THEME_ORDER } from '../lib/puzzleThemes'

type Go = 'tactics' | 'openings' | 'analysis' | 'play'
const ALL = PUZZLES as unknown as Puzzle[]
const LEVELS: Level[] = [1, 2, 3]

/** Результаты в задачах и прогресс изучения дебютов: решённые задачи, пройденные уроки, выученные линии. */
export default function LearningStats({ puzzles, openings, onGo }: { puzzles: PuzzleStats; openings: OpeningsData; onGo: (m: Go) => void }) {
  const byLevel = useMemo(() => {
    const solved = new Set(puzzles.solvedIds)
    return LEVELS.map(l => { const all = ALL.filter(p => p.level === l); return { level: l, total: all.length, solved: all.filter(p => solved.has(p.id)).length } })
  }, [puzzles.solvedIds])
  const solvedUnique = byLevel.reduce((s, x) => s + x.solved, 0)

  const op = useMemo(() => {
    const done = new Set(Object.entries(openings.lessons).filter(([, v]) => v.done).map(([k]) => k))
    const now = Date.now()
    let due = 0, cards = 0, learnedCards = 0
    const learnedLines: { rep: string; name: string }[] = []
    let lines = 0
    for (const r of openings.repertoires) {
      const c = countCards(r, openings.cards, now, done)
      due += c.due + c.new; cards += c.total; learnedCards += c.learned; lines += r.lines.length
      for (const l of r.lines) if (isLearnedLine(r, l, openings.cards, done)) learnedLines.push({ rep: r.name, name: l.name })
    }
    const doneLessons = LESSONS.filter(l => done.has(l.id))
    return { done, doneLessons, todo: LESSONS.filter(l => !done.has(l.id)), due, cards, learnedCards, learnedLines, lines }
  }, [openings])
  const att = LESSONS.filter(l => l.style === 'attack'), def = LESSONS.filter(l => l.style === 'defense')
  const answered = openings.stats.answered

  return <div className="st-grid" data-testid="learning-stats">
    <section className="panel" data-testid="puzzle-stats">
      <div className="panel-head"><div><div className="eyebrow">ТАКТИКА</div><h2>Результаты задач</h2></div><button className="btn" onClick={() => onGo('tactics')}>К задачам →</button></div>
      {puzzles.attempted === 0 ? <p className="tiny">Задачи ещё не решались. Откройте вкладку «Задачи» — здесь появятся решённые задачи и успех по темам.</p> : <>
        <p className="st-big" data-testid="puzzle-percent">{successPercent(puzzles)}% <small>успешных решений: {puzzles.solved} из {puzzles.attempted} попыток</small></p>
        <div className="stats">
          <div><strong data-testid="puzzle-solved">{solvedUnique}</strong><small>разных задач решено из {ALL.length}</small></div>
          <div><strong>{puzzles.clean}</strong><small>с первой попытки без подсказок</small></div>
          <div><strong>{puzzles.failedIds.length}</strong><small>задач ждут повторения</small></div>
          <div><strong>{formatDuration(puzzles.timeMs)}</strong><small>время в задачах</small></div>
        </div>
        <div className="sub-head">По сложности</div>
        <ul className="st-bars">{byLevel.map(x => <li key={x.level}><span>{LEVEL_LABEL[x.level]}</span><div><i style={{ width: `${x.total ? (x.solved / x.total) * 100 : 0}%` }} /></div><b>{x.solved} / {x.total}</b></li>)}</ul>
        <div className="sub-head">По темам</div>
        <ul className="st-bars">{THEME_ORDER.filter(t => puzzles.byTheme[t]?.tried).map(t => { const s = puzzles.byTheme[t]!; const p = Math.round((s.solved / s.tried) * 100); return <li key={t}><span>{THEME_LABEL[t]}</span><div><i style={{ width: `${p}%` }} /></div><b>{p}% · {s.tried}</b></li> })}</ul>
        <p className="tiny">История задач не хранит даты, поэтому фильтры периода и цвета к ним не применяются.</p></>}
    </section>

    <section className="panel" data-testid="opening-stats">
      <div className="panel-head"><div><div className="eyebrow">ДЕБЮТЫ</div><h2>Уроки и выученные дебюты</h2></div><button className="btn" onClick={() => onGo('openings')}>К дебютам →</button></div>
      <div className="stats">
        <div><strong data-testid="op-lessons">{op.doneLessons.length}/{LESSONS.length}</strong><small>уроков пройдено</small></div>
        <div><strong data-testid="op-learned">{op.learnedLines.length}</strong><small>дебютных линий выучено из {op.lines}</small></div>
        <div><strong>{op.learnedCards}/{op.cards}</strong><small>позиций выучено</small></div>
        <div><strong>{answered ? Math.round((openings.stats.correct / answered) * 100) : 0}%</strong><small>верных ответов в тренировке ({answered})</small></div>
      </div>
      <ul className="st-bars">
        <li><span>Атака</span><div><i style={{ width: `${att.length ? (att.filter(l => op.done.has(l.id)).length / att.length) * 100 : 0}%` }} /></div><b>{att.filter(l => op.done.has(l.id)).length} / {att.length}</b></li>
        <li><span>Защита</span><div><i style={{ width: `${def.length ? (def.filter(l => op.done.has(l.id)).length / def.length) * 100 : 0}%` }} /></div><b>{def.filter(l => op.done.has(l.id)).length} / {def.length}</b></li>
      </ul>
      <div className="sub-head">Пройденные уроки</div>
      {op.doneLessons.length === 0 ? <p className="tiny">Пока нет пройденных уроков.</p>
        : <ul className="st-chips" data-testid="done-lessons">{op.doneLessons.map(l => <li key={l.id} title={`Ошибок в последнем прохождении: ${openings.lessons[l.id]?.mistakes ?? 0}; прохождений: ${openings.lessons[l.id]?.runs ?? 1}`}>✓ {l.title} <em>{l.side === 'w' ? '♔' : '♚'}</em></li>)}</ul>}
      <div className="sub-head">Выученные дебюты</div>
      {op.learnedLines.length === 0 ? <p className="tiny">Дебют считается выученным, когда вы прошли по нему урок или верно отвечаете на все его позиции с интервалом от 7 дней.</p>
        : <ul className="st-chips" data-testid="learned-lines">{op.learnedLines.slice(0, 40).map((l, i) => <li key={i} title={l.rep}>{l.name}</li>)}{op.learnedLines.length > 40 && <li>…ещё {op.learnedLines.length - 40}</li>}</ul>}
      {op.due > 0 && <p className="tiny">К повторению сегодня: {op.due} {op.due === 1 ? 'позиция' : 'позиций'}.</p>}
      {op.todo.length > 0 && <details className="acc-details"><summary>Ещё не пройдено: {op.todo.length}</summary>
        <ul className="st-chips muted">{op.todo.map(l => <li key={l.id}>{l.title}</li>)}</ul></details>}
    </section>
  </div>
}
