import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

const STORAGE_KEY = 'i-cant-decide.wheels.v1'
const CURRENT_WHEEL_KEY = 'i-cant-decide.current-wheel-id.v1'
const SEEDED_WHEEL_KEY = 'i-cant-decide.seeded-starter-wheel.v1'
const MIN_OPTIONS = 2
const MAX_OPTIONS = 30
const MAX_OPTION_CHARACTERS = 55
const WHEEL_COLORS = [
  '#f87171',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
]
const STARTER_WHEEL_OPTIONS = [
  'Mexican',
  'Chinese',
  'Thai',
  'Italian',
  'Japanese',
  'Indian',
  'American',
  'Latin',
  'Mediterranean',
  'BBQ',
]

type Wheel = {
  id: string
  name: string
  options: string[]
  createdAt: number
  updatedAt: number
}

type DraftWheel = {
  id: string | null
  name: string
  options: string[]
}

type ValidationErrors = {
  name?: string
  options?: string
}

const emptyDraft = (): DraftWheel => ({
  id: null,
  name: '',
  options: ['', ''],
})

const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360

const randomUnit = (): number => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    return values[0] / 0x100000000
  }
  return Math.random()
}

const randomInt = (maxExclusive: number): number =>
  Math.floor(randomUnit() * Math.max(1, maxExclusive))

const truncateLabel = (value: string, optionCount: number): string => {
  const maxLength = optionCount >= 22 ? 8 : optionCount >= 14 ? 11 : 16
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

const computeWinnerIndex = (rotation: number, optionCount: number): number => {
  if (optionCount <= 0) return 0
  const sliceAngle = 360 / optionCount
  const angleFromTop = normalizeDegrees(360 - normalizeDegrees(rotation))
  const safeAngle = normalizeDegrees(angleFromTop + 0.000001)
  return Math.floor(safeAngle / sliceAngle)
}

const safeParseWheels = (rawValue: string | null): Wheel[] => {
  if (!rawValue) return []
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Wheel => {
        if (!item || typeof item !== 'object') return false
        const candidate = item as Partial<Wheel>
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.name === 'string' &&
          Array.isArray(candidate.options) &&
          typeof candidate.createdAt === 'number' &&
          typeof candidate.updatedAt === 'number'
        )
      })
      .map((item) => ({
        ...item,
        options: item.options
          .filter((option): option is string => typeof option === 'string')
          .map((option) => option.trim())
          .filter(Boolean)
          .slice(0, MAX_OPTIONS),
      }))
      .filter((item) => item.options.length >= MIN_OPTIONS)
  } catch {
    return []
  }
}

const makeId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `wheel-${Date.now()}-${randomInt(1_000_000)}`
}

type InitialAppState = {
  wheels: Wheel[]
  currentWheelId: string | null
}

const makeStarterWheel = (): Wheel => {
  const now = Date.now()
  return {
    id: makeId(),
    name: 'Dinner',
    options: STARTER_WHEEL_OPTIONS,
    createdAt: now,
    updatedAt: now,
  }
}

const initializeAppState = (): InitialAppState => {
  if (typeof window === 'undefined') {
    return {
      wheels: [],
      currentWheelId: null,
    }
  }

  const parsedWheels = safeParseWheels(window.localStorage.getItem(STORAGE_KEY)).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  )
  const seeded = window.localStorage.getItem(SEEDED_WHEEL_KEY) === 'true'

  if (!seeded) {
    if (parsedWheels.length === 0) {
      const starterWheel = makeStarterWheel()
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([starterWheel]))
      window.localStorage.setItem(CURRENT_WHEEL_KEY, starterWheel.id)
      window.localStorage.setItem(SEEDED_WHEEL_KEY, 'true')
      return {
        wheels: [starterWheel],
        currentWheelId: starterWheel.id,
      }
    }

    // Existing users should never receive the seeded wheel once they already have data.
    window.localStorage.setItem(SEEDED_WHEEL_KEY, 'true')
  }

  const storedCurrent = window.localStorage.getItem(CURRENT_WHEEL_KEY)
  const currentWheelId = storedCurrent && storedCurrent.length > 0 ? storedCurrent : null

  return {
    wheels: parsedWheels,
    currentWheelId,
  }
}

