import { useI18n } from '../i18n'
import { applyUpdate, usePwa } from '../lib/pwa'

/** Полоса состояния приложения: нет сети и доступно обновление. */
export default function PwaBar() {
  const { t } = useI18n()
  const p = usePwa()
  if (p.online && !p.updateReady) return null
  return <div className="pwa-bar" role="status">
    {!p.online && <div className="pwa-note" data-testid="pwa-offline">{t('pwa.offline')}</div>}
    {p.updateReady && <div className="pwa-note update" data-testid="pwa-update-bar">
      <span>{t('pwa.update')}</span>
      <button className="btn primary" onClick={applyUpdate} data-testid="pwa-update">{t('pwa.update.btn')}</button>
    </div>}
  </div>
}
