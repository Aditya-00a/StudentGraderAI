import Link from "next/link";
import { listAssignments } from "@/lib/store";
import type { Assignment } from "@/lib/types";

export const dynamic = "force-dynamic";

type StudentSubmitPageProps = {
  searchParams: Promise<{
    error?: string;
    submitted?: string;
  }>;
};

export default async function StudentSubmitPage({ searchParams }: StudentSubmitPageProps) {
  const { error, submitted } = await searchParams;
  let assignments: Assignment[] = [];
  let storageError: string | null = null;

  try {
    assignments = await listAssignments();
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
          <span className="pill">Student submission portal</span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Submit your project without access to the professor dashboard.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-600">
            Choose your assignment, add your GitHub repository or files, and send your work for
            review. Assignment setup, grading notes, and overview screens stay private to the
            professor.
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="pill">GitHub link or uploads</span>
            <span className="pill">One shared form for every assignment</span>
            <span className="pill">Professor reviews results privately</span>
          </div>
        </div>
      </section>

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
          <form action="/api/submissions" method="post" encType="multipart/form-data" className="grid gap-4">
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
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Student name
                <input className="field" name="studentName" placeholder="Your full name" required />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Student email
                <input
                  className="field"
                  name="studentEmail"
                  type="email"
                  placeholder="netid@nyu.edu"
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
                placeholder="Optional setup instructions, special features, or missing items."
              />
            </label>
            <div className="rounded-[1.25rem] bg-slate-900 px-4 py-3 text-sm text-slate-100">
              Submissions are received here, but grading details and dashboard analytics remain
              private to the professor.
            </div>
            <button className="button-primary" type="submit">
              Submit project
            </button>
          </form>
        )}
      </section>

      <div className="text-sm text-slate-600">
        Looking for the professor dashboard? <Link className="underline" href="/professor-login">Professor sign in</Link>
      </div>
    </main>
  );
}
