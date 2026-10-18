import { useRef, useState } from 'react'
import { applyBackup, makeBackup, parseBackup } from '../lib/backup'

/** Резервная копия прогресса текущего аккаунта: скачать, восстановить, сбросить статистику партий. */
export default function BackupPanel({ hasGames, onResetGames }: { hasGames: boolean; onResetGames: () => void }) {
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function download() {
    const blob = new Blob([JSON.stringify(makeBackup(), null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `chess-coach-ai-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click()
    URL.revokeObjectURL(url)
    setMsg('Резервная копия скачана.')
  }

  async function restore(file: File | undefined) {
    if (!file) return
    try {
      const b = parseBackup(await file.text())
      const withTrainers = window.confirm('Восстановить также прогресс задач и дебютов из файла?\n\nОК — заменить текущий прогресс задач и дебютов данными из файла.\nОтмена — только добавить партии и сессии (без дублей).')
      const r = applyBackup(b, withTrainers)
      setMsg(`Готово: партий в статистике — ${r.games}. Страница перезагрузится…`)
      window.setTimeout(() => window.location.reload(), 700)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Не удалось восстановить копию.') }
    if (fileRef.current) fileRef.current.value = ''
  }

  return <section className="panel">
    <div className="panel-head"><div><div className="eyebrow">ДАННЫЕ</div><h2>Резервная копия</h2></div></div>
    <p className="tiny">Партии, статистика, задачи и дебюты этого аккаунта хранятся локально в браузере. Скачайте копию, чтобы перенести данные на другое устройство или не потерять их при очистке браузера. Синхронизации между устройствами нет.</p>
    <div className="board-actions" style={{ marginTop: 10 }}>
      <button className="btn primary" onClick={download} data-testid="backup-download">⬇ Скачать резервную копию</button>
      <button className="btn" onClick={() => fileRef.current?.click()} data-testid="backup-restore">⬆ Восстановить из файла</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden data-testid="backup-file" onChange={e => void restore(e.target.files?.[0])} />
      {hasGames && <button className="btn" onClick={() => { if (window.confirm('Удалить статистику партий этого аккаунта? Задачи, дебюты и сохранённые сессии останутся.')) onResetGames() }} data-testid="stats-reset">Сбросить статистику партий</button>}
    </div>
    {msg && <p className="tiny" role="status" data-testid="backup-msg">{msg}</p>}
  </section>
}
