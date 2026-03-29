"use client";

import { useState } from "react";
import type { Assignment } from "@/lib/types";

type StudentSubmissionFormProps = {
  assignments: Assignment[];
  studentName: string;
  studentEmail: string;
};

export function StudentSubmissionForm({
  assignments,
  studentName,
  studentEmail,
}: StudentSubmissionFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      action="/api/submissions"
      method="post"
      encType="multipart/form-data"
      className="grid gap-4"
      onSubmit={() => setIsSubmitting(true)}
    >
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Assignment
        <select className="field" name="assignmentId" required defaultValue="">
          <option value="" disabled>
            Choose your assignment
          </option>
          {assignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>
              {assignment.title} ({assignment.courseCode}) - out of {assignment.maxScore}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-[1.25rem] border border-slate-200/80 bg-white/80 p-4 text-sm leading-7 text-slate-700">
        <p className="font-semibold text-slate-900">Signed in as</p>
        <p className="mt-1">{studentName}</p>
        <p className="text-slate-500">{studentEmail}</p>
      </div>
      <input type="hidden" name="studentName" value={studentName} />
      <input type="hidden" name="studentEmail" value={studentEmail} />
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Project name
        <input
          className="field"
          name="projectName"
          type="text"
          placeholder="Credit Risk Model"
          required
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Public GitHub repository
        <input
          className="field"
          name="githubUrl"
          type="url"
          placeholder="https://github.com/username/repository"
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Upload project files or a zip archive
        <input className="field" name="projectFiles" type="file" multiple />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Submission notes
        <textarea
          className="field min-h-28"
          name="notes"
          placeholder="Optional setup instructions, special features, or missing items."
        />
      </label>
      <div className="rounded-[1.25rem] bg-slate-900 px-4 py-3 text-sm text-slate-100">
        Submissions are received here, but grading details and dashboard analytics remain private to
        the professor.
      </div>
      {isSubmitting ? (
        <div
          aria-live="polite"
          className="flex items-center gap-3 rounded-[1rem] border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-700 border-t-transparent" />
          Submitting your project. Large uploads or GitHub analysis can take a moment, so please keep
          this tab open.
        </div>
      ) : null}
      <button className="button-primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting project..." : "Submit project"}
      </button>
    </form>
  );
}
