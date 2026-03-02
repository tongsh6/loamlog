#!/usr/bin/env node
/**
 * scripts/aief.mjs
 *
 * AIEF maintenance tool.
 *
 * Usage:
 *   node scripts/aief.mjs migrate --to-base-dir AIEF [--dry-run]
 *
 * Subcommands:
 *   migrate   Rename all stale references across AIEF markdown docs:
 *             AICapture → Loamlog, @aicapture → @loamlog,
 *             AIC_DUMP_DIR → LOAM_DUMP_DIR, AIC_REDACT_IGNORE → LOAM_REDACT_IGNORE,
 *             AIC_PORT → LOAM_PORT, aic_version → loam_version,
 *             `aic ` CLI → `loam `, aicapture-archive → loamlog-archive
 *
 *   verify    Re-run check-bilingual-docs.js and report results.
 */

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Rename rules ──────────────────────────────────────────────────────────
// Each rule is { pattern: RegExp, replacement: string | ((m) => string) }
// Applied in order; later rules do NOT re-process text replaced by earlier rules.
const RENAME_RULES = [
  // npm scope + package names
  { pattern: /@aicapture\/distiller-sdk/g, replacement: "@loamlog/distiller-sdk" },
  { pattern: /@aicapture\/provider-opencode/g, replacement: "@loamlog/provider-opencode" },
  { pattern: /@aicapture\/plugin-opencode/g, replacement: "@loamlog/plugin-opencode" },
  { pattern: /@aicapture\/distiller/g, replacement: "@loamlog/distiller" },
  { pattern: /@aicapture\//g, replacement: "@loamlog/" },

  // Environment variables (longest match first)
  { pattern: /AIC_REDACT_IGNORE/g, replacement: "LOAM_REDACT_IGNORE" },
  { pattern: /AIC_DUMP_DIR/g, replacement: "LOAM_DUMP_DIR" },
  { pattern: /AIC_PORT/g, replacement: "LOAM_PORT" },

  // Snapshot meta field
  { pattern: /\baic_version\b/g, replacement: "loam_version" },

  // Config file name in docs (aic.config.ts → loam.config.ts)
  { pattern: /\baic\.config\.ts\b/g, replacement: "loam.config.ts" },

  // CLI commands: `aic <subcommand>` → `loam <subcommand>`
  // Only replace when `aic` is a CLI invocation (preceded by backtick, space, or start-of-string)
  { pattern: /(`\s*)aic(\s+(?:capture|distill|daemon|list|version))/g, replacement: "$1loam$2" },
  { pattern: /\baic distill\b/g, replacement: "loam distill" },
  { pattern: /\baic capture\b/g, replacement: "loam capture" },
  { pattern: /\baic daemon\b/g, replacement: "loam daemon" },
  { pattern: /\baic list\b/g, replacement: "loam list" },

  // Archive directory suggestions in docs
  { pattern: /aicapture-archive/g, replacement: "loamlog-archive" },

  // Product name — must come last to avoid partial matches above
  { pattern: /\bAICapture\b/g, replacement: "Loamlog" },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

function collectMarkdownFiles(dir) {
  const out = []
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectMarkdownFiles(fullPath))
    } else if (entry.isFile() && fullPath.toLowerCase().endsWith(".md")) {
      out.push(fullPath)
    }
  }
  return out
}

function applyRules(content) {
  let result = content
  for (const rule of RENAME_RULES) {
    result = result.replace(rule.pattern, rule.replacement)
  }
  return result
}

function diffLines(before, after) {
  const beforeLines = before.split("\n")
  const afterLines = after.split("\n")
  const changes = []
  for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
    const b = beforeLines[i] ?? ""
    const a = afterLines[i] ?? ""
    if (b !== a) {
      changes.push({ line: i + 1, before: b, after: a })
    }
  }
  return changes
}

// ─── Subcommand: migrate ───────────────────────────────────────────────────

function runMigrate(baseDir, dryRun) {
  const absBase = path.resolve(process.cwd(), baseDir)
  if (!fs.existsSync(absBase)) {
    console.error(`[aief migrate] Directory not found: ${absBase}`)
    process.exit(1)
  }

  const files = collectMarkdownFiles(absBase)
  if (files.length === 0) {
    console.log(`[aief migrate] No markdown files found under: ${absBase}`)
    return
  }

  console.log(`[aief migrate] Scanning ${files.length} markdown file(s) under: ${absBase}`)
  if (dryRun) {
    console.log(`[aief migrate] DRY RUN — no files will be modified\n`)
  }

  let totalChangedFiles = 0
  let totalChangedLines = 0

  for (const file of files) {
    const original = fs.readFileSync(file, "utf8")
    const updated = applyRules(original)

    if (original === updated) continue

    const changes = diffLines(original, updated)
    totalChangedFiles++
    totalChangedLines += changes.length

    const rel = path.relative(process.cwd(), file)
    if (dryRun) {
      console.log(`  [would change] ${rel} (${changes.length} line(s))`)
      for (const c of changes) {
        console.log(`    L${c.line}  - ${c.before}`)
        console.log(`    L${c.line}  + ${c.after}`)
      }
      console.log()
    } else {
      fs.writeFileSync(file, updated, "utf8")
      console.log(`  [changed] ${rel} (${changes.length} line(s))`)
    }
  }

  if (totalChangedFiles === 0) {
    console.log(`[aief migrate] Nothing to migrate — all docs are up to date.`)
    return
  }

  console.log()
  if (dryRun) {
    console.log(
      `[aief migrate] DRY RUN complete: ${totalChangedFiles} file(s), ${totalChangedLines} line(s) would be updated.`
    )
    console.log(`[aief migrate] Run without --dry-run to apply changes.`)
  } else {
    console.log(
      `[aief migrate] Done: ${totalChangedFiles} file(s), ${totalChangedLines} line(s) updated.`
    )
    runVerify(baseDir)
  }
}

// ─── Subcommand: verify ────────────────────────────────────────────────────

function runVerify(baseDir) {
  const checkScript = path.resolve(__dirname, "..", "AIEF", "scripts", "check-bilingual-docs.cjs")
  if (!fs.existsSync(checkScript)) {
    console.warn(`[aief verify] check-bilingual-docs.cjs not found at: ${checkScript}`)
    return
  }

  console.log(`\n[aief verify] Running bilingual check on: ${baseDir}`)
  const result = spawnSync(
    process.execPath,
    [checkScript, "--rootPath", path.resolve(process.cwd(), baseDir, "context")],
    { stdio: "inherit" }
  )
  if (result.status !== 0) {
    console.error(`[aief verify] Bilingual check FAILED.`)
    process.exit(result.status ?? 1)
  }
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
Usage: node scripts/aief.mjs <subcommand> [options]

Subcommands:
  migrate   Rename stale AICapture/AIC_* references in AIEF docs
  verify    Check bilingual coverage of AIEF docs

Options for migrate:
  --to-base-dir <dir>   Base directory containing AIEF docs  (default: AIEF)
  --dry-run             Preview changes without writing files

Examples:
  node scripts/aief.mjs migrate --to-base-dir AIEF --dry-run
  node scripts/aief.mjs migrate --to-base-dir AIEF
  node scripts/aief.mjs verify  --to-base-dir AIEF
`)
}

function parseArgs(argv) {
  const args = { subcommand: null, baseDir: "AIEF", dryRun: false }
  let i = 0

  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    printHelp()
    process.exit(0)
  }

  args.subcommand = argv[i++]

  while (i < argv.length) {
    const token = argv[i]
    if (token === "--to-base-dir") {
      const value = argv[i + 1]
      if (!value || value.startsWith("--")) {
        console.error("--to-base-dir requires a value")
        process.exit(1)
      }
      args.baseDir = value
      i += 2
    } else if (token === "--dry-run") {
      args.dryRun = true
      i++
    } else if (token === "-h" || token === "--help") {
      printHelp()
      process.exit(0)
    } else {
      console.error(`Unknown argument: ${token}`)
      process.exit(1)
    }
  }

  return args
}

const args = parseArgs(process.argv.slice(2))

switch (args.subcommand) {
  case "migrate":
    runMigrate(args.baseDir, args.dryRun)
    break
  case "verify":
    runVerify(args.baseDir)
    break
  default:
    console.error(`Unknown subcommand: ${args.subcommand}`)
    printHelp()
    process.exit(1)
}
