export const dynamic = "force-dynamic";

type ProfessorLoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function ProfessorLoginPage({ searchParams }: ProfessorLoginPageProps) {
  const { error, next } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-8 sm:px-6 lg:px-8">
      <section className="glass-panel grid w-full gap-8 rounded-[2rem] p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <span className="pill">Professor-only dashboard</span>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Keep assignment setup and grading results private.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-600">
            Students only need the public submission page. Use this login to open the professor
            dashboard, create assignments, and review every submission in one place.
          </p>
          <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/80 p-5 text-sm leading-7 text-slate-700">
            Share this student link:
            <div className="mt-3 rounded-xl bg-slate-950 px-4 py-3 font-mono text-sm text-white">
              /submit
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200/80 bg-white/85 p-6">
          <h2 className="text-2xl font-semibold text-slate-900">Professor sign in</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Enter the professor access key configured for this deployment.
          </p>
          {error ? (
            <div className="mt-5 rounded-[1rem] border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-950">
              The password was not accepted. Try again.
            </div>
          ) : null}
          <form action="/api/auth/professor-login" method="post" className="mt-6 grid gap-4">
            <input type="hidden" name="next" value={next && next.startsWith("/") ? next : "/"} />
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Professor password
              <input
                className="field"
                name="password"
                type="password"
                placeholder="Enter access key"
                required
              />
            </label>
            <button className="button-primary" type="submit">
              Open professor dashboard
            </button>
            <a className="button-secondary" href="/submit">
              Go to student submission page
            </a>
          </form>
        </div>
      </section>
    </main>
  );
}
