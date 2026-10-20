import type { Prefs, ReviewQuality } from '../lib/prefs'
import { DEFAULT_THRESHOLDS } from '../lib/classify'
import { QUALITY } from '../lib/review'
import { useI18n } from '../i18n'

type Props = { prefs: Prefs; onChange: (patch: Partial<Prefs>) => void }

export default function AnalysisSettings({ prefs, onChange }: Props) {
  const { t } = useI18n()
  const th = prefs.thresholds
  const setT = (k: keyof typeof th, v: number) => onChange({ thresholds: { ...th, [k]: v } })
  return <div className="settings" data-testid="settings">
    <div className="settings-grid">
      <label>{t('analysis.settings.arrowOpacity')} <input type="range" min={0.2} max={1} step={0.05} value={prefs.arrowOpacity} onChange={e => onChange({ arrowOpacity: Number(e.target.value) })} /></label>
      <label>{t('analysis.settings.arrowWidth')} <input type="range" min={0.06} max={0.3} step={0.02} value={prefs.arrowWidth} onChange={e => onChange({ arrowWidth: Number(e.target.value) })} /></label>
      <label>{t('analysis.settings.arrowCount')} <input type="number" min={0} max={5} value={prefs.arrowCount} onChange={e => onChange({ arrowCount: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })} /></label>
      <label>{t('analysis.settings.multipv')} <input type="number" min={1} max={5} value={prefs.multipv} onChange={e => onChange({ multipv: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} /></label>
      <label className="check"><input type="checkbox" checked={prefs.numbering} onChange={e => onChange({ numbering: e.target.checked })} /> {t('analysis.settings.numbering')}</label>
      <label className="check"><input type="checkbox" checked={prefs.autoReview} onChange={e => onChange({ autoReview: e.target.checked })} /> {t('analysis.settings.autoReview')}</label>
      <label>{t('analysis.settings.quality')}
        <select value={prefs.reviewQuality} onChange={e => onChange({ reviewQuality: e.target.value as ReviewQuality })}>
          {(Object.keys(QUALITY) as ReviewQuality[]).map(q => <option key={q} value={q}>{t('analysis.settings.qualityOption', { label: QUALITY[q].label, depth: QUALITY[q].depth, ms: QUALITY[q].movetime })}</option>)}
        </select>
      </label>
    </div>
    <div className="sub-head">{t('analysis.settings.thresholds')}</div>
    <div className="settings-grid">
      <label>{t('analysis.settings.best')} <input type="number" min={0} max={5} step={0.5} value={th.best} onChange={e => setT('best', Number(e.target.value))} /></label>
      <label>{t('analysis.settings.inaccuracy')} <input type="number" min={1} max={30} value={th.inaccuracy} onChange={e => setT('inaccuracy', Number(e.target.value) || DEFAULT_THRESHOLDS.inaccuracy)} /></label>
      <label>{t('analysis.settings.mistake')} <input type="number" min={2} max={40} value={th.mistake} onChange={e => setT('mistake', Number(e.target.value) || DEFAULT_THRESHOLDS.mistake)} /></label>
      <label>{t('analysis.settings.blunder')} <input type="number" min={3} max={60} value={th.blunder} onChange={e => setT('blunder', Number(e.target.value) || DEFAULT_THRESHOLDS.blunder)} /></label>
    </div>
    <button className="link-btn" onClick={() => onChange({ thresholds: DEFAULT_THRESHOLDS })}>{t('analysis.settings.reset')}</button>
  </div>
}
