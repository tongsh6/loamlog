# Distill Built-ins Boundary Spec

## Purpose

Define the runtime ownership boundary between the generic distill engine and the CLI bootstrap path for built-in distillers and sinks.

## Problem

`@loamlog/distill` currently depends directly on built-in implementation packages, while the actual default bootstrap behavior is driven by `@loamlog/cli`.

This couples the generic engine package to first-party product defaults and makes future built-in additions more likely to leak into the framework layer.

## Decision

- `@loamlog/distill` remains a generic dynamic-loading engine
- `@loamlog/cli` owns built-in plugin availability for default CLI execution
- built-in package-specifier normalization happens in the CLI layer, not in the engine layer
- the built-in set for this refactor is exactly:
  - `@loamlog/distiller-pitfall-card`
  - `@loamlog/distiller-issue-draft`
  - `@loamlog/sink-file`

## In Scope

- move built-in dependency ownership from `packages/distill` to `packages/cli`
- preserve the current user-facing built-in names such as `@loamlog/distiller-pitfall-card`, `@loamlog/distiller-issue-draft`, and `@loamlog/sink-file`
- make CLI config/default handling normalize built-in specifiers into runtime-loadable file URL specifiers before engine loading
- add tests that prove the CLI path still loads built-ins after the dependency move

## Out of Scope

- introducing a second plugin registration framework
- changing public built-in package names
- changing local path plugin loading behavior
- plugin marketplace or discovery work

## Acceptance

- `packages/distill/package.json` no longer owns direct dependencies on built-in distiller/sink packages
- `packages/cli/package.json` owns the built-in packages needed by default `loam distill` execution
- `packages/distill/src/engine.ts` and `packages/distill/src/registry.ts` stay generic and do not gain built-in-specific mapping logic
- CLI tests cover default built-in loading, config-provided built-in package names, and explicit `--distiller @loamlog/distiller-issue-draft` execution
- build, tests, and typecheck all pass after the refactor

## Notes

This spec is intentionally narrow. It fixes dependency ownership and bootstrap boundaries without expanding product scope.
