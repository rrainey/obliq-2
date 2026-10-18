#!/usr/bin/env node
/**
 * Quick verification script to check local development setup
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const os = require('os');
const path = require('path');

async function verifyStorage() {
  console.log('🔍 Verifying local storage...\n');

  const home = process.env.OBLIQ_HOME
    ? path.resolve(process.env.OBLIQ_HOME)
    : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'obliq-2');

  try {
    fs.mkdirSync(home, { recursive: true });
    fs.accessSync(home, fs.constants.W_OK);
    console.log(`✓ Obliq home: ${home}`);
  } catch (err) {
    console.error(`❌ Obliq home is not writable: ${home} (${err.message})`);
    return false;
  }

  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    const { v } = db.prepare('select sqlite_version() as v').get();
    db.close();
    console.log(`✓ better-sqlite3 loaded (SQLite ${v})`);
  } catch (err) {
    console.error('❌ better-sqlite3 failed to load:', err.message);
    console.error('   Try: npm rebuild better-sqlite3');
    return false;
  }

  const dbPath = path.join(home, 'obliq.db');
  if (fs.existsSync(dbPath)) {
    console.log(`✓ Database present: ${dbPath}`);
  } else {
    console.log('ℹ️  No database yet; it is created on first use');
  }

  console.log('\n✅ Local storage ready');
  return true;
}

async function verifyDocker() {
  console.log('\n🐳 Verifying Docker...\n');
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    await execAsync('docker --version');
    console.log('✅ Docker is installed');

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
  const storageOk = await verifyStorage();

  console.log('\n═══════════════════════════════════════════');
  if (dockerOk && storageOk) {
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
