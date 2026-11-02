import React, { useState, useEffect } from 'react';
import { X, Volume2, Sparkles } from 'lucide-react';

const COMMON_QUICK_WORDS = [
  'Water',
  'Juice',
  'Snack',
  'Hungry',
  'Bathroom',
  'Outside',
  'Park',
  'Play',
  'Game',
  'Help',
  'Yes',
  'No',
  'Please',
  'Thank you',
  'More',
  'All done'
];

export default function EditModal({
  isOpen,
  onClose,
  rawHeard = '',
  initialText = '',
  onSaveAndSpeak
}) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setText(initialText || '');
    }
  }, [isOpen, initialText]);

  if (!isOpen) return null;

  const handleAppendWord = (word) => {
    setText((prev) => (prev ? `${prev} ${word}` : word));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onSaveAndSpeak(text.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Correct Phrase & Teach Pattern
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              This profile will remember this pronunciation for future conversations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {rawHeard && (
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-1 max-h-[80px] overflow-y-auto">
              <span className="text-xs text-slate-400">Heard Sound / Phrase:</span>
              <span className="text-xs sm:text-sm font-mono font-bold text-sky-400 break-words">
                "{rawHeard}"
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              What You Meant to Say:
            </label>
            <textarea
              data-testid="edit-phrase-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type the intended sentence here..."
              rows={3}
              autoFocus
              className="w-full bg-slate-950 border-2 border-slate-700 focus:border-amber-400 rounded-2xl p-3.5 text-base sm:text-lg font-semibold leading-relaxed text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/20 max-h-[180px] overflow-y-auto"
            />
          </div>

          {/* Quick Word Tap Chips */}
          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2">Quick Word Add:</div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_QUICK_WORDS.map((word) => (
                <button
                  type="button"
                  key={word}
                  onClick={() => handleAppendWord(word)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold active:scale-95 transition-all"
                >
                  +{word}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-and-speak-edit-btn"
              disabled={!text.trim()}
              className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-base shadow-lg transition-all active:scale-95"
            >
              <Sparkles className="w-5 h-5" />
              <span>Save & Teach Pattern</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
