import React from 'react';
import { 
  ChatContact, 
  ChatExportStatus 
} from '../../types';
import { 
  User, 
  Users, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Loader2, 
  Building2, 
  Bookmark, 
  MessageSquare, 
  Image as ImageIcon 
} from 'lucide-react';
import { formatDateTime } from '../../utils/formatters';

interface ChatTableProps {
  chats: ChatContact[];
  isLoading: boolean;
  onToggleSelect: (chatId: string) => void;
  onSelectAll: (selected: boolean) => void;
  onExportSingle: (chatId: string) => void;
}

export const ChatTable: React.FC<ChatTableProps> = ({
  chats,
  isLoading,
  onToggleSelect,
  onSelectAll,
  onExportSingle,
}) => {
  const allSelected = chats.length > 0 && chats.every(c => c.isSelected);
  const someSelected = chats.some(c => c.isSelected) && !allSelected;

  const renderStatusBadge = (status: ChatExportStatus, error?: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            <span>Complete</span>
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/80 text-amber-400 border border-amber-800" title="Accessible messages exported (some older history inaccessible)">
            <AlertCircle className="w-3 h-3" />
            <span>Partial</span>
          </span>
        );
      case 'extracting_messages':
      case 'extracting_media':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-950/80 text-blue-400 border border-blue-800">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{status === 'extracting_messages' ? 'Messages...' : 'Media...'}</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/80 text-rose-400 border border-rose-800" title={error || 'Extraction failed'}>
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <Clock className="w-3 h-3" />
            <span>Queued</span>
          </span>
        );
      case 'discovered':
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-850 text-slate-400 border border-slate-800">
            <span>Discovered</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someSelected;
                  }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
              </th>
              <th className="p-3">Contact Name</th>
              <th className="p-3">Phone Number</th>
              <th className="p-3">Chat Identifier</th>
              <th className="p-3">Type</th>
              <th className="p-3">Last Activity</th>
              <th className="p-3 text-center">Messages</th>
              <th className="p-3 text-center">Media</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {isLoading ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <span>Loading conversations from local storage...</span>
                  </div>
                </td>
              </tr>
            ) : chats.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-12 text-center text-slate-500">
                  <div className="max-w-md mx-auto space-y-2">
                    <Users className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-slate-300 font-medium text-sm">No conversations discovered yet</p>
                    <p className="text-xs text-slate-500">
                      Open WhatsApp Web in Chrome, then click <strong className="text-emerald-400">Scan Chats</strong> above to discover accessible conversations.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              chats.map((chat) => (
                <tr 
                  key={chat.chatId}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button, a, input[type="checkbox"]')) return;
                    onToggleSelect(chat.chatId);
                  }}
                  className={`hover:bg-slate-800/40 transition-colors cursor-pointer select-none ${
                    chat.isSelected ? 'bg-emerald-950/20' : ''
                  }`}
                >
                  {/* Select Checkbox */}
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(chat.isSelected)}
                      onChange={() => onToggleSelect(chat.chatId)}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                    />
                  </td>

                  {/* Contact Name */}
                  <td className="p-3 font-medium text-slate-100">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-300">
                        {chat.chatType === 'group' ? (
                          <Users className="w-3.5 h-3.5 text-teal-400" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </div>
                      <div className="truncate max-w-[180px]">
                        <span className="font-semibold text-slate-100 block truncate" title={chat.name}>
                          {chat.name || 'Unnamed Contact'}
                        </span>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          {chat.isBusiness && (
                            <span className="inline-flex items-center space-x-0.5 text-[9px] text-emerald-400 bg-emerald-950/60 px-1.5 rounded">
                              <Building2 className="w-2.5 h-2.5" />
                              <span>Business</span>
                            </span>
                          )}
                          {chat.isSavedContact && (
                            <span className="inline-flex items-center space-x-0.5 text-[9px] text-blue-400 bg-blue-950/60 px-1.5 rounded">
                              <Bookmark className="w-2.5 h-2.5" />
                              <span>Saved</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Phone Number */}
                  <td className="p-3 font-mono text-slate-300">
                    {chat.phoneNumber ? (
                      <span>{chat.phoneNumber}</span>
                    ) : (
                      <div className="flex items-center space-x-1 text-slate-500" title="WhatsApp Web DOM does not expose a raw phone number when the contact is saved by name or privacy restrictions apply">
                        <span className="italic">Not exposed</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help" />
                      </div>
                    )}
                  </td>

                  {/* Chat Identifier */}
                  <td className="p-3 font-mono text-slate-400">
                    <span 
                      className="truncate max-w-[140px] block" 
                      title={`Internal ID: ${chat.chatId}`}
                    >
                      {chat.chatId}
                    </span>
                  </td>

                  {/* Chat Type */}
                  <td className="p-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                      chat.chatType === 'group' 
                        ? 'bg-purple-950/60 text-purple-300 border border-purple-800/40' 
                        : 'bg-slate-800 text-slate-300 border border-slate-700/50'
                    }`}>
                      {chat.chatType}
                    </span>
                  </td>

                  {/* Last Message Date */}
                  <td className="p-3 text-slate-400 whitespace-nowrap">
                    {formatDateTime(chat.lastMessageTimestamp)}
                  </td>

                  {/* Extracted Messages Count */}
                  <td className="p-3 text-center font-mono">
                    <div className="inline-flex items-center space-x-1 text-slate-300">
                      <MessageSquare className="w-3 h-3 text-blue-400" />
                      <span>{chat.extractedMessagesCount || 0}</span>
                    </div>
                  </td>

                  {/* Extracted Media Count */}
                  <td className="p-3 text-center font-mono">
                    <div className="inline-flex items-center space-x-1 text-slate-300">
                      <ImageIcon className="w-3 h-3 text-purple-400" />
                      <span>{chat.extractedMediaCount || 0}</span>
                    </div>
                  </td>

                  {/* Export Status */}
                  <td className="p-3 whitespace-nowrap">
                    {renderStatusBadge(chat.status, chat.lastError)}
                  </td>

                  {/* Actions */}
                  <td className="p-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => onExportSingle(chat.chatId)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                      title="Queue single conversation for extraction"
                    >
                      Export
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
