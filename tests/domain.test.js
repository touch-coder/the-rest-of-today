import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, today, validDate, weekRange, monthRange, duration, saveRecord, deleteRecord, dayStatus, confirmDay, setGoal, goalForDate, summarize, backup, parseBackup, mergeBackup, exportCsv, validateState } from '../src/domain.js';

const NOW = new Date('2026-10-10T04:00:00Z');
const initial = () => ({ ...createState(NOW), startDate: '2026-10-04' });
const night = (date, id=date, startHour='23:00', endHour='07:00') => {
  const previous=new Date(`${date}T00:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);
  return { id, type:'night', start:`${previous.toISOString().slice(0,10)}T${startHour}`, end:`${date}T${endHour}`, note:'' };
};
const nap = date => ({ id:'nap-'+date,type:'nap',start:`${date}T12:30`,end:`${date}T13:00`,note:'' });

test('Beijing day, calendar validation, Sunday-based weeks and leap months',()=>{
  assert.equal(today(new Date('2026-10-09T16:00:00Z')),'2026-10-10');
  assert.equal(validDate('2026-02-29'),false);
  assert.equal(validDate('2024-02-29'),true);
  assert.deepEqual(weekRange('2026-10-10'),{start:'2026-10-04',end:'2026-10-10'});
  assert.deepEqual(monthRange('2024-02-20'),{start:'2024-02-01',end:'2024-02-29'});
});

test('cross-midnight sleep belongs to wake date and counts elapsed time',()=>{
  const record=night('2026-10-09');
  assert.equal(duration(record),480);
  const state=saveRecord(initial(),record);
  assert.equal(dayStatus(state,'2026-10-08','2026-10-10'),'missing');
  assert.equal(dayStatus(state,'2026-10-09','2026-10-10'),'pending');
});

test('one record per type per wake day; adjacent permitted, overlapping and invalid times rejected',()=>{
  let state=saveRecord(initial(),night('2026-10-09'));
  assert.throws(()=>saveRecord(state,night('2026-10-09','second')),/已有一段/);
  state=saveRecord(state,nap('2026-10-09'));
  state=saveRecord(state,{id:'extra',type:'extra',start:'2026-10-09T13:00',end:'2026-10-09T14:00',note:''});
  assert.equal(state.records.length,3);
  assert.throws(()=>saveRecord(state,{id:'other',type:'extra',start:'2026-10-08T22:30',end:'2026-10-08T23:30',note:''}),/重叠/);
  assert.throws(()=>saveRecord(initial(),{...nap('2026-10-09'),end:'2026-10-09T12:00'}),/晚于/);
  assert.throws(()=>saveRecord(initial(),{...night('2026-10-09'),end:'2026-10-10T07:00'}),/24 小时/);
  assert.throws(()=>saveRecord(initial(),{...nap('2026-10-09'),start:'2026-10-09T25:30'}),/有效的时间/);
});

test('nap-only is missing; explicit zero is sole exception; edit/delete revoke confirmations',()=>{
  let state=saveRecord(initial(),nap('2026-10-09'));
  assert.equal(dayStatus(state,'2026-10-09','2026-10-10'),'missing');
  assert.throws(()=>confirmDay(state,'2026-10-09',false,'2026-10-10'),/缺少夜间/);
  assert.throws(()=>confirmDay(state,'2026-10-09',true,'2026-10-10'),/删除/);
  state=saveRecord(state,night('2026-10-09'));
  state=confirmDay(state,'2026-10-09',false,'2026-10-10');
  assert.equal(dayStatus(state,'2026-10-09','2026-10-10'),'complete');
  state=saveRecord(state,{...nap('2026-10-09'),note:'edited'});
  assert.equal(dayStatus(state,'2026-10-09','2026-10-10'),'pending');
  state=confirmDay(state,'2026-10-09',false,'2026-10-10');
  state=deleteRecord(state,'2026-10-09');
  assert.equal(dayStatus(state,'2026-10-09','2026-10-10'),'missing');
  state=confirmDay(state,'2026-10-08',true,'2026-10-10');
  assert.equal(dayStatus(state,'2026-10-08','2026-10-10'),'zero');
  state=saveRecord(state,night('2026-10-08'));
  assert.equal(dayStatus(state,'2026-10-08','2026-10-10'),'pending');
});

test('formal statistics exclude missing/pending but include explicit zero, clip today and start date',()=>{
  let state=saveRecord(initial(),night('2026-10-04'));
  state=confirmDay(state,'2026-10-04',false,'2026-10-10');
  state=confirmDay(state,'2026-10-05',true,'2026-10-10');
  state=saveRecord(state,night('2026-10-06'));
  state=saveRecord(state,nap('2026-10-07'));
  const stats=summarize(state,weekRange('2026-10-10'),'2026-10-10');
  assert.equal(stats.days,7);assert.equal(stats.confirmed,2);assert.equal(stats.pending,1);assert.equal(stats.missing,4);
  assert.equal(stats.total,480);assert.equal(stats.average,240);assert.equal(stats.achievementRate,.5);assert.equal(stats.completionRate,2/7);
  assert.equal(stats.totals.nap,0);assert.equal(stats.difference,-480);
  assert.equal(summarize(state,weekRange('2026-10-04'),'2026-10-06').days,3);
  assert.equal(summarize({...state,startDate:'2026-10-08'},weekRange('2026-10-10'),'2026-10-10').days,3);
  const empty=summarize(state,weekRange('2026-10-17'),'2026-10-10');
  assert.equal(empty.days,0);assert.equal(empty.average,null);assert.equal(empty.completionRate,null);
});

test('goal history applies on effective dates; historical baseline remains 8h',()=>{
  let state=setGoal(initial(),'2026-10-06',450);
  assert.equal(goalForDate(state,'2026-10-05'),480);
  assert.equal(goalForDate(state,'2026-10-06'),450);
  state=setGoal(state,'2026-10-06',420);
  assert.equal(state.goals.length,2);assert.equal(goalForDate(state,'2026-10-07'),420);
  assert.throws(()=>setGoal(state,'2026-10-06',0));
});

test('night sleep near midnight is continuous and insufficient rhythm samples are marked',()=>{
  let state=saveRecord(initial(),night('2026-10-04','a','23:50','07:00'));
  state=confirmDay(state,'2026-10-04',false,'2026-10-10');
  let stats=summarize(state,weekRange('2026-10-10'),'2026-10-10');
  assert.equal(stats.sleep.spread,null);
  state=saveRecord(state,{id:'b',type:'night',start:'2026-10-05T00:10',end:'2026-10-05T07:00',note:''});
  state=confirmDay(state,'2026-10-05',false,'2026-10-10');
  stats=summarize(state,weekRange('2026-10-10'),'2026-10-10');
  assert.equal(stats.sleep.mean,0);assert.equal(stats.sleep.spread,10);assert.equal(stats.wake.spread,0);
});

test('backup roundtrip includes confirmations, notes, goals, and rejects malformed data',()=>{
  let state=saveRecord(initial(),{...night('2026-10-09'),note:'中途醒来\n<script>test</script>'});
  state=confirmDay(state,'2026-10-09',false,'2026-10-10');
  state=setGoal(state,'2026-10-10',450);
  const restored=parseBackup(backup(state,NOW));
  assert.deepEqual(restored.records,state.records);assert.deepEqual(restored.confirmations,state.confirmations);assert.deepEqual(restored.goals,state.goals);
  assert.throws(()=>parseBackup('{'),/JSON/);
  assert.throws(()=>parseBackup('{"version":9}'),/备份/);
  assert.throws(()=>validateState({...state,records:[...state.records,...state.records]}),/重复记录 ID/);
  assert.throws(()=>validateState({...state,confirmations:{'2026-10-09':'zero'}}),/不能包含/);
});

test('merge skips same IDs, rejects time/type conflicts and only restores consistent confirmations',()=>{
  let incoming=saveRecord(initial(),night('2026-10-09'));
  incoming=confirmDay(incoming,'2026-10-09',false,'2026-10-10');
  let result=mergeBackup(initial(),incoming);
  assert.equal(result.report.added,1);assert.equal(result.report.confirmations,1);
  result=mergeBackup(result.state,incoming);assert.equal(result.report.skipped,1);assert.equal(result.report.added,0);
  const changed=saveRecord(initial(),{...night('2026-10-09'),end:'2026-10-09T08:00'});
  result=mergeBackup(changed,incoming);assert.equal(result.report.skipped,1);assert.equal(result.report.confirmations,0);assert.equal(dayStatus(result.state,'2026-10-09','2026-10-10'),'pending');
  const conflict=saveRecord(initial(),night('2026-10-09','different-id'));
  result=mergeBackup(conflict,incoming);assert.equal(result.report.conflicts.length,1);assert.equal(result.report.confirmations,0);
  const withAdditional=saveRecord(initial(),nap('2026-10-09'));
  result=mergeBackup(withAdditional,incoming);assert.equal(result.report.added,1);assert.equal(result.report.confirmations,0);
});

test('CSV includes explicit zero and protects spreadsheet formula notes',()=>{
  let state=saveRecord(initial(),{...night('2026-10-09'),note:'=HYPERLINK("test")'});
  state=confirmDay(state,'2026-10-08',true,'2026-10-10');
  const csv=exportCsv(state);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('明确 0 小时'));
});
