import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'
import { hrefFor } from '../lib/route'
import { useI18n } from '../i18n'

/** Панель страницы: «← На главную», иконка и название раздела, справа — слот для действий раздела. */
export default function ModeBar({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  const { t } = useI18n()
  return <div className="mode-bar" data-testid="mode-bar">
    <a className="btn back-home" href={hrefFor('home')} data-testid="back-home" title={t('nav.backHome')}><Icon name="back" size={18} /><span>{t('nav.backHome')}</span></a>
    <h1 className="mode-title"><Icon name={icon} size={22} /><span>{title}</span></h1>
    <div className="mode-bar-extra">{children}</div>
  </div>
}
