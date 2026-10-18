import { useRef, useState } from 'react'
import Avatar from '../components/Avatar'
import BackupPanel from '../components/BackupPanel'
import CloudPanel from '../components/CloudPanel'
import type { CloudApi } from '../hooks/useCloud'
import StatsView from './StatsView'
import type { GameStat } from '../lib/gameStats'
import {
  AVATAR_COLORS, AVATAR_EMOJI, NAME_MAX, createProfile, deleteProfile, imageToAvatar, switchProfile, updateProfile,
  type Avatar as AvatarT, type ProfileStore,
} from '../lib/profile'

type Go = 'tactics' | 'openings' | 'analysis' | 'play'
type Tab = 'stats' | 'profile' | 'cloud' | 'data'
type Props = {
  active: boolean
  games: GameStat[]
  profiles: ProfileStore
  cloud: CloudApi
  onProfiles: (s: ProfileStore) => void
  onGo: (m: Go) => void
  onBack: () => void
  onResetGames: () => void
}

/** Страница аккаунта: статистика, настройки профиля (имя, аватарка), данные и список аккаунтов на устройстве. */
export default function AccountView({ active, games, profiles, cloud, onProfiles, onGo, onBack, onResetGames }: Props) {
  const [tab, setTab] = useState<Tab>('stats')
  const me = profiles.list.find(p => p.id === profiles.current) ?? profiles.list[0]
  const [name, setName] = useState(me.name)
  const [err, setErr] = useState('')
  const [newName, setNewName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const setAvatar = (a: AvatarT) => onProfiles(updateProfile(me.id, { avatar: a }))
  function saveName() {
    const s = updateProfile(me.id, { name }); onProfiles(s)
    setName(s.list.find(p => p.id === me.id)?.name ?? me.name)
  }
  async function pickImage(f: File | undefined) {
    if (!f) return
    try { setErr(''); setAvatar({ ...me.avatar, image: await imageToAvatar(f) }) } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
    if (fileRef.current) fileRef.current.value = ''
  }
  function add() {
    const s = createProfile(newName, { emoji: AVATAR_EMOJI[profiles.list.length % AVATAR_EMOJI.length], color: AVATAR_COLORS[profiles.list.length % AVATAR_COLORS.length] })
    setNewName(''); onProfiles(s)
  }
  function remove(id: string) {
    const p = profiles.list.find(x => x.id === id)
    if (!p || !window.confirm(`Удалить аккаунт «${p.name}» вместе со всей статистикой, задачами и дебютами? Это нельзя отменить.`)) return
    const wasCurrent = id === profiles.current
    const s = deleteProfile(id)
    if (wasCurrent) switchProfile(s.current); else onProfiles(s)
  }

  return <div className="acc-page" data-testid="account-view">
    <section className="panel acc-head">
      <button className="btn" onClick={onBack} data-testid="account-back">← Назад</button>
      <Avatar profile={me} size={64} />
      <div className="acc-who"><b data-testid="account-name">{me.name}</b><small data-testid="account-kind">{me.cloud && cloud.status === 'in' ? `Облачный аккаунт · ${me.cloud.email}` : me.cloud ? `Привязан к ${me.cloud.email} · сейчас без входа` : 'Локальный аккаунт · данные хранятся в этом браузере'}</small></div>
    </section>
    <nav className="tabs acc-tabs" role="tablist" aria-label="Аккаунт">
      {([['stats', 'Статистика'], ['profile', 'Профиль и аватар'], ['cloud', 'Вход и облако'], ['data', 'Данные и аккаунты']] as [Tab, string][]).map(([k, l]) =>
        <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} data-testid={`acc-tab-${k}`}>{l}</button>)}
    </nav>

    <div hidden={tab !== 'stats'}><StatsView active={active && tab === 'stats'} games={games} onGo={onGo} /></div>

    {tab === 'profile' && <section className="panel acc-form" data-testid="acc-profile">
      <div className="panel-head"><div><div className="eyebrow">НАСТРОЙКИ АККАУНТА</div><h2>Профиль</h2></div></div>
      <label className="field">Имя
        <span className="acc-row"><input type="text" value={name} maxLength={NAME_MAX} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveName() }} data-testid="acc-name-input" />
          <button className="btn primary" onClick={saveName} disabled={name.trim() === '' || name.trim() === me.name} data-testid="acc-name-save">Сохранить</button></span>
      </label>
      <div className="sub-head">Аватарка</div>
      <div className="acc-avatar-edit">
        <Avatar profile={me} size={84} />
        <div>
          <div className="acc-emoji" role="group" aria-label="Эмодзи">{AVATAR_EMOJI.map(e => <button key={e} className={`chip ${!me.avatar.image && me.avatar.emoji === e ? 'active' : ''}`} onClick={() => setAvatar({ emoji: e, color: me.avatar.color })} data-testid={`emoji-${e}`} aria-label={`Эмодзи ${e}`}>{e}</button>)}</div>
          <div className="acc-colors" role="group" aria-label="Цвет">{AVATAR_COLORS.map(c => <button key={c} className={`swatch ${me.avatar.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setAvatar({ emoji: me.avatar.emoji, color: c })} aria-label={`Цвет ${c}`} data-testid={`color-${c.slice(1)}`} />)}</div>
          <div className="board-actions" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => fileRef.current?.click()} data-testid="avatar-upload">📷 Загрузить фото</button>
            {me.avatar.image && <button className="btn" onClick={() => setAvatar({ emoji: me.avatar.emoji, color: me.avatar.color })} data-testid="avatar-remove">Убрать фото</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden data-testid="avatar-file" onChange={e => void pickImage(e.target.files?.[0])} />
          </div>
          <p className="tiny">Фото сжимается до маленького квадрата и хранится только в этом браузере.</p>
          {err && <p className="tiny" role="alert" style={{ color: '#ff7a7a' }}>{err}</p>}
        </div>
      </div>
    </section>}

    {tab === 'cloud' && <CloudPanel cloud={cloud} />}

    {tab === 'data' && <>
      <BackupPanel hasGames={games.length > 0} onResetGames={onResetGames} />
      <section className="panel" data-testid="acc-list">
        <div className="panel-head"><div><div className="eyebrow">НА ЭТОМ УСТРОЙСТВЕ</div><h2>Аккаунты</h2></div></div>
        <p className="tiny">У каждого аккаунта своя статистика, партии, задачи, дебюты и настройки. Локальные аккаунты без пароля — это разделение данных на устройстве. Чтобы войти с другого устройства, привяжите аккаунт к почте на вкладке «Вход и облако».</p>
        <ul className="acc-list">{profiles.list.map(p => <li key={p.id} className={p.id === profiles.current ? 'current' : ''} data-testid={`acc-item-${p.id}`}>
          <Avatar profile={p} size={32} /><span>{p.name}{p.cloud && <em> · {p.cloud.email}</em>}{p.id === profiles.current && <em> · текущий</em>}</span>
          {p.id !== profiles.current && <button className="btn" onClick={() => switchProfile(p.id)} data-testid={`acc-switch-${p.id}`}>Войти</button>}
          {p.id !== 'default' && <button className="btn" onClick={() => remove(p.id)} data-testid={`acc-delete-${p.id}`}>Удалить</button>}
        </li>)}</ul>
        <div className="acc-row" style={{ marginTop: 12 }}>
          <input type="text" placeholder="Имя нового аккаунта" value={newName} maxLength={NAME_MAX} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) add() }} data-testid="acc-new-name" />
          <button className="btn primary" onClick={add} disabled={!newName.trim()} data-testid="acc-add">＋ Создать аккаунт</button>
        </div>
      </section>
    </>}
  </div>
}

