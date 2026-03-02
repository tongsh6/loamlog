param(
    [string]$RootPath,
    [switch]$Strict
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$aiefDir = Split-Path -Parent $scriptDir

if ([string]::IsNullOrWhiteSpace($RootPath)) {
    $RootPath = Join-Path $aiefDir "context"
}

if (-not (Test-Path -LiteralPath $RootPath)) {
    Write-Error "Path not found: $RootPath"
    exit 1
}

$files = Get-ChildItem -LiteralPath $RootPath -Recurse -File -Filter "*.md"

if ($files.Count -eq 0) {
    Write-Host "No markdown files found under: $RootPath"
    exit 0
}

$failed = @()

foreach ($file in $files) {
    $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8

    $hasZh = $content -match "[\u4e00-\u9fff]"
    $hasEn = $content -match "[A-Za-z]"

    if (-not $hasZh -or -not $hasEn) {
        $missing = @()
        if (-not $hasZh) { $missing += "ZH" }
        if (-not $hasEn) { $missing += "EN" }

        $failed += [PSCustomObject]@{
            File = $file.FullName
            Missing = ($missing -join ",")
            Reason = "missing_language"
        }
        continue
    }

    if ($Strict) {
        $headerLines = ($content -split "`r?`n") | Where-Object { $_ -match "^#{1,6}\s+" }
        $hasBilingualHeader = $false
        foreach ($line in $headerLines) {
            if ($line -match "\|") {
                $hasBilingualHeader = $true
                break
            }
        }

        if (-not $hasBilingualHeader) {
            $failed += [PSCustomObject]@{
                File = $file.FullName
                Missing = "BILINGUAL_HEADER"
                Reason = "strict_header"
            }
        }
    }
}

if ($failed.Count -gt 0) {
    Write-Host "Bilingual check failed: $($failed.Count) file(s)." -ForegroundColor Red
    $failed | Format-Table -AutoSize
    exit 1
}

Write-Host "Bilingual check passed: $($files.Count) file(s)." -ForegroundColor Green
exit 0
