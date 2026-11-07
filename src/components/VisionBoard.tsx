import type { Color, PieceSymbol } from 'chess.js'
import Piece from './Piece'
import { FILES, type Sq } from '../lib/vision'

export type VMark = 'sel' | 'ok' | 'bad' | 'miss' | 'target' | 'path'
type Props = {
  orientation: Color
  pieces?: { sq: Sq; type: PieceSymbol; color: Color }[]
  marks?: Record<Sq, VMark>
  onSquare: (sq: Sq) => void
  /** Подписи горизонталей и вертикалей. */
  labels?: boolean
  readOnly?: boolean
}

/** Простая доска для упражнений: произвольные фигуры и отметки клеток, без шахматных правил. */
export default function VisionBoard({ orientation, pieces = [], marks = {}, onSquare, labels = true, readOnly }: Props) {
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8]
  const files = orientation === 'w' ? [...FILES] : [...FILES].reverse()
  const byQ = new Map(pieces.map(p => [p.sq, p]))
  return <div className="board vision-board" role="grid" data-orientation={orientation}>
    {ranks.flatMap(r => files.map(f => {
      const s = `${f}${r}`, p = byQ.get(s), dark = (f.charCodeAt(0) - 97 + r) % 2 === 1, m = marks[s]
      return <button key={s} className={`square ${dark ? 'dark' : 'light'} ${m ? `v-${m}` : ''}`} disabled={readOnly} data-square={s} data-mark={m ?? ''} onClick={() => onSquare(s)} aria-label={s}>
        {p && <Piece color={p.color} type={p.type} />}
        {labels && f === files[0] && <small className="rank-label">{r}</small>}
        {labels && r === ranks[ranks.length - 1] && <small className="file-label">{f}</small>}
      </button>
    }))}
  </div>
}
