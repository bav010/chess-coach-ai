import { useCallback, useEffect, useRef, useState } from 'react'
import OpeningsLessons from '../components/OpeningsLessons'
import OpeningsStudy from '../components/OpeningsStudy'
import OpeningsTrainer from '../components/OpeningsTrainer'
import OpeningsMine from '../components/OpeningsMine'
import type { SavedSession } from '../storage'
import { buildCatalog, type Catalog } from '../lib/openings'
import { syncLessons } from '../lib/lessonSync'
import { useI18n } from '../i18n'
import { errorText } from '../i18n/errors'
import { markActive } from '../lib/activity'
import { exportOpenings, importOpenings, loadOpenings, saveOpenings, type OpeningsData } from '../lib/openingsStore'
import Icon from '../components/Icon'

type Sub = 'lessons' | 'study' | 'train' | 'mine'
const SUBS: readonly Sub[] = ['lessons', 'study', 'train', 'mine']

export default function OpeningsView({ active, arg = null, sessions = [] }: { active: boolean; arg?: string | null; sessions?: readonly SavedSession[] }) {
  const { t } = useI18n()
  const [data, setData] = useState<OpeningsData>(() => loadOpenings())
  const [sub, setSub] = useState<Sub>('lessons')
  // #/openings/mine, #/openings/train… открывают нужную вкладку
  useEffect(() => { if (arg && (SUBS as readonly string[]).includes(arg)) setSub(arg as Sub) }, [arg])
  const [lessonTitle, setLessonTitle] = useState<string | null>(null)
  const [studyTitle, setStudyTitle] = useState<string | null>(null)
  const [leave, setLeave] = useState(0)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<{ key: 'openings.view.loadError' } | { err: unknown } | null>(null)
  const loading = useRef(false)

  // Каталог (≈400 КБ) подгружается при первом открытии вкладки и не входит в основной бандл.
  useEffect(() => {
    if (!active || catalog || loading.current) return
    loading.current = true
    import('../data/openings.json').then(m => setCatalog(buildCatalog(m.default as unknown as [string, string, string][]))).catch(() => { loading.current = false; setError({ key: 'openings.view.loadError' }) })
  }, [active, catalog])

  useEffect(() => { saveOpenings(data) }, [data])
  // пройденные уроки автоматически попадают в репертуар и считаются выученными
  useEffect(() => { const s = syncLessons(data); if (s !== data) setData(s) }, [data])

  const update = useCallback((fn: (d: OpeningsData) => OpeningsData) => { markActive(); setData(d => fn(d)) }, [])

  function download() {
    const url = URL.createObjectURL(new Blob([exportOpenings(data)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'chess-coach-repertoire.json'; a.click(); URL.revokeObjectURL(url)
  }
  async function upload(file: File | undefined) {
    if (!file) return
    try { setData(importOpenings(await file.text())); setError(null) } catch (e) { setError({ err: e }) }
  }

  return <div data-testid="openings-view">
    <div className="sub-tabs-bar">
      <div className="tabs" role="tablist" aria-label={t('openings.view.tabsAria')}>
        {([['lessons', 'openings'], ['study', 'search'], ['train', 'refresh'], ['mine', 'stats']] as const).map(([id, ic]) =>
          <button key={id} role="tab" className={`tab ${sub === id ? 'active' : ''}`} aria-selected={sub === id} onClick={() => setSub(id)} data-testid={`sub-${id}`}><Icon name={ic} size={16} /><span>{t(`openings.view.sub.${id}` as 'openings.view.sub.lessons')}</span></button>)}
      </div>
      <span className="grow" />
      <button className="btn quiet" onClick={download} data-testid="rep-export" title={t('openings.view.export')}><Icon name="download" size={16} /><span className="btn-label">{t('openings.view.export')}</span></button>
      <label className="btn quiet file-btn" title={t('openings.view.import')}><Icon name="upload" size={16} /><span className="btn-label">{t('openings.view.import')}</span>
        <input type="file" accept=".json,application/json" hidden onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      </label>
    </div>
    <nav className="crumbs" aria-label={t('openings.crumb.aria')} data-testid="crumbs">
      <Icon name="openings" size={15} /><span>{t('app.mode.openings')}</span>
      <Icon name="next" size={13} className="crumb-sep" />
      {sub === 'lessons' && (lessonTitle
        ? <><button type="button" className="crumb-link" onClick={() => setLeave(n => n + 1)} data-testid="crumb-lessons">{t('openings.view.sub.lessons')}</button><Icon name="next" size={13} className="crumb-sep" /><b aria-current="page" data-testid="crumb-leaf">{lessonTitle}</b></>
        : <b aria-current="page">{t('openings.view.sub.lessons')}</b>)}
      {sub === 'study' && (studyTitle
        ? <><span>{t('openings.view.sub.study')}</span><Icon name="next" size={13} className="crumb-sep" /><b aria-current="page" data-testid="crumb-leaf">{studyTitle}</b></>
        : <b aria-current="page">{t('openings.view.sub.study')}</b>)}
      {sub === 'train' && <b aria-current="page">{t('openings.view.sub.train')}</b>}
      {sub === 'mine' && <b aria-current="page">{t('openings.view.sub.mine')}</b>}
    </nav>
    {error && <p className="error-text" role="alert">{'key' in error ? t(error.key) : errorText(error.err, 'openings.view.readError')}</p>}
    <div hidden={sub !== 'lessons'}><OpeningsLessons data={data} update={update} active={active && sub === 'lessons'} onLesson={setLessonTitle} leaveKey={leave} /></div>
    <div hidden={sub !== 'study'}><OpeningsStudy catalog={catalog} data={data} update={update} onTitle={setStudyTitle} /></div>
    <div hidden={sub !== 'mine'}><OpeningsMine catalog={catalog} sessions={sessions} /></div>
    <div hidden={sub !== 'train'}><OpeningsTrainer data={data} update={update} active={active && sub === 'train'} /></div>
  </div>
}
