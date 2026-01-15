// Read KV cache from wrangler local state
import Database from 'better-sqlite3';
import { readdirSync } from 'fs';
import { join } from 'path';

const kvDir = './.wrangler/state/v3/kv/miniflare-KVNamespaceObject';
const files = readdirSync(kvDir).filter(f => f.endsWith('.sqlite'));

console.log(`Found ${files.length} KV cache databases\n`);

for (const file of files) {
  const dbPath = join(kvDir, file);
  console.log(`\n=== ${file} ===`);
  
  try {
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT key, blob_id, expiration FROM _mf_entries').all();
    
    console.log(`Keys found: ${rows.length}`);
    for (const row of rows) {
      console.log(`  - Key: "${row.key}" (blob: ${row.blob_id.substring(0, 20)}...)`);
      
      // Try to get the actual value
      const blobPath = join(kvDir, row.blob_id);
      try {
        const { readFileSync } = await import('fs');
        const value = readFileSync(blobPath, 'utf-8');
        if (value.length < 500) {
          console.log(`    Value: ${value}`);
        } else {
          console.log(`    Value (first 200 chars): ${value.substring(0, 200)}...`);
        }
      } catch (e) {
        console.log(`    (Could not read blob)`);
      }
    }
    
    db.close();
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}
