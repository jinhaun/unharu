import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=rel=>fs.readFileSync(new URL('../'+rel,import.meta.url),'utf8');
test('newsletter navigation, feed script and runtime hooks are removed',()=>{
 assert.doesNotMatch(read('index.html'),/job-newsletter-link|job-update-count|DAYFLOW_JOB_FEED|jobFeed|job-feed-current|채용 뉴스레터/);
});
test('newsletter files cannot be accidentally included in a future Vercel release',()=>{
 const ignore=read('.vercelignore');
 for(const file of ['newsletter.html','newsletter-v10-assets/','data/job-feed-current.js'])assert.ok(ignore.split(/\r?\n/).includes(file));
});
