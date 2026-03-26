import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserFromCookies, isLocalAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [user, params] = await Promise.all([getCurrentUserFromCookies(), searchParams]);

  if (user) {
    redirect(user.role === "student" ? "/submit" : "/");
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-8 sm:px-6 lg:px-8">
      <section className="glass-panel grid w-full gap-8 rounded-[2rem] p-6 sm:p-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <span className="pill">Invite-only access</span>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            NYU sandbox access with separate student, faculty, and admin roles.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-600">
            Students sign in to their own workspace to upload GitHub projects, files, and agent
            details. Faculty and admins get the full review dashboard across all workspaces.
          </p>
          <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/80 p-5 text-sm leading-7 text-slate-700">
            Access is limited to the imported allowlist. Students do not receive admin access.
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200/80 bg-white/85 p-6">
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Use your invited NYU email and local account password.
          </p>
          {!isLocalAuthEnabled() ? (
            <div className="mt-5 rounded-[1rem] border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Local accounts have not been seeded yet. Import the approved email list on the server
              before students try to sign in.
            </div>
          ) : null}
          {params.error ? (
            <div className="mt-5 rounded-[1rem] border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-950">
              The email or password was not accepted. Try again.
            </div>
          ) : null}
          <form action="/api/auth/login" method="post" className="mt-6 grid gap-4">
            <input type="hidden" name="next" value={params.next && params.next.startsWith("/") ? params.next : "/"} />
            <label className="space-y-2 text-sm font-medium text-slate-700">
              NYU email
              <input
                className="field"
                name="email"
                type="email"
                placeholder="netid@nyu.edu"
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Password
              <input
                className="field"
                name="password"
                type="password"
                placeholder="Enter your password"
                required
              />
            </label>
            <button className="button-primary" type="submit">
              Open workspace
            </button>
            <Link className="button-secondary" href="/professor-debug">
              Deployment diagnostics
            </Link>
          </form>
        </div>
      </section>
    </main>
  );
}
