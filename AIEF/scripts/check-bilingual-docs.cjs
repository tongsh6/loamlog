#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

function parseArgs(argv) {
  const args = { strict: false, rootPath: undefined }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === "--strict") {
      args.strict = true
      continue
    }
    if (token === "--rootPath") {
      const value = argv[i + 1]
      if (!value || value.startsWith("--")) {
        throw new Error("--rootPath requires a value")
      }
      args.rootPath = value
      i += 1
      continue
    }
    if (token === "-h" || token === "--help") {
      printHelp()
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${token}`)
  }
  return args
}

function printHelp() {
  console.log("Usage: node AIEF/scripts/check-bilingual-docs.cjs [--rootPath <path>] [--strict]")
}

function collectMarkdownFiles(dir) {
  const out = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectMarkdownFiles(fullPath))
      continue
    }
    if (entry.isFile() && fullPath.toLowerCase().endsWith(".md")) {
      out.push(fullPath)
    }
  }
  return out
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    printHelp()
    process.exit(1)
  }

  const scriptDir = __dirname
  const aiefDir = path.resolve(scriptDir, "..")
  const defaultRoot = path.join(aiefDir, "context")
  const rootPath = path.resolve(process.cwd(), args.rootPath || defaultRoot)

  if (!fs.existsSync(rootPath)) {
    console.error(`Path not found: ${rootPath}`)
    process.exit(1)
  }

  const files = collectMarkdownFiles(rootPath)
  if (files.length === 0) {
    console.log(`No markdown files found under: ${rootPath}`)
    return
  }

  const failed = []
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8")
    const hasZh = /[\u4e00-\u9fff]/.test(content)
    const hasEn = /[A-Za-z]/.test(content)

    if (!hasZh || !hasEn) {
      const missing = []
      if (!hasZh) missing.push("ZH")
      if (!hasEn) missing.push("EN")
      failed.push({ file, missing: missing.join(","), reason: "missing_language" })
      continue
    }

    if (args.strict) {
      const headerLines = content.split(/\r?\n/).filter((line) => /^#{1,6}\s+/.test(line))
      const hasBilingualHeader = headerLines.some((line) => line.includes("|"))
      if (!hasBilingualHeader) {
        failed.push({ file, missing: "BILINGUAL_HEADER", reason: "strict_header" })
      }
    }
  }

  if (failed.length > 0) {
    console.error(`Bilingual check failed: ${failed.length} file(s).`)
    for (const item of failed) {
      console.error(`- ${item.file} | Missing: ${item.missing} | Reason: ${item.reason}`)
    }
    process.exit(1)
  }

  console.log(`Bilingual check passed: ${files.length} file(s).`)
}

main()
