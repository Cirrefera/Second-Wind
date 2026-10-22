import {readFile} from 'node:fs/promises';
import {prepareRelease} from '../src/release-preparation.js';

// Source preparation only: no cloud account, credentials, writes or activation.
const [path,reviewsPath]=process.argv.slice(2);
if(!path) {
  console.error('Usage: node scripts/prepare-release.mjs release-input.json [trusted-review-records.json]');
  process.exitCode=1;
} else {
  try {
    const input=JSON.parse(await readFile(path,'utf8'));
    const reviews=reviewsPath?JSON.parse(await readFile(reviewsPath,'utf8')):[];
    const report=await prepareRelease({},input,{reviews});
    console.log(JSON.stringify(report,null,2));
    process.exitCode=report.source_ready?0:1;
  } catch(error) {
    console.error(JSON.stringify({error:error.code||error.message}));
    process.exitCode=1;
  }
}
