import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qsimnkmkonleyfqsjctj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzaW1ua21rb25sZXlmcXNqY3RqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxNzU0OCwiZXhwIjoyMDgzMTkzNTQ4fQ.XV9g_l2J8sv8loHqDud1M0xdG1N5vT_sPBTHx0b3fOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function readOnlyInspection() {
  console.log('=== STAP 1: MIGRATION HISTORY ===\n');
  
  const { data: migrations, error: migError } = await supabase
    .rpc('exec_raw_sql', { 
      query: 'SELECT version, applied_at FROM supabase_migrations.schema_migrations ORDER BY version'
    });
  
  if (migError) {
    // Try alternative approach
    const { data: alt, error: altError } = await supabase
      .from('schema_migrations')
      .select('version, applied_at')
      .order('version');
    
    if (altError) {
      console.log('ERROR:', altError.message);
      console.log('\nTrying direct query via PostgreSQL REST API...\n');
    } else {
      console.table(alt);
    }
  } else {
    console.table(migrations);
  }

  console.log('\n=== STAP 2: EFFECTIEF SCHEMA (PUBLIC TABLES) ===\n');
  
  const { data: tables, error: tableError } = await supabase
    .rpc('exec_raw_sql', {
      query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    });
  
  if (tableError) {
    console.log('ERROR:', tableError.message);
    console.log('\nListing accessible tables via PostgREST...\n');
    
    // List all accessible tables
    const tableNames = [
      'users', 'modules', 'user_modules', 'form_mappings', 'form_submission_history',
      'crm_leads', 'project_templates'
    ];
    
    console.log('Checking existence of expected tables:');
    for (const tableName of tableNames) {
      const { error } = await supabase.from(tableName).select('*').limit(0);
      console.log(`  ${tableName}: ${error ? '❌ NOT FOUND' : '✅ EXISTS'}`);
    }
  } else {
    console.table(tables);
  }

  console.log('\n=== Read-only inspectie uitgevoerd. Geen wijzigingen aangebracht. ===');
}

readOnlyInspection();
