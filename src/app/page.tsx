import Link from "next/link";
import { AssignmentForm } from "@/components/assignment-form";
import { listAssignments, listSubmissions } from "@/lib/store";
import { formatDate, formatScore, getStatusAppearance } from "@/lib/utils";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const [assignments, submissions, params] = await Promise.all([
    listAssignments(),
    listSubmissions(),
    searchParams,
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
            <span className="pill">Professor dashboard</span>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Manage assignments, review submissions, and keep grading private.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              Students only see the submission portal. This dashboard is where the professor creates
              assignments, generates rubrics, and reviews every grading result.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link className="button-primary" href="/submit">
                Open student portal
              </Link>
              <form action="/api/auth/professor-logout" method="post">
                <button className="button-secondary" type="submit">
                  Sign out
                </button>
              </form>
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
          Add <code>GEMINI_API_KEY</code> to this deployment&apos;s environment variables to enable
          grading. Students can still submit work, but analysis will stay in a failed state until
          the key is available on the server.
        </section>
      ) : null}

      {params.created ? (
        <section className="glass-panel rounded-[1.5rem] border border-emerald-300/70 bg-emerald-50/80 px-5 py-4 text-sm leading-7 text-emerald-950">
          Assignment saved successfully.
        </section>
      ) : null}

      {params.error ? (
        <section className="glass-panel rounded-[1.5rem] border border-rose-300/70 bg-rose-50/80 px-5 py-4 text-sm leading-7 text-rose-950">
          There was a problem saving the assignment. Check the form and try again.
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <div id="professor-console" className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
          <div className="mb-6 space-y-2">
            <span className="pill">Assignment builder</span>
            <h2 className="text-2xl font-semibold text-slate-900">Create an assignment</h2>
            <p className="text-sm leading-7 text-slate-600">
              Describe the work once, let AI draft a rubric, then edit it before saving.
            </p>
          </div>
          <AssignmentForm />
        </div>

        <div className="space-y-6">
          <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="pill">Student access</span>
                <h2 className="text-2xl font-semibold text-slate-900">What students can do</h2>
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200/80 bg-white/80 p-5">
              <p className="text-sm leading-7 text-slate-700">
                Students only use the public submission page. They can choose an assignment, enter
                their name and email, add a GitHub link or files, and submit their project.
              </p>
              <div className="mt-4 rounded-xl bg-slate-950 px-4 py-3 font-mono text-sm text-white">
                /submit
              </div>
              <Link className="button-secondary mt-4" href="/submit">
                Preview student page
              </Link>
            </div>
          </section>

          <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="pill">Assignments</span>
                <h2 className="text-2xl font-semibold text-slate-900">Active setups</h2>
              </div>
              <span className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
                {assignments.length} total
              </span>
            </div>

            <div className="space-y-4">
              {assignments.length === 0 ? (
                <EmptyPanel message="No assignments yet. Create the first one with the builder." />
              ) : (
                assignments.map((assignment) => (
                  <article
                    key={assignment.id}
                    className="rounded-[1.25rem] border border-slate-200/80 bg-white/75 p-5"
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="pill">{assignment.courseCode}</span>
                      <span className="pill">Out of {assignment.maxScore}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{assignment.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{assignment.description}</p>
                    <p className="mt-4 text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                      AI grading focus
                    </p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{assignment.gradingFocus}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
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
                          <span className="status-dot" style={{ backgroundColor: appearance.dot }} />
                          {appearance.label}
                        </span>
                        <span className="pill">{submission.assignmentTitle}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900">{submission.studentName}</h3>
                      <p className="text-sm text-slate-500">{submission.studentEmail}</p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
                        Submitted
                      </p>
                      <p className="mt-1 text-sm text-slate-700">{formatDate(submission.createdAt)}</p>
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
