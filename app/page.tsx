// import Image from "next/image";

// export default function Home() {
//   return (
//     <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
//       <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
//         <Image
//           className="dark:invert h-5 w-[100px]"
//           src="/next.svg"
//           alt="Next.js logo"
//           width={100}
//           height={20}
//           priority
//         />
//         <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
//           <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
//             To get started, edit the{" "}
//             <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
//               page.tsx
//             </code>{" "}
//             file.
//           </h1>
//           <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
//             Looking for a starting point or more instructions? Head over to{" "}
//             <a
//               href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//               className="font-medium text-zinc-950 dark:text-zinc-50"
//             >
//               Templates
//             </a>{" "}
//             or the{" "}
//             <a
//               href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//               className="font-medium text-zinc-950 dark:text-zinc-50"
//             >
//               Learning
//             </a>{" "}
//             center.
//           </p>
//         </div>
//         <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
//           <a
//             className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
//             href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//             target="_blank"
//             rel="noopener noreferrer"
//           >
//             <Image
//               className="dark:invert h-[14px] w-4"
//               src="/vercel.svg"
//               alt="Vercel logomark"
//               width={16}
//               height={14}
//             />
//             Deploy Now
//           </a>
//           <a
//             className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
//             href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//             target="_blank"
//             rel="noopener noreferrer"
//           >
//             Documentation
//           </a>
//         </div>
//       </main>
//     </div>
//   );
// }

"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Clock,
  Brain,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Loader2,
  Sparkles,
  BarChart3,
} from "lucide-react";
import type { Assessment, AnalysisResult } from "@/lib/schemas";

type Stage = "setup" | "active" | "results";
type Level = "Beginner" | "Intermediate" | "Advanced";

