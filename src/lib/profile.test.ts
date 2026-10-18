import { describe, it, expect, beforeEach, vi } from 'vitest'


describe('профили', () => {
  beforeEach(() => { vi.resetModules() })

  async function load(store: Record<string, string> = {}) {
    const real: Record<string, string> = { ...store }
    const st = {
      getItem: (k: string) => real[k] ?? null,
      setItem: (k: string, v: string) => { real[k] = v },
      removeItem: (k: string) => { delete real[k] },
    }
    const wrapped = new Proxy(st, { ownKeys: () => Object.keys(real), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) })
    vi.stubGlobal('localStorage', wrapped)
    const mod = await import('./profile')
    return { mod, real }
  }

  it('по умолчанию — профиль «Игрок» и прежние ключи (данные не теряются)', async () => {
    const { mod } = await load()
    expect(mod.loadProfiles().current).toBe('default')
    expect(mod.pk('chess-coach-ai:games:v1')).toBe('chess-coach-ai:games:v1')
  })

  it('создание, переименование и удаление профиля очищает его данные', async () => {
    const { mod, real } = await load()
    const s = mod.createProfile('  Аня   Иванова ', { emoji: '🦊', color: '#fff' })
    const p = s.list[1]
    expect(p.name).toBe('Аня Иванова')
    expect(mod.updateProfile(p.id, { name: 'Аня' }).list[1].name).toBe('Аня')
    expect(mod.updateProfile(p.id, { name: '   ' }).list[1].name).toBe('Аня')
    real[`chess-coach-ai:games:v1@${p.id}`] = '{}'
    real['chess-coach-ai:games:v1'] = '{"keep":1}'
    const after = mod.deleteProfile(p.id)
    expect(after.list).toHaveLength(1)
    expect(real[`chess-coach-ai:games:v1@${p.id}`]).toBeUndefined()
    expect(real['chess-coach-ai:games:v1']).toBe('{"keep":1}')
  })

  it('профиль по умолчанию удалить нельзя; ключи другого профиля с суффиксом', async () => {
    const { mod } = await load({ 'chess-coach-ai:profiles:v1': JSON.stringify({ v: 1, current: 'px', list: [{ id: 'px', name: 'Х', avatar: { emoji: '♞', color: '#fff' }, created: '' }] }) })
    expect(mod.pk('a')).toBe('a@px')
    expect(mod.loadProfiles().list.some(p => p.id === 'default')).toBe(true)
    expect(mod.deleteProfile('default').list.some(p => p.id === 'default')).toBe(true)
  })

  it('повреждённые данные не ломают загрузку', async () => {
    const { mod } = await load({ 'chess-coach-ai:profiles:v1': '{oops' })
    expect(mod.loadProfiles().list[0].id).toBe('default')
  })
})
