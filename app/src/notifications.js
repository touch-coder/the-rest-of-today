import { LocalNotifications } from '@capacitor/local-notifications';
import { addDays, dayStatus, recordsForDate } from '../../shared/domain.js';

export async function permissionStatus() {
  return (await LocalNotifications.checkPermissions()).display;
}

export async function requestPermission() {
  return (await LocalNotifications.requestPermissions()).display === 'granted';
}

export async function syncReminders(state, settings = {}) {
  const value = LocalNotifications;
  const enabled = settings.reminders || {};
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const base = Date.UTC(2000, 0, 1);
  const dayId = date => Math.floor((Date.parse(`${date}T00:00:00Z`) - base) / 86400000);
  const startId = dayId(today) * 3;
  const cancelIds = Array.from({ length: 20 * 3 }, (_, index) => startId + index);
  await value.cancel({ notifications: cancelIds.map(id => ({ id })) });
  if ((await value.checkPermissions()).display !== 'granted') return;
  const notifications = [];
  const slots = [
    { key: 'night', hour: 8, body: '记下昨晚的夜间睡眠吧。', complete: records => records.some(record => record.type === 'night') },
    { key: 'nap', hour: 14, body: '午休记录还可以补上。', complete: records => records.some(record => record.type === 'nap') },
    { key: 'complete', hour: 22, body: '确认今天的睡眠记录是否完整。', complete: (records, date) => ['complete', 'zero'].includes(dayStatus(state, date)) }
  ];
  for (let offset = 0; offset < 20; offset++) {
    const date = addDays(today, offset), records = recordsForDate(state, date);
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      if (!enabled[slot.key] || slot.complete(records, date)) continue;
      const when = new Date(`${date}T${String(slot.hour).padStart(2, '0')}:00:00+08:00`);
      if (when <= new Date()) continue;
      notifications.push({ id: dayId(date) * 3 + index, title: '眠记', body: slot.body, schedule: { at: when } });
    }
  }
  if (notifications.length) await value.schedule({ notifications });
}

export async function bindActions(callback) {
  await LocalNotifications.addListener('localNotificationActionPerformed', event => callback(event.notification?.extra?.route || 'home'));
}
