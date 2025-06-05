// app/admin/api-metrics/page.tsx
'use client';

import { useState } from 'react';
import { ModelBuilderMetricsViewer } from '@/components/ModelBuilderMetricsViewer';

export default function ApiMetricsPage() {
  const [token, setToken] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token) {
      setAuthenticated(true);
    }
  };

  if (!authenticated) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">Model Builder API Metrics</h1>
        <form onSubmit={handleSubmit} className="max-w-md">
          <div className="space-y-4">
            <div>
              <label htmlFor="token" className="block text-sm font-medium mb-2">
                API Token
              </label>
              <input
                type="password"
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Enter Model Builder API token"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
            >
              View Metrics
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Model Builder API Metrics</h1>
      <ModelBuilderMetricsViewer token={token} />
    </div>
  );
}