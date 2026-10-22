// Звуки ходов без файлов: короткие тона Web Audio. Включаются в настройках, по умолчанию выключены.
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

function tone(c: AudioContext, t0: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number) {
  const o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.setValueAtTime(freq, t0)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02)
}
function click(c: AudioContext, t0: number, gain: number, dur: number, lowpass: number) {
  const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3)
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = lowpass; g.gain.value = gain
  src.connect(f).connect(g).connect(c.destination); src.start(t0)
}

export function playSound(kind: SoundKind, volume: number) {
  const c = ac(); if (!c || volume <= 0) return
  const t = c.currentTime, v = Math.max(0, Math.min(1, volume))
  if (kind === 'move') { click(c, t, 0.9 * v, 0.07, 1800); tone(c, t, 170, 0.09, 0.35 * v, 'sine', 110) }
  else if (kind === 'capture') { click(c, t, 1.2 * v, 0.12, 3200); tone(c, t, 140, 0.14, 0.45 * v, 'triangle', 80) }
  else if (kind === 'check') { click(c, t, 0.8 * v, 0.06, 2400); tone(c, t + 0.02, 740, 0.12, 0.22 * v); tone(c, t + 0.12, 988, 0.16, 0.2 * v) }
  else { tone(c, t, 392, 0.35, 0.22 * v); tone(c, t + 0.12, 330, 0.4, 0.2 * v); tone(c, t + 0.26, 262, 0.55, 0.22 * v) }
}
