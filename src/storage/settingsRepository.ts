import { db, DEFAULT_SETTINGS } from './db';
import { ExportSettings } from '../types';

const SETTINGS_KEY = 'app_export_settings';
const CONSENT_KEY = 'user_consent_granted';

export const settingsRepository = {
  async getSettings(): Promise<ExportSettings> {
    const record = await db.settings.get(SETTINGS_KEY);
    if (!record || !record.value) {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...(record.value as Partial<ExportSettings>) };
  },

  async saveSettings(settings: Partial<ExportSettings>): Promise<ExportSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await db.settings.put({
      key: SETTINGS_KEY,
      value: updated,
      updatedAt: new Date().toISOString(),
    });
    return updated;
  },

  async hasUserGivenConsent(): Promise<boolean> {
    const record = await db.settings.get(CONSENT_KEY);
    return Boolean(record?.value);
  },

  async setUserConsent(granted: boolean): Promise<void> {
    await db.settings.put({
      key: CONSENT_KEY,
      value: granted,
      updatedAt: new Date().toISOString(),
    });
  },

  async clearAll(): Promise<void> {
    await db.settings.clear();
  }
};
