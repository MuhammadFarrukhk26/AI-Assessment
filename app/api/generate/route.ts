import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { AssessmentSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const { topic, timeMinutes, level } = await req.json();

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
      return NextResponse.json(
        { error: "Server missing GOOGLE_GENERATIVE_AI_API_KEY" },
        { status: 500 }
      );
    }

    const avgMinutesPerQuestion =
      level === "Beginner" ? 1.5 : level === "Intermediate" ? 2.5 : 4;
    const questionCount = Math.max(
      3,
      Math.min(20, Math.round(timeMinutes / avgMinutesPerQuestion))
    );

    const { output } = await generateText({
      model: google("gemini-3.1-flash-lite"),
      output: Output.object({
        schema: AssessmentSchema,
      }),
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
      `,
    });

    return NextResponse.json(output);
  } catch (error) {
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