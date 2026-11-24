import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { AnalysisSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  try {
    const { assessment, userAnswers, timeTakenSeconds } = await req.json();

    const { output } = await generateText({
      model: google("gemini-3.1-flash-lite"),
      output: Output.object({
        schema: AnalysisSchema,
      }),
      prompt: `
        Analyze the candidate's assessment submission and generate a diagnostic report.

        Assessment Metadata:
        - Topic: ${assessment.topic}
        - Level: ${assessment.level}
        - Allocated Time: ${assessment.totalTimeMinutes * 60} seconds
        - Actual Time Taken: ${timeTakenSeconds} seconds

        Questions & User Responses:
        ${JSON.stringify(
          assessment.questions.map((q: any) => ({
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
        4. Provide actionable study recommendations tailored to their ${assessment.level} level.
      `,
    });

    return NextResponse.json(output);
  } catch (error) {
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