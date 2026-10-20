import { formatClock } from '../lib/clock'
import { useI18n } from '../i18n'

type Props = { ms: number; active: boolean; label: string }

export default function ClockView({ ms, active, label }: Props) {
  const { t } = useI18n()
  return <span className={`clock ${active ? 'active' : ''} ${ms < 10_000 ? 'low' : ''}`} aria-label={t('play.clockLabel', { label })} data-ms={Math.round(ms)}>
    {formatClock(ms)}
  </span>
}
