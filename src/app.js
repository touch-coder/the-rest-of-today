import { TYPES, TIMEZONE, today, validDate, addDays, daysBetween, weekRange, monthRange, createState, timestamp, duration, recordDate, recordsForDate, saveRecord, deleteRecord, confirmDay, dayStatus, goalForDate, setGoal, summarize, backup, parseBackup, mergeBackup, exportCsv, formatDuration, formatClock } from './domain.js';
import { readState, writeState } from './storage.js';
import { COLORS, durationChart, rhythmChart } from './charts.js';

const app = document.querySelector('#app');
const recordDialog = document.querySelector('#record-dialog');
const importDialog = document.querySelector('#import-dialog');
const confirmDialog = document.querySelector('#confirm-dialog');
let state, page='home', selectedDate=today(), calendarDate=today(), reportDate=today(), reportKind='week';
let undo=null, importPreview=null, installPrompt=null, waitingWorker=null, storageFailed=false;
let toastTimer;
const esc = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const percent = number => number===null?'—':`${Math.round(number*100)}%`;
const labels = { complete:'已确认完整', zero:'明确 0 小时', pending:'待确认完整', missing:'未记录', outside:'记录范围外', future:'未来日期' };
const icons={
  moon:'<path d="M20.6 13A8.5 8.5 0 0 1 11 3.4 8.5 8.5 0 1 0 20.6 13Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  cloud:'<path d="M6 18a4 4 0 0 1-.7-7.9A6 6 0 0 1 17 8.5a4.8 4.8 0 0 1 1 9.5Z"/>',
  home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  chart:'<path d="M4 3v17h17M8 16v-5m5 5V6m5 10V9"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="m9 6 6 6-6 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>'
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.moon}</svg>`;
const prettyDate=date=>`${Number(date.slice(5,7))} 月 ${Number(date.slice(8))} 日`;
const weekday=date=>['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][new Date(`${date}T00:00:00Z`).getUTCDay()];
const legend=()=>`<div class="legend">${Object.entries(TYPES).map(([type,label])=>`<span><i style="background:${COLORS[type]}"></i>${label}</span>`).join('')}<span><i class="target-line"></i>每日目标</span></div>`;

function toast(message) {
  const element=document.querySelector('#toast'); element.textContent=message; element.classList.add('visible');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>element.classList.remove('visible'),4500);
}

function persist(next, message='', preserveUndo=false) {
  if(storageFailed) { toast('数据存储不可用，请先在设置中恢复。'); return false; }
  try { writeState(next); state=next; if(!preserveUndo)undo=null; render(); if(message)toast(message); return true; }
  catch { toast('保存失败：浏览器存储不可用或已满。原有数据未修改，请先导出备份。'); return false; }
}

function ask(title, message, actionLabel='确认', danger=false) {
  return new Promise(resolve=>{
    confirmDialog.innerHTML=`<form method="dialog"><div class="dialog-heading"><h2 id="confirm-title">${esc(title)}</h2></div><p class="confirm-copy">${esc(message)}</p><div class="dialog-actions"><button value="cancel" class="button secondary">取消</button><button value="confirm" class="button ${danger?'danger':'primary'}">${esc(actionLabel)}</button></div></form>`;
    confirmDialog.onclose=()=>resolve(confirmDialog.returnValue==='confirm');
    confirmDialog.returnValue='cancel'; confirmDialog.showModal();
  });
}

function shell(content) {
  const navItems=[['home','home','今日记录'],['calendar','calendar','睡眠月历'],['report','chart','周月总结'],['settings','settings','设置与备份']];
  const backupDue=Date.now()-Date.parse(state.lastBackupAt||state.createdAt)>=7*86400000;
  return `<div class="layout"><aside class="sidebar"><a href="#home" class="brand" data-page="home"><img src="./assets/icon.svg" alt=""><div>眠记<span>SLEEP JOURNAL</span></div></a><div class="nav-label">我的睡眠手账</div><nav aria-label="主导航">${navItems.map(([id,ico,label])=>`<button class="nav-item ${page===id?'active':''}" data-page="${id}" ${page===id?'aria-current="page"':''}>${icon(ico)}<span>${label}</span>${page===id?'<i></i>':''}</button>`).join('')}</nav><div class="sidebar-bottom">${icon('shield')}<p>只属于你的睡眠记录<span>数据保存在当前设备</span></p></div></aside><main><header class="topbar"><div class="mobile-brand">${icon('moon')}<strong>眠记</strong></div><span class="topbar-label">慢慢记录，找到自己的节奏</span><div class="connection ${navigator.onLine?'':'is-offline'}"><i></i>${navigator.onLine?'本地保存':'离线可用'}</div></header>${storageFailed?'<div class="banner error">浏览器数据无法读取。原始数据已保留，请到设置导出原始数据或恢复备份。</div>':''}${backupDue?`<div class="banner">${icon('download')}距离上次备份已超过 7 天，给睡眠手账留一份副本。<button data-action="export-json">立即备份</button></div>`:''}${waitingWorker?'<div class="banner">新版本已准备好。<button data-action="update">更新应用</button></div>':''}<div class="page-content">${content}</div><footer>北京时间 · ${TIMEZONE} <span>认真休息，也是一件值得记录的事。</span></footer></main></div><nav class="mobile-nav" aria-label="手机导航">${navItems.map(([id,ico,label])=>`<button class="${page===id?'active':''}" data-page="${id}" ${page===id?'aria-current="page"':''}>${icon(ico)}<span>${label.replace('设置与备份','设置').replace('今日记录','记录').replace('睡眠月历','月历').replace('周月总结','总结')}</span></button>`).join('')}</nav>`;
}

function dayPanel(date, compact=false) {
  const records=recordsForDate(state,date), status=dayStatus(state,date);
  const total=records.reduce((sum,record)=>sum+duration(record),0), goal=goalForDate(state,date);
  const locked=status==='future', hasNight=records.some(r=>r.type==='night');
  let stateText=labels[status];
  if(status==='missing') stateText=records.length?'未记录：缺少夜间睡眠':date===today()?'今日尚未记录':'未记录：缺少夜间睡眠';
  const selectedToday=date===today();
  const confirmControls=['future','outside'].includes(status)?'':`<div class="day-actions">${hasNight&&status!=='complete'?`<button class="button primary" data-action="confirm-day" data-date="${date}">${icon('check')}确认${selectedToday?'今日':'当天'}完整</button>`:''}${!records.length&&status!=='zero'?`<button class="button text-button" data-action="confirm-zero" data-date="${date}">确认全天 0 小时</button>`:''}${['complete','zero'].includes(status)?`<button class="button text-button" data-action="unconfirm" data-date="${date}">撤销完整确认</button>`:''}<span>${status==='complete'?'已纳入周月统计':status==='zero'?'明确无睡眠，已纳入统计':'当天记录齐全后，请确认完整'}</span></div>`;
  return `<section class="card day-panel"><div class="section-heading"><div><div class="eyebrow">${compact?'每日明细':'TODAY’S REST'}</div><h2>${selectedToday?'今天的睡眠':prettyDate(date)+'的睡眠'} <span class="badge ${status}">${stateText}</span></h2></div>${!compact?`<label class="date-picker"><span class="sr-only">选择记录日期</span><input type="date" id="selected-date" value="${date}" min="1900-01-01" max="${today()}"></label>`:''}</div><div class="day-total"><div><span>全天已记录</span><strong>${(total/60).toFixed(1)}<small>小时</small></strong><p>${formatDuration(total)} · ${['complete','zero'].includes(status)?'已确认':'尚未计入正式统计'}</p></div><div class="goal-display"><span>每日目标 <b>${formatDuration(goal)}</b></span><div class="progress"><i style="width:${Math.min(100,total/goal*100)}%"></i></div><small>${total>=goal?'已达到时长目标':`距目标还差 ${formatDuration(goal-total)}`}</small></div></div><div class="sleep-cards">${Object.entries(TYPES).map(([type,label])=>{
    const record=records.find(r=>r.type===type), ico=type==='night'?'moon':type==='nap'?'sun':'cloud';
    return `<div class="sleep-card ${type}"><div class="sleep-card-title"><span class="type-icon">${icon(ico)}</span><h3>${label}</h3>${record?'<span class="record-dot" title="已录入"></span>':''}</div>${record?`<strong>${formatDuration(duration(record))}</strong><p>${record.start.slice(11)} <span>→</span> ${record.end.slice(11)}${record.start.slice(0,10)!==record.end.slice(0,10)?' <small>跨日</small>':''}</p><div class="record-actions"><button data-action="edit-record" data-id="${esc(record.id)}">编辑记录</button><button class="delete-link" aria-label="删除${label}" data-action="delete-record" data-id="${esc(record.id)}">删除</button></div>`:`<strong class="unrecorded">${status==='zero'?'明确无睡眠':'还没有记录'}</strong><p>${type==='night'?'记下昨晚的休息':type==='nap'?'午间的小憩时光':'补充一点好精神'}</p><button class="add-record" data-action="add-record" data-type="${type}" data-date="${date}" ${locked?'disabled':''}>${icon('plus')}添加记录</button>`}</div>`;
  }).join('')}</div>${confirmControls}${undo?'<div class="undo-bar">已删除一条记录。<button data-action="undo">撤销删除</button></div>':''}${records.length?`<details class="record-details"><summary>查看日期与备注</summary>${records.map(record=>`<p><b>${TYPES[record.type]}</b> ${esc(record.start.replace('T',' '))} → ${esc(record.end.replace('T',' '))}${record.note?`<span class="note">${esc(record.note)}</span>`:''}</p>`).join('')}</details>`:''}</section>`;
}

function distribution(stats) {
  return `<div class="distribution">${Object.entries(TYPES).map(([type,label])=>`<div class="distribution-row"><span><i style="background:${COLORS[type]}"></i>${label}</span><b>${formatDuration(stats.totals[type])}</b><small>${stats.total?Math.round(stats.totals[type]/stats.total*100)+'%':'—'}</small></div><div class="distribution-track"><i style="width:${stats.total?stats.totals[type]/stats.total*100:0}%;background:${COLORS[type]}"></i></div>`).join('')}</div>`;
}

function homeView() {
  const range=weekRange(today()), stats=summarize(state,range);
  return `<div class="page-heading"><div><div class="eyebrow">YOUR DAILY RHYTHM</div><h1>好好睡，慢慢记<span class="heading-spark">✧</span></h1><p>${prettyDate(today())} · ${weekday(today())}，为自己的休息留一点空间。</p></div><button class="button secondary desktop-only" data-action="go-today">${icon('calendar')}回到今天</button></div>${dayPanel(selectedDate)}<div class="overview-grid"><section class="card week-overview"><div class="section-heading"><div><h2>这一周，睡得怎么样？</h2><p>${range.start.slice(5).replace('-','/')} — ${range.end.slice(5).replace('-','/')} · 周日至周六</p></div><button class="icon-link" data-page="report" aria-label="查看周月总结">${icon('arrow')}</button></div><div class="mini-metrics"><div><span>日均睡眠</span><strong>${stats.average===null?'—':(stats.average/60).toFixed(1)}<small>${stats.average===null?'':' 小时'}</small></strong></div><div><span>已达标</span><strong>${stats.achieved}<small> / ${stats.confirmed} 天</small></strong></div><div><span>记录完整率</span><strong>${percent(stats.completionRate)}</strong></div></div><div class="chart-scroll">${durationChart(state,range,today())}</div>${legend()}<p class="chart-note">淡色柱为未确认记录；斜纹为缺失，! 表示缺少夜间睡眠。</p></section><section class="card balance-card"><div class="eyebrow">A LITTLE BALANCE</div><h2>休息的组成</h2><p>本周已确认日期的三类睡眠</p><div class="donut" style="${stats.total?`background:conic-gradient(${COLORS.night} 0 ${stats.totals.night/stats.total*100}%,${COLORS.nap} ${stats.totals.night/stats.total*100}% ${(stats.totals.night+stats.totals.nap)/stats.total*100}%,${COLORS.extra} ${(stats.totals.night+stats.totals.nap)/stats.total*100}% 100%)`:''}"><div><strong>${stats.confirmed}</strong><span>已确认天数</span></div></div>${distribution(stats)}<div class="soft-note">${icon('moon')}睡眠记录不用完美，记得完整就好。</div></section></div>`;
}

function calendarView() {
  const range=monthRange(calendarDate), dates=daysBetween(range.start,range.end);
  const padding=new Date(`${range.start}T00:00:00Z`).getUTCDay();
  const stats=summarize(state,range);
  return `<div class="page-heading"><div><div class="eyebrow">REST, DAY BY DAY</div><h1>睡眠月历</h1><p>看见每一天，也看见还没填上的空白。</p></div></div><section class="card"><div class="section-heading"><h2>${Number(calendarDate.slice(0,4))} 年 ${Number(calendarDate.slice(5,7))} 月</h2><div class="calendar-controls"><button class="button small secondary" data-action="calendar-prev" aria-label="上个月">‹</button><button class="button small secondary" data-action="calendar-today">本月</button><button class="button small secondary" data-action="calendar-next" aria-label="下个月">›</button></div></div><div class="calendar-summary"><span>已确认 <b>${stats.confirmed}</b> 天</span><span>缺失 <b>${stats.missing}</b> 天</span><span>待确认 <b>${stats.pending}</b> 天</span></div><div class="calendar-weekdays">${['日','一','二','三','四','五','六'].map(day=>`<span>${day}</span>`).join('')}</div><div class="calendar-grid">${'<div class="calendar-padding"></div>'.repeat(padding)}${dates.map(date=>{
    const status=dayStatus(state,date), total=recordsForDate(state,date).reduce((sum,r)=>sum+duration(r),0), achieved=['complete','zero'].includes(status)&&total>=goalForDate(state,date);
    const label=status==='missing'?(date===today()?'进行中':'缺失'):status==='pending'?'待确认':status==='zero'?'明确 0h':status==='complete'?(achieved?'已达标':'未达标'):status==='outside'?'范围外':'';
    return `<button class="calendar-day ${status} ${achieved?'achieved':''} ${date===selectedDate?'selected':''} ${date===today()?'today':''}" data-action="select-day" data-date="${date}" aria-label="${date} ${labels[status]} ${total?formatDuration(total):''}" ${status==='future'?'disabled':''}><span class="calendar-day-number">${Number(date.slice(8))}${date===today()?'<i></i>':''}</span><strong>${['future','outside'].includes(status)?'':total?(total/60).toFixed(1)+'h':status==='zero'?'0h':'—'}</strong><small>${label}</small></button>`;
  }).join('')}</div><div class="calendar-legend"><span><i class="achieved"></i>已确认且达标</span><span><i class="complete"></i>已确认未达标</span><span><i class="pending"></i>待确认</span><span><i class="missing"></i>缺失</span></div><p class="chart-note">标记从 ${state.startDate} 开始。点击日期可补录；缺少夜间睡眠视为未记录。</p></section><div id="day-detail">${dayPanel(selectedDate,true)}</div>`;
}

function narrative(stats) {
  if(!stats.days)return '这个周期尚无需要统计的日期。你可以切换周期，或调整开始记录日期。';
  if(!stats.confirmed)return `本周期截至 ${stats.end} 共 ${stats.days} 天，尚无已确认完整的日期。已有记录保留在图表中，确认完整后才纳入平均值和达标率。`;
  const rhythmText=stats.sleep.spread===null?'夜间作息样本不足 2 天，暂不评价规律。':`夜间平均 ${formatClock(stats.sleep.mean)} 入睡、${formatClock(stats.wake.mean)} 醒来，入睡时间波动约 ${Math.round(stats.sleep.spread)} 分钟，醒来时间波动约 ${Math.round(stats.wake.spread)} 分钟。`;
  return `截至 ${stats.end}，已确认 ${stats.confirmed}/${stats.days} 天，日均睡眠 ${formatDuration(stats.average)}，其中 ${stats.achieved} 天达到当日目标。已确认日期合计${stats.difference>=0?'超过':'低于'}目标 ${formatDuration(Math.abs(stats.difference))}。${rhythmText}另有 ${stats.missing} 天缺失、${stats.pending} 天待确认，均未计入正式统计。`;
}

function reportView() {
  const range=reportKind==='week'?weekRange(reportDate):monthRange(reportDate), stats=summarize(state,range);
  return `<div class="page-heading"><div><div class="eyebrow">SEE THE BIGGER PICTURE</div><h1>周月总结</h1><p>从一段休息，到自己的生活节奏。</p></div><div class="segmented"><button class="${reportKind==='week'?'active':''}" data-action="report-week">每周</button><button class="${reportKind==='month'?'active':''}" data-action="report-month">每月</button></div></div><div class="report-controls"><div><button class="button small secondary" data-action="report-prev" aria-label="上一周期">‹</button><strong>${range.start} — ${range.end}</strong><button class="button small secondary" data-action="report-next" aria-label="下一周期">›</button></div><label class="date-picker"><span class="sr-only">选择总结日期</span><input type="date" id="report-date" value="${reportDate}" min="1900-01-01" max="2100-12-31"></label></div><div class="stats-grid"><div class="card stat-card"><span>日均睡眠</span><strong>${stats.average===null?'—':(stats.average/60).toFixed(1)}<small>${stats.average===null?'':'小时'}</small></strong><p>仅按 ${stats.confirmed} 个完整日期计算</p></div><div class="card stat-card"><span>总睡眠时长</span><strong>${(stats.total/60).toFixed(1)}<small>小时</small></strong><p>目标差额 ${stats.difference===null?'—':(stats.difference>=0?'+':'−')+formatDuration(Math.abs(stats.difference))}</p></div><div class="card stat-card"><span>睡眠达标率</span><strong>${percent(stats.achievementRate)}</strong><p>${stats.achieved} / ${stats.confirmed} 个完整日期</p></div><div class="card stat-card"><span>记录完整率</span><strong>${percent(stats.completionRate)}</strong><p>${stats.confirmed} / ${stats.days} 天 · 含今天</p></div></div><section class="card summary-card"><span class="summary-icon">${icon('chart')}</span><div><h2>${reportKind==='week'?'本周':'本月'}睡眠小结</h2><p>${narrative(stats)}</p></div></section><section class="card"><div class="section-heading"><div><h2>每天睡了多久</h2><p>按醒来日期汇总 · 目标按各日生效设置</p></div></div><div class="chart-scroll">${durationChart(state,range,today())}</div>${legend()}<p class="chart-note">淡色柱表示未确认记录；斜纹为缺失，! 表示缺少夜间睡眠。缺失不按 0 小时计算。</p></section><div class="overview-grid"><section class="card"><div class="section-heading"><div><h2>夜间作息</h2><p>入睡与醒来时间 · 空心点为未确认记录</p></div></div><div class="chart-scroll">${rhythmChart(state,range,today())}</div><div class="rhythm-metrics"><div><span>平均入睡</span><b>${formatClock(stats.sleep.mean)}</b></div><div><span>平均醒来</span><b>${formatClock(stats.wake.mean)}</b></div><div><span>入睡波动</span><b>${stats.sleep.spread===null?'—':Math.round(stats.sleep.spread)+' 分'}</b></div><div><span>醒来波动</span><b>${stats.wake.spread===null?'—':Math.round(stats.wake.spread)+' 分'}</b></div></div><p class="chart-note">规律仅使用已确认的夜间睡眠。波动为标准差；午夜前后连续计算，少于 2 天不计算波动。</p></section><section class="card"><h2>三类睡眠占比</h2><p class="muted">仅使用已确认日期</p>${distribution(stats)}<div class="status-totals"><span>缺失日期 <b>${stats.missing}</b></span><span>待确认日期 <b>${stats.pending}</b></span><span>已确认日期 <b>${stats.confirmed}</b></span></div></section></div><section class="card"><div class="section-heading"><h2>每日明细</h2><button class="button small secondary" data-action="export-csv">${icon('download')}导出 CSV</button></div><div class="table-scroll"><table><thead><tr><th>日期</th><th>夜间</th><th>午休</th><th>补觉</th><th>总时长</th><th>目标</th><th>状态</th><th></th></tr></thead><tbody>${daysBetween(range.start,range.end).map(date=>{
    const records=recordsForDate(state,date), status=dayStatus(state,date), total=records.reduce((sum,r)=>sum+duration(r),0);
    return `<tr><td>${date}</td>${Object.keys(TYPES).map(type=>{const record=records.find(r=>r.type===type);return `<td>${record?formatDuration(duration(record)):'—'}</td>`;}).join('')}<td>${records.length||status==='zero'?formatDuration(total):'—'}</td><td>${formatDuration(goalForDate(state,date))}</td><td><span class="badge ${status}">${labels[status]}</span></td><td>${status!=='future'?`<button class="table-link" data-action="edit-day" data-date="${date}">查看 / 编辑</button>`:''}</td></tr>`;
  }).join('')}</tbody></table></div></section>`;
}

function settingsView() {
  return `<div class="page-heading"><div><div class="eyebrow">MAKE IT YOURS</div><h1>设置与备份</h1><p>照顾好自己的节奏，也照顾好记录。</p></div></div><div class="settings-grid"><section class="card"><h2>每日睡眠目标</h2><p class="muted">夜间、午休和补觉共同计入全天目标。</p><form id="goal-form"><label>目标时长（小时）<input name="hours" type="number" step="0.05" min="0.05" max="24" value="${goalForDate(state,today())/60}" required></label><label>生效日期<input name="effectiveDate" type="date" min="1900-01-01" max="2100-12-31" value="${today()}" required></label><button class="button primary" type="submit">保存目标</button><p class="form-error" role="alert"></p></form><details><summary>查看目标历史</summary><ul class="goal-history">${[...state.goals].sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)).map(goal=>`<li><span>${goal.effectiveDate==='1900-01-01'?'初始默认目标':goal.effectiveDate+' 起'}</span><b>${formatDuration(goal.minutes)}</b></li>`).join('')}</ul></details><p class="chart-note">历史按当时目标计算；修改已有生效日期会更新该段历史目标。</p></section><section class="card"><h2>记录范围</h2><p class="muted">从开始记录日期起，标记缺失并计算完整率。</p><form id="start-form"><label>开始记录日期<input name="startDate" type="date" min="1900-01-01" max="${today()}" value="${state.startDate}" required></label><button class="button secondary" type="submit">保存开始日期</button><p class="form-error" role="alert"></p></form><div class="soft-note">${icon('calendar')}调整范围不会删除睡眠记录；范围外的日期不参与统计。</div><p class="chart-note">时区固定为北京时间（Asia/Shanghai），设备时区变化不会改变记录归属。</p></section><section class="card"><h2>备份与恢复</h2><p class="muted">数据只保存在当前设备。清除浏览器数据或更换网址会失去访问，请定期备份。</p><div class="backup-meta">上次备份 <b>${state.lastBackupAt?new Date(state.lastBackupAt).toLocaleString('zh-CN',{timeZone:TIMEZONE}):'尚未备份'}</b></div><div class="backup-buttons"><button class="button primary" data-action="export-json">${icon('download')}导出 JSON 备份</button><button class="button secondary" data-action="import">${icon('upload')}恢复 / 合并备份</button><button class="button secondary" data-action="export-csv">${icon('download')}导出 CSV 明细</button></div><input type="file" id="import-file" accept=".json,application/json" hidden><p class="chart-note">JSON 可恢复记录、完整状态和目标；CSV 仅用于查看。合并保留本地同 ID 记录及同日期目标，冲突会报告。每 7 天在打开应用时提醒备份。</p>${storageFailed?'<div class="recovery-actions"><button class="button secondary" data-action="export-raw">导出原始浏览器数据</button><button class="button danger" data-action="recover-empty">创建新的空白手账</button></div>':''}</section><section class="card"><h2>安装与离线</h2><p class="muted" id="offline-status">${offlineMessage()}</p>${installPrompt?'<button class="button primary" data-action="install">添加到主屏幕</button>':''}<p>iPhone：在 Safari 的分享菜单中选择“添加到主屏幕”。Android：使用浏览器的安装应用入口。</p><div class="soft-note">${icon('shield')}无需账号，不上传睡眠数据，不使用在线 AI。</div><p class="chart-note">每个浏览器及网址保存独立数据；部署到新地址后，请用 JSON 备份迁移。离线缓存就绪后才能断网使用。</p></section></div>`;
}

let offlineReady=false;
function offlineMessage() {
  if(!window.isSecureContext)return '当前是普通 HTTP 地址。使用 HTTPS 或本机 localhost 才能启用离线安装。';
  return offlineReady?'离线资源已就绪，可在断网后继续记录。':'正在准备离线资源，完成后可断网使用。';
}

function render() {
  app.innerHTML=shell(page==='home'?homeView():page==='calendar'?calendarView():page==='report'?reportView():settingsView());
}

function openRecord(type, date, id) {
  const record=id?state.records.find(r=>r.id===id):null;
  if(id&&!record){toast('记录已被移除。');return;}
  if(record)date=recordDate(record);
  const selectedType=record?.type||type;
  const defaults={night:[`${addDays(date,-1)}T23:00`,`${date}T07:00`],nap:[`${date}T12:30`,`${date}T13:00`],extra:[`${date}T18:00`,`${date}T19:00`]};
  const [start,end]=defaults[selectedType];
  recordDialog.innerHTML=`<form id="record-form"><div class="dialog-heading"><div><div class="eyebrow">A MOMENT OF REST</div><h2 id="record-title">${record?'编辑':'添加'}睡眠记录</h2></div><button type="button" class="icon-button" data-action="close-record" aria-label="关闭">${icon('close')}</button></div><label>睡眠类型<select name="type">${Object.entries(TYPES).map(([key,label])=>`<option value="${key}" ${key===selectedType?'selected':''}>${label}</option>`).join('')}</select></label><label>估计入睡时间<input type="datetime-local" name="start" value="${esc(record?.start||start)}" min="1900-01-01T00:00" max="2100-12-31T23:59" required></label><label>最终醒来时间<input type="datetime-local" name="end" value="${esc(record?.end||end)}" min="1900-01-01T00:00" max="${today()}T23:59" required></label><div class="duration-preview" id="duration-preview"></div><label>备注 <span class="optional">可选，最多 1000 字</span><textarea name="note" rows="2" maxlength="1000" placeholder="例如：中途醒来一次，或今天感觉很精神">${esc(record?.note||'')}</textarea></label><p class="chart-note">北京时间 · 按醒来日期归档 · 起止差计为时长，不扣除中途清醒</p><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-action="close-record">取消</button><button type="submit" class="button primary">保存记录</button></div></form>`;
  const form=recordDialog.querySelector('form');
  const updatePreview=()=>{
    try { const minutes=(timestamp(form.elements.end.value)-timestamp(form.elements.start.value))/60000; recordDialog.querySelector('#duration-preview').textContent=minutes>0?`预计时长 ${formatDuration(minutes)} · 归入 ${form.elements.end.value.slice(0,10)}`:'醒来时间必须晚于入睡时间'; }
    catch { recordDialog.querySelector('#duration-preview').textContent='填写起止时间后，自动计算时长'; }
  };
  form.addEventListener('input',updatePreview);updatePreview();
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try {
      const nextRecord={id:record?.id||crypto.randomUUID(),type:form.elements.type.value,start:form.elements.start.value,end:form.elements.end.value,note:form.elements.note.value.trim()};
      let next=saveRecord(state,nextRecord);
      const date=recordDate(nextRecord);
      if(date>today())throw new Error('不能录入未来醒来的睡眠。');
      if(date<state.startDate){
        const expand=await ask('提前开始记录日期？',`这条记录归入 ${date}，早于当前开始日期 ${state.startDate}。是否将开始日期提前到 ${date}？选择取消仍会保存记录，但暂不纳入统计。`,'提前开始日期');
        if(expand)next.startDate=date;
      }
      // Re-check after an asynchronous prompt, in case another tab changed the data.
      next={...saveRecord(state,nextRecord),startDate:next.startDate};
      if(persist(next,'记录已保存，请确认当天是否完整。')){selectedDate=date;calendarDate=date;recordDialog.close();render();}
    }catch(error){form.querySelector('.form-error').textContent=error.message;}
    finally{button.disabled=false;}
  });
  recordDialog.showModal();
}

function download(content, filename, type) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

function showImport(imported) {
  importPreview=imported;
  const report=storageFailed?{added:imported.records.length,skipped:0,conflicts:[],confirmations:Object.keys(imported.confirmations).length,goals:imported.goals.length}:mergeBackup(state,imported).report;
  importDialog.innerHTML=`<div class="dialog-heading"><h2 id="import-title">备份导入预览</h2><button class="icon-button" data-action="close-import" aria-label="关闭">${icon('close')}</button></div><div class="import-stats"><p>文件中共有 <b>${imported.records.length}</b> 条睡眠记录</p><p>可新增 <b>${report.added}</b> 条 · 同 ID 跳过 <b>${report.skipped}</b> 条</p><p>冲突 <b>${report.conflicts.length}</b> 条 · 可恢复完整状态 <b>${report.confirmations}</b> 天</p><p>可新增目标 <b>${report.goals}</b> 项 · 开始日期 ${state.startDate<imported.startDate?state.startDate:imported.startDate}</p></div>${report.conflicts.length?`<details open><summary>查看冲突（这些记录不会导入）</summary><ul class="conflicts">${report.conflicts.map(item=>`<li>${esc(item.date)} ${esc(item.type)}：${esc(item.reason)}</li>`).join('')}</ul></details>`:''}<p class="chart-note">保留本地同 ID 记录和同日期目标。导入新增记录会使相关日期重新待确认；只有两边当日记录完全一致时，才恢复备份的完整状态。</p><div class="dialog-actions"><button class="button secondary" data-action="close-import">取消</button><button class="button primary" data-action="commit-import">确认合并</button></div>`;
  importDialog.showModal();
}

function moveMonth(date,offset){const value=new Date(`${date.slice(0,7)}-01T00:00:00Z`);value.setUTCMonth(value.getUTCMonth()+offset);return value.toISOString().slice(0,10);}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-page],[data-action]');if(!button||button.disabled)return;
  if(button.dataset.page){event.preventDefault();page=button.dataset.page;render();window.scrollTo({top:0,behavior:'smooth'});return;}
  const {action,date,id,type}=button.dataset;
  try {
    if(action==='add-record')openRecord(type,date);
    if(action==='edit-record')openRecord(null,null,id);
    if(action==='close-record')recordDialog.close();
    if(action==='close-import'){importDialog.close();importPreview=null;}
    if(action==='go-today'){selectedDate=today();render();}
    if(action==='confirm-day'){persist(confirmDay(state,date),'当天已确认完整，已纳入统计。');}
    if(action==='confirm-zero'&&await ask('确认全天 0 小时？',`${date} 将明确记为全天没有睡眠，并按 0 小时纳入平均值。这与忘记记录不同。`,'确认 0 小时'))persist(confirmDay(state,date,true),'已明确记录 0 小时。');
    if(action==='unconfirm'){const next=structuredClone(state);delete next.confirmations[date];persist(next,'已撤销完整确认。');}
    if(action==='delete-record'){
      const record=state.records.find(r=>r.id===id);
      if(!record)throw new Error('记录不存在。');
      if(await ask('删除这段睡眠？',`${recordDate(record)} 的${TYPES[record.type]}（${formatDuration(duration(record))}）将被删除，当天需要重新确认。`,'删除',true)){
        const saved={record:structuredClone(record),confirmation:state.confirmations[recordDate(record)]};
        if(persist(deleteRecord(state,id),'记录已删除，可撤销最近一次删除。')){undo=saved;render();}
      }
    }
    if(action==='undo'&&undo){
      const saved=undo;let next=saveRecord(state,saved.record);
      if(saved.confirmation)next.confirmations[recordDate(saved.record)]=saved.confirmation;
      persist(next,'已恢复记录及原完整状态。');
    }
    if(action==='select-day'){selectedDate=date;render();document.querySelector('#day-detail').scrollIntoView({behavior:'smooth',block:'start'});}
    if(action==='edit-day'){selectedDate=date;calendarDate=date;page='calendar';render();document.querySelector('#day-detail').scrollIntoView({behavior:'smooth',block:'start'});}
    if(action==='calendar-prev'||action==='calendar-next'){const next=moveMonth(calendarDate,action==='calendar-prev'?-1:1);if(validDate(next)){calendarDate=next;render();}}
    if(action==='calendar-today'){calendarDate=today();selectedDate=today();render();}
    if(action==='report-week'||action==='report-month'){reportKind=action==='report-week'?'week':'month';render();}
    if(action==='report-prev'||action==='report-next'){const step=action==='report-prev'?-1:1;const next=reportKind==='week'?addDays(reportDate,step*7):moveMonth(reportDate,step);if(validDate(next)){reportDate=next;render();}}
    if(action==='export-json'){
      if(storageFailed)throw new Error('原始数据无法读取，请先导出原始浏览器数据或恢复备份。');
      download(backup(state),`眠记备份-${today()}.json`,'application/json');
      const next={...state,lastBackupAt:new Date().toISOString()};persist(next,'备份已生成，请确认文件已保存。',true);
    }
    if(action==='export-csv'){download(exportCsv(state),`眠记明细-${today()}.csv`,'text/csv;charset=utf-8');toast('CSV 明细已生成。');}
    if(action==='import')document.querySelector('#import-file').click();
    if(action==='commit-import'&&importPreview){
      const result=storageFailed?{state:importPreview,report:{added:importPreview.records.length,skipped:0,conflicts:[]}}:mergeBackup(state,importPreview);
      if(storageFailed){
        writeState(result.state);storageFailed=false;state=result.state;render();
      }else if(!persist(result.state))return;
      importDialog.close();importPreview=null;
      toast(`合并完成：新增 ${result.report.added} 条，跳过 ${result.report.skipped} 条，冲突 ${result.report.conflicts.length} 条。`);
    }
    if(action==='export-raw'){download(localStorage.getItem('sleeping-table:v1')||'','眠记原始数据.txt','text/plain');}
    if(action==='recover-empty'&&await ask('创建新的空白手账？','这会替换浏览器中的原始数据。请先导出原始数据或确认已有备份。','替换为空白手账',true)){const next=createState();writeState(next);state=next;storageFailed=false;render();toast('空白手账已创建。');}
    if(action==='install'&&installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;render();}
    if(action==='update'&&waitingWorker&&await ask('更新应用？','请先保存正在编辑的记录。更新会重新加载页面，已保存数据会保留。','更新'))waitingWorker.postMessage('SKIP_WAITING');
  }catch(error){toast(error.message||'操作未完成，请重试。');}
});

document.addEventListener('change',async event=>{
  const target=event.target;
  if(target.id==='selected-date'&&validDate(target.value)&&target.value<=today()){selectedDate=target.value;render();}
  if(target.id==='report-date'&&validDate(target.value)){reportDate=target.value;render();}
  if(target.id==='import-file'&&target.files[0]){
    try{
      if(target.files[0].size>20*1024*1024)throw new Error('备份文件不能超过 20 MB。');
      showImport(parseBackup(await target.files[0].text()));
    }catch(error){toast(error.message);}finally{target.value='';}
  }
});

document.addEventListener('submit',async event=>{
  const form=event.target;if(!['goal-form','start-form'].includes(form.id))return;event.preventDefault();
  try{
    if(form.id==='goal-form'){
      const minutes=Number(form.elements.hours.value)*60;
      const rounded=Math.round(minutes);
      let next=setGoal(state,form.elements.effectiveDate.value,rounded);
      if(state.goals.some(g=>g.effectiveDate===form.elements.effectiveDate.value)&&!(await ask('更新已有目标？','同一生效日期已有目标，替换后该段历史达标情况会重新计算。','更新目标')))return;
      next=setGoal(state,form.elements.effectiveDate.value,rounded);
      persist(next,'目标已保存，历史按生效日期计算。');
    }else{
      const date=form.elements.startDate.value;
      if(!validDate(date)||date>today())throw new Error('开始日期必须为今天或更早。');
      if(date>state.startDate&&!(await ask('缩小记录范围？','开始日期之前的数据会保留，但不再参与统计；这些日期的完整确认将撤销。','保存范围')))return;
      const next=structuredClone(state);next.startDate=date;
      for(const existingDate of Object.keys(next.confirmations))if(existingDate<date)delete next.confirmations[existingDate];
      persist(next,'开始记录日期已更新。');
    }
  }catch(error){form.querySelector('.form-error').textContent=error.message;}
});

window.addEventListener('storage',event=>{
  if(event.key==='sleeping-table:v1'){
    try{state=readState();storageFailed=false;undo=null;render();toast('已同步当前浏览器另一页面的修改。');}
    catch{storageFailed=true;render();toast('另一页面的数据无法读取，请导出备份后恢复。');}
  }
});
window.addEventListener('online',render);window.addEventListener('offline',render);
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;render();});
let lastToday=today();setInterval(()=>{const current=today();if(current!==lastToday){if(selectedDate===lastToday)selectedDate=current;lastToday=current;render();}},30000);

try{state=readState();writeState(state);}catch{state=createState();storageFailed=true;}
render();
if('serviceWorker' in navigator&&window.isSecureContext){
  navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname}).then(registration=>{
    if(registration.waiting){waitingWorker=registration.waiting;render();}
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){waitingWorker=worker;render();}});
    });
    navigator.serviceWorker.ready.then(()=>{offlineReady=true;render();});
  }).catch(()=>{if(page==='settings'){document.querySelector('#offline-status').textContent='离线资源准备失败，请保持联网并重新加载。';}});
  let updating=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(waitingWorker&&!updating){updating=true;location.reload();}});
}
