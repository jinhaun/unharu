(function(root){
  'use strict';
  const canShare=item=>Boolean(item&&['task','meeting'].includes(item.type)&&typeof item.id==='string'&&item.id.length>0&&item.id.length<=200);
  function normalize(row){
    if(!row||typeof row.owner_id!=='string'||typeof row.event_id!=='string')return null;
    const date=typeof row.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)?row.date:'';
    const time=typeof row.time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)?row.time:'';
    return {id:'shared:'+row.owner_id+':'+row.event_id,type:'shared',title:String(row.title??''),date,time,notes:String(row.notes??''),review:false};
  }
  function email(value){const clean=String(value).trim().toLowerCase();return clean.length<=320&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)?clean:null;}
  function errorText(error){
    if(error?.code==='P0002')return '등록된 Google 계정을 찾지 못했습니다. 상대방이 운하루에 Google 로그인을 한 번 완료했는지, 이메일이 정확한지 확인해 주세요.';
    if(error?.code==='22023')return '본인 계정이 아닌 올바른 Google 이메일인지, 등록 인원이 100명을 넘지 않았는지 확인해 주세요.';
    if(error?.code==='42501')return '공유 권한을 확인하지 못했습니다. 로그인과 선택한 일정·등록 대상을 확인해 주세요.';
    return '공유 정보를 확인하지 못했습니다. 인터넷 연결 후 새로고침해 주세요. 변경이 반영됐는지 확인하기 전에는 완료로 처리하지 않습니다.';
  }
  root.UNHARU_SHARING_CORE={canShare,normalize,email,errorText};
})(typeof window!=='undefined'?window:globalThis);
