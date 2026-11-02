import React, { useState, useEffect } from 'react';
import { X, Sparkles, BookOpen, Settings, Trash2, Plus, Volume2, Check } from 'lucide-react';
import { speechService } from '../services/speechSynthesis';

export default function LearningManagerModal({
  isOpen,
  onClose,
  activeProfileName = 'My Child',
  learnedPatterns = [],
  dictionary = [],
  settings = {},
  onDeletePattern,
  onAddWord,
  onDeleteWord,
  onSaveSettings
}) {
  const [activeTab, setActiveTab] = useState('learned'); // 'learned' | 'dictionary' | 'settings'
  const [newPhrase, setNewPhrase] = useState('');
  const [newTriggers, setNewTriggers] = useState('');
  const [newCategory, setNewCategory] = useState('Family');

  const [localSettings, setLocalSettings] = useState(settings);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleAddCustomWord = (e) => {
    e.preventDefault();
    if (!newPhrase.trim()) return;
    const triggersArray = newTriggers
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onAddWord({
      phrase: newPhrase.trim(),
      category: newCategory,
      triggers: triggersArray
    });

    setNewPhrase('');
    setNewTriggers('');
  };

  const handleSaveSettings = () => {
    onSaveSettings(localSettings);
    speechService.setSettings(localSettings);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const voices = speechService.getVoices();

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {activeProfileName}'s Speech Pattern Memory
              </h2>
              <p className="text-xs text-slate-400">
                100% Offline, Individualized Personal Speech Model
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-memory-hub-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('learned')}
            className={`py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'learned'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Learned Patterns ({learnedPatterns.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dictionary')}
            className={`py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'dictionary'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Personal Vocabulary ({dictionary.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'settings'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Speech & Voice Settings</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* TAB 1: LEARNED PATTERNS */}
          {activeTab === 'learned' && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300">
                Every time <strong>{activeProfileName}</strong> pushes <strong>Say It Out</strong> or
                saves a correction, the app learns how they say that phrase. Each profile on each
                device learns independently.
              </div>

              {learnedPatterns.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <p className="font-semibold">No custom speech patterns learned for {activeProfileName} yet.</p>
                  <p className="text-xs mt-1">
                    As {activeProfileName} speaks and pushes "Say It Out", patterns will be saved here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5" data-testid="learned-patterns-list">
                  {learnedPatterns.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-800/80 border border-slate-700/70 p-3.5 rounded-2xl flex items-center justify-between gap-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800">
                            "{item.rawInput || 'unclear speech'}"
                          </span>
                          <span className="text-slate-400 text-xs">➔</span>
                          <span className="text-sm font-bold text-amber-300">
                            "{item.resolvedText}"
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                          <span>
                            Used: <strong>{item.useCount || 1} times</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Last: {new Date(item.lastUsed || item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => speechService.speak(item.resolvedText)}
                          className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300"
                          title="Preview voice"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePattern(item.id)}
                          className="p-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400"
                          title="Delete pattern"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FAMILY DICTIONARY */}
          {activeTab === 'dictionary' && (
            <div className="space-y-5">
              <form
                onSubmit={handleAddCustomWord}
                className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3"
              >
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  Add Custom Word / Name / Food for {activeProfileName}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Target Clear Phrase
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., I want Oreo cookies, Grandma"
                      value={newPhrase}
                      onChange={(e) => setNewPhrase(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Category</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="Family">Family / Names</option>
                      <option value="Foods">Foods & Drinks</option>
                      <option value="Activities">Activities & Toys</option>
                      <option value="Places">Places & School</option>
                      <option value="Needs">Needs & Feelings</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    How they usually pronounce it (comma-separated approximations)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., oh-yo, ooyo, cooki"
                    value={newTriggers}
                    onChange={(e) => setNewTriggers(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!newPhrase.trim()}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    Add to Vocabulary
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {dictionary.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{item.phrase}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                          {item.category || 'General'}
                        </span>
                      </div>
                      {item.triggers && item.triggers.length > 0 && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          Sounds:{' '}
                          {item.triggers.map((t, i) => (
                            <span key={i} className="font-mono text-sky-400 mr-2">
                              "{t}"
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {item.id && (
                      <button
                        type="button"
                        onClick={() => onDeleteWord(item.id)}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-5">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white">Voice & Speech Tuning</h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Text-to-Speech Voice
                  </label>
                  <select
                    value={localSettings.selectedVoiceURI || ''}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, selectedVoiceURI: e.target.value })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    {voices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Speech Pitch ({localSettings.speechPitch})
                    </label>
                    <input
                      type="range"
                      min="0.7"
                      max="1.5"
                      step="0.05"
                      value={localSettings.speechPitch || 1.05}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          speechPitch: parseFloat(e.target.value)
                        })
                      }
                      className="w-full accent-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Speech Speed ({localSettings.speechRate})
                    </label>
                    <input
                      type="range"
                      min="0.6"
                      max="1.3"
                      step="0.05"
                      value={localSettings.speechRate || 0.95}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          speechRate: parseFloat(e.target.value)
                        })
                      }
                      className="w-full accent-amber-400"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => speechService.speak('Hello, this is my clear voice!')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-sky-300 flex items-center gap-1.5 border border-slate-700"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Test Voice Audio
                </button>
              </div>

              {/* Listening Duration & Pause Tolerance */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white">Listening Duration & Child Pause Timing</h3>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Wait time after she pauses speaking ({localSettings.silenceAfterVoiceSec || 5} seconds)
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="12"
                    step="1"
                    value={localSettings.silenceAfterVoiceSec || 5}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        silenceAfterVoiceSec: parseInt(e.target.value, 10)
                      })
                    }
                    className="w-full accent-sky-400"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Gives her plenty of time to pause between words or syllables without cutting her off.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <div>
                    <div className="text-xs font-bold text-white">
                      Manual Stop Only ("Tap When Done")
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Never stop listening automatically—keep listening until she taps the Listen button again.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(localSettings.manualStopOnly)}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, manualStopOnly: e.target.checked })
                    }
                    className="w-5 h-5 accent-sky-400 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* High-Accuracy Academic & Open-Vocabulary AI Audio Mode */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-sky-800/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-sky-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      High-Accuracy Academic & Open-Vocabulary AI Audio
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Decodes open-ended classroom & school speech (Science, Math, Reading, History) using her 6 calibrated phonological rules + direct audio AI when online.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.aiTranscriptionEnabled !== false}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        aiTranscriptionEnabled: e.target.checked
                      })
                    }
                    className="w-5 h-5 accent-sky-400 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Classroom / Academic Subject Context
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Elementary Science, Math Fractions, Reading Comprehension"
                    value={
                      localSettings.academicSubjectContext ||
                      'General Classroom, Academic Subjects (Science, Math, Reading, History), & Open Speech'
                    }
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        academicSubjectContext: e.target.value
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      AI Audio Engine
                    </label>
                    <select
                      value={localSettings.aiProvider || 'gemini'}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, aiProvider: e.target.value })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    >
                      <option value="gemini">Gemini 2.5 Flash Multimodal Audio (Recommended)</option>
                      <option value="openai">OpenAI Whisper (whisper-1)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      API Key (or set in WP Admin)
                    </label>
                    <input
                      type="password"
                      placeholder={
                        typeof window !== 'undefined' &&
                        window.hdlAacSpeechConfig &&
                        window.hdlAacSpeechConfig.hasServerAiKey
                          ? 'Configured on WordPress Server ✓'
                          : 'Paste Gemini or OpenAI API Key...'
                      }
                      value={localSettings.aiApiKey || ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, aiApiKey: e.target.value })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>
                </div>
              </div>

              {/* Conversational Auto-Clarify Trigger */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">Conversational Auto-Clarify</h3>
                    <p className="text-xs text-slate-400">
                      Auto-speaks the top choice when partner asks "Can you say that again?"
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(localSettings.autoClarifyEnabled)}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, autoClarifyEnabled: e.target.checked })
                    }
                    className="w-5 h-5 accent-amber-400 rounded cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                {savedNotice ? (
                  <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    Settings saved!
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-md transition-all active:scale-95"
                >
                  Save Settings
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
