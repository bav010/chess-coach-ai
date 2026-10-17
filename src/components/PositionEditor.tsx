import { useMemo, useState } from 'react'
import type { Color } from 'chess.js'
import { glyph } from '../lib/glyphs'
import {
  START_SETUP, emptySetup, feasibleCastling, indexSquare, setupFromFen, setupToFen, validateSetup, type Castling, type Setup,
} from '../lib/position'

type Props = {
  /** Позиция, с которой начинается редактирование (обычно — текущая на доске). */
  initialFen: string
  onApply: (fen: string) => void
  onCancel: () => void
}

const PIECES = ['k', 'q', 'r', 'b', 'n', 'p'] as const
type Tool = string | 'erase'

/** Редактор позиции: расставьте фигуры как в нужный момент партии и анализируйте оттуда. */
export default function PositionEditor({ initialFen, onApply, onCancel }: Props) {
  const [setup, setSetup] = useState<Setup>(() => { try { return setupFromFen(initialFen) } catch { return START_SETUP() } })
  const [tool, setTool] = useState<Tool>('wp')
  const [orientation, setOrientation] = useState<Color>('w')
  const [fenText, setFenText] = useState('')
  const [fenError, setFenError] = useState<string | null>(null)

  const error = useMemo(() => validateSetup(setup), [setup])
  const feasible = feasibleCastling(setup.cells)
  const fen = useMemo(() => setupToFen(setup), [setup])

  function put(i: number, code: string | null) {
    setSetup(s => {
      const cells = s.cells.slice()
      cells[i] = code
      return { ...s, cells }
    })
  }

  function clickCell(i: number) {
    if (tool === 'erase') put(i, null)
    else put(i, setup.cells[i] === tool ? null : tool)
  }

  function setCastling(k: keyof Castling, v: boolean) {
    setSetup(s => ({ ...s, castling: { ...s.castling, [k]: v } }))
  }

  function loadFen() {
    try { setSetup(setupFromFen(fenText)); setFenError(null); setFenText('') }
    catch (e) { setFenError(e instanceof Error ? e.message : 'Не удалось прочитать FEN') }
  }

  const order = orientation === 'w' ? [...Array(64).keys()] : [...Array(64).keys()].reverse()

  return <div className="pos-editor" data-testid="position-editor">
    <div className="pos-palette" role="toolbar" aria-label="Фигуры">
      {(['w', 'b'] as const).map(c => <div key={c} className="pos-palette-row">
        {PIECES.map(p => <button key={p} className={`pos-tool ${tool === c + p ? 'active' : ''}`} onClick={() => setTool(c + p)}
          data-testid={`tool-${c}${p}`} aria-label={`${c === 'w' ? 'Белая' : 'Чёрная'} фигура ${p}`} aria-pressed={tool === c + p}>{glyph[c + p]}</button>)}
      </div>)}
      <button className={`pos-tool erase ${tool === 'erase' ? 'active' : ''}`} onClick={() => setTool('erase')} data-testid="tool-erase" aria-pressed={tool === 'erase'}>✕ Ластик</button>
    </div>

    <div className="board pos-board" role="grid" aria-label="Редактор позиции" data-testid="editor-board">
      {order.map(i => {
        const sq = indexSquare(i)
        const light = ((i % 8) + Math.floor(i / 8)) % 2 === 0
        const code = setup.cells[i]
        return <button key={sq} className={`square ${light ? 'light' : 'dark'}`} data-square={sq}
          onClick={() => clickCell(i)} onContextMenu={e => { e.preventDefault(); put(i, null) }}
          aria-label={`${sq}${code ? ` ${code}` : ''}`}>
          {code && <span className={`piece ${code[0] === 'w' ? 'white-piece' : 'black-piece'}`}>{glyph[code]}</span>}
        </button>
      })}
    </div>
    <p className="tiny">Выберите фигуру и нажимайте на клетки. Повторный клик по той же фигуре или правая кнопка мыши убирает её.</p>

    <div className="pos-options">
      <div className="chip-group"><small>ХОДИТ</small>
        {(['w', 'b'] as const).map(c => <button key={c} className={`chip ${setup.turn === c ? 'active' : ''}`} onClick={() => setSetup(s => ({ ...s, turn: c }))} data-testid={`turn-${c}`}>{c === 'w' ? 'Белые' : 'Чёрные'}</button>)}
      </div>
      <div className="chip-group"><small>РОКИРОВКА</small>
        {([['K', 'Белые O-O'], ['Q', 'Белые O-O-O'], ['k', 'Чёрные O-O'], ['q', 'Чёрные O-O-O']] as const).map(([k, label]) =>
          <label key={k} className={`chip ${feasible[k] ? '' : 'disabled'}`}>
            <input type="checkbox" checked={setup.castling[k] && feasible[k]} disabled={!feasible[k]} onChange={e => setCastling(k, e.target.checked)} data-testid={`castle-${k}`} /> {label}
          </label>)}
      </div>
    </div>

    <div className="board-actions">
      <button className="btn" onClick={() => setSetup(START_SETUP())} data-testid="pos-start">Начальная позиция</button>
      <button className="btn" onClick={() => setSetup(emptySetup())} data-testid="pos-clear">Очистить доску</button>
      <button className="btn" onClick={() => { try { setSetup(setupFromFen(initialFen)) } catch { /* оставляем как есть */ } }} data-testid="pos-current">Как на доске сейчас</button>
      <button className="btn" onClick={() => setOrientation(o => (o === 'w' ? 'b' : 'w'))}>⇅ Перевернуть</button>
    </div>

    <div className="pos-fen">
      <code data-testid="pos-fen">{fen}</code>
      <div className="board-actions">
        <input value={fenText} onChange={e => setFenText(e.target.value)} placeholder="Вставьте FEN…" aria-label="FEN" data-testid="fen-input" />
        <button className="btn" onClick={loadFen} disabled={!fenText.trim()} data-testid="fen-load">Загрузить FEN</button>
      </div>
      {fenError && <p className="error-text" role="alert">{fenError}</p>}
    </div>

    {error && <p className="error-text" role="alert" data-testid="pos-error">{error}</p>}
    <div className="board-actions">
      <button className="btn primary" disabled={!!error} onClick={() => onApply(fen)} data-testid="pos-apply">Анализировать эту позицию</button>
      <button className="btn" onClick={onCancel} data-testid="pos-cancel">Отмена</button>
    </div>
  </div>
}
