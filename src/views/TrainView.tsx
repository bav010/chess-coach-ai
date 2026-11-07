import { useMemo } from 'react'
import Icon, { type IconName } from '../components/Icon'
import { dayKey, loadActivity } from '../lib/activity'
import { dailyPuzzle } from '../lib/dailyPuzzle'
import { openingsDue } from '../lib/dailyPlan'
import { dueEndgames, firstNew, loadProgress } from '../lib/endgames'
import { countMistakes, loadMistakes } from '../lib/mistakes'
import { loadOpenings } from '../lib/openingsStore'
import { loadPuzzleStats, weakThemes } from '../lib/puzzleStats'
import { THEME_LABEL } from '../lib/puzzleThemes'
import { hrefFor } from '../lib/route'
import { buildSession, sessionProgress, type Block, type BlockId } from '../lib/train'
import { useI18n, type Key } from '../i18n'

const ICON: Record<BlockId, IconName> = { daily: 'tactics', mistakes: 'flag', openings: 'openings', endgames: 'board', puzzles: 'tactics' }

/** «Тренировка дня»: короткий список заданий из ваших данных с прогрессом за сегодня. */
export default function TrainView() {
  const { t } = useI18n()
  const data = useMemo(() => {
    const now = Date.now(), act = loadActivity(), k = dayKey()
    const puzzle = dailyPuzzle(), today = act.daily[k]
    const eg = loadProgress(), mc = countMistakes(loadMistakes(), now)
    const weak = weakThemes(loadPuzzleStats(), 5)[0]
    const blocks = buildSession({
      dailyId: puzzle?.id ?? null, dailySolved: !!puzzle && !!today && today.id === puzzle.id && today.ok, dailyTried: !!puzzle && !!today && today.id === puzzle.id,
      mistakes: mc.due + mc.fresh, openingsDue: openingsDue(loadOpenings(), now),
      endgameDue: dueEndgames(eg, now).map(e => e.id), endgameNew: firstNew(eg)?.id ?? null,
      weakTheme: weak?.theme ?? null, today: act.counts?.[k] ?? {},
    })
    return { blocks, progress: sessionProgress(blocks), egDue: dueEndgames(eg, now).length }
  }, [])
  const { blocks, progress: p } = data
  const firstOpen = blocks.find(b => b.done < b.target)?.id

  const text = (b: Block): string => {
    const n = b.target
    switch (b.id) {
      case 'daily': return t('train.block.daily.text')
      case 'mistakes': return t('train.block.mistakes.text', { n })
      case 'openings': return t('train.block.openings.text', { n })
      case 'endgames': return data.egDue > 0 || b.done > 0 ? t('train.block.endgames.due', { n }) : t('train.block.endgames.new')
      case 'puzzles': return b.theme ? t('train.block.puzzles.weak', { n, theme: THEME_LABEL[b.theme].toLowerCase() }) : t('train.block.puzzles.text', { n })
    }
  }

  return <div className="st-sec" data-testid="train-view" data-complete={p.complete}>
    <section className="panel">
      <div className="panel-head"><div><div className="eyebrow">{t('train.eyebrow')}</div><h2>{t('train.title')}</h2></div>
        <span className="pill" data-testid="train-count">{t('train.progress', { done: p.done, total: p.total })}</span></div>
      <p className="muted">{t('train.intro')}</p>
      <div className="train-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent} data-testid="train-bar"><span style={{ width: `${p.percent}%` }} /></div>
      <p data-testid="train-status"><b>{p.complete ? t('train.complete') : t('train.left', { n: p.minutesLeft })}</b></p>
    </section>
    <section className="panel">
      <ol className="home-plan-list" data-testid="train-list">
        {blocks.map(b => {
          const done = b.done >= b.target
          const href = hrefFor(b.route, done && b.id === 'endgames' ? null : b.arg)
          return <li key={b.id} className={`home-plan-row ${done ? 'done' : ''}`} data-testid={`train-${b.id}`} data-done={done}>
            <span className="home-plan-ic"><Icon name={done ? 'check' : ICON[b.id]} size={20} /></span>
            <div className="home-plan-body"><b>{t(`train.block.${b.id}.title` as Key)}</b><small>{text(b)}</small></div>
            <span className="pill" data-testid={`train-n-${b.id}`}>{Math.min(b.done, b.target)}/{b.target}</span>
            <a className={`btn ${firstOpen === b.id ? 'primary' : ''}`} href={href} data-testid={`train-go-${b.id}`}>{done ? t('train.again') : t('train.go')}</a>
          </li>
        })}
      </ol>
    </section>
  </div>
}
