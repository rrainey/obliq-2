// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Optimize cache strategy for large files
    if (!isServer) {
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