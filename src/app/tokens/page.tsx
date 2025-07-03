// app/tokens/page.tsx
'use client'

import { useUser } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Key, Trash2 } from 'lucide-react'
import { ApiTokenService } from '@/lib/apiTokenService'

interface ApiToken {
  id: string
  name: string
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  isExpired?: boolean
  expiresInDays?: number | null
}

export default function TokensPage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [tokensLoading, setTokensLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingTokenId, setDeletingTokenId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [tokenToDelete, setTokenToDelete] = useState<{ id: string; name: string } | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenExpiry, setNewTokenExpiry] = useState<number | null>(30)
  const [creating, setCreating] = useState(false)
  const [createdToken, setCreatedToken] = useState<{ token: string; name: string } | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      fetchTokens()
    }
  }, [user])

  const fetchTokens = async () => {
    try {
      const { data: tokens, error } = await supabase
        .from('api_tokens')
        .select('id, name, created_at, expires_at, last_used_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Add computed fields
      const enrichedTokens = (tokens || []).map(token => ({
        ...token,
        isExpired: ApiTokenService.isTokenExpired(token.expires_at),
        expiresInDays: token.expires_at ? calculateDaysUntilExpiry(token.expires_at) : null
      }))

      setTokens(enrichedTokens)
    } catch (error) {
      console.error('Error fetching tokens:', error)
      setError('Failed to load API tokens')
    } finally {
      setTokensLoading(false)
    }
  }

  const confirmDeleteToken = (tokenId: string, tokenName: string) => {
    setTokenToDelete({ id: tokenId, name: tokenName })
    setShowDeleteDialog(true)
  }

  const handleDeleteToken = async () => {
    if (!tokenToDelete || deletingTokenId) return
    
    setDeletingTokenId(tokenToDelete.id)
    setError(null)
    
    try {
      const { error } = await supabase
        .from('api_tokens')
        .delete()
        .eq('id', tokenToDelete.id)
        .eq('user_id', user!.id) // Extra safety check

      if (error) throw error

      // Remove token from list
      setTokens(tokens.filter(token => token.id !== tokenToDelete.id))
      
      // Close dialog
      setShowDeleteDialog(false)
      setTokenToDelete(null)
      
    } catch (error) {
      console.error('Error deleting token:', error)
      setError(`Failed to delete token: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setDeletingTokenId(null)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        // Use the modern Clipboard API if available
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        
        try {
          document.execCommand('copy')
        } finally {
          textArea.remove()
        }
      }
      
      setCopySuccess(true)
      // Reset copy success after 2 seconds
      setTimeout(() => setCopySuccess(false), 2000)
      
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      setError('Failed to copy to clipboard')
    }
  }

  const handleCreateToken = async () => {
    if (!newTokenName.trim() || creating || !user) return
    
    setCreating(true)
    setError(null)
    
    try {
      const sanitizedName = ApiTokenService.sanitizeTokenName(newTokenName.trim())
      if (!sanitizedName) {
        throw new Error('Invalid token name')
      }

      // Validate expiry
      const validExpiryOptions = [30, 90, 180, null]
      if (newTokenExpiry !== undefined && !validExpiryOptions.includes(newTokenExpiry)) {
        throw new Error('Invalid expiry option')
      }

      // Generate token and hash
      const { token, tokenHash } = ApiTokenService.createToken()
      const expiresAt = ApiTokenService.calculateExpiryDate(newTokenExpiry)

      // Insert into database
      const { data: newToken, error: insertError } = await supabase
        .from('api_tokens')
        .insert({
          user_id: user.id,
          name: sanitizedName,
          token_hash: tokenHash,
          expires_at: expiresAt ? expiresAt.toISOString() : null
        })
        .select()
        .single()

      if (insertError) {
        // Check for duplicate name
        if (insertError.code === '23505') {
          throw new Error('A token with this name already exists')
        }
        throw insertError
      }

      // Store the created token for display
      setCreatedToken({
        token: token,
        name: newToken.name,
      })
      
      // Add the new token to the list (without the raw token)
      const enrichedNewToken: ApiToken = {
        id: newToken.id,
        name: newToken.name,
        created_at: newToken.created_at,
        expires_at: newToken.expires_at,
        last_used_at: null,
        isExpired: false,
        expiresInDays: newTokenExpiry ? calculateDaysUntilExpiry(newToken.expires_at!) : null,
      }
      
      setTokens([enrichedNewToken, ...tokens])
      
      // Close create dialog
      setShowCreateDialog(false)
      
      // Reset form
      setNewTokenName('')
      setNewTokenExpiry(30)
      
    } catch (error) {
      console.error('Error creating token:', error)
      setError(error instanceof Error ? error.message : 'Failed to create token')
    } finally {
      setCreating(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatLastUsed = (dateString: string | null) => {
    if (!dateString) return 'Never'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return formatDate(dateString)
  }

  const getExpiryStatus = (token: ApiToken) => {
    if (token.isExpired) {
      return <span className="text-red-600">Expired</span>
    }
    if (!token.expires_at) {
      return <span className="text-gray-500">Never expires</span>
    }
    if (token.expiresInDays !== null && token.expiresInDays !== undefined) {
      if (token.expiresInDays <= 7) {
        return <span className="text-orange-600">Expires in {token.expiresInDays} days</span>
      }
      return <span className="text-gray-600">Expires in {token.expiresInDays} days</span>
    }
    return <span className="text-gray-600">{formatDate(token.expires_at)}</span>
  }

  const calculateDaysUntilExpiry = (expiresAt: string): number => {
    const now = new Date()
    const expiry = new Date(expiresAt)
    const diffMs = expiry.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/models"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Models
          </Link>
          
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Key className="w-8 h-8 mr-3 text-gray-600" />
                API Keys
              </h1>
              <p className="mt-2 text-gray-600">
                Manage API keys for programmatic access to your models
              </p>
            </div>
            <div className="mt-4 flex md:mt-0 md:ml-4">
              <button
                onClick={() => {
                  setShowCreateDialog(true)
                  setNewTokenName('')
                  setNewTokenExpiry(30)
                  setError(null)
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create New API Key
              </button>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Tokens List */}
        <div className="bg-white shadow rounded-lg">
          {tokensLoading ? (
            <div className="p-6 text-center">
              <div className="text-gray-500">Loading tokens...</div>
            </div>
          ) : tokens.length === 0 ? (
            <div className="p-6 text-center">
              <Key className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No API keys</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new API key.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => {
                    setShowCreateDialog(true)
                    setNewTokenName('')
                    setNewTokenExpiry(30)
                    setError(null)
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Used
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tokens.map((token) => (
                    <tr key={token.id} className={token.isExpired ? 'bg-gray-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{token.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{formatDate(token.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{formatLastUsed(token.last_used_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">{getExpiryStatus(token)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => confirmDeleteToken(token.id, token.name)}
                          disabled={deletingTokenId === token.id || token.isExpired}
                          className={`inline-flex items-center p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors ${
                            deletingTokenId === token.id ? 'opacity-50 cursor-not-allowed' : ''
                          } ${token.isExpired ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={token.isExpired ? 'Expired tokens are automatically cleaned up' : 'Delete token'}
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="sr-only">Delete {token.name}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-md p-4">
          <h3 className="text-sm font-medium text-blue-800">How to use API keys</h3>
          <div className="mt-2 text-sm text-blue-700">
            <p>Include your API key in the URL path when making API requests:</p>
            <code className="mt-2 block bg-blue-100 rounded px-2 py-1 text-xs">
              POST /api/model-builder/YOUR_API_KEY_HERE
            </code>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteDialog && tokenToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">Delete API Key</h2>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete the API key "{tokenToDelete.name}"? This action cannot be undone and any applications using this key will lose access.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteDialog(false)
                    setTokenToDelete(null)
                  }}
                  disabled={deletingTokenId !== null}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteToken}
                  disabled={deletingTokenId !== null}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingTokenId ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Token Dialog */}
        {showCreateDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">Create New API Key</h2>
              
              {/* Token Name Input */}
              <div className="mb-4">
                <label htmlFor="token-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Key Name
                </label>
                <input
                  id="token-name"
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTokenName.trim() && !creating) {
                      handleCreateToken()
                    }
                  }}
                  placeholder="e.g., CI/CD Pipeline, Local Development"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500">
                  Choose a descriptive name to identify this key's purpose
                </p>
              </div>
              
              {/* Expiry Options */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expiration
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="30"
                      checked={newTokenExpiry === 30}
                      onChange={() => setNewTokenExpiry(30)}
                      className="mr-2"
                    />
                    <span className="text-sm">30 days</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="90"
                      checked={newTokenExpiry === 90}
                      onChange={() => setNewTokenExpiry(90)}
                      className="mr-2"
                    />
                    <span className="text-sm">90 days</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="180"
                      checked={newTokenExpiry === 180}
                      onChange={() => setNewTokenExpiry(180)}
                      className="mr-2"
                    />
                    <span className="text-sm">180 days</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="never"
                      checked={newTokenExpiry === null}
                      onChange={() => setNewTokenExpiry(null)}
                      className="mr-2"
                    />
                    <span className="text-sm">Never expires</span>
                  </label>
                </div>
              </div>
              
              {/* Error Display */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              
              {/* Action Buttons */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowCreateDialog(false)
                    setNewTokenName('')
                    setNewTokenExpiry(30)
                    setError(null)
                  }}
                  disabled={creating}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateToken}
                  disabled={creating || !newTokenName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Token Created Dialog */}
        {createdToken && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
              <h2 className="text-xl font-semibold mb-4">API Key Created</h2>
              
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800 font-medium mb-2">
                  ⚠️ Important: Save this API key now
                </p>
                <p className="text-sm text-yellow-700">
                  This is the only time you will see this key. It cannot be retrieved later.
                  Store it securely and do not share it publicly.
                </p>
                {copySuccess && (
                  <p className="text-sm text-yellow-700 mt-2">
                    💡 Tip: Clear your clipboard after saving the key to prevent accidental exposure.
                  </p>
                )}
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your API Key
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={createdToken.token}
                    readOnly
                    className="w-full px-3 py-2 pr-24 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <button
                    onClick={() => copyToClipboard(createdToken.token)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm rounded transition-all ${
                      copySuccess 
                        ? 'bg-green-600 text-white hover:bg-green-700' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {copySuccess ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              
              <div className="mb-6">
                <p className="text-sm text-gray-600">
                  <strong>Key Name:</strong> {createdToken.name}
                </p>
              </div>
              
              <div className="bg-gray-50 rounded-md p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Usage Example:</h3>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                  <code>{`POST https://your-domain.com/api/model-builder/${createdToken.token}`}</code>
                </pre>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={() => setCreatedToken(null)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}