import { useCallback, useState } from 'react'
import type { Chess, Color, Square } from 'chess.js'

/** Выбор фигуры и клетки на доске: подсветка ходов, превращение пешки. `color` — чьи фигуры можно двигать. */
export function useBoardInput(chess: Chess | null, color: Color | null, onMove: (uci: string) => void) {
  const [selected, setSelected] = useState<Square | null>(null)
  const [legal, setLegal] = useState<Square[]>([])
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)

  const clear = useCallback(() => { setSelected(null); setLegal([]); setPromo(null) }, [])

  const onSquare = useCallback((sq: Square) => {
    if (!chess || !color || promo) return
    if (selected && legal.includes(sq)) {
      const mover = chess.get(selected)
      if (mover?.type === 'p' && (sq[1] === '8' || sq[1] === '1')) { setPromo({ from: selected, to: sq }); return }
      const uci = `${selected}${sq}`
      clear(); onMove(uci); return
    }
    const piece = chess.get(sq)
    if (piece && piece.color === color) {
      setSelected(sq)
      setLegal(chess.moves({ square: sq, verbose: true }).map(m => m.to))
    } else clear()
  }, [chess, color, promo, selected, legal, clear, onMove])

  const pickPromo = useCallback((p: 'q' | 'r' | 'b' | 'n') => {
    if (!promo) return
    const uci = `${promo.from}${promo.to}${p}`
    clear(); onMove(uci)
  }, [promo, clear, onMove])

  return { selected, legal, promo, onSquare, pickPromo, clear, cancelPromo: clear }
}
