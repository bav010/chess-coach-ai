// Звуки ходов без файлов: стук дерева, синтезированный Web Audio. Включаются в настройках, по умолчанию выключены.
export type SoundKind = 'move' | 'capture' | 'check' | 'end'
let ctx: AudioContext | null = null
function ac(): AudioContext | null {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx ??= new C()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

// «Стук дерева»: глухой мягкий удар — шум с плавной атакой, пропущенный через низкий резонанс (корпус фигуры и доски)
// и сильно приглушённый по верху. У каждого удара слегка меняются высота и громкость, чтобы звук не повторялся.
function knock(c: AudioContext, t0: number, o: { gain: number; body: number; dur: number; bright: number; q?: number; sharp?: boolean }) {
  const jitter = 1 + (Math.random() - 0.5) * 0.1
  const n = Math.floor(c.sampleRate * o.dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0)
  const atk = o.sharp ? 1 : Math.floor(c.sampleRate * 0.004), dk = o.sharp ? 0.16 : 0.22
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * dk)) * Math.min(1, i / atk)
  const src = c.createBufferSource(); src.buffer = buf
  const out = c.createGain(); out.gain.value = o.gain * (0.92 + Math.random() * 0.16); out.connect(c.destination)
  const body = c.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = o.body * jitter; body.Q.value = o.q ?? (o.sharp ? 5 : 2.5)
  const bg = c.createGain(); bg.gain.value = o.sharp ? 2.2 : 2.6
  const top = c.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = o.bright
  const tg = c.createGain(); tg.gain.value = o.sharp ? 0.55 : 0.22
  src.connect(body).connect(bg).connect(out); src.connect(top).connect(tg).connect(out)
  src.start(t0)
}

export function playSound(kind: SoundKind, volume: number) {
  const c = ac(); if (!c || volume <= 0) return
  const t = c.currentTime, v = Math.max(0, Math.min(1, volume))
  if (kind === 'move') knock(c, t, { gain: 0.8 * v, body: 190, dur: 0.12, bright: 900 })
  else if (kind === 'capture') { knock(c, t, { gain: 1.0 * v, body: 160, dur: 0.15, bright: 1100 }); knock(c, t + 0.05, { gain: 0.5 * v, body: 230, dur: 0.09, bright: 800 }) }
  else if (kind === 'check') { knock(c, t, { gain: 0.8 * v, body: 200, dur: 0.12, bright: 950 }); knock(c, t + 0.12, { gain: 0.45 * v, body: 300, dur: 0.12, bright: 900, q: 4 }) }
  else { knock(c, t, { gain: 0.8 * v, body: 280, dur: 0.12, bright: 2000, sharp: true }); knock(c, t + 0.16, { gain: 0.7 * v, body: 240, dur: 0.14, bright: 1800, sharp: true }); knock(c, t + 0.34, { gain: 0.6 * v, body: 200, dur: 0.18, bright: 1500, sharp: true }) }
}
