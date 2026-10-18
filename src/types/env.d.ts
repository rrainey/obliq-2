// types/env.d.ts

declare namespace NodeJS {
  interface ProcessEnv {
    // Local storage root (default: ${XDG_CONFIG_HOME:-~/.config}/obliq-2)
    OBLIQ_HOME?: string;
    // Extra hostnames (comma-separated) allowed besides loopback; see src/middleware.ts
    OBLIQ_ALLOWED_HOSTS?: string;
    // Delete expired API tokens when they are presented
    AUTO_DELETE_EXPIRED_TOKENS?: string;
    
    // MCP Server Configuration
    MCP_SERVER_PORT?: string;
    MCP_API_TOKEN?: string;
    MCP_API_BASE_URL?: string;
    
    // Next.js
    NODE_ENV: 'development' | 'production' | 'test';
  }
}