export default function AssessmentPlatform() {
  // Stage & Loading States
  const [stage, setStage] = useState<Stage>("setup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setup Form States
  const [topic, setTopic] = useState("");
  const [publicIp, setPublicIp] = useState("");
  const [timeMinutes, setTimeMinutes] = useState<number>(10);
  const [level, setLevel] = useState<Level>("Intermediate");

  // Active Assessment States
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const startTimeRef = useRef<number>(0);
  const isSubmittingRef = useRef<boolean>(false);

  // Results State
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // Restore active test from localStorage on page load (prevents lost progress on reload or network drops)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("active_assessment_state");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.assessment && parsed?.stage === "active") {
          setAssessment(parsed.assessment);
          setUserAnswers(parsed.userAnswers || {});
          setSecondsLeft(parsed.secondsLeft || parsed.assessment.totalTimeMinutes * 60);
          setStage("active");
          startTimeRef.current = parsed.startTime || Date.now();
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Sync active test to localStorage
  useEffect(() => {
    if (stage === "active" && assessment) {
      try {
        localStorage.setItem(
          "active_assessment_state",
          JSON.stringify({
            stage,
            assessment,
            userAnswers,
            secondsLeft,
            startTime: startTimeRef.current,
          })
        );
      } catch {
        // Ignore quota/storage errors
      }
    }
  }, [stage, assessment, userAnswers, secondsLeft]);

  // 1. Generate Assessment Handler
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, timeMinutes, level }),
      });

      if (!res.ok) {
        const responseError: { error?: unknown } = await res.json().catch(() => ({}));
        throw new Error(
          typeof responseError.error === "string"
            ? responseError.error
            : "Failed to generate assessment."
        );
      }

      const data: Assessment = await res.json();

      setAssessment(data);
      setUserAnswers({});
      setSecondsLeft(data.totalTimeMinutes * 60);
      startTimeRef.current = Date.now();
      isSubmittingRef.current = false;
      setStage("active");
    } catch (err: any) {
      setError(err.message || "Something went wrong while generating.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit & Analyze Handler
  const handleSubmit = async () => {
    if (!assessment || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);

    const timeTakenSeconds = Math.min(
      assessment.totalTimeMinutes * 60,
      Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
    );

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessment,
          userAnswers,
          timeTakenSeconds,
        }),
      });

      if (!res.ok) {
        const responseError: { error?: unknown } = await res.json().catch(() => ({}));
        throw new Error(
          typeof responseError.error === "string"
            ? responseError.error
            : "Failed to analyze submission."
        );
      }
      const result: AnalysisResult = await res.json();

      setAnalysis(result);
      setStage("results");
      localStorage.removeItem("active_assessment_state");
    } catch (err: any) {
      setError(err.message || "Analysis failed. Please try again.");
      isSubmittingRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  // 3. Countdown Timer Effect
  useEffect(() => {
    if (stage !== "active" || loading) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit(); // Auto-submit when timer hits zero
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [stage, loading]);

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleReset = () => {
    setStage("setup");
    setAssessment(null);
    setAnalysis(null);
    setUserAnswers({});
    setError(null);
    localStorage.removeItem("active_assessment_state");
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-lg">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">AI Assessment Studio</h1>
              <p className="text-xs text-slate-500">Dynamic Generation & Diagnostic Analysis</p>
            </div>
          </div>

          {stage !== "setup" && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md border border-slate-200 bg-white shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              New Topic
            </button>
          )}
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
            {stage === "active" && (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shrink-0 transition"
              >
                Retry Submission
              </button>
            )}
          </div>
        )}

        {/* ==================== STAGE 1: SETUP ==================== */}
        {stage === "setup" && (
          <form
            onSubmit={handleGenerate}
            className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6"
          >
            <div>
              <label className="block text-sm font-semibold mb-2">
                Assessment Topic
              </label>
              <input
                type="text"
                required
                placeholder="e.g., React Server Components, SQL Indexing, System Design..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Difficulty Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Beginner", "Intermediate", "Advanced"] as Level[]).map((lvl) => (
                    <button
                      type="button"
                      key={lvl}
                      onClick={() => setLevel(lvl)}
                      className={`py-2.5 px-2 text-xs font-medium rounded-xl border transition ${
                        level === lvl
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Allocated Time: <span className="text-indigo-600">{timeMinutes} mins</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={5}
                  value={timeMinutes}
                  onChange={(e) => setTimeMinutes(Number(e.target.value))}
                  className="w-full accent-indigo-600 mt-2"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>5m</span>
                  <span>30m</span>
                  <span>60m</span>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="public-ip" className="block text-sm font-semibold mb-2">
                Public IP Address
              </label>
              <input
                id="public-ip"
                type="text"
                autoComplete="off"
                placeholder="Enter an IP address"
                value={publicIp}
                onChange={(e) => setPublicIp(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Manual entry only; this does not make the app publicly accessible.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !topic.trim()}
              className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Tailored Assessment...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate & Start Assessment
                </>
              )}
            </button>
          </form>
        )}

        {/* ==================== STAGE 2: ACTIVE TEST ==================== */}
        {stage === "active" && assessment && (
          <div className="space-y-6">
            {/* Sticky Timer Bar */}
            <div className="sticky top-4 z-10 bg-white/95 backdrop-blur p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-800">{assessment.title}</h2>
                <span className="text-xs text-slate-500">
                  {assessment.level} • {assessment.questions.length} Questions
                </span>
              </div>
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-bold text-sm ${
                  secondsLeft < 60
                    ? "bg-red-100 text-red-700 animate-pulse"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                <Clock className="w-4 h-4" />
                {formatTime(secondsLeft)}
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-5">
              {assessment.questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                      Q{idx + 1} • {q.subtopic}
                    </span>
                    <span className="text-xs text-slate-400">
                      ~{Math.round(q.estimatedSeconds / 60)} min
                    </span>
                  </div>

                  <p className="font-medium text-slate-900 leading-relaxed">{q.question}</p>

                  {q.type === "mcq" && q.options ? (
                    <div className="space-y-2.5 pt-1">
                      {q.options.map((option, optIdx) => {
                        const isSelected = userAnswers[q.id] === option;
                        return (
                          <label
                            key={optIdx}
                            className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition text-sm ${
                              isSelected
                                ? "border-indigo-600 bg-indigo-50/60 text-indigo-950 font-medium"
                                : "border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              value={option}
                              checked={isSelected}
                              onChange={() =>
                                setUserAnswers((prev) => ({ ...prev, [q.id]: option }))
                              }
                              className="accent-indigo-600"
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      rows={4}
                      placeholder="Write your concise technical answer here..."
                      value={userAnswers[q.id] || ""}
                      onChange={(e) =>
                        setUserAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      className="w-full p-3.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Grading & Analyzing Performance...
                </>
              ) : (
                <>
                  Submit Assessment for Analysis
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        )}

        {/* ==================== STAGE 3: RESULTS & ANALYZER ==================== */}
        {stage === "results" && analysis && assessment && (
          <div className="space-y-6">
            {/* Top Score Card */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Diagnostic Score
                  </span>
                  <div className="text-4xl font-extrabold text-indigo-600 mt-1">
                    {analysis.overallScore}%
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                    Pacing & Time Efficiency
                  </span>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                      analysis.timeEfficiencyRating === "Optimal"
                        ? "bg-emerald-100 text-emerald-800"
                        : analysis.timeEfficiencyRating === "Rushed"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {analysis.timeEfficiencyRating}
                  </span>
                </div>
              </div>

              <p className="mt-5 text-sm text-slate-700 leading-relaxed">{analysis.summary}</p>
            </div>

            {/* Subtopic Mastery Breakdown */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <h3>Subtopic Mastery Breakdown</h3>
              </div>

              <div className="space-y-3">
                {analysis.subtopicBreakdown.map((item, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span>{item.subtopic}</span>
                      <span className="text-slate-600">
                        {item.accuracyPercentage}% ({item.status})
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.status === "Mastered"
                            ? "bg-emerald-500"
                            : item.status === "Needs Review"
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${item.accuracyPercentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="font-bold text-sm text-emerald-700 flex items-center gap-1.5 mb-3">
                  <CheckCircle2 className="w-4 h-4" /> Key Strengths
                </h4>
                <ul className="space-y-2 text-xs text-slate-700 list-disc pl-4">
                  {analysis.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="font-bold text-sm text-red-700 flex items-center gap-1.5 mb-3">
                  <XCircle className="w-4 h-4" /> Areas to Improve
                </h4>
                <ul className="space-y-2 text-xs text-slate-700 list-disc pl-4">
                  {analysis.weaknesses.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Recommended Next Steps */}
            <div className="bg-indigo-50/70 p-6 rounded-2xl border border-indigo-100">
              <h4 className="font-bold text-sm text-indigo-950 mb-2">Recommended Study Plan</h4>
              <ul className="space-y-1.5 text-xs text-indigo-900 list-disc pl-4">
                {analysis.recommendedNextSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </div>

            {/* Question-by-Question Answer Review */}
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 px-1">Detailed Question Review</h3>
              {assessment.questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5 text-sm"
                >
                  <div className="text-xs font-semibold text-slate-400">
                    Question {idx + 1} • {q.subtopic}
                  </div>
                  <p className="font-medium text-slate-900">{q.question}</p>
                  <div className="p-3 rounded-xl bg-slate-50 text-xs space-y-1">
                    <p>
                      <span className="font-semibold text-slate-600">Your Answer: </span>
                      {userAnswers[q.id] || <em className="text-slate-400">No answer submitted</em>}
                    </p>
                    <p>
                      <span className="font-semibold text-emerald-700">Expected Answer: </span>
                      {q.correctAnswer}
                    </p>
                  </div>
                  <p className="text-xs text-slate-600 pt-1">
                    <span className="font-semibold">Explanation: </span>
                    {q.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}