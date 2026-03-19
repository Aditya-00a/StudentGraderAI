import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hasProfessorSessionCookie, isProfessorAccessConfigured } from "@/lib/auth";
import { getSubmissionById } from "@/lib/store";
import { formatDate, formatScore, getStatusAppearance } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SubmissionPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SubmissionPage({ params }: SubmissionPageProps) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");

  if (isProfessorAccessConfigured() && !hasProfessorSessionCookie(cookieHeader)) {
    redirect("/professor-login?next=/submissions");
  }

  const { id } = await params;
  const submission = await getSubmissionById(id);

  if (!submission) {
    notFound();
  }

  const appearance = getStatusAppearance(submission.status);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="pill">
                <span className="status-dot" style={{ backgroundColor: appearance.dot }} />
                {appearance.label}
              </span>
              <span className="pill">{submission.assignmentTitle}</span>
              <span className="pill">{formatDate(submission.createdAt)}</span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                {submission.studentName}
              </h1>
              <p className="mt-2 text-sm text-slate-500">{submission.studentEmail}</p>
            </div>
            <p className="max-w-3xl text-base leading-8 text-slate-600">
              {submission.gradingSummary ??
                submission.errorMessage ??
                "The AI grader is still analyzing the submission. Refresh in a moment."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="button-secondary" href="/">
                Back to dashboard
              </Link>
              {submission.githubUrl ? (
                <a
                  className="button-secondary"
                  href={submission.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open GitHub repository
                </a>
              ) : null}
            </div>
          </div>

          <div className="rounded-[1.75rem] bg-slate-950 px-6 py-5 text-white lg:min-w-72">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
              Final score
            </p>
            <p className="mt-4 text-5xl font-semibold">
              {submission.score === null ? "--" : formatScore(submission.score)}
            </p>
            <p className="mt-3 text-sm text-slate-300">
              {submission.score === null
                ? "Waiting for the model to produce a final grade."
                : "Score generated against the professor-defined rubric."}
            </p>
          </div>
        </div>
      </section>

      {submission.status === "failed" ? (
        <section className="glass-panel rounded-[1.75rem] border border-rose-300/70 bg-rose-50/75 p-6 text-sm leading-7 text-rose-950">
          <h2 className="text-xl font-semibold text-rose-950">Analysis needs attention</h2>
          <p className="mt-3">
            {submission.errorMessage ??
              "The submission could not be graded. Check the server logs and environment variables."}
          </p>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
          <span className="pill">What is working</span>
          <h2 className="mt-4 text-2xl font-semibold text-slate-900">Strengths</h2>
          <ul className="mt-5 grid gap-3">
            {submission.strengths.length === 0 ? (
              <li className="rounded-[1.1rem] border border-dashed border-slate-300 bg-white/55 px-4 py-4 text-sm text-slate-600">
                No strengths generated yet.
              </li>
            ) : (
              submission.strengths.map((item) => (
                <li
                  key={item}
                  className="rounded-[1.1rem] border border-emerald-200/80 bg-emerald-50/80 px-4 py-4 text-sm leading-7 text-emerald-950"
                >
                  {item}
                </li>
              ))
            )}
          </ul>

          <span className="pill mt-8">What should improve</span>
          <h2 className="mt-4 text-2xl font-semibold text-slate-900">Improvement areas</h2>
          <ul className="mt-5 grid gap-3">
            {submission.improvements.length === 0 ? (
              <li className="rounded-[1.1rem] border border-dashed border-slate-300 bg-white/55 px-4 py-4 text-sm text-slate-600">
                No improvement notes generated yet.
              </li>
            ) : (
              submission.improvements.map((item) => (
                <li
                  key={item}
                  className="rounded-[1.1rem] border border-amber-200/80 bg-amber-50/90 px-4 py-4 text-sm leading-7 text-amber-950"
                >
                  {item}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="space-y-6">
          <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
            <span className="pill">Professor feedback</span>
            <h2 className="mt-4 text-2xl font-semibold text-slate-900">Summary</h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              {submission.professorFeedback ??
                "Detailed narrative feedback will appear here once grading finishes."}
            </p>
          </section>

          <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
            <span className="pill">Submission details</span>
            <dl className="mt-5 grid gap-4 text-sm">
              <InfoRow label="Status" value={appearance.label} />
              <InfoRow label="Uploaded files" value={String(submission.files.length)} />
              <InfoRow label="Analyzed artifacts" value={String(submission.analyzedFiles.length)} />
              <InfoRow
                label="GitHub link"
                value={submission.githubUrl ? "Included" : "Not provided"}
              />
              <InfoRow label="Submitted on" value={formatDate(submission.createdAt)} />
            </dl>
            {submission.notes ? (
              <div className="mt-5 rounded-[1.1rem] bg-white/80 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.26em] text-slate-500">
                  Student notes
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-700">{submission.notes}</p>
              </div>
            ) : null}
          </section>
        </div>
      </section>

      <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
        <span className="pill">Rubric breakdown</span>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {submission.rubricBreakdown.length === 0 ? (
            <div className="rounded-[1.1rem] border border-dashed border-slate-300 bg-white/55 px-5 py-8 text-sm leading-7 text-slate-600 lg:col-span-3">
              Rubric details will appear after a successful grade.
            </div>
          ) : (
            submission.rubricBreakdown.map((item) => (
              <article
                key={`${item.criterion}-${item.score}`}
                className="rounded-[1.25rem] border border-slate-200/80 bg-white/82 p-5"
              >
                <p className="font-mono text-xs uppercase tracking-[0.26em] text-slate-500">
                  Criterion
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">{item.criterion}</h2>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatScore(item.score)}</p>
                <p className="mt-4 text-sm leading-7 text-slate-700">{item.feedback}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
        <span className="pill">Evidence analyzed</span>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {submission.analyzedFiles.length === 0 ? (
            <div className="rounded-[1.1rem] border border-dashed border-slate-300 bg-white/55 px-5 py-8 text-sm leading-7 text-slate-600 md:col-span-2 xl:col-span-3">
              No artifact list is available yet.
            </div>
          ) : (
            submission.analyzedFiles.map((artifact) => (
              <article
                key={`${artifact.source}-${artifact.path}`}
                className="rounded-[1.1rem] border border-slate-200/80 bg-white/82 p-4"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  {artifact.source}
                </p>
                <p className="mt-2 break-all text-sm font-medium text-slate-900">{artifact.path}</p>
                <p className="mt-3 text-xs text-slate-500">{artifact.charCount} characters sampled</p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-5 rounded-[1rem] bg-white/80 px-4 py-3">
      <dt className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
