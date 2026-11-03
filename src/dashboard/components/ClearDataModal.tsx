import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface ClearDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  totalChats: number;
}

export const ClearDataModal: React.FC<ClearDataModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  totalChats,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6 space-y-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Clear Local IndexedDB Storage?</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                This will permanently remove all {totalChats.toLocaleString()} discovered conversations, extracted message histories, and media records from your browser's local database.
              </p>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p>• Your WhatsApp account and chats on web.whatsapp.com will not be affected.</p>
            <p>• Previously downloaded ZIP files on your computer will remain intact.</p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-900/30"
            >
              <Trash2 className="w-4 h-4" />
              <span>Purge All Local Data</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
