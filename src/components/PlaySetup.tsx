import { useState } from 'react'
import type { Color } from 'chess.js'
import { ELO_MAX, ELO_MIN, ELO_PRESETS, ENGINE_MIN_ELO, clampElo } from '../lib/bot'
import { NO_CLOCK, TIME_PRESETS, fromPreset, type TimeControl } from '../lib/clock'
import type { Prefs } from '../lib/prefs'

export type GameConfig = {
  elo: number
  userColor: Color
  tc: TimeControl
  tcLabel: string
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
    let tcLabel = 'без часов'
    if (tcId === 'custom') {
      const you = Math.max(0.1, youMin) * 60_000
      const bot = Math.max(0.1, botMin) * 60_000
      tc = {
        whiteMs: userColor === 'w' ? you : bot,
        blackMs: userColor === 'w' ? bot : you,
        incrementMs: Math.max(0, incSec) * 1000,
        delayMs: Math.max(0, delaySec) * 1000,
      }
      tcLabel = `${youMin}/${botMin} мин +${incSec}${delaySec ? ` задержка ${delaySec}` : ''}`
    } else if (tcId !== 'none') {
      const preset = TIME_PRESETS.flatMap(g => g.items).find(p => p.id === tcId)
      if (preset) { tc = fromPreset(preset); tcLabel = preset.label }
    }
    onStart({ elo: clampElo(elo), userColor, tc, tcLabel })
  }

  const approx = elo < ENGINE_MIN_ELO

  return <section className="panel setup-panel" data-testid="play-setup">
    <div className="panel-head"><div><div className="eyebrow">ИГРА</div><h2>Партия с ботом</h2></div><span className="pill">Stockfish в браузере</span></div>

    <div className="sub-head">Сила бота</div>
    <div className="chips">
      {ELO_PRESETS.map(p => <button key={p.elo} className={`chip ${elo === p.elo ? 'active' : ''}`} onClick={() => setElo(p.elo)}>{p.label} · {p.elo}</button>)}
    </div>
    <div className="elo-row">
      <input type="range" min={ELO_MIN} max={ELO_MAX} step={50} value={elo} onChange={e => setElo(Number(e.target.value))} aria-label="Рейтинг бота" />
      <input type="number" min={ELO_MIN} max={ELO_MAX} value={elo} onChange={e => setElo(Number(e.target.value) || ELO_MIN)} onBlur={() => setElo(clampElo(elo))} aria-label="ELO бота" data-testid="elo-input" />
    </div>
    <p className="tiny">Рейтинг приблизительный: сила бота действительно ограничивается в Stockfish (UCI_Elo),
      но реальный уровень зависит от времени на ход и позиции.
      {approx ? ` Ниже ${ENGINE_MIN_ELO} у Stockfish нет встроенного ограничения, поэтому бот дополнительно допускает «человеческие» промахи — это грубая калибровка.` : ''}</p>

    <div className="sub-head">Ваш цвет</div>
    <div className="chips">
      {([['w', '♔ Белые'], ['b', '♚ Чёрные'], ['random', '🎲 Случайно']] as const).map(([v, l]) =>
        <button key={v} className={`chip ${color === v ? 'active' : ''}`} onClick={() => setColor(v)} data-testid={`color-${v}`}>{l}</button>)}
    </div>

    <div className="sub-head">Время</div>
    <div className="chips">
      <button className={`chip ${tcId === 'none' ? 'active' : ''}`} onClick={() => setTcId('none')} data-testid="tc-none">Без часов</button>
      {TIME_PRESETS.map(g => <div className="chip-group" key={g.category}><small>{g.category}</small>
        {g.items.map(p => <button key={p.id} className={`chip ${tcId === p.id ? 'active' : ''}`} onClick={() => setTcId(p.id)} data-testid={`tc-${p.id}`}>{p.label}</button>)}
      </div>)}
      <button className={`chip ${tcId === 'custom' ? 'active' : ''}`} onClick={() => setTcId('custom')} data-testid="tc-custom">Своё</button>
    </div>
    {tcId === 'custom' && <div className="settings-grid">
      <label>Ваше время, мин <input type="number" min={0.1} step={0.5} value={youMin} onChange={e => setYouMin(Number(e.target.value))} data-testid="custom-you" /></label>
      <label>Время бота, мин <input type="number" min={0.1} step={0.5} value={botMin} onChange={e => setBotMin(Number(e.target.value))} data-testid="custom-bot" /></label>
      <label>Добавка за ход, с <input type="number" min={0} value={incSec} onChange={e => setIncSec(Number(e.target.value))} data-testid="custom-inc" /></label>
      <label>Задержка, с <input type="number" min={0} value={delaySec} onChange={e => setDelaySec(Number(e.target.value))} data-testid="custom-delay" /></label>
    </div>}

    <label className="check setup-check"><input type="checkbox" checked={prefs.autoReview} onChange={e => onPrefs({ autoReview: e.target.checked })} /> Сразу разбирать партию после окончания</label>

    {engineError && <p className="error-text">Не удалось загрузить движок: играть с ботом нельзя. Обновите страницу.</p>}
    <div className="board-actions">
      <button className="btn primary" onClick={start} disabled={engineError} data-testid="start-game">▶ Начать партию</button>
    </div>
  </section>
}
