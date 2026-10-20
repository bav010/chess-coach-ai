import { useRef, useState } from 'react'
import Avatar from '../components/Avatar'
import BackupPanel from '../components/BackupPanel'
import CloudPanel from '../components/CloudPanel'
import LanguageSwitch from '../components/LanguageSwitch'
import type { CloudApi } from '../hooks/useCloud'
import StatsView from './StatsView'
import type { GameStat } from '../lib/gameStats'
import {
  AVATAR_COLORS, AVATAR_EMOJI, NAME_MAX, imageToAvatar, updateProfile,
  type Avatar as AvatarT, type Profile, type ProfileStore,
} from '../lib/profile'
import { useI18n } from '../i18n'
import { errorText } from '../i18n/errors'

type Go = 'tactics' | 'openings' | 'analysis' | 'play'
type Tab = 'stats' | 'profile' | 'settings' | 'data'
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

const isPlaceholder = (n: string) => n === 'Player' || n === 'Игрок'

/** Имя и аватарка. В режиме setup имя сохраняется кнопкой «Продолжить» родителя через onReady. */
function ProfileEditor({ me, onProfiles, setup, defaultName, onReady }: { me: Profile; onProfiles: (s: ProfileStore) => void; setup?: boolean; defaultName?: string; onReady?: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(setup && isPlaceholder(me.name) && defaultName ? defaultName : me.name)
  const [err, setErr] = useState<unknown>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const setAvatar = (a: AvatarT) => onProfiles(updateProfile(me.id, { avatar: a }))
  function saveName() {
    const s = updateProfile(me.id, { name }); onProfiles(s)
    setName(s.list.find(p => p.id === me.id)?.name ?? me.name)
  }
  function finish() { onProfiles(updateProfile(me.id, { name, ready: true })); onReady?.() }
  async function pickImage(f: File | undefined) {
    if (!f) return
    try { setErr(null); setAvatar({ ...me.avatar, image: await imageToAvatar(f) }) } catch (e) { setErr(e) }
    if (fileRef.current) fileRef.current.value = ''
  }
  return <>
    <label className="field">{t('app.profile.name')}
      <span className="acc-row"><input type="text" value={name} maxLength={NAME_MAX} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (setup ? finish() : saveName()) }} data-testid="acc-name-input" />
        {!setup && <button className="btn primary" onClick={saveName} disabled={name.trim() === '' || name.trim() === me.name} data-testid="acc-name-save">{t('app.profile.save')}</button>}</span>
    </label>
    <div className="sub-head">{t('app.profile.avatar')}</div>
    <div className="acc-avatar-edit">
      <Avatar profile={me} size={84} />
      <div>
        <div className="acc-emoji" role="group" aria-label={t('app.profile.emojiGroup')}>{AVATAR_EMOJI.map(e => <button key={e} className={`chip ${!me.avatar.image && me.avatar.emoji === e ? 'active' : ''}`} onClick={() => setAvatar({ emoji: e, color: me.avatar.color })} data-testid={`emoji-${e}`} aria-label={t('app.profile.emoji', { e })}>{e}</button>)}</div>
        <div className="acc-colors" role="group" aria-label={t('app.profile.colorGroup')}>{AVATAR_COLORS.map(c => <button key={c} className={`swatch ${me.avatar.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setAvatar({ emoji: me.avatar.emoji, color: c })} aria-label={t('app.profile.color', { c })} data-testid={`color-${c.slice(1)}`} />)}</div>
        <div className="board-actions" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => fileRef.current?.click()} data-testid="avatar-upload">{t('app.profile.upload')}</button>
          {me.avatar.image && <button className="btn" onClick={() => setAvatar({ emoji: me.avatar.emoji, color: me.avatar.color })} data-testid="avatar-remove">{t('app.profile.removePhoto')}</button>}
          <input ref={fileRef} type="file" accept="image/*" hidden data-testid="avatar-file" onChange={e => void pickImage(e.target.files?.[0])} />
        </div>
        <p className="tiny">{t('app.profile.photoNote')}</p>
        {err !== null && <p className="tiny" role="alert" style={{ color: '#ff7a7a' }}>{errorText(err, 'app.err.generic')}</p>}
      </div>
    </div>
    {setup && <div className="board-actions"><button className="btn primary" onClick={finish} disabled={name.trim() === ''} data-testid="setup-done">{t('app.setup.continue')}</button></div>}
  </>
}

/**
 * Страница аккаунта. Порядок: вход или регистрация по почте → настройка (имя и аватарка) → статистика и настройки.
 * Если облако не подключено в сборке (cloud.status === 'off'), работает локальный режим без входа.
 */
export default function AccountView({ active, games, profiles, cloud, onProfiles, onGo, onBack, onResetGames }: Props) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('stats')
  const me = profiles.list.find(p => p.id === profiles.current) ?? profiles.list[0]
  const head = <section className="panel acc-head">
    <button className="btn" onClick={onBack} data-testid="account-back">{t('app.acc.back')}</button>
    {cloud.status === 'in' || cloud.status === 'off' ? <><Avatar profile={me} size={64} />
      <div className="acc-who"><b data-testid="account-name">{me.name}</b><small data-testid="account-kind">{me.cloud ? t('app.acc.kind.cloud', { email: me.cloud.email }) : t('app.acc.kind.local')}</small></div></> : null}
  </section>

  // 1. ссылка «сбросить пароль» или вход / регистрация
  if (cloud.recovery || cloud.status === 'loading' || cloud.status === 'out') return <div className="acc-page" data-testid="account-view">
    {head}
    {!cloud.recovery && cloud.status === 'out' && <section className="panel" data-testid="acc-gate">
      <div className="panel-head"><div><div className="eyebrow">{t('app.acc.gate.eyebrow')}</div><h2>{t('app.acc.gate.title')}</h2></div></div>
      <p className="tiny">{t('app.acc.gate.text')}</p>
    </section>}
    <CloudPanel cloud={cloud} view="form" />
  </div>

  // 2. настройка аккаунта (имя и аватарка) — до неё статистика недоступна
  if (cloud.status === 'in' && !me.ready) return <div className="acc-page" data-testid="account-view">
    {head}
    <section className="panel acc-form" data-testid="acc-setup">
      <div className="panel-head"><div><div className="eyebrow">{t('app.setup.eyebrow')}</div><h2>{t('app.setup.title')}</h2></div></div>
      <p className="tiny">{t('app.setup.text')}</p>
      <ProfileEditor key={me.id} me={me} onProfiles={onProfiles} setup defaultName={cloud.user?.email.split('@')[0]} onReady={() => setTab('stats')} />
    </section>
  </div>

  // 3. аккаунт готов
  const tabs: [Tab, string][] = [['stats', t('app.acc.tab.stats')], ['profile', t('app.acc.tab.profile')], ['settings', t('app.acc.tab.settings')], ['data', t('app.acc.tab.data')]]
  return <div className="acc-page" data-testid="account-view">
    {head}
    <nav className="tabs acc-tabs" role="tablist" aria-label={t('app.acc.tabs.aria')}>
      {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} data-testid={`acc-tab-${k}`}>{l}</button>)}
    </nav>

    <div hidden={tab !== 'stats'}><StatsView active={active && tab === 'stats'} games={games} onGo={onGo} /></div>

    {tab === 'profile' && <section className="panel acc-form" data-testid="acc-profile">
      <div className="panel-head"><div><div className="eyebrow">{t('app.profile.eyebrow')}</div><h2>{t('app.profile.title')}</h2></div></div>
      <ProfileEditor key={me.id} me={me} onProfiles={onProfiles} />
    </section>}

    {tab === 'settings' && <>
      <section className="panel acc-form" data-testid="acc-settings">
        <div className="panel-head"><div><div className="eyebrow">{t('app.settings.eyebrow')}</div><h2>{t('app.settings.language')}</h2></div></div>
        <LanguageSwitch />
        <p className="tiny">{t('app.settings.languageNote')}</p>
      </section>
      <CloudPanel cloud={cloud} view="manage" />
    </>}

    {tab === 'data' && <>
      <p className="tiny">{t('app.data.note')}</p>
      <BackupPanel hasGames={games.length > 0} onResetGames={onResetGames} />
    </>}
  </div>
}
