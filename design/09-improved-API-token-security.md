I'll break down the work required to implement user-specific API tokens with enhanced security. Here's a comprehensive task list:

## Database Setup Tasks

### Task 1: Create API Tokens Table
- **Start:** Design SQL schema for api_tokens table
- **End:** Execute migration to create table with columns: id, user_id, name, token_hash, created_at, expires_at

### Task 2: Add RLS Policies for API Tokens
- **Start:** Write RLS policies for api_tokens table
- **End:** Apply policies ensuring users can only see/manage their own tokens

### Task 3: Create Token Cleanup Function
- **Start:** Write PostgreSQL function to delete expired tokens
- **End:** Function exists and can be called to remove expired tokens

## Backend Implementation Tasks

### Task 4: Create Secure Token Generation Service
- **Start:** Create `lib/apiTokenService.ts` with token generation logic
- **End:** Service can generate 512-bit hex tokens using crypto.randomBytes

### Task 5: Implement Token Hashing Service
- **Start:** Add hashing functions to apiTokenService using SHA-256
- **End:** Service can hash tokens and verify hashes securely

### Task 6: Create Token Cache Manager
- **Start:** Implement in-memory LRU cache for 10 most recent token hashes
- **End:** Cache manager with get/set/evict functionality exists

### Task 7: Update API Authentication Middleware
- **Start:** Modify existing API auth to support user tokens
- **End:** APIs authenticate with either environment token or user tokens

### Task 8: Add Auto-Delete Logic for Expired Tokens
- **Start:** Add expiry checking to auth middleware
- **End:** Expired tokens are deleted when AUTO_DELETE_EXPIRED_TOKENS=true

### Task 9: Create API Token Management Endpoints
- **Start:** Create `/api/tokens` route handlers
- **End:** Endpoints for list, create, delete tokens exist

## Frontend Implementation Tasks

### Task 10: Add "Create API Key" Button to Models Page
- **Start:** Modify `app/models/page.tsx` to add button
- **End:** Button exists and navigates to token management page

### Task 11: Create Token Management Page Structure
- **Start:** Create `app/tokens/page.tsx` with basic layout
- **End:** Page loads with header and placeholder content

### Task 12: Implement Token List Component
- **Start:** Create component to display user's tokens
- **End:** Shows token names, creation dates, expiry with delete icons

### Task 13: Add Token Deletion Functionality
- **Start:** Implement delete handler with confirmation dialog
- **End:** Users can delete tokens with confirmation

### Task 14: Create New Token Dialog Component
- **Start:** Build dialog for token creation form
- **End:** Dialog shows name input and expiry options (30/90/180/never)

### Task 15: Implement Token Generation Flow
- **Start:** Add API call and response handling for token creation
- **End:** Successfully creates token and shows it to user

### Task 16: Add Token Display Dialog
- **Start:** Create dialog to show newly generated token
- **End:** Shows token with copy button and one-time warning

### Task 17: Implement Clipboard Copy Functionality
- **Start:** Add copy-to-clipboard for token value
- **End:** Copy button works with success feedback

## Integration Tasks

### Task 18: Update Model Builder API Authentication
- **Start:** Modify `app/api/model-builder/[token]/route.ts`
- **End:** Accepts both env tokens and user tokens

### Task 19: Update Automation API Authentication
- **Start:** Modify `app/api/automations/[token]/route.ts`
- **End:** Accepts both env tokens and user tokens

### Task 20: Add Token-Based User Resolution
- **Start:** Create helper to get user_id from token
- **End:** APIs can identify which user is making requests

### Task 21: Update API Error Messages
- **Start:** Enhance error responses for token issues
- **End:** Clear messages for invalid/expired tokens

## Testing & Documentation Tasks

### Task 22: Create Token Service Unit Tests
- **Start:** Write tests for token generation and hashing
- **End:** Core token functions have test coverage

### Task 23: Test Token Authentication Flow
- **Start:** Create integration tests for API auth
- **End:** Tests verify both token types work correctly

### Task 24: Update API Documentation
- **Start:** Document new token-based authentication
- **End:** README includes token usage examples

### Task 25: Add Token Management UI Tests
- **Start:** Test token creation and deletion flows
- **End:** UI interactions work correctly

## Configuration Tasks

### Task 26: Add Environment Variable Support
- **Start:** Update `.env.local.example` and types
- **End:** AUTO_DELETE_EXPIRED_TOKENS variable documented

### Task 27: Add Migration Instructions
- **Start:** Create migration guide for existing users
- **End:** Clear steps for transitioning to new auth system

---

## Implementation Notes:

1. **Security Considerations:**
   - Use crypto.randomBytes(64) for 512-bit tokens
   - Use SHA-256 for hashing (via crypto.createHash)
   - Never store raw tokens in database
   - Implement constant-time comparison for hash verification

2. **Performance Optimizations:**
   - LRU cache using Map with size limit of 10
   - Index token_hash column for fast lookups
   - Batch delete expired tokens if needed

3. **User Experience:**
   - Clear one-time display warning for tokens
   - Automatic clipboard clearing suggestion
   - Show remaining days until expiry
   - Sort tokens by creation date (newest first)

4. **Backward Compatibility:**
   - Keep support for environment-based tokens
   - Check env token first, then user tokens
   - Graceful migration path

Would you like me to start with Task 1 (creating the API tokens table schema)?