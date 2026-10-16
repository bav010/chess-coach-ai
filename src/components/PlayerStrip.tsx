import type { Color, PieceSymbol } from 'chess.js'
import { capturedGlyph } from '../lib/glyphs'

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
  // взятые белыми фигуры — чёрные, и наоборот
  const takenColor = color === 'w' ? 'black' : 'white'
  return <div className={`player-strip ${active ? 'active' : ''}`} data-color={color}>
    <span className={`player-dot ${color === 'w' ? 'white' : 'black'}`} />
    <b className="player-name">{name}</b>
    <span className="captured" aria-label="Взятые фигуры" data-count={captured.length}>
      {captured.map((t, i) => <span key={i} className={`cap ${takenColor}`}>{capturedGlyph(t)}</span>)}
      {advantage > 0 && <em className="cap-adv">+{advantage}</em>}
    </span>
    {clock}
  </div>
}
