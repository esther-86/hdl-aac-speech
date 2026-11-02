import React from 'react';
import { Mic, Volume2, Edit3, Loader2 } from 'lucide-react';

export default function PushToListenHero({
  isListening,
  isTranscribing = false,
  interimText = '',
  onPushToListen,
  topOption = null,
  onSayItOut,
  onOpenEdit,
  isSpeaking = false,
  audioLevel = 0,
  voices = [],
  selectedVoiceURI = '',
  onChangeVoice = () => {}
}) {
  const closestPhrase = topOption ? topOption.phrase : 'Push Listen and speak when ready';
  const activeText = isListening && interimText ? interimText : closestPhrase;
  const charCount = (activeText || '').length;

  // Adaptive font sizing so long sentences or pasted passages never fill up or stretch the screen
  const adaptiveTextSizeClass =
    charCount > 120
      ? 'text-base sm:text-lg font-semibold leading-relaxed'
      : charCount > 55
        ? 'text-lg sm:text-xl font-bold leading-snug'
        : 'text-xl sm:text-2xl font-extrabold leading-snug';

  return (
    <section
      aria-label="Push to Listen and Say It Out"
      className="w-full max-w-5xl mx-auto my-auto bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch min-h-[340px] sm:min-h-[390px]">
        {/* LEFT SIDE: 1. PUSH TO LISTEN (START / STOP TOGGLE — NEVER CUTS OFF ON PAUSES OR "UH") */}
        <div className="md:col-span-5 flex flex-col">
          <button
            type="button"
            data-testid="push-to-listen-btn"
            onClick={onPushToListen}
            className={`w-full flex-1 rounded-3xl p-6 flex flex-col items-center justify-center text-center transition-all duration-200 border-4 shadow-xl active:scale-[0.98] ${
              isListening
                ? 'bg-rose-600 hover:bg-rose-500 border-rose-300 text-white ring-4 ring-rose-500/30'
                : 'bg-sky-500 hover:bg-sky-400 border-sky-300 text-slate-950'
            }`}
          >
            <div
              className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center mb-4 shadow-lg transition-transform ${
                isListening
                  ? 'bg-white text-rose-600 animate-pulse scale-110'
                  : 'bg-slate-950 text-sky-400'
              }`}
            >
              <Mic className="w-12 h-12 sm:w-14 sm:h-14" />
            </div>

            <span className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
              {isListening ? 'Listening... Push When Done' : '1. Push to Listen'}
            </span>

            <span
              className={`text-sm sm:text-base font-semibold mt-2 ${
                isListening ? 'text-rose-100' : 'text-slate-900'
              }`}
            >
              {isListening
                ? 'Take all the time you need — pauses will not stop me!'
                : 'Push once to start talking, push again when finished'}
            </span>

            {isListening && (
              <div className="flex items-center justify-center gap-2 mt-4 h-7">
                <span
                  className="w-2.5 bg-white rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(8, audioLevel * 28)}px` }}
                />
                <span
                  className="w-2.5 bg-amber-300 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(10, audioLevel * 36)}px` }}
                />
                <span
                  className="w-2.5 bg-white rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(8, audioLevel * 26)}px` }}
                />
              </div>
            )}
          </button>
        </div>

        {/* RIGHT SIDE: WHAT IT HEARD RIGHT AWAY -> RECALIBRATES TO WHAT I THINK YOU MEAN */}
        <div className="md:col-span-7 flex flex-col justify-between bg-slate-950 border-4 border-amber-400/90 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-amber-400">
                  {isListening
                    ? 'What I Heard You Say (Live):'
                    : isTranscribing
                      ? 'What I Heard (Recalibrating...):'
                      : 'What I Think You Mean:'}
                </span>
                {isTranscribing && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-400/40">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Recalibrating
                  </span>
                )}
              </div>

              <button
                type="button"
                data-testid="hero-edit-btn"
                onClick={onOpenEdit}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95"
                title="Edit this sentence and save as a learned test case"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit / Teach</span>
              </button>
            </div>

            {/* Bounded, Adaptive-Size Written Output Box */}
            <div
              data-testid="closest-match-text"
              className={`${adaptiveTextSizeClass} text-white tracking-tight my-2 py-4 px-5 rounded-2xl bg-slate-900 border-2 border-slate-800 min-h-[125px] max-h-[185px] overflow-y-auto flex items-center`}
            >
              {isListening ? (
                interimText ? (
                  <span className="text-sky-300">"{interimText}"</span>
                ) : (
                  <span className="text-slate-400 text-lg sm:text-xl animate-pulse">
                    Listening... speak now
                  </span>
                )
              ) : (
                <span>"{closestPhrase}"</span>
              )}
            </div>
          </div>

          {/* Voice Selector + Big Push to Say It Out Button */}
          <div className="mt-4 space-y-3">
            {voices.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-800">
                <label
                  htmlFor="main-voice-select"
                  className="text-xs font-bold text-slate-400 whitespace-nowrap"
                >
                  Voice:
                </label>
                <select
                  id="main-voice-select"
                  data-testid="main-voice-select"
                  value={selectedVoiceURI}
                  onChange={(e) => onChangeVoice(e.target.value)}
                  className="flex-1 bg-transparent text-xs sm:text-sm font-semibold text-slate-200 focus:outline-none truncate cursor-pointer"
                >
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI} className="bg-slate-900 text-white">
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              data-testid="say-it-out-btn"
              disabled={isListening}
              onClick={() => onSayItOut(topOption || { phrase: closestPhrase })}
              className={`w-full py-4 sm:py-5 px-6 rounded-2xl font-black text-xl sm:text-2xl flex items-center justify-center gap-3 shadow-lg transition-all active:scale-[0.98] ${
                isSpeaking
                  ? 'bg-emerald-400 text-slate-950 ring-4 ring-emerald-400/30'
                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-50'
              }`}
            >
              <Volume2 className={`w-7 h-7 sm:w-8 sm:h-8 ${isSpeaking ? 'animate-bounce' : ''}`} />
              <span>{isSpeaking ? 'Speaking Out Loud...' : '2. Push to Say It Out'}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
