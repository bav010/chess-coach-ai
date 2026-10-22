import { useEffect, useMemo, useRef } from 'react'
import { useI18n } from '../i18n'
import type { Chess, Color, Square } from 'chess.js'
import Piece from './Piece'
import { getAppearance } from '../lib/appearance'
import { playSound } from '../lib/sound'
import type { MoveClass } from '../lib/classify'
import MoveMark from './MoveMark'

export type ArrowSpec = {
  from: Square; to: Square; /** 0 — главный вариант */ rank: number
  /** Подпись-номер у острия (всегда показывается, независимо от настройки нумерации). */
  label?: string
  /** Свой цвет стрелки. */
  color?: string
}
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
const DEFAULT_ARROW_STYLE: ArrowStyle = { opacity: 0.85, width: 0.16, numbering: false }

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

/** Позиции кружков с номерами: у острия стрелки, а при наложении на чужой кружок — в других углах клетки или вдоль древка. */
export function badgePositions(pts: { x1: number; y1: number; x2: number; y2: number }[], minDist = 0.56): [number, number][] {
  const placed: [number, number][] = []
  return pts.map(({ x1, y1, x2, y2 }) => {
    const candidates: [number, number][] = [[x2 + 0.3, y2 - 0.3], [x2 - 0.3, y2 - 0.3], [x2 + 0.3, y2 + 0.3], [x2 - 0.3, y2 + 0.3]]
    for (const t of [0.75, 0.55, 0.35, 0.2]) candidates.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])
    const ok = (c: [number, number]) => placed.every(q => Math.hypot(q[0] - c[0], q[1] - c[1]) >= minDist)
    const pos = candidates.find(ok) ?? candidates[0]
    placed.push(pos)
    return pos
  })
}

function Arrows({ arrows, orientation, style }: { arrows: ArrowSpec[]; orientation: Color; style: ArrowStyle }) {
  const head = style.width * 2.4
  const geo = arrows.map(a => {
    const [x1, y1] = center(a.from, orientation)
    const [x2, y2] = center(a.to, orientation)
    return { x1, y1, x2, y2 }
  })
  const badges = badgePositions(geo)
  return <svg className="board-arrows" viewBox="0 0 8 8" aria-hidden="true">
    {arrows.map((a, idx) => {
      const { x1, y1, x2, y2 } = geo[idx]
      const dx = x2 - x1, dy = y2 - y1
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      const bx = x2 - ux * head, by = y2 - uy * head
      const px = -uy * head * 0.6, py = ux * head * 0.6
      const main = a.rank === 0
      const color = a.color ?? (main ? '#f5a524' : '#3d9bff')
      const opacity = main ? style.opacity : style.opacity * 0.6
      const w = main ? style.width : style.width * 0.8
      const [cx, cy] = badges[idx]
      return <g key={`${idx}${a.from}${a.to}${a.rank}`} opacity={a.label ? 0.9 : opacity} data-arrow={a.rank}>
        <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={w} strokeLinecap="round" />
        <polygon points={`${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`} fill={color} />
        {(style.numbering || a.label) && <g data-badge={a.label ?? a.rank + 1}>
          <circle cx={cx} cy={cy} r={0.25} fill="var(--badge-bg)" stroke={color} strokeWidth={0.05} />
          <text x={cx} y={cy} fontSize={0.3} fill="var(--badge-ink)" textAnchor="middle" dominantBaseline="central"
            fontFamily="DM Mono, monospace" fontWeight={700}>{a.label ?? a.rank + 1}</text>
        </g>}
      </g>
    })}
  </svg>
}

export default function Board({ chess, orientation, selected, legal, lastMove, hint, arrows, mark, arrowStyle, onSquareClick, readOnly }: Props) {
  const { t } = useI18n()
  const rows = useMemo(() => squaresFor(orientation), [orientation])
  const leftFile = orientation === 'w' ? 'a' : 'h'
  const bottomRank = orientation === 'w' ? '1' : '8'

  let checked: Square | null = null
  if (chess.inCheck()) {
    for (const row of chess.board()) for (const c of row) {
      if (c && c.type === 'k' && c.color === chess.turn()) checked = c.square
    }
  }

  // анимация хода: фигура «скользит» с исходной клетки; не при первом показе доски
  const mounted = useRef(false)
  const prevCount = useRef(chess.board().flat().filter(Boolean).length)
  const boardRef = useRef<HTMLDivElement>(null)
  const count = chess.board().flat().filter(Boolean).length
  const moveKey = lastMove ? `${lastMove.from}${lastMove.to}` : ''
  const slide = (sq: Square): React.CSSProperties | undefined => {
    if (!mounted.current || !lastMove || lastMove.to !== sq || getAppearance().animate === false) return undefined
    const col = (s2: Square) => (orientation === 'w' ? s2.charCodeAt(0) - 97 : 7 - (s2.charCodeAt(0) - 97))
    const row = (s2: Square) => (orientation === 'w' ? 8 - Number(s2[1]) : Number(s2[1]) - 1)
    return { ['--dx' as string]: col(lastMove.from) - col(sq), ['--dy' as string]: row(lastMove.from) - row(sq) } as React.CSSProperties
  }
  const status = chess.isCheckmate() || chess.isDraw() ? 'end' : chess.inCheck() ? 'check' : count < prevCount.current ? 'capture' : 'move'
  useEffect(() => {
    if (mounted.current && moveKey && getAppearance().sound && boardRef.current && boardRef.current.offsetParent !== null) playSound(status, getAppearance().volume)
    prevCount.current = count
    mounted.current = true
  }, [moveKey, count]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="board" ref={boardRef} role="grid" aria-label={t('play.board')} data-orientation={orientation}>
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
        aria-label={piece ? t(piece.color === 'w' ? 'play.sqWhite' : 'play.sqBlack', { sq }) : sq}>
        {piece && <Piece key={lastMove?.to === sq ? `${sq}-${moveKey}` : sq} color={piece.color} type={piece.type} className={slide(sq) ? 'slide' : ''} style={slide(sq)} />}
        {mark && mark.square === sq && <MoveMark cls={mark.cls} className="sq-mark" />}
        {canMove && !piece && <span className="move-dot" />}
        {sq[0] === leftFile && <small className="rank-label">{sq[1]}</small>}
        {sq[1] === bottomRank && <small className="file-label">{sq[0]}</small>}
      </button>
    }))}
    {arrows && arrows.length > 0 && <Arrows arrows={arrows} orientation={orientation} style={arrowStyle ?? DEFAULT_ARROW_STYLE} />}
  </div>
}
