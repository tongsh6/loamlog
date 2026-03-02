param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$TitleZh,

    [Parameter(Mandatory = $true)]
    [string]$TitleEn
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$aiefDir = Split-Path -Parent $scriptDir
$contextDir = Join-Path $aiefDir "context"
$templatePath = Join-Path $contextDir "DOC_TEMPLATE.md"

if (-not (Test-Path -LiteralPath $templatePath)) {
    Write-Error "Template not found: $templatePath"
    exit 1
}

$resolvedPath = $Path
if (-not [System.IO.Path]::IsPathRooted($resolvedPath)) {
    $resolvedPath = Join-Path (Split-Path -Parent $aiefDir) $resolvedPath
}

if ([System.IO.Path]::GetExtension($resolvedPath) -ne ".md") {
    $resolvedPath = "$resolvedPath.md"
}

if (Test-Path -LiteralPath $resolvedPath) {
    Write-Error "File already exists: $resolvedPath"
    exit 1
}

$parentDir = Split-Path -Parent $resolvedPath
if (-not (Test-Path -LiteralPath $parentDir)) {
    New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
}

$template = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8

$content = $template
$content = $content.Replace("{{TITLE_ZH}}", $TitleZh)
$content = $content.Replace("{{TITLE_EN}}", $TitleEn)
$content = $content.Replace("{{BACKGROUND_ZH}}", "请填写背景说明。")
$content = $content.Replace("{{BACKGROUND_EN}}", "Please fill in the background.")
$content = $content.Replace("{{GOAL_1_ZH}}", "请填写目标 1")
$content = $content.Replace("{{GOAL_1_EN}}", "Fill goal 1")
$content = $content.Replace("{{GOAL_2_ZH}}", "请填写目标 2")
$content = $content.Replace("{{GOAL_2_EN}}", "Fill goal 2")
$content = $content.Replace("{{APPROACH_ZH}}", "请填写方案说明。")
$content = $content.Replace("{{APPROACH_EN}}", "Please fill in the approach.")
$content = $content.Replace("{{POINT_1_ZH}}", "请填写关键点 1")
$content = $content.Replace("{{POINT_1_EN}}", "Fill key point 1")
$content = $content.Replace("{{POINT_2_ZH}}", "请填写关键点 2")
$content = $content.Replace("{{POINT_2_EN}}", "Fill key point 2")
$content = $content.Replace("{{RISK_1_ZH}}", "请填写风险 1")
$content = $content.Replace("{{RISK_1_EN}}", "Fill risk 1")
$content = $content.Replace("{{RISK_2_ZH}}", "请填写风险 2")
$content = $content.Replace("{{RISK_2_EN}}", "Fill risk 2")
$content = $content.Replace("{{CRITERION_1_ZH}}", "请填写验收标准 1")
$content = $content.Replace("{{CRITERION_1_EN}}", "Fill acceptance criterion 1")
$content = $content.Replace("{{CRITERION_2_ZH}}", "请填写验收标准 2")
$content = $content.Replace("{{CRITERION_2_EN}}", "Fill acceptance criterion 2")
$content = $content.Replace("{{REF_1}}", "link-or-note-1")
$content = $content.Replace("{{REF_2}}", "link-or-note-2")

Set-Content -LiteralPath $resolvedPath -Value $content -Encoding UTF8

Write-Host "Created bilingual doc: $resolvedPath"
exit 0
