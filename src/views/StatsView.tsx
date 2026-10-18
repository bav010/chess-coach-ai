import { useEffect, useMemo, useState } from 'react'
import { LineChart, StackedBars, WdlBar } from '../components/Charts'
import type { GameStat } from '../lib/gameStats'
import { loadOpenings } from '../lib/openingsStore'
import { countCards } from '../lib/drill'
import { LESSONS } from '../lib/lessons'
import { loadPuzzleStats, successPercent, formatDuration } from '../lib/puzzleStats'
import { THEME_LABEL, THEME_ORDER } from '../lib/puzzleThemes'
import { DEFAULT_FILTERS, MIN_REVIEWED, applyFilters, movingAverage, ratingSeries, recommend, summarize, type Filters } from '../lib/statsCalc'

type Go = 'tactics' | 'openings' | 'analysis' | 'play'
type Props = { active: boolean; games: GameStat[]; onGo: (m: Go) => void }

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)

/** Личная панель прогресса: партии, внутренний рейтинг, точность, ошибки, задачи, дебюты, эндшпили, рекомендации, резервная копия. */
export default function StatsView({ active, games, onGo }: Props) {
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS)
  const [tick, setTick] = useState(0)
  // задачи и дебюты живут в своих хранилищах — перечитываем при открытии вкладки
  const puzzles = useMemo(() => loadPuzzleStats(), [active, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const openings = useMemo(() => loadOpenings(), [active, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (active) setTick(t => t + 1) }, [active])

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF(x => ({ ...x, [k]: v }))
  const filtered = useMemo(() => applyFilters(games, f), [games, f])
  const sum = useMemo(() => summarize(filtered), [filtered])
  const rating = useMemo(() => ratingSeries(games), [games])
  const shownRating = useMemo(() => { const keys = new Set(filtered.map(g => g.key)); return rating.filter(r => keys.has(r.key)) }, [rating, filtered])
  const reviewedGames = filtered.filter(g => g.review)
  const rec = useMemo(() => recommend(filtered, puzzles), [filtered, puzzles])
  const cur = rating.length ? Math.round(rating[rating.length - 1].rating) : null

  const accSeries = reviewedGames.map(g => ({ y: g.review!.acc ?? 0, label: `${fmtDate(g.at)}${g.opp ? `, бот ${g.opp}` : ''}` })).filter(p => p.y > 0)
  const ma = movingAverage(accSeries.map(p => p.y))

  const learned = useMemo(() => {
    const done = new Set(Object.entries(openings.lessons).filter(([, v]) => v.done).map(([k]) => k))
    let learnedCards = 0, totalCards = 0, learnedLines = 0, lines = 0
    for (const r of openings.repertoires) {
      const c = countCards(r, openings.cards, Date.now(), done)
      learnedCards += c.learned; totalCards += c.total; learnedLines += c.learnedLines; lines += r.lines.length
    }
    return { lessons: done.size, learnedCards, totalCards, learnedLines, lines }
  }, [openings])

  const none = games.length === 0
  return <div className="st-page" data-testid="stats-view">
    <section className="panel">
      <div className="panel-head"><div><div className="eyebrow">ТВОЙ ПРОГРЕСС</div><h2>Статистика и развитие</h2></div></div>
      <div className="st-filters" data-testid="stats-filters">
        <label>Период<select value={f.period} onChange={e => set('period', e.target.value as Filters['period'])} data-testid="f-period">
          <option value="all">Всё время</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option><option value="365">Год</option></select></label>
        <label>Цвет<select value={f.color} onChange={e => set('color', e.target.value as Filters['color'])} data-testid="f-color">
          <option value="all">Любой</option><option value="w">Белые</option><option value="b">Чёрные</option></select></label>
        <label>Результат<select value={f.result} onChange={e => set('result', e.target.value as Filters['result'])} data-testid="f-result">
          <option value="all">Любой</option><option value="win">Победа</option><option value="draw">Ничья</option><option value="loss">Поражение</option></select></label>
        <label>Режим<select value={f.mode} onChange={e => set('mode', e.target.value as Filters['mode'])} data-testid="f-mode">
          <option value="all">Все</option><option value="bot">Игра с ботом</option><option value="botClock">Бот, с часами</option><option value="botNoClock">Бот, без часов</option><option value="analysis">Анализ</option></select></label>
        <button className="btn" onClick={() => setF(DEFAULT_FILTERS)} data-testid="f-reset">Сбросить фильтры</button>
      </div>
      {none && <div className="empty-state"><span>♟</span><p>Здесь появится ваша статистика</p><small>Сыграйте партию с ботом — она сохранится автоматически, а разбор партии добавит точность и ошибки.</small></div>}
      {!none && filtered.length === 0 && <p className="tiny" data-testid="stats-nomatch">По выбранным фильтрам партий нет.</p>}
    </section>

    {!none && <>
      <section className="st-kpis" data-testid="stats-kpis">
        <div className="st-kpi"><small>Партий</small><strong data-testid="kpi-games">{sum.total}</strong><em>завершено {sum.finished}</em></div>
        <div className="st-kpi"><small>Победы / ничьи / поражения</small><strong data-testid="kpi-wdl">{sum.wdl.w} / {sum.wdl.d} / {sum.wdl.l}</strong><em>очков {pct(sum.scorePct)}</em></div>
        <div className="st-kpi" title="Внутренний рейтинг приложения: считается по формуле Эло против силы бота. Это не рейтинг FIDE и не рейтинг Chess.com."><small>Рейтинг приложения</small><strong data-testid="kpi-rating">{cur ?? '—'}</strong><em>{rating.length ? `за ${rating.length} парт. с ботом` : 'нужны партии с ботом'}</em></div>
        <div className="st-kpi" title="Средняя по партиям точность ходов (по потере шансов на победу). Это не вероятность победы."><small>Точность</small><strong data-testid="kpi-acc">{pct(sum.acc)}</strong><em>{sum.reviewed ? `по ${sum.reviewed} разобранным` : 'разберите партию'}</em></div>
        <div className="st-kpi"><small>Ошибок на 100 ходов</small><strong data-testid="kpi-err">{sum.per100 ? sum.per100.all : '—'}</strong><em>{sum.per100 ? `зевков ${sum.per100.blunder}` : 'нужен разбор'}</em></div>
      </section>
      <p className="tiny st-note">«Рейтинг приложения» — внутренняя оценка по результатам партий с ботом (формула Эло, старт 1000, сила бота — номинальная). Это не официальный рейтинг FIDE и не рейтинг Chess.com. «Точность» показывает, насколько ходы близки к лучшим по оценке движка, и не является вероятностью победы.</p>

      <div className="st-grid">
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">ДИНАМИКА</div><h2>Рейтинг приложения</h2></div></div>
          <LineChart label="Динамика рейтинга приложения" series={[{ name: 'Рейтинг', color: '#d3ff72', pts: shownRating.map(r => ({ y: r.rating, label: `${fmtDate(r.at)}, бот ${r.opp}, ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)}` })) }]} />
        </section>
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">КАЧЕСТВО ИГРЫ</div><h2>Точность партий</h2></div></div>
          <LineChart label="Точность партий" unit="%" yMin={0} yMax={100} series={[{ name: 'Партия', color: '#6cb8ff', pts: accSeries }, { name: 'Среднее за 5', color: '#d3ff72', dashed: true, pts: ma.map(y => ({ y, label: '' })) }]} />
          <p className="tiny">Только разобранные партии: {sum.reviewed} из {sum.decided || sum.total}.</p>
        </section>
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">РЕЗУЛЬТАТЫ</div><h2>Победы, ничьи, поражения</h2></div></div>
          <WdlBar {...sum.wdl} />
          {f.mode === 'analysis' && <p className="tiny">В партиях анализа результат не относится к вам.</p>}
        </section>
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">ОШИБКИ</div><h2>Количество и частота</h2></div></div>
          <StackedBars label="Ошибки по партиям" bars={reviewedGames.map(g => ({ label: `${fmtDate(g.at)}`, parts: [
            { name: 'Неточности', color: '#e0a44f', v: g.review!.counts.inaccuracy ?? 0 }, { name: 'Ошибки', color: '#ff9a52', v: (g.review!.counts.mistake ?? 0) + (g.review!.counts.miss ?? 0) }, { name: 'Зевки', color: '#ff5c5c', v: g.review!.counts.blunder ?? 0 }] }))} />
          {sum.per100 && <p className="tiny" data-testid="err-text">На 100 ходов: неточностей {sum.per100.inaccuracy}, ошибок {sum.per100.mistake}, упущенных шансов {sum.per100.miss}, зевков {sum.per100.blunder}. Всего за разобранные партии: {sum.errors.inaccuracy + sum.errors.mistake + sum.errors.miss + sum.errors.blunder}.</p>}
        </section>
      </div>

      <div className="st-grid">
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">СТАДИИ ПАРТИИ</div><h2>Дебют · миттельшпиль · эндшпиль</h2></div></div>
          <table className="st-table"><thead><tr><th>Стадия</th><th>Ходов</th><th>Точность</th><th>Грубых ошибок</th></tr></thead><tbody>
            {(['opening', 'middlegame', 'endgame'] as const).map(p => <tr key={p}><td>{p === 'opening' ? 'Дебют' : p === 'middlegame' ? 'Миттельшпиль' : 'Эндшпиль'}</td><td>{sum.phases[p].n}</td><td>{pct(sum.phases[p].acc)}</td><td>{sum.phases[p].bad}</td></tr>)}
          </tbody></table>
        </section>
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">ЭНДШПИЛИ</div><h2>Успешность в эндшпилях</h2></div></div>
          {sum.endgame.games === 0 ? <p className="tiny">Пока нет партий, дошедших до эндшпиля.</p> : <>
            <p className="st-big" data-testid="endgame-score">{pct(sum.endgame.scorePct)} очков <small>в {sum.endgame.games} партиях, дошедших до эндшпиля</small></p>
            <WdlBar {...sum.endgame.wdl} />
            <p className="tiny">Точность в эндшпиле: {pct(sum.endgame.acc)}.{sum.endgame.strong.n > 0 && ` Из ${sum.endgame.strong.n} партий, где вы входили в эндшпиль с преимуществом (65%+), выиграно ${sum.endgame.strong.won}.`}</p></>}
        </section>
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">ТАКТИКА</div><h2>Результаты задач</h2></div></div>
          {puzzles.attempted === 0 ? <p className="tiny">Задачи ещё не решались.</p> : <>
            <p className="st-big" data-testid="puzzle-percent">{successPercent(puzzles)}% <small>решено {puzzles.solved} из {puzzles.attempted}, без ошибок с первой попытки: {puzzles.clean}</small></p>
            <ul className="st-bars">{THEME_ORDER.filter(t => puzzles.byTheme[t]?.tried).map(t => { const s = puzzles.byTheme[t]!; const p = Math.round((s.solved / s.tried) * 100); return <li key={t}><span>{THEME_LABEL[t]}</span><div><i style={{ width: `${p}%` }} /></div><b>{p}% · {s.tried}</b></li> })}</ul>
            <p className="tiny">Время в задачах: {formatDuration(puzzles.timeMs)}. История задач не хранит даты, поэтому фильтры периода и цвета к ним не применяются.</p></>}
        </section>
        <section className="panel"><div className="panel-head"><div><div className="eyebrow">ДЕБЮТЫ</div><h2>Прогресс изучения дебютов</h2></div></div>
          <div className="stats">
            <div><strong data-testid="op-lessons">{learned.lessons}/{LESSONS.length}</strong><small>уроков пройдено</small></div>
            <div><strong>{learned.learnedLines}/{learned.lines}</strong><small>линий выучено</small></div>
            <div><strong>{learned.learnedCards}/{learned.totalCards}</strong><small>позиций выучено</small></div>
            <div><strong>{openings.stats.answered ? Math.round((openings.stats.correct / openings.stats.answered) * 100) : 0}%</strong><small>верных ответов ({openings.stats.answered})</small></div>
          </div>
          <p className="tiny">Без привязки к датам, поэтому фильтры к дебютам не применяются.</p>
        </section>
      </div>

      <section className="panel" data-testid="recs">
        <div className="panel-head"><div><div className="eyebrow">ПЕРСОНАЛЬНО</div><h2>Рекомендации</h2></div></div>
        {rec.needMore > 0 && <p className="st-info" data-testid="recs-more">Пока мало данных для выводов по партиям: разобрано {rec.reviewed} из минимум {MIN_REVIEWED}. Разберите ещё {rec.needMore} {rec.needMore === 1 ? 'партию' : 'партии'} (включите «Авторазбор» в настройках или нажмите «Разбор партии»). Выводы строятся только по партиям с разбором и учитывают фильтры выше.</p>}
        {rec.recs.length === 0 && rec.needMore === 0 && <p className="st-info" data-testid="recs-none">По {rec.reviewed} разобранным партиям устойчивых проблем не найдено — так держать. Рекомендации появляются, когда одна и та же проблема повторяется в нескольких партиях.</p>}
        <div className="st-recs">{rec.recs.map(r => <article key={r.id} className="st-rec" data-testid={`rec-${r.id}`}>
          <b>{r.title}</b><p>{r.text}</p>
          <small className="st-basis">На чём основано: {r.basis}.</small>
          <button className="btn" onClick={() => onGo(r.action.go)}>{r.action.label} →</button>
        </article>)}</div>
      </section>
    </>}

  </div>
}
