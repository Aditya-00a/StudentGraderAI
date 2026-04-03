"use client";

import { startTransition, useState } from "react";
import type { AppRole, AppUser } from "@/lib/types";

type UserManagementPanelProps = {
  initialUsers: AppUser[];
  currentUserId: string;
};

const roleOptions: AppRole[] = ["student", "faculty", "admin"];

export function UserManagementPanel({
  initialUsers,
  currentUserId,
}: UserManagementPanelProps) {
  const [users, setUsers] = useState(sortUsers(initialUsers));
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<AppRole>("student");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          role,
        }),
      });

      const payload = (await response.json()) as {
        user?: AppUser | null;
        error?: string;
      };

      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "The user could not be saved.");
      }

      startTransition(() => {
        setUsers((current) => sortUsers(upsertUser(current, payload.user!)));
        setEmail("");
        setFirstName("");
        setLastName("");
        setRole("student");
      });
      setMessage(`Saved access for ${payload.user.email}. They can now use the activation link.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The user could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUserAction(userId: string, action: "activate" | "deactivate" | "reset-activation") {
    setBusyUserId(userId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, action }),
      });

      const payload = (await response.json()) as {
        user?: AppUser | null;
        error?: string;
      };

      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "That user could not be updated.");
      }

      startTransition(() => {
        setUsers((current) => sortUsers(upsertUser(current, payload.user!)));
      });

      setMessage(
        action === "reset-activation"
          ? `Reset first-time setup for ${payload.user.email}.`
          : action === "activate"
            ? `Activated ${payload.user.email}.`
            : `Deactivated ${payload.user.email}.`,
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "That user could not be updated.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[23rem_minmax(0,1fr)]">
      <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
        <div className="space-y-2">
          <span className="pill">Admin only</span>
          <h2 className="text-2xl font-semibold text-slate-900">Invite or update a user</h2>
          <p className="text-sm leading-7 text-slate-600">
            Add new students, faculty, or admins by email. Saved users can create their own
            password through the activation page.
          </p>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={handleInvite}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            NYU email
            <input
              className="field"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="netid@nyu.edu"
              required
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              First name
              <input
                className="field"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="First name"
                required
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700">
              Last name
              <input
                className="field"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Last name"
                required
              />
            </label>
          </div>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            Role
            <select
              className="field"
              value={role}
              onChange={(event) => setRole(event.target.value as AppRole)}
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {capitalize(option)}
                </option>
              ))}
            </select>
          </label>

          <button className="button-primary" type="submit" disabled={isSaving}>
            {isSaving ? "Saving user..." : "Save user access"}
          </button>
        </form>

        {message ? (
          <div className="mt-4 rounded-[1rem] border border-emerald-300/70 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-[1rem] border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-950">
            {error}
          </div>
        ) : null}
      </section>

      <section className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="pill">Invited users</span>
            <h2 className="text-2xl font-semibold text-slate-900">Student management</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
              {users.length} total
            </span>
            <a className="button-secondary text-sm" href="/api/admin/reports/students">
              Download student report
            </a>
          </div>
        </div>

        <div className="space-y-4">
          {users.map((user) => (
            <article
              key={user.id}
              className="rounded-[1.25rem] border border-slate-200/80 bg-white/78 p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="pill">{capitalize(user.role)}</span>
                    <span className="pill">{user.active ? "Active" : "Inactive"}</span>
                    <span className="pill">
                      {user.mustChangePassword ? "Needs activation" : "Password ready"}
                    </span>
                    {user.id === currentUserId ? <span className="pill">You</span> : null}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {user.firstName} {user.lastName}
                  </h3>
                  <p className="text-sm text-slate-500">{user.email}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    className="button-secondary text-sm"
                    type="button"
                    disabled={busyUserId === user.id}
                    onClick={() =>
                      handleUserAction(user.id, user.active ? "deactivate" : "activate")
                    }
                  >
                    {busyUserId === user.id
                      ? "Updating..."
                      : user.active
                        ? "Deactivate"
                        : "Activate"}
                  </button>
                  <button
                    className="button-secondary text-sm"
                    type="button"
                    disabled={busyUserId === user.id}
                    onClick={() => handleUserAction(user.id, "reset-activation")}
                  >
                    {busyUserId === user.id ? "Updating..." : "Reset activation"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function sortUsers(users: AppUser[]) {
  return [...users].sort((left, right) => {
    const roleOrder = { admin: 0, faculty: 1, student: 2 };
    const roleDelta = roleOrder[left.role] - roleOrder[right.role];
    if (roleDelta !== 0) {
      return roleDelta;
    }

    const lastNameDelta = left.lastName.localeCompare(right.lastName);
    if (lastNameDelta !== 0) {
      return lastNameDelta;
    }

    const firstNameDelta = left.firstName.localeCompare(right.firstName);
    if (firstNameDelta !== 0) {
      return firstNameDelta;
    }

    return left.email.localeCompare(right.email);
  });
}

function upsertUser(users: AppUser[], nextUser: AppUser) {
  const withoutCurrent = users.filter((user) => user.id !== nextUser.id);
  return [...withoutCurrent, nextUser];
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
