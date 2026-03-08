/// PORT CONFIGURATION
/// 
/// Daemon port is configurable via CLI: `daemon --port 8787`
/// Harness and API ports are hardcoded below.
/// 
/// If you need to change Harness/API ports, change them HERE and rebuild.

/// Daemon - Rust agent runtime (Web UI)
/// Default: 8787, but configurable via CLI
pub const DAEMON_PORT: u16 = 8787;

/// Harness - workflow execution engine (Tools API)
/// Hardcoded - daemon expects this
pub const HARNESS_PORT: u16 = 9000;

/// API - REST API server (OAuth proxy)
/// Hardcoded
pub const API_PORT: u16 = 3000;

/// Internal URLs (used by daemon to call harness/api)
pub const DAEMON_URL: &str = "http://localhost:8787";
pub const HARNESS_URL: &str = "http://localhost:9000";
pub const API_URL: &str = "http://localhost:3000";
