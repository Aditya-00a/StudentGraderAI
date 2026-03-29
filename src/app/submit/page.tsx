import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserFromCookies, isLocalAuthEnabled } from "@/lib/auth";
import { StudentSubmissionForm } from "@/components/student-submission-form";
import { listAssignments, listSubmissionsByStudentEmail } from "@/lib/store";
import type { Assignment, Submission } from "@/lib/types";
import { getSubmissionDisplayTitle } from "@/lib/utils";

export const dynamic = "force-dynamic";

type StudentSubmitPageProps = {
  searchParams: Promise<{
    error?: string;
    submitted?: string;
  }>;
};

export default async function StudentSubmitPage({ searchParams }: StudentSubmitPageProps) {
  const { error, submitted } = await searchParams;
  const user = isLocalAuthEnabled() ? await getCurrentUserFromCookies() : null;
  const isPreviewMode = Boolean(user && user.role !== "student");
  const isStudentView = user?.role === "student";

  if (isLocalAuthEnabled() && !user) {
    redirect("/login?next=/submit");
  }

  let assignments: Assignment[] = [];
  let submissions: Submission[] = [];
  let storageError: string | null = null;

  try {
    assignments = await listAssignments();
    if (user) {
      submissions = await listSubmissionsByStudentEmail(user.email);
    }
  } catch (loadError) {
    storageError =
      loadError instanceof Error
        ? loadError.message
        : "Assignment storage could not be loaded for this deployment.";
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel rounded-[2rem] px-6 py-8 sm:px-8 sm:py-10">
        <div className="space-y-5">
          <span className="pill">{isPreviewMode ? "Student portal preview" : "Student workspace"}</span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Upload your project and test your own sandbox workspace.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-600">
            Signed in as <strong>{user ? `${user.firstName} ${user.lastName}` : "student"}</strong>. Your
            workspace is private to your account, while faculty and admins can review all uploads,
            ratings, and future sandbox runs.
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="pill">GitHub link or uploads</span>
            <span className="pill">Private student workspace</span>
            <span className="pill">Faculty/admin review everything</span>
          </div>
        </div>
      </section>

      {isPreviewMode ? (
        <section className="glass-panel rounded-[1.5rem] border border-sky-300/70 bg-sky-50/80 px-5 py-4 text-sm leading-7 text-sky-950">
          You are opening the student portal with a {user?.role} account for testing. You can submit
          work here with this same email, and you will still keep full dashboard access.
        </section>
      ) : null}

      {submitted ? (
        <section className="glass-panel rounded-[1.5rem] border border-emerald-300/70 bg-emerald-50/80 px-5 py-4 text-sm leading-7 text-emerald-950">
          Your project was submitted successfully. The professor can now review it in the grading
          dashboard.
        </section>
      ) : null}

      {error ? (
        <section className="glass-panel rounded-[1.5rem] border border-rose-300/70 bg-rose-50/80 px-5 py-4 text-sm leading-7 text-rose-950">
          {error === "assignment-not-found"
            ? "That assignment could not be found anymore. Refresh the page and choose an available assignment."
            : error === "storage"
              ? "The deployment could not save this submission because persistent storage is not working yet. Ask the professor to check the storage configuration."
              : error === "processing"
                ? "Your submission was received, but the server could not finish processing it. Try again after the professor checks the deployment settings."
                : "There was a problem with the submission. Check the form and try again."}
        </section>
      ) : null}

      {storageError ? (
        <section className="glass-panel rounded-[1.5rem] border border-rose-300/70 bg-rose-50/80 px-5 py-4 text-sm leading-7 text-rose-950">
          Assignment storage is unavailable right now, so students cannot submit work until the
          professor fixes the deployment.
          <div className="mt-3 break-words text-rose-900/80">{storageError}</div>
        </section>
      ) : null}

      <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
        <div className="mb-6 space-y-2">
          <span className="pill">Upload work</span>
          <h2 className="text-2xl font-semibold text-slate-900">Student project submission</h2>
          <p className="text-sm leading-7 text-slate-600">
            Public GitHub repositories are easiest, but you can also upload source files or a zip
            archive.
          </p>
        </div>

        {storageError ? (
          <div className="rounded-[1.25rem] border border-dashed border-rose-300 bg-white/55 px-5 py-8 text-sm leading-7 text-rose-950">
            The submission form is temporarily unavailable because assignments could not be loaded.
          </div>
        ) : assignments.length === 0 ? (
          <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white/55 px-5 py-8 text-sm leading-7 text-slate-600">
            No assignments are open yet. Check back after the professor publishes one.
          </div>
        ) : (
          <StudentSubmissionForm
            assignments={assignments}
            studentEmail={user?.email ?? ""}
            studentName={user ? `${user.firstName} ${user.lastName}`.trim() : ""}
          />
        )}
      </section>

      <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
        <div className="mb-6 space-y-2">
          <span className="pill">Your uploads</span>
          <h2 className="text-2xl font-semibold text-slate-900">Submission history</h2>
          <p className="text-sm leading-7 text-slate-600">
            You can only see your own submissions here.
          </p>
        </div>
        <div className="space-y-4">
          {submissions.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white/55 px-5 py-8 text-sm leading-7 text-slate-600">
              No submissions yet. Your uploads will appear here after the first submission.
            </div>
          ) : (
            submissions.map((submission) => (
              <article
                key={submission.id}
                className="rounded-[1.25rem] border border-slate-200/80 bg-white/78 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="pill">{getSubmissionDisplayTitle(submission)}</span>
                      <span className="pill">{submission.status}</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {isStudentView
                        ? submission.status === "failed"
                          ? "This submission hit a processing issue. You can still open the workspace and continue testing while faculty review it."
                          : submission.status === "graded"
                            ? "Your project workspace is ready. Open it to chat with Gemma and run the GitHub project on the DGX."
                            : "Your upload is being processed. Open the workspace to follow the project and continue testing."
                        : submission.gradingSummary ??
                          submission.errorMessage ??
                          "Processing is still underway for this upload."}
                    </p>
                  </div>
                  <Link className="button-secondary text-sm" href={`/submissions/${submission.id}`}>
                    Open
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="text-sm text-slate-600">
        Need a different view? <Link className="underline" href="/">Go to the main dashboard</Link>
      </div>
    </main>
  );
}
