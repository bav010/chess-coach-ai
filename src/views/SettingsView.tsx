import '../styles/settings.css'
import AnalysisSettings from '../components/AnalysisSettings'
import Icon, { type IconName } from '../components/Icon'
import LanguageSwitch from '../components/LanguageSwitch'
import { BOARD_COLORS, BOARD_PRESETS, DEFAULT_APPEARANCE, PIECE_SETS, HINT_STYLES, LAST_MOVE_COLORS, useAppearance, type ThemeChoice } from '../lib/appearance'
import Piece, { pieceUrl } from '../components/Piece'
import { glyph } from '../lib/glyphs'
import type { Color, PieceSymbol } from 'chess.js'
import type { Prefs } from '../lib/prefs'
import { useI18n, type Key } from '../i18n'

const THEMES: { id: ThemeChoice; icon: IconName; label: Key }[] = [
  { id: 'system', icon: 'system', label: 'settings.theme.system' },
  { id: 'dark', icon: 'moon', label: 'settings.theme.dark' },
  { id: 'light', icon: 'sun', label: 'settings.theme.light' },
]
// небольшая позиция для предпросмотра: ряды 8…1 (пусто — '')
const PREVIEW = ['rnbqkbnr'.split('').map(c => 'b' + c), 'pppppppp'.split('').map(c => 'b' + c)].flat()

/** Фигура конкретного набора для карточки выбора (не зависит от текущей настройки). */
function SetPiece({ set, color, type }: { set: string; color: Color; type: PieceSymbol }) {
  const url = set === 'glyph' ? undefined : pieceUrl(set, color, type)
  return url ? <img src={url} alt="" draggable={false} /> : <span className={color === 'w' ? 'white-piece' : 'black-piece'}>{glyph[color + type]}</span>
}

function Preview() {
  const { t } = useI18n()
  const cells: { p: string; dark: boolean; file: string; rank: string }[] = []
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1]
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    let p = ''
    if (r < 2) p = PREVIEW[r * 8 + f]
    else if (r >= 6) p = (r === 6 ? 'p' : 'rnbqkbnr'[f]).replace(/^/, 'w')
    cells.push({ p, dark: (f + r) % 2 === 1, file: 'abcdefgh'[f], rank: String(ranks[r]) })
  }
  return <div className="board set-preview" role="img" aria-label={t('settings.board.previewAria')} data-testid="board-preview">
    {cells.map((c, i) => <div key={i} className={`square ${c.dark ? 'dark' : 'light'}`}>
      {c.p && <Piece color={c.p[0] as Color} type={c.p[1] as PieceSymbol} />}
      {i % 8 === 0 && <small className="rank-label">{c.rank}</small>}
      {i >= 56 && <small className="file-label">{c.file}</small>}
    </div>)}
  </div>
}

