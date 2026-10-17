import { useCallback, useEffect, useRef, useState } from 'react'
import OpeningsLessons from '../components/OpeningsLessons'
import OpeningsStudy from '../components/OpeningsStudy'
import OpeningsTrainer from '../components/OpeningsTrainer'
import { buildCatalog, type Catalog } from '../lib/openings'
import { exportOpenings, importOpenings, loadOpenings, saveOpenings, type OpeningsData } from '../lib/openingsStore'

type Sub = 'lessons' | 'study' | 'train'

export default function OpeningsView({ active }: { active: boolean }) {
  const [data, setData] = useState<OpeningsData>(() => loadOpenings())
  const [sub, setSub] = useState<Sub>('lessons')
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const loading = useRef(false)

  // Каталог (≈400 КБ) подгружается при первом открытии вкладки и не входит в основной бандл.
  useEffect(() => {
    if (!active || catalog || loading.current) return
    loading.current = true
    import('../data/openings.json').then(m => setCatalog(buildCatalog(m.default as unknown as [string, string, string][]))).catch(() => { loading.current = false; setError('Не удалось загрузить каталог дебютов.') })
  }, [active, catalog])

  useEffect(() => { saveOpenings(data) }, [data])

  const update = useCallback((fn: (d: OpeningsData) => OpeningsData) => setData(d => fn(d)), [])

  function download() {
    const url = URL.createObjectURL(new Blob([exportOpenings(data)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'chess-coach-repertoire.json'; a.click(); URL.revokeObjectURL(url)
  }
  async function upload(file: File | undefined) {
    if (!file) return
    try { setData(importOpenings(await file.text())); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось прочитать файл.') }
  }

  return <div data-testid="openings-view">
    <div className="chips sub-tabs">
      <button className={`chip ${sub === 'lessons' ? 'active' : ''}`} onClick={() => setSub('lessons')} data-testid="sub-lessons">Уроки</button>
      <button className={`chip ${sub === 'study' ? 'active' : ''}`} onClick={() => setSub('study')} data-testid="sub-study">Каталог и репертуар</button>
      <button className={`chip ${sub === 'train' ? 'active' : ''}`} onClick={() => setSub('train')} data-testid="sub-train">Тренировка</button>
      <span className="grow" />
      <button className="btn" onClick={download} data-testid="rep-export">⬇ Сохранить репертуар (файл)</button>
      <label className="btn file-btn">⬆ Загрузить
        <input type="file" accept=".json,application/json" hidden onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      </label>
    </div>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div hidden={sub !== 'lessons'}><OpeningsLessons data={data} update={update} active={active && sub === 'lessons'} /></div>
    <div hidden={sub !== 'study'}><OpeningsStudy catalog={catalog} data={data} update={update} /></div>
    <div hidden={sub !== 'train'}><OpeningsTrainer data={data} update={update} active={active && sub === 'train'} /></div>
  </div>
}
