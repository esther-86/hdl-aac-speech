import React, { useState } from 'react';
import { Sparkles, Upload, ArrowRight, X } from 'lucide-react';

export default function OnboardingModal({
  isOpen,
  onClose,
  canClose = false,
  onComplete,
  onImport
}) {
  const [name, setName] = useState('');
  const [voiceType, setVoiceType] = useState('child');
  const [starterWord1, setStarterWord1] = useState('Water');
  const [starterWord2, setStarterWord2] = useState('Mom');
  const [starterWord3, setStarterWord3] = useState('iPad');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const customPhrases = [starterWord1, starterWord2, starterWord3]
      .filter((w) => w && w.trim())
      .map((w) => ({
        phrase: w.trim(),
        category: 'Starter'
      }));

    onComplete({
      name: name.trim(),
      voiceType,
      customPhrases
    });
    setName('');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        onImport(event.target.result);
      } catch (err) {
        alert('Could not import file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border-2 border-sky-400 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-scaleUp">
        {/* Banner */}
        <div className="bg-gradient-to-r from-sky-600 to-indigo-600 p-6 text-white text-center relative">
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-xl bg-black/20 hover:bg-black/40 text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="w-14 h-14 bg-white/10 rounded-2xl mx-auto flex items-center justify-center mb-3">
            <Sparkles className="w-7 h-7 text-amber-300" />
          </div>
          <h2 className="text-2xl font-black tracking-tight">Create Individual Voice Profile</h2>
          <p className="text-xs text-sky-100 mt-1 max-w-sm mx-auto">
            Each person gets their own private, on-device speech model that learns their unique speech patterns.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              1. Communicator's Name:
            </label>
            <input
              type="text"
              data-testid="onboarding-name-input"
              required
              placeholder="e.g., Maya, Alex, Lucas"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border-2 border-slate-700 focus:border-sky-400 rounded-xl px-4 py-2.5 text-base font-bold text-white focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              2. Voice Pitch Profile:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVoiceType('child')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  voiceType === 'child'
                    ? 'border-sky-400 bg-sky-950/50 text-white ring-2 ring-sky-400/20'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-sm font-bold text-sky-300">Child Voice</div>
                <div className="text-[11px] text-slate-400">Higher pitch (~220-400 Hz)</div>
              </button>

              <button
                type="button"
                onClick={() => setVoiceType('adult')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  voiceType === 'adult'
                    ? 'border-sky-400 bg-sky-950/50 text-white ring-2 ring-sky-400/20'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-sm font-bold text-sky-300">Teen / Adult</div>
                <div className="text-[11px] text-slate-400">Lower pitch (~90-180 Hz)</div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              3. Starter Favorite Words / Names:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Word 1"
                value={starterWord1}
                onChange={(e) => setStarterWord1(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Word 2"
                value={starterWord2}
                onChange={(e) => setStarterWord2(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Word 3"
                value={starterWord3}
                onChange={(e) => setStarterWord3(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-3">
            <button
              type="submit"
              data-testid="onboarding-submit-btn"
              disabled={!name.trim()}
              className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-base shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <span>Create & Switch to Profile</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <div className="text-center pt-2 border-t border-slate-800">
              <label className="cursor-pointer inline-flex items-center space-x-1.5 text-xs text-sky-400 hover:text-sky-300 font-bold">
                <Upload className="w-3.5 h-3.5" />
                <span>Or import existing profile from another device (.json)</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
