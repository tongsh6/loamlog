import { createHash } from "node:crypto";
import type { 
  VerifiedAsset, 
  RefinedAsset, 
  AggregatorPlugin, 
  AggregatorContext,
  EvidenceSpan 
} from "@loamlog/core";

/**
 * P3 Aggregator: Cross-session Clustering.
 * Correlates and merges assets based on semantic and physical identity.
 */
export class TopicAggregator implements AggregatorPlugin {
  id = "@loamlog/aggregator-topic";
  name = "Semantic Topic Aggregator";

  async refine(assets: VerifiedAsset[], ctx: AggregatorContext): Promise<RefinedAsset[]> {
    const { repo_path } = ctx;
    const identityMap = new Map<string, VerifiedAsset[]>();

    // 1. Group by Identity Fingerprint
    for (const asset of assets) {
      const fingerprint = this.computeIdentityHash(asset, repo_path);
      const group = identityMap.get(fingerprint) ?? [];
      group.push(asset);
      identityMap.set(fingerprint, group);
    }

    // 2. Merge Each Group
    const refined: RefinedAsset[] = [];
    for (const [hash, group] of identityMap.entries()) {
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
        version: 1
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
    const finalConfidence = Math.min(1.0, Math.round((baseConfidence + bonus) * 10) / 10);

    // Verification status inheritance (Verified > Unverified)
    const isVerified = group.some(a => a.verification.status === "verified");

    // Versioning: in a stateless batch run, we start at 1 or use existing version if available in payload
    const maxVersion = Math.max(...group.map(a => (a as any).version || 1));

    return {
      ...primary,
      confidence: finalConfidence,
      evidence: allEvidence,
      verification: {
        ...primary.verification,
        status: isVerified ? "verified" : primary.verification.status,
        mining_score: Math.max(...group.map(a => a.verification.mining_score))
      },
      identity_hash: hash,
      contributing_sessions: Array.from(sessions),
      is_merged: true,
      version: group.length > 1 ? maxVersion : maxVersion
    };
  }
}
