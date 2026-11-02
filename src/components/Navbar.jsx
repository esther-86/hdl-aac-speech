import React from 'react';
import { BookOpen, WifiOff } from 'lucide-react';
import ProfileSwitcher from './ProfileSwitcher';

export default function Navbar({
  onOpenLearningHub,
  learnedCount = 0,
  profiles = [],
  activeProfile = null,
  onSelectProfile = () => {},
  onOpenNewProfile = () => {},
  onExportProfile = () => {},
  onImportProfile = () => {},
  onDeleteProfile = () => {}
}) {
  return (
    <header className="bg-slate-900 border-b border-slate-800 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        {/* Left: Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-amber-400 flex items-center justify-center font-black text-slate-950 text-lg shadow shrink-0">
            CV
          </div>
          <div className="flex items-center space-x-2">
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
              ClearVoice AAC
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
              <WifiOff className="w-2.5 h-2.5" />
              <span>Offline</span>
            </span>
          </div>
        </div>

        {/* Right: Individual Profile Switcher & Memory Hub */}
        <div className="flex items-center space-x-2">
          <ProfileSwitcher
            profiles={profiles}
            activeProfile={activeProfile}
            onSelectProfile={onSelectProfile}
            onOpenNewProfile={onOpenNewProfile}
            onExportProfile={onExportProfile}
            onImportProfile={onImportProfile}
            onDeleteProfile={onDeleteProfile}
          />

          <button
            type="button"
            data-testid="open-memory-hub-btn"
            onClick={onOpenLearningHub}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-slate-700 transition-all active:scale-95"
            title="Learned speech memory & vocabulary"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Memory</span>
            <span
              data-testid="learned-count-badge"
              className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center"
            >
              {learnedCount}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
