export const SYSTEM_SETTINGS_UPDATED_EVENT = 'system-settings-updated';
export const SYSTEM_SETTINGS_UPDATED_STORAGE_KEY = 'student-placement:system-settings-updated';

export const notifySystemSettingsUpdated = () => {
  window.dispatchEvent(new Event(SYSTEM_SETTINGS_UPDATED_EVENT));

  try {
    window.localStorage.setItem(
      SYSTEM_SETTINGS_UPDATED_STORAGE_KEY,
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  } catch (error) {
    console.warn('Unable to notify other tabs about updated system settings.', error);
  }
};
