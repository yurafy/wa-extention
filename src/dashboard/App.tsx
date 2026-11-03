import React, { useState, useEffect, useCallback } from 'react';
import { 
  ChatContact, 
  ChatExportStatus, 
  ExportSettings, 
  AppLog 
} from '../types';
import { WhatsAppSessionStatus } from '../types/messaging';
import { chatRepository } from '../storage/chatRepository';
import { settingsRepository } from '../storage/settingsRepository';
import { logRepository } from '../storage/logRepository';
import { DEFAULT_SETTINGS } from '../storage/db';
import { calculateEstimatedRemainingTime } from '../utils/formatters';

import { Header } from './components/Header';
import { StatsOverview } from './components/StatsOverview';
import { ActionToolbar } from './components/ActionToolbar';
import { ChatTable } from './components/ChatTable';
import { ConsentBanner } from './components/ConsentBanner';
import { ExportConfigModal } from './components/ExportConfigModal';
import { ClearDataModal } from './components/ClearDataModal';
import { LogViewer } from './components/LogViewer';

export const App: React.FC = () => {
  // Session & Connection State
  const [sessionStatus, setSessionStatus] = useState<WhatsAppSessionStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Settings & Consent State
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS);
  const [hasConsent, setHasConsent] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClearDataOpen, setIsClearDataOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);

  // Data & Table State
  const [chats, setChats] = useState<ChatContact[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChatType, setSelectedChatType] = useState<'all' | 'individual' | 'group'>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | ChatExportStatus>('all');

  // Processing & Stats State
  const [stats, setStats] = useState({
    totalDiscovered: 0,
    selected: 0,
    completed: 0,
    partial: 0,
    failed: 0,
    queued: 0,
    inProgress: 0,
    processed: 0,
    totalMessages: 0,
    totalMedia: 0,
  });
  const [currentProcessStatus, setCurrentProcessStatus] = useState<'idle' | 'scanning' | 'running' | 'paused' | 'completed'>('idle');
  const [isScanning, setIsScanning] = useState(false);
  const [logs, setLogs] = useState<AppLog[]>([]);

  // Timer & ETA tracking
  const [processStartTime, setProcessStartTime] = useState<number | null>(null);

  // Detect whether running in compact popup or full browser tab
  const [isPopupView] = useState(() => {
    return window.innerWidth < 800 || window.location.search.includes('view=popup');
  });

  /**
   * Check connection with WhatsApp Web tab via background service worker
   */
  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          { action: 'CHECK_WHATSAPP_STATUS', timestamp: Date.now() },
          (response) => {
            if (response && response.status) {
              setSessionStatus(response.status);
            } else {
              setSessionStatus({
                isWhatsAppOpen: false,
                isAuthenticated: false,
                pageReady: false,
              });
            }
            setIsCheckingStatus(false);
          }
        );
      } else {
        // Fallback for standalone/mock testing environment
        setSessionStatus({
          isWhatsAppOpen: false,
          isAuthenticated: false,
          pageReady: false,
        });
        setIsCheckingStatus(false);
      }
    } catch {
      setIsCheckingStatus(false);
    }
  }, []);

  /**
   * Reload chats and overview stats from IndexedDB
   */
  const refreshData = useCallback(async () => {
    try {
      const [chatResult, currentStats] = await Promise.all([
        chatRepository.listChats({
          search: searchQuery,
          chatType: selectedChatType,
          status: selectedStatusFilter,
        }),
        chatRepository.getStats(),
      ]);

      setChats(chatResult.chats);
      setStats(currentStats);
    } catch (err) {
      console.error('Failed to load chat data from IndexedDB:', err);
    } finally {
      setIsLoadingChats(false);
    }
  }, [searchQuery, selectedChatType, selectedStatusFilter]);

  /**
   * Refresh recent activity logs
   */
  const refreshLogs = useCallback(async () => {
    const recent = await logRepository.getRecentLogs(100);
    setLogs(recent);
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      const [savedSettings, consent] = await Promise.all([
        settingsRepository.getSettings(),
        settingsRepository.hasUserGivenConsent(),
      ]);
      setSettings(savedSettings);
      setHasConsent(consent);
      await Promise.all([refreshData(), refreshLogs(), checkStatus()]);
    };
    init();

    // Check status every 10 seconds
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus, refreshData, refreshLogs]);

  // Handle consent acceptance
  const handleAcceptConsent = async () => {
    await settingsRepository.setUserConsent(true);
    setHasConsent(true);
    await logRepository.addLog('info', 'User acknowledged local storage and privacy consent');
    await refreshLogs();
  };

  // Selection handlers
  const handleToggleSelect = async (chatId: string) => {
    const chat = chats.find(c => c.chatId === chatId);
    if (!chat) return;
    await chatRepository.setChatSelection(chatId, !chat.isSelected);
    await refreshData();
  };

  const handleSelectAll = async (selected: boolean) => {
    await chatRepository.setAllChatsSelection(
      selected, 
      selectedChatType === 'all' ? undefined : selectedChatType
    );
    await refreshData();
  };

  // Tab navigation actions
  const handleOpenWhatsApp = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'OPEN_WHATSAPP_TAB', timestamp: Date.now() });
    } else {
      window.open('https://web.whatsapp.com', '_blank');
    }
  };

  const handleOpenFullTab = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD_TAB', timestamp: Date.now() });
    }
  };

  // Scanning trigger
  const handleScanChats = async () => {
    setIsScanning(true);
    setCurrentProcessStatus('scanning');
    await logRepository.addLog('info', 'Chat scanning initiated');
    await refreshLogs();

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        { action: 'START_CHAT_DISCOVERY', timestamp: Date.now() },
        async (response) => {
          setIsScanning(false);
          setCurrentProcessStatus('idle');
          if (response?.error) {
            await logRepository.addLog('warn', `Discovery notice: ${response.error}`);
          } else {
            await logRepository.addLog('success', 'Discovery request sent to WhatsApp Web');
          }
          await refreshData();
          await refreshLogs();
        }
      );
    } else {
      // Offline / dev fallback
      setTimeout(async () => {
        setIsScanning(false);
        setCurrentProcessStatus('idle');
        await logRepository.addLog('info', 'Scan finished (Phase 1 preview mode)');
        await refreshLogs();
      }, 1000);
    }
  };

  // Export process control handlers
  const handleExportAll = async () => {
    await chatRepository.setAllChatsSelection(true);
    await refreshData();
    setProcessStartTime(Date.now());
    setCurrentProcessStatus('running');
    await logRepository.addLog('info', 'Bulk export initiated for all discovered chats');
    await refreshLogs();
  };

  const handleExportSelected = async () => {
    setProcessStartTime(Date.now());
    setCurrentProcessStatus('running');
    await logRepository.addLog('info', `Bulk export initiated for ${stats.selected} selected chats`);
    await refreshLogs();
  };

  const handleExportSingle = async (chatId: string) => {
    await chatRepository.updateChatStatus(chatId, 'queued');
    await refreshData();
    await logRepository.addLog('info', `Conversation ${chatId} queued for export`, chatId);
    await refreshLogs();
  };

  const handlePause = async () => {
    setCurrentProcessStatus('paused');
    await logRepository.addLog('info', 'Bulk export paused by user');
    await refreshLogs();
  };

  const handleResume = async () => {
    setCurrentProcessStatus('running');
    await logRepository.addLog('info', 'Bulk export resumed by user');
    await refreshLogs();
  };

  const handleStop = async () => {
    setCurrentProcessStatus('idle');
    setProcessStartTime(null);
    await logRepository.addLog('warn', 'Bulk export stopped by user');
    await refreshLogs();
  };

  const handleRetryFailed = async () => {
    const resetCount = await chatRepository.resetFailedChats();
    await logRepository.addLog('info', `Reset ${resetCount} failed chats to queued state`);
    await refreshData();
    await refreshLogs();
  };

  const handleDownloadExport = async () => {
    await logRepository.addLog('info', 'Download Export triggered');
    await refreshLogs();
    alert('Export packaging ready. Once extraction runs in Phase 5, this creates the ZIP archive matching Section 7 specifications.');
  };

  const handleClearDataConfirm = async () => {
    await chatRepository.clearAll();
    await logRepository.addLog('warn', 'Local database cleared by user');
    await refreshData();
    await refreshLogs();
  };

  // Calculate ETA and progress metrics
  const totalTargetChats = stats.selected > 0 ? stats.selected : stats.totalDiscovered;
  const progressPercent = totalTargetChats > 0 ? (stats.processed / totalTargetChats) * 100 : 0;
  const elapsedSec = processStartTime ? (Date.now() - processStartTime) / 1000 : 0;
  const eta = calculateEstimatedRemainingTime(totalTargetChats, stats.processed, elapsedSec);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Header bar */}
      <Header
        sessionStatus={sessionStatus}
        isCheckingStatus={isCheckingStatus}
        onRefreshStatus={checkStatus}
        onOpenWhatsApp={handleOpenWhatsApp}
        onOpenFullTab={handleOpenFullTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLogs={() => setIsLogsOpen(true)}
        isPopupView={isPopupView}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* User Privacy & Consent Banner (if not acknowledged yet) */}
        {!hasConsent && (
          <ConsentBanner onAccept={handleAcceptConsent} />
        )}

        {/* Real-time stats & progress cards */}
        <StatsOverview
          totalDiscovered={stats.totalDiscovered}
          totalProcessed={stats.processed}
          selectedCount={stats.selected}
          totalMessages={stats.totalMessages}
          totalMedia={stats.totalMedia}
          successfulCount={stats.completed}
          failedCount={stats.failed}
          currentStatus={currentProcessStatus}
          progressPercent={progressPercent}
          estimatedRemainingTime={eta.formatted}
          processingSpeed={eta.speedPerSec}
          totalExportSizeBytes={stats.totalMedia * 150000} // estimated bytes from media
        />

        {/* Action Toolbar */}
        <ActionToolbar
          currentStatus={currentProcessStatus}
          selectedCount={stats.selected}
          totalDiscovered={stats.totalDiscovered}
          failedCount={stats.failed}
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
          }}
          selectedChatType={selectedChatType}
          onChatTypeChange={(type) => {
            setSelectedChatType(type);
          }}
          selectedStatusFilter={selectedStatusFilter}
          onStatusFilterChange={(status) => {
            setSelectedStatusFilter(status);
          }}
          onScanChats={handleScanChats}
          onExportAll={handleExportAll}
          onExportSelected={handleExportSelected}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onRetryFailed={handleRetryFailed}
          onDownloadExport={handleDownloadExport}
          onClearLocalData={() => setIsClearDataOpen(true)}
          isScanning={isScanning}
        />

        {/* Discovered Chats Table */}
        <ChatTable
          chats={chats}
          isLoading={isLoadingChats}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onExportSingle={handleExportSingle}
        />
      </main>

      {/* Modals & Drawers */}
      <ExportConfigModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={async (updated) => {
          await settingsRepository.saveSettings(updated);
          setSettings(updated);
          await logRepository.addLog('info', 'Updated export settings preferences');
          await refreshLogs();
        }}
      />

      <ClearDataModal
        isOpen={isClearDataOpen}
        onClose={() => setIsClearDataOpen(false)}
        onConfirm={handleClearDataConfirm}
        totalChats={stats.totalDiscovered}
      />

      <LogViewer
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
        logs={logs}
        onClearLogs={async () => {
          await logRepository.clearLogs();
          await refreshLogs();
        }}
      />
    </div>
  );
};
