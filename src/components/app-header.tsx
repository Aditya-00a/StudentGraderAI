import Link from "next/link";
import { cookies } from "next/headers";
import {
  getCurrentUserFromCookies,
  hasProfessorSessionCookie,
  isLocalAuthEnabled,
  isProfessorAccessConfigured,
} from "@/lib/auth";

export async function AppHeader() {
  const localAuth = isLocalAuthEnabled();
  const user = localAuth ? await getCurrentUserFromCookies() : null;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
  const professorSignedIn =
    !localAuth && isProfessorAccessConfigured() && hasProfessorSessionCookie(cookieHeader);

  const signedIn = Boolean(user) || professorSignedIn;
  const primaryHref = user ? (user.role === "student" ? "/submit" : "/") : professorSignedIn ? "/" : "/login";
  const primaryLabel = user
    ? user.role === "student"
      ? "My workspace"
      : "Dashboard"
    : professorSignedIn
      ? "Dashboard"
      : localAuth
        ? "Sign in"
        : "Professor sign in";

  return (
    <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link className="flex items-center gap-3 text-slate-900" href={signedIn ? primaryHref : "/"}>
          <span className="pill">StudentGraderAI</span>
          <span className="hidden text-sm text-slate-600 sm:inline">
            Invite-only NYU sandbox
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {user ? (
            <span className="hidden text-sm text-slate-600 sm:inline">
              Signed in as {user.firstName} {user.lastName}
            </span>
          ) : null}

          <Link className="button-secondary" href={primaryHref}>
            {primaryLabel}
          </Link>

          {signedIn ? (
            <form action="/api/auth/professor-logout" method="post">
              <button className="button-primary" type="submit">
                Sign out
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </header>
  );
}
