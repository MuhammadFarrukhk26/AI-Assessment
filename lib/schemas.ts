import { z } from "zod";

export const QuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["mcq", "short_answer"]),
  question: z.string(),
  options: z.array(z.string()).optional().describe("4 options if type is mcq"),
  correctAnswer: z.string(),
  explanation: z.string(),
  subtopic: z.string().describe("Specific concept tested for granular analytics"),
  estimatedSeconds: z.number(),
});

export const AssessmentSchema = z.object({
  title: z.string(),
  topic: z.string(),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  totalTimeMinutes: z.number(),
  questions: z.array(QuestionSchema),
});

export const AnalysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  timeEfficiencyRating: z.enum(["Optimal", "Rushed", "Slow", "Timed Out"]),
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  subtopicBreakdown: z.array(
    z.object({
      subtopic: z.string(),
      accuracyPercentage: z.number(),
      status: z.enum(["Mastered", "Needs Review", "Critical Gap"]),
    })
  ),
  recommendedNextSteps: z.array(z.string()),
});

export type Assessment = z.infer<typeof AssessmentSchema>;
export type AnalysisResult = z.infer<typeof AnalysisSchema>;

export const GenerateRequestSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(2, "Topic must be at least 2 characters")
    .max(150, "Topic must not exceed 150 characters"),
  timeMinutes: z
    .number()
    .int()
    .min(1, "Time must be at least 1 minute")
    .max(120, "Time cannot exceed 120 minutes"),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
});

export const AnalyzeRequestSchema = z.object({
  assessment: AssessmentSchema,
  userAnswers: z.record(z.string(), z.string()),
  timeTakenSeconds: z.number().nonnegative(),
});
