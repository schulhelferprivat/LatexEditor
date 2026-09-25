$project = Split-Path -Parent $PSScriptRoot
$target = Join-Path $env:LOCALAPPDATA 'LatexHelper\target'
$bridge = Join-Path $target 'release\latexhelper-bridge.exe'

if (-not (Test-Path $bridge)) {
    & cargo build --manifest-path (Join-Path $project 'bridge\Cargo.toml') --target-dir $target --release
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

$env:LATEXHELPER_DIST = Join-Path $project 'dist'
& $bridge
