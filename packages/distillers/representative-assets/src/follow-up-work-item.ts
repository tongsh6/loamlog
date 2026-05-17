import type { DistillerFactory } from "@loamlog/core";
import { createRepresentativeDistiller } from "./base.js";
import {
  getEnumValue,
  getString,
  getStringArray,
  REPRESENTATIVE_ASSET_PROMPT_GUARDRAILS,
} from "./shared.js";

const PRIORITY_HINTS = ["p0", "p1", "p2"] as const;
type PriorityHint = (typeof PRIORITY_HINTS)[number];

interface FollowUpWorkItemPayload extends Record<string, unknown> {
  action: string;
  reason: string;
  owner_hint?: string;
  priority_hint?: PriorityHint;
  due_context?: string;
  acceptance?: string[];
  related_assets?: string[];
}

const SYSTEM_PROMPT = [
  "You extract follow-up-work-item assets from local AI tool sessions.",
  "Return JSON array only.",
  "Each item must include: action, reason, confidence, evidence_refs.",
  "Optional fields: owner_hint, priority_hint, due_context, acceptance, related_assets.",
  "priority_hint must be one of p0, p1, p2 when present.",
  "Each evidence_refs item must include message_id and excerpt.",
  ...REPRESENTATIVE_ASSET_PROMPT_GUARDRAILS,
  "Accept only future or still-open work that is actionable and verifiable after the session.",
  "Each item should include concrete acceptance criteria when the evidence supports them.",
  "Reject completed work, assistant process steps, action-shell titles, generic placeholders, routine tool commands, and risks or practices that belong in another asset type.",
].join("\n");

const factory: DistillerFactory = () =>
  createRepresentativeDistiller<FollowUpWorkItemPayload>({
    id: "@loamlog/distiller-follow-up-work-item",
    name: "Follow-up Work Item Extractor",
    version: "0.1.0",
    type: "follow-up-work-item",
    consumesSignals: [
      {
        kind: "task_delta",
        tags: ["created"],
        min_confidence: 0.6,
        allowed_actors: ["user", "mixed"],
        allowed_temporal_states: ["future", "current", "in_progress"],
      },
      {
        kind: "problem_event",
        tags: ["blocked"],
        min_confidence: 0.6,
        allowed_temporal_states: ["future", "current", "in_progress"],
      },
    ],
    systemPrompt: SYSTEM_PROMPT,
    parsePayload(item) {
      const action = getString(item, "action");
      const reason = getString(item, "reason");
      const rawPriority = item.priority_hint;
      const priorityHint = getEnumValue(item, "priority_hint", PRIORITY_HINTS);
      if (!action || !reason) return undefined;
      if (rawPriority !== undefined && priorityHint === undefined)
        return undefined;
      return {
        action,
        reason,
        owner_hint: getString(item, "owner_hint"),
        priority_hint: priorityHint,
        due_context: getString(item, "due_context"),
        acceptance: getStringArray(item, "acceptance"),
        related_assets: getStringArray(item, "related_assets"),
      };
    },
    title(payload) {
      return payload.action;
    },
    summary(payload) {
      return payload.reason;
    },
    tags(payload) {
      return payload.priority_hint
        ? ["follow-up-work-item", payload.priority_hint]
        : ["follow-up-work-item"];
    },
  });

export default factory;