function App() {
  const [initialState] = useState<InitialAppState>(initializeAppState)
  const [wheels, setWheels] = useState<Wheel[]>(initialState.wheels)
  const [activeWheelId, setActiveWheelId] = useState<string | null>(initialState.currentWheelId)
  const [isCreatingNewWheel, setIsCreatingNewWheel] = useState(false)
  const [draft, setDraft] = useState<DraftWheel>(emptyDraft)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [statusMessage, setStatusMessage] = useState(
    initialState.wheels.length > 0 ? 'Ready to spin your current wheel.' : 'Create your first wheel.',
  )

  const [rotation, setRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [celebrateToken, setCelebrateToken] = useState(0)
  const [muted, setMuted] = useState(false)

  const animationFrameRef = useRef<number | null>(null)
  const celebrationTimerRef = useRef<number | null>(null)
  const quickSpinTimerRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const tickStepRef = useRef(0)
  const spinPanelRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wheels))
  }, [wheels])

  useEffect(() => {
    if (!activeWheelId) {
      window.localStorage.removeItem(CURRENT_WHEEL_KEY)
      return
    }
    window.localStorage.setItem(CURRENT_WHEEL_KEY, activeWheelId)
  }, [activeWheelId])

  useEffect(() => {
    if (isCreatingNewWheel) return
    if (wheels.length === 0) {
      if (activeWheelId !== null) {
        setActiveWheelId(null)
      }
      return
    }

    const hasActiveWheel = activeWheelId
      ? wheels.some((wheel) => wheel.id === activeWheelId)
      : false
    if (!hasActiveWheel) {
      setActiveWheelId(wheels[0].id)
    }
  }, [wheels, activeWheelId, isCreatingNewWheel])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current)
      }
      if (quickSpinTimerRef.current !== null) {
        window.clearTimeout(quickSpinTimerRef.current)
      }
      audioContextRef.current?.close().catch(() => {})
    }
  }, [])

  const activeWheel = useMemo(
    () => wheels.find((wheel) => wheel.id === activeWheelId) ?? null,
    [wheels, activeWheelId],
  )

  const sliceAngle = activeWheel ? 360 / activeWheel.options.length : 0

  const wheelGradient = useMemo(() => {
    if (!activeWheel) return ''
    return activeWheel.options
      .map((_, index) => {
        const start = index * sliceAngle
        const end = (index + 1) * sliceAngle
        const color = WHEEL_COLORS[index % WHEEL_COLORS.length]
        return `${color} ${start}deg ${end}deg`
      })
      .join(', ')
  }, [activeWheel, sliceAngle])

  useEffect(() => {
    if (isCreatingNewWheel) return
    if (!activeWheel) return
    setDraft({
      id: activeWheel.id,
      name: activeWheel.name,
      options: [...activeWheel.options],
    })
    setErrors({})
    setResult(null)
  }, [activeWheel, isCreatingNewWheel])

  const startNewWheel = () => {
    if (isSpinning) return
    setIsCreatingNewWheel(true)
    setActiveWheelId(null)
    setDraft(emptyDraft())
    setErrors({})
    setResult(null)
    setStatusMessage('Creating a new wheel.')
  }

  const chooseCurrentWheel = (wheelId: string) => {
    if (isSpinning) return
    setIsCreatingNewWheel(false)
    setActiveWheelId(wheelId)
    const wheel = wheels.find((item) => item.id === wheelId)
    if (wheel) {
      setStatusMessage(`Current wheel set to "${wheel.name}".`)
    }
  }

  const playTick = () => {
    if (muted) return
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }
      const context = audioContextRef.current
      if (!context) return

      if (context.state === 'suspended') {
        context.resume().catch(() => {})
      }

      const now = context.currentTime
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.value = 760 + randomInt(120)
      gainNode.gain.setValueAtTime(0.0001, now)
      gainNode.gain.exponentialRampToValueAtTime(0.05, now + 0.003)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
      oscillator.connect(gainNode)
      gainNode.connect(context.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.05)
    } catch {
      // Ignore browser audio errors for unsupported contexts.
    }
  }

  const runCelebration = () => {
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current)
    }
    setCelebrateToken((token) => token + 1)
    celebrationTimerRef.current = window.setTimeout(() => {
      setCelebrateToken(0)
    }, 1200)
  }

  const validateDraft = (input: DraftWheel): { name: string; options: string[] } | null => {
    const trimmedName = input.name.trim()
    const cleanedOptions = input.options
      .map((option) => option.trim())
      .filter((option) => option.length > 0)
      .slice(0, MAX_OPTIONS)

    const nextErrors: ValidationErrors = {}
    if (!trimmedName) {
      nextErrors.name = 'Give your wheel a name.'
    }
    if (cleanedOptions.length < MIN_OPTIONS) {
      nextErrors.options = `Add at least ${MIN_OPTIONS} options before saving.`
    } else if (cleanedOptions.length > MAX_OPTIONS) {
      nextErrors.options = `Keep options to ${MAX_OPTIONS} or fewer.`
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return null
    }

    setErrors({})
    return {
      name: trimmedName,
      options: cleanedOptions,
    }
  }

  const saveWheel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validated = validateDraft(draft)
    if (!validated) return

    const now = Date.now()
    if (draft.id) {
      const updatedWheel: Wheel = {
        id: draft.id,
        name: validated.name,
        options: validated.options,
        createdAt: now,
        updatedAt: now,
      }

      setWheels((previous) => {
        const existing = previous.find((wheel) => wheel.id === draft.id)
        const createdAt = existing?.createdAt ?? now
        const nextWheel = { ...updatedWheel, createdAt }
        const next = previous
          .map((wheel) => (wheel.id === draft.id ? nextWheel : wheel))
          .sort((a, b) => b.updatedAt - a.updatedAt)
        return next
      })
      setIsCreatingNewWheel(false)
      setActiveWheelId(draft.id)
      setStatusMessage(`Saved changes to "${validated.name}".`)
      return
    }

    const newWheel: Wheel = {
      id: makeId(),
      name: validated.name,
      options: validated.options,
      createdAt: now,
      updatedAt: now,
    }

    setWheels((previous) => [newWheel, ...previous])
    setIsCreatingNewWheel(false)
    setActiveWheelId(newWheel.id)
    setStatusMessage(`Saved "${validated.name}" and ready to spin.`)
  }

  const deleteWheel = (wheelId: string) => {
    if (isSpinning) return
    const target = wheels.find((wheel) => wheel.id === wheelId)
    if (!target) return
    const confirmed = window.confirm(`Delete "${target.name}"?`)
    if (!confirmed) return

    const next = wheels.filter((wheel) => wheel.id !== wheelId)
    setWheels(next)
    setResult(null)

    if (activeWheelId === wheelId) {
      if (next.length > 0) {
        setIsCreatingNewWheel(false)
        setActiveWheelId(next[0].id)
      } else {
        setIsCreatingNewWheel(true)
        setActiveWheelId(null)
        setDraft(emptyDraft())
      }
    }
    setStatusMessage(`Deleted "${target.name}".`)
  }

  const updateOption = (index: number, value: string) => {
    setDraft((previous) => {
      const nextOptions = [...previous.options]
      nextOptions[index] = value.slice(0, MAX_OPTION_CHARACTERS)
      return { ...previous, options: nextOptions }
    })
  }

  const removeOption = (index: number) => {
    setDraft((previous) => {
      const nextOptions = previous.options.filter((_, optionIndex) => optionIndex !== index)
      return {
        ...previous,
        options: nextOptions.length > 0 ? nextOptions : [''],
      }
    })
  }

  const addOption = () => {
    setDraft((previous) => {
      if (previous.options.length >= MAX_OPTIONS) return previous
      return {
        ...previous,
        options: [...previous.options, ''],
      }
    })
  }

  const runSpin = (wheelToSpin: Wheel) => {
    if (wheelToSpin.options.length < MIN_OPTIONS || isSpinning) return

    const options = wheelToSpin.options
    const optionCount = options.length
    const perSlice = 360 / optionCount

    const winningIndex = randomInt(optionCount)
    const inSliceOffset = perSlice * (0.15 + randomUnit() * 0.7)
    const pointerAngle = winningIndex * perSlice + inSliceOffset
    const finalMod = normalizeDegrees(360 - pointerAngle)

    const baseRotation = rotation
    const turns = 6 + randomInt(5)
    const currentMod = normalizeDegrees(baseRotation)
    const deltaToFinal = normalizeDegrees(finalMod - currentMod)
    const finalRotation = baseRotation + turns * 360 + deltaToFinal

    const durationMs = 4600 + randomInt(1800)
    const animationStart = performance.now()
    const startRotation = baseRotation
    tickStepRef.current = Math.floor(startRotation / perSlice)

    setIsSpinning(true)
    setResult(null)
    setStatusMessage('Spinning...')

    const animate = (now: number) => {
      const elapsed = now - animationStart
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      const nextRotation = startRotation + (finalRotation - startRotation) * eased
      setRotation(nextRotation)

      const step = Math.floor(nextRotation / perSlice)
      if (step !== tickStepRef.current) {
        tickStepRef.current = step
        playTick()
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      setRotation(finalRotation)
      setIsSpinning(false)
      const winnerIndex = computeWinnerIndex(finalRotation, optionCount)
      const winner = options[winnerIndex]
      setResult(winner)
      setStatusMessage(`Winner: ${winner}`)
      runCelebration()

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.([75, 45, 120])
      }
    }

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    animationFrameRef.current = requestAnimationFrame(animate)
  }

  const spinWheel = () => {
    if (!activeWheel) return
    runSpin(activeWheel)
  }

  const quickSpinWheel = activeWheel ?? (wheels.length === 1 ? wheels[0] : null)

  const handleQuickSpin = () => {
    if (!quickSpinWheel || isSpinning) return

    spinPanelRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })

    if (activeWheelId !== quickSpinWheel.id) {
      setIsCreatingNewWheel(false)
      setActiveWheelId(quickSpinWheel.id)
      if (quickSpinTimerRef.current !== null) {
        window.clearTimeout(quickSpinTimerRef.current)
      }
      quickSpinTimerRef.current = window.setTimeout(() => {
        runSpin(quickSpinWheel)
      }, 90)
      return
    }

    runSpin(quickSpinWheel)
  }

  const selectedLabel = activeWheel
    ? `${activeWheel.name} (${activeWheel.options.length} options)`
    : 'No wheel selected'

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Personal Decision Wheel</p>
        <h1>I Can&apos;t Decide</h1>
        <p className="subtitle">
          Save wheels for quick tie-breakers, spin with confidence, and settle dinner in seconds.
        </p>
        <div className="quick-spin-bar">
          <div className="quick-spin-copy">
            <p className="quick-spin-title">Quick Spin</p>
            <p className="quick-spin-wheel-name">
              {quickSpinWheel
                ? `Current wheel: ${quickSpinWheel.name} (${quickSpinWheel.options.length} options)`
                : 'Choose or save a wheel to spin from here.'}
            </p>
          </div>
          <button
            type="button"
            className="button quick-spin-button"
            onClick={handleQuickSpin}
            disabled={!quickSpinWheel || quickSpinWheel.options.length < MIN_OPTIONS || isSpinning}
          >
            {isSpinning ? 'Spinning...' : 'Spin Current Wheel'}
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="panel saved-wheels-panel" aria-label="Saved wheels">
          <div className="panel-title-row">
            <h2>Saved Wheels</h2>
            <button type="button" className="button ghost" onClick={startNewWheel}>
              + New
            </button>
          </div>

          {wheels.length === 0 ? (
            <p className="empty-copy">No wheels saved yet. Create one below.</p>
          ) : (
            <ul className="saved-wheel-list">
              {wheels.map((wheel) => {
                const isActive = wheel.id === activeWheelId
                return (
                  <li key={wheel.id} className={`saved-wheel-item ${isActive ? 'active' : ''}`}>
                    <button
                      type="button"
                      className="saved-wheel-main"
                      onClick={() => chooseCurrentWheel(wheel.id)}
                      disabled={isSpinning}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <span className="saved-wheel-name">
                        {wheel.name}
                        {isActive ? <span className="current-badge">Current</span> : null}
                      </span>
                      <span className="saved-wheel-meta">{wheel.options.length} options</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => deleteWheel(wheel.id)}
                      aria-label={`Delete ${wheel.name}`}
                      disabled={isSpinning}
                    >
                      Delete
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="panel editor-panel" aria-label="Edit wheel">
          <h2>{draft.id ? 'Edit Wheel' : 'Create Wheel'}</h2>
          <form onSubmit={saveWheel} className="editor-form">
            <label className="field">
              <span>Wheel Name</span>
              <input
                type="text"
                value={draft.name}
                onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Dinner, Movie Night, Weekend Plan..."
                maxLength={40}
                disabled={isSpinning}
              />
              {errors.name ? <small className="error">{errors.name}</small> : null}
            </label>

            <div className="field">
              <div className="options-header">
                <span>Options</span>
                <span>
                  {draft.options.filter((option) => option.trim().length > 0).length}/{MAX_OPTIONS}
                </span>
              </div>
              <div className="option-list">
                {draft.options.map((option, index) => (
                  <div key={`option-${index}`} className="option-row">
                    <input
                      type="text"
                      value={option}
                      onChange={(event) => updateOption(index, event.target.value)}
                      placeholder={`Option ${index + 1}`}
                      maxLength={MAX_OPTION_CHARACTERS}
                      disabled={isSpinning}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => removeOption(index)}
                      disabled={draft.options.length <= 1 || isSpinning}
                      aria-label={`Remove option ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="options-actions">
                <button
                  type="button"
                  className="button ghost"
                  onClick={addOption}
                  disabled={draft.options.length >= MAX_OPTIONS || isSpinning}
                >
                  + Add Option
                </button>
              </div>
              {errors.options ? <small className="error">{errors.options}</small> : null}
            </div>

            <div className="editor-actions">
              <button type="submit" className="button primary" disabled={isSpinning}>
                {draft.id ? 'Save Changes' : 'Save Wheel'}
              </button>
              {draft.id ? (
                <button type="button" className="button ghost" onClick={startNewWheel} disabled={isSpinning}>
                  New Wheel
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section ref={spinPanelRef} className="panel spin-panel" aria-label="Spin wheel">
          <div className="spin-header">
            <div>
              <h2>Spin</h2>
              <p className="selected-wheel">{selectedLabel}</p>
            </div>
            <button
              type="button"
              className="button ghost"
              onClick={() => setMuted((current) => !current)}
              aria-pressed={muted}
            >
              {muted ? 'Sound: Off' : 'Sound: On'}
            </button>
          </div>

          {activeWheel ? (
            <>
              <div className="wheel-stage">
                <div className="pointer" aria-hidden="true"></div>
                <div
                  className="wheel-disc"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    backgroundImage: `conic-gradient(${wheelGradient})`,
                  }}
                >
                  <div className="wheel-center-dot" aria-hidden="true"></div>
                  {activeWheel.options.map((option, index) => {
                    const angle = index * sliceAngle + sliceAngle / 2
                    return (
                      <div
                        key={`${option}-${index}`}
                        className={`slice-label ${activeWheel.options.length > 20 ? 'tiny' : activeWheel.options.length > 12 ? 'small' : ''}`}
                        style={{
                          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(var(--wheel-size) * -0.37)) rotate(${-angle}deg)`,
                        }}
                        title={option}
                      >
                        {truncateLabel(option, activeWheel.options.length)}
                      </div>
                    )
                  })}
                </div>
                {celebrateToken > 0 ? <div className="celebration-burst" aria-hidden="true"></div> : null}
              </div>

              <div className={`result-card ${celebrateToken > 0 ? 'celebrating' : ''}`}>
                <p className="result-label">{isSpinning ? 'Spinning...' : 'Result'}</p>
                <p className="result-value">{result ?? 'Tap Spin to decide'}</p>
              </div>

              <div className="spin-actions">
                <button
                  type="button"
                  className="button spin"
                  onClick={spinWheel}
                  disabled={isSpinning || activeWheel.options.length < MIN_OPTIONS}
                >
                  {isSpinning ? 'Spinning...' : result ? 'Spin Again' : 'Spin'}
                </button>
              </div>
            </>
          ) : (
            <p className="empty-copy">
              Save a wheel with at least {MIN_OPTIONS} options to start spinning.
            </p>
          )}

          <p className="status-line" role="status" aria-live="polite">
            {statusMessage}
          </p>
        </section>
      </main>
      <footer className="app-footer">
        Made for fun and provided as-is. No data collection, everything is stored locally on your
        device.
      </footer>
    </div>
  )
}

export default App
