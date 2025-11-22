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
    console.log('\nExpected:');
    console.log('  NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321');
    console.log('  NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>');
    process.exit(1);
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
      console.log('   Run: npm run db:setup (or apply database-scripts/setup.sql)');
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
