import { useState } from 'react'
import { useI18n } from '../i18n'
import type { Color } from 'chess.js'
import { ELO_MAX, ELO_MIN, ELO_PRESETS, ENGINE_MIN_ELO, clampElo } from '../lib/bot'
import { NO_CLOCK, TIME_PRESETS, fromPreset, type TimeControl } from '../lib/clock'
import type { Prefs } from '../lib/prefs'
import Icon from './Icon'

export type GameConfig = {
  elo: number
  userColor: Color
  tc: TimeControl
  /** Описание контроля времени (не текст): подпись строится при показе, чтобы следовать языку. */
  tcDesc: { kind: 'none' } | { kind: 'preset'; label: string } | { kind: 'custom'; you: number; bot: number; inc: number; delay: number }
}

type Props = {
  prefs: Prefs
  onPrefs: (patch: Partial<Prefs>) => void
  onStart: (cfg: GameConfig) => void
  engineError: boolean
}

type ColorChoice = Color | 'random'

/** Настройки перед партией: сила бота (ELO), цвет, контроль времени. */
export default function PlaySetup({ prefs, onPrefs, onStart, engineError }: Props) {
  const { t } = useI18n()
  const [elo, setElo] = useState(1400)
  const [color, setColor] = useState<ColorChoice>('w')
  const [tcId, setTcId] = useState('5+3')
  const [youMin, setYouMin] = useState(10)
  const [botMin, setBotMin] = useState(10)
  const [incSec, setIncSec] = useState(0)
  const [delaySec, setDelaySec] = useState(0)

  function start() {
    const userColor: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color
    let tc: TimeControl = NO_CLOCK
    let tcDesc: GameConfig['tcDesc'] = { kind: 'none' }
    if (tcId === 'custom') {
      const you = Math.max(0.1, youMin) * 60_000
      const bot = Math.max(0.1, botMin) * 60_000
      tc = {
        whiteMs: userColor === 'w' ? you : bot,
        blackMs: userColor === 'w' ? bot : you,
        incrementMs: Math.max(0, incSec) * 1000,
        delayMs: Math.max(0, delaySec) * 1000,
      }
      tcDesc = { kind: 'custom', you: youMin, bot: botMin, inc: incSec, delay: delaySec }
    } else if (tcId !== 'none') {
      const preset = TIME_PRESETS.flatMap(g => g.items).find(p => p.id === tcId)
      if (preset) { tc = fromPreset(preset); tcDesc = { kind: 'preset', label: preset.label } }
    }
    onStart({ elo: clampElo(elo), userColor, tc, tcDesc })
  }

  const approx = elo < ENGINE_MIN_ELO

  return <section className="panel setup-panel" data-testid="play-setup">
    <div className="panel-head"><div><div className="eyebrow">{t('play.eyebrow')}</div><h2>{t('play.title')}</h2></div><span className="pill">{t('play.engineBadge')}</span></div>

    <div className="setup-group" data-testid="setup-strength">
    <div className="setup-head"><Icon name="play" size={18} /><h3>{t('play.setup.strength')}</h3><span className="setup-val">{elo}</span></div>
    <div className="chips">
      {ELO_PRESETS.map(p => <button key={p.elo} className={`chip ${elo === p.elo ? 'active' : ''}`} onClick={() => setElo(p.elo)}>{t(`play.level.${p.id}`)} · {p.elo}</button>)}
    </div>
    <div className="elo-row">
      <input type="range" min={ELO_MIN} max={ELO_MAX} step={50} value={elo} onChange={e => setElo(Number(e.target.value))} aria-label={t('play.setup.botRating')} />
      <input type="number" min={ELO_MIN} max={ELO_MAX} value={elo} onChange={e => setElo(Number(e.target.value) || ELO_MIN)} onBlur={() => setElo(clampElo(elo))} aria-label={t('play.setup.botElo')} data-testid="elo-input" />
    </div>
    <p className="tiny">{t('play.setup.eloNote')}{approx ? t('play.setup.eloLow', { min: ENGINE_MIN_ELO }) : ''}</p>
    </div>

    <div className="setup-group" data-testid="setup-color">
    <div className="setup-head"><Icon name="user" size={18} /><h3>{t('play.setup.yourColor')}</h3></div>
    <div className="side-grid" role="group" aria-label={t('play.setup.yourColor')}>
      {([['w', t('play.setup.white'), 'discW'], ['b', t('play.setup.black'), 'discB'], ['random', t('play.setup.random'), 'dice']] as const).map(([v, l, ic]) =>
        <button key={v} className={`side-card ${color === v ? 'active' : ''}`} aria-pressed={color === v} onClick={() => setColor(v)} data-testid={`color-${v}`}><Icon name={ic} size={22} /><span>{l}</span></button>)}
    </div>
    </div>

    <div className="setup-group" data-testid="setup-time">
    <div className="setup-head"><Icon name="clock" size={18} /><h3>{t('play.setup.time')}</h3></div>
    <div className="tc-rows">
      <div className="tc-row"><span className="tc-cat" />
        <div className="chips">
          <button className={`chip ${tcId === 'none' ? 'active' : ''}`} onClick={() => setTcId('none')} data-testid="tc-none">{t('play.setup.noClock')}</button>
          <button className={`chip ${tcId === 'custom' ? 'active' : ''}`} onClick={() => setTcId('custom')} data-testid="tc-custom">{t('play.setup.custom')}</button>
        </div></div>
      {TIME_PRESETS.map(g => <div className="tc-row" key={g.category}><span className="tc-cat">{g.category}</span>
        <div className="chips">{g.items.map(p => <button key={p.id} className={`chip ${tcId === p.id ? 'active' : ''}`} onClick={() => setTcId(p.id)} data-testid={`tc-${p.id}`}>{p.label}</button>)}</div>
      </div>)}
    </div>
    {tcId === 'custom' && <div className="settings-grid">
      <label>{t('play.setup.yourMin')} <input type="number" min={0.1} step={0.5} value={youMin} onChange={e => setYouMin(Number(e.target.value))} data-testid="custom-you" /></label>
      <label>{t('play.setup.botMin')} <input type="number" min={0.1} step={0.5} value={botMin} onChange={e => setBotMin(Number(e.target.value))} data-testid="custom-bot" /></label>
      <label>{t('play.setup.incSec')} <input type="number" min={0} value={incSec} onChange={e => setIncSec(Number(e.target.value))} data-testid="custom-inc" /></label>
      <label>{t('play.setup.delaySec')} <input type="number" min={0} value={delaySec} onChange={e => setDelaySec(Number(e.target.value))} data-testid="custom-delay" /></label>
    </div>}
    </div>

    <label className="check setup-check"><input type="checkbox" checked={prefs.autoReview} onChange={e => onPrefs({ autoReview: e.target.checked })} /> {t('play.setup.autoReview')}</label>

    {engineError && <p className="error-text">{t('play.setup.engineFail')}</p>}
    <div className="setup-start">
      <span className="setup-summary" data-testid="setup-summary">{t('play.setup.summary', { elo, side: t(color === 'w' ? 'play.setup.white' : color === 'b' ? 'play.setup.black' : 'play.setup.random'), tc: tcId === 'none' ? t('play.tc.none') : tcId === 'custom' ? t('play.setup.custom') : tcId })}</span>
      <button className="btn primary big" onClick={start} disabled={engineError} data-testid="start-game"><Icon name="play2" size={18} />{t('play.setup.start')}</button>
    </div>
  </section>
}
