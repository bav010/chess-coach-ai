import { useBoardKeys } from '../hooks/useBoardKeys'
import { markActive } from '../lib/activity'
import { useRoute } from '../lib/route'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import { botEngine } from '../engine'
import Board from '../components/Board'
import ClockView from '../components/ClockView'
import MoveList from '../components/MoveList'
import PlayerStrip from '../components/PlayerStrip'
import PlaySetup, { type GameConfig } from '../components/PlaySetup'
import PromoPicker from '../components/PromoPicker'
import ProgressPanel from '../components/ProgressPanel'
import { calibrate, humanDelayMs, lineGapCp, paceMs, pickBotMove, thinkTimeMs } from '../lib/bot'
import { ChessClock, type ClockSnapshot, type TimeControl } from '../lib/clock'
import {
  START_FEN, captures, hasMatingMaterial, opposite, replay, splitUci, statusOf,
  type EndReason, type GameStatus,
} from '../lib/game'
import type { Prefs } from '../lib/prefs'
import { toPgn } from '../lib/pgn'
import type { SavedSession } from '../storage'
import type { GameSeed } from './AnalysisView'
import { t as tg, useI18n, type Key } from '../i18n'
import Icon from '../components/Icon'

type Props = {
  prefs: Prefs
  onPrefs: (patch: Partial<Prefs>) => void
  sessions: SavedSession[]
  onSaveSession: (s: Pick<SavedSession, 'result' | 'plies' | 'pgn'>) => void
  onDownload: (s: SavedSession) => void
  onOpenSession: (s: SavedSession) => void
  onResetProgress: () => void
  onReview: (seed: Omit<GameSeed, 'nonce'>) => void
  engineError: boolean
}

type ManualEnd = { result: '1-0' | '0-1' | '1/2-1/2'; reason: EndReason }

const nowMs = () => performance.now()

const reasonText = (r: EndReason): string => tg(`play.reason.${r}` as Key)

/** Строка состояния: ключ перевода (переводится при показе, чтобы следовать языку) или итог партии. */
type Msg = Key | 'end' | ''

function resultText(r: '1-0' | '0-1' | '1/2-1/2', user: Color): string {
  if (r === '1/2-1/2') return tg('play.result.draw')
  const winner: Color = r === '1-0' ? 'w' : 'b'
  return winner === user ? tg('play.result.win') : tg('play.result.loss')
}

export function formatBalance(b: number): string {
  return b > 0 ? `+${b}` : b < 0 ? `−${-b}` : '0'
}

