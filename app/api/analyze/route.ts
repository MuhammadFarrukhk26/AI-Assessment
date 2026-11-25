import { NextResponse } from "next/server";
import { generateStructuredOutput, isRetryableProviderError } from "@/lib/ai";
import { AnalysisSchema, AnalyzeRequestSchema } from "@/lib/schemas";
import { checkRateLimit, getClientIp } from "@/lib/cache-ratelimit";

// Prevent serverless function timeout on Vercel / serverless hosting
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // 1. Rate limiting by IP (30 analyses per 10 minutes)
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`analyze:${clientIp}`, 30, 10 * 60 * 1000);
    if (!rateCheck.success) {
      return NextResponse.json(
        {
          error: `Rate limit reached. Please wait ${rateCheck.resetInSeconds} seconds before submitting another analysis.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.resetInSeconds),
          },
        }
      );
    }

    // 2. Validate incoming submission payload
    const rawBody = await req.json();
    const parseResult = AnalyzeRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: parseResult.error.issues[0]?.message || "Invalid submission payload",
        },
        { status: 400 }
      );
    }

    const { assessment, userAnswers, timeTakenSeconds } = parseResult.data;

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

    const { output } = await generateStructuredOutput({
      schema: AnalysisSchema,
      prompt: `
        Analyze the candidate's assessment submission and generate a concise diagnostic report.

        Assessment Metadata:
        - Topic: ${assessment.topic}
        - Level: ${assessment.level}
        - Allocated Time: ${assessment.totalTimeMinutes * 60} seconds
        - Actual Time Taken: ${timeTakenSeconds} seconds

        Questions & User Responses:
        ${JSON.stringify(
          assessment.questions.map((q) => ({
            id: q.id,
            subtopic: q.subtopic,
            type: q.type,
            question: q.question,
            correctAnswer: q.correctAnswer,
            userAnswer: userAnswers[q.id] || "No Answer Provided",
          })),
          null,
          2
        )}

        Instructions:
        1. Grade MCQs strictly and grade short_answer responses semantically for conceptual accuracy.
        2. Evaluate timeEfficiencyRating by comparing Actual Time Taken against Allocated Time and score accuracy.
        3. Group results by 'subtopic' to calculate accuracyPercentage and assign a mastery status.
        4. Provide actionable, concise study recommendations tailored to their ${assessment.level} level.
        5. Keep summary and recommendations clear and concise to respect output limits.
      `,
    });

    return NextResponse.json(output);
  } catch (error) {
    if (isRetryableProviderError(error)) {
      console.warn("AI provider unavailable during assessment analysis:", error);
      return NextResponse.json(
        {
          error: process.env.OPENROUTER_API_KEY
            ? "AI providers are temporarily busy or rate-limited. Please retry your submission in a few moments."
            : "Google AI rate limit or quota exceeded. Configure OPENROUTER_API_KEY to enable automatic backup, or try again shortly.",
        },
        { status: 503 }
      );
    }

    console.error("Error in /api/analyze:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to analyze submission",
      },
      { status: 500 }
    );
  }
}
