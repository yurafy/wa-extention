import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { bulkExporter } from '../services/bulkExporter';
import { exportService } from '../services/exportService';

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

  // Ref to track scanning state inside the message listener callback
  const isScanningRef = useRef(false);

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

  /**
   * Handle incoming CHAT_DISCOVERED messages from the content script (relayed by background SW).
   * Converts discovered chat data into ChatContact records and saves to IndexedDB.
   */
  const handleDiscoveredChats = useCallback(async (payload: {
    chats: Array<{
      chatId: string;
      name: string;
      phoneNumber?: string;
      chatType: 'individual' | 'group' | 'unknown';
      lastMessagePreview?: string;
      lastMessageTimestamp?: string;
      unreadCount?: number;
      isBusiness?: boolean;
    }>;
    totalSoFar: number;
    done: boolean;
  }) => {
    const { chats: incoming, totalSoFar, done } = payload;

    if (incoming && incoming.length > 0) {
      const contacts: ChatContact[] = incoming.map(c => ({
        chatId: c.chatId,
        name: c.name,
        phoneNumber: c.phoneNumber,
        chatType: c.chatType === 'unknown' ? 'individual' : c.chatType,
        isBusiness: c.isBusiness,
        isSavedContact: c.phoneNumber ? undefined : undefined,
        lastMessageTimestamp: c.lastMessageTimestamp,
        lastMessagePreview: c.lastMessagePreview,
        unreadCount: c.unreadCount,
        status: 'discovered' as const,
        extractedMessagesCount: 0,
        extractedMediaCount: 0,
        isSelected: false,
        discoveredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      await chatRepository.upsertChats(contacts);
      await logRepository.addLog(
        'success',
        `Discovered ${incoming.length} new chats (${totalSoFar} total so far)`
      );
    }

    if (done) {
      setIsScanning(false);
      isScanningRef.current = false;
      setCurrentProcessStatus('idle');
      await logRepository.addLog(
        'success',
        `Chat discovery completed. Total unique chats found: ${totalSoFar}`
      );
    }

    await refreshData();
    await refreshLogs();
  }, [refreshData, refreshLogs]);

  // Initial load & chrome message listener
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

    // Check WhatsApp status every 10 seconds
    const interval = setInterval(checkStatus, 10000);

    // Listen for CHAT_DISCOVERED messages forwarded by the background service worker
    const messageListener = (
      message: { action: string; payload?: unknown },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (message.action === 'CHAT_DISCOVERED' && message.payload) {
        handleDiscoveredChats(message.payload as {
          chats: Array<{
            chatId: string;
            name: string;
            phoneNumber?: string;
            chatType: 'individual' | 'group' | 'unknown';
            lastMessagePreview?: string;
            lastMessageTimestamp?: string;
            unreadCount?: number;
            isBusiness?: boolean;
          }>;
          totalSoFar: number;
          done: boolean;
        });
        sendResponse({ received: true });
      }
      return true;
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(messageListener);
    }

    return () => {
      clearInterval(interval);
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  }, [checkStatus, refreshData, refreshLogs, handleDiscoveredChats]);

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
    isScanningRef.current = true;
    setCurrentProcessStatus('scanning');
    await logRepository.addLog('info', 'Chat scanning initiated — scrolling through WhatsApp Web chat list...');
    await refreshLogs();

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        { action: 'START_CHAT_DISCOVERY', timestamp: Date.now() },
        async (response) => {
          if (response?.error) {
            setIsScanning(false);
            isScanningRef.current = false;
            setCurrentProcessStatus('idle');
            await logRepository.addLog('error', `Discovery failed: ${response.error}`);
            await refreshData();
            await refreshLogs();
          }
          // If success, scanning continues — results arrive via CHAT_DISCOVERED messages
        }
      );
    } else {
      setTimeout(async () => {
        setIsScanning(false);
        isScanningRef.current = false;
        setCurrentProcessStatus('idle');
        await logRepository.addLog('info', 'Scan finished (dev preview mode — no WhatsApp Web tab)');
        await refreshLogs();
      }, 1000);
    }
  };

  // Export process control handlers
  const handleExportAll = async () => {
    await chatRepository.setAllChatsSelection(true);
    const { chats: allChats } = await chatRepository.listChats();
    if (allChats.length === 0) {
      alert('Please scan chats first before exporting.');
      return;
    }
    setProcessStartTime(Date.now());
    setCurrentProcessStatus('running');
    await logRepository.addLog('info', `Bulk export initiated for all ${allChats.length} discovered chats`);
    await refreshLogs();

    bulkExporter.startExport(allChats, async (_processed, _total, state) => {
      if (state === 'idle' || state === 'stopped') {
        setCurrentProcessStatus('idle');
      } else if (state === 'paused') {
        setCurrentProcessStatus('paused');
      }
      await refreshData();
    });
  };

  const handleExportSelected = async () => {
    const { chats: selectedChats } = await chatRepository.listChats({ onlySelected: true });
    if (selectedChats.length === 0) {
      alert('Please select at least one chat using the checkboxes to export.');
      return;
    }
    setProcessStartTime(Date.now());
    setCurrentProcessStatus('running');
    await logRepository.addLog('info', `Bulk export initiated for ${selectedChats.length} selected chats`);
    await refreshLogs();

    bulkExporter.startExport(selectedChats, async (_processed, _total, state) => {
      if (state === 'idle' || state === 'stopped') {
        setCurrentProcessStatus('idle');
      } else if (state === 'paused') {
        setCurrentProcessStatus('paused');
      }
      await refreshData();
    });
  };

  const handleExportSingle = async (chatId: string) => {
    const chat = chats.find(c => c.chatId === chatId);
    if (!chat) return;
    setCurrentProcessStatus('running');
    await logRepository.addLog('info', `Extracting single conversation "${chat.name}"...`, chatId);
    await bulkExporter.extractSingleChat(chat);
    setCurrentProcessStatus('idle');
    await refreshData();
    await refreshLogs();
  };

  const handlePause = async () => {
    bulkExporter.pause();
    setCurrentProcessStatus('paused');
    await logRepository.addLog('info', 'Bulk export paused by user');
    await refreshLogs();
  };

  const handleResume = async () => {
    bulkExporter.resume();
    setCurrentProcessStatus('running');
    await logRepository.addLog('info', 'Bulk export resumed by user');
    await refreshLogs();
  };

  const handleStop = async () => {
    bulkExporter.stop();
    setCurrentProcessStatus('idle');
    setProcessStartTime(null);
    if (isScanningRef.current) {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'STOP_CHAT_DISCOVERY', timestamp: Date.now() });
      }
      setIsScanning(false);
      isScanningRef.current = false;
    }
    await logRepository.addLog('warn', 'Export/scan stopped by user');
    await refreshLogs();
  };

  const handleRetryFailed = async () => {
    const resetCount = await chatRepository.resetFailedChats();
    await logRepository.addLog('info', `Reset ${resetCount} failed chats to queued state`);
    await refreshData();
    await refreshLogs();
  };

  const handleDownloadExport = async () => {
    await logRepository.addLog('info', 'Building ZIP package according to Section 7 folder structure...');
    await refreshLogs();
    try {
      const result = await exportService.buildAndDownloadZip(false);
      if (result.success) {
        await logRepository.addLog(
          'success',
          `Downloaded ${result.totalZips} ZIP archive(s) with ${result.totalContacts} contacts, ${result.totalMessages} messages, and ${result.totalMedia} media files!`
        );
      } else {
        await logRepository.addLog('warn', result.error || 'Failed to generate ZIP');
        alert(result.error || 'Failed to generate ZIP. Please ensure chats have been scanned first.');
      }
    } catch (err: any) {
      await logRepository.addLog('error', `Error building ZIP: ${err?.message || err}`);
      alert(`Error building ZIP: ${err?.message || err}`);
    }
    await refreshLogs();
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
          totalExportSizeBytes={stats.totalMedia * 150000}
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
