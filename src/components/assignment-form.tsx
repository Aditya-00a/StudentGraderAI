"use client";

import { startTransition, useState } from "react";

type AssignmentFormProps = {
  initialDescription?: string;
};

export function AssignmentForm({ initialDescription = "" }: AssignmentFormProps) {
  const [title, setTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [description, setDescription] = useState(initialDescription);
  const [maxScore, setMaxScore] = useState("100");
  const [gradingFocus, setGradingFocus] = useState("");
  const [rubric, setRubric] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatorMessage, setGeneratorMessage] = useState<string | null>(null);

  async function generateRubric() {
    setGeneratorMessage(null);

    if (!title.trim() || !courseCode.trim() || !description.trim() || !maxScore.trim()) {
      setGeneratorMessage("Add the assignment title, course, description, and max score first.");
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("/api/rubric-suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          courseCode,
          description,
          maxScore: Number(maxScore),
        }),
      });

      if (response.status === 401) {
        throw new Error("unauthorized");
      }

      if (!response.ok) {
        throw new Error("generator-failed");
      }

      const data = (await response.json()) as {
        gradingFocus: string;
        rubric: string;
      };

      startTransition(() => {
        setGradingFocus(data.gradingFocus);
        setRubric(data.rubric);
      });
      setGeneratorMessage("Rubric generated. You can edit it before saving.");
    } catch (error) {
      setGeneratorMessage(
        error instanceof Error && error.message === "unauthorized"
          ? "Your professor session expired. Sign in again, then try generating the rubric."
          : "Rubric generation failed. You can still save the assignment and let the server build a fallback rubric.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <form action="/api/assignments" method="post" className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Assignment title
        <input
          className="field"
          name="title"
          placeholder="Capstone Project 1"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Course or module
        <input
          className="field"
          name="courseCode"
          placeholder="CS-410"
          required
          value={courseCode}
          onChange={(event) => setCourseCode(event.target.value)}
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Maximum score
        <input
          className="field"
          name="maxScore"
          type="number"
          min="1"
          step="1"
          placeholder="100"
          required
          value={maxScore}
          onChange={(event) => setMaxScore(event.target.value)}
        />
      </label>
      <div className="rounded-[1rem] border border-slate-200/80 bg-white/75 px-4 py-3 text-sm leading-7 text-slate-600">
        The rubric is generated from the assignment description and score scale, then you can edit
        it before saving. If Gemini is unavailable, the server can still draft a fallback rubric
        when you submit.
      </div>
      <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
        Assignment brief
        <textarea
          className="field min-h-32"
          name="description"
          placeholder="Explain the project goals, required features, and expected deliverables."
          required
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className="sm:col-span-2 flex flex-col gap-3 rounded-[1.25rem] border border-slate-200/80 bg-white/80 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">AI rubric helper</p>
            <p className="text-sm text-slate-600">
              Generate a first draft, then adjust the text however you like.
            </p>
          </div>
          <button
            className="button-secondary"
            type="button"
            onClick={generateRubric}
            disabled={isGenerating}
          >
            {isGenerating ? "Generating..." : "Generate rubric"}
          </button>
        </div>
        {generatorMessage ? (
          <div className="rounded-[1rem] bg-slate-950 px-4 py-3 text-sm text-slate-100">
            {generatorMessage}
          </div>
        ) : null}
      </div>
      <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
        What should the AI prioritize?
        <textarea
          className="field min-h-24"
          name="gradingFocus"
          placeholder="Generated automatically, but you can edit it."
          value={gradingFocus}
          onChange={(event) => setGradingFocus(event.target.value)}
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
        Rubric and professor notes
        <textarea
          className="field min-h-44"
          name="rubric"
          placeholder="Generate a rubric from the assignment description, then edit it as needed."
          value={rubric}
          onChange={(event) => setRubric(event.target.value)}
        />
      </label>
      <button className="button-primary sm:col-span-2" type="submit">
        Save assignment
      </button>
    </form>
  );
}
