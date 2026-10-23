import React, { useState } from 'react';
import { 
  Server, 
  LogOut, 
  Sliders, 
  BookOpen, 
  Database, 
  Check, 
  ShieldCheck, 
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../stores/authStore';
import { useReader } from '../stores/readerStore';
import { progressSyncManager } from '../services/progressSync';
import { ReaderTheme, ReaderFont } from '../types/audiobookshelf';

export const SettingsPage: React.FC = () => {
  const { serverUrl, user, useProxy, logout } = useAuth();
  const { preferences, setPreferences } = useReader();

  const [skipBack, setSkipBack] = useState(15);
  const [skipForward, setSkipForward] = useState(30);
  const [defaultSpeed, setDefaultSpeed] = useState(1.0);
  const [pendingCount, setPendingCount] = useState(progressSyncManager.getPendingCount());
  const [isFlushing, setIsFlushing] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleFlushQueue = async () => {
    setIsFlushing(true);
    await progressSyncManager.flushQueue();
    setPendingCount(progressSyncManager.getPendingCount());
    setIsFlushing(false);
  };

  const handleClearCache = () => {
    if (window.confirm('Clear local preferences and cached offline positions?')) {
      localStorage.removeItem('abs_offline_sync_queue_v1');
      localStorage.removeItem('abs_reader_preferences_v1');
      setPendingCount(0);
      alert('Local cache reset.');
    }
  };

  const handleSavePlayback = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8 flex flex-col gap-8 max-w-4xl mx-auto w-full pb-24 text-neutral-100">
      <div className="pb-4 border-b border-[#232830]">
        <h1 className="text-2xl font-serif font-bold text-neutral-100">
          Settings & Preferences
        </h1>
        <p className="text-xs text-stone-400 mt-1">
          Manage your server connection, reading typography, and playback behavior.
        </p>
      </div>

      {/* 1. Server Connection Status */}
      <section className="bg-[#181c21] border border-[#232830] rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
        <div className="flex items-center gap-3 pb-3 border-b border-[#232830]">
          <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Audiobookshelf Server</h2>
            <p className="text-xs text-stone-400">Current connection status and account</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-[#13161a] rounded-xl border border-[#232830]">
            <span className="text-stone-400 block mb-1">Server Address</span>
            <span className="font-mono text-neutral-200 truncate block">{serverUrl || 'Offline Demo Mode'}</span>
          </div>
          <div className="p-3 bg-[#13161a] rounded-xl border border-[#232830]">
            <span className="text-stone-400 block mb-1">Logged In Account</span>
            <span className="font-semibold text-neutral-200 block">{user?.username || 'Demo User'}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-xs text-teal-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Connection Active {useProxy ? '· via Proxy' : '· Direct'}</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/30 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Disconnect Server</span>
          </button>
        </div>
      </section>

      {/* 2. Reader Typography & Appearance */}
      <section className="bg-[#181c21] border border-[#232830] rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
        <div className="flex items-center gap-3 pb-3 border-b border-[#232830]">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Reader Appearance</h2>
            <p className="text-xs text-stone-400">Default typography and canvas styling</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
          {/* Theme */}
          <div className="flex flex-col gap-2">
            <label className="text-stone-300 font-medium">Default Theme</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'dark' as ReaderTheme, label: 'Dark Ambiance' },
                { id: 'light' as ReaderTheme, label: 'Clean Light' },
                { id: 'sepia' as ReaderTheme, label: 'Warm Paper' },
                { id: 'midnight' as ReaderTheme, label: 'Midnight Black' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setPreferences({ theme: t.id })}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    preferences.theme === t.id
                      ? 'border-teal-500 bg-teal-500/10 text-teal-300 font-semibold'
                      : 'border-[#232830] bg-[#13161a] text-stone-300 hover:bg-neutral-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Family */}
          <div className="flex flex-col gap-2">
            <label className="text-stone-300 font-medium">Typeface</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'serif' as ReaderFont, label: 'Merriweather (Serif)' },
                { id: 'sans' as ReaderFont, label: 'Inter (Sans)' },
                { id: 'mono' as ReaderFont, label: 'JetBrains (Mono)' },
                { id: 'dyslexic' as ReaderFont, label: 'OpenDyslexic' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setPreferences({ fontFamily: f.id })}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    preferences.fontFamily === f.id
                      ? 'border-teal-500 bg-teal-500/10 text-teal-300 font-semibold'
                      : 'border-[#232830] bg-[#13161a] text-stone-300 hover:bg-neutral-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size Slider */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <label className="text-stone-300 font-medium">Font Size</label>
              <span className="font-mono text-teal-400 font-semibold">{preferences.fontSize}px</span>
            </div>
            <input
              type="range"
              min={14}
              max={28}
              value={preferences.fontSize}
              onChange={(e) => setPreferences({ fontSize: Number(e.target.value) })}
              className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
            />
          </div>

          {/* Line Height Slider */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <label className="text-stone-300 font-medium">Line Spacing</label>
              <span className="font-mono text-teal-400 font-semibold">{preferences.lineHeight.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={1.4}
              max={2.4}
              step={0.05}
              value={preferences.lineHeight}
              onChange={(e) => setPreferences({ lineHeight: Number(e.target.value) })}
              className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
            />
          </div>
        </div>
      </section>

      {/* 3. Audiobook Playback Settings */}
      <section className="bg-[#181c21] border border-[#232830] rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
        <div className="flex items-center gap-3 pb-3 border-b border-[#232830]">
          <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Playback Controls</h2>
            <p className="text-xs text-stone-400">Intervals and default audio speeds</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="text-stone-300 font-medium block mb-1.5">Skip Backward</label>
            <select
              value={skipBack}
              onChange={(e) => setSkipBack(Number(e.target.value))}
              className="w-full bg-[#13161a] border border-[#232830] text-stone-200 rounded-xl p-2.5 outline-none focus:border-teal-500"
            >
              <option value={10}>10 seconds</option>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
            </select>
          </div>

          <div>
            <label className="text-stone-300 font-medium block mb-1.5">Skip Forward</label>
            <select
              value={skipForward}
              onChange={(e) => setSkipForward(Number(e.target.value))}
              className="w-full bg-[#13161a] border border-[#232830] text-stone-200 rounded-xl p-2.5 outline-none focus:border-teal-500"
            >
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </select>
          </div>

          <div>
            <label className="text-stone-300 font-medium block mb-1.5">Default Speed</label>
            <select
              value={defaultSpeed}
              onChange={(e) => setDefaultSpeed(Number(e.target.value))}
              className="w-full bg-[#13161a] border border-[#232830] text-stone-200 rounded-xl p-2.5 outline-none focus:border-teal-500"
            >
              <option value={0.75}>0.75x</option>
              <option value={1.0}>1.0x (Normal)</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2.0}>2.0x</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSavePlayback}
            className="flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-black transition-colors"
          >
            {savedSuccess ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{savedSuccess ? 'Saved' : 'Save Playback Preferences'}</span>
          </button>
        </div>
      </section>

      {/* 4. Offline Queue & Storage */}
      <section className="bg-[#181c21] border border-[#232830] rounded-2xl p-6 flex flex-col gap-4 shadow-xl text-xs">
        <div className="flex items-center gap-3 pb-3 border-b border-[#232830]">
          <div className="p-2.5 rounded-xl bg-neutral-800 text-stone-300">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Storage & Progress Queue</h2>
            <p className="text-stone-400">Offline changes and local browser cache</p>
          </div>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <span className="font-medium text-stone-200 block">Pending Offline Progress Updates</span>
            <span className="text-stone-400 text-[11px]">
              {pendingCount === 0 ? 'All reading and listening progress is synchronized with server.' : `${pendingCount} update(s) waiting to sync.`}
            </span>
          </div>

          {pendingCount > 0 && (
            <button
              onClick={handleFlushQueue}
              disabled={isFlushing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
              <span>Sync Now</span>
            </button>
          )}
        </div>

        <div className="pt-3 border-t border-[#232830] flex justify-between items-center">
          <span className="text-stone-400">Reset local stored settings and cached sessions</span>
          <button
            onClick={handleClearCache}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Local Storage</span>
          </button>
        </div>
      </section>
    </div>
  );
};
