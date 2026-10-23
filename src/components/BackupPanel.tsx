import { useRef, useState } from 'react'
import { fmtDate, tn, useI18n } from '../i18n'
import { errorText } from '../i18n/errors'
import { applyBackup, describeBackup, makeBackup, parseBackup, type Backup } from '../lib/backup'
import Icon from './Icon'

/** Резервная копия прогресса текущего аккаунта: скачать, восстановить (с предпросмотром, объединяя данные), сбросить статистику партий. */
export default function BackupPanel({ hasGames, onResetGames }: { hasGames: boolean; onResetGames: () => void }) {
  const { t } = useI18n()
  // сообщение хранится как функция, чтобы смена языка обновляла его
  const [msg, setMsg] = useState<(() => string) | null>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [withSettings, setWithSettings] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function download() {
    const blob = new Blob([JSON.stringify(makeBackup(), null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `chess-coach-ai-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click()
    URL.revokeObjectURL(url)
    setMsg(() => () => t('stats.backup.downloaded'))
  }

  async function pick(file: File | undefined) {
    if (!file) return
    try { setPending(parseBackup(await file.text())); setWithSettings(false); setMsg(null) } catch (e) { setPending(null); setMsg(() => () => errorText(e, 'stats.backup.failed')) }
    if (fileRef.current) fileRef.current.value = ''
  }

  function restore() {
    if (!pending) return
    try {
      const r = applyBackup(pending, { settings: withSettings })
      setPending(null)
      setMsg(() => () => t('stats.backup.done', { n: r.games }))
      window.setTimeout(() => window.location.reload(), 700)
    } catch (e) { setMsg(() => () => errorText(e, 'stats.backup.failed')) }
  }

  const info = pending ? describeBackup(pending) : null

  return <section className="panel">
    <div className="panel-head"><div><div className="eyebrow">{t('stats.backup.eyebrow')}</div><h2>{t('stats.backup.title')}</h2></div></div>
    <p className="tiny">{t('stats.backup.text')}</p>
    <div className="board-actions" style={{ marginTop: 10 }}>
      <button className="btn primary" onClick={download} data-testid="backup-download"><Icon name="download" size={16} />{t('stats.backup.download')}</button>
      <button className="btn" onClick={() => fileRef.current?.click()} data-testid="backup-restore"><Icon name="upload" size={16} />{t('stats.backup.restore')}</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden data-testid="backup-file" onChange={e => void pick(e.target.files?.[0])} />
      {hasGames && <button className={`btn danger-quiet ${confirmReset ? 'danger' : ''}`} onClick={() => { if (confirmReset) { setConfirmReset(false); onResetGames() } else setConfirmReset(true) }} onBlur={() => setConfirmReset(false)} data-testid="stats-reset">
        <Icon name={confirmReset ? 'check' : 'trash'} size={16} />{confirmReset ? t('stats.backup.resetConfirm') : t('stats.backup.reset')}</button>}
    </div>
    {confirmReset && <p className="tiny" role="alert">{t('stats.backup.confirmReset')}</p>}
    {info && <div className="backup-preview" role="group" aria-label={t('stats.backup.previewTitle')} data-testid="backup-preview">
      <b>{t('stats.backup.previewTitle')}</b>
      <ul>
        {info.exportedAt && <li>{t('stats.backup.pv.date', { date: fmtDate(Date.parse(info.exportedAt)) })}</li>}
        <li>{tn('stats.backup.pv.games', info.games)}, {tn('stats.backup.pv.sessions', info.sessions)}</li>
        <li>{t('stats.backup.pv.progress', { solved: info.puzzlesSolved, reps: info.repertoires, mistakes: info.mistakes })}</li>
      </ul>
      <p className="tiny">{t('stats.backup.pv.merge')}</p>
      {info.hasSettings && <label className="set-check"><input type="checkbox" checked={withSettings} onChange={e => setWithSettings(e.target.checked)} data-testid="backup-settings" /><span>{t('stats.backup.pv.settings')}</span></label>}
      <div className="board-actions">
        <button className="btn primary" onClick={restore} data-testid="backup-apply"><Icon name="check" size={16} />{t('stats.backup.pv.apply')}</button>
        <button className="btn quiet" onClick={() => setPending(null)} data-testid="backup-cancel">{t('stats.backup.pv.cancel')}</button>
      </div>
    </div>}
    {msg && <p className="tiny" role="status" data-testid="backup-msg">{msg()}</p>}
  </section>
}
