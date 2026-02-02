/**
 * Check template permissions data
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPermissions() {
  console.log('Fetching templates...\n');
  
  const { data: templates, error } = await supabase
    .from('project_templates')
    .select('id, name, visibility, owner_user_id, editor_user_ids, user_id')
    .limit(10);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Found ${templates.length} templates:\n`);
  
  templates.forEach(t => {
    console.log('---');
    console.log(`Template: ${t.name}`);
    console.log(`ID: ${t.id}`);
    console.log(`Visibility: ${t.visibility || 'NULL'}`);
    console.log(`Owner User ID: ${t.owner_user_id || 'NULL'}`);
    console.log(`Legacy User ID: ${t.user_id || 'NULL'}`);
    console.log(`Editors: ${t.editor_user_ids ? JSON.stringify(t.editor_user_ids) : 'NULL'}`);
    console.log('');
  });
}

checkPermissions().catch(console.error);
