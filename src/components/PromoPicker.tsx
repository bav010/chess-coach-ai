import type { Color } from 'chess.js'
import { glyph } from '../lib/glyphs'
import { useI18n } from '../i18n'

type Props = { color: Color; onPick: (p: 'q' | 'r' | 'b' | 'n') => void; onCancel: () => void }

/** Выбор фигуры при превращении пешки (разметка и тексты — как в исходном приложении). */
export default function PromoPicker({ color, onPick, onCancel }: Props) {
  const { t } = useI18n()
  const NAMES = { q: t('play.promo.q'), r: t('play.promo.r'), b: t('play.promo.b'), n: t('play.promo.n') } as const
  return <div className="promo-picker" role="dialog" aria-label={t('play.promo.title')}>
    {(['q', 'r', 'b', 'n'] as const).map(p =>
      <button key={p} className="btn" onClick={() => onPick(p)}>{glyph[color + p]} {NAMES[p]}</button>)}
    <button className="btn" onClick={onCancel}>{t('play.cancel')}</button>
  </div>
}
