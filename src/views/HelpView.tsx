import '../styles/help.css'
import Icon, { type IconName } from '../components/Icon'
import MoveMark from '../components/MoveMark'
import { hrefFor, type RouteName } from '../lib/route'
import { useI18n, type Key } from '../i18n'
import type { MoveClass } from '../lib/classify'

const MODES: { route: RouteName; icon: IconName; key: 'analysis' | 'play' | 'tactics' | 'openings' | 'stats' }[] = [
  { route: 'analysis', icon: 'analysis', key: 'analysis' }, { route: 'play', icon: 'play', key: 'play' },
  { route: 'tactics', icon: 'tactics', key: 'tactics' }, { route: 'openings', icon: 'openings', key: 'openings' },
  { route: 'stats', icon: 'stats', key: 'stats' },
]
const CLASSES: { cls: MoveClass; label: Key; text: Key }[] = [
  { cls: 'best', label: 'analysis.class.best', text: 'help.review.best' },
  { cls: 'good', label: 'analysis.class.good', text: 'help.review.good' },
  { cls: 'inaccuracy', label: 'analysis.class.inaccuracy', text: 'help.review.inaccuracy' },
  { cls: 'mistake', label: 'analysis.class.mistake', text: 'help.review.mistake' },
  { cls: 'blunder', label: 'analysis.class.blunder', text: 'help.review.blunder' },
  { cls: 'miss', label: 'analysis.class.miss', text: 'help.review.miss' },
]
const KEYS: { keys: string[]; text: Key }[] = [
  { keys: ['←', '→'], text: 'help.keys.prevNext' },
  { keys: ['Home', 'End'], text: 'help.keys.firstLast' },
  { keys: ['F'], text: 'help.keys.flip' },
  { keys: ['Esc'], text: 'help.keys.esc' },
]

/** Помощь: краткий обзор разделов, чтение разбора партии, горячие клавиши, данные и синхронизация. */
export default function HelpView() {
  const { t } = useI18n()
  const head = (icon: IconName, title: string) => <div className="help-head"><Icon name={icon} size={20} /><h2>{title}</h2></div>
  return <div className="help-page" data-testid="help-view">
    <p className="help-intro">{t('help.intro')}</p>

    <section aria-label={t('help.modes.title')}>
      <div className="help-cards">
        {MODES.map(m => <article key={m.route} className="help-card panel" data-testid={`help-card-${m.route}`}>
          <div className="help-card-top"><span className="help-ico"><Icon name={m.icon} size={22} /></span><h3>{t(`help.${m.key}.title` as Key)}</h3></div>
          <p>{t(`help.${m.key}.text` as Key)}</p>
          <p className="help-start">{t(`help.${m.key}.start` as Key)}</p>
          <a className="btn" href={hrefFor(m.route)}>{t('help.open')}<Icon name="arrowRight" size={16} /></a>
        </article>)}
      </div>
    </section>

    <section className="panel" data-testid="help-review">
      {head('analysis', t('help.review.title'))}
      <p>{t('help.review.text')}</p>
      <ul className="help-classes">{CLASSES.map(c => <li key={c.cls}><span className="help-mark"><MoveMark cls={c.cls} /></span><b>{t(c.label)}</b><span>{t(c.text)}</span></li>)}</ul>
      <p className="tiny">{t('help.review.accuracy')}</p>
      <p className="tiny">{t('help.review.rating')}</p>
    </section>

    <section className="panel" data-testid="help-shortcuts">
      {head('keyboard', t('help.keys.title'))}
      <table className="help-table"><thead><tr><th>{t('help.keys.key')}</th><th>{t('help.keys.action')}</th></tr></thead>
        <tbody>{KEYS.map(k => <tr key={k.keys.join()}><td>{k.keys.map((x, i) => <span key={x}>{i > 0 && ' '}<kbd>{x}</kbd></span>)}</td><td>{t(k.text)}</td></tr>)}</tbody></table>
    </section>

    <section className="panel" data-testid="help-data">
      {head('database', t('help.data.title'))}
      <ul className="help-list"><li>{t('help.data.local')}</li><li>{t('help.data.sync')}</li><li>{t('help.data.backup')}</li></ul>
    </section>
  </div>
}
