import { CLASS_LABEL } from '../lib/classify'
import { explainMove } from '../lib/explain'
import MoveMark from './MoveMark'
import type { ReviewMove } from '../lib/review'

/** Текстовый разбор хода: только проверяемые факты и числа анализа. Stockfish причин не объясняет. */
export default function ExplainMove({ move }: { move: ReviewMove | null }) {
  if (!move) return <p className="tiny">Сделайте ход или выберите ход в нотации — здесь появится его разбор.</p>
  return <div className={`explain cls-${move.cls}`}>
    <div className="verdict" data-testid="verdict">
      <MoveMark cls={move.cls} className="big-mark" />
      <div><b className="verdict-title">{CLASS_LABEL[move.cls]}</b><span className="verdict-move">{move.record.san}</span></div>
    </div>
    <ul>{explainMove(move).map((l, i) => <li key={i}>{l}</li>)}</ul>
    <p className="tiny">Движок выдаёт только оценки и варианты; тексты строятся из этих чисел и фактов позиции.</p>
  </div>
}
