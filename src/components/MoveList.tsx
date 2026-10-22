import type { MoveRecord } from '../lib/game'
import { CLASS_LABEL, hasIcon, type MoveClass } from '../lib/classify'
import MoveMark from './MoveMark'
import San from './San'
import { useI18n } from '../i18n'

type Props = {
  records: readonly MoveRecord[]
  /** Показанная позиция: 0 — стартовая, n — после n-го хода. */
  viewPly: number
  onSelect: (ply: number) => void
  /** Метки качества ходов (ключ — номер хода с 1). */
  marks?: ReadonlyMap<number, MoveClass>
}

export default function MoveList({ records, viewPly, onSelect, marks }: Props) {
  const { t } = useI18n()
  const rows = Math.ceil(records.length / 2)
  const cell = (ply: number) => {
    const r = records[ply - 1]
    if (!r) return <b />
    const mark = marks?.get(ply)
    const showMark = mark && hasIcon(mark)
    return <b>
      <button className={`move-btn ${viewPly === ply ? 'current' : ''} ${mark ? `cls-${mark}` : ''}`} onClick={() => onSelect(ply)}
        title={mark ? CLASS_LABEL[mark] : undefined} data-ply={ply}>
        {showMark ? <MoveMark cls={mark} className="tiny-mark" /> : null}<San san={r.san} color={ply % 2 === 1 ? 'w' : 'b'} />
      </button>
    </b>
  }
  return <div className="move-list">
    {records.length === 0
      ? <div className="empty-state"><span>♘</span><p>{t('analysis.moves.empty')}</p><small>{t('analysis.moves.emptyHint')}</small></div>
      : Array.from({ length: rows }, (_, i) =>
        <div className="move-row" key={i}><span>{i + 1}.</span>{cell(i * 2 + 1)}{cell(i * 2 + 2)}</div>)}
  </div>
}
