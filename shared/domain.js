export const VERSION = 1;
export const TYPES = { night: '夜间睡眠', nap: '午休', extra: '补觉' };
export const TIMEZONE = 'Asia/Shanghai';
const DAY_MS = 86400000;

export function today(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') return false;
  const stamp = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(stamp.valueOf()) && stamp.toISOString().slice(0, 10) === value;
}

export function addDays(date, count) {
  return new Date(new Date(`${date}T00:00:00Z`).valueOf() + count * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(start, end) {
  if (!validDate(start) || !validDate(end) || start > end) return [];
  const count = Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / DAY_MS);
  return Array.from({ length: count + 1 }, (_, index) => addDays(start, index));
}

export function weekRange(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const start = addDays(date, -day);
  return { start, end: addDays(start, 6) };
}

export function monthRange(date) {
  const start = `${date.slice(0, 7)}-01`;
  const value = new Date(`${start}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  return { start, end: addDays(value.toISOString().slice(0, 10), -1) };
}

export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !validDate(value.slice(0, 10))) throw new Error('请填写有效的日期和时间。');
  const [hour, minute] = value.slice(11).split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error('请填写有效的时间。');
  return new Date(`${value}:00+08:00`).valueOf();
}

export function duration(record) { return (timestamp(record.end) - timestamp(record.start)) / 60000; }
export function recordDate(record) { return record.end.slice(0, 10); }

export function createState(now = new Date()) {
  return { version: VERSION, createdAt: now.toISOString(), startDate: today(now), records: [], confirmations: {}, goals: [{ effectiveDate: '1900-01-01', minutes: 480 }], lastBackupAt: null };
}

export function validateRecord(record, records = []) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id.trim() || record.id.length > 200) throw new Error('记录 ID 无效。');
  if (!Object.hasOwn(TYPES, record.type)) throw new Error('请选择睡眠类型。');
  const start = timestamp(record.start), end = timestamp(record.end);
  if (end <= start) throw new Error('醒来时间必须晚于入睡时间。');
  if (end - start > DAY_MS) throw new Error('单段睡眠不能超过 24 小时。');
  if (typeof record.note !== 'string' || record.note.length > 1000) throw new Error('备注最多 1000 字。');
  for (const other of records) {
    if (other.id === record.id) continue;
    if (other.type === record.type && recordDate(other) === recordDate(record)) throw new Error(`醒来日期 ${recordDate(record)} 已有一段${TYPES[record.type]}，请编辑原记录。`);
    if (start < timestamp(other.end) && end > timestamp(other.start)) throw new Error('这段睡眠与已有记录重叠，请检查起止时间。');
  }
}

export function saveRecord(state, record) {
  validateRecord(record, state.records);
  const next = structuredClone(state);
  const previous = next.records.find(r => r.id === record.id);
  if (previous) delete next.confirmations[recordDate(previous)];
  delete next.confirmations[recordDate(record)];
  next.records = next.records.filter(r => r.id !== record.id);
  next.records.push({ id: record.id, type: record.type, start: record.start, end: record.end, note: record.note });
  return next;
}

export function deleteRecord(state, id) {
  const next = structuredClone(state), record = next.records.find(r => r.id === id);
  if (!record) throw new Error('记录不存在。');
  next.records = next.records.filter(r => r.id !== id);
  delete next.confirmations[recordDate(record)];
  return next;
}

export function recordsForDate(state, date) { return state.records.filter(r => recordDate(r) === date).sort((a, b) => a.start.localeCompare(b.start)); }

export function dayStatus(state, date, currentDate = today()) {
  if (date > currentDate) return 'future';
  if (date < state.startDate) return 'outside';
  if (state.confirmations[date] === 'zero') return 'zero';
  const records = recordsForDate(state, date);
  if (!records.some(r => r.type === 'night')) return 'missing';
  return state.confirmations[date] === 'complete' ? 'complete' : 'pending';
}

export function confirmDay(state, date, zero = false, currentDate = today()) {
  if (!validDate(date) || date < state.startDate || date > currentDate) throw new Error('只能确认记录范围内截至今天的日期。');
  const records = recordsForDate(state, date);
  if (zero && records.length) throw new Error('确认 0 小时前，请先删除当天所有睡眠记录。');
  if (!zero && !records.some(r => r.type === 'night')) throw new Error('缺少夜间睡眠，无法确认完整。');
  const next = structuredClone(state);
  next.confirmations[date] = zero ? 'zero' : 'complete';
  return next;
}

export function goalForDate(state, date) {
  return state.goals.filter(g => g.effectiveDate <= date).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.minutes ?? 480;
}

export function setGoal(state, effectiveDate, minutes) {
  if (!validDate(effectiveDate) || !Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) throw new Error('目标必须大于 0 且不超过 24 小时，并填写有效生效日期。');
  const next = structuredClone(state);
  next.goals = next.goals.filter(g => g.effectiveDate !== effectiveDate);
  next.goals.push({ effectiveDate, minutes });
  next.goals.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return next;
}

function rhythm(values) {
  if (!values.length) return { mean: null, spread: null, count: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { mean: mean % 1440, spread: values.length < 2 ? null : Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length), count: values.length };
}

export function summarize(state, range, currentDate = today()) {
  const start = range.start > state.startDate ? range.start : state.startDate;
  const end = range.end < currentDate ? range.end : currentDate;
  const dates = daysBetween(start, end);
  const totals = { night: 0, nap: 0, extra: 0 };
  const sleepTimes = [], wakeTimes = [];
  let confirmed = 0, missing = 0, pending = 0, recordedDays = 0, achieved = 0, goalMinutes = 0;
  for (const date of dates) {
    const dayRecords = recordsForDate(state, date);
    if (dayRecords.length) recordedDays++;
    const status = dayStatus(state, date, currentDate);
    if (status === 'missing') { missing++; continue; }
    if (status === 'pending') { pending++; continue; }
    confirmed++;
    let total = 0;
    for (const record of dayRecords) {
      const minutes = duration(record);
      totals[record.type] += minutes; total += minutes;
      if (record.type === 'night') {
        const startMinute = Number(record.start.slice(11, 13)) * 60 + Number(record.start.slice(14));
        const endMinute = Number(record.end.slice(11, 13)) * 60 + Number(record.end.slice(14));
        sleepTimes.push(startMinute < 720 ? startMinute + 1440 : startMinute);
        wakeTimes.push(endMinute);
      }
    }
    const goal = goalForDate(state, date);
    goalMinutes += goal;
    if (total >= goal) achieved++;
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return { start, end, days: dates.length, recordedDays, confirmed, missing, pending, achieved, total, totals, average: confirmed ? total / confirmed : null, completionRate: dates.length ? confirmed / dates.length : null, achievementRate: confirmed ? achieved / confirmed : null, goalMinutes, difference: confirmed ? total - goalMinutes : null, sleep: rhythm(sleepTimes), wake: rhythm(wakeTimes) };
}

export function validateState(input) {
  if (!input || typeof input !== 'object' || input.version !== VERSION) throw new Error('备份版本不受支持。');
  if (!validDate(input.startDate)) throw new Error('开始记录日期无效。');
  if (typeof input.createdAt !== 'string' || Number.isNaN(Date.parse(input.createdAt))) throw new Error('备份创建时间无效。');
  if (input.lastBackupAt !== null && (typeof input.lastBackupAt !== 'string' || Number.isNaN(Date.parse(input.lastBackupAt)))) throw new Error('备份时间无效。');
  if (!Array.isArray(input.records) || input.records.length > 100000) throw new Error('备份记录格式或数量无效。');
  const records = [], ids = new Set();
  // Sort once and check neighbouring intervals, rather than scan every record pair.
  const slots = new Set();
  for (const record of input.records) {
    validateRecord(record);
    if (ids.has(record.id)) throw new Error('备份中存在重复记录 ID。');
    ids.add(record.id);
    const slot = `${recordDate(record)}:${record.type}`;
    if (slots.has(slot)) throw new Error('备份中同一天存在重复睡眠类型。');
    slots.add(slot);
    records.push({ id: record.id, type: record.type, start: record.start, end: record.end, note: record.note });
  }
  const sorted = [...records].sort((a, b) => a.start.localeCompare(b.start));
  for (let index = 1; index < sorted.length; index++) {
    if (timestamp(sorted[index].start) < timestamp(sorted[index - 1].end)) throw new Error('备份中存在重叠睡眠记录。');
  }
  if (!input.confirmations || typeof input.confirmations !== 'object' || Array.isArray(input.confirmations)) throw new Error('完整状态格式无效。');
  const confirmations = {};
  for (const [date, status] of Object.entries(input.confirmations)) {
    if (!validDate(date) || !['complete', 'zero'].includes(status) || date < input.startDate) throw new Error('完整状态或日期无效。');
    const dayRecords = records.filter(r => recordDate(r) === date);
    if (status === 'zero' && dayRecords.length) throw new Error('0 小时日期不能包含睡眠记录。');
    if (status === 'complete' && !dayRecords.some(r => r.type === 'night')) throw new Error('完整日期必须包含夜间睡眠。');
    confirmations[date] = status;
  }
  if (!Array.isArray(input.goals) || !input.goals.length) throw new Error('备份必须包含睡眠目标。');
  const goalDates = new Set();
  for (const goal of input.goals) {
    if (!validDate(goal.effectiveDate) || goalDates.has(goal.effectiveDate) || !Number.isInteger(goal.minutes) || goal.minutes <= 0 || goal.minutes > 1440) throw new Error('睡眠目标格式无效。');
    goalDates.add(goal.effectiveDate);
  }
  return { version: VERSION, createdAt: input.createdAt, startDate: input.startDate, lastBackupAt: input.lastBackupAt, records, confirmations, goals: input.goals.map(g => ({ effectiveDate: g.effectiveDate, minutes: g.minutes })).sort((a,b) => a.effectiveDate.localeCompare(b.effectiveDate)) };
}

export function backup(state, now = new Date()) {
  return JSON.stringify({ format: 'sleeping-table-backup', version: VERSION, exportedAt: now.toISOString(), data: { ...state, lastBackupAt: now.toISOString() } }, null, 2);
}

export function parseBackup(text) {
  let input;
  try { input = JSON.parse(text); } catch { throw new Error('文件不是有效的 JSON 备份。'); }
  if (input?.format !== 'sleeping-table-backup' || input.version !== VERSION || typeof input.exportedAt !== 'string' || Number.isNaN(Date.parse(input.exportedAt))) throw new Error('请选择本应用导出的 JSON 备份。');
  return validateState(input.data);
}

export function mergeBackup(state, imported) {
  imported = validateState(imported);
  let next = structuredClone(state);
  const ids = new Set(state.records.map(r => r.id));
  const report = { added: 0, skipped: 0, conflicts: [], confirmations: 0, goals: 0 };
  const blockedDates = new Set();
  for (const record of imported.records) {
    if (ids.has(record.id)) {
      report.skipped++;
      const local = state.records.find(r => r.id === record.id);
      if (JSON.stringify(local) !== JSON.stringify(record)) { blockedDates.add(recordDate(record)); blockedDates.add(recordDate(local)); }
      continue;
    }
    try { next = saveRecord(next, record); report.added++; ids.add(record.id); }
    catch (error) { report.conflicts.push({ date: recordDate(record), type: TYPES[record.type], reason: error.message }); blockedDates.add(recordDate(record)); }
  }
  // Adopt an earlier tracking date; never discard existing history or local goal settings.
  next.startDate = next.startDate < imported.startDate ? next.startDate : imported.startDate;
  for (const [date, status] of Object.entries(imported.confirmations)) {
    if (blockedDates.has(date) || next.confirmations[date]) continue;
    const local = recordsForDate(next, date), incoming = recordsForDate(imported, date);
    const same = local.length === incoming.length && local.every(r => incoming.some(i => i.id === r.id && i.start === r.start && i.end === r.end && i.type === r.type && i.note === r.note));
    if (!same) continue;
    if (status === 'zero' ? local.length === 0 : local.some(r => r.type === 'night')) { next.confirmations[date] = status; report.confirmations++; }
  }
  for (const goal of imported.goals) {
    if (!next.goals.some(g => g.effectiveDate === goal.effectiveDate)) { next.goals.push(goal); report.goals++; }
  }
  next.goals.sort((a,b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return { state: next, report };
}

export function exportCsv(state) {
  const cell = value => {
    let text = String(value);
    // Keep notes from being interpreted as spreadsheet formulas.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [['醒来日期', '类型', '入睡时间（北京时间）', '醒来时间（北京时间）', '时长（分钟）', '状态', '备注']];
  for (const record of [...state.records].sort((a,b) => a.end.localeCompare(b.end))) rows.push([recordDate(record), TYPES[record.type], record.start.replace('T',' '), record.end.replace('T',' '), duration(record), dayStatus(state, recordDate(record)), record.note]);
  for (const [date, status] of Object.entries(state.confirmations)) if (status === 'zero') rows.push([date, '明确 0 小时', '', '', 0, 'zero', '']);
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)} 小时${rounded % 60 ? ` ${rounded % 60} 分` : ''}`;
}

export function formatClock(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const rounded = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(rounded / 60)).padStart(2,'0')}:${String(rounded % 60).padStart(2,'0')}`;
}
