import React, { useState, useRef, useEffect } from 'react';
import { User, ChevronDown, Plus, Download, Upload, Trash2, Check } from 'lucide-react';

export default function ProfileSwitcher({
  profiles = [],
  activeProfile = null,
  onSelectProfile,
  onOpenNewProfile,
  onExportProfile,
  onImportProfile,
  onDeleteProfile
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        onImportProfile(event.target.result);
        setIsOpen(false);
      } catch (err) {
        alert('Failed to import profile: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        data-testid="profile-switcher-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-bold transition-all shadow-sm active:scale-95"
      >
        <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
          <User className="w-3.5 h-3.5" />
        </div>
        <span data-testid="active-profile-name" className="truncate max-w-[100px] sm:max-w-[140px]">
          {activeProfile ? activeProfile.name : 'Select Profile'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-scaleUp">
          <div className="p-3 border-b border-slate-800 bg-slate-950">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Individual Profiles on this Device
            </span>
          </div>

          <div className="p-1 max-h-52 overflow-y-auto space-y-0.5">
            {profiles.map((p) => {
              const isActive = activeProfile && activeProfile.id === p.id;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                    isActive
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProfile(p.id);
                      setIsOpen(false);
                    }}
                    className="flex-1 flex items-center space-x-2 text-left"
                  >
                    <span>{p.name}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-sky-400" />}
                  </button>

                  {profiles.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete profile for "${p.name}"?`)) {
                          onDeleteProfile(p.id);
                        }
                      }}
                      className="p-1 hover:text-rose-400 text-slate-500 rounded"
                      title="Delete profile"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Links */}
          <div className="p-2 border-t border-slate-800 bg-slate-950/80 space-y-1 text-xs">
            <button
              type="button"
              data-testid="add-new-profile-btn"
              onClick={() => {
                onOpenNewProfile();
                setIsOpen(false);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-sky-400 hover:bg-slate-800 font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add New Person / Profile</span>
            </button>

            {activeProfile && (
              <button
                type="button"
                onClick={() => {
                  onExportProfile(activeProfile.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-amber-300 hover:bg-slate-800 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Backup Profile (.json)</span>
              </button>
            )}

            <label className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 font-medium cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-slate-400" />
              <span>Import Profile (.json)</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
