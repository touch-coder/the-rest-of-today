import { TYPES, daysBetween, recordsForDate, duration, goalForDate, dayStatus, formatClock } from './domain.js';
export const COLORS = { night: '#8175ce', nap: '#e5ae62', extra: '#78b8a5' };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function durationChart(state, range, currentDate) {
  const dates = daysBetween(range.start, range.end);
  const mobileWeek = dates.length === 7 && typeof window !== 'undefined' && window.innerWidth <= 700;
  const width = mobileWeek ? Math.max(300, Math.min(420, window.innerWidth - 70)) : Math.max(620, dates.length * 32 + 75), height = 235;
  const left = mobileWeek ? 30 : 42, top = 16, bottom = 185, plotWidth = width - left - 12;
  const data = dates.map(date => {
    const totals = { night: 0, nap: 0, extra: 0 };
    for (const record of recordsForDate(state, date)) totals[record.type] += duration(record) / 60;
    return { date, totals, goal: goalForDate(state, date) / 60, status: dayStatus(state, date, currentDate), total: Object.values(totals).reduce((a,b) => a+b,0) };
  });
  const max = Math.max(12, Math.ceil(Math.max(...data.map(day => Math.max(day.total, day.goal)), 0) / 4) * 4);
  const y = hours => bottom - hours / max * (bottom - top);
  const step = plotWidth / dates.length;
  let svg = `<svg class="${dates.length === 7 ? 'weekly-chart' : 'monthly-chart'}" viewBox="0 0 ${width} ${height}" role="img" aria-label="每日睡眠时长堆叠柱状图，虚线为当天目标。未确认记录以淡色显示。"><defs><pattern id="missing-pattern" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#d5d7e3" stroke-width="1"/></pattern></defs>`;
  for (let h=0; h<=max; h+=max/4) svg += `<line x1="${left}" y1="${y(h)}" x2="${width-10}" y2="${y(h)}" stroke="#ececf3"/><text x="${left-10}" y="${y(h)+4}" text-anchor="end" class="axis-label">${h}h</text>`;
  const goalPoints = data.map((day,index) => `${left+step*(index+.5)},${y(day.goal)}`).join(' ');
  svg += `<polyline points="${goalPoints}" stroke="#a6a8b7" stroke-width="1.5" fill="none" stroke-dasharray="5 5"/>`;
  data.forEach((day,index) => {
    const x = left + step * (index + .5), barWidth = Math.min(30, step * .5);
    let accumulated = 0;
    for (const type of Object.keys(TYPES)) {
      const h = day.totals[type] / max * (bottom-top);
      if (h) svg += `<rect x="${x-barWidth/2}" y="${y(accumulated+day.totals[type])}" width="${barWidth}" height="${h}" rx="${accumulated ? 0 : 2}" fill="${COLORS[type]}" opacity="${['complete','zero'].includes(day.status) ? 1 : .38}"><title>${day.date} ${TYPES[type]} ${day.totals[type].toFixed(2)} 小时</title></rect>`;
      accumulated += day.totals[type];
    }
    if (day.status === 'missing' && day.date < currentDate && !day.total) svg += `<rect x="${x-barWidth/2}" y="${bottom-22}" width="${barWidth}" height="22" rx="3" fill="url(#missing-pattern)"/><text x="${x}" y="${bottom-6}" text-anchor="middle" class="axis-label">?</text>`;
    if (day.status === 'zero') svg += `<circle cx="${x}" cy="${bottom-4}" r="4" fill="#8175ce"/><title>${day.date} 明确 0 小时</title>`;
    if (day.status === 'missing' && day.total) svg += `<text x="${x}" y="${y(day.total)-7}" text-anchor="middle" class="axis-label">!</text>`;
    const weekly = dates.length === 7;
    const label = weekly ? ['周日','周一','周二','周三','周四','周五','周六'][index] : Number(day.date.slice(8));
    svg += `<text x="${x}" y="${bottom+22}" text-anchor="middle" class="axis-label ${day.date === currentDate ? 'current-label' : ''}">${label}</text>`;
    if (weekly) svg += `<text x="${x}" y="${bottom+39}" text-anchor="middle" class="axis-label">${Number(day.date.slice(5,7))}/${Number(day.date.slice(8))}</text>`;
  });
  return svg + '</svg>';
}

