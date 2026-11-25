import { NextResponse } from "next/server";
import { generateStructuredOutput, isRetryableProviderError } from "@/lib/ai";
import { AssessmentSchema, GenerateRequestSchema } from "@/lib/schemas";
import { assessmentCache, checkRateLimit, getClientIp } from "@/lib/cache-ratelimit";

// Prevent serverless function timeout on Vercel / serverless hosting
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // 1. Rate limiting by IP (20 requests per 10 minutes)
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`generate:${clientIp}`, 20, 10 * 60 * 1000);
    if (!rateCheck.success) {
      return NextResponse.json(
        {
          error: `Rate limit reached. Please wait ${rateCheck.resetInSeconds} seconds before generating another assessment.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.resetInSeconds),
          },
        }
      );
    }

    // 2. Validate input schema to prevent unbounded payload abuse
    const rawBody = await req.json();
    const parseResult = GenerateRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: parseResult.error.issues[0]?.message || "Invalid request parameters",
        },
        { status: 400 }
      );
    }

    const { topic, timeMinutes, level } = parseResult.data;

    if (
      !process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
      !process.env.OPENROUTER_API_KEY
    ) {
      return NextResponse.json(
        {
          error:
            "Server missing GOOGLE_GENERATIVE_AI_API_KEY or OPENROUTER_API_KEY",
        },
        { status: 500 }
      );
    }

    // 3. Question count bounds (Safe upper bound of 10 to prevent output token limit exhaustion & schema truncation)
    const avgMinutesPerQuestion =
      level === "Beginner" ? 1.5 : level === "Intermediate" ? 2.5 : 4;
    const questionCount = Math.max(
      3,
      Math.min(10, Math.round(timeMinutes / avgMinutesPerQuestion))
    );

    // 4. Cache check: if identical topic/level/questions exists, return immediately (0 token/quota cost)
    const cacheKey = `assessment:${topic.toLowerCase()}:${level}:${questionCount}`;
    const cachedAssessment = assessmentCache.get(cacheKey);
    if (cachedAssessment) {
      return NextResponse.json(cachedAssessment);
    }

    // 5. Generate structured output with optimized token-budget prompt
    const { output } = await generateStructuredOutput({
      schema: AssessmentSchema,
      prompt: `
        Create a structured technical/academic assessment.
        - Topic: ${topic}
        - Difficulty Level: ${level}
        - Total Allocated Time: ${timeMinutes} minutes
        - Target Question Count: ${questionCount} questions

        Rules:
        1. Ensure the cumulative estimatedSeconds of all questions fits comfortably within ${timeMinutes * 60} seconds.
        2. For every question with type "mcq", provide exactly 4 clear options in "options".
        3. For Beginner: focus on core definitions, basic usage, and straightforward MCQs.
        4. For Intermediate: include scenario-based MCQs and short-answer troubleshooting questions.
        5. For Advanced: focus on edge cases, system design trade-offs, optimization, and short-answer explanations.
        6. Tag every question with a granular 'subtopic' so performance can be analyzed by concept later.
        7. Keep question explanations and text concise (under 2-3 sentences each) to respect token budgets.
      `,
    });

    // Cache successful generation for 2 hours
    assessmentCache.set(cacheKey, output, 2 * 60 * 60 * 1000);

    return NextResponse.json(output);
  } catch (error) {
    if (isRetryableProviderError(error)) {
      console.warn("AI provider unavailable during assessment generation:", error);
      return NextResponse.json(
        {
          error: process.env.OPENROUTER_API_KEY
            ? "AI providers are temporarily busy or rate-limited. Please retry in a few moments."
            : "Google AI rate limit or quota exceeded. Configure OPENROUTER_API_KEY to enable automatic backup, or try again shortly.",
        },
        { status: 503 }
      );
    }

    console.error("Error in /api/generate:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate assessment",
      },
      { status: 500 }
    );
  }
}
