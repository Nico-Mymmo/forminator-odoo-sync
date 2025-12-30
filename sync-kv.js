// Sync production KV to preview KV
const { execSync } = require('child_process');
const fs = require('fs');

const PROD_NS = '04e4118b842b48a58f5777e008931026';
const PREVIEW_NS = '7b6a8e2f047f4f509bb594928fb80bd5';

console.log('📥 Fetching production mappings...');
const mappings = execSync(`wrangler kv key get mappings --namespace-id=${PROD_NS} --remote`, {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024
});

const tempFile = 'temp-sync-mappings.json';
fs.writeFileSync(tempFile, mappings, 'utf8');

console.log('📤 Writing to preview namespace...');
execSync(`wrangler kv key put mappings --namespace-id=${PREVIEW_NS} --path=${tempFile}`, {
  stdio: 'inherit'
});

fs.unlinkSync(tempFile);
console.log('✅ Sync complete!');
