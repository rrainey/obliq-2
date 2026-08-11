#!/usr/bin/env node
/**
 * Quick verification script to check local development setup
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function verifySupabase() {
  console.log('🔍 Verifying Supabase connection...\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    console.log('\nExpected (see .env.local.example):');
    console.log('  NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000   # self-hosted Docker');
    console.log('  # or http://127.0.0.1:54321                     # Supabase CLI');
    console.log('  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon JWT from Supabase .env / status>');
    console.log('  SUPABASE_SERVICE_ROLE_KEY=<service_role JWT>');
    if (supabaseUrl && supabaseUrl.startsWith('postgres')) {
      console.error('\n❌ NEXT_PUBLIC_SUPABASE_URL looks like a Postgres connection string.');
      console.error('   Use the HTTP API URL (e.g. http://localhost:8000), not postgresql://…');
    }
    process.exit(1);
  }

  if (supabaseUrl.startsWith('postgres')) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL must be an HTTP(S) API URL, not postgresql://…');
    console.error(`   Got: ${supabaseUrl}`);
    console.error('   Self-hosted Docker: http://localhost:8000 (SUPABASE_PUBLIC_URL)');
    console.error('   Supabase CLI:      http://127.0.0.1:54321 (from `npx supabase status`)');
    return false;
  }

  console.log(`✓ Supabase URL: ${supabaseUrl}`);
  console.log(`✓ Anon Key: ${supabaseKey.substring(0, 20)}...`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Test connection
  try {
    const { data, error } = await supabase
      .from('models')
      .select('count')
      .limit(1);

    if (error && error.message.includes('relation "public.models" does not exist')) {
      console.log('\n⚠️  Models table does not exist yet');
      console.log('   Apply database-scripts/ in order (see database-scripts/README.md):');
      console.log('     setup.sql → versioning.sql → 03-API-tokens.sql →');
      console.log('     04-wasm-cache.sql → 05-wasm-storage-bucket.sql');
      return false;
    } else if (error) {
      console.error('\n❌ Database error:', error.message);
      return false;
    }

    console.log('\n✅ Supabase connection successful!');
    console.log('✅ Models table exists');
    return true;
  } catch (err) {
    console.error('\n❌ Connection failed:', err.message);
    return false;
  }
}

async function verifyDocker() {
  console.log('\n🐳 Verifying Docker...\n');
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    await execAsync('docker --version');
    console.log('✅ Docker is installed');

    const { stdout } = await execAsync('docker ps');
    if (stdout.includes('supabase')) {
      console.log('✅ Supabase containers are running');
    }

    // Check if our WASM image exists
    try {
      await execAsync('docker images obliq-emscripten:latest --format "{{.Repository}}"');
      console.log('✅ Emscripten Docker image built');
    } catch {
      console.log('⚠️  Emscripten Docker image not built yet');
      console.log('   Run: npm run wasm:build-docker');
    }

    return true;
  } catch (err) {
    console.error('❌ Docker not available:', err.message);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Obliq-2 Development Environment Check');
  console.log('═══════════════════════════════════════════\n');

  const dockerOk = await verifyDocker();
  const supabaseOk = await verifySupabase();

  console.log('\n═══════════════════════════════════════════');
  if (dockerOk && supabaseOk) {
    console.log('✅ All systems ready!');
    console.log('\nNext steps:');
    console.log('  npm run dev          - Start development server');
    console.log('  npm run test:wasm    - Run WASM tests');
  } else {
    console.log('⚠️  Some issues need attention (see above)');
  }
  console.log('═══════════════════════════════════════════\n');
}

main().catch(console.error);
