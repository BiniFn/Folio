import React, { useState } from 'react';
import { Radio, ShieldAlert, ArrowRight, Loader2, Sparkles, Server, Terminal } from 'lucide-react';
import { useAuth } from '../stores/authStore';
import { isPrivateNetworkAddress } from '../utils/formatters';

interface ConnectPageProps {
  onConnectSuccess?: () => void;
  onExploreDemo?: () => void;
}

export const ConnectPage: React.FC<ConnectPageProps> = ({
  onConnectSuccess,
  onExploreDemo,
}) => {
  const { login, loginWithToken, isLoading, error } = useAuth();
  const [authMode, setAuthMode] = useState<'credentials' | 'token'>('credentials');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [useProxy, setUseProxy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isPrivateServer = isPrivateNetworkAddress(serverUrl);
  const isHostedOnCloud = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isInsecure = serverUrl.trim().startsWith('http://') && !isPrivateServer;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!serverUrl.trim()) {
      setLocalError('Please enter your Audiobookshelf server address');
      return;
    }

    try {
      if (authMode === 'token') {
        if (!apiToken.trim()) {
          setLocalError('Please enter your API Token');
          return;
        }
        await loginWithToken(serverUrl, apiToken, useProxy);
      } else {
        if (!username.trim() || !password) {
          setLocalError('Please enter your username and password');
          return;
        }
        await login(serverUrl, username, password, useProxy);
      }
      onConnectSuccess?.();
    } catch (err: any) {
      setLocalError(err.message || 'Could not connect to server. Check address and credentials.');
    }
  };

  return (
    <div className="min-h-screen bg-[#12161a] text-neutral-100 flex flex-col justify-center items-center p-4 md:p-6 relative overflow-hidden">
      {/* Background radial accent */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#181c21] border border-[#232830] rounded-2xl shadow-2xl p-6 md:p-8 relative z-10 animate-fade-in">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mb-3 shadow-lg shadow-teal-500/10">
            <Radio className="w-7 h-7 text-teal-400" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-neutral-100">
            Connect to Audiobookshelf
          </h1>
          <p className="text-xs text-stone-400 mt-1 max-w-xs">
            Unite your audiobooks and ebooks into a distraction-free, synchronized reading experience.
          </p>
        </div>

        {/* Error Notice */}
        {(localError || error) && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block mb-0.5">Connection failed</span>
              <span className="text-[11px] text-red-300/90">{localError || error}</span>
            </div>
          </div>
        )}

        {/* Private IP on Cloud Deployment Warning */}
        {isPrivateServer && isHostedOnCloud && (
          <div className="mb-4 p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs flex flex-col gap-2.5">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Local Home Network Address</span>
                <span className="text-[11px] text-amber-200/90 leading-relaxed block mt-0.5">
                  You are accessing Folio from the cloud (<code className="text-amber-300 font-mono">vercel.app</code>) while targeting a private home IP (<code className="text-amber-300 font-mono">{serverUrl || '192.168.x.x'}</code>).
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-black/50 border border-amber-900/40 text-[11px] text-stone-300 flex flex-col gap-2">
              <span className="font-semibold text-amber-300">How to connect:</span>
              <div className="flex flex-col gap-1">
                <span><strong>Option 1 (Recommended):</strong> Create a free Cloudflare Tunnel on your host machine:</span>
                <div className="bg-neutral-900 p-2 rounded text-[10px] text-teal-300 font-mono flex items-center justify-between overflow-x-auto">
                  <code>cloudflared tunnel --url {serverUrl || 'http://192.168.1.11:3333'}</code>
                </div>
                <span className="text-stone-400 text-[10px]">Then paste the generated <span className="text-teal-300">https://...trycloudflare.com</span> URL above.</span>
              </div>
              <div className="pt-1.5 border-t border-neutral-800/80">
                <span><strong>Option 2:</strong> Run Folio directly on your local computer via <code className="text-teal-300 font-mono">bun run dev</code> (opens on <span className="text-stone-200 font-mono">http://localhost:3000</span>, which connects directly over your LAN).</span>
              </div>
            </div>
          </div>
        )}

        {/* Insecure HTTP Warning */}
        {isInsecure && (
          <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-300 text-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span className="text-[11px]">
              You are connecting over unencrypted HTTP. We recommend enabling HTTPS for remote servers.
            </span>
          </div>
        )}

        {/* Connect Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">
              Server URL
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="https://abs.yourdomain.com or https://...trycloudflare.com"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="w-full bg-[#12161a] border border-[#232830] focus:border-teal-500/70 rounded-xl px-3.5 py-2.5 text-xs text-neutral-100 placeholder-stone-600 outline-none transition-colors"
                disabled={isLoading}
              />
            </div>
            <span className="text-[10px] text-stone-500 mt-1 block">
              Audiobookshelf server root address
            </span>
          </div>

          {/* Auth Method Tabs */}
          <div className="flex bg-[#12161a] p-1 rounded-xl border border-[#232830] text-xs">
            <button
              type="button"
              onClick={() => setAuthMode('credentials')}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                authMode === 'credentials'
                  ? 'bg-teal-500 text-black font-semibold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Username & Password
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('token')}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                authMode === 'token'
                  ? 'bg-teal-500 text-black font-semibold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              API Token
            </button>
          </div>

          {authMode === 'credentials' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1.5">
                  Username <span className="text-[10px] text-stone-500">(case-sensitive)</span>
                </label>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#12161a] border border-[#232830] focus:border-teal-500/70 rounded-xl px-3.5 py-2.5 text-xs text-neutral-100 placeholder-stone-600 outline-none transition-colors"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#12161a] border border-[#232830] focus:border-teal-500/70 rounded-xl px-3.5 py-2.5 text-xs text-neutral-100 placeholder-stone-600 outline-none transition-colors"
                  disabled={isLoading}
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">
                API Token
              </label>
              <textarea
                rows={2}
                placeholder="Paste your Audiobookshelf API token here"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="w-full bg-[#12161a] border border-[#232830] focus:border-teal-500/70 rounded-xl px-3.5 py-2 text-xs text-neutral-100 placeholder-stone-600 outline-none transition-colors font-mono resize-none"
                disabled={isLoading}
              />
              <span className="text-[10px] text-stone-500 mt-1 block">
                Found in Audiobookshelf web under <em>Settings &gt; Users &gt; Your User &gt; API Token</em>
              </span>
            </div>
          )}

          {/* CORS Proxy Option */}
          <div className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              id="useProxy"
              checked={useProxy}
              onChange={(e) => setUseProxy(e.target.checked)}
              className="w-3.5 h-3.5 rounded bg-[#12161a] border-neutral-700 text-teal-500 focus:ring-0 accent-teal-500"
            />
            <label htmlFor="useProxy" className="text-xs text-stone-400 cursor-pointer">
              Use built-in proxy (recommended if CORS is restricted)
            </label>
          </div>

          {/* Connect Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 rounded-xl font-medium bg-teal-500 hover:bg-teal-400 text-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-500/20 active:scale-[0.98] disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <span>Connect Server</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Demo / Sandbox Option */}
        {onExploreDemo && (
          <div className="mt-6 pt-5 border-t border-[#232830] text-center">
            <button
              onClick={onExploreDemo}
              className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Preview with local sample library</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
