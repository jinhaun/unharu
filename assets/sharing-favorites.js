(function(){
 'use strict';
 const q=id=>document.getElementById(id),core=window.UNHARU_SHARING_CORE,api=window.DAYFLOW_SHARING;
 const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const section=make('section');section.id='sharing-favorites';section.setAttribute('aria-labelledby','sharing-favorites-title');
 const title=make('h3','이메일 즐겨찾기');title.id='sharing-favorites-title';
 const help=make('p','같은 기기·브라우저에서 내 로그인 계정별로 보관됩니다. 선택하면 이번 주·다음 주 공유 일정을 다시 조회합니다.');
 const add=make('button','입력한 이메일 즐겨찾기 추가');add.type='button';add.id='favorite-add';
 const status=make('p');status.id='favorite-status';status.setAttribute('role','status');
 const list=make('div');list.id='favorite-list';
 section.append(title,help,add,status,list);q('lookup-form').after(section);
 let owner='',values=[],readable=true;
 const key=()=> 'unharu-shared-favorites-v1:'+owner;
 const note=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
 function render(){
  list.replaceChildren();
  const current=core.email(q('lookup-email').value);
  add.disabled=!owner||!readable||!current||values.includes(current);
  add.textContent=values.includes(current)?'즐겨찾기에 저장된 이메일':'입력한 이메일 즐겨찾기 추가';
  if(!readable){list.append(make('p','즐겨찾기 목록을 불러올 수 없습니다.'));return;}
  if(!values.length){list.append(make('p',owner?'아직 저장한 즐겨찾기가 없습니다.':'Google 로그인 후 이용할 수 있습니다.'));return;}
  const renderedOwner=owner;
  values.forEach(email=>{
   const row=make('div');row.className='favorite-row';
   const open=make('button',email);open.type='button';open.className='favorite-email';open.setAttribute('aria-label',email+' 공유 일정 보기');
   open.addEventListener('click',()=>{if(renderedOwner!==owner||owner!==api.account())return;api.lookup(email);render();});
   const remove=make('button','삭제');remove.type='button';remove.setAttribute('aria-label',email+' 즐겨찾기 삭제');
   remove.addEventListener('click',()=>{if(renderedOwner!==owner||owner!==api.account())return;write(values.filter(value=>value!==email),'즐겨찾기에서 삭제했습니다. 공유 일정 자체는 삭제되지 않습니다.');});
   row.append(open,remove);list.append(row);
  });
 }
 function load(){
  owner=api.account();values=[];readable=true;note('');
  if(owner)try{
   const raw=localStorage.getItem(key()),stored=raw===null?[]:JSON.parse(raw);
   if(!Array.isArray(stored)||stored.length>20||stored.some(value=>typeof value!=='string'||!core.email(value)))throw Error('invalid favorites');
   values=[...new Set(stored.map(core.email))];
  }catch{readable=false;note('저장된 즐겨찾기를 읽지 못했습니다. 기존 내용을 보호하기 위해 추가·삭제를 멈췄습니다.',true);}
  render();
 }
 function write(next,message){
  if(!owner||owner!==api.account()||!readable)return;
  if(next.length>20){note('즐겨찾기는 최대 20개까지 저장할 수 있습니다. 필요 없는 이메일을 먼저 삭제해 주세요.',true);return;}
  try{localStorage.setItem(key(),JSON.stringify(next));values=next;note(message);render();}
  catch{note('즐겨찾기를 저장하지 못했습니다. 브라우저의 저장 공간 설정을 확인해 주세요.',true);}
 }
 add.addEventListener('click',()=>{
  const email=core.email(q('lookup-email').value);
  if(!email){note('올바른 이메일을 입력해 주세요.',true);return;}
  if(values.includes(email)){note('이미 저장한 이메일입니다.');return;}
  write([...values,email],'즐겨찾기에 저장했습니다. 상대방의 공유 여부와 접근 권한은 바뀌지 않습니다.');
 });
 q('lookup-email').addEventListener('input',render);
 q('lookup-clear').addEventListener('click',render);
 window.addEventListener('dayflow-sharing-account-change',load);
 window.addEventListener('storage',event=>{if(event.key===key()||event.key===null)load();});
 load();
})();
