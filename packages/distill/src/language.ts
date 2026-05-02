import type { LLMProvider, LLMRouter, SessionArtifact } from "@loamlog/core";

const CJK_PATTERN = /[一-鿿㐀-䶿豈-﫿]/;
const LATIN_PATTERN = /[a-zA-Z]{3,}/;

export type DetectedLanguage = "zh" | "en" | "mixed";

/**
 * Detect the primary human language of a session by sampling user messages.
 * Returns "zh" for predominantly Chinese, "en" for English, "mixed" otherwise.
 */
export function detectLanguage(artifact: SessionArtifact): DetectedLanguage {
  let cjkChars = 0;
  let latinWords = 0;

  for (const msg of artifact.messages) {
    // Only sample user messages — they best represent the human's language
    if (msg.role !== "user") continue;
    const content = msg.content ?? "";
    cjkChars += (content.match(CJK_PATTERN) ?? []).length;
    latinWords += (content.match(LATIN_PATTERN) ?? []).length;
  }

  if (cjkChars === 0 && latinWords === 0) return "en"; // default
  if (cjkChars > latinWords * 2) return "zh";
  if (latinWords > cjkChars * 2) return "en";
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
 */
export function withLanguageRouter(
  router: LLMRouter,
  language: DetectedLanguage,
): LLMRouter {
  return {
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
}
