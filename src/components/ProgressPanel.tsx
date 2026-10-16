import { summarize, type SavedSession } from '../storage'

type Props = {
  sessions: SavedSession[]
  onDownload: (s: SavedSession) => void
  onReset: () => void
}

/** Панель прогресса (сессии в localStorage). Разметка и тексты — как в исходном приложении. */
export default function ProgressPanel({ sessions, onDownload, onReset }: Props) {
  const stats = summarize(sessions)
  return <section className="panel progress-panel">
    <div className="panel-head"><div><div className="eyebrow">ТВОЯ АКАДЕМИЯ</div><h2>Прогресс</h2></div><span className="progress-icon">↗</span></div>
    <div className="stats">
      <div><strong>{stats.sessions}</strong><small>Сессий сохранено</small></div>
      <div><strong>{stats.plies}</strong><small>Полуходов сыграно</small></div>
    </div>
    {sessions.length > 0 && <ul className="session-list">
      {sessions.slice(0, 5).map(s => <li key={s.id}>
        <span>{new Date(s.created_at).toLocaleDateString('ru-RU')}</span>
        <span>{s.result === 'in_progress' ? 'не закончена' : s.result}</span>
        <span>{s.plies} п.</span>
        <button className="link-btn" onClick={() => onDownload(s)}>PGN</button>
      </li>)}
    </ul>}
    <div className="progress-note">Данные хранятся в localStorage этого браузера и не отправляются никуда.
      {sessions.length > 0 && <> <button className="link-btn" onClick={onReset}>Сбросить</button></>}</div>
  </section>
}
