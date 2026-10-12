import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('one existing transit save button is below the memo and outside the conditional route results',()=>{
 assert.equal((html.match(/id="save-transit"/g)||[]).length,1);
 const memo=html.indexOf('<textarea id="quick-input"');
 const footer=html.indexOf('id="transit-save-footer"');
 const save=html.indexOf('id="save-transit"');
 assert.ok(memo<footer&&footer<save);
 assert.ok(html.indexOf('id="quick-date"')>html.indexOf('id="transit-result"'));
 assert.ok(save>html.indexOf('id="quick-date"'));
 assert.match(html,/<div id="transit-save-footer" hidden>/);
 assert.match(html,/id="save-transit" disabled aria-describedby="transit-save-footer-help"/);
 assert.ok(html.includes("$('#transit-save-footer').hidden = !transitMode;"));
 assert.ok(html.includes("$('#parse-button').hidden = transitMode;"));
});
