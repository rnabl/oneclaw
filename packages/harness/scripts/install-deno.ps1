# Install Deno for Execute Code Tool
# This script installs Deno on Windows using the official installer

Write-Host "Installing Deno..." -ForegroundColor Green

# Download and install Deno
irm https://deno.land/install.ps1 | iex

# Add Deno to PATH for current session
$env:Path += ";$env:USERPROFILE\.deno\bin"

Write-Host ""
Write-Host "Deno installed successfully!" -ForegroundColor Green
Write-Host "Location: $env:USERPROFILE\.deno\bin" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verifying installation..." -ForegroundColor Yellow
deno --version

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Note: You may need to restart your terminal for the PATH changes to take effect." -ForegroundColor Yellow
Write-Host "If 'deno' command is not found after restart, add this to your PATH manually:" -ForegroundColor Yellow
Write-Host "  $env:USERPROFILE\.deno\bin" -ForegroundColor Cyan
