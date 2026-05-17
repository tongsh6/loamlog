import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  AssetCandidate,
  VerificationReport,
  VerifierContext,
  VerifierPlugin,
} from "@loamlog/core";

const execAsync = promisify(exec);

/**
 * P0 Verifier: Implementation Gap Analysis.
 * Checks if the suggested file changes have already been committed.
 */
export class GitGapVerifier implements VerifierPlugin {
  id = "@loamlog/verifier-git-gap";
  name = "Git Implementation Gap Verifier";

  async verify(
    candidate: AssetCandidate,
    ctx: VerifierContext,
  ): Promise<VerificationReport> {
    const { repoPath, capturedAt } = ctx;
    const paths = this.extractPaths(candidate);

    if (paths.length === 0) {
      return {
        status: "unverified",
        mining_score: 0.5,
        evidence: {
          dialogue_ref: candidate.evidence[0]?.message_id ?? "unknown",
        },
        reason: "No file paths identified in candidate for verification.",
        verified_at: new Date().toISOString(),
      };
    }

    const results = await Promise.all(
      paths.map(async (p) => {
        const fullPath = path.isAbsolute(p) ? p : path.join(repoPath, p);
        const exists = await fs
          .access(fullPath)
          .then(() => true)
          .catch(() => false);

        if (!exists) return { path: p, status: "not_found" };

        // ── Git Environment Check ──
        const isGit = await execAsync("git rev-parse --is-inside-work-tree", {
          cwd: repoPath,
        })
          .then(() => true)
          .catch(() => false);

        if (!isGit) return { path: p, status: "pending" }; // Assume pending if not a git repo but file exists

        try {
          // L1: Existence check (already done via fs.access)

          // L2: Content Verification (Mining-aligned: Anchoring)
          let snippet: string | undefined;
          try {
            const content = await fs.readFile(fullPath, "utf8");
            const lines = content.split("\n");
            // Take a small snippet around the beginning for verification proof
            snippet = lines.slice(0, 10).join("\n");
          } catch (readErr) {
            ctx.logger.warn(
              `[verifier:smelt] could not read file content for ${p}: ${readErr}`,
            );
          }

          // L3: Git Context Check
          const { stdout } = await execAsync(
            `git log -1 --since="${capturedAt}" --pretty=format:"%H" -- "${p}"`,
            { cwd: repoPath },
          );

          return {
            path: p,
            status: stdout ? "implemented" : "pending",
            snippet,
          };
        } catch (err) {
          ctx.logger.warn(
            `[verifier:git] failed to check log for ${p}: ${err}`,
          );
          return { path: p, status: "pending" }; // Fallback to pending on error
        }
      }),
    );

    const implemented = results.filter((r) => r.status === "implemented");
    const pending = results.filter((r) => r.status === "pending");
    const missing = results.filter((r) => r.status === "not_found");

    if (implemented.length > 0) {
      return {
        status: "archived",
        mining_score: 0.1,
        evidence: {
          dialogue_ref: candidate.evidence[0]?.message_id ?? "unknown",
          git_gap_status: `Already implemented in ${implemented.length} file(s).`,
        },
        reason: "Suggestions appear to have been already implemented in Git.",
        verified_at: new Date().toISOString(),
      };
    }

    if (pending.length > 0) {
      return {
        status: "verified",
        mining_score: 0.9, // High score for confirmed gaps
        evidence: {
          dialogue_ref: candidate.evidence[0]?.message_id ?? "unknown",
          git_gap_status: `Confirmed implementation gap in ${pending.length} file(s).`,
        },
        verified_at: new Date().toISOString(),
      };
    }

    if (missing.length === paths.length) {
      return {
        status: "rejected",
        mining_score: 0,
        evidence: {
          dialogue_ref: candidate.evidence[0]?.message_id ?? "unknown",
        },
        reason:
          "None of the mentioned file paths exist in the workspace (Hallucination suspected).",
        verified_at: new Date().toISOString(),
      };
    }

    return {
      status: "unverified",
      mining_score: 0.5,
      evidence: {
        dialogue_ref: candidate.evidence[0]?.message_id ?? "unknown",
      },
      verified_at: new Date().toISOString(),
    };
  }

  private extractPaths(candidate: AssetCandidate): string[] {
    const entities = new Set<string>();

    // 1. From evidence guesses
    for (const e of candidate.evidence) {
      // Assuming evidence.excerpt might contain paths if LLM didn't put them in payload
      const matches = e.excerpt.match(
        /[a-zA-Z0-9_\-./]+\.(ts|js|py|go|rs|md|json|tsx|jsx)/g,
      );
      if (matches) for (const m of matches) entities.add(m);
    }

    // 2. From payload target_repo/path
    if (typeof candidate.payload.target_repo === "string") {
      // In VS-02 we focus on local files
    }

    return Array.from(entities);
  }
}
