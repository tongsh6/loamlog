import type { 
  AssetCandidate, 
  VerificationReport, 
  VerifierContext, 
  VerifierPlugin,
  GlobalEvidenceRegistry
} from "@loamlog/core";

/**
 * P1 Verifier: Cross-Tool Evidence Weaving.
 * Searches for physical logs and events that confirm AI's dialogue-based guesses.
 */
export class LogWeaveVerifier implements VerifierPlugin {
  id = "@loamlog/verifier-log-weave";
  name = "Log Weaving Verifier";

  constructor(private registry: GlobalEvidenceRegistry) {}

  async verify(candidate: AssetCandidate, ctx: VerifierContext): Promise<VerificationReport> {
    const { capturedAt } = ctx;
    
    // 1. Define time window (default: capturedAt ± 5 mins)
    const capTime = new Date(capturedAt).getTime();
    const startTime = new Date(capTime - 5 * 60 * 1000).toISOString();
    const endTime = new Date(capTime + 5 * 60 * 1000).toISOString();

    // 2. Extract keywords for weaving
    const keywords = this.extractKeywords(candidate);
    
    if (keywords.length === 0) {
      return {
        status: "unverified",
        mining_score: 0.5,
        evidence: { dialogue_ref: candidate.evidence[0]?.message_id ?? "unknown" },
        verified_at: new Date().toISOString()
      };
    }

    // 3. Search Registry
    const physicalEvidence = await this.registry.findPhysicalEvidence({
      time_window: [startTime, endTime],
      entities: [],
      keywords
    });

    if (physicalEvidence.length > 0) {
      return {
        status: "verified",
        mining_score: 1.0, // Physical evidence is gold standard
        evidence: {
          dialogue_ref: candidate.evidence[0]?.message_id ?? "unknown",
          physical_log_ref: physicalEvidence[0].message_id,
          git_gap_status: "Physical log match found"
        },
        reason: `Matched ${physicalEvidence.length} physical log entry(s) within ±5m window.`,
        verified_at: new Date().toISOString()
      };
    }

    return {
      status: "unverified",
      mining_score: 0.5,
      evidence: { dialogue_ref: candidate.evidence[0]?.message_id ?? "unknown" },
      verified_at: new Date().toISOString()
    };
  }

  private extractKeywords(candidate: AssetCandidate): string[] {
    const words = new Set<string>();
    
    // Look for error-like tokens in summary or title
    const errorMatches = (candidate.summary + candidate.title).match(/(?:Error|Failed|Exception|TypeError|ReferenceError|404|500)/gi);
    if (errorMatches) for (const m of errorMatches) words.add(m);

    // Also include tags as keywords
    for (const t of candidate.tags) words.add(t);

    return Array.from(words).slice(0, 5);
  }
}
