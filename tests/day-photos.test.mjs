import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(read('assets/day-photos-core.js'), ctx);
const core = ctx.UNHARU_PHOTOS_CORE;
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const date = '2026-11-12', jpeg = new Blob(['fake-image'], {type:'image/jpeg'});
function harness() {
  const rows = new Map(), calls = [];
  let owner = a, failure, downloadFailure, delayed;
  const client = {storage:{from(bucket){
    assert.equal(bucket, core.BUCKET);
    return {
      async list(prefix, options) {
        calls.push(['list', prefix, options]);
        if (delayed) await delayed;
        if (failure) return {error:failure};
        return {data:[...rows.keys()].filter(path=>path.startsWith(prefix+'/')).sort().slice(options.offset,options.offset+options.limit).map(path=>({id:path,name:path.split('/').at(-1)}))};
      },
      async upload(path, blob, options) {
        calls.push(['upload',path,options]);
        if (failure) return {error:failure};
        if (rows.has(path)) return {error:{statusCode:'409'}};
        rows.set(path,blob);return {data:{path}};
      },
      async download(path) { calls.push(['download',path]); if(downloadFailure)return {error:downloadFailure};return rows.has(path)?{data:rows.get(path)}:{error:{statusCode:'404'}}; },
      async remove(paths) { calls.push(['remove',...paths]);if(failure)return {error:failure};const found=rows.delete(paths[0]);return {data:found?[{name:paths[0]}]:[]}; }
    };
  }}};
  const store = core.createStore(client, ()=>owner);
  return {rows,calls,store,login:value=>owner=value,fail:error=>failure=error,failDownload:error=>downloadFailure=error,delay:promise=>delayed=promise};
}
test('date and owner validation reject traversal and invalid calendar dates',()=>{
  for(const day of ['2026-02-29','2026-11-31','../../other','2026-1-01','']) assert.equal(core.validDate(day),false);
  assert.equal(core.validDate('2028-02-29'),true);
  assert.throws(()=>core.folder('../other',date));
  assert.equal(core.folder(a,date),`${a}/${date}`);
});
test('photo selection accepts camera images but rejects executable, empty and oversized files',()=>{
  for(const type of ['image/jpeg','image/png','image/webp','image/heic','image/heif'])assert.equal(core.validateFile({type,size:100,name:'photo'}),true);
  assert.equal(core.validateFile({type:'',size:100,name:'camera.HEIC'}),true);
  for(const file of [{type:'image/svg+xml',size:1},{type:'text/html',size:1},{type:'image/jpeg',size:0},{type:'image/png',size:core.MAX_FILE+1}])assert.throws(()=>core.validateFile(file));
});
test('upload creates a unique per-account per-date object without touching record arrays',async()=>{
  const h=harness();await h.store.scope(date).upload(jpeg,id);
  assert.equal(h.rows.size,1);assert.ok(h.rows.has(`${a}/${date}/${id}.jpg`));
  const options=h.calls.find(call=>call[0]==='upload')[2];assert.equal(options.upsert,false);assert.equal(options.contentType,'image/jpeg');
});
test('a second device adds to the same day without overwriting the first image',async()=>{
  const h=harness(), first=h.store.scope(date), second=h.store.scope(date);
  await first.upload(jpeg,id);await second.upload(jpeg,b);
  assert.equal((await first.list()).photos.length,2);
});
test('same image retried after a lost response reconciles without duplicates',async()=>{
  const h=harness(), scope=h.store.scope(date);await scope.upload(jpeg,id);await scope.upload(jpeg,id);
  assert.equal(h.rows.size,1);
  await assert.rejects(scope.upload(new Blob(['other-data'],{type:'image/jpeg'}),id));
  assert.equal(await h.rows.values().next().value.text(),'fake-image');
});
test('list pagination and date/account separation do not truncate later photos',async()=>{
  const h=harness();
  for(let i=0;i<25;i++)h.rows.set(`${a}/${date}/${String(i).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`,jpeg);
  h.rows.set(`${b}/${date}/${id}.jpg`,jpeg);h.rows.set(`${a}/2026-11-13/${id}.jpg`,jpeg);
  const scope=h.store.scope(date), first=await scope.list(), second=await scope.list(first.nextOffset);
  assert.equal(first.photos.length,24);assert.equal(first.hasMore,true);assert.equal(second.photos.length,1);assert.equal(second.hasMore,false);
});
test('account change during list discards late responses; stale writes never begin',async()=>{
  const h=harness();let finish;h.delay(new Promise(resolve=>finish=resolve));
  const scope=h.store.scope(date), pending=scope.list();h.login(b);finish();
  await assert.rejects(pending,error=>error.code==='STALE');
  await assert.rejects(scope.upload(jpeg,id),error=>error.code==='STALE');
  await assert.rejects(scope.remove(id+'.jpg'),error=>error.code==='STALE');
  assert.equal(h.calls.some(call=>call[0]==='upload'||call[0]==='remove'),false);
});
test('failed list and download do not become empty success',async()=>{
  const h=harness();h.fail({statusCode:'403'});await assert.rejects(h.store.scope(date).list());
  h.failDownload({statusCode:'500'});await assert.rejects(h.store.scope(date).download(id+'.jpg'));
});
test('delete requires an owned safe path and confirmed server result',async()=>{
  const h=harness(), scope=h.store.scope(date);await scope.upload(jpeg,id);
  await assert.rejects(scope.remove(`../${b}/${id}.jpg`));assert.equal(h.rows.size,1);
  h.fail({statusCode:'503'});await assert.rejects(scope.remove(id+'.jpg'));assert.equal(h.rows.size,1);
  h.fail(null);await scope.remove(id+'.jpg');assert.equal(h.rows.size,0);
  await assert.rejects(scope.remove(id+'.jpg'),error=>error.code==='REMOVE');
});
test('only compressed JPEGs reach account storage and unsupported files never upload',async()=>{
  const h=harness();await assert.rejects(h.store.scope(date).upload(new Blob(['png'],{type:'image/png'}),id));
  await assert.rejects(h.store.scope(date).upload({size:core.MAX_STORED+1,type:'image/jpeg'},id));
  assert.equal(h.calls.length,0);
});
test('storage errors never display provider secrets or arbitrary messages',()=>{
  const text=core.message({message:'secret-token',statusCode:'403'});assert.ok(!text.includes('secret-token'));assert.match(text,/연결|설정/);
});
test('private storage setup grants only own read/add/delete and blocks broad-policy bypass',()=>{
  const sql=read('docs/day-photos-setup.sql');
  assert.match(sql,/false, 4194304, array\['image\/jpeg'\]/);
  assert.match(sql,/as restrictive for all to authenticated/);assert.match(sql,/as restrictive for all to anon/);
  assert.match(sql,/as restrictive for update to authenticated/);assert.match(sql,/auth\.uid\(\)/);
  assert.doesNotMatch(sql,/service_role|security definer|drop table|dayflow_user_state/i);
});
test('photo UI is isolated from shared records, uses private downloads, and preview stays local',()=>{
  const ui=read('assets/day-photos.js'), html=read('index.html');
  assert.match(html,/assets\/day-photos\.js/);assert.match(ui,/capture="environment"/);assert.match(ui,/multiple hidden/);
  assert.match(ui,/canvas\.toBlob/);assert.match(ui,/URL\.revokeObjectURL/);assert.match(ui,/onAuthStateChange/);
  assert.match(ui,/testMode \? previewClient\(\) : window\.DAYFLOW_SUPABASE_CLIENT/);
  assert.match(ui,/!picking/);assert.doesNotMatch(ui,/window\.addEventListener\('focus'/);
  assert.doesNotMatch(ui,/getPublicUrl|createSignedUrl|localStorage|\.rpc\(|\.from\('dayflow_user_state'\)/);
  for(const file of ['assets/day-photos-core.js','assets/day-photos.js','assets/date-entry.js'])assert.doesNotThrow(()=>new vm.Script(read(file)));
});
