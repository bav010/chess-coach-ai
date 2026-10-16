import { formatClock } from '../lib/clock'

type Props = { ms: number; active: boolean; label: string }

export default function ClockView({ ms, active, label }: Props) {
  return <span className={`clock ${active ? 'active' : ''} ${ms < 10_000 ? 'low' : ''}`} aria-label={`Часы: ${label}`} data-ms={Math.round(ms)}>
    {formatClock(ms)}
  </span>
}
