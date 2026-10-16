// Injected by the loopback-only preview server for its explicit test URL only.
// Does not request, register, change or store any real account/sharing data.
(function(){
 if(!['127.0.0.1','localhost'].includes(location.hostname)||new URL(location.href).searchParams.get('test')!=='favorite-names-v56')return;
 const range=window.UNHARU_SHARING_CORE.twoWeekRange();
 const date=days=>{const d=new Date(range.start+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
 const rows=[
  {date:date(3),time:'18:30',title:'가상 예시 · 저녁 약속',notes:'역 앞에서 만나기'},
  {date:date(5),time:'10:00',title:'가상 예시 · 주말 산책',notes:'편한 신발 준비'},
  {date:date(8),time:'19:00',title:'가상 예시 · 스터디',notes:'발표 내용 같이 확인'},
  {date:date(14),time:'12:00',title:'범위 밖 검사용',notes:'화면에 보이면 안 됩니다.'}
 ].map((r,i)=>({...r,owner_id:'fixture-owner',event_id:'fixture-'+i}));
 window.DAYFLOW_CLOUD={ready:()=>true,flush:async()=>false};
 window.DAYFLOW_SUPABASE_CLIENT={
  auth:{getSession:async()=>({data:{session:{user:{id:'fixture-viewer-v56'}}}}),onAuthStateChange:()=>{}},
  from:()=>({select:()=>({eq:async()=>({data:[]})})}),
  rpc:async(name,args)=>name==='dayflow_lookup_calendar'&&args.p_email==='sister@example.invalid'?{data:rows}:{data:null,error:{code:'LOCAL_FIXTURE_ONLY'}}
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const notice=document.createElement('p');notice.className='sharing-range';
  notice.textContent='가상 자료 미리보기 · 실제 계정과 연결하지 않았습니다. sister@example.invalid를 조회해 보세요.';
  document.querySelector('#sharing-inbox .sharing-body').prepend(notice);
 });
})();
