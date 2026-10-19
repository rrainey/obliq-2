// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native SQLite binding used by src/lib/server/storage; must not be bundled.
  serverExternalPackages: ['better-sqlite3'],

  // Dev server: keep compiled pages around while working, so switching between
  // My Models and the editor doesn't trigger a recompile after a minute away.
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 10,
  },

  // Type-check only the app during `next build`; tests and scripts are covered by
  // `npx tsc -p .` and Jest (mcp-server is a separate package with its own tsconfig).
  typescript: {
    tsconfigPath: 'tsconfig.build.json',
  },

  webpack: (config, { isServer, dev }) => {
    // Configure Web Workers and WebAssembly support
    if (!isServer) {
      // Enable Web Workers with webpack 5 (native support)
      config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm'

      // Enable experimental features for workers and WASM
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
        layers: true,
        topLevelAwait: true
      }

      // Ensure worker files are treated as separate entry points
      config.output.globalObject = 'self'
    }

    // Optimize cache strategy and chunking for production client builds only.
    // In `next dev` these custom splitChunks groups make compiling a new route
    // (e.g. opening the editor for the first time) re-chunk modules shared with
    // the current page; Fast Refresh then does a full reload, which cancels the
    // in-flight navigation and leaves the user on the page they were leaving.
    if (!isServer && !dev) {
      config.cache = {
        type: 'filesystem',
        compression: 'gzip',
        // Increase cache size limits
        maxMemoryGenerations: 1,
        memoryCacheUnaffected: true,
        // Configure serialization to handle large strings better
        store: 'pack',
        buildDependencies: {
          config: [__filename],
        },
      }

      // Split chunks more aggressively
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          // Mantine UI components
          mantine: {
            name: 'mantine',
            test: /[\\/]node_modules[\\/]@mantine[\\/]/,
            priority: 20,
          },
          // React Flow components
          reactflow: {
            name: 'reactflow',
            test: /[\\/]node_modules[\\/]reactflow[\\/]/,
            priority: 20,
          },
          // Common components
          commons: {
            name: 'commons',
            minChunks: 2,
            priority: 10,
            reuseExistingChunk: true,
          },
          // Large components
          modelEditor: {
            name: 'model-editor',
            test: /[\\/]components[\\/]ModelEditor[\\/]/,
            priority: 15,
            reuseExistingChunk: true,
          },
        },
      }
    }

    return config
  },
  
  // Experimental features for better performance
  experimental: {
    // Module federation for better code splitting
    esmExternals: true,
  },
  
  // Compiler options
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production',
  },
}

module.exports = nextConfig