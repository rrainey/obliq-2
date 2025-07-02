import crypto from 'crypto'

export interface ApiToken {
  id: string
  user_id: string
  name: string
  token_hash: string
  created_at: string
  expires_at: string | null
  last_used_at: string | null
}

export interface CreateTokenResult {
  token: string
  tokenHash: string
}

export class ApiTokenService {
  /**
   * Generate a cryptographically secure 512-bit (64 byte) token
   * Returns as hexadecimal string (128 characters)
   */
  static generateToken(): string {
    return crypto.randomBytes(64).toString('hex')
  }

  /**
   * Hash a token using SHA-256
   * Returns the hash as a hexadecimal string
   */
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  /**
   * Verify a token against a hash using constant-time comparison
   */
  static verifyToken(token: string, hash: string): boolean {
    const tokenHash = this.hashToken(token)
    
    // Use constant-time comparison to prevent timing attacks
    if (tokenHash.length !== hash.length) {
      return false
    }
    
    return crypto.timingSafeEqual(
      Buffer.from(tokenHash),
      Buffer.from(hash)
    )
  }

  /**
   * Generate a new token and return both the raw token and its hash
   */
  static createToken(): CreateTokenResult {
    const token = this.generateToken()
    const tokenHash = this.hashToken(token)
    
    return {
      token,
      tokenHash
    }
  }

  /**
   * Calculate expiry date based on days from now
   * @param days Number of days until expiry (null for no expiry)
   */
  static calculateExpiryDate(days: number | null): Date | null {
    if (days === null) {
      return null
    }
    
    const expiryDate = new Date()
    expiryDate.setUTCDate(expiryDate.getUTCDate() + days)
    expiryDate.setUTCHours(23, 59, 59, 999) // End of day in UTC
    
    return expiryDate
  }

  /**
   * Check if a token is expired
   */
  static isTokenExpired(expiresAt: string | null): boolean {
    if (!expiresAt) {
      return false // No expiry means never expires
    }
    
    return new Date(expiresAt) < new Date()
  }

  /**
   * Format token for display (show first and last 8 characters)
   */
  static formatTokenForDisplay(token: string): string {
    if (token.length <= 20) {
      return token
    }
    
    const start = token.substring(0, 8)
    const end = token.substring(token.length - 8)
    
    return `${start}...${end}`
  }

  /**
   * Validate token format (128 hex characters)
   */
  static isValidTokenFormat(token: string): boolean {
    const hexRegex = /^[a-f0-9]{128}$/i
    return hexRegex.test(token)
  }

  /**
   * Sanitize token name
   */
  static sanitizeTokenName(name: string): string {
    return name.trim().substring(0, 100) // Limit to 100 characters
  }
}

// LRU Cache for token hashes
export class TokenCache {
  private cache: Map<string, { userId: string; timestamp: number }>
  private maxSize: number
  
  constructor(maxSize: number = 10) {
    this.cache = new Map()
    this.maxSize = maxSize
  }

  /**
   * Get user ID from cache if token hash exists
   */
  get(tokenHash: string): string | null {
    const entry = this.cache.get(tokenHash)
    
    if (!entry) {
      return null
    }
    
    // Move to end (most recently used)
    this.cache.delete(tokenHash)
    this.cache.set(tokenHash, entry)
    
    return entry.userId
  }

  /**
   * Add token hash to cache
   */
  set(tokenHash: string, userId: string): void {
    // Remove oldest entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(tokenHash)) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }
    
    // Add or update entry
    this.cache.set(tokenHash, {
      userId,
      timestamp: Date.now()
    })
  }

  /**
   * Remove token hash from cache
   */
  delete(tokenHash: string): void {
    this.cache.delete(tokenHash)
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size
  }

  /**
   * Get cache stats for monitoring
   */
  getStats(): { size: number; entries: Array<{ hash: string; userId: string; age: number }> } {
    const now = Date.now()
    const entries = Array.from(this.cache.entries()).map(([hash, data]) => ({
      hash: hash.substring(0, 8) + '...',
      userId: data.userId,
      age: Math.floor((now - data.timestamp) / 1000) // Age in seconds
    }))
    
    return {
      size: this.cache.size,
      entries
    }
  }
}

// Global token cache instance
export const tokenCache = new TokenCache(10)