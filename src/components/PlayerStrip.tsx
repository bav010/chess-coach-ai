import type { Color, PieceSymbol } from 'chess.js'
import Piece from './Piece'
import { useI18n } from '../i18n'

type Props = {
  color: Color
  name: string
  /** Фигуры, которые взяла эта сторона. */
  captured: PieceSymbol[]
  /** Перевес по материалу для этой стороны (> 0 — показываем «+N»). */
  advantage: number
  clock?: React.ReactNode
  active?: boolean
}

/** Полоса игрока: имя, взятые фигуры, перевес и (необязательно) часы. */
export default function PlayerStrip({ color, name, captured, advantage, clock, active }: Props) {
  const { t } = useI18n()
  // взятые белыми фигуры — чёрные, и наоборот
  const takenColor = color === 'w' ? 'black' : 'white'
  return <div className={`player-strip ${active ? 'active' : ''}`} data-color={color}>
    <span className={`player-dot ${color === 'w' ? 'white' : 'black'}`} />
    <b className="player-name">{name}</b>
    <span className="captured" aria-label={t('play.captured')} data-count={captured.length}>
      {captured.map((pc, i) => <span key={i} className={`cap ${takenColor}`}><Piece color={takenColor === 'white' ? 'w' : 'b'} type={pc} small /></span>)}
      {advantage > 0 && <em className="cap-adv">+{advantage}</em>}
    </span>
    {clock}
  </div>
}
