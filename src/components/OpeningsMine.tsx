import { useMemo, useState } from 'react'
import Icon from './Icon'
import { WdlBar } from './Charts'
import { analyseMyOpenings, isWeak, MIN_VERDICT, WEAK_SCORE } from '../lib/myOpenings'
import type { Catalog } from '../lib/openings'
import type { SavedSession } from '../storage'
import { hrefFor } from '../lib/route'
import { tn, useI18n } from '../i18n'

type ColorFilter = 'all' | 'w' | 'b'

/** «Мои дебюты»: какие дебюты вы играете против бота, результат в них и где партии выходят за пределы каталога. */
export default function OpeningsMine({ catalog, sessions }: { catalog: Catalog | null; sessions: readonly SavedSession[] }) {
  const { t } = useI18n()
  const [color, setColor] = useState<ColorFilter>('all')
  const res = useMemo(() => (catalog ? analyseMyOpenings(sessions, catalog) : null), [catalog, sessions])
  if (!res) return <section className="panel" data-testid="mine-op-loading"><p className="muted">{t('openings.mine.loading')}</p></section>
  const groups = res.groups.filter(g => color === 'all' || g.color === color)
  const weak = res.groups.filter(g => isWeak(g) && (color === 'all' || g.color === color))

  return <div className="op-mine" data-testid="op-mine">
    <section className="panel">
      <div className="panel-head">
        <div><div className="eyebrow">{t('openings.mine.eyebrow')}</div><h2>{t('openings.mine.title')}</h2></div>
        <span className="pill" data-testid="op-mine-count">{tn('openings.mine.games', res.considered)}</span>
      </div>
      <p className="tiny">{t('openings.mine.basis')}</p>
      <div className="chips" role="group" aria-label={t('openings.mine.colorAria')}>
        {(['all', 'w', 'b'] as const).map(c => <button key={c} type="button" className={`chip ${color === c ? 'active' : ''}`} aria-pressed={color === c} onClick={() => setColor(c)} data-testid={`op-mine-${c}`}>{t(`openings.mine.color.${c}`)}</button>)}
      </div>
      {weak.length > 0 && <div className="weak-box" data-testid="op-mine-weak">
        <b>{t('openings.mine.weak.title')}</b>
        <p className="tiny">{weak.map(g => `${g.family} (${t(g.color === 'w' ? 'openings.mine.white' : 'openings.mine.black').toLowerCase()}, ${g.score}%)`).join('; ')}. {t('openings.mine.weak.note', { n: MIN_VERDICT, pct: WEAK_SCORE })}</p>
        <a className="btn quiet" href={hrefFor('openings', 'study')} data-testid="op-mine-study"><Icon name="search" size={16} />{t('openings.mine.weak.cta')}</a>
      </div>}
    </section>

    {groups.length === 0
      ? <section className="panel empty-state" data-testid="op-mine-empty">
        <span>♞</span><p>{t('openings.mine.none.title')}</p><small>{t('openings.mine.none.text')}</small>
        <a className="btn primary big" href={hrefFor('play')} data-testid="op-mine-play"><Icon name="play2" size={18} />{t('openings.mine.none.cta')}</a>
      </section>
      : <div className="op-mine-list">
        {groups.map(g => <article key={g.id} className="panel op-mine-card" data-testid="op-mine-card">
          <header>
            <div><b>{g.family}</b><small>{g.eco} · {g.variation !== g.family ? g.variation.replace(`${g.family}: `, '') : t('openings.mine.mainLine')}</small></div>
            <span className="pill"><i className={`home-dot ${g.color}`} /> {t(g.color === 'w' ? 'openings.mine.white' : 'openings.mine.black')}</span>
          </header>
          <WdlBar w={g.w} d={g.d} l={g.l} />
          <dl className="op-mine-meta">
            <div><dt>{t('openings.mine.gamesCol')}</dt><dd>{g.games}</dd></div>
            <div><dt>{t('openings.mine.score')}</dt><dd>{g.games >= MIN_VERDICT ? `${g.score}%` : t('openings.mine.tooFew')}</dd></div>
            <div><dt>{t('openings.mine.depth')}</dt><dd>{tn('openings.mine.depthVal', Math.round(g.avgDepth / 2))}</dd></div>
          </dl>
          {g.exits.length > 0 && <table className="st-table op-mine-exits"><thead><tr><th>{t('openings.mine.exit.col')}</th><th>{t('openings.mine.exit.by')}</th><th>#</th></tr></thead><tbody>
            {g.exits.map(e => <tr key={`${e.by}:${e.label}`}><td><code>{e.label}</code></td><td>{t(e.by === 'me' ? 'openings.mine.exit.me' : 'openings.mine.exit.opp')}</td><td>{e.count}</td></tr>)}
          </tbody></table>}
          {isWeak(g) && <p className="tiny op-mine-flag" data-testid="op-mine-flag">{t('openings.mine.flag', { n: g.games, pct: g.score })}</p>}
        </article>)}
      </div>}
    <p className="progress-note">{t('openings.mine.note', { skipped: res.skipped })}</p>
  </div>
}
