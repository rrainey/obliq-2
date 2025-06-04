// types/env.d.ts

declare namespace NodeJS {
  interface ProcessEnv {
    // Supabase Configuration
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    
    // API Tokens
    AUTOMATION_API_TOKEN: string;
    MODEL_BUILDER_API_TOKEN: string;
    
    // MCP Server Configuration
    MCP_SERVER_PORT?: string;
    MCP_API_TOKEN?: string;
    MCP_API_BASE_URL?: string;
    
    // Next.js
    NODE_ENV: 'development' | 'production' | 'test';
  }
}