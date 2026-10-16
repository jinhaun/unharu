import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const choices=['pretendard','nanum-square-neo','suit','wanted-sans','noto-sans-kr'];
test('five optional fonts are hosted locally with their licenses',()=>{
 const css=read('assets/font-choices.css');
 assert.doesNotMatch(css,/https?:\/\/|@import/);
 for(const file of ['pretendard/PretendardVariable.woff2','nanum-square-neo/NanumSquareNeoTTF-bRg.woff2','nanum-square-neo/NanumSquareNeoTTF-eHv.woff2','suit/SUIT-Variable.woff2','wanted-sans/WantedSansVariable.woff2']){
  assert.ok(css.includes('./fonts/choices/'+file));
  const data=fs.readFileSync(path.join(root,'assets/fonts/choices',file));
  assert.equal(data.toString('latin1',0,4),'wOF2');
 }
 const noto=read('assets/fonts/choices/noto-sans-kr/wght.css');
 assert.doesNotMatch(noto,/https?:\/\//);
 for(const [,file] of noto.matchAll(/url\(\.\/(files\/[^)]+\.woff2)\)/g))assert.ok(fs.existsSync(path.join(root,'assets/fonts/choices/noto-sans-kr',file)),file);
 for(const license of ['pretendard/LICENSE.txt','nanum-square-neo/NOTICE.txt','suit/LICENSE','wanted-sans/OFL.txt','noto-sans-kr/LICENSE'])assert.match(read('assets/fonts/choices/'+license),/Open Font License/i);
});
test('each choice overrides only the app font variable and keeps NanumSquare as default',()=>{
 const css=read('assets/font-choices.css');
 for(const id of choices)assert.match(css,new RegExp(`:root\\[data-font="${id}"\\] \\{ --app-font:`));
 assert.match(read('assets/fonts.css'),/--app-font: "NanumSquare"/);
});
test('font menu, styles and script are wired into the page after auth',()=>{
 const html=read('index.html');
 assert.match(html,/href="assets\/font-choices.css"/);
 assert.match(html,/href="assets\/fonts\/choices\/noto-sans-kr\/wght.css"/);
 assert.match(html,/<button type="button" id="font-menu">/);
 assert.ok(html.indexOf('assets/dayflow-auth.js')<html.indexOf('assets/font-choice.js'));
});
test('choice is saved per account in the profile and cached per account in the browser',()=>{
 const js=read('assets/font-choice.js');
 assert.match(js,/updateUser\(\{ data: \{ unharu_font: choice \} \}\)/);
 assert.match(js,/user_metadata\?\.unharu_font/);
 assert.match(js,/'unharu-font-v1:' \+ \(id \|\|/);
 for(const id of choices)assert.ok(js.includes(`id: '${id}'`));
});
