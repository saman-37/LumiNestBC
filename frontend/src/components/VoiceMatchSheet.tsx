import { AlertCircle, CheckCircle2, ChevronRight, Mic, MicOff, RotateCcw, Search, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Shelter, VoiceMatchItem, VoiceMatchResponse } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  coords?: { lat: number; lng: number } | null
  onHoldShelter: (shelter: Shelter) => void
  onSelectShelter: (shelterId: string) => void
}

const SAMPLE_PROMPTS = [
  'Woman with a small dog near Main and Hastings, uses a walker',
  'Man needing wheelchair accessible bed in Surrey',
  'Couple with pet near Commercial-Broadway',
  'Youth needing bed in Downtown',
]

export function VoiceMatchSheet({ open, onClose, coords, onHoldShelter, onSelectShelter }: Props) {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [micSupported, setMicSupported] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VoiceMatchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Audio playback state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Setup Web Speech API
  useEffect(() => {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechClass) {
      setMicSupported(false)
      return
    }

    try {
      const rec = new SpeechClass()
      rec.continuous = false
      rec.interimResults = true
      rec.lang = 'en-CA'

      rec.onstart = () => {
        setIsListening(true)
        setError(null)
      }

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let current = ''
        for (let i = 0; i < event.results.length; i++) {
          current += event.results[i][0].transcript
        }
        setTranscript(current)
      }

      rec.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsListening(false)
        if (event.error === 'not-allowed') {
          setError('Microphone permission was denied. You can type your request below.')
        } else if (event.error !== 'no-speech') {
          setError(`Mic error (${event.error}). Please type below.`)
        }
      }

      rec.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = rec
    } catch {
      setMicSupported(false)
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // ignore
        }
      }
    }
  }, [])

  // Cleanup audio when closing or unmounting
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsPlayingAudio(false)
  }, [])

  useEffect(() => {
    if (!open) {
      stopAudio()
      if (isListening && recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // ignore
        }
        setIsListening(false)
      }
    }
  }, [open, isListening, stopAudio])

  const startListening = () => {
    setError(null)
    stopAudio()
    if (!recognitionRef.current) {
      setError('Speech recognition is not supported in this browser. Please type below.')
      return
    }
    try {
      setTranscript('')
      recognitionRef.current.start()
    } catch {
      try {
        recognitionRef.current.abort()
        setTimeout(() => recognitionRef.current?.start(), 150)
      } catch {
        setError('Could not start microphone. You can type below.')
      }
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
    }
    setIsListening(false)
  }

  // Play spoken answer via ElevenLabs or fallback browser TTS
  const playSpeech = async (text: string) => {
    stopAudio()
    if (!text) return

    try {
      const speakRes = await api.speak(text)
      if (speakRes.ok && speakRes.audio_url) {
        const audio = new Audio(speakRes.audio_url)
        audioRef.current = audio
        audio.onended = () => setIsPlayingAudio(false)
        audio.onerror = () => {
          setIsPlayingAudio(false)
          playBrowserFallback(text)
        }
        setIsPlayingAudio(true)
        await audio.play().catch(() => playBrowserFallback(text))
        return
      }
    } catch {
      // Fallback to browser TTS if ElevenLabs fails
    }
    playBrowserFallback(text)
  }

  const playBrowserFallback = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-CA'
      utterance.onend = () => setIsPlayingAudio(false)
      utterance.onerror = () => setIsPlayingAudio(false)
      setIsPlayingAudio(true)
      window.speechSynthesis.speak(utterance)
    } else {
      setIsPlayingAudio(false)
    }
  }

  const handleSearch = async (textToSearch?: string) => {
    const query = (textToSearch ?? transcript).trim()
    if (!query) {
      setError('Please speak or enter what bed is needed.')
      return
    }

    stopListening()
    stopAudio()
    setLoading(true)
    setError(null)

    try {
      const res = await api.matchVoice(query, coords)
      setResult(res)
      if (res.spoken_answer) {
        playSpeech(res.spoken_answer)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to match beds. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const resetSearch = () => {
    stopAudio()
    setResult(null)
    setTranscript('')
    setError(null)
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[2500] flex items-end justify-center md:items-center">
          <motion.div
            className="absolute inset-0 bg-[#1f2d30]/50 backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Voice Bed Match"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 35 }}
            className="relative flex max-h-[92dvh] w-full max-w-[540px] flex-col overflow-hidden rounded-t-[24px] bg-surface shadow-[var(--shadow-float)] md:rounded-[24px]"
          >
            {/* Grab handle for touch */}
            <div aria-hidden className="mx-auto mb-1 mt-3 h-1 w-10 shrink-0 rounded-full bg-border-strong" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-green-tint text-green-strong">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2 className="font-display text-[18px] font-bold text-text">Voice Bed Match</h2>
                  <p className="text-[12px] text-text-muted">Find & hold in 60 seconds with AI</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-2 text-text-muted hover:text-text active:scale-95"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-[12px] border border-red-tint-border bg-red-tint p-3 text-[13px] font-medium text-red-text">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* State 1: Input / Listening (when no result yet) */}
              {!result && (
                <div className="flex flex-col items-center">
                  {/* Central Mic Button */}
                  <div className="relative my-4 flex flex-col items-center">
                    {isListening && (
                      <motion.div
                        className="absolute inset-0 rounded-full bg-red/20"
                        animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0.2, 0.7] }}
                        transition={{ repeat: Infinity, duration: 1.6 }}
                      />
                    )}

                    <button
                      type="button"
                      onClick={isListening ? stopListening : startListening}
                      disabled={loading}
                      aria-label={isListening ? 'Stop listening' : 'Start speaking'}
                      className={`relative z-10 grid h-20 w-20 place-items-center rounded-full shadow-[var(--shadow-float)] transition-all ${
                        isListening
                          ? 'bg-red text-white scale-105'
                          : 'bg-green-strong text-white hover:scale-105 active:scale-95'
                      }`}
                    >
                      {isListening ? (
                        <MicOff size={32} className="animate-pulse" />
                      ) : (
                        <Mic size={32} />
                      )}
                    </button>

                    <p className="mt-3 text-center text-[14px] font-semibold text-text">
                      {isListening
                        ? 'Listening… speak your needs'
                        : micSupported
                        ? 'Tap to speak what bed is needed'
                        : 'Type needs below'}
                    </p>
                    <p className="text-center text-[12px] text-text-muted">
                      No client names. E.g. "Woman with a dog near Main & Hastings"
                    </p>
                  </div>

                  {/* Live transcript or text input area */}
                  <div className="w-full">
                    <div className="relative mt-2 rounded-[16px] border border-border bg-surface-2 p-3 focus-within:border-blue">
                      <textarea
                        ref={inputRef}
                        rows={2}
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="Or type here: e.g. Woman with a walker near Metrotown..."
                        className="w-full resize-none bg-transparent text-[15px] text-text placeholder:text-text-muted focus:outline-none"
                      />
                      {transcript && (
                        <button
                          type="button"
                          onClick={() => setTranscript('')}
                          className="absolute right-2.5 top-2.5 rounded-full p-1 text-text-muted hover:text-text"
                          aria-label="Clear input"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={loading || !transcript.trim()}
                        onClick={() => handleSearch()}
                        className="flex flex-1 items-center justify-center gap-2 rounded-[12px] bg-green-strong px-4 py-3 font-display text-[15px] font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                      >
                        <Search size={18} />
                        <span>{loading ? 'Matching beds with AI…' : 'Find Best Match'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Sample prompt chips */}
                  <div className="mt-5 w-full">
                    <p className="mb-2 text-[12px] font-medium uppercase tracking-wider text-text-muted">
                      Try quick examples
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SAMPLE_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => {
                            setTranscript(prompt)
                            handleSearch(prompt)
                          }}
                          className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-[12px] font-medium text-text-2 hover:border-green-strong hover:bg-green-tint/40 active:scale-98"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* State 2: Results Display */}
              {result && (
                <div className="space-y-4">
                  {/* Spoken Answer & Narration Box */}
                  <div className="rounded-[16px] border border-green-tint-border bg-green-tint/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-green-strong text-white">
                          <Volume2 size={16} className={isPlayingAudio ? 'animate-bounce' : ''} />
                        </div>
                        <div>
                          <p className="text-[12px] font-semibold uppercase tracking-wider text-green-text">
                            {result.narration || 'Spoken Match'}
                          </p>
                          <p className="mt-1 text-[14px] leading-relaxed font-medium text-text">
                            "{result.spoken_answer}"
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => (isPlayingAudio ? stopAudio() : playSpeech(result.spoken_answer))}
                          title={isPlayingAudio ? 'Mute' : 'Replay audio'}
                          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-text hover:bg-surface-2"
                        >
                          {isPlayingAudio ? <VolumeX size={15} /> : <RotateCcw size={15} />}
                        </button>
                      </div>
                    </div>

                    {/* Extracted criteria pills */}
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-green-tint-border/60 pt-2.5">
                      {result.criteria.gender && (
                        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-bold text-text-2 uppercase">
                          {result.criteria.gender}
                        </span>
                      )}
                      {result.criteria.has_pet && (
                        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-bold text-text-2">
                          Pets OK
                        </span>
                      )}
                      {result.criteria.needs_accessible && (
                        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-bold text-text-2">
                          Accessible
                        </span>
                      )}
                      {result.criteria.family && (
                        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-bold text-text-2">
                          Family
                        </span>
                      )}
                      {result.criteria.is_couple && (
                        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-bold text-text-2">
                          Couples
                        </span>
                      )}
                      {result.area_name && (
                        <span className="rounded-md bg-blue-tint px-2 py-0.5 text-[11px] font-bold text-blue-light">
                          {result.area_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Match Cards */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-display text-[15px] font-bold text-text">
                        Top Matches ({result.matches.length})
                      </h3>
                      <button
                        type="button"
                        onClick={resetSearch}
                        className="text-[13px] font-semibold text-blue hover:underline"
                      >
                        New Voice Search
                      </button>
                    </div>

                    {result.matches.length === 0 ? (
                      <div className="rounded-[16px] border border-border bg-surface-2 p-6 text-center">
                        <p className="text-[15px] font-medium text-text">No available beds matched these criteria.</p>
                        <p className="mt-1 text-[13px] text-text-muted">
                          Call BC 211 by dialing 2-1-1 for shelter operator assistance.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {result.matches.map((item: VoiceMatchItem, index: number) => {
                          const isBest = index === 0
                          const s = item.shelter
                          return (
                            <div
                              key={s.id}
                              className={`rounded-[18px] border p-4 shadow-sm transition-all ${
                                isBest
                                  ? 'border-green-strong/40 bg-surface ring-1 ring-green-strong/20'
                                  : 'border-border bg-surface'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    {isBest && (
                                      <span className="rounded-full bg-green-strong px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                        Best Match
                                      </span>
                                    )}
                                    <span className="text-[12px] font-medium text-text-muted">#{index + 1}</span>
                                  </div>
                                  <h4 className="mt-1 text-[16px] font-bold text-text">{s.name}</h4>
                                  <p className="text-[13px] text-text-muted">{s.address || 'Confidential location'}</p>
                                </div>

                                <div className="text-right">
                                  <span className="font-display text-[26px] font-bold leading-none text-green-text">
                                    {s.open_beds}
                                  </span>
                                  <span className="block text-[12px] font-medium text-text-muted">
                                    {s.open_beds === 1 ? 'bed open' : 'beds open'}
                                  </span>
                                </div>
                              </div>

                              {/* Reasoning trace badges */}
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {item.reasoning_trace.map((chip, chipIndex) => (
                                  <span
                                    key={chipIndex}
                                    className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-text-2"
                                  >
                                    <CheckCircle2 size={12} className="text-green-strong" />
                                    <span>{chip}</span>
                                  </span>
                                ))}
                              </div>

                              {/* Action Buttons */}
                              <div className="mt-4 flex items-center gap-2 pt-1">
                                {s.open_beds > 0 && !s.is_full && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      stopAudio()
                                      onClose()
                                      onHoldShelter(s)
                                    }}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-[12px] bg-green-strong px-4 py-2.5 font-display text-[14px] font-bold text-white shadow-sm hover:opacity-95 active:scale-98"
                                  >
                                    <span>Hold Bed (60 min)</span>
                                  </button>
                                )}

                                {!s.is_dv && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      stopAudio()
                                      onClose()
                                      onSelectShelter(s.id)
                                    }}
                                    className="inline-flex items-center gap-1 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5 text-[13px] font-semibold text-text hover:bg-border/60"
                                  >
                                    <span>Map</span>
                                    <ChevronRight size={15} />
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-surface-2/60 px-5 py-3 text-center">
              <p className="text-[12px] text-text-muted">
                Powered by Gemini & ElevenLabs · OpenBed Live Network
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
