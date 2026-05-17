import type { DistillerFactory } from "@loamlog/core";
import { createRepresentativeDistiller } from "./base.js";
import {
  getEnumValue,
  getString,
  getStringArray,
  REPRESENTATIVE_ASSET_PROMPT_GUARDRAILS,
} from "./shared.js";

const PROMOTION_TARGETS = [
  "codex_skill",
  "agents_rule",
  "prompt_template",
  "runbook",
  "project_doc",
] as const;
type PromotionTarget = (typeof PROMOTION_TARGETS)[number];

interface SkillCandidatePayload extends Record<string, unknown> {
  skill_name: string;
  trigger: string;
  capability: string;
  workflow_steps: string[];
  required_context?: string[];
  inputs?: string[];
  outputs?: string[];
  constraints?: string[];
  negative_cases?: string[];
  promotion_target?: PromotionTarget;
}

const SYSTEM_PROMPT = [
  "You extract skill-candidate assets from local AI tool sessions.",
  "Return JSON array only.",
  "Each item must include: skill_name, trigger, capability, workflow_steps, confidence, evidence_refs.",
  "Optional fields: required_context, inputs, outputs, constraints, negative_cases, promotion_target.",
  "promotion_target must be one of codex_skill, agents_rule, prompt_template, runbook, project_doc when present.",
  "Each evidence_refs item must include message_id and excerpt.",
  ...REPRESENTATIVE_ASSET_PROMPT_GUARDRAILS,
  "Accept only cross-project, repeatable, multi-step AI collaboration workflows with a stable trigger and clear boundaries.",
  "workflow_steps must describe a reusable process, not a single command or one repository implementation task.",
  "Reject project-internal dogfooding flows, routine CI/build tasks, ordinary git or shell commands, bug fixes, and feature implementation steps.",
  "Include negative_cases or constraints when evidence supports when the skill should not be used.",
].join("\n");

const factory: DistillerFactory = () =>
  createRepresentativeDistiller<SkillCandidatePayload>({
    id: "@loamlog/distiller-skill-candidate",
    name: "Skill Candidate Extractor",
    version: "0.1.0",
    type: "skill-candidate",
    consumesSignals: [
      {
        kind: "workflow_pattern",
        tags: ["repeatable", "multi_step"],
        min_confidence: 0.7,
        allowed_temporal_states: ["current", "completed"],
      },
      {
        kind: "artifact_reference",
        tags: ["skill"],
        min_confidence: 0.7,
        allowed_temporal_states: ["current", "completed"],
      },
    ],
    systemPrompt: SYSTEM_PROMPT,
    parsePayload(item) {
      const skillName = getString(item, "skill_name");
      const trigger = getString(item, "trigger");
      const capability = getString(item, "capability");
      const workflowSteps = getStringArray(item, "workflow_steps");
      const rawPromotionTarget = item.promotion_target;
      const promotionTarget = getEnumValue(
        item,
        "promotion_target",
        PROMOTION_TARGETS,
      );
      if (!skillName || !trigger || !capability || !workflowSteps)
        return undefined;
      if (rawPromotionTarget !== undefined && promotionTarget === undefined)
        return undefined;
      return {
        skill_name: skillName,
        trigger,
        capability,
        workflow_steps: workflowSteps,
        required_context: getStringArray(item, "required_context"),
        inputs: getStringArray(item, "inputs"),
        outputs: getStringArray(item, "outputs"),
        constraints: getStringArray(item, "constraints"),
        negative_cases: getStringArray(item, "negative_cases"),
        promotion_target: promotionTarget,
      };
    },
    title(payload) {
      return payload.skill_name;
    },
    summary(payload) {
      return `${payload.trigger}: ${payload.capability}`;
    },
    tags(payload) {
      return payload.promotion_target
        ? ["skill-candidate", payload.promotion_target]
        : ["skill-candidate"];
    },
  });

export default factory;
