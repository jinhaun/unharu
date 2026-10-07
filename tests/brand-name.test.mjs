import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('visible service name is consistently 나다운하루',()=>{
 const html=read('index.html');
 assert.match(html,/<title>나다운하루 \|/);
 assert.match(html,/<div class="brand">나다운<em>하루<\/em>/);
 for(const file of ['index.html','README.md','assets/dayflow-auth.js','assets/email-publish.js','assets/email-sharing.js','assets/sharing-core.js','assets/sharing.js','assets/transit.js'])assert.doesNotMatch(read(file),/(?<!나다)운하루/,file);
});
test('branding does not change auth behavior, storage keys or public address',()=>{
 const auth=read('assets/dayflow-auth.js'),baseline=read('tests/baselines/v44/dayflow-auth.js');
 assert.equal(auth.replaceAll('나다운하루','운하루'),baseline);
 assert.match(auth,/https:\/\/unharu\.vercel\.app\//);
 const html=read('index.html'),prior=read('tests/baselines/v35/index.html');
 for(const key of ['STORAGE_KEY','ROUTE_STORAGE_KEY','LEGACY_STORAGE_KEYS']){
  const pattern=new RegExp(`const ${key}\\s*=([^;]+);`);assert.equal(html.match(pattern)?.[1],prior.match(pattern)?.[1]);
 }
});
