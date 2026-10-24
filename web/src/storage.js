import { createState, validateState } from '../../shared/domain.js';
const KEY = 'sleeping-table:v1';

let nativeStore = null;
export const isNativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.());

export async function initializeStorage() {
  if (isNativeApp()) {
    nativeStore = await import('../../app/src/native-storage.js');
    await nativeStore.initialize();
    return nativeStore.readState();
  }
  return readWebState();
}

export function readState() {
  if (nativeStore) throw new Error('原生存储必须通过 initializeStorage 初始化。');
  return readWebState();
}

function readWebState() {
  const value = localStorage.getItem(KEY);
  if (value === null) return createState();
  // Do not silently replace damaged storage with empty data.
  return validateState(JSON.parse(value));
}

export async function writeState(state) {
  if (nativeStore) return nativeStore.writeState(state);
  localStorage.setItem(KEY, JSON.stringify(state));
}

export async function getNativeSettings() { return nativeStore?.readSettings() ?? null; }
export async function writeNativeSettings(settings) {
  if (!nativeStore) throw new Error('原生设置只能在手机 App 中使用。');
  return nativeStore.writeSettings(settings);
}
export async function wipeNativeState() {
  if (!nativeStore) throw new Error('清除记录只能在手机 App 中使用。');
  return nativeStore.wipeState();
}
export async function rawNativeBackup() { return nativeStore?.rawBackup() ?? null; }

export async function exportFile(content, filename, mimeType) {
  if (!nativeStore) return false;
  const files = await import('../../app/src/native-files.js');
  await files.shareFile(content, filename, mimeType);
  return true;
}


export async function nativePermissionStatus() {
  if (!nativeStore) return null;
  const notifications = await import('../../app/src/notifications.js');
  return notifications.permissionStatus();
}

export async function requestNativeNotificationPermission() {
  if (!nativeStore) return false;
  const notifications = await import('../../app/src/notifications.js');
  return notifications.requestPermission();
}

export async function syncNativeNotifications(state, settings) {
  if (!nativeStore) return;
  const notifications = await import('../../app/src/notifications.js');
  return notifications.syncReminders(state, settings);
}

export async function bindNativeNotificationActions(callback) {
  if (!nativeStore) return;
  const notifications = await import('../../app/src/notifications.js');
  return notifications.bindActions(callback);
}
