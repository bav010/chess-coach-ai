import { summarize, type SavedSession } from '../storage'
import { fmtDate, useI18n } from '../i18n'

type Props = {
  sessions: SavedSession[]
  onDownload: (s: SavedSession) => void
  /** Открыть сохранённую партию в режиме анализа одним кликом. */
  onOpen: (s: SavedSession) => void
  onReset: () => void
}

/** Панель прогресса (сессии в localStorage). Разметка и тексты — как в исходном приложении. */
export default function ProgressPanel({ sessions, onDownload, onOpen, onReset }: Props) {
  const { t } = useI18n()
  const stats = summarize(sessions)
  return <section className="panel progress-panel">
    <div className="panel-head"><div><div className="eyebrow">{t('analysis.progress.eyebrow')}</div><h2>{t('analysis.progress.title')}</h2></div><span className="progress-icon">↗</span></div>
    <div className="stats">
      <div><strong>{stats.sessions}</strong><small>{t('analysis.progress.sessions')}</small></div>
      <div><strong>{stats.plies}</strong><small>{t('analysis.progress.plies')}</small></div>
    </div>
    {sessions.length > 0 && <ul className="session-list">
      {sessions.map(s => <li key={s.id}>
        <span>{fmtDate(Date.parse(s.created_at))}</span>
        <span>{s.result === 'in_progress' ? t('analysis.progress.unfinished') : s.result}</span>
        <span>{s.plies} {t('analysis.progress.pliesShort')}</span>
        <button className="link-btn" onClick={() => onDownload(s)}>PGN</button>
        <button className="btn open-btn" onClick={() => onOpen(s)} data-testid="open-session" title={t('analysis.progress.openTitle')}>{t('analysis.progress.open')}</button>
      </li>)}
    </ul>}
    <div className="progress-note">{t('analysis.progress.note')}
      {sessions.length > 0 && <> <button className="link-btn" onClick={onReset}>{t('analysis.progress.reset')}</button></>}</div>
  </section>
}
