import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const css=fs.readFileSync(new URL('../assets/minimal-canal.css',import.meta.url),'utf8');
test('only background strength and date backplates changed; every other public file retained',()=>{
 const current=new URL('../',import.meta.url),previous=new URL('../../unharu-expense-habits-2026-10-08-v68/',import.meta.url);
 function compare(dir){for(const name of fs.readdirSync(new URL(dir,previous))){const rel=dir+name;if(['assets/minimal-canal.css','assets/groups.js','assets/groups.css','assets/certificate-settings.js'].includes(rel))continue;const before=new URL(rel,previous);if(fs.statSync(before).isDirectory())compare(rel+'/');else assert.ok(fs.readFileSync(new URL(rel,current)).equals(fs.readFileSync(before)),rel);}}
 for(const dir of ['assets/','api/','data/'])compare(dir);
 for(const file of ['package.json','vercel.json'])assert.ok(fs.readFileSync(new URL(file,current)).equals(fs.readFileSync(new URL(file,previous))));
 assert.equal((css.match(/rgba\(255,254,248,\.60\)/g)||[]).length,2);
 assert.match(css,/\.day.today button.day-number\{background:#087780;color:#fff/);
});
test('date text contrast remains above 4.5 even with backplate on black',()=>{
 const luminance=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
 const bg=luminance([255,254,248].map(c=>c*.92));
 for(const fg of [[32,58,64],[82,100,106]])assert.ok((bg+.05)/(luminance(fg)+.05)>=4.5);
});
