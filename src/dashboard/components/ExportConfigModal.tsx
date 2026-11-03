import React, { useState, useEffect } from 'react';
import { X, Settings2, Check, Shield } from 'lucide-react';
import { ExportSettings } from '../../types';

interface ExportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ExportSettings;
  onSave: (updated: ExportSettings) => void;
}

export const ExportConfigModal: React.FC<ExportConfigModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [localSettings, setLocalSettings] = useState<ExportSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <Settings2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">Export & Storage Preferences</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Section: Batch & Archive Sizing */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Archive & ZIP Splitting
            </h3>
            
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Max Contacts per ZIP Archive
              </label>
              <select
                value={localSettings.maxContactsPerZip}
                onChange={(e) => setLocalSettings({ ...localSettings, maxContactsPerZip: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value={25}>25 contacts per ZIP (Lightweight / Low RAM)</option>
                <option value={50}>50 contacts per ZIP (Recommended)</option>
                <option value={100}>100 contacts per ZIP</option>
                <option value={200}>200 contacts per ZIP (High capacity)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Splits large exports of 2,000+ chats into manageable ZIP files to avoid browser memory pressure.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Export File Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['both', 'json', 'csv'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setLocalSettings({ ...localSettings, exportFormat: fmt })}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-center uppercase tracking-wider transition-all ${
                      localSettings.exportFormat === fmt
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/20'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {fmt === 'both' ? 'JSON + CSV' : fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section: Media Filtering */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Media Extraction Options
              </h3>
              <label className="flex items-center space-x-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={localSettings.includeMedia}
                  onChange={(e) => setLocalSettings({ ...localSettings, includeMedia: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="font-medium">Enable Media Downloads</span>
              </label>
            </div>

            {localSettings.includeMedia && (
              <div className="grid grid-cols-2 gap-2.5 pl-2">
                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.includeImages}
                    onChange={(e) => setLocalSettings({ ...localSettings, includeImages: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />
                  <span>Images (.jpg, .png, .webp)</span>
                </label>

                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.includeVideos}
                    onChange={(e) => setLocalSettings({ ...localSettings, includeVideos: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />
                  <span>Videos (.mp4, .3gp)</span>
                </label>

                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.includeAudio}
                    onChange={(e) => setLocalSettings({ ...localSettings, includeAudio: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />
                  <span>Audio & Voice Notes (.ogg, .mp3)</span>
                </label>

                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.includeDocuments}
                    onChange={(e) => setLocalSettings({ ...localSettings, includeDocuments: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />
                  <span>Documents (PDF, Office files)</span>
                </label>

                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.includeStickers}
                    onChange={(e) => setLocalSettings({ ...localSettings, includeStickers: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />
                  <span>Stickers (.webp)</span>
                </label>
              </div>
            )}
          </div>

          {/* Section: Conversation Scope */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Conversation Scope
            </h3>
            
            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={localSettings.includeGroupChats}
                onChange={(e) => setLocalSettings({ ...localSettings, includeGroupChats: e.target.checked })}
                className="rounded border-slate-700 bg-slate-950 text-emerald-500"
              />
              <div>
                <span className="font-medium text-slate-200">Include WhatsApp Group Chats</span>
                <p className="text-[11px] text-slate-500">
                  Individual customer conversations are always prioritized; check this if you also wish to export group chats.
                </p>
              </div>
            </label>
          </div>

          {/* Privacy Note */}
          <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-3 flex items-start space-x-2 text-xs text-emerald-300/90">
            <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>
              All data processing, media downloading, and ZIP compression occur 100% locally on your machine.
            </span>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-700/20"
            >
              <Check className="w-4 h-4" />
              <span>Save Preferences</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
