import { useEffect, useMemo, useRef, useState } from 'react'
import Icon, { type IconName } from './Icon'
import { setAppearance } from '../lib/appearance'
import { dailyPuzzle } from '../lib/dailyPuzzle'
import { navigate, type RouteName } from '../lib/route'
import { dictionaries, setLang, useI18n, type Key } from '../i18n'

type Cmd = { id: string; icon: IconName; label: Key; group: 'go' | 'actions'; run: () => void }

const GO: [RouteName, IconName, Key][] = [
  ['home', 'home', 'nav.home'], ['analysis', 'analysis', 'app.mode.analysis'], ['play', 'play', 'app.mode.play'],
  ['tactics', 'tactics', 'app.mode.tactics'], ['openings', 'openings', 'app.mode.openings'], ['stats', 'stats', 'nav.stats'],
  ['profile', 'user', 'nav.profile'], ['account', 'cloud', 'nav.account'], ['settings', 'settings', 'nav.settings'], ['help', 'help', 'nav.help'],
]

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')

/** Окно быстрого перехода (Ctrl/⌘+K): разделы и несколько действий; ищет по названиям на обоих языках. */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [cur, setCur] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const cmds = useMemo<Cmd[]>(() => {
    const list: Cmd[] = GO.map(([r, icon, label]) => ({ id: `go-${r}`, icon, label, group: 'go' as const, run: () => navigate(r) }))
    const daily = dailyPuzzle()
    if (daily) list.push({ id: 'daily', icon: 'tactics', label: 'palette.daily', group: 'actions', run: () => navigate('tactics', daily.id) })
    list.push(
      { id: 'theme-dark', icon: 'moon', label: 'palette.theme.dark', group: 'actions', run: () => setAppearance({ theme: 'dark' }) },
      { id: 'theme-light', icon: 'sun', label: 'palette.theme.light', group: 'actions', run: () => setAppearance({ theme: 'light' }) },
      { id: 'theme-system', icon: 'system', label: 'palette.theme.system', group: 'actions', run: () => setAppearance({ theme: 'system' }) },
      { id: 'lang-en', icon: 'globe', label: 'palette.lang.en', group: 'actions', run: () => setLang('en') },
      { id: 'lang-ru', icon: 'globe', label: 'palette.lang.ru', group: 'actions', run: () => setLang('ru') },
    )
    return list
  }, [])

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    if (words.length === 0) return cmds
    return cmds
      .map(c => {
        const hay = norm(`${dictionaries.en[c.label] ?? ''} ${dictionaries.ru[c.label] ?? ''}`)
        if (!words.every(w => hay.includes(w))) return null
        const first = norm(t(c.label))
        return { c, score: words.every(w => first.startsWith(w)) ? 0 : 1 }
      })
      .filter((x): x is { c: Cmd; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .map(x => x.c)
  }, [q, cmds, t])

  useEffect(() => {
    if (!open) return
    setQ(''); setCur(0)
    const prev = document.activeElement as HTMLElement | null
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => { clearTimeout(id); prev?.focus?.() }
  }, [open])
  useEffect(() => { setCur(0) }, [q])
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }) }, [cur])

  if (!open) return null
  const run = (c: Cmd | undefined) => { if (!c) return; onClose(); c.run() }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCur(i => (results.length ? (i + 1) % results.length : 0)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(i => (results.length ? (i - 1 + results.length) % results.length : 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[cur]) }
  }

  return <div className="cmdk-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} data-testid="cmdk">
    <div className="cmdk" role="dialog" aria-modal="true" aria-label={t('palette.aria')} onKeyDown={onKey}>
      <div className="cmdk-input"><Icon name="search" size={18} />
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={t('palette.placeholder')} aria-label={t('palette.placeholder')}
          role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={results[cur] ? `cmdk-${results[cur].id}` : undefined} data-testid="cmdk-input" autoComplete="off" spellCheck={false} />
        <kbd>Esc</kbd>
      </div>
      <ul className="cmdk-list" id="cmdk-list" role="listbox" aria-label={t('palette.results')} ref={listRef}>
        {results.length === 0 && <li className="cmdk-none" role="presentation">{t('palette.none')}</li>}
        {results.map((c, i) => <li key={c.id} id={`cmdk-${c.id}`} role="option" aria-selected={i === cur} className={`cmdk-item ${i === cur ? 'on' : ''}`}
          onMouseMove={() => setCur(i)} onClick={() => run(c)} data-testid={`cmdk-${c.id}`}>
          <Icon name={c.icon} size={18} /><span>{t(c.label)}</span><small>{t(c.group === 'go' ? 'palette.group.go' : 'palette.group.actions')}</small>
        </li>)}
      </ul>
      <div className="cmdk-foot"><span>{t('palette.hint.nav')}</span><span>{t('palette.hint.enter')}</span><span>{t('palette.hint.esc')}</span></div>
    </div>
  </div>
}