export default function PlayView({ prefs, onPrefs, sessions, onSaveSession, onDownload, onOpenSession, onResetProgress, onReview, engineError }: Props) {
  const { t, tn } = useI18n()
  const [cfg, setCfg] = useState<GameConfig | null>(null)
  const [gameId, setGameId] = useState(0)
  const [ucis, setUcisState] = useState<string[]>([])
  const ucisRef = useRef<string[]>([])
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [manualEnd, setManualEnd] = useState<ManualEnd | null>(null)
  const [message, setMessage] = useState<Msg>('')
  const [thinking, setThinking] = useState(false)
  /** Текст ошибки движка; '' — общая ошибка (подпись переводится при показе). */
  const [botError, setBotError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [legal, setLegal] = useState<Square[]>([])
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null)
  const [confirmResign, setConfirmResign] = useState(false)
  const [, setTick] = useState(0)

  const clockRef = useRef<ChessClock | null>(null)
  const snapsRef = useRef<ClockSnapshot[]>([])
  const savedRef = useRef(false)

  const setUcis = useCallback((next: string[]) => { ucisRef.current = next; setUcisState(next) }, [])

  // Движок бота грузится заранее, пока пользователь выбирает настройки.
  useEffect(() => { botEngine.start().catch(() => undefined) }, [])

  const rep = useMemo(() => replay(START_FEN, ucis), [ucis])
  const repRef = useRef(rep)
  repRef.current = rep
  const rulesStatus: GameStatus = useMemo(() => statusOf(rep.chess), [rep])
  const end: GameStatus = manualEnd ? { over: true, ...manualEnd } : rulesStatus
  const over = end.over
  const turn = rep.chess.turn()
  const user = cfg?.userColor ?? 'w'
  const bot = opposite(user)
  const hasClock = !!cfg && cfg.tc.whiteMs !== null

  const shownPly = viewPly ?? ucis.length
  const viewing = viewPly !== null && viewPly !== ucis.length
  const playRoute = useRoute().name === 'play'
  useBoardKeys(playRoute && cfg !== null, {
    prev: () => setViewPly(Math.max(0, shownPly - 1)),
    next: () => setViewPly(shownPly + 1 >= ucis.length ? null : shownPly + 1),
    first: () => setViewPly(0),
    last: () => setViewPly(null),
  })
  const shownChess = useMemo(() => {
    if (!viewing) return rep.chess
    return new Chess(shownPly === 0 ? START_FEN : rep.records[shownPly - 1].fenAfter)
  }, [viewing, shownPly, rep])
  const caps = useMemo(() => captures(rep.records, shownPly), [rep, shownPly])
  const lastRec = shownPly > 0 ? rep.records[shownPly - 1] : null

  // ----- старт, рестарт -----
  function startGame(c: GameConfig) {
    botEngine.stop()
    void botEngine.newGame().catch(() => undefined)
    let clock: ChessClock | null = null
    if (c.tc.whiteMs !== null && c.tc.blackMs !== null) {
      clock = new ChessClock(c.tc as TimeControl & { whiteMs: number; blackMs: number })
      clock.start('w', nowMs())
    }
    clockRef.current = clock
    snapsRef.current = clock ? [clock.snapshot(nowMs())] : []
    savedRef.current = false
    setUcis([]); setViewPly(null); setManualEnd(null); setBotError(null)
    setSelected(null); setLegal([]); setPromo(null); setConfirmResign(false); setThinking(false)
    setMessage(c.userColor === 'w' ? 'play.msg.startWhite' : 'play.msg.startBlack')
    setCfg(c)
    setGameId(g => g + 1)
  }

  function toSetup() {
    botEngine.stop()
    clockRef.current?.stop(nowMs())
    setCfg(null); setUcis([]); setManualEnd(null); setViewPly(null); setThinking(false)
  }

  // ----- ход (пользователя или бота) -----
  const commit = useCallback((uci: string, mover: Color) => {
    const cur = ucisRef.current
    const clock = clockRef.current
    const t = nowMs()
    if (clock) {
      const flagged = clock.flagged(t)
      if (flagged) return false
      clock.press(mover, t)
      snapsRef.current = [...snapsRef.current.slice(0, cur.length + 1), clock.snapshot(t)]
    }
    setUcis([...cur, uci])
    setViewPly(null)
    return true
  }, [setUcis])

  function describeMove(chess: Chess, mover: Color): Msg {
    if (chess.isCheckmate()) return mover === user ? 'play.msg.mateYou' : 'play.msg.mateBot'
    if (chess.isCheck()) return 'play.msg.check'
    return mover === user ? 'play.msg.accepted' : 'play.msg.botMoved'
  }

  function applyUserMove(uci: string) {
    if (!cfg || over || turn !== user) return
    if (!commit(uci, user)) return
    markActive()
    const c = new Chess(rep.chess.fen())
    try { c.move(splitUci(uci)) } catch { return }
    setSelected(null); setLegal([]); setPromo(null); setConfirmResign(false)
    setMessage(describeMove(c, user))
  }

  function onSquare(sq: Square) {
    if (!cfg || over || viewing || turn !== user || promo) return
    const piece = rep.chess.get(sq)
    if (selected && legal.includes(sq)) {
      const mover = rep.chess.get(selected)
      if (mover?.type === 'p' && (sq[1] === '8' || sq[1] === '1')) { setPromo({ from: selected, to: sq }); return }
      applyUserMove(`${selected}${sq}`)
      return
    }
    if (piece && piece.color === user) {
      setSelected(sq)
      setLegal(rep.chess.moves({ square: sq, verbose: true }).map(m => m.to))
    } else { setSelected(null); setLegal([]) }
  }

  // ----- ход бота -----
  useEffect(() => {
    if (!cfg || over || turn === user) return
    const ac = new AbortController()
    let alive = true
    const startedAt = nowMs()
    const history = ucisRef.current.slice()
    setThinking(true); setBotError(null)
    ;(async () => {
      const settings = calibrate(cfg.elo)
      const clock = clockRef.current
      const remaining = clock ? clock.remaining(bot, nowMs()) : null
      const baseMs = bot === 'w' ? cfg.tc.whiteMs : cfg.tc.blackMs
      // поиск не должен быть дольше темпа партии; в дебюте — короткий
      const movetime = Math.max(250, Math.min(
        thinkTimeMs(cfg.elo, remaining, cfg.tc.incrementMs),
        paceMs(baseMs, cfg.tc.incrementMs) * 1.2,
        history.length < 12 ? 500 : Infinity,
      ))
      const a = await botEngine.search(START_FEN, history, {
        depth: settings.depth ?? 40,
        movetime,
        multipv: settings.multipv,
        strength: { limitStrength: settings.limitStrength, uciElo: settings.uciElo },
        signal: ac.signal,
      })
      if (ac.signal.aborted || !alive) return
      const uci = pickBotMove(a.bestMoveUci, a.lines.map(l => ({ uci: l.pv[0] })), settings.slipChance)
      if (!uci) return
      // «Человеческая» пауза: зависит от рейтинга, сложности позиции и часов; время поиска в неё входит
      const pos = repRef.current.chess
      const delay = humanDelayMs({
        elo: cfg.elo, legalMoves: pos.moves().length, inCheck: pos.inCheck(), gapCp: lineGapCp(a.lines),
        ply: history.length, remainingMs: clock ? clock.remaining(bot, nowMs()) : null, incrementMs: cfg.tc.incrementMs,
        baseMs,
      })
      const wait = delay - (nowMs() - startedAt)
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      if (ac.signal.aborted || !alive) return
      if (ucisRef.current.length !== history.length) return
      if (!commit(uci, bot)) return
      const c = new Chess(repRef.current.chess.fen())
      try { c.move(splitUci(uci)) } catch { return }
      setMessage(describeMove(c, bot))
    })()
      .catch(e => { if (alive) setBotError(e instanceof Error ? e.message : '') })
      .finally(() => { if (alive) setThinking(false) })
    return () => { alive = false; ac.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, gameId, ucis.length, over])

  // ----- часы: перерисовка и падение флага -----
  useEffect(() => {
    if (!cfg || over || !hasClock) return
    const id = setInterval(() => {
      setTick(t => t + 1)
      const clock = clockRef.current
      const loser = clock?.flagged(nowMs())
      if (clock && loser) {
        const opp = opposite(loser)
        const mate = hasMatingMaterial(repRef.current.chess, opp)
        setManualEnd(mate
          ? { result: opp === 'w' ? '1-0' : '0-1', reason: 'timeout' }
          : { result: '1/2-1/2', reason: 'timeout-insufficient' })
      }
    }, 100)
    return () => clearInterval(id)
  }, [cfg, over, hasClock, gameId])

  // ----- конец партии: остановка часов, сохранение, (опционально) сразу разбор -----
  useEffect(() => {
    if (!cfg || !end.over || savedRef.current) return
    savedRef.current = true
    clockRef.current?.stop(nowMs())
    botEngine.stop()
    setConfirmResign(false); setSelected(null); setLegal([]); setPromo(null)
    setMessage('end')
    if (ucisRef.current.length > 0) {
      const pgn = toPgn(START_FEN, ucisRef.current, {
        Event: 'Chess Coach AI', White: cfg.userColor === 'w' ? 'You' : `Bot (~${cfg.elo})`,
        Black: cfg.userColor === 'b' ? 'You' : `Bot (~${cfg.elo})`, Result: end.result,
        TimeControl: cfg.tc.whiteMs === null ? '-' : `${Math.round(cfg.tc.whiteMs / 1000)}+${Math.round(cfg.tc.incrementMs / 1000)}`,
      })
      onSaveSession({ result: end.result, plies: ucisRef.current.length, pgn })
    }
    if (prefs.autoReview && ucisRef.current.length > 0) {
      onReview({ startFen: START_FEN, ucis: ucisRef.current.slice(), userColor: cfg.userColor, autoReview: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end.over])

  // ----- кнопки -----
  function resign() {
    if (!cfg || over) return
    if (!confirmResign) { setConfirmResign(true); return }
    setManualEnd({ result: cfg.userColor === 'w' ? '0-1' : '1-0', reason: 'resign' })
  }

  async function offerDraw() {
    if (!cfg || over || turn !== user) return
    const plies = ucisRef.current.length
    setMessage('play.msg.drawThinking')
    try {
      const a = await botEngine.analyse(rep.chess.fen(), { depth: 12, movetime: 600, multipv: 1 })
      if (ucisRef.current.length !== plies || repRef.current.chess.isGameOver()) return
      const top = a.lines[0]
      // оценка для стороны, чей ход — это игрок; для бота она противоположна
      const botCp = !top ? 0 : top.mate !== null ? (top.mate > 0 ? -10000 : 10000) : -(top.cp ?? 0)
      if (plies >= 20 && botCp <= 30) {
        setManualEnd({ result: '1/2-1/2', reason: 'agreed' })
      } else {
        setMessage(plies < 20 ? 'play.msg.drawEarly' : 'play.msg.drawBetter')
      }
    } catch {
      setMessage('play.msg.drawFail')
    }
  }

  // Игрок обязан остаться «на ходу»: пока бот думает — снимаем один полуход (ход игрока),
  // иначе — последний полный ход (ход бота и ход игрока). Если игрок чёрными, первый ход бота не отменяется.
  const undoDrop = turn === bot ? 1 : 2
  const minLen = user === 'b' ? 1 : 0
  const canUndo = !!cfg && !over && ucis.length - undoDrop >= minLen

  function undo() {
    if (!cfg || !canUndo) return
    const cur = ucisRef.current
    const next = cur.slice(0, cur.length - undoDrop)
    botEngine.stop()
    setUcis(next)
    setViewPly(null)
    const clock = clockRef.current
    if (clock) {
      const snap = snapsRef.current[next.length]
      if (snap) clock.restore(snap, next.length % 2 === 0 ? 'w' : 'b', nowMs())
      snapsRef.current = snapsRef.current.slice(0, next.length + 1)
    }
    setSelected(null); setLegal([]); setPromo(null); setConfirmResign(false)
    setMessage('play.msg.undone')
  }

  const reviewable = over && ucis.length > 0
  const balanceText = formatBalance(caps.balance)

  if (!cfg) {
    return <div className="main-grid">
      <PlaySetup prefs={prefs} onPrefs={onPrefs} onStart={startGame} engineError={engineError} />
      <aside className="right-column">
        <ProgressPanel sessions={sessions} onDownload={onDownload} onOpen={onOpenSession} onReset={onResetProgress} />
      </aside>
    </div>
  }

  const clockFor = (c: Color) => hasClock
    ? <ClockView ms={clockRef.current?.remaining(c, nowMs()) ?? 0} active={!over && clockRef.current?.activeSide === c} label={c === 'w' ? t('play.clockWhite') : t('play.clockBlack')} />
    : null
  const top = opposite(user)
  const tcText = cfg.tcDesc.kind === 'none' ? t('play.tc.none') : cfg.tcDesc.kind === 'preset' ? cfg.tcDesc.label
    : t(cfg.tcDesc.delay ? 'play.tc.customDelay' : 'play.tc.custom', { you: cfg.tcDesc.you, bot: cfg.tcDesc.bot, inc: cfg.tcDesc.inc, delay: cfg.tcDesc.delay })

  return <div className="main-grid">
    <section className="panel board-panel play-panel" data-testid="play-board">
      <div className="panel-head"><div><div className="eyebrow">{t('play.eyebrow')}</div><h2>{t('play.title')}</h2></div><span className="pill">{t('play.pill', { elo: cfg.elo, tc: tcText })}</span></div>
      <PlayerStrip color={top} name={t('play.botName', { elo: cfg.elo })} captured={top === 'w' ? caps.byWhite : caps.byBlack}
        advantage={top === 'w' ? Math.max(0, caps.balance) : Math.max(0, -caps.balance)} clock={clockFor(top)} active={!over && turn === top} />
      <div className="board-wrap">
        <Board chess={shownChess} orientation={user} selected={selected} legal={legal}
          lastMove={lastRec ? { from: lastRec.from, to: lastRec.to } : null}
          onSquareClick={onSquare} readOnly={over || viewing || turn !== user} />
      </div>
      <PlayerStrip color={user} name={t('play.you')} captured={user === 'w' ? caps.byWhite : caps.byBlack}
        advantage={user === 'w' ? Math.max(0, caps.balance) : Math.max(0, -caps.balance)} clock={clockFor(user)} active={!over && turn === user} />
      {promo && <PromoPicker color={user} onPick={p => applyUserMove(`${promo.from}${promo.to}${p}`)} onCancel={() => { setPromo(null); setSelected(null); setLegal([]) }} />}

      <div className="play-status" data-testid="play-status">
        <span className="balance" data-testid="material-balance" title={t('play.materialTip')}>{t('play.material')}: <b>{balanceText}</b></span>
        <span>{t('play.turn')}: <b>{over ? '—' : turn === user ? t('play.turnYou') : t('play.turnBot')}</b></span>
        <span>{t('play.lastMove')}: <b>{lastRec ? lastRec.san : '—'}</b></span>
        {thinking && !over && <span className="thinking" data-testid="bot-thinking">{t('play.thinking')}</span>}
      </div>
      <div className="board-message" data-testid="play-message"><span className="pulse" /> {message === 'end' ? (end.over ? t('play.msg.end', { result: resultText(end.result, user), reason: reasonText(end.reason) }) : '') : message ? t(message) : ''}</div>
      {botError && <p className="error-text">{botError || t('play.engineError')}</p>}
      {over && <div className="result-box" data-testid="game-result">
        <b>{resultText(end.result, user)}</b> · {end.result} · {reasonText(end.reason)}
      </div>}
      {viewing && <div className="board-actions"><button className="btn" onClick={() => setViewPly(null)}>{t('play.toCurrent')}<Icon name="last" size={16} /></button></div>}

      <div className="play-actions">
        <div className="action-group cols3" role="group" aria-label={t('play.actionsAria')}>
          <button className="btn quiet" onClick={undo} disabled={!canUndo} data-testid="undo"><Icon name="undo" size={16} /><span className="btn-label">{t('play.undo')}</span></button>
          <button className="btn quiet" onClick={() => void offerDraw()} disabled={over || turn !== user || ucis.length < 2} data-testid="offer-draw"><Icon name="handshake" size={16} /><span className="btn-label">{t('play.offerDraw')}</span></button>
          <button className="btn quiet" onClick={() => startGame(cfg)} data-testid="restart"><Icon name="refresh" size={16} /><span className="btn-label">{t('play.restart')}</span></button>
        </div>
        <div className="play-end-row">
          {reviewable && <button className="btn primary" data-testid="review-btn"
            onClick={() => onReview({ startFen: START_FEN, ucis: ucis.slice(), userColor: user, autoReview: true })}><Icon name="search" size={16} />{t('play.review')}</button>}
          <button className={`btn ${over && !reviewable ? 'primary' : 'quiet'}`} onClick={toSetup} data-testid="new-game"><Icon name="plus" size={16} />{t('play.newGame')}</button>
          <span className="spacer" />
          {confirmResign && <button className="btn quiet" onClick={() => setConfirmResign(false)}>{t('play.no')}</button>}
          <button className={`btn danger-quiet ${confirmResign ? 'danger' : ''}`} onClick={resign} disabled={over} data-testid="resign"><Icon name={confirmResign ? 'check' : 'flag'} size={16} />{confirmResign ? t('play.resignConfirm') : t('play.resign')}</button>
        </div>
      </div>
    </section>

    <aside className="right-column">
      <section className="panel moves-panel">
        <div className="panel-head"><div><div className="eyebrow">{t('play.movesEyebrow')}</div><h2>{t('play.notation')}</h2></div><span className="move-count">{tn('play.plies', ucis.length)}</span></div>
        <MoveList records={rep.records} viewPly={shownPly} onSelect={p => setViewPly(p === ucis.length ? null : p)} />
        <div className="nav-row">
          <button className="btn" onClick={() => setViewPly(0)} disabled={ucis.length === 0 || shownPly === 0} aria-label={t('play.navStart')}><Icon name="first" size={18} /></button>
          <button className="btn" onClick={() => setViewPly(Math.max(0, shownPly - 1))} disabled={shownPly === 0} aria-label={t('play.navBack')}><Icon name="back" size={18} /></button>
          <button className="btn" onClick={() => setViewPly(shownPly + 1 >= ucis.length ? null : shownPly + 1)} disabled={!viewing} aria-label={t('play.navForward')}><Icon name="next" size={18} /></button>
          <button className="btn" onClick={() => setViewPly(null)} disabled={!viewing} aria-label={t('play.navEnd')}><Icon name="last" size={18} /></button>
        </div>
        <p className="tiny">{t('play.historyNote')}</p>
      </section>
      <ProgressPanel sessions={sessions} onDownload={onDownload} onOpen={onOpenSession} onReset={onResetProgress} />
    </aside>
  </div>
}
