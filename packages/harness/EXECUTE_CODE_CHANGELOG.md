# Changelog - Execute Code Tool

All notable changes to the execute-code tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-03-07

### 🚨 BREAKING CHANGES

#### Removed
- **vm2 dependency**: Replaced with Deno subprocess for security
- **`workingDirectory` parameter**: Code now runs in isolated `/tmp` directory
- **Implicit network access**: Network is now disabled by default

#### Changed
- **Maximum timeout**: Reduced from 60s to 30s
- **Environment access**: Code can no longer read `process.env` (security fix)
- **File system access**: No workspace reads/writes (security fix)

### ✨ Added

- **Deno sandbox**: Secure code execution with permission model
- **Network controls**: 
  - `allowNet` parameter for explicit network opt-in
  - `allowedDomains` parameter for domain whitelisting
- **Native TypeScript**: Deno runs TS directly, no transpile step
- **Security flags**:
  - `--no-env` - No environment variable access
  - `--no-read` - No file system reads
  - `--no-write` - No file system writes
  - `--no-run` - No subprocess spawning
  - `--no-ffi` - No native plugins
  - `--no-sys` - No system info

### 🔒 Security

- **Fixed**: CVE-2023-30547, CVE-2023-37466 (vm2 vulnerabilities)
- **Fixed**: Secrets leak via `process.env` access
- **Fixed**: Workspace file system access
- **Improved**: Proper sandbox isolation via Deno permissions
- **Improved**: Network access now requires explicit opt-in
- **Improved**: Bash execution with minimal environment

### 📝 Documentation

- Added `EXECUTE_CODE_SETUP.md` - Installation and setup guide
- Added `EXECUTE_CODE_MIGRATION.md` - Breaking changes and migration guide
- Added `EXECUTE_CODE_REFACTOR_SUMMARY.md` - Complete refactor overview
- Added comprehensive test suite with 50+ test cases

### 🧪 Testing

- Added `tests/execute-code-deno.test.ts` with comprehensive coverage:
  - JavaScript/TypeScript/Bash execution
  - Security boundary tests
  - Network access controls
  - Timeout protection
  - Error handling
  - Input validation
  - Real-world use cases

### 🛠 Technical Details

#### File Changes
- `src/tools/execute-code.ts` - Complete rewrite (~150 lines)
- `package.json` - Removed vm2 dependency
- Added installation scripts for Windows/macOS/Linux

#### New Dependencies
- **Runtime**: Deno (not a npm package, separate installation required)
- **Removed**: vm2 ^3.9.19

### Migration Guide

See [EXECUTE_CODE_MIGRATION.md](./EXECUTE_CODE_MIGRATION.md) for detailed migration instructions.

**Quick Migration:**

1. Install Deno:
   ```bash
   # macOS
   brew install deno
   
   # Windows
   irm https://deno.land/install.ps1 | iex
   
   # Linux
   curl -fsSL https://deno.land/x/install/install.sh | sh
   ```

2. Remove `workingDirectory` parameter (if used)

3. Add `allowNet: true` if your code needs network access

4. Ensure timeout ≤ 30s (was 60s)

### Upgrade Notes

**Zero Impact:**
- If you used default parameters
- If you only executed simple calculations
- If you didn't rely on file system access

**Requires Changes:**
- If you used `workingDirectory` → Remove parameter
- If you relied on network access → Add `allowNet: true`
- If you needed > 30s timeout → Optimize code or split tasks
- If you accessed `process.env` → Use explicit parameters instead

---

## [1.0.0] - Prior to 2026-03-07

### Initial Implementation

- JavaScript/TypeScript/Bash execution via vm2
- Timeout protection
- Workspace directory support
- Basic security blocklist
- Maximum 60s timeout

### Known Issues (Fixed in 2.0.0)

- ❌ vm2 sandbox escape vulnerabilities
- ❌ Secrets accessible via `process.env`
- ❌ Workspace file system access
- ❌ Uncontrolled network access
- ❌ TypeScript via tsx (leaked environment)

---

[2.0.0]: https://github.com/your-org/oneclaw/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/your-org/oneclaw/releases/tag/v1.0.0
