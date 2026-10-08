# Installs and builds YakGPT on Windows.
#
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Ollama
#
# Afterwards double-click yakgpt.cmd (or run `node scripts\start.mjs`) and open
# http://localhost:3000
param(
  [switch]$Ollama
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$Root = (Get-Location).Path

function Info($text) { Write-Host "==> $text" -ForegroundColor Magenta }
function Fail($text) { Write-Host "error: $text" -ForegroundColor Red; exit 1 }

function Test-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  $version = [version](node -p "process.versions.node")
  return $version -ge [version]"20.9.0"
}

# 1. Node.js
if (-not (Test-Node)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Info "Installing Node.js LTS with winget"
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    # Pick up the new PATH without reopening the terminal
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  }
  if (-not (Test-Node)) {
    Fail "Node.js 20.9 or newer is required. Install the LTS version from https://nodejs.org and run this script again."
  }
}
Info "Node.js $(node -v)"

# 2. Dependencies (the repository pins Yarn 1)
Info "Installing dependencies"
npx --yes yarn@1.22.22 install --frozen-lockfile --network-timeout 600000
if ($LASTEXITCODE -ne 0) { Fail "Installing dependencies failed" }

# 3. Build
Info "Building"
npx --yes yarn@1.22.22 build
if ($LASTEXITCODE -ne 0) { Fail "Build failed" }

# 4. A launcher you can double-click
$launcher = Join-Path $Root "yakgpt.cmd"
Set-Content -Path $launcher -Encoding ASCII -Value "@echo off`r`nnode `"%~dp0scripts\start.mjs`" --open %*`r`n"
Info "Created $launcher"

# 5. Optional: Ollama for local models
if ($Ollama) {
  if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Info "Ollama is already installed"
  } elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    Info "Installing Ollama with winget"
    winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
  } else {
    Write-Host "Install Ollama from https://ollama.com/download"
  }
}

Write-Host ""
Info "Done. Start YakGPT by double-clicking yakgpt.cmd, or run:  node scripts\start.mjs --open"
