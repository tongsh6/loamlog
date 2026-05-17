import { createHash } from "node:crypto";
import type {
  AggregatorContext,
  AggregatorPlugin,
  EvidenceSpan,
  RefinedAsset,
  VerifiedAsset,
} from "@loamlog/core";

/** Words too generic to anchor a topic group. */
const TOPIC_STOPWORDS = new Set([
  // articles / prepositions / common conjunctions
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "be",
  "by",
  "as",
  "at",
  "from",
  "into",
  "via",
  "use",
  "using",
  "do",
  "does",
  "that",
  "this",
  "it",
  "its",
  // generic action verbs
  "add",
  "ensure",
  "enforce",
  "implement",
  "configure",
  "verify",
  "make",
  "run",
  "runs",
  "running",
  "build",
  "builds",
  "built",
  "create",
  "creates",
  "support",
  "supports",
  "fix",
  "fixes",
  "set",
  "sets",
  "require",
  "requires",
  "prevent",
  "catch",
  "check",
  "checks",
  // generic engineering nouns that don't anchor a topic
  "code",
  "step",
  "command",
  "commands",
  "script",
  "scripts",
  "rule",
  "rules",
  "gate",
  "gates",
  "before",
  "after",
  "missing",
  "ci",
  "cd",
  "workflow",
  "development",
  "validation",
  "integration",
  "pipeline",
  "succeeds",
  "merging",
  "pre",
  "commit",
]);

function normalizeTopicTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[`*_~()[\]{}<>|]/g, " ")
      .replace(/[^a-z0-9一-鿿]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !TOPIC_STOPWORDS.has(t)),
  );
}

/**
 * Two title token sets belong to the same topic iff their Jaccard similarity
 * exceeds the threshold. We deliberately avoid the "small set + 1 shared
 * token" shortcut because union-find is transitive, and that shortcut tends
 * to fold unrelated short titles into one mega-cluster.
 */
function sameTopic(a: Set<string>, b: Set<string>, threshold: number): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  if (shared === 0) return false;
  const union = a.size + b.size - shared;
  return union > 0 && shared / union >= threshold;
}

/**
 * P3 Aggregator: Cross-session Clustering.
 * Correlates and merges assets based on semantic and physical identity.
 *
 * Two-pass strategy:
 *  1. Exact identity hash group (Repo + Distiller + normalized title prefix).
 *  2. Loose semantic group: union-find merge of groups whose representative
 *     titles satisfy `sameTopic`. This catches "Tauri CI gate" phrasings
 *     that the strict hash misses.
 */
export class TopicAggregator implements AggregatorPlugin {
  id = "@loamlog/aggregator-topic";
  name = "Semantic Topic Aggregator";

  /** Jaccard threshold (after stopword filtering) for two groups to merge. */
  static readonly TOPIC_THRESHOLD = 0.25;

  async refine(
    assets: VerifiedAsset[],
    ctx: AggregatorContext,
  ): Promise<RefinedAsset[]> {
    const { repo_path } = ctx;
    const identityMap = new Map<string, VerifiedAsset[]>();

    // 1. Group by Identity Fingerprint
    for (const asset of assets) {
      const fingerprint = this.computeIdentityHash(asset, repo_path);
      const group = identityMap.get(fingerprint) ?? [];
      group.push(asset);
      identityMap.set(fingerprint, group);
    }

    // 2. Loose semantic merge across groups (sameTopic on titles only;
    //    tags are intentionally excluded because shared tags like "typo"
    //    can falsely link unrelated topics).
    const groupArr = Array.from(identityMap.entries());
    const tokenSets = groupArr.map(([_, group]) => {
      const txt = group.map((a) => a.title).join(" ");
      return normalizeTopicTokens(txt);
    });
    const parent = groupArr.map((_, i) => i);
    const find = (i: number): number => {
      if (parent[i] === i) return i;
      const root = find(parent[i]);
      parent[i] = root;
      return root;
    };
    for (let i = 0; i < groupArr.length; i++) {
      for (let j = i + 1; j < groupArr.length; j++) {
        if (
          sameTopic(tokenSets[i], tokenSets[j], TopicAggregator.TOPIC_THRESHOLD)
        ) {
          parent[find(j)] = find(i);
        }
      }
    }
    const merged = new Map<number, VerifiedAsset[]>();
    for (let i = 0; i < groupArr.length; i++) {
      const root = find(i);
      const bucket = merged.get(root) ?? [];
      for (const a of groupArr[i][1]) bucket.push(a);
      merged.set(root, bucket);
    }

    // 3. Materialize each cluster
    const refined: RefinedAsset[] = [];
    for (const [_rootIdx, group] of merged.entries()) {
      // Re-derive a representative hash from the strongest member's identity
      const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
      const hash = this.computeIdentityHash(sorted[0], repo_path);
      refined.push(this.mergeGroup(hash, group));
    }

    return refined;
  }

  private computeIdentityHash(asset: VerifiedAsset, repo: string): string {
    // Identity = Repo + Distiller + TopicKey
    // Normalize topic key: remove punctuation, lowercase, and limit length to prevent hash pollution
    const topicKey = (asset.title || asset.candidate_type)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50);

    // Explicitly include repo and distiller_id to prevent cross-project or cross-tool collisions
    return createHash("sha256")
      .update(`${repo}:${asset.distiller_id}:${topicKey}`)
      .digest("hex");
  }

  private mergeGroup(hash: string, group: VerifiedAsset[]): RefinedAsset {
    if (group.length === 1) {
      const a = group[0];
      return {
        ...a,
        identity_hash: hash,
        contributing_sessions: [a.evidence[0]?.session_id ?? "unknown"],
        is_merged: false,
        version: 1,
      };
    }

    // Sort by confidence to pick the "best" primary metadata
    const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
    const primary = sorted[0];

    const sessions = new Set<string>();
    const allEvidence: EvidenceSpan[] = [];
    const evidenceIds = new Set<string>();

    for (const asset of group) {
      for (const e of asset.evidence) {
        sessions.add(e.session_id);
        const eId = `${e.session_id}:${e.message_id}:${e.excerpt}`;
        if (!evidenceIds.has(eId)) {
          allEvidence.push(e);
          evidenceIds.add(eId);
        }
      }
    }

    // Multi-source confidence bonus (+0.1 per additional session, cap 1.0)
    const baseConfidence = primary.confidence;
    const bonus = (sessions.size - 1) * 0.1;
    const finalConfidence = Math.min(
      1.0,
      Math.round((baseConfidence + bonus) * 10) / 10,
    );

    // Verification status inheritance (Verified > Unverified)
    const isVerified = group.some((a) => a.verification.status === "verified");

    // Versioning: in a stateless batch run, we start at 1 or use existing version if available in payload
    const maxVersion = Math.max(
      ...group.map((a) =>
        "version" in a && typeof a.version === "number" ? a.version : 1,
      ),
    );

    return {
      ...primary,
      confidence: finalConfidence,
      evidence: allEvidence,
      verification: {
        ...primary.verification,
        status: isVerified ? "verified" : primary.verification.status,
        mining_score: Math.max(
          ...group.map((a) => a.verification.mining_score),
        ),
      },
      identity_hash: hash,
      contributing_sessions: Array.from(sessions),
      is_merged: true,
      version: group.length > 1 ? maxVersion : maxVersion,
    };
  }
}