/** Настройки приложения: язык, тема, доска, подсказки и разбор. Всё применяется сразу. */
export default function SettingsView({ prefs, onPrefs }: { prefs: Prefs; onPrefs: (patch: Partial<Prefs>) => void }) {
  const { t } = useI18n()
  const [ap, setAp] = useAppearance()
  const heading = (icon: IconName, title: string, id: string) => <div className="set-head"><Icon name={icon} size={20} /><h2 id={id}>{title}</h2></div>
  return <div className="set-page" data-testid="settings-view">
    <section className="panel" aria-labelledby="set-lang">
      {heading('globe', t('settings.language.title'), 'set-lang')}
      <LanguageSwitch />
      <p className="tiny">{t('app.settings.languageNote')}</p>
    </section>

    <section className="panel" aria-labelledby="set-look">
      {heading('sun', t('settings.appearance.title'), 'set-look')}
      <div className="set-sub">{t('settings.appearance.theme')}</div>
      <div className="seg" role="group" aria-label={t('settings.appearance.theme')}>
        {THEMES.map(x => <button key={x.id} type="button" className={`seg-btn ${ap.theme === x.id ? 'active' : ''}`} aria-pressed={ap.theme === x.id} onClick={() => setAp({ theme: x.id })} data-testid={`set-theme-${x.id}`}>
          <Icon name={x.icon} size={18} /><span>{t(x.label)}</span></button>)}
      </div>
      <p className="tiny">{t('settings.appearance.note')}</p>
    </section>

    <section className="panel" aria-labelledby="set-board">
      {heading('board', t('settings.board.title'), 'set-board')}
      <div className="set-board-grid">
        <div>
          <div className="set-sub">{t('settings.board.colors')}</div>
          <div className="swatches" role="group" aria-label={t('settings.board.colors')}>
            {BOARD_PRESETS.map(id => { const [l, d] = BOARD_COLORS[id]; return <button key={id} type="button" className={`sw ${ap.board === id ? 'active' : ''}`} aria-pressed={ap.board === id} onClick={() => setAp({ board: id })} data-testid={`set-board-${id}`}>
              <i className="sw-checker" style={{ background: `conic-gradient(${d} 25%, ${l} 0 50%, ${d} 0 75%, ${l} 0)` }} /><span>{t(`settings.board.${id}` as Key)}</span></button> })}
            <button type="button" className={`sw ${ap.board === 'custom' ? 'active' : ''}`} aria-pressed={ap.board === 'custom'} onClick={() => setAp({ board: 'custom' })} data-testid="set-board-custom">
              <i className="sw-checker" style={{ background: `conic-gradient(${ap.customDark} 25%, ${ap.customLight} 0 50%, ${ap.customDark} 0 75%, ${ap.customLight} 0)` }} /><span>{t('settings.board.custom')}</span></button>
          </div>
          {ap.board === 'custom' && <div className="set-colors">
            <label>{t('settings.board.light')}<input type="color" value={ap.customLight} onChange={e => setAp({ customLight: e.target.value })} data-testid="set-custom-light" /></label>
            <label>{t('settings.board.dark')}<input type="color" value={ap.customDark} onChange={e => setAp({ customDark: e.target.value })} data-testid="set-custom-dark" /></label>
          </div>}
          <label className="check set-check"><input type="checkbox" checked={ap.coords} onChange={e => setAp({ coords: e.target.checked })} data-testid="set-coords" /> {t('settings.board.coords')}</label>
          <p className="tiny">{t('settings.board.note')}</p>
        </div>
        <div>
          <div className="set-sub">{t('settings.board.preview')}</div>
          <Preview />
        </div>
      </div>
    </section>

    <section className="panel" aria-labelledby="set-pieces">
      {heading('board', t('settings.pieces.title'), 'set-pieces')}
      <div className="set-sub">{t('settings.pieces.set')}</div>
      <div className="swatches" role="group" aria-label={t('settings.pieces.set')}>
        {PIECE_SETS.map(id => <button key={id} type="button" className={`sw piece-sw ${ap.pieces === id ? 'active' : ''}`} aria-pressed={ap.pieces === id} onClick={() => setAp({ pieces: id })} data-testid={`set-pieces-${id}`}>
          <span className="piece-sw-pv"><SetPiece set={id} color="w" type="n" /><SetPiece set={id} color="b" type="q" /></span><span>{t(`settings.pieces.${id}` as Key)}</span></button>)}
      </div>
      <label className="set-range">{t('settings.pieces.size')}
        <input type="range" min={70} max={100} step={2} value={Math.round(ap.pieceScale * 100)} onChange={e => setAp({ pieceScale: Number(e.target.value) / 100 })} data-testid="set-piece-size" /></label>
      <label className="check set-check"><input type="checkbox" checked={ap.pieceShadow} onChange={e => setAp({ pieceShadow: e.target.checked })} data-testid="set-shadow" /> {t('settings.pieces.shadow')}</label>
      <label className="check set-check"><input type="checkbox" checked={ap.figurine} onChange={e => setAp({ figurine: e.target.checked })} data-testid="set-figurine" /> {t('settings.pieces.figurine')}</label>
    </section>

    <section className="panel" aria-labelledby="set-marks">
      {heading('hint', t('settings.marks.title'), 'set-marks')}
      <div className="set-sub">{t('settings.marks.hint')}</div>
      <div className="seg" role="group" aria-label={t('settings.marks.hint')}>
        {HINT_STYLES.map(id => <button key={id} type="button" className={`seg-btn ${ap.hint === id ? 'active' : ''}`} aria-pressed={ap.hint === id} onClick={() => setAp({ hint: id })} data-testid={`set-hint-${id}`}>{t(`settings.marks.${id}` as Key)}</button>)}
      </div>
      <div className="set-sub">{t('settings.marks.last')}</div>
      <div className="seg" role="group" aria-label={t('settings.marks.last')}>
        {LAST_MOVE_COLORS.map(id => <button key={id} type="button" className={`seg-btn ${ap.lastMove === id ? 'active' : ''}`} aria-pressed={ap.lastMove === id} onClick={() => setAp({ lastMove: id })} data-testid={`set-last-${id}`}>{t(`settings.marks.${id}` as Key)}</button>)}
      </div>
    </section>

    <section className="panel" aria-labelledby="set-motion">
      {heading('hint', t('settings.motion.title'), 'set-motion')}
      <label className="check set-check"><input type="checkbox" checked={ap.animate} onChange={e => setAp({ animate: e.target.checked })} data-testid="set-animate" /> {t('settings.motion.animate')}</label>
      <label className="check set-check"><input type="checkbox" checked={ap.sound} onChange={e => setAp({ sound: e.target.checked })} data-testid="set-sound" /> {t('settings.motion.sound')}</label>
      {ap.sound && <label className="set-range">{t('settings.motion.volume')}
        <input type="range" min={0} max={100} step={5} value={Math.round(ap.volume * 100)} onChange={e => setAp({ volume: Number(e.target.value) / 100 })} data-testid="set-volume" /></label>}
    </section>

    <section className="panel" aria-labelledby="set-hints">
      {heading('hint', t('settings.hints.title'), 'set-hints')}
      <p className="tiny">{t('settings.hints.note')}</p>
      <AnalysisSettings prefs={prefs} onChange={onPrefs} />
    </section>

    <div className="board-actions"><button type="button" className="btn" onClick={() => setAp({ theme: DEFAULT_APPEARANCE.theme, board: DEFAULT_APPEARANCE.board, customLight: DEFAULT_APPEARANCE.customLight, customDark: DEFAULT_APPEARANCE.customDark, coords: DEFAULT_APPEARANCE.coords, pieces: DEFAULT_APPEARANCE.pieces, pieceScale: DEFAULT_APPEARANCE.pieceScale, pieceShadow: DEFAULT_APPEARANCE.pieceShadow, hint: DEFAULT_APPEARANCE.hint, lastMove: DEFAULT_APPEARANCE.lastMove, animate: DEFAULT_APPEARANCE.animate, sound: DEFAULT_APPEARANCE.sound, volume: DEFAULT_APPEARANCE.volume, figurine: DEFAULT_APPEARANCE.figurine })} data-testid="set-reset"><Icon name="refresh" size={16} />{t('settings.reset')}</button></div>
  </div>
}
