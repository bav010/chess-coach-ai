import type { Prefs, ReviewQuality } from '../lib/prefs'
import { DEFAULT_THRESHOLDS } from '../lib/classify'
import { QUALITY } from '../lib/review'

type Props = { prefs: Prefs; onChange: (patch: Partial<Prefs>) => void }

export default function AnalysisSettings({ prefs, onChange }: Props) {
  const t = prefs.thresholds
  const setT = (k: keyof typeof t, v: number) => onChange({ thresholds: { ...t, [k]: v } })
  return <div className="settings" data-testid="settings">
    <div className="settings-grid">
      <label>Яркость стрелок <input type="range" min={0.2} max={1} step={0.05} value={prefs.arrowOpacity} onChange={e => onChange({ arrowOpacity: Number(e.target.value) })} /></label>
      <label>Толщина стрелок <input type="range" min={0.06} max={0.3} step={0.02} value={prefs.arrowWidth} onChange={e => onChange({ arrowWidth: Number(e.target.value) })} /></label>
      <label>Количество стрелок <input type="number" min={0} max={5} value={prefs.arrowCount} onChange={e => onChange({ arrowCount: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })} /></label>
      <label>Вариантов анализа <input type="number" min={1} max={5} value={prefs.multipv} onChange={e => onChange({ multipv: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} /></label>
      <label className="check"><input type="checkbox" checked={prefs.numbering} onChange={e => onChange({ numbering: e.target.checked })} /> Нумерация стрелок</label>
      <label className="check"><input type="checkbox" checked={prefs.autoReview} onChange={e => onChange({ autoReview: e.target.checked })} /> Разбирать партию сразу после окончания игры</label>
      <label>Качество разбора
        <select value={prefs.reviewQuality} onChange={e => onChange({ reviewQuality: e.target.value as ReviewQuality })}>
          {(Object.keys(QUALITY) as ReviewQuality[]).map(q => <option key={q} value={q}>{QUALITY[q].label} (глубина {QUALITY[q].depth}, до {QUALITY[q].movetime} мс)</option>)}
        </select>
      </label>
    </div>
    <div className="sub-head">Пороги оценки ходов (потеря шансов на победу, п. п.)</div>
    <div className="settings-grid">
      <label>Отличный ход до <input type="number" min={0} max={5} step={0.5} value={t.best} onChange={e => setT('best', Number(e.target.value))} /></label>
      <label>Неточность от <input type="number" min={1} max={30} value={t.inaccuracy} onChange={e => setT('inaccuracy', Number(e.target.value) || DEFAULT_THRESHOLDS.inaccuracy)} /></label>
      <label>Ошибка от <input type="number" min={2} max={40} value={t.mistake} onChange={e => setT('mistake', Number(e.target.value) || DEFAULT_THRESHOLDS.mistake)} /></label>
      <label>Зевок от <input type="number" min={3} max={60} value={t.blunder} onChange={e => setT('blunder', Number(e.target.value) || DEFAULT_THRESHOLDS.blunder)} /></label>
    </div>
    <button className="link-btn" onClick={() => onChange({ thresholds: DEFAULT_THRESHOLDS })}>Вернуть пороги по умолчанию</button>
  </div>
}
