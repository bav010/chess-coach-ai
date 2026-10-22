import type { Color, PieceSymbol } from 'chess.js'
import { glyph } from '../lib/glyphs'
import { useAppearance } from '../lib/appearance'

// Картинки наборов фигур: src/assets/pieces/<набор>/<wK|bP…>.svg (авторы и лицензии — в CREDITS.md рядом).
const URLS = import.meta.glob('../assets/pieces/*/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>
export const pieceUrl = (set: string, color: Color, type: PieceSymbol): string | undefined => URLS[`../assets/pieces/${set}/${color}${type.toUpperCase()}.svg`]

type Props = { color: Color; type: PieceSymbol; className?: string; style?: React.CSSProperties; small?: boolean }

/** Фигура выбранного набора (картинка) или символ шрифта для набора «Glyph». Размер задаёт родитель (клетка) или small. */
export default function Piece({ color, type, className = '', style, small }: Props) {
  const [ap] = useAppearance()
  const url = ap.pieces === 'glyph' ? undefined : pieceUrl(ap.pieces, color, type)
  if (!url) return <span className={`piece ${color === 'w' ? 'white-piece' : 'black-piece'} ${small ? 'piece-s-glyph' : ''} ${className}`} style={style}>{glyph[color + type]}</span>
  return <img className={`piece piece-img ${small ? 'piece-s' : ''} ${className}`} style={style} src={url} alt="" draggable={false} />
}
