import { createClient } from '@supabase/supabase-js';

// Direct credentials (tijdelijk voor debug)
const SUPABASE_URL = 'https://mmswcbewyjaxiwewgxvz.supabase.co';
const SUPABASE_KEY = process.argv[2]; // Service role key als argument

if (!SUPABASE_KEY) {
  console.error('Gebruik: node scripts/debug-permissions.mjs <SUPABASE_SERVICE_ROLE_KEY>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function debug() {
  console.log('Fetching template data...\n');
  
  const { data, error } = await supabase
    .from('project_templates')
    .select('id, name, visibility, owner_user_id, editor_user_ids, user_id')
    .limit(5);
  
  if (error) {
    console.error('ERROR:', error);
    return;
  }
  
  data.forEach((t, i) => {
    console.log(`\n=== Template ${i + 1}: ${t.name} ===`);
    console.log(`ID:             ${t.id}`);
    console.log(`Visibility:     ${t.visibility || 'NULL'}`);
    console.log(`Owner User ID:  ${t.owner_user_id || 'NULL'} (type: ${typeof t.owner_user_id})`);
    console.log(`Legacy User ID: ${t.user_id || 'NULL'} (type: ${typeof t.user_id})`);
    console.log(`Editors:        ${JSON.stringify(t.editor_user_ids) || 'NULL'}`);
  });
  
  console.log('\n\n=== Type Vergelijking ===');
  if (data.length > 0) {
    const first = data[0];
    console.log(`owner_user_id type: ${typeof first.owner_user_id}`);
    console.log(`user_id type: ${typeof first.user_id}`);
    console.log(`String(owner_user_id) === String(user_id): ${String(first.owner_user_id) === String(first.user_id)}`);
  }
}

debug().catch(console.error);
