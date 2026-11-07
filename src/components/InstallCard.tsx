import { useState } from 'react'
import Icon from './Icon'
import { useI18n } from '../i18n'
import { promptInstall, usePwa } from '../lib/pwa'

/** Карточка «Установить как приложение» на главной: кнопка там, где браузер даёт системный запрос, подсказка — на iPhone/iPad. */
export default function InstallCard() {
  const { t } = useI18n()
  const p = usePwa()
  const [asked, setAsked] = useState(false)
  if (p.installed || asked || (!p.canInstall && !p.ios)) return null
  return <section className="panel install-card" data-testid="home-install" aria-label={t('pwa.install.title')}>
    <div className="install-ic"><Icon name="download" size={22} /></div>
    <div className="install-body"><b>{t('pwa.install.title')}</b><small>{p.canInstall ? t('pwa.install.text') : t('pwa.install.ios')}</small></div>
    {p.canInstall && <button className="btn primary" onClick={() => { void promptInstall().then(r => { if (r === 'accepted') setAsked(true) }) }} data-testid="home-install-btn">{t('pwa.install.btn')}</button>}
    <button className="icon-btn" aria-label={t('pwa.install.hide')} title={t('pwa.install.hide')} onClick={() => setAsked(true)} data-testid="home-install-hide"><Icon name="close" size={16} /></button>
  </section>
}
