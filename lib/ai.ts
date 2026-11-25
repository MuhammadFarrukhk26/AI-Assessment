import { google } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { APICallError, generateText, Output, RetryError } from "ai";
import type { z } from "zod";

const DEFAULT_OPENROUTER_MODEL = "openai/gpt-6.2-sol";
const MAX_OUTPUT_TOKENS = 8192;

function getLastError(error: unknown): unknown {
  return RetryError.isInstance(error) ? error.lastError : error;
}

export function isRetryableProviderError(error: unknown): boolean {
  const lastError = getLastError(error);
  if (APICallError.isInstance(lastError)) {
    if (lastError.isRetryable) return true;
    const status = lastError.statusCode;
    if (status === 429 || status === 403 || status === 408 || (status && status >= 500)) {
      return true;
    }
  }

  if (lastError instanceof Error) {
    const msg = lastError.message.toLowerCase();
    if (
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("rate limit") ||
      msg.includes("resource_exhausted") ||
      msg.includes("overloaded") ||
      msg.includes("too many requests") ||
      msg.includes("capacity") ||
      msg.includes("temporarily unavailable") ||
      msg.includes("timeout") ||
      msg.includes("econnreset")
    ) {
      return true;
    }
  }

  return false;
}

export async function generateStructuredOutput<Schema extends z.ZodType>({
  schema,
  prompt,
}: {
  schema: Schema;
  prompt: string;
}) {
  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!googleApiKey && !openRouterApiKey) {
    throw new Error(
      "Set GOOGLE_GENERATIVE_AI_API_KEY or OPENROUTER_API_KEY to enable AI generation."
    );
  }

  const generateWithOpenRouter = () => {
    if (!openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    const openrouter = createOpenRouter({ apiKey: openRouterApiKey });
    return generateText({
      model: openrouter(
        process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL
      ),
      output: Output.object({ schema }),
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 2,
    });
  };

  if (!googleApiKey) {
    return generateWithOpenRouter();
  }

  // 1. Try Primary Google Model (Gemini 3.1 Flash Lite)
  try {
    return await generateText({
      model: google("gemini-3.1-flash-lite"),
      output: Output.object({ schema }),
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 2,
    });
  } catch (primaryError) {
    console.warn(
      "Primary Google AI model failed:",
      primaryError instanceof Error ? primaryError.message : primaryError
    );

    // If it's not a rate-limit/network/quota issue or if neither backup is available, check if we can try backup
    const isProviderIssue = isRetryableProviderError(primaryError);

    // 2. Try Secondary Google Model (Gemini 2.5 Flash)
    if (isProviderIssue) {
      try {
        console.warn("Attempting Secondary Google model (gemini-2.5-flash)...");
        return await generateText({
          model: google("gemini-2.5-flash"),
          output: Output.object({ schema }),
          prompt,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          maxRetries: 1,
        });
      } catch (secondaryError) {
        console.warn(
          "Secondary Google AI model failed:",
          secondaryError instanceof Error ? secondaryError.message : secondaryError
        );
      }
    }

    // 3. Try OpenRouter Fallback
    if (openRouterApiKey && isProviderIssue) {
      console.warn("Falling back to OpenRouter provider...");
      return generateWithOpenRouter();
    }

    throw primaryError;
  }
}
