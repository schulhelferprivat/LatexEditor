$project = Split-Path -Parent $PSScriptRoot
$target = Join-Path $env:LOCALAPPDATA 'LatexHelper\target'
$bridge = Join-Path $target 'release\latexhelper-bridge.exe'

$running = Get-Process -Name latexhelper-bridge -ErrorAction SilentlyContinue
if ($running) {
    $running | Stop-Process -Force
    Start-Sleep -Milliseconds 500
}

& cargo build --manifest-path (Join-Path $project 'bridge\Cargo.toml') --target-dir $target --release --locked
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$env:LATEXHELPER_DIST = Join-Path $project 'dist'
& $bridge
