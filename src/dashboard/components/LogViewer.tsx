import React from 'react';
import { X, Trash2, ScrollText, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { AppLog } from '../../types';
import { formatDateTime } from '../../utils/formatters';

interface LogViewerProps {
  isOpen: boolean;
  onClose: () => void;
  logs: AppLog[];
  onClearLogs: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({
  isOpen,
  onClose,
  logs,
  onClearLogs,
}) => {
  if (!isOpen) return null;

  const renderIcon = (level: AppLog['level']) => {
    switch (level) {
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
      case 'warn':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />;
      case 'info':
      default:
        return <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col h-[75vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <ScrollText className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">Live Operation & Error Logs</h2>
            <span className="text-xs text-slate-500">({logs.length} entries)</span>
          </div>
          <div className="flex items-center space-x-2">
            {logs.length > 0 && (
              <button
                onClick={onClearLogs}
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                title="Clear Logs"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="p-4 flex-1 overflow-y-auto space-y-2 font-mono text-xs bg-slate-950/40">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
              <ScrollText className="w-8 h-8 text-slate-700" />
              <p>No activity logs recorded yet</p>
            </div>
          ) : (
            logs.map((log, idx) => (
              <div 
                key={log.id || idx}
                className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-start space-x-2.5 text-[11px]"
              >
                <div className="mt-0.5">{renderIcon(log.level)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-slate-500 mb-0.5">
                    <span className="text-[10px]">{formatDateTime(log.timestamp)}</span>
                    {log.chatId && (
                      <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded font-mono truncate max-w-[120px]">
                        {log.chatId}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-200 break-words">{log.message}</p>
                  {Boolean(log.details) && (
                    <pre className="mt-1 p-1.5 bg-slate-950 rounded text-[10px] text-slate-400 overflow-x-auto">
                      {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
