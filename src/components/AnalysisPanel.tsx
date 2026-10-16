import type { Color } from 'chess.js'
import { formatPv } from '../lib/san'
import { formatScore, toWhite, type Score } from '../lib/eval'
import { uciToSan } from '../lib/san'
import type { CacheEntry } from '../lib/analysisCache'
import type { GameStatus } from '../lib/game'
import type { ReviewMove } from '../lib/review'
import ExplainMove from './ExplainMove'

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

const END_TEXT: Record<string, string> = {
  checkmate: 'Мат', stalemate: 'Пат', insufficient: 'Ничья: недостаточно материала',
  threefold: 'Ничья: троекратное повторение', fifty: 'Ничья: правило 50 ходов',
}

/** Панель анализа: оценка, лучшие линии, состояние расчёта и текстовый разбор последнего хода. */
export default function AnalysisPanel({ fen, turn, entry, score, busy, error, engineState, engineLabel, status, live, marksOn, analysisOn }: Props) {
  const lines = entry?.lines ?? []
  const best = lines[0]
  return <section className="panel analysis-panel">
    <div className="panel-head"><div><div className="eyebrow">ПОМОЩНИК</div><h2>Анализ позиции</h2></div><span className={`engine-icon ${engineState === 'ready' ? 'ready' : ''}`}>⌘</span></div>
    <p className="muted">Stockfish работает прямо в твоём браузере: ищет сильные ходы и оценивает позицию.</p>
    <div className="engine-status"><span className={`status-square ${engineState === 'ready' ? 'ready' : ''}`}/><span>{engineLabel}</span>
      {analysisOn && !status.over && <span className={`analysis-indicator ${busy ? 'busy' : 'done'}`} data-testid="analysis-indicator">
        {busy ? 'идёт анализ…' : entry ? 'анализ готов' : ''}</span>}
    </div>

    {status.over && <div className="result-box">{END_TEXT[status.reason] ?? 'Партия окончена'} — {status.result}</div>}

    {!status.over && <>
      <div className="eval-summary">
        <div><small>Оценка (для белых)</small><strong data-testid="eval-text">{score ? formatScore(score) : '…'}</strong></div>
        <div><small>Лучший ход</small><strong data-testid="best-move">{best ? uciToSan(fen, best.pv[0]) ?? '—' : '…'}</strong></div>
        <div><small>Глубина</small><strong>{entry?.depth ?? '—'}</strong></div>
      </div>
      {lines.length > 0 && <ol className="pv-list">
        {lines.map(l => <li key={l.multipv}>
          <b className="pv-score">{formatScore(toWhite(l, turn))}</b>
          <span className="pv-moves">{formatPv(fen, l.pv, 8)}</span>
        </li>)}
      </ol>}
      {lines.length === 0 && !error && analysisOn && <p className="tiny">Считаю позицию…</p>}
    </>}
    {error && <p className="tiny">{error}</p>}
    {engineState === 'error' && <p className="tiny">Не удалось загрузить движок. Обнови страницу; нужен современный браузер с поддержкой WebAssembly.</p>}

    {marksOn && <>
      <div className="sub-head">Оценка хода</div>
      <ExplainMove move={live} />
    </>}
  </section>
}