export function rhythmChart(state, range, currentDate) {
  const dates = daysBetween(range.start, range.end);
  const mobileWeek = dates.length === 7 && typeof window !== 'undefined' && window.innerWidth <= 700;
  const width = mobileWeek ? Math.max(300, Math.min(420, window.innerWidth - 70)) : Math.max(620, dates.length * 32 + 75), height = 295;
  const left=mobileWeek?42:54, right=width-12, step=(right-left)/dates.length;
  const nights = dates.map((date,index) => {
    const record = recordsForDate(state,date).find(r=>r.type==='night');
    if (!record || date > currentDate || date < state.startDate) return null;
    let start=Number(record.start.slice(11,13))*60+Number(record.start.slice(14));
    if(start<720) start+=1440;
    const end=Number(record.end.slice(11,13))*60+Number(record.end.slice(14));
    return { date, index, start, end, confirmed:dayStatus(state,date,currentDate)==='complete' };
  });
  const existing = nights.filter(Boolean);
  if (!existing.length) return '<div class="chart-empty">记录夜间睡眠后，这里会显示入睡和醒来的时间变化。</div>';
  const startMin=Math.min(1200,...existing.map(d=>d.start))-30, startMax=Math.max(1560,...existing.map(d=>d.start))+30;
  const endMin=Math.min(360,...existing.map(d=>d.end))-30, endMax=Math.max(600,...existing.map(d=>d.end))+30;
  const scale=(value,min,max,offset)=>offset+95-(value-min)/(max-min)*95;
  let svg=`<svg class="${dates.length === 7 ? 'weekly-chart' : 'monthly-chart'}" viewBox="0 0 ${width} ${height}" role="img" aria-label="夜间作息时间图，上方为入睡，下方为醒来。淡色空心点表示未确认。">`;
  for (const [field,min,max,offset,color] of [['start',startMin,startMax,28,COLORS.night],['end',endMin,endMax,163,COLORS.extra]]) {
    svg+=`<text x="${left}" y="${offset-12}" class="axis-label">${field==='start'?'入睡':'醒来'}</text>`;
    for(let tick=0;tick<3;tick++){
      const value=min+(max-min)*tick/2,y=scale(value,min,max,offset);
      svg+=`<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="#ececf3"/><text x="${left-7}" y="${y+4}" text-anchor="end" class="axis-label">${formatClock(value)}</text>`;
    }
    for(let i=1;i<nights.length;i++){
      const a=nights[i-1],b=nights[i];
      if(a&&b)svg+=`<line x1="${left+step*(a.index+.5)}" y1="${scale(a[field],min,max,offset)}" x2="${left+step*(b.index+.5)}" y2="${scale(b[field],min,max,offset)}" stroke="${color}" stroke-width="2" opacity="${a.confirmed&&b.confirmed?'.7':'.25'}"/>`;
    }
    for(const day of existing)svg+=`<circle cx="${left+step*(day.index+.5)}" cy="${scale(day[field],min,max,offset)}" r="4" stroke="${color}" stroke-width="2" fill="${day.confirmed?color:'#fff'}" opacity="${day.confirmed?1:.45}"><title>${escape(day.date)} ${field==='start'?'入睡':'醒来'} ${formatClock(day[field])} ${day.confirmed?'已确认':'待确认'}</title></circle>`;
  }
  dates.forEach((date,index)=>svg+=`<text x="${left+step*(index+.5)}" y="284" text-anchor="middle" class="axis-label">${Number(date.slice(8))}</text>`);
  return svg+'</svg>';
}
