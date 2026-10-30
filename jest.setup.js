// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Load environment variables from .env.local (e.g. TEST_API_TOKEN for integration tests)
require('dotenv').config({ path: '.env.local' });

// Basic Jest setup for our model schema tests
// No additional testing library imports needed for schema validation tests

// Integration tests import fetch from 'cross-fetch' in api-client.ts, because the
// jsdom environment has no global fetch. No global polyfill is needed here.

// Stores created by tests start empty: don't import the repo's reference
// models unless a test opts in (see __tests__/storage/reference-models.test.ts).
if (process.env.OBLIQ_REFERENCE_MODELS_DIR === undefined) {
  process.env.OBLIQ_REFERENCE_MODELS_DIR = ''
}
