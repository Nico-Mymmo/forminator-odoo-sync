/**
 * Fetch deployed worker script from Cloudflare using wrangler API
 */
import { execSync } from 'child_process';

const ACCOUNT_ID = '25263f37e7f3b211e5e9d2f1150fff43';
const WORKER_NAME = 'forminator-sync';

// Version IDs from deployments (oldest working one from Jan 5)
const versionToCheck = '0f3edd7c-563c-4880-9f7f-19f5883fa8cc'; // Jan 5 15:43

console.log(`Fetching deployed worker content for version ${versionToCheck}...\n`);

try {
  // Use wrangler to get the version content
  const result = execSync(`wrangler versions view ${versionToCheck}`, {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024
  });
  
  console.log(result);
} catch (error) {
  console.error('Error:', error.message);
  console.log('\nTrying alternative: deploy --dry-run from an old commit...');
}
