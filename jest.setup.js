// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Load environment variables from .env.local for tests that need Supabase credentials
require('dotenv').config({ path: '.env.local' });

// Basic Jest setup for our model schema tests
// No additional testing library imports needed for schema validation tests