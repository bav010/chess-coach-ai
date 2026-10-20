import { useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { errorText } from '../i18n/errors'
import { applyBackup, makeBackup, parseBackup } from '../lib/backup'

/** Резервная копия прогресса текущего аккаунта: скачать, восстановить, сбросить статистику партий. */
export default function BackupPanel({ hasGames, onResetGames }: { hasGames: boolean; onResetGames: () => void }) {
  const { t } = useI18n()
  // сообщение хранится как функция, чтобы смена языка обновляла его
  const [msg, setMsg] = useState<(() => string) | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function download() {
    const blob = new Blob([JSON.stringify(makeBackup(), null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `chess-coach-ai-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click()
    URL.revokeObjectURL(url)
    setMsg(() => () => t('stats.backup.downloaded'))
  }

  async function restore(file: File | undefined) {
    if (!file) return
    try {
      const b = parseBackup(await file.text())
      const withTrainers = window.confirm(t('stats.backup.confirmTrainers'))
      const r = applyBackup(b, withTrainers)
      setMsg(() => () => t('stats.backup.done', { n: r.games }))
      window.setTimeout(() => window.location.reload(), 700)
    } catch (e) { setMsg(() => () => errorText(e, 'stats.backup.failed')) }
    if (fileRef.current) fileRef.current.value = ''
  }

  return <section className="panel">
    <div className="panel-head"><div><div className="eyebrow">{t('stats.backup.eyebrow')}</div><h2>{t('stats.backup.title')}</h2></div></div>
    <p className="tiny">{t('stats.backup.text')}</p>
    <div className="board-actions" style={{ marginTop: 10 }}>
      <button className="btn primary" onClick={download} data-testid="backup-download">{t('stats.backup.download')}</button>
      <button className="btn" onClick={() => fileRef.current?.click()} data-testid="backup-restore">{t('stats.backup.restore')}</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden data-testid="backup-file" onChange={e => void restore(e.target.files?.[0])} />
      {hasGames && <button className="btn" onClick={() => { if (window.confirm(t('stats.backup.confirmReset'))) onResetGames() }} data-testid="stats-reset">{t('stats.backup.reset')}</button>}
    </div>
    {msg && <p className="tiny" role="status" data-testid="backup-msg">{msg()}</p>}
  </section>
}
