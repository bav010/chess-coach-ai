import { useState } from 'react'
import type { CloudApi } from '../hooks/useCloud'
import { MIN_PASSWORD } from '../lib/cloud'
import { fmtDateTime, useI18n } from '../i18n'
import { msgText } from '../i18n/errors'

/** Вход и регистрация по почте (view="form"), либо управление аккаунтом: состояние синхронизации, смена пароля, выход, удаление (view="manage"). */
export default function CloudPanel({ cloud, view }: { cloud: CloudApi; view: 'form' | 'manage' }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [newPass, setNewPass] = useState('')
  const [mismatch, setMismatch] = useState(false)

  if (cloud.status === 'off') return <section className="panel" data-testid="cloud-off">
    <div className="panel-head"><div><div className="eyebrow">{t('app.cloud.eyebrow')}</div><h2>{t('app.cloud.off.title')}</h2></div></div>
    <p className="tiny">{t('app.cloud.off.text')}</p>
  </section>

  if (cloud.status === 'loading') return <section className="panel"><p className="tiny" role="status">{t('app.cloud.checking')}</p></section>

  const msgs = <>
    {cloud.error && <p className="st-msg bad" role="alert" data-testid="cloud-error">{msgText(cloud.error)}</p>}
    {cloud.info && <p className="st-msg ok" role="status" data-testid="cloud-info">{msgText(cloud.info)}</p>}
    {mismatch && <p className="st-msg bad" role="alert">{t('app.cloud.mismatch')}</p>}
  </>

  if (cloud.recovery) return <section className="panel acc-form" data-testid="cloud-recovery">
    <div className="panel-head"><div><div className="eyebrow">{t('app.cloud.recovery.eyebrow')}</div><h2>{t('app.cloud.recovery.title')}</h2></div></div>
    <label className="field">{t('app.cloud.newPass', { n: MIN_PASSWORD })}
      <input type="password" autoComplete="new-password" value={newPass} onChange={e => setNewPass(e.target.value)} data-testid="cloud-newpass" />
    </label>
    <div className="board-actions"><button className="btn primary" disabled={cloud.busy || newPass.length < MIN_PASSWORD} onClick={() => void cloud.newPassword(newPass)} data-testid="cloud-newpass-save">{t('app.cloud.savePass')}</button></div>
    {msgs}
  </section>

  if (cloud.status === 'in' && cloud.user) {
    if (view === 'form') return null
    return <section className="panel acc-form" data-testid="cloud-in">
      <div className="panel-head"><div><div className="eyebrow">{t('app.cloud.in.eyebrow')}</div><h2>{t('app.cloud.in.title')}</h2></div><span className="pill cloud-pill">{t('app.cloud.in.pill')}</span></div>
      <p className="st-big" style={{ fontSize: 18 }} data-testid="cloud-email">{cloud.user.email}</p>
      <p className="tiny" data-testid="cloud-last">{t('app.cloud.in.syncAuto')} {cloud.busy ? t('app.cloud.syncing') : t('app.cloud.lastSync', { when: cloud.lastSync ? fmtDateTime(cloud.lastSync) : t('app.cloud.never') })}.</p>
      <div className="board-actions">
        <button className="btn" disabled={cloud.busy} onClick={() => void cloud.logout()} data-testid="cloud-logout">{t('app.cloud.logout')}</button>
      </div>
      <p className="tiny">{t('app.cloud.logoutNote')}</p>
      {msgs}
      <details className="acc-details"><summary>{t('app.cloud.changePass')}</summary>
        <div className="acc-row" style={{ marginTop: 8 }}>
          <input type="password" autoComplete="new-password" placeholder={t('app.cloud.changePassPh', { n: MIN_PASSWORD })} value={newPass} onChange={e => setNewPass(e.target.value)} data-testid="cloud-changepass" />
          <button className="btn" disabled={cloud.busy || newPass.length < MIN_PASSWORD} onClick={() => { void cloud.newPassword(newPass); setNewPass('') }} data-testid="cloud-changepass-save">{t('app.cloud.change')}</button>
        </div>
      </details>
      <details className="acc-details danger"><summary>{t('app.cloud.delete.summary')}</summary>
        <p className="tiny">{t('app.cloud.delete.text')}</p>
        <button className="btn" disabled={cloud.busy} onClick={() => { if (window.confirm(t('app.cloud.delete.confirm'))) void cloud.removeAccount() }} data-testid="cloud-delete">{t('app.cloud.delete.summary')}</button>
      </details>
    </section>
  }

  if (view === 'manage') return null

  function submit(e: React.FormEvent) {
    e.preventDefault(); setMismatch(false); cloud.clearMessages()
    if (mode === 'register' && password !== password2) { setMismatch(true); return }
    void (mode === 'login' ? cloud.login(email, password) : cloud.register(email, password))
  }
  const reset = (m: 'login' | 'register') => { setMode(m); setMismatch(false); cloud.clearMessages() }

  return <section className="panel acc-form" data-testid="cloud-out">
    <div className="panel-head"><div><div className="eyebrow">{t('app.cloud.eyebrow')}</div><h2>{mode === 'login' ? t('app.cloud.mode.login') : t('app.cloud.mode.register')}</h2></div></div>
    <div className="tabs" role="tablist" aria-label={t('app.cloud.modes.aria')}>
      <button type="button" role="tab" aria-selected={mode === 'login'} className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => reset('login')} data-testid="cloud-mode-login">{t('app.cloud.mode.login')}</button>
      <button type="button" role="tab" aria-selected={mode === 'register'} className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => reset('register')} data-testid="cloud-mode-register">{t('app.cloud.mode.register')}</button>
    </div>
    <form onSubmit={submit} className="acc-form" noValidate>
      <label className="field">{t('app.cloud.email')}
        <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="cloud-email-input" />
      </label>
      <label className="field">{mode === 'register' ? t('app.cloud.passwordMin', { n: MIN_PASSWORD }) : t('app.cloud.password')}
        <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} data-testid="cloud-pass-input" />
      </label>
      {mode === 'register' && <label className="field">{t('app.cloud.password2')}
        <input type="password" autoComplete="new-password" value={password2} onChange={e => setPassword2(e.target.value)} data-testid="cloud-pass2-input" />
      </label>}
      <div className="board-actions">
        <button type="submit" className="btn primary" disabled={cloud.busy} data-testid="cloud-submit">{cloud.busy ? t('app.cloud.wait') : mode === 'login' ? t('app.cloud.submit.login') : t('app.cloud.submit.register')}</button>
        {mode === 'login' && <button type="button" className="btn" disabled={cloud.busy || !email.trim()} onClick={() => void cloud.forgot(email)} data-testid="cloud-forgot" title={t('app.cloud.forgotTitle')}>{t('app.cloud.forgot')}</button>}
      </div>
    </form>
    {msgs}
    <p className="tiny">{t('app.cloud.formNote')}</p>
  </section>
}
