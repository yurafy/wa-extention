import React from 'react';
import { 
  Users, 
  MessageSquare, 
  Image as ImageIcon, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  HardDrive, 
  Activity 
} from 'lucide-react';
import { formatBytes } from '../../utils/formatters';

interface StatsOverviewProps {
  totalDiscovered: number;
  totalProcessed: number;
  selectedCount: number;
  totalMessages: number;
  totalMedia: number;
  successfulCount: number;
  failedCount: number;
  currentStatus: string;
  progressPercent: number;
  estimatedRemainingTime: string;
  processingSpeed: number;
  totalExportSizeBytes: number;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  totalDiscovered,
  totalProcessed,
  selectedCount,
  totalMessages,
  totalMedia,
  successfulCount,
  failedCount,
  currentStatus,
  progressPercent,
  estimatedRemainingTime,
  processingSpeed,
  totalExportSizeBytes,
}) => {
  return (
    <div className="space-y-4">
      {/* Active Processing Banner if in progress */}
      {currentStatus !== 'idle' && (
        <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 shadow-lg shadow-emerald-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
                Status: <span className="text-emerald-400 capitalize">{currentStatus.replace('_', ' ')}</span>
              </span>
            </div>
            <div className="flex items-center space-x-4 text-xs text-slate-400">
              <span className="flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Est. Remaining: <strong className="text-slate-200">{estimatedRemainingTime}</strong></span>
              </span>
              {processingSpeed > 0 && (
                <span className="flex items-center space-x-1">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Speed: <strong className="text-emerald-300">{processingSpeed} chats/s</strong></span>
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700/50">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-3 rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-2 text-[10px] font-bold text-slate-950"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            >
              {progressPercent > 10 ? `${Math.round(progressPercent)}%` : ''}
            </div>
          </div>
          <div className="flex justify-between items-center text-xs text-slate-400 mt-1.5">
            <span>Processed {totalProcessed} of {selectedCount || totalDiscovered} selected chats</span>
            <span>{Math.round(progressPercent)}% complete</span>
          </div>
        </div>
      )}

      {/* Grid of Key Performance & Extracted Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Total Discovered Chats */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Discovered</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight">{totalDiscovered.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-1">{selectedCount} selected</div>
        </div>

        {/* Processed Chats */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Processed</span>
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight">{totalProcessed.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-1">chats exported</div>
        </div>

        {/* Extracted Messages */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Messages</span>
            <MessageSquare className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight">{totalMessages.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-1">chronological records</div>
        </div>

        {/* Extracted Media Files */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Media Files</span>
            <ImageIcon className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight">{totalMedia.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-1">images, docs, audio</div>
        </div>

        {/* Success vs Failed */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Success / Failed</span>
            <div className="flex space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
            </div>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            <span className="text-emerald-400">{successfulCount}</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className={failedCount > 0 ? 'text-rose-400' : 'text-slate-400'}>{failedCount}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">export health</div>
        </div>

        {/* Export Size */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Export Size</span>
            <HardDrive className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight">{formatBytes(totalExportSizeBytes)}</div>
          <div className="text-[11px] text-slate-500 mt-1">local storage</div>
        </div>

        {/* Est. Remaining Work */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Est. Remaining</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-bold text-cyan-300 truncate" title={estimatedRemainingTime}>
            {estimatedRemainingTime}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">at current rate</div>
        </div>
      </div>
    </div>
  );
};
