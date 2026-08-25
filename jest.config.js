const nextJest = require('next/jest')

/** @type {import('jest').Config} */
const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // Increased timeout for integration tests that make network calls
  testTimeout: 30000,
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    "^mdl2obliq$": "<rootDir>/../mdl2obliq/src/index.ts",
    "^mdl2obliq/(.*)$": "<rootDir>/../mdl2obliq/src/$1",

    // Handle module aliases (same as in tsconfig.json)
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Transform TypeScript files in __tests__ directory
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  testMatch: [
    '**/__tests__/**/*.test.(js|jsx|ts|tsx)',
    '**/__tests__/**/*.tests.(js|jsx|ts|tsx)',
    '**/__tests__/**/*.spec.(js|jsx|ts|tsx)',
    '**/*.(test|spec).(js|jsx|ts|tsx)'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/wasm/fixtures/',
    '/__tests__/utils/',
    '/__tests__/codegen/enable-test-models.ts',
    '/__tests__/wasm/api/test-compile-api-manual.ts',
    // API route tests require Next.js server runtime (Request/Response globals)
    // Run these with `npm run test:e2e` or in actual Next.js environment
    '/__tests__/wasm/api/compile-wasm.test.ts'
  ],
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/*.config.js',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config)