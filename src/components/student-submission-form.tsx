"use client";

import { useState } from "react";
import type { Assignment } from "@/lib/types";

type StudentSubmissionFormProps = {
  assignments: Assignment[];
};

export function StudentSubmissionForm({ assignments }: StudentSubmissionFormProps) {
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
        <select className="field" name="assignmentId" required defaultValue="" disabled={isSubmitting}>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Student name
          <input
            className="field"
            name="studentName"
            placeholder="Your full name"
            required
            disabled={isSubmitting}
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Student email
          <input
            className="field"
            name="studentEmail"
            type="email"
            placeholder="netid@nyu.edu"
            required
            disabled={isSubmitting}
          />
        </label>
      </div>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Public GitHub repository
        <input
          className="field"
          name="githubUrl"
          type="url"
          placeholder="https://github.com/username/repository"
          disabled={isSubmitting}
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Upload project files or a zip archive
        <input className="field" name="projectFiles" type="file" multiple disabled={isSubmitting} />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Submission notes
        <textarea
          className="field min-h-28"
          name="notes"
          placeholder="Optional setup instructions, special features, or missing items."
          disabled={isSubmitting}
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
