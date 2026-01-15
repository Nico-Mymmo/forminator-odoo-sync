/**
 * Import form mappings from mappings.json to Supabase
 * Run with: node scripts/import-mappings.js
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read environment from .dev.vars
const devVarsPath = join(__dirname, '../.dev.vars');
const devVars = readFileSync(devVarsPath, 'utf-8');
const env = {};
devVars.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const match = trimmed.match(/^([A-Z_]+)=(.+)$/);
    if (match) {
      env[match[1]] = match[2];
    }
  }
});

console.log('🔍 Loaded environment variables:', Object.keys(env));

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .dev.vars');
  console.error('   SUPABASE_URL:', env.SUPABASE_URL ? '✅' : '❌');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Read mappings.json
const mappingsPath = join(__dirname, '../src/config/mappings.json');
const mappingsData = JSON.parse(readFileSync(mappingsPath, 'utf-8'));

console.log('📥 Importing form mappings from mappings.json...\n');

let imported = 0;
let skipped = 0;

for (const [formId, mapping] of Object.entries(mappingsData)) {
  // Skip internal fields and examples
  if (formId.startsWith('_')) {
    console.log(`⏭️  Skipping: ${formId} (internal/example)`);
    skipped++;
    continue;
  }
  
  console.log(`📝 Importing form ${formId}: ${mapping.field_mapping?.form_title || 'Unnamed Form'}`);
  
  try {
    const { data, error } = await supabase
      .from('form_mappings')
      .upsert({
        form_id: formId,
        name: mapping.field_mapping?.form_title || `Form ${formId}`,
        field_mapping: mapping.field_mapping || {},
        value_mapping: mapping.value_mapping || {},
        workflow: mapping.workflow || [],
        html_card: mapping.html_card || null,
        created_by: null,
        updated_by: null
      }, {
        onConflict: 'form_id'
      })
      .select();
    
    if (error) {
      console.error(`   ❌ Error: ${error.message}`);
    } else {
      console.log(`   ✅ Imported successfully`);
      imported++;
    }
  } catch (err) {
    console.error(`   ❌ Exception: ${err.message}`);
  }
}

console.log(`\n📊 Summary:`);
console.log(`   ✅ Imported: ${imported}`);
console.log(`   ⏭️  Skipped: ${skipped}`);
console.log(`\n✨ Done!`);
