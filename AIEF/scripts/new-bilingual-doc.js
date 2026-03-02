#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

function printHelp() {
  console.log(
    "Usage: node AIEF/scripts/new-bilingual-doc.js --path <relative-or-absolute-path> --titleZh <title-zh> --titleEn <title-en>",
  )
}

function parseArgs(argv) {
  const args = {
    path: "",
    titleZh: "",
    titleEn: "",
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === "-h" || token === "--help") {
      printHelp()
      process.exit(0)
    }

    if (token === "--path" || token === "--titleZh" || token === "--titleEn") {
      const value = argv[i + 1]
      if (!value || value.startsWith("--")) {
        throw new Error(`${token} requires a value`)
      }
      const key = token.replace(/^--/, "")
      args[key] = value
      i += 1
      continue
    }

    throw new Error(`Unknown argument: ${token}`)
  }

  if (!args.path || !args.titleZh || !args.titleEn) {
    throw new Error("--path, --titleZh, and --titleEn are required")
  }

  return args
}

function fillTemplate(template, args) {
  const replacements = {
    "{{TITLE_ZH}}": args.titleZh,
    "{{TITLE_EN}}": args.titleEn,
    "{{BACKGROUND_ZH}}": "请填写背景说明。",
    "{{BACKGROUND_EN}}": "Please fill in the background.",
    "{{GOAL_1_ZH}}": "请填写目标 1",
    "{{GOAL_1_EN}}": "Fill goal 1",
    "{{GOAL_2_ZH}}": "请填写目标 2",
    "{{GOAL_2_EN}}": "Fill goal 2",
    "{{APPROACH_ZH}}": "请填写方案说明。",
    "{{APPROACH_EN}}": "Please fill in the approach.",
    "{{POINT_1_ZH}}": "请填写关键点 1",
    "{{POINT_1_EN}}": "Fill key point 1",
    "{{POINT_2_ZH}}": "请填写关键点 2",
    "{{POINT_2_EN}}": "Fill key point 2",
    "{{RISK_1_ZH}}": "请填写风险 1",
    "{{RISK_1_EN}}": "Fill risk 1",
    "{{RISK_2_ZH}}": "请填写风险 2",
    "{{RISK_2_EN}}": "Fill risk 2",
    "{{CRITERION_1_ZH}}": "请填写验收标准 1",
    "{{CRITERION_1_EN}}": "Fill acceptance criterion 1",
    "{{CRITERION_2_ZH}}": "请填写验收标准 2",
    "{{CRITERION_2_EN}}": "Fill acceptance criterion 2",
    "{{REF_1}}": "link-or-note-1",
    "{{REF_2}}": "link-or-note-2",
  }

  let content = template
  for (const [key, value] of Object.entries(replacements)) {
    content = content.split(key).join(value)
  }
  return content
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
  const templatePath = path.join(aiefDir, "context", "DOC_TEMPLATE.md")

  if (!fs.existsSync(templatePath)) {
    console.error(`Template not found: ${templatePath}`)
    process.exit(1)
  }

  const inputPath = path.isAbsolute(args.path) ? args.path : path.resolve(process.cwd(), args.path)
  const targetPath = path.extname(inputPath).toLowerCase() === ".md" ? inputPath : `${inputPath}.md`

  if (fs.existsSync(targetPath)) {
    console.error(`File already exists: ${targetPath}`)
    process.exit(1)
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })

  const template = fs.readFileSync(templatePath, "utf8")
  const content = fillTemplate(template, args)
  fs.writeFileSync(targetPath, content, "utf8")

  console.log(`Created bilingual doc: ${targetPath}`)
}

main()
