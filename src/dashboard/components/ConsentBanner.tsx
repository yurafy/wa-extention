import React from 'react';
import { ShieldCheck, Lock, Database, ArrowRight } from 'lucide-react';

interface ConsentBannerProps {
  onAccept: () => void;
}

export const ConsentBanner: React.FC<ConsentBannerProps> = ({ onAccept }) => {
  return (
    <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-900 border border-emerald-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">
            100% Private, Local-Only Data Extraction Consent
          </h2>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          This extension runs exclusively within your local Google Chrome browser session. It reads chats directly from your authenticated WhatsApp Web tab and stores them inside your local IndexedDB storage.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="flex items-start space-x-2.5 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <Lock className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-medium">No External Servers</strong>
              <span className="text-[11px] text-slate-400">Zero cloud storage, telemetry, or remote tracking.</span>
            </div>
          </div>

          <div className="flex items-start space-x-2.5 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <Database className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-medium">Local IndexedDB</strong>
              <span className="text-[11px] text-slate-400">All data stays in browser storage and can be wiped anytime.</span>
            </div>
          </div>

          <div className="flex items-start space-x-2.5 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-medium">Strict Sandboxing</strong>
              <span className="text-[11px] text-slate-400">Never accesses or extracts session credentials or keys.</span>
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            By proceeding, you authorize this extension to scan and export chats locally on this computer.
          </span>
          <button
            onClick={onAccept}
            className="flex items-center space-x-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-lg shadow-emerald-500/25"
          >
            <span>Acknowledge & Proceed</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
