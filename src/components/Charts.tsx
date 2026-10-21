// Небольшие SVG-графики без сторонних библиотек.
import { useState } from 'react'
import { useI18n } from '../i18n'

export type Pt = { y: number; label: string }
export type Series = { name: string; color: string; pts: Pt[]; dashed?: boolean }

const W = 640, H = 200, PL = 40, PR = 12, PT = 12, PB = 24

function nice(min: number, max: number): [number, number] {
  if (min === max) { min -= 1; max += 1 }
  const pad = (max - min) * 0.1
  return [min - pad, max + pad]
}

/** Линейный график: по оси X — номер партии (по порядку), по Y — значение. */
export function LineChart({ series, yMin, yMax, unit = '', label }: { series: Series[]; yMin?: number; yMax?: number; unit?: string; label: string }) {
  const { t } = useI18n()
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null)
  const all = series.flatMap(s => s.pts.map(p => p.y))
  if (all.length === 0) return <div className="st-empty">{t('stats.chart.noData')}</div>
  const [lo, hi] = nice(yMin ?? Math.min(...all), yMax ?? Math.max(...all))
  const lo2 = yMin ?? lo, hi2 = yMax ?? hi
  const n = Math.max(...series.map(s => s.pts.length))
  const x = (i: number) => (n <= 1 ? (PL + W - PR) / 2 : PL + (i / (n - 1)) * (W - PL - PR))
  const y = (v: number) => PT + (1 - (v - lo2) / (hi2 - lo2)) * (H - PT - PB)
  const ticks = [0, 1, 2, 3].map(k => lo2 + ((hi2 - lo2) * k) / 3)
  const hp = hover ? series[hover.s].pts[hover.i] : null
  return <div className="st-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
      {ticks.map((t, k) => <g key={k}><line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--n6)" strokeWidth="1" />
        <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--n10)" fontFamily="DM Mono,monospace">{Math.round(t)}</text></g>)}
      <text x={PL} y={H - 6} fontSize="9" fill="var(--n10)" fontFamily="DM Mono,monospace">{t('stats.chart.game1')}</text>
      <text x={W - PR} y={H - 6} textAnchor="end" fontSize="9" fill="var(--n10)" fontFamily="DM Mono,monospace">{t('stats.chart.gameN', { n })}</text>
      {series.map((s, si) => <g key={s.name}>
        <polyline fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.6 : 2.2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" points={s.pts.map((p, i) => `${x(i)},${y(p.y)}`).join(' ')} />
        {!s.dashed && s.pts.map((p, i) => <g key={i}>
          <circle cx={x(i)} cy={y(p.y)} r={hover && hover.s === si && hover.i === i ? 5 : 3} fill={s.color} />
          <circle cx={x(i)} cy={y(p.y)} r="9" fill="transparent" onMouseEnter={() => setHover({ s: si, i })} onClick={() => setHover({ s: si, i })}><title>{`${p.label}: ${Math.round(p.y)}${unit}`}</title></circle>
        </g>)}
      </g>)}
    </svg>
    <div className="st-legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
      {hp && <b className="st-hover">{hp.label}: {Math.round(hp.y)}{unit}</b>}</div>
  </div>
}

export type Stack = { label: string; parts: { v: number; color: string; name: string }[] }

/** Столбики с накоплением: по одному на партию. */
export function StackedBars({ bars, label }: { bars: Stack[]; label: string }) {
  const { t } = useI18n()
  if (bars.length === 0) return <div className="st-empty">{t('stats.chart.noData')}</div>
  const max = Math.max(1, ...bars.map(b => b.parts.reduce((s, p) => s + p.v, 0)))
  const bw = Math.min(24, (W - PL - PR) / bars.length - 2)
  const x = (i: number) => PL + (i + 0.5) * ((W - PL - PR) / bars.length)
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB)
  const names = Array.from(new Map(bars.flatMap(b => b.parts).map(p => [p.name, p.color])).entries())
  return <div className="st-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, 1, 2, 3].map(k => { const t = (max * k) / 3; return <g key={k}><line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--n6)" /><text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--n10)" fontFamily="DM Mono,monospace">{Math.round(t)}</text></g> })}
      {bars.map((b, i) => { let acc = 0; return <g key={i}>
        {b.parts.map(p => { const y0 = y(acc), y1 = y(acc + p.v); acc += p.v; return p.v > 0 ? <rect key={p.name} x={x(i) - bw / 2} y={y1} width={bw} height={y0 - y1} fill={p.color}><title>{`${b.label}: ${p.name} — ${p.v}`}</title></rect> : null })}
      </g> })}
      <text x={PL} y={H - 6} fontSize="9" fill="var(--n10)" fontFamily="DM Mono,monospace">{t('stats.chart.game1')}</text>
      <text x={W - PR} y={H - 6} textAnchor="end" fontSize="9" fill="var(--n10)" fontFamily="DM Mono,monospace">{t('stats.chart.gameN', { n: bars.length })}</text>
    </svg>
    <div className="st-legend">{names.map(([n, c]) => <span key={n}><i style={{ background: c }} />{n}</span>)}</div>
  </div>
}

/** Полоса результатов: победы / ничьи / поражения. */
export function WdlBar({ w, d, l }: { w: number; d: number; l: number }) {
  const { t } = useI18n()
  const n = w + d + l
  if (n === 0) return <div className="st-empty">{t('stats.wdl.noGames')}</div>
  return <div>
    <div className="st-wdl" role="img" aria-label={t('stats.wdl.aria', { w, d, l })}>
      <span style={{ width: `${(w / n) * 100}%`, background: '#d3ff72' }} title={`${t('stats.wdl.wins')}: ${w}`} />
      <span style={{ width: `${(d / n) * 100}%`, background: 'var(--n10)' }} title={`${t('stats.wdl.draws')}: ${d}`} />
      <span style={{ width: `${(l / n) * 100}%`, background: '#ff7a7a' }} title={`${t('stats.wdl.losses')}: ${l}`} />
    </div>
    <div className="st-legend"><span><i style={{ background: '#d3ff72' }} />{t('stats.wdl.wins')} {w}</span><span><i style={{ background: 'var(--n10)' }} />{t('stats.wdl.draws')} {d}</span><span><i style={{ background: '#ff7a7a' }} />{t('stats.wdl.losses')} {l}</span></div>
  </div>
}
