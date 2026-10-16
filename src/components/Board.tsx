import { useMemo } from 'react'
import type { Chess, Color, Square } from 'chess.js'
import { glyph } from '../lib/glyphs'
import type { MoveClass } from '../lib/classify'
import MoveMark from './MoveMark'

export type ArrowSpec = { from: Square; to: Square; /** 0 — главный вариант */ rank: number }
export type ArrowStyle = { opacity: number; width: number; numbering: boolean }

type Props = {
  chess: Chess
  orientation: Color
  selected: Square | null
  legal: Square[]
  lastMove?: { from: Square; to: Square } | null
  /** Подсвеченная клетка (подсказка). */
  hint?: Square | null
  arrows?: ArrowSpec[]
  /** Значок оценки хода на клетке, куда пошла фигура. */
  mark?: { square: Square; cls: MoveClass } | null
  arrowStyle?: ArrowStyle
  onSquareClick: (sq: Square) => void
  /** Доска не реагирует на клики (просмотр истории, конец партии). */
  readOnly?: boolean
}

const FILES = 'abcdefgh'

function squaresFor(orientation: Color): Square[][] {
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8]
  const files = orientation === 'w' ? [...FILES] : [...FILES].reverse()
  return ranks.map(r => files.map(f => `${f}${r}` as Square))
}

/** Центр клетки в координатах viewBox 0..8 с учётом ориентации доски. */
function center(sq: Square, orientation: Color): [number, number] {
  const f = sq.charCodeAt(0) - 97
  const r = Number(sq[1]) - 1
  return orientation === 'w' ? [f + 0.5, 7 - r + 0.5] : [7 - f + 0.5, r + 0.5]
}

function Arrows({ arrows, orientation, style }: { arrows: ArrowSpec[]; orientation: Color; style: ArrowStyle }) {
  const head = style.width * 2.4
  return <svg className="board-arrows" viewBox="0 0 8 8" aria-hidden="true">
    {arrows.map(a => {
      const [x1, y1] = center(a.from, orientation)
      const [x2, y2] = center(a.to, orientation)
      const dx = x2 - x1, dy = y2 - y1
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      const bx = x2 - ux * head, by = y2 - uy * head
      const px = -uy * head * 0.6, py = ux * head * 0.6
      const main = a.rank === 0
      const color = main ? '#f5a524' : '#3d9bff'
      const opacity = main ? style.opacity : style.opacity * 0.6
      const w = main ? style.width : style.width * 0.8
      return <g key={`${a.from}${a.to}${a.rank}`} opacity={opacity} data-arrow={a.rank}>
        <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={w} strokeLinecap="round" />
        <polygon points={`${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`} fill={color} />
        {style.numbering && <g>
          <circle cx={x2 + 0.3} cy={y2 - 0.3} r={0.19} fill="#111318" stroke={color} strokeWidth={0.04} />
          <text x={x2 + 0.3} y={y2 - 0.3} fontSize={0.24} fill="#fff" textAnchor="middle" dominantBaseline="central"
            fontFamily="DM Mono, monospace" fontWeight={700}>{a.rank + 1}</text>
        </g>}
      </g>
    })}
  </svg>
}

export default function Board({ chess, orientation, selected, legal, lastMove, hint, arrows, mark, arrowStyle, onSquareClick, readOnly }: Props) {
  const rows = useMemo(() => squaresFor(orientation), [orientation])
  const leftFile = orientation === 'w' ? 'a' : 'h'
  const bottomRank = orientation === 'w' ? '1' : '8'

  let checked: Square | null = null
  if (chess.inCheck()) {
    for (const row of chess.board()) for (const c of row) {
      if (c && c.type === 'k' && c.color === chess.turn()) checked = c.square
    }
  }

  return <div className="board" role="grid" aria-label="Шахматная доска" data-orientation={orientation}>
    {rows.flatMap(row => row.map(sq => {
      const piece = chess.get(sq)
      const dark = ((sq.charCodeAt(0) - 97) + Number(sq[1])) % 2 === 1
      const isSelected = selected === sq
      const canMove = legal.includes(sq)
      const cls = [
        'square', dark ? 'dark' : 'light', isSelected ? 'selected' : '', canMove ? 'can-move' : '',
        lastMove && (lastMove.from === sq || lastMove.to === sq) ? 'last-move' : '',
        checked === sq ? 'in-check' : '', hint === sq ? 'hint-sq' : '',
      ].filter(Boolean).join(' ')
      return <button key={sq} className={cls} disabled={readOnly} data-square={sq}
        onClick={() => onSquareClick(sq)}
        aria-label={`${sq}${piece ? ` ${piece.color === 'w' ? 'белая' : 'чёрная'} фигура` : ''}`}>
        {piece && <span className={`piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`}>{glyph[piece.color + piece.type]}</span>}
        {mark && mark.square === sq && <MoveMark cls={mark.cls} className="sq-mark" />}
        {canMove && !piece && <span className="move-dot" />}
        {sq[0] === leftFile && <small className="rank-label">{sq[1]}</small>}
        {sq[1] === bottomRank && <small className="file-label">{sq[0]}</small>}
      </button>
    }))}
    {arrows && arrows.length > 0 && arrowStyle && <Arrows arrows={arrows} orientation={orientation} style={arrowStyle} />}
  </div>
}
