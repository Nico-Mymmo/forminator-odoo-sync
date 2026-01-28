import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const connectionString = 'postgresql://postgres.qsimnkmkonleyfqsjctj:YY3QXpJCd1Gx4Hki@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const client = new pg.Client({ connectionString });

async function truncateMigrationHistory() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    console.log('Executing: TRUNCATE supabase_migrations.schema_migrations;');
    await client.query('TRUNCATE supabase_migrations.schema_migrations;');
    console.log('✅ Migration history cleared (administrative reset)\n');

    // Verify empty
    const result = await client.query('SELECT COUNT(*) FROM supabase_migrations.schema_migrations;');
    console.log('Verification - Remaining migrations:', result.rows[0].count);
    console.log('\n✅ Migration history reset complete');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

truncateMigrationHistory();
