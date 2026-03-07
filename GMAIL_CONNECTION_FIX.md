# Gmail Connection Status Fix

## Problem
Gmail accounts were showing as "Connected" in the UI even though their OAuth tokens were expired, preventing email sending. The system was only checking if accounts existed in the database, not validating token expiration.

## Root Cause
1. **Rust Integration Code** (`oneclaw-node/src/integration.rs`) - Only checked if accounts exist, didn't validate token expiration
2. **No Token Expiration Check** - The `check_gmail_connected()` function returned `true` if any accounts existed, regardless of token validity
3. **UI State Mismatch** - UI displayed "Connected" based on account existence, not actual token validity

## Solution Implemented

### 1. Backend Changes (Rust)

#### `oneclaw-node/src/integration.rs`
- ✅ Added `expires_at: Option<String>` field to `GmailAccount` struct
- ✅ Added `is_token_expired()` method to check token validity against current time
- ✅ Added `status: String` field to `Integration` struct ("connected", "expired", "disconnected")
- ✅ Updated `check_gmail_connected()` to only return true for non-expired tokens
- ✅ Modified `get_integrations_list()` to:
  - Parse `expires_at` from API response
  - Calculate expiration status for each account
  - Set `connected: false` and `status: "expired"` for expired tokens
  - Set `connected: true` and `status: "connected"` for valid tokens

#### `oneclaw-node/src/daemon.rs`
- ✅ Added new route: `POST /integrations/gmail/disconnect`
- ✅ Implemented `disconnect_gmail()` handler to remove specific Gmail accounts by email

### 2. Frontend Changes (UI)

#### `oneclaw-node/src/ui/integrations.html`
- ✅ Added CSS for expired status with pulsing animation (`.status-expired`)
- ✅ Updated integration card rendering to handle three states:
  - **Connected**: Green badge, test/compose/disconnect actions
  - **Expired**: Yellow warning badge, reconnect/remove actions  
  - **Disconnected**: Gray badge, connect action
- ✅ Implemented `reconnectIntegration()` function (opens OAuth flow)
- ✅ Implemented `disconnectIntegration()` function (calls new disconnect endpoint)

### 3. API Changes

#### `apps/api/src/routes/gmail.ts`
- ✅ Updated `disconnectGmailHandler()` to accept optional `email` parameter
- ✅ Added logic to delete specific account by email or all accounts for a user

#### `packages/database/src/users.ts`
- ✅ Updated `deleteNodeIntegration()` signature to accept optional `email` parameter
- ✅ Modified query to filter by email when provided (for multi-account support)

## Visual Changes

### Before
- All accounts showed: `✓ Connected` (green)
- Email sending failed with expired tokens
- No indication of token problems

### After
- Valid accounts show: `✓ Connected` (green)
- Expired accounts show: `⚠️ Expired - Reconnect Required` (yellow, pulsing)
- Expired accounts display:
  - Email address
  - Warning message about token expiration
  - "Reconnect Account" button (primary action)
  - "Remove Account" button (secondary action)

## User Experience Flow

### When Tokens Expire:
1. User opens integrations page
2. Expired accounts show yellow warning badge with pulsing animation
3. Clear message: "⚠️ Token expired - Please reconnect to resume sending emails"
4. Two options:
   - **Reconnect Account** - Opens OAuth flow to re-authorize
   - **Remove Account** - Deletes the integration from database

### Reconnecting:
1. Click "Reconnect Account"
2. OAuth popup opens (same flow as initial connection)
3. User authorizes Gmail access
4. New tokens saved to database
5. Account automatically shows as "Connected" again

### Disconnecting:
1. Click "Remove Account" on any account
2. Confirmation dialog appears
3. Account deleted from database
4. UI refreshes to show disconnected state

## Testing

### To Test the Fix:

1. **Simulate Expired Token** (for testing):
   ```sql
   -- In Supabase SQL Editor
   UPDATE node_integrations 
   SET token_expires_at = NOW() - INTERVAL '1 day'
   WHERE provider = 'google';
   ```

2. **Verify UI Shows Expired State**:
   - Navigate to integrations page
   - Should see yellow warning badge
   - "Reconnect Account" button should be visible

3. **Test Reconnection**:
   - Click "Reconnect Account"
   - Complete OAuth flow
   - Verify account shows as "Connected" with green badge

4. **Test Disconnection**:
   - Click "Remove Account" on any account
   - Confirm deletion
   - Verify account is removed and UI shows "Connect Gmail" button

5. **Test Email Sending**:
   - With valid token: Should successfully send
   - With expired token: Should show appropriate error

## Files Modified

### Rust Backend
- `oneclaw-node/src/integration.rs` - Token expiration logic
- `oneclaw-node/src/daemon.rs` - Disconnect endpoint

### Frontend
- `oneclaw-node/src/ui/integrations.html` - UI and disconnect/reconnect logic

### TypeScript/Node Backend  
- `apps/api/src/routes/gmail.ts` - Updated disconnect handler
- `packages/database/src/users.ts` - Database function for account deletion

## Dependencies
- No new dependencies added
- Uses existing `chrono` crate for date/time parsing in Rust

## Deployment Notes
1. Rebuild Rust binary: `cargo build --release` in `oneclaw-node/`
2. Rebuild TypeScript: `npm run build` in root or affected packages
3. Restart oneclaw-node daemon
4. Restart API server
5. Hard refresh browser to get updated HTML/CSS

## Future Enhancements
- [ ] Auto-refresh tokens proactively before expiration
- [ ] Email notification when tokens are about to expire
- [ ] Show token expiration countdown in UI
- [ ] Batch reconnect for multiple expired accounts
- [ ] Token health monitoring dashboard
