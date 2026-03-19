import Link from "next/link";
import { listAssignments, listSubmissions } from "@/lib/store";
import { formatDate, formatScore, getStatusAppearance } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [assignments, submissions] = await Promise.all([
    listAssignments(),
    listSubmissions(),
  ]);

  const gradedSubmissions = submissions.filter((submission) =>
    typeof submission.score === "number",
  );
  const averageScore =
    gradedSubmissions.length > 0
      ? gradedSubmissions.reduce((sum, submission) => sum + (submission.score ?? 0), 0) /
        gradedSubmissions.length
      : null;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel relative overflow-hidden rounded-[2rem] px-6 py-8 sm:px-8 sm:py-10">
        <div className="absolute inset-y-0 right-0 hidden w-80 bg-[radial-gradient(circle_at_center,_rgba(244,182,63,0.3),_transparent_70%)] lg:block" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-5">
            <span className="pill">Professor workspace + student intake + AI grading</span>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Grade student projects from GitHub links and uploaded files in one place.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              Create assignments with your own rubric, let students submit repositories or project
              files, and return a score with feedback on strengths, weaknesses, and next-step
              improvements.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a className="button-primary" href="#student-submit">
                Open Student Submission
              </a>
              <a className="button-secondary" href="#professor-console">
                Configure Professor Console
              </a>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[28rem]">
            <MetricCard label="Assignments" value={String(assignments.length)} />
            <MetricCard label="Submissions" value={String(submissions.length)} />
            <MetricCard
              label="Average score"
              value={averageScore === null ? "N/A" : formatScore(averageScore)}
            />
          </div>
        </div>
      </section>

      {!process.env.GEMINI_API_KEY ? (
        <section className="glass-panel rounded-[1.5rem] border border-amber-300/70 bg-amber-50/75 px-5 py-4 text-sm text-amber-950">
          Add <code>GEMINI_API_KEY</code> in <code>.env.local</code> to enable grading. Students
          can still submit work, but analysis will stay in a failed state until the key is set.
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div id="professor-console" className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
          <div className="mb-6 space-y-2">
            <span className="pill">Professor console</span>
            <h2 className="text-2xl font-semibold text-slate-900">Create a grading rubric</h2>
            <p className="text-sm leading-7 text-slate-600">
              Each assignment can use its own scoring scale, grading emphasis, and rubric notes.
            </p>
          </div>

          <form
            action="/api/assignments"
            method="post"
            className="grid gap-4 sm:grid-cols-2"
          >
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Assignment title
              <input className="field" name="title" placeholder="Capstone Project 1" required />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Course or module
              <input className="field" name="courseCode" placeholder="CS-410" required />
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
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Rating label
              <input className="field" name="ratingLabel" placeholder="points" required />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
              Assignment brief
              <textarea
                className="field min-h-28"
                name="description"
                placeholder="Explain the project goals, required features, and expected deliverables."
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
              What should the AI prioritize?
              <textarea
                className="field min-h-24"
                name="gradingFocus"
                placeholder="Example: code quality, architecture, test coverage, UI polish, documentation, scalability."
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
              Rubric and professor notes
              <textarea
                className="field min-h-36"
                name="rubric"
                placeholder="Paste the rubric, weighting, or grading expectations here."
                required
              />
            </label>
            <button className="button-primary sm:col-span-2" type="submit">
              Save assignment
            </button>
          </form>
        </div>

        <div id="student-submit" className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
          <div className="mb-6 space-y-2">
            <span className="pill">Student portal</span>
            <h2 className="text-2xl font-semibold text-slate-900">Submit a project for grading</h2>
            <p className="text-sm leading-7 text-slate-600">
              Students can attach files, upload a zip, paste a public GitHub link, and add notes
              before the AI evaluates the work.
            </p>
          </div>

          {assignments.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white/55 px-5 py-8 text-sm leading-7 text-slate-600">
              Create at least one assignment first. Once it exists, students can submit work
              against it immediately.
            </div>
          ) : (
            <form
              action="/api/submissions"
              method="post"
              encType="multipart/form-data"
              className="grid gap-4"
            >
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Assignment
                <select className="field" name="assignmentId" required defaultValue="">
                  <option value="" disabled>
                    Choose an assignment
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
                  <input className="field" name="studentName" placeholder="Aditya" required />
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Student email
                  <input
                    className="field"
                    name="studentEmail"
                    type="email"
                    placeholder="student@example.com"
                    required
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
                  placeholder="Mention features you want highlighted, missing pieces, or how to run the project."
                />
              </label>
              <div className="rounded-[1.25rem] bg-slate-900 px-4 py-3 text-sm text-slate-100">
                Large projects may take 10 to 30 seconds while the app gathers files, reads the
                repository, and asks the AI to grade against the rubric.
              </div>
              <button className="button-primary" type="submit">
                Submit for AI grading
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="pill">Assignments</span>
              <h2 className="text-2xl font-semibold text-slate-900">Active grading setups</h2>
            </div>
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
              {assignments.length} total
            </span>
          </div>

          <div className="space-y-4">
            {assignments.length === 0 ? (
              <EmptyPanel message="No assignments yet. Use the professor console to create the first rubric." />
            ) : (
              assignments.map((assignment) => (
                <article
                  key={assignment.id}
                  className="rounded-[1.25rem] border border-slate-200/80 bg-white/75 p-5"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="pill">{assignment.courseCode}</span>
                    <span className="pill">
                      Out of {assignment.maxScore} {assignment.ratingLabel}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{assignment.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{assignment.description}</p>
                  <p className="mt-4 text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                    Priority
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-700">{assignment.gradingFocus}</p>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="pill">Submission feed</span>
              <h2 className="text-2xl font-semibold text-slate-900">Recent grading results</h2>
            </div>
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
              newest first
            </span>
          </div>

          <div className="space-y-4">
            {submissions.length === 0 ? (
              <EmptyPanel message="Student submissions will appear here after the first upload." />
            ) : (
              submissions.map((submission) => {
                const appearance = getStatusAppearance(submission.status);

                return (
                  <article
                    key={submission.id}
                    className="rounded-[1.25rem] border border-slate-200/80 bg-white/78 p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="pill">
                            <span
                              className="status-dot"
                              style={{ backgroundColor: appearance.dot }}
                            />
                            {appearance.label}
                          </span>
                          <span className="pill">{submission.assignmentTitle}</span>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {submission.studentName}
                        </h3>
                        <p className="text-sm text-slate-500">{submission.studentEmail}</p>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
                          Submitted
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          {formatDate(submission.createdAt)}
                        </p>
                        <p className="mt-3 text-2xl font-semibold text-slate-900">
                          {submission.score === null ? "Pending" : formatScore(submission.score)}
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 line-clamp-3 text-sm leading-7 text-slate-600">
                      {submission.gradingSummary ??
                        submission.errorMessage ??
                        "Analysis is still being prepared for this submission."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link className="button-secondary text-sm" href={`/submissions/${submission.id}`}>
                        Open result
                      </Link>
                      {submission.githubUrl ? (
                        <a
                          className="button-secondary text-sm"
                          href={submission.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View repository
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white/80 p-4">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white/55 px-5 py-8 text-sm leading-7 text-slate-600">
      {message}
    </div>
  );
}
