/// SINGLE SOURCE OF TRUTH FOR ALL PORTS
/// 
/// DO NOT use environment variables for ports.
/// DO NOT use CLI arguments for ports.
/// DO NOT use config files for ports.
/// 
/// If you need to change a port, change it HERE and rebuild.

/// Harness - workflow execution engine
pub const HARNESS_PORT: u16 = 8787;

/// Daemon - Rust gateway/proxy  
pub const DAEMON_PORT: u16 = 9000;

/// API - REST API server
pub const API_PORT: u16 = 3000;

/// Internal URLs
pub const HARNESS_URL: &str = "http://localhost:8787";
pub const DAEMON_URL: &str = "http://localhost:9000";
pub const API_URL: &str = "http://localhost:3000";
