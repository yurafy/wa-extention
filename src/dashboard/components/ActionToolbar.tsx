import React from 'react';
import { 
  Radar, 
  Download, 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  FileArchive, 
  Trash2, 
  Search, 
  Filter 
} from 'lucide-react';
import { ChatExportStatus } from '../../types';

interface ActionToolbarProps {
  currentStatus: string;
  selectedCount: number;
  totalDiscovered: number;
  failedCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedChatType: 'all' | 'individual' | 'group';
  onChatTypeChange: (type: 'all' | 'individual' | 'group') => void;
  selectedStatusFilter: 'all' | ChatExportStatus;
  onStatusFilterChange: (status: 'all' | ChatExportStatus) => void;
  
  onScanChats: () => void;
  onExportAll: () => void;
  onExportSelected: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetryFailed: () => void;
  onDownloadExport: () => void;
  onClearLocalData: () => void;

  isScanning: boolean;
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({
  currentStatus,
  selectedCount,
  totalDiscovered,
  failedCount,
  searchQuery,
  onSearchChange,
  selectedChatType,
  onChatTypeChange,
  selectedStatusFilter,
  onStatusFilterChange,
  onScanChats,
  onExportAll,
  onExportSelected,
  onPause,
  onResume,
  onStop,
  onRetryFailed,
  onDownloadExport,
  onClearLocalData,
  isScanning,
}) => {
  const isRunning = currentStatus === 'running' || isScanning;
  const isPaused = currentStatus === 'paused';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
      {/* Primary Actions Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left Side: Extraction & Process Triggers */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Scan Chats Button */}
          <button
            onClick={onScanChats}
            disabled={isRunning}
            className="flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-all shadow-sm shadow-emerald-700/20"
          >
            <Radar className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning Chats...' : 'Scan Chats'}</span>
          </button>

          {/* Export All */}
          <button
            onClick={onExportAll}
            disabled={isRunning || totalDiscovered === 0}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-all shadow-sm shadow-teal-700/20"
          >
            <Download className="w-4 h-4" />
            <span>Export All ({totalDiscovered})</span>
          </button>

          {/* Export Selected */}
          <button
            onClick={onExportSelected}
            disabled={isRunning || selectedCount === 0}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-all shadow-sm shadow-blue-700/20"
          >
            <Play className="w-4 h-4" />
            <span>Export Selected ({selectedCount})</span>
          </button>

          {/* Pause / Resume / Stop Controls */}
          {isRunning && (
            <button
              onClick={onPause}
              className="flex items-center space-x-1 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-all"
            >
              <Pause className="w-4 h-4" />
              <span>Pause</span>
            </button>
          )}

          {isPaused && (
            <button
              onClick={onResume}
              className="flex items-center space-x-1 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
            >
              <Play className="w-4 h-4" />
              <span>Resume</span>
            </button>
          )}

          {(isRunning || isPaused) && (
            <button
              onClick={onStop}
              className="flex items-center space-x-1 px-3 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-all"
            >
              <Square className="w-4 h-4" />
              <span>Stop</span>
            </button>
          )}

          {/* Retry Failed */}
          {failedCount > 0 && !isRunning && (
            <button
              onClick={onRetryFailed}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Failed ({failedCount})</span>
            </button>
          )}
        </div>

        {/* Right Side: ZIP Download & Clear Data */}
        <div className="flex items-center space-x-2">
          {/* Download Export */}
          <button
            onClick={onDownloadExport}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 hover:border-emerald-500/40 transition-all shadow-sm"
          >
            <FileArchive className="w-4 h-4" />
            <span>Download ZIP</span>
          </button>

          {/* Clear Local Data */}
          <button
            onClick={onClearLocalData}
            disabled={isRunning}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-850 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-900/50 transition-all"
            title="Purge local IndexedDB storage and start fresh"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Data</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search discovered contacts by name, phone number, or ID..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Filter by Type */}
        <div className="flex items-center space-x-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-500 hidden sm:inline" />
          <select
            value={selectedChatType}
            onChange={(e) => onChatTypeChange(e.target.value as 'all' | 'individual' | 'group')}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Chat Types</option>
            <option value="individual">Individual Chats Only</option>
            <option value="group">Group Chats Only</option>
          </select>

          {/* Filter by Export Status */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as 'all' | ChatExportStatus)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="discovered">Discovered</option>
            <option value="queued">Queued</option>
            <option value="completed">Completed</option>
            <option value="partial">Partial</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>
    </div>
  );
};
