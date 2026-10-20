import type { Color } from 'chess.js'
import { formatPv } from '../lib/san'
import { formatScore, toWhite, type Score } from '../lib/eval'
import { uciToSan } from '../lib/san'
import type { CacheEntry } from '../lib/analysisCache'
import type { GameStatus } from '../lib/game'
import type { ReviewMove } from '../lib/review'
import ExplainMove from './ExplainMove'
import { useI18n, type Key } from '../i18n'

type Props = {
  fen: string
  turn: Color
  entry: CacheEntry | undefined
  score: Score | null
  busy: boolean
  error: string | null
  engineState: 'loading' | 'ready' | 'error'
  engineLabel: string
  status: GameStatus
  live: ReviewMove | null
  /** Оценка хода включена (переключатель над доской). */
  marksOn: boolean
  analysisOn: boolean
}

const END_KEY: Record<string, Key> = {
  checkmate: 'analysis.end.checkmate', stalemate: 'analysis.end.stalemate', insufficient: 'analysis.end.insufficient',
  threefold: 'analysis.end.threefold', fifty: 'analysis.end.fifty',
}

/** Панель анализа: оценка, лучшие линии, состояние расчёта и текстовый разбор последнего хода. */
export default function AnalysisPanel({ fen, turn, entry, score, busy, error, engineState, engineLabel, status, live, marksOn, analysisOn }: Props) {
  const { t } = useI18n()
  const lines = entry?.lines ?? []
  const best = lines[0]
  return <section className="panel analysis-panel">
    <div className="panel-head"><div><div className="eyebrow">{t('analysis.panel.eyebrow')}</div><h2>{t('analysis.panel.title')}</h2></div><span className={`engine-icon ${engineState === 'ready' ? 'ready' : ''}`}>⌘</span></div>
    <p className="muted">{t('analysis.panel.intro')}</p>
    <div className="engine-status"><span className={`status-square ${engineState === 'ready' ? 'ready' : ''}`}/><span>{engineLabel}</span>
      {analysisOn && !status.over && <span className={`analysis-indicator ${busy ? 'busy' : 'done'}`} data-testid="analysis-indicator">
        {busy ? t('analysis.panel.running') : entry ? t('analysis.panel.done') : ''}</span>}
    </div>

    {status.over && <div className="result-box">{t(END_KEY[status.reason] ?? 'analysis.end.over')} — {status.result}</div>}

    {!status.over && <>
      <div className="eval-summary">
        <div><small>{t('analysis.panel.evalWhite')}</small><strong data-testid="eval-text">{score ? formatScore(score) : '…'}</strong></div>
        <div><small>{t('analysis.panel.best')}</small><strong data-testid="best-move">{best ? uciToSan(fen, best.pv[0]) ?? '—' : '…'}</strong></div>
        <div><small>{t('analysis.panel.depth')}</small><strong>{entry?.depth ?? '—'}</strong></div>
      </div>
      {lines.length > 0 && <ol className="pv-list">
        {lines.map(l => <li key={l.multipv}>
          <b className="pv-score">{formatScore(toWhite(l, turn))}</b>
          <span className="pv-moves">{formatPv(fen, l.pv, 8)}</span>
        </li>)}
      </ol>}
      {lines.length === 0 && !error && analysisOn && <p className="tiny">{t('analysis.panel.calculating')}</p>}
    </>}
    {error && <p className="tiny">{error}</p>}
    {engineState === 'error' && <p className="tiny">{t('analysis.panel.engineFail')}</p>}

    {marksOn && <>
      <div className="sub-head">{t('analysis.panel.moveEval')}</div>
      <ExplainMove move={live} />
    </>}
  </section>
}
