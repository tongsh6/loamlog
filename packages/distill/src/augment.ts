/**
 * LLM Prompt Augmentation — cross-cutting aspects injected at the engine level.
 *
 * All augmentations use the same pattern: wrap an LLMProvider to modify
 * messages before they reach the model. Distillers don't need to know about
 * these — they receive a pre-wrapped provider from the DAG runner.
 *
 * Current augmentations:
 *   - Language instruction (auto-detected from session user messages)
 *   - Session context (repo, branch, provider info)
 *
 * Future augmentations (output format enforcement, token budget warnings, etc.)
 * should follow the same provider-wrapping pattern.
 */
import type { LLMProvider, LLMRouter, SessionArtifact } from "@loamlog/core";

const CJK_PATTERN = /[一-鿿㐀-䶿豈-﫿]/g;
const LATIN_PATTERN = /[a-zA-Z]{3,}/g;

export type DetectedLanguage = "zh" | "en" | "mixed";

/**
 * Detect the primary human language of a session by sampling user messages.
 * Counts actual character/word occurrences (regex with `g` flag), not per-message
 * binary matches. Returns "zh" for predominantly Chinese, "en" for English,
 * "mixed" otherwise.
 */
export function detectLanguage(artifact: SessionArtifact): DetectedLanguage {
  let cjkCount = 0;
  let latinCount = 0;

  for (const msg of artifact.messages) {
    // Only sample user messages — they best represent the human's language
    if (msg.role !== "user") continue;
    const content = msg.content ?? "";
    cjkCount += (content.match(CJK_PATTERN) ?? []).length;
    latinCount += (content.match(LATIN_PATTERN) ?? []).length;
  }

  if (cjkCount === 0 && latinCount === 0) return "en"; // default
  if (cjkCount > latinCount * 2) return "zh";
  if (latinCount > cjkCount * 2) return "en";
  return "mixed";
}

const LANGUAGE_INSTRUCTION_ZH =
  "IMPORTANT: The source conversation is primarily in Chinese. Output ALL content (title, summary, description) in Chinese. Do NOT translate to English.";

const LANGUAGE_INSTRUCTION_EN = ""; // default, no instruction needed

/**
 * Wrap an LLMProvider to auto-inject language instruction into the system
 * message. Distillers don't need to know about this — it's a cross-cutting
 * aspect applied at the engine level for every distill run.
 */
export function withLanguageInstruction(
  provider: LLMProvider,
  language: DetectedLanguage,
): LLMProvider {
  const instruction =
    language === "zh" ? LANGUAGE_INSTRUCTION_ZH : LANGUAGE_INSTRUCTION_EN;

  if (!instruction) return provider; // no wrapping needed

  return {
    ...provider,
    async complete(input) {
      // Prepend language instruction to the system message
      const messages = input.messages.map((m, i) => {
        if (m.role === "system") {
          return { ...m, content: `${instruction}\n\n${m.content}` };
        }
        return m;
      });

      return provider.complete({ ...input, messages });
    },
  };
}

/**
 * Wrap an LLMRouter so that its route() returns a provider that auto-injects
 * language instruction. The language is determined per-session, so each
 * distill call gets the correct instruction for the source conversation.
 *
 * Wrappers are cached per language to avoid creating new closures for every
 * session when most sessions share the same language.
 */
const languageRouterCache = new Map<DetectedLanguage, LLMRouter>();

export function withLanguageRouter(
  router: LLMRouter,
  language: DetectedLanguage,
): LLMRouter {
  const cached = languageRouterCache.get(language);
  if (cached) return cached;

  const wrapped: LLMRouter = {
    route(request) {
      const result = router.route(request);
      return {
        ...result,
        provider: withLanguageInstruction(result.provider, language),
      };
    },
    getDefaultContextWindow() {
      return router.getDefaultContextWindow();
    },
  };

  languageRouterCache.set(language, wrapped);
  return wrapped;
}

/**
 * Wrap an LLMProvider to auto-prepend session context to the first user message.
 * This is a cross-cutting aspect — distillers don't need to know about it.
 * The context tells the LLM which repo/branch/provider the conversation belongs to.
 */
export function withSessionContext(
  provider: LLMProvider,
  artifact: SessionArtifact,
): LLMProvider {
  const ctx = artifact.context;
  const header = [
    `## Session Context`,
    ctx.repo ? `repo: ${ctx.repo}` : "",
    ctx.branch ? `branch: ${ctx.branch}` : "",
    ctx.commit ? `commit: ${ctx.commit.slice(0, 8)}` : "",
    `provider: ${artifact.meta.provider}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ...provider,
    async complete(input) {
      const messages = input.messages.map((m, i) => {
        // Prepend context to the first user message
        if (m.role === "user" && i === input.messages.findIndex((msg) => msg.role === "user")) {
          return { ...m, content: `${header}\n\n${m.content}` };
        }
        return m;
      });

      return provider.complete({ ...input, messages });
    },
  };
}

/**
 * Wrap a provider with session context injection.
 *
 * Language instruction is handled separately by withLanguageRouter at the
 * router level (cached per language). This function only adds the session
 * context header to the first user message.
 */
export function withSessionAugmentation(
  provider: LLMProvider,
  artifact: SessionArtifact,
): LLMProvider {
  return withSessionContext(provider, artifact);
}
