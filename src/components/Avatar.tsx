import type { Profile } from '../lib/profile'

/** Круглая аватарка: загруженное фото или эмодзи на цветном фоне. */
export default function Avatar({ profile, size = 36 }: { profile: Pick<Profile, 'name' | 'avatar'>; size?: number }) {
  const a = profile.avatar
  return <span className="avatar" style={{ width: size, height: size, background: a.image ? 'var(--n4)' : a.color, fontSize: size * 0.5 }} aria-hidden="true">
    {a.image ? <img src={a.image} alt="" /> : <span>{a.emoji}</span>}
  </span>
}
