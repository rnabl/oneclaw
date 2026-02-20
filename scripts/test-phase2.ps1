# Phase 1 + Phase 2 integration test
# Prereqs: Start harness (pnpm --filter @oneclaw/harness dev) and Rust (cargo run -- daemon) in separate terminals first.
# Optional: -Quick skips the long-running golf execute (step 5).
param([switch]$Quick)

$ErrorActionPreference = "Stop"
$harness = "http://localhost:9000"
$rust = "http://localhost:8787"

Write-Host "`n=== 1. Harness health ===" -ForegroundColor Cyan
try {
    $h = Invoke-RestMethod -Uri "$harness/health" -Method Get -TimeoutSec 5
    Write-Host "OK: $($h | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 2. Harness /tools ===" -ForegroundColor Cyan
try {
    $t = Invoke-RestMethod -Uri "$harness/tools" -Method Get -TimeoutSec 5
    $count = ($t.tools | Measure-Object).Count
    Write-Host "OK: $count tools" -ForegroundColor Green
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 3. Rust daemon health ===" -ForegroundColor Cyan
try {
    $r = Invoke-RestMethod -Uri "$rust/health" -Method Get -TimeoutSec 5
    Write-Host "OK: $($r | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 4. Rust /executors (should include harness.execute) ===" -ForegroundColor Cyan
try {
    $e = Invoke-RestMethod -Uri "$rust/executors" -Method Get -TimeoutSec 5
    if ($e -is [array]) { $ids = $e.id } else { $ids = @($e).id }
    $hasHarness = ($ids | Where-Object { $_ -eq "harness.execute" }).Count -gt 0
    if ($hasHarness) { Write-Host "OK: harness.execute present" -ForegroundColor Green } else { Write-Host "IDs: $($ids -join ', ')" -ForegroundColor Gray }
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}

if (-not $Quick) {
Write-Host "`n=== 5. Direct harness execute (golf tee time) ===" -ForegroundColor Cyan
$body = @{
    workflowId = "golf-tee-time-booking"
    input = @{
        location = "Denver, CO"
        date = "2026-02-26"
        timeRange = "9-10AM"
        partySize = 4
        maxCourses = 1
    }
    tenantId = "test-user"
    tier = "pro"
} | ConvertTo-Json -Depth 5
try {
    $job = Invoke-RestMethod -Uri "$harness/execute" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 300
    Write-Host "OK: jobId=$($job.jobId) status=$($job.status)" -ForegroundColor Green
    if ($job.output) { Write-Host ($job.output | ConvertTo-Json -Depth 3 -Compress) }
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}
} else { Write-Host "`n=== 5. Skipped (use without -Quick to run golf execute)" -ForegroundColor Gray }

Write-Host "`n=== 6. Rust chat (should use SOUL + tools) ===" -ForegroundColor Cyan
$chatBody = @{ message = "What tools do you have? List them briefly." } | ConvertTo-Json
try {
    $chat = Invoke-RestMethod -Uri "$rust/chat" -Method Post -Body $chatBody -ContentType "application/json" -TimeoutSec 60
    Write-Host "OK: response length=$($chat.response.Length)" -ForegroundColor Green
    Write-Host $chat.response.Substring(0, [Math]::Min(500, $chat.response.Length))
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
