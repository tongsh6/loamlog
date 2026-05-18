import type {
  AssetCandidate,
  VerificationReport,
  VerifierContext,
  VerifierPlugin,
} from "@loamlog/core";

const MIN_SHARED_TOKENS = 3;
const MIN_SUPPORT_COVERAGE = 0.28;
const MAX_CLAIM_CHARS = 4000;
const MAX_EVIDENCE_CHARS = 8000;

const STOPWORDS = new Set([
  "about",
  "action",
  "asset",
  "candidate",
  "context",
  "decision",
  "evidence",
  "follow",
  "from",
  "into",
  "item",
  "need",
  "needs",
  "next",
  "reason",
  "review",
  "should",
  "summary",
  "that",
  "this",
  "title",
  "with",
  "work",
]);

/**
 * Verifies whether a candidate is anchored in its cited dialogue evidence.
 *
 * This verifier is intentionally conservative: clear lexical support becomes
 * verified, structurally evidence-free candidates are rejected, and weak or
 * paraphrased support remains unverified for human review.
 */
export class EvidenceSupportVerifier implements VerifierPlugin {
  id = "@loamlog/verifier-evidence-support";
  name = "Evidence Support Verifier";

  async verify(
    candidate: AssetCandidate,
    _ctx: VerifierContext,
  ): Promise<VerificationReport> {
    const dialogueRef = candidate.evidence[0]?.message_id ?? "unknown";

    if (candidate.evidence.length === 0) {
      return {
        status: "rejected",
        mining_score: 0,
        evidence: {
          dialogue_ref: dialogueRef,
          evidence_support_status: "missing_evidence",
        },
        reason: "Candidate has no cited evidence spans.",
        verified_at: new Date().toISOString(),
      };
    }

    const claimTokens = extractSupportTokens(
      candidateClaimText(candidate).slice(0, MAX_CLAIM_CHARS),
    );
    const evidenceTokens = extractSupportTokens(
      candidate.evidence
        .map((item) => item.excerpt)
        .join(" ")
        .slice(0, MAX_EVIDENCE_CHARS),
    );

    if (claimTokens.size === 0 || evidenceTokens.size === 0) {
      return {
        status: "unverified",
        mining_score: 0.45,
        evidence: {
          dialogue_ref: dialogueRef,
          evidence_support_status: "insufficient_terms",
        },
        reason:
          "Candidate or evidence text does not contain enough comparable terms.",
        verified_at: new Date().toISOString(),
      };
    }

    const shared = countSharedTokens(claimTokens, evidenceTokens);
    const coverage = shared / claimTokens.size;

    if (shared >= MIN_SHARED_TOKENS && coverage >= MIN_SUPPORT_COVERAGE) {
      return {
        status: "verified",
        mining_score: Math.min(0.85, 0.55 + coverage),
        evidence: {
          dialogue_ref: dialogueRef,
          evidence_support_status: `supported shared=${shared} coverage=${coverage.toFixed(2)}`,
        },
        reason:
          "Candidate claims are lexically supported by the cited evidence.",
        verified_at: new Date().toISOString(),
      };
    }

    return {
      status: "unverified",
      mining_score: 0.4,
      evidence: {
        dialogue_ref: dialogueRef,
        evidence_support_status: `weak_support shared=${shared} coverage=${coverage.toFixed(2)}`,
      },
      reason:
        "Cited evidence has weak lexical overlap with candidate claims; keep for human review.",
      verified_at: new Date().toISOString(),
    };
  }
}

function candidateClaimText(candidate: AssetCandidate): string {
  return [
    candidate.title,
    candidate.summary,
    ...candidate.tags,
    ...flattenPayloadText(candidate.payload),
  ].join(" ");
}

function flattenPayloadText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenPayloadText);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenPayloadText);
  }
  return [];
}

function extractSupportTokens(text: string): Set<string> {
  const normalized = text.toLowerCase();
  const tokens = new Set<string>();

  for (const match of normalized.matchAll(/[a-z0-9]+/g)) {
    const token = match[0];
    const singular =
      token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
    if (singular.length >= 4 && !STOPWORDS.has(singular)) {
      tokens.add(singular);
    }
  }

  for (const token of cjkBigrams(normalized)) {
    tokens.add(token);
  }

  return tokens;
}

function cjkBigrams(text: string): string[] {
  const chars = Array.from(text.matchAll(/[\p{Script=Han}]/gu), (m) => m[0]);
  const bigrams: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.push(`${chars[i]}${chars[i + 1]}`);
  }
  return bigrams;
}

function countSharedTokens(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared;
}
