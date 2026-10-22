import type { Color, PieceSymbol } from 'chess.js'
import Piece from './Piece'
import { useAppearance } from '../lib/appearance'

/** Ход в алгебраической записи; при включённой фигурной нотации буква фигуры заменяется значком (запись PGN не меняется). */
export default function San({ san, color }: { san: string; color: Color }) {
  const [ap] = useAppearance()
  const m = /^([KQRBN])(.*)$/.exec(san)
  if (!ap.figurine || !m) return <>{san}</>
  return <><Piece color={color} type={m[1].toLowerCase() as PieceSymbol} small className="san-fig" />{m[2]}</>
}
