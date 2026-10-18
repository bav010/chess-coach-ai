import { useState } from 'react'
import type { CloudApi } from '../hooks/useCloud'
import { MIN_PASSWORD } from '../lib/cloud'

const fmt = (t: number) => (t ? new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'ещё не синхронизировано')

/** Вход и регистрация по почте и паролю, синхронизация, смена пароля, удаление аккаунта. */
export default function CloudPanel({ cloud }: { cloud: CloudApi }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [newPass, setNewPass] = useState('')
  const [local, setLocal] = useState('')

  if (cloud.status === 'off') return <section className="panel" data-testid="cloud-off">
    <div className="panel-head"><div><div className="eyebrow">ОБЛАКО</div><h2>Вход по почте и паролю</h2></div></div>
    <p className="tiny">Облачные аккаунты в этой сборке не подключены, поэтому работают только локальные аккаунты на этом устройстве. Чтобы включить вход по почте и синхронизацию между устройствами, подключите бесплатный проект Supabase: пошаговая инструкция — в README, раздел «Облачные аккаунты» (файл docs/supabase.sql создаёт нужную таблицу и правила доступа).</p>
  </section>

  if (cloud.status === 'loading') return <section className="panel"><p className="tiny" role="status">Проверяем вход…</p></section>

  const msgs = <>
    {cloud.error && <p className="st-msg bad" role="alert" data-testid="cloud-error">{cloud.error}</p>}
    {cloud.info && <p className="st-msg ok" role="status" data-testid="cloud-info">{cloud.info}</p>}
    {local && <p className="st-msg bad" role="alert">{local}</p>}
  </>

  if (cloud.recovery) return <section className="panel acc-form" data-testid="cloud-recovery">
    <div className="panel-head"><div><div className="eyebrow">ВОССТАНОВЛЕНИЕ</div><h2>Новый пароль</h2></div></div>
    <label className="field">Новый пароль (минимум {MIN_PASSWORD} символов)
      <input type="password" autoComplete="new-password" value={newPass} onChange={e => setNewPass(e.target.value)} data-testid="cloud-newpass" />
    </label>
    <div className="board-actions"><button className="btn primary" disabled={cloud.busy || newPass.length < MIN_PASSWORD} onClick={() => void cloud.newPassword(newPass)} data-testid="cloud-newpass-save">Сохранить пароль</button></div>
    {msgs}
  </section>

  if (cloud.status === 'in' && cloud.user) return <section className="panel acc-form" data-testid="cloud-in">
    <div className="panel-head"><div><div className="eyebrow">ОБЛАЧНЫЙ АККАУНТ</div><h2>Вы вошли</h2></div><span className="pill cloud-pill">● на связи</span></div>
    <p className="st-big" style={{ fontSize: 18 }} data-testid="cloud-email">{cloud.user.email}</p>
    <p className="tiny" data-testid="cloud-last">Последняя синхронизация: {fmt(cloud.lastSync)}. Прогресс отправляется автоматически; на другом устройстве войдите в тот же аккаунт — данные подтянутся сами.</p>
    <div className="board-actions">
      <button className="btn primary" disabled={cloud.busy} onClick={() => void cloud.syncNow()} data-testid="cloud-sync">{cloud.busy ? 'Синхронизирую…' : '⟳ Синхронизировать'}</button>
      <button className="btn" disabled={cloud.busy} onClick={() => void cloud.logout()} data-testid="cloud-logout">Выйти</button>
    </div>
    <p className="tiny">«Выйти» не удаляет данные с этого устройства: они остаются в локальном аккаунте.</p>
    {msgs}
    <details className="acc-details"><summary>Сменить пароль</summary>
      <div className="acc-row" style={{ marginTop: 8 }}>
        <input type="password" autoComplete="new-password" placeholder={`Новый пароль, от ${MIN_PASSWORD} символов`} value={newPass} onChange={e => setNewPass(e.target.value)} data-testid="cloud-changepass" />
        <button className="btn" disabled={cloud.busy || newPass.length < MIN_PASSWORD} onClick={() => { void cloud.newPassword(newPass); setNewPass('') }} data-testid="cloud-changepass-save">Сменить</button>
      </div>
    </details>
    <details className="acc-details danger"><summary>Удалить аккаунт</summary>
      <p className="tiny">Аккаунт и все облачные данные будут удалены безвозвратно. Локальные данные на этом устройстве останутся.</p>
      <button className="btn" disabled={cloud.busy} onClick={() => { if (window.confirm('Удалить облачный аккаунт и все облачные данные? Это нельзя отменить.')) void cloud.removeAccount() }} data-testid="cloud-delete">Удалить аккаунт</button>
    </details>
  </section>

  function submit(e: React.FormEvent) {
    e.preventDefault(); setLocal(''); cloud.clearMessages()
    if (mode === 'register' && password !== password2) { setLocal('Пароли не совпадают.'); return }
    void (mode === 'login' ? cloud.login(email, password) : cloud.register(email, password))
  }

  return <section className="panel acc-form" data-testid="cloud-out">
    <div className="panel-head"><div><div className="eyebrow">ОБЛАКО</div><h2>{mode === 'login' ? 'Вход' : 'Регистрация'}</h2></div></div>
    <div className="tabs" role="tablist" aria-label="Вход или регистрация">
      <button type="button" role="tab" aria-selected={mode === 'login'} className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setLocal(''); cloud.clearMessages() }} data-testid="cloud-mode-login">Вход</button>
      <button type="button" role="tab" aria-selected={mode === 'register'} className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setLocal(''); cloud.clearMessages() }} data-testid="cloud-mode-register">Регистрация</button>
    </div>
    <form onSubmit={submit} className="acc-form" noValidate>
      <label className="field">Почта
        <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="cloud-email-input" />
      </label>
      <label className="field">Пароль{mode === 'register' ? ` (минимум ${MIN_PASSWORD} символов)` : ''}
        <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} data-testid="cloud-pass-input" />
      </label>
      {mode === 'register' && <label className="field">Повторите пароль
        <input type="password" autoComplete="new-password" value={password2} onChange={e => setPassword2(e.target.value)} data-testid="cloud-pass2-input" />
      </label>}
      <div className="board-actions">
        <button type="submit" className="btn primary" disabled={cloud.busy} data-testid="cloud-submit">{cloud.busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
        {mode === 'login' && <button type="button" className="btn" disabled={cloud.busy || !email.trim()} onClick={() => void cloud.forgot(email)} data-testid="cloud-forgot" title="Введите почту, затем нажмите">Забыли пароль?</button>}
      </div>
    </form>
    {msgs}
    <p className="tiny">После входа данные этого устройства (партии, задачи, дебюты) объединятся с облачными и будут доступны на любом устройстве. Пароль хранит сервис Supabase, приложение его не видит.</p>
  </section>
}
