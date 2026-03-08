# Port Configuration Fix

## Problem

Ports were backwards from documentation:

**Code:**
- Daemon: 9000
- Harness: 8787

**Documentation:**
- Daemon: 8787 (main UI)
- Harness: 9000 (tools API)

## Solution

Fixed `oneclaw-node/src/ports.rs`:

```rust
/// Daemon - Rust agent runtime (Web UI)
pub const DAEMON_PORT: u16 = 8787;

/// Harness - workflow execution engine (Tools API)
pub const HARNESS_PORT: u16 = 9000;

/// API - REST API server (OAuth proxy)
pub const API_PORT: u16 = 3000;
```

## Correct Usage

```bash
# Start daemon (no --port flag needed)
cargo run -- daemon

# Daemon starts on port 8787
# Open: http://localhost:8787
```

Port is hardcoded in `ports.rs` - no CLI args, no env vars, no config.

## Why This Matters

1. **User Experience**: Main UI should be on 8787 (easy to remember: 87-87)
2. **Documentation**: All docs say daemon is on 8787
3. **Docker Compose**: Uses 8787 for daemon
4. **Consistency**: One source of truth for all ports

## Files Updated

- `oneclaw-node/src/ports.rs` - Swapped port constants
- `oneclaw-node/src/main.rs` - Updated CLI comment

All other files use `crate::ports::*` constants, so they automatically use correct ports.

## Dead Code Warnings

Build shows 57 warnings for unused code (Discord, JobMonitor, etc.). These are **not errors** - just unused features. Can be:

1. Left as-is (for future features)
2. Commented out with `#[allow(dead_code)]`
3. Removed if truly not needed

**Recommendation**: Leave them. They're future features that don't hurt anything.
