(function(root){
 'use strict';
 const valid=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
 function validate(start,end,unknown){
  if(start&&!valid(start))return '시작 시간을 확인해 주세요.';
  if(unknown)return '';
  if(!valid(start))return '종료 시간을 정하려면 시작 시간도 입력해 주세요.';
  if(!valid(end))return '종료 시간을 입력하거나 ‘잘 모름’을 선택해 주세요.';
  if(end<=start)return '종료 시간은 시작 시간보다 늦어야 합니다. 현재는 같은 날의 시간만 지정할 수 있습니다.';
  return '';
 }
 function format(item,compact=false){
  const start=valid(item.time)?item.time:'';
  if(item.type!=='task')return start;
  if(start&&valid(item.endTime)&&item.endTime>start)return start+'–'+item.endTime;
  if(item.endTimeUnknown===true&&!compact)return (start||'시작 미정')+' · 종료 잘 모름';
  return start;
 }
 function calendarEnd(item){
  if(item.type!=='task')return ['DURATION:PT1H'];
  if(valid(item.time)&&valid(item.endTime)&&item.endTime>item.time)return ['DTEND;TZID=Asia/Seoul:'+item.date.replaceAll('-','')+'T'+item.endTime.replace(':','')+'00'];
  return [];
 }
 root.DAYFLOW_TASK_TIME={validate,format,calendarEnd};
 if(!root.document)return;
 const q=id=>document.getElementById(id);
 function sync(prefix){
  const task=prefix==='quick'?inputMode==='task':q('edit-type').value==='task';
  q(prefix+'-task-times').hidden=!task;
  q(prefix+'-end-time').disabled=!task||q(prefix+'-end-unknown').checked;
 }
 function read(prefix,fallback='',focus=false){
  const start=q(prefix==='quick'?'quick-start-time':'edit-time').value||fallback;
  const unknown=q(prefix+'-end-unknown').checked,end=unknown?'':q(prefix+'-end-time').value;
  const error=validate(start,end,unknown);
  q(prefix+'-time-error').textContent=error;
  const target=q(!valid(start)&&!unknown?(prefix==='quick'?'quick-start-time':'edit-time'):prefix+'-end-time');
  q(prefix+'-end-time').setAttribute('aria-invalid',String(Boolean(error)));
  if(error&&focus)target.focus();
  return error?null:{time:start,endTime:end,endTimeUnknown:unknown};
 }
 root.DAYFLOW_TASK_TIME.prepare=function(item){
  if(item.type!=='task'||inputMode!=='task')return true;
  const values=read('quick',item.time,true);if(!values)return false;
  Object.assign(item,values);return true;
 };
 root.DAYFLOW_TASK_TIME.reset=function(){
  q('quick-start-time').value='';q('quick-end-time').value='';q('quick-end-unknown').checked=true;
  q('quick-time-error').textContent='';q('quick-end-time').setAttribute('aria-invalid','false');sync('quick');
 };
 root.DAYFLOW_TASK_TIME.edit=function(item){
  q('edit-end-time').value=valid(item.endTime)?item.endTime:'';
  q('edit-end-unknown').checked=!valid(item.endTime);
  q('edit-time-error').textContent='';q('edit-end-time').setAttribute('aria-invalid','false');sync('edit');
 };
 root.DAYFLOW_TASK_TIME.readEdit=function(){
  return q('edit-type').value==='task'?read('edit','',true):{endTime:'',endTimeUnknown:false};
 };
 for(const prefix of ['quick','edit']){
  q(prefix+'-end-unknown').addEventListener('change',()=>{sync(prefix);read(prefix);});
  for(const id of [prefix==='quick'?'quick-start-time':'edit-time',prefix+'-end-time']){
   q(id).addEventListener('blur',()=>read(prefix));
   q(id).addEventListener('input',()=>{if(q(prefix+'-time-error').textContent)read(prefix);});
  }
 }
 document.querySelectorAll('.mode-tabs button').forEach(button=>button.addEventListener('click',()=>sync('quick')));
 q('edit-type').addEventListener('change',()=>sync('edit'));
 sync('quick');sync('edit');
})(typeof window!=='undefined'?window:globalThis);
