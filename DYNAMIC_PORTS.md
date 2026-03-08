# Dynamic Port Configuration

## Changes Made

### Before (Hardcoded)
```bash
cargo run -- daemon
# Always starts on port 8787 (from ports.rs constant)
# No way to change without editing code
```

### After (Dynamic with Default)
```bash
# Default port (8787)
cargo run -- daemon

# Custom port
cargo run -- daemon --port 8888

# See help
cargo run -- daemon --help
```

## Implementation

### `oneclaw-node/src/main.rs`
```rust
#[derive(Subcommand)]
enum Commands {
    /// Start the node daemon (Web UI)
    Daemon {
        /// Port to bind to (default: 8787)
        #[arg(short, long, default_value_t = 8787)]
        port: u16,
    },
    // ...
}

// Usage:
Commands::Daemon { port } => {
    daemon::start(port).await?;
}
```

### `oneclaw-node/src/ports.rs`
Updated comments to reflect daemon port is now configurable.

## Usage Examples

```bash
# Default (8787)
cargo run -- daemon
cargo run --release -- daemon

# Custom port (8888)
cargo run -- daemon --port 8888
cargo run -- daemon -p 8888

# Production
./target/release/oneclaw-node daemon --port 8787
```

## Docker Support

Docker Compose can override:

```yaml
daemon:
  command: ["oneclaw-node", "daemon", "--port", "8888"]
  ports:
    - "8888:8888"  # Map host:container
```

## Benefits

1. **Flexibility** - Run multiple instances on different ports
2. **Testing** - Easy to avoid port conflicts
3. **Development** - No code changes for different ports
4. **Docker** - Can customize in docker-compose.yml
5. **Backwards Compatible** - Default is still 8787

## Port Reference

| Service | Default Port | Configurable? |
|---------|--------------|---------------|
| Daemon | 8787 | ✅ Yes (--port flag) |
| Harness | 9000 | ❌ No (hardcoded) |
| API | 3000 | ❌ No (hardcoded) |

**Why only Daemon?**
- Daemon is user-facing (UI)
- Harness/API are internal (daemon calls them)
- Daemon port conflicts are most common

## Breaking Change?

**No** - Default behavior unchanged:
- `cargo run -- daemon` still uses 8787
- Existing scripts work as-is
- Just adds optional `--port` flag
