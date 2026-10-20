import { useMemo, useState } from 'react'
import type { Color } from 'chess.js'
import { useI18n } from '../i18n'
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
  const { t, lang } = useI18n()
  const [setup, setSetup] = useState<Setup>(() => { try { return setupFromFen(initialFen) } catch { return START_SETUP() } })
  const [tool, setTool] = useState<Tool>('wp')
  const [orientation, setOrientation] = useState<Color>('w')
  const [fenText, setFenText] = useState('')
  /** Введённый FEN, который не удалось прочитать; текст ошибки строится при показе (следует языку). */
  const [fenBad, setFenBad] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const error = useMemo(() => validateSetup(setup), [setup, lang])
  const fenError = useMemo(() => {
    if (fenBad === null) return null
    try { setupFromFen(fenBad); return null } catch (e) { return e instanceof Error ? e.message : t('play.pos.fenRead') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fenBad, lang])
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
    try { setSetup(setupFromFen(fenText)); setFenBad(null); setFenText('') }
    catch { setFenBad(fenText) }
  }

  const order = orientation === 'w' ? [...Array(64).keys()] : [...Array(64).keys()].reverse()

  return <div className="pos-editor" data-testid="position-editor">
    <div className="pos-palette" role="toolbar" aria-label={t('play.editor.pieces')}>
      {(['w', 'b'] as const).map(c => <div key={c} className="pos-palette-row">
        {PIECES.map(p => <button key={p} className={`pos-tool ${tool === c + p ? 'active' : ''}`} onClick={() => setTool(c + p)}
          data-testid={`tool-${c}${p}`} aria-label={t(c === 'w' ? 'play.editor.whitePiece' : 'play.editor.blackPiece', { p })} aria-pressed={tool === c + p}>{glyph[c + p]}</button>)}
      </div>)}
      <button className={`pos-tool erase ${tool === 'erase' ? 'active' : ''}`} onClick={() => setTool('erase')} data-testid="tool-erase" aria-pressed={tool === 'erase'}>{t('play.editor.eraser')}</button>
    </div>

    <div className="board pos-board" role="grid" aria-label={t('play.editor.board')} data-testid="editor-board">
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
    <p className="tiny">{t('play.editor.help')}</p>

    <div className="pos-options">
      <div className="chip-group"><small>{t('play.editor.turn')}</small>
        {(['w', 'b'] as const).map(c => <button key={c} className={`chip ${setup.turn === c ? 'active' : ''}`} onClick={() => setSetup(s => ({ ...s, turn: c }))} data-testid={`turn-${c}`}>{c === 'w' ? t('play.side.white') : t('play.side.black')}</button>)}
      </div>
      <div className="chip-group"><small>{t('play.editor.castling')}</small>
        {([['K', t('play.editor.castleK')], ['Q', t('play.editor.castleQ')], ['k', t('play.editor.castlek')], ['q', t('play.editor.castleq')]] as const).map(([k, label]) =>
          <label key={k} className={`chip ${feasible[k] ? '' : 'disabled'}`}>
            <input type="checkbox" checked={setup.castling[k] && feasible[k]} disabled={!feasible[k]} onChange={e => setCastling(k, e.target.checked)} data-testid={`castle-${k}`} /> {label}
          </label>)}
      </div>
    </div>

    <div className="board-actions">
      <button className="btn" onClick={() => setSetup(START_SETUP())} data-testid="pos-start">{t('play.editor.startPos')}</button>
      <button className="btn" onClick={() => setSetup(emptySetup())} data-testid="pos-clear">{t('play.editor.clear')}</button>
      <button className="btn" onClick={() => { try { setSetup(setupFromFen(initialFen)) } catch { /* оставляем как есть */ } }} data-testid="pos-current">{t('play.editor.current')}</button>
      <button className="btn" onClick={() => setOrientation(o => (o === 'w' ? 'b' : 'w'))}>{t('play.editor.flip')}</button>
    </div>

    <div className="pos-fen">
      <code data-testid="pos-fen">{fen}</code>
      <div className="board-actions">
        <input value={fenText} onChange={e => setFenText(e.target.value)} placeholder={t('play.editor.fenPlaceholder')} aria-label="FEN" data-testid="fen-input" />
        <button className="btn" onClick={loadFen} disabled={!fenText.trim()} data-testid="fen-load">{t('play.editor.fenLoad')}</button>
      </div>
      {fenError && <p className="error-text" role="alert">{fenError}</p>}
    </div>

    {error && <p className="error-text" role="alert" data-testid="pos-error">{error}</p>}
    <div className="board-actions">
      <button className="btn primary" disabled={!!error} onClick={() => onApply(fen)} data-testid="pos-apply">{t('play.editor.apply')}</button>
      <button className="btn" onClick={onCancel} data-testid="pos-cancel">{t('play.cancel')}</button>
    </div>
  </div>
}
