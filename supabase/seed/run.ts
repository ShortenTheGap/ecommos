/**
 * NourishOS — seed CLI runner.
 *
 * Loads `.env.local`, constructs a service-role Supabase client, runs the seed,
 * and prints row counts + demo credentials. Exits non-zero on any error.
 *
 * Usage:  npm run seed
 */

import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { runSeed } from './seed';

// `import 'dotenv/config'` only reads `.env`; we explicitly target `.env.local`.
dotenv.config({ path: '.env.local' });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[seed] Missing required environment variable: ${name}. Check .env.local.`
    );
  }
  return value;
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('[seed] Seeding "Ember Goods" demo brand against the live DB...');
  const { counts, demo } = await runSeed(supabase);

  console.log('\n[seed] Row counts:');
  const total = Object.entries(counts).reduce((sum, [, n]) => sum + n, 0);
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(24)} ${n}`);
  }
  console.log(`  ${'TOTAL'.padEnd(24)} ${total}`);

  console.log('\n[seed] Demo login:');
  console.log(`  email:    ${demo.email}`);
  console.log(`  password: ${demo.password}`);
  console.log('\n[seed] Done.');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n[seed] FAILED: ${message}`);
  process.exit(1);
});
