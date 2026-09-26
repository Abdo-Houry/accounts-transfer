# Starts everything a demo needs and prints the public link.
#
# Written in PowerShell and calling the binaries directly on purpose: while the
# project lives in a folder whose name contains "&", `npm run` is broken on
# Windows (cmd.exe reads the ampersand as a command separator), so any script
# that goes through npm would fail here.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1
#
# Leave the window open for as long as the demo link needs to work. Ctrl+C
# stops the tunnel; the API keeps running unless this script started it.

$ErrorActionPreference = 'Stop'

$backend = Split-Path -Parent $PSScriptRoot
Set-Location $backend

$port = 4000
$healthUrl = "http://localhost:$port/api/v1/health"

# A shell opened before cloudflared was installed still carries the old PATH,
# and anything it launches inherits it - so the executable is resolved by hand
# rather than trusted to be on PATH.
function Resolve-Cloudflared {
    $onPath = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }

    $candidates = @(
        "$env:ProgramFiles\cloudflared\cloudflared.exe",
        "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe",
        "$env:USERPROFILE\.cloudflared\cloudflared.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }

    throw "cloudflared was not found. Install it with: winget install Cloudflare.cloudflared"
}

function Test-Api {
    try {
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $healthUrl | Out-Null
        return $true
    } catch {
        return $false
    }
}

# ------------------------------------------------------------- the database
# Checked first because an API that cannot reach Postgres fails during startup
# with a connection error, which reads as "the app is broken" rather than "the
# database service is not running".
$postgres = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($postgres) {
    if ($postgres.Status -ne 'Running') {
        Write-Host "PostgreSQL ($($postgres.Name)) is not running." -ForegroundColor Red
        Write-Host "Start it from an ADMIN PowerShell with:" -ForegroundColor Yellow
        Write-Host "    net start $($postgres.Name)" -ForegroundColor White
        exit 1
    }
    Write-Host "PostgreSQL is running." -ForegroundColor DarkGray
} else {
    Write-Host "No PostgreSQL service found - assuming it runs elsewhere." -ForegroundColor DarkGray
}

# ---------------------------------------------------------------- the API
$startedApi = $false

if (Test-Api) {
    Write-Host "API already running on port $port." -ForegroundColor DarkGray
} else {
    Write-Host "Starting the API..." -ForegroundColor Cyan
    $tsNode = Join-Path $backend 'node_modules\.bin\ts-node.cmd'
    if (-not (Test-Path $tsNode)) { throw "ts-node not found. Run the dependency install first." }

    Start-Process -FilePath $tsNode `
        -ArgumentList '-r', 'tsconfig-paths/register', 'src/server.ts' `
        -WorkingDirectory $backend `
        -WindowStyle Minimized
    $startedApi = $true

    $ready = $false
    foreach ($attempt in 1..40) {
        Start-Sleep -Seconds 1
        if (Test-Api) { $ready = $true; break }
    }
    if (-not $ready) { throw "The API did not come up. Check backend\server.log." }
    Write-Host "API is up." -ForegroundColor Green
}

# Without a build on disk the tunnel would serve an API with no interface.
$dist = Join-Path (Split-Path -Parent $backend) 'frontend\dist\index.html'
if (-not (Test-Path $dist)) {
    Write-Host "WARNING: no frontend build found - build it first, or the link shows only the API." -ForegroundColor Yellow
}

# --------------------------------------------------------------- the link
Write-Host "Opening the public tunnel..." -ForegroundColor Cyan

$logPath = Join-Path $backend 'tunnel.log'
if (Test-Path $logPath) { Remove-Item $logPath -Force }

$cloudflared = Resolve-Cloudflared

# Getting a URL is not the same as having a working tunnel: cloudflared prints
# the address first and only then registers the connection, and that
# registration can fail ("context deadline exceeded") while the URL sits in the
# log looking fine. So both are waited for - and a failure retries over HTTP/2,
# which gets through networks that throttle or block the default QUIC/UDP path.
function Start-Tunnel {
    param([string[]] $ExtraArgs, [string] $Label)

    Write-Host "  connecting$Label..." -ForegroundColor DarkGray
    if (Test-Path $logPath) { Remove-Item $logPath -Force }

    $arguments = @('tunnel', '--url', "http://localhost:$port", '--no-autoupdate') + $ExtraArgs
    $process = Start-Process -FilePath $cloudflared `
        -ArgumentList $arguments `
        -RedirectStandardError $logPath `
        -WorkingDirectory $backend `
        -WindowStyle Hidden `
        -PassThru

    $url = $null
    foreach ($attempt in 1..45) {
        Start-Sleep -Seconds 1
        if (-not (Test-Path $logPath)) { continue }
        $text = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
        if (-not $text) { continue }

        if (-not $url -and $text -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
            $url = $Matches[0]
        }
        if ($text -match 'Registered tunnel connection') {
            return [pscustomobject]@{ Process = $process; Url = $url }
        }
        if ($text -match 'Initiating shutdown' -or $process.HasExited) {
            break
        }
    }

    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    return $null
}

$result = Start-Tunnel -ExtraArgs @() -Label ''
if (-not $result) {
    Write-Host "  first attempt did not register - retrying over HTTP/2" -ForegroundColor Yellow
    $result = Start-Tunnel -ExtraArgs @('--protocol', 'http2') -Label ' over HTTP/2'
}

if (-not $result -or -not $result.Url) {
    Write-Host "Could not establish the tunnel. See $logPath" -ForegroundColor Red
    exit 1
}

$tunnel = $result.Process
$publicUrl = $result.Url

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  $publicUrl" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  demo / Demo-View-2026!   (read-only - safe to share)" -ForegroundColor White
Write-Host ""
Write-Host "  The link dies when this window closes, when the PC" -ForegroundColor DarkGray
Write-Host "  sleeps, or when the connection drops. Restarting" -ForegroundColor DarkGray
Write-Host "  produces a DIFFERENT url - re-send it if you restart." -ForegroundColor DarkGray
Write-Host ""

try { Set-Clipboard -Value $publicUrl; Write-Host "  (copied to clipboard)" -ForegroundColor DarkGray } catch {}

Write-Host "Press Ctrl+C to close the link." -ForegroundColor Yellow

try {
    Wait-Process -Id $tunnel.Id
} finally {
    if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "Tunnel closed." -ForegroundColor DarkGray
    if ($startedApi) { Write-Host "The API window is still open - close it when you are done." -ForegroundColor DarkGray }
}
