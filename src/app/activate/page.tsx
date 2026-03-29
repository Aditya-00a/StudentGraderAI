import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserFromCookies, isLocalAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

type ActivatePageProps = {
  searchParams: Promise<{
    error?: string;
    email?: string;
  }>;
};

export default async function ActivatePage({ searchParams }: ActivatePageProps) {
  const [user, params] = await Promise.all([getCurrentUserFromCookies(), searchParams]);

  if (user) {
    redirect(user.role === "student" ? "/submit" : "/");
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-8 sm:px-6 lg:px-8">
      <section className="glass-panel grid w-full gap-8 rounded-[2rem] p-6 sm:p-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <span className="pill">First-time setup</span>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Create your sandbox password with your invited NYU email.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-600">
            If your email was imported into the approved list, you can choose your own password here
            and go straight into your workspace.
          </p>
          <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/80 p-5 text-sm leading-7 text-slate-700">
            This only works for invited emails that have not finished first-time setup yet.
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200/80 bg-white/85 p-6">
          <h2 className="text-2xl font-semibold text-slate-900">Create password</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Use at least 10 characters with letters and numbers.
          </p>
          {!isLocalAuthEnabled() ? (
            <div className="mt-5 rounded-[1rem] border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Local accounts have not been seeded yet. Import the approved email list on the server
              before users try to activate access.
            </div>
          ) : null}
          {params.error ? (
            <div className="mt-5 rounded-[1rem] border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-950">
              {params.error}
            </div>
          ) : null}
          <form action="/api/auth/create-password" method="post" className="mt-6 grid gap-4">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              NYU email
              <input
                className="field"
                name="email"
                type="email"
                defaultValue={params.email ?? ""}
                placeholder="netid@nyu.edu"
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              New password
              <input
                className="field"
                name="password"
                type="password"
                placeholder="Create a password"
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Confirm password
              <input
                className="field"
                name="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                required
              />
            </label>
            <button className="button-primary" type="submit">
              Save password and continue
            </button>
            <Link className="button-secondary" href="/login">
              Back to sign in
            </Link>
          </form>
        </div>
      </section>
    </main>
  );
}
