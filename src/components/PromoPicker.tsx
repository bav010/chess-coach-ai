import type { Color } from 'chess.js'
import { glyph } from '../lib/glyphs'

type Props = { color: Color; onPick: (p: 'q' | 'r' | 'b' | 'n') => void; onCancel: () => void }

const NAMES = { q: 'Ферзь', r: 'Ладья', b: 'Слон', n: 'Конь' } as const

/** Выбор фигуры при превращении пешки (разметка и тексты — как в исходном приложении). */
export default function PromoPicker({ color, onPick, onCancel }: Props) {
  return <div className="promo-picker" role="dialog" aria-label="Превращение пешки">
    {(['q', 'r', 'b', 'n'] as const).map(p =>
      <button key={p} className="btn" onClick={() => onPick(p)}>{glyph[color + p]} {NAMES[p]}</button>)}
    <button className="btn" onClick={onCancel}>Отмена</button>
  </div>
}
