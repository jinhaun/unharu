(function(){
 'use strict';
 const q=id=>document.getElementById(id),core=window.UNHARU_SHARING_CORE,api=window.DAYFLOW_SHARING;
 const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const section=make('section');section.id='sharing-favorites';section.setAttribute('aria-labelledby','sharing-favorites-title');
 const title=make('h3','공유 일정 즐겨찾기');title.id='sharing-favorites-title';
 const help=make('p','위 이메일에 이름을 붙여 저장하세요. 이름을 누르면 연결된 이메일의 공유 일정을 조회합니다. 일정을 조회해 본 이메일은 자동으로 저장됩니다. 이름은 나에게만 보이며 내 계정에 저장되어 휴대폰·컴퓨터 어디서나 같이 보입니다.');
 const label=make('label','즐겨찾기 이름 (선택)');label.setAttribute('for','favorite-name');
 const nickname=make('input');nickname.id='favorite-name';nickname.type='text';nickname.maxLength=40;nickname.placeholder='예: 누나, 친구, 동료';nickname.setAttribute('aria-describedby','favorite-name-help favorite-status');
 const nameHelp=make('small','이름을 비워두면 이메일로 표시합니다. 최대 40자이며 로그인한 다른 기기에도 같이 보입니다.');nameHelp.id='favorite-name-help';
 const add=make('button','즐겨찾기 저장');add.type='button';add.id='favorite-add';
 const status=make('p');status.id='favorite-status';status.setAttribute('role','status');
 const list=make('div');list.id='favorite-list';
 section.append(title,help,label,nickname,nameHelp,add,status,list);q('lookup-form').after(section);
 let owner='',values=[],readable=true;
 const key=()=> 'unharu-shared-favorites-v2:'+owner;
 const legacyKey=()=> 'unharu-shared-favorites-v1:'+owner;
 const note=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
 const currentEntry=()=>values.find(value=>value.email===core.email(q('lookup-email').value));
 function render(){
  list.replaceChildren();
  const current=core.email(q('lookup-email').value),existing=currentEntry(),name=nickname.value.trim();
  add.disabled=!owner||!readable||!current||(existing&&existing.name===name);
  add.textContent=existing?'이름 저장':'즐겨찾기 저장';
  nickname.disabled=!owner||!readable;
  if(!readable){list.append(make('p','즐겨찾기 목록을 불러올 수 없습니다.'));return;}
  if(!values.length){list.append(make('p',owner?'아직 저장한 즐겨찾기가 없습니다.':'Google 로그인 후 이용할 수 있습니다.'));return;}
  const renderedOwner=owner;
  const sameOwner=()=>renderedOwner===owner&&owner===api.account();
  values.forEach(entry=>{
   const {email,name}=entry,displayName=name||email;
   const row=make('div');row.className='favorite-row';
   const open=make('button',displayName);open.type='button';open.className='favorite-email';open.setAttribute('aria-label',displayName+(name?' ('+email+')':'')+' 공유 일정 보기');
   if(name)open.append(make('small',email));
   open.addEventListener('click',()=>{if(!sameOwner())return;nickname.value=name;api.lookup(email);render();});
   const rename=make('button','이름 변경');rename.type='button';rename.setAttribute('aria-label',displayName+' 이름 변경');
   rename.addEventListener('click',()=>{
    if(!sameOwner())return;
    q('lookup-email').value=email;q('lookup-email').dispatchEvent(new Event('input',{bubbles:true}));
    nickname.value=name;note('이름을 입력한 뒤 ‘이름 저장’을 눌러 주세요.');render();nickname.focus();
   });
   const remove=make('button','삭제');remove.type='button';remove.setAttribute('aria-label',displayName+' 즐겨찾기 삭제');
   remove.addEventListener('click',()=>{if(!sameOwner())return;change(list=>list.filter(value=>value.email!==email),'즐겨찾기에서 삭제했습니다. 공유 일정 자체는 삭제되지 않습니다.');});
   row.append(open,rename,remove);list.append(row);
  });
 }
 function parse(stored,legacy){
  if(!Array.isArray(stored)||stored.length>20)throw Error('invalid favorites');
  const next=[];
  for(const value of stored){
   const email=core.email(legacy&&typeof value==='string'?value:value?.email);
   const name=legacy&&typeof value==='string'?'':value?.name;
   if(!email||typeof name!=='string'||name.length>40)throw Error('invalid favorite');
   if(!next.some(entry=>entry.email===email))next.push({email,name:name.trim()});
  }
  return next;
 }
 function load(){
  owner=api.account();values=[];readable=true;nickname.value='';note('');
  if(owner)try{
   const raw=localStorage.getItem(key()),legacy=raw===null;
   const storedRaw=legacy?localStorage.getItem(legacyKey()):raw;
   values=parse(storedRaw===null?[]:JSON.parse(storedRaw),legacy);nickname.value=currentEntry()?.name||'';
  }catch{readable=false;note('저장된 즐겨찾기를 읽지 못했습니다. 기존 내용을 보호하기 위해 추가·삭제를 멈췄습니다.',true);}
  render();
  syncFromAccount();
 }
 const LIMIT='즐겨찾기는 최대 20개까지 저장할 수 있습니다. 필요 없는 이메일을 먼저 삭제해 주세요.';
 function write(next,message){
  if(!owner||owner!==api.account()||!readable)return;
  if(next.length>20){note(LIMIT,true);return;}
  try{localStorage.setItem(key(),JSON.stringify(next));values=next;note(message);render();}
  catch{note('즐겨찾기를 저장하지 못했습니다. 브라우저의 저장 공간 설정을 확인해 주세요.',true);}
 }

 // 로그인한 경우 즐겨찾기는 내 계정(Google 로그인 정보의 개인 메모 칸)에 저장해, 휴대폰·컴퓨터 어디서나 같은 목록을 봅니다.
 // 이 브라우저에도 사본을 남겨 두어 계정을 읽기 전에도 바로 보입니다.
 const cloud=()=>window.DAYFLOW_SUPABASE_CLIENT||null;
 const ACCOUNT_FIELD='unharu_shared_favorites';
 const cacheLocal=next=>{try{localStorage.setItem(key(),JSON.stringify(next));}catch{}};
 // 계정에 저장된 목록. 아직 한 번도 저장한 적이 없으면 null.
 async function accountList(who){
  const {data,error}=await cloud().auth.getUser();
  if(error||!data?.user||data.user.id!==who)throw error||Error('account changed');
  const raw=data.user.user_metadata?.[ACCOUNT_FIELD];
  return raw===undefined||raw===null?null:parse(raw,false);
 }
 async function saveAccount(next){
  const {error}=await cloud().auth.updateUser({data:{[ACCOUNT_FIELD]:next}});
  if(error)throw error;
 }
 async function syncFromAccount(){
  const who=owner;
  if(!cloud()||!who||!readable)return;
  try{
   const remote=await accountList(who);
   if(who!==owner||who!==api.account())return;
   // 처음 한 번은 이 브라우저에 있던 즐겨찾기를 계정으로 옮깁니다.
   if(remote===null){if(values.length)await saveAccount(values);return;}
   values=remote;cacheLocal(remote);nickname.value=currentEntry()?.name||nickname.value;render();
  }catch{}
 }
 // op(목록) → 바뀐 목록. 다른 기기에서 그사이 바꾼 내용을 지우지 않도록, 계정의 최신 목록에 바꿀 점만 적용합니다.
 function change(op,message){
  if(!owner||owner!==api.account()||!readable)return;
  if(!cloud()){write(op(values),message);return;}
  const who=owner;
  note('내 계정에 저장하고 있습니다…');
  (async()=>{
   try{
    const next=op((await accountList(who))??values);
    if(who!==owner)return;
    if(next.length>20){note(LIMIT,true);render();return;}
    await saveAccount(next);
    if(who!==owner)return;
    values=next;cacheLocal(next);note(message);render();
   }catch{if(who===owner){note('즐겨찾기를 계정에 저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',true);render();}}
  })();
 }
 add.addEventListener('click',()=>{
  const email=core.email(q('lookup-email').value),name=nickname.value.trim();
  if(!email){note('올바른 이메일을 입력해 주세요.',true);return;}
  if(name.length>40){note('이름은 40자 이내로 입력해 주세요.',true);nickname.focus();return;}
  const existing=currentEntry();
  if(existing&&existing.name===name){note('이미 같은 이름으로 저장되어 있습니다.');return;}
  const put=list=>list.some(value=>value.email===email)?list.map(value=>value.email===email?{email,name}:value):[...list,{email,name}];
  change(put,existing?'즐겨찾기 이름을 저장했습니다. 연결된 이메일은 그대로입니다.':'즐겨찾기에 저장했습니다. 이름을 누르면 연결된 이메일로 조회합니다.');
 });
 q('lookup-email').addEventListener('input',()=>{nickname.value=currentEntry()?.name||'';render();});
 nickname.addEventListener('input',render);
 q('lookup-clear').addEventListener('click',()=>{nickname.value='';render();});
 window.addEventListener('dayflow-sharing-account-change',load);
 // 다른 사람의 공유 일정을 조회해서 보였다면, 그 이메일을 즐겨찾기에 자동으로 기억합니다(이미 있거나 20개가 차 있으면 그대로 둠).
 window.addEventListener('dayflow-shared-lookup-found',event=>{
  const email=core.email(event?.detail?.email);
  if(!email||!owner||!readable||values.some(value=>value.email===email)||values.length>=20)return;
  change(list=>list.some(value=>value.email===email)||list.length>=20?list:[...list,{email,name:''}],'조회한 이메일을 즐겨찾기에 기억했습니다. ‘이름 변경’으로 이름을 붙일 수 있습니다.');
 });
 window.addEventListener('focus',()=>syncFromAccount());
 window.addEventListener('storage',event=>{if(event.key===key()||event.key===legacyKey()||event.key===null)load();});
 load();
})();
