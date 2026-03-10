# Current Focus Spec

## Purpose

Keep the repository aligned around the current product question without pretending unfinished features already exist.

## Shipped Truth

- Capture, archive, redaction, and local file-based distill already exist in the repository
- Multi-model LLM routing already exists
- The Claude Code provider path also exists in the repository, so multi-source provider abstraction is no longer purely theoretical

## Active Product Focus

```text
AI conversation -> structured evidence -> local issue draft
```

This means:

- generate a local issue draft from a single session
- keep the first loop local-first
- validate output quality before automating external delivery

## Active Issues

- `#7` umbrella
- `#12` issue-draft distiller MVP
- `#13` file sink Markdown output
- `#14` post-implementation docs

## Deferred Topics

- `#5` umbrella and `#9/#10/#11` discovery work
- `#6` auto-skill generation
- GitHub API delivery
- approval/review workflow
- multi-session merge

## Close Conditions

Close `#7` only after:

- `#12` is done
- `#13` is done
- `#14` is done

Close `#5` only after:

- `#9` is done
- `#10` is done
- `#11` is done
