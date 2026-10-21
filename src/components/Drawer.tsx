import { useEffect, useRef } from 'react'
import Icon, { type IconName } from './Icon'
import LanguageSwitch from './LanguageSwitch'
import { hrefFor, type RouteName } from '../lib/route'
import { useI18n } from '../i18n'
import type { Key } from '../i18n'

type Item = { route: RouteName; icon: IconName; label: Key }
const GROUPS: { title: Key; items: Item[] }[] = [
  { title: 'nav.section.modes', items: [
    { route: 'home', icon: 'home', label: 'nav.home' },
    { route: 'analysis', icon: 'analysis', label: 'app.mode.analysis' },
    { route: 'play', icon: 'play', label: 'app.mode.play' },
    { route: 'tactics', icon: 'tactics', label: 'app.mode.tactics' },
    { route: 'openings', icon: 'openings', label: 'app.mode.openings' },
  ] },
  { title: 'nav.section.you', items: [
    { route: 'stats', icon: 'stats', label: 'nav.stats' },
    { route: 'profile', icon: 'user', label: 'nav.profile' },
  ] },
  { title: 'nav.section.app', items: [
    { route: 'settings', icon: 'settings', label: 'nav.settings' },
    { route: 'help', icon: 'help', label: 'nav.help' },
  ] },
]

/** Шторка слева: все разделы приложения. Закрывается по Esc, клику вне шторки и выбору пункта. */
export default function Drawer({ open, onClose, current }: { open: boolean; onClose: () => void; current: RouteName }) {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('a')?.focus()
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [open, onClose])
  return <>
    <div className={`drawer-scrim ${open ? 'open' : ''}`} onClick={onClose} aria-hidden="true" data-testid="drawer-scrim" />
    <aside ref={ref} className={`drawer ${open ? 'open' : ''}`} aria-label={t('nav.drawer.aria')} aria-hidden={!open} data-testid="drawer" {...(open ? {} : { inert: '' as unknown as boolean })}>
      <div className="drawer-head">
        <span className="brand-name">CHESS COACH <span>AI</span></span>
        <button className="icon-btn" onClick={onClose} aria-label={t('nav.close')} title={t('nav.close')} data-testid="drawer-close"><Icon name="close" /></button>
      </div>
      <nav>
        {GROUPS.map(g => <div key={g.title} className="drawer-group">
          <div className="drawer-title">{t(g.title)}</div>
          {g.items.map(i => <a key={i.route} href={hrefFor(i.route)} className={`drawer-item ${current === i.route ? 'active' : ''}`} onClick={onClose}
            aria-current={current === i.route ? 'page' : undefined} data-testid={`nav-${i.route}`}><Icon name={i.icon} /><span>{t(i.label)}</span></a>)}
        </div>)}
      </nav>
      <div className="drawer-foot"><Icon name="globe" size={16} /><LanguageSwitch compact /></div>
    </aside>
  </>
}
