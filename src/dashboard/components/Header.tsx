import React from 'react';
import { 
  ShieldCheck, 
  ExternalLink, 
  Maximize2, 
  Settings, 
  ScrollText, 
  Wifi, 
  WifiOff, 
  RefreshCw 
} from 'lucide-react';
import { WhatsAppSessionStatus } from '../../types/messaging';

interface HeaderProps {
  sessionStatus: WhatsAppSessionStatus | null;
  isCheckingStatus: boolean;
  onRefreshStatus: () => void;
  onOpenWhatsApp: () => void;
  onOpenFullTab: () => void;
  onOpenSettings: () => void;
  onOpenLogs: () => void;
  isPopupView: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  sessionStatus,
  isCheckingStatus,
  onRefreshStatus,
  onOpenWhatsApp,
  onOpenFullTab,
  onOpenSettings,
  onOpenLogs,
  isPopupView,
}) => {
  const isConnected = sessionStatus?.isWhatsAppOpen && sessionStatus?.isAuthenticated;
  const isAwaitingLogin = sessionStatus?.isWhatsAppOpen && !sessionStatus?.isAuthenticated;

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Title and Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="w-6 h-6 text-slate-950 font-bold" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold tracking-tight text-white">
                WhatsApp Business <span className="text-emerald-400">Exporter</span>
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                MV3 Local Only
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Bulk Chat & Media Exporter • Local Browser Processing
            </p>
          </div>
        </div>

        {/* Status indicator and Quick actions */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* WhatsApp Web Status Badge */}
          <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            isConnected 
              ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300' 
              : isAwaitingLogin
                ? 'bg-amber-950/60 border-amber-700/50 text-amber-300'
                : 'bg-rose-950/60 border-rose-800/50 text-rose-300'
          }`}>
            {isConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <Wifi className="w-3.5 h-3.5" />
                <span>WhatsApp Web Ready</span>
              </>
            ) : isAwaitingLogin ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <Wifi className="w-3.5 h-3.5" />
                <span>Awaiting QR Login</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <WifiOff className="w-3.5 h-3.5" />
                <span>WhatsApp Tab Closed</span>
              </>
            )}

            <button
              onClick={onRefreshStatus}
              disabled={isCheckingStatus}
              title="Refresh connection status"
              className="ml-1 p-0.5 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isCheckingStatus ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Open WhatsApp Web Tab */}
          {!isConnected && (
            <button
              onClick={onOpenWhatsApp}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm shadow-emerald-700/30"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open WhatsApp</span>
            </button>
          )}

          {/* Expand to full tab if in popup view */}
          {isPopupView && (
            <button
              onClick={onOpenFullTab}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
              title="Open Full Screen Dashboard Tab"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Tab</span>
            </button>
          )}

          {/* Activity Logs Trigger */}
          <button
            onClick={onOpenLogs}
            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
          >
            <ScrollText className="w-3.5 h-3.5 text-slate-400" />
            <span>Logs</span>
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};
