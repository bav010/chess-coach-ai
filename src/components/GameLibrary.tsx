import { useMemo, useState } from 'react'
import Icon from './Icon'
import type { SavedSession } from '../storage'
import { MAX_GAMES, NO_FILTER, cleanNicks, colorOf, filterGames, importPgn, outcomeFor, sessionFor, summary, type ImportReport, type LibFilter, type LibGame, type LibStore } from '../lib/library'
import { fmtDate, tn, useI18n } from '../i18n'

const PAGE = 30

/** Библиотека партий: загрузка PGN (файлы или вставка), ники для определения своей стороны, список с фильтрами. */
export default function GameLibrary({ lib, onChange, onOpen }: { lib: LibStore; onChange: (fn: (s: LibStore) => LibStore) => void; onOpen: (s: SavedSession) => void }) {
  const { t } = useI18n()
  const [nickText, setNickText] = useState(() => lib.nicks.join(', '))
  const [paste, setPaste] = useState('')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [msg, setMsg] = useState<'empty' | 'read' | null>(null)
  const [filter, setFilter] = useState<LibFilter>(NO_FILTER)
  const [shown, setShown] = useState(PAGE)

  const sum = useMemo(() => summary(lib.games, lib.nicks), [lib.games, lib.nicks])
  const list = useMemo(() => filterGames(lib.games, lib.nicks, filter), [lib.games, lib.nicks, filter])

  function saveNicks() {
    const nicks = cleanNicks(nickText.split(/[,;\n]/))
    setNickText(nicks.join(', '))
    setMsg(null); onChange(s => ({ ...s, nicks }))
  }
  function doImport(text: string) {
    if (!text.trim()) { setMsg('empty'); setReport(null); return }
    const r = importPgn(lib, text)
    onChange(() => r.store)
    setReport(r); setMsg(null); setPaste('')
  }
  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    try {
      const texts = await Promise.all([...files].map(f => f.text()))
      doImport(texts.join('\n\n'))
    } catch { setMsg('read'); setReport(null) }
  }
  const remove = (g: LibGame) => onChange(s => ({ ...s, games: s.games.filter(x => x.key !== g.key) }))
  const clear = () => { if (window.confirm(t('library.clear.confirm', { n: lib.games.length }))) onChange(s => ({ ...s, games: [] })) }
  const open = (g: LibGame) => { const s = sessionFor(g, lib.nicks); if (s) onOpen(s) }
  const set = (patch: Partial<LibFilter>) => { setFilter(f => ({ ...f, ...patch })); setShown(PAGE) }

  return <section className="panel library" data-testid="library">
    <div className="panel-head">
      <div><div className="eyebrow">{t('library.eyebrow')}</div><h2>{t('library.title')}</h2></div>
      <span className="pill" data-testid="lib-count">{tn('library.sum.games', lib.games.length)}</span>
    </div>
    <p className="tiny">{t('library.intro')}</p>

    <label className="lib-field"><span>{t('library.nick.label')}</span>
      <span className="lib-row">
        <input type="text" value={nickText} placeholder={t('library.nick.ph')} maxLength={200} onChange={e => setNickText(e.target.value)} onBlur={saveNicks} onKeyDown={e => { if (e.key === 'Enter') saveNicks() }} data-testid="lib-nicks" />
        <button type="button" className="btn quiet" onClick={saveNicks} data-testid="lib-nicks-save">{t('library.nick.save')}</button>
      </span>
    </label>
    <p className="tiny">{t('library.nick.hint')}</p>

    <div className="lib-import">
      <label className="btn file-btn"><Icon name="upload" size={16} /><span>{t('library.import.file')}</span>
        <input type="file" accept=".pgn,text/plain" multiple hidden onChange={e => { void onFiles(e.target.files); e.target.value = '' }} data-testid="lib-file" />
      </label>
      <textarea value={paste} onChange={e => { setPaste(e.target.value); setMsg(null) }} placeholder={t('library.import.paste')} rows={3} aria-label={t('library.import.paste')} data-testid="lib-paste" />
      <button type="button" className="btn primary" onClick={() => doImport(paste)} data-testid="lib-import">{t('library.import.btn')}</button>
    </div>
    {msg && <p className="error-text" role="alert" data-testid="lib-msg">{t(msg === 'empty' ? 'library.import.empty' : 'library.import.readErr')}</p>}
    {report && <p className="progress-note" role="status" data-testid="lib-report">{t('library.report', { added: report.added, dup: report.duplicates, bad: report.failed })}</p>}

    {lib.games.length === 0 ? <div className="empty-state" data-testid="lib-empty"><span>♟</span><p>{t('library.empty.title')}</p><small>{t('library.empty.text')}</small></div> : <>
      <div className="stats" data-testid="lib-summary">
        <div><strong>{sum.total}</strong><small>{tn('library.sum.games', sum.total)}</small></div>
        <div><strong>{sum.score === null ? '—' : `${sum.score}%`}</strong><small>{t('library.sum.record', { w: sum.w, d: sum.d, l: sum.l, pct: sum.score ?? 0 })}</small></div>
      </div>
      {sum.unknown > 0 && <p className="tiny" data-testid="lib-unknown">{t('library.sum.unknown', { n: sum.unknown })}</p>}

      <div className="lib-filters" role="group" aria-label={t('library.filter.aria')}>
        <div className="chips">
          {(['all', 'w', 'b'] as const).map(c => <button key={c} type="button" className={`chip ${filter.color === c ? 'active' : ''}`} aria-pressed={filter.color === c} onClick={() => set({ color: c })} data-testid={`lib-color-${c}`}>{t(`library.f.color.${c}`)}</button>)}
        </div>
        <div className="chips">
          {(['all', 'win', 'draw', 'loss'] as const).map(o => <button key={o} type="button" className={`chip ${filter.outcome === o ? 'active' : ''}`} aria-pressed={filter.outcome === o} onClick={() => set({ outcome: o })} data-testid={`lib-out-${o}`}>{t(`library.f.out.${o}`)}</button>)}
        </div>
        <input type="search" value={filter.q} placeholder={t('library.f.search')} aria-label={t('library.f.search')} onChange={e => set({ q: e.target.value })} data-testid="lib-search" />
      </div>

      {list.length === 0 ? <p className="muted" data-testid="lib-none">{t('library.list.none')}</p> : <ul className="session-list lib-list" data-testid="lib-list">
        {list.slice(0, shown).map(g => {
          const o = outcomeFor(g, lib.nicks), c = colorOf(g, lib.nicks)
          return <li key={g.key} data-testid="lib-row" data-outcome={o ?? 'unknown'}>
            <span>{g.date ? fmtDate(Date.parse(g.date)) : '—'}</span>
            <span className="lib-players" title={`${g.white} – ${g.black}`}>{c === 'w' ? <b>{g.white}</b> : g.white} – {c === 'b' ? <b>{g.black}</b> : g.black}</span>
            <span className={`lib-out ${o ?? ''}`}>{t(`library.out.${o ?? 'unknown'}`)}</span>
            <button className="btn open-btn" onClick={() => open(g)} title={t('library.row.openTitle')} data-testid="lib-open">{t('library.row.open')}</button>
            <button className="link-btn" onClick={() => remove(g)} title={t('library.row.deleteTitle')} data-testid="lib-del">{t('library.row.delete')}</button>
          </li>
        })}
      </ul>}
      {list.length > shown && <button type="button" className="btn quiet" onClick={() => setShown(n => n + PAGE)} data-testid="lib-more">{t('library.more', { n: list.length - shown })}</button>}
      <div className="progress-note">{t('library.note', { max: MAX_GAMES })} <button className="link-btn" onClick={clear} data-testid="lib-clear">{t('library.clear')}</button></div>
    </>}
  </section>
}
