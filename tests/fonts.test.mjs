import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
test('application uses the locally hosted font including form controls',()=>{
 for(const page of ['index.html']){
  const html=read(page);
  assert.match(html,/href="assets\/fonts.css"/);
  assert.match(html,/font(?:-family)?:[^;}]*var\(--app-font\)/);
  assert.doesNotMatch(html,/font(?:-family)?:[^;}]*\b(?:Pretendard|Georgia|Consolas)\b/);
  assert.match(html,/rel="preload"[^>]*NanumSquareR.ttf[^>]*crossorigin/);
 }
 assert.match(read('index.html'),/button,input,textarea,select\s*{\s*font:inherit/);
});
test('four unmodified font weights exist with swap and no external dependency',()=>{
 const css=read('assets/fonts.css');
 assert.equal((css.match(/@font-face/g)||[]).length,4);
 assert.equal((css.match(/font-display: swap/g)||[]).length,4);
 for(const weight of [300,400,700,800])assert.ok(css.includes('font-weight: '+weight));
 assert.doesNotMatch(css,/https?:\/\/|@import/);
 for(const suffix of ['L','R','B','EB']){
  const data=fs.readFileSync(path.join(root,'assets/fonts/NanumSquare'+suffix+'.ttf'));
  assert.equal(data.readUInt32BE(0),0x00010000);
  assert.ok(data.length>500000);
 }
});
test('font redistribution includes attribution and the full open license',()=>{
 const license=read('assets/fonts/OFL.txt');
 for(const text of ['NAVER','SIL OPEN FONT LICENSE','Version 1.1','PERMISSION & CONDITIONS','TERMINATION','DISCLAIMER','NaverNanumSquare.zip'])assert.ok(license.includes(text));
});
