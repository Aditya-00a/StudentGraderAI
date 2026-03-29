"use client";

import { useMemo, useState } from "react";
import type {
  ArtifactPreview,
  SandboxRuntime,
  StudentProjectOverview,
  SubmissionChatMessage,
  SubmissionSandboxRun,
} from "@/lib/types";

type SubmissionWorkspaceProps = {
  submissionId: string;
  assignmentTitle: string;
  studentName: string;
  createdAt: string;
  notes: string | null;
  githubUrl: string | null;
  analyzedFiles: ArtifactPreview[];
  projectOverview: StudentProjectOverview | null;
  initialChatHistory: SubmissionChatMessage[];
  initialSandboxRuns: SubmissionSandboxRun[];
};

export function SubmissionWorkspace({
  submissionId,
  assignmentTitle,
  studentName,
  createdAt,
  notes,
  githubUrl,
  analyzedFiles,
  projectOverview,
  initialChatHistory,
  initialSandboxRuns,
}: SubmissionWorkspaceProps) {
  const [chatHistory, setChatHistory] = useState(initialChatHistory);
  const [question, setQuestion] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatting, setIsChatting] = useState(false);

  const [sandboxRuns, setSandboxRuns] = useState(initialSandboxRuns);
  const [runtime, setRuntime] = useState<SandboxRuntime>("node");
  const [setupCommand, setSetupCommand] = useState("");
  const [runCommand, setRunCommand] = useState("npm run build");
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showAdvancedRunOptions, setShowAdvancedRunOptions] = useState(false);

  const latestRun = useMemo(() => sandboxRuns[0] ?? null, [sandboxRuns]);

  async function handleAskGemma(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = question.trim();
    if (!message) {
      return;
    }

    setIsChatting(true);
    setChatError(null);

    try {
      const response = await fetch(`/api/submissions/${submissionId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error("The project chat is unavailable right now.");
      }

      const payload = (await response.json()) as {
        userMessage?: SubmissionChatMessage;
        assistantMessage?: SubmissionChatMessage;
      };

      setChatHistory((current) => [
        ...current,
        ...(payload.userMessage ? [payload.userMessage] : []),
        ...(payload.assistantMessage ? [payload.assistantMessage] : []),
      ]);
      setQuestion("");
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "The project chat is unavailable right now.",
      );
    } finally {
      setIsChatting(false);
    }
  }

  async function handleRunSandbox(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!githubUrl) {
      setRunError("Add a public GitHub repository to this submission before using the DGX runner.");
      return;
    }

    setIsRunning(true);
    setRunError(null);

    try {
      const nextRunCommand = runCommand.trim();
      const nextSetupCommand = setupCommand.trim();
      const response = await fetch(`/api/submissions/${submissionId}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runtime: showAdvancedRunOptions ? runtime : undefined,
          setupCommand: showAdvancedRunOptions ? nextSetupCommand : "",
          runCommand: showAdvancedRunOptions ? nextRunCommand : "",
        }),
      });

      const payload = (await response.json()) as {
        run?: SubmissionSandboxRun | null;
        error?: string;
      };

      if (!response.ok && payload.error) {
        throw new Error(payload.error);
      }

      if (!payload.run) {
        throw new Error(payload.error || "The DGX sandbox did not return a run result.");
      }

      setSandboxRuns((current) => [
        payload.run!,
        ...current.filter((item) => item.id !== payload.run!.id),
      ]);
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : "The DGX sandbox could not run this project.",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <section className="glass-panel rounded-[1.75rem] p-5 sm:p-6">
          <span className="pill">Project</span>
          <h2 className="mt-4 text-2xl font-semibold text-slate-900">{assignmentTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            This workspace is for testing and improving your project with Gemma. Grades stay visible
            only to faculty and admins.
          </p>

          <dl className="mt-5 grid gap-3 text-sm">
            <SidebarRow label="Owner" value={studentName} />
            <SidebarRow
              label="Submitted"
              value={new Date(createdAt).toLocaleString()}
            />
            <SidebarRow label="Artifacts" value={String(analyzedFiles.length)} />
            <SidebarRow label="GitHub" value={githubUrl ? "Connected" : "Missing"} />
          </dl>

          {githubUrl ? (
            <a
              className="button-secondary mt-5 w-full"
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open repository
            </a>
          ) : null}

          {notes ? (
            <div className="mt-5 rounded-[1.1rem] bg-white/80 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Your notes
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-700">{notes}</p>
            </div>
          ) : null}
        </section>

        <section className="glass-panel rounded-[1.75rem] p-5 sm:p-6">
          <span className="pill">Run on DGX</span>
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Sandbox test</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Use the quick check if you want the system to try common project commands automatically.
            Only open advanced commands if your project needs something custom.
          </p>

          <form className="mt-5 grid gap-4" onSubmit={handleRunSandbox}>
            <div className="rounded-[1rem] border border-slate-200/80 bg-white/78 px-4 py-4 text-sm leading-7 text-slate-700">
              Quick check will inspect the repository, choose a likely runtime, install dependencies,
              and try a common build, test, or run command for the project.
            </div>

            {!githubUrl ? (
              <div className="rounded-[1rem] border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                A public GitHub repository is required for DGX runs.
              </div>
            ) : null}

            <button className="button-primary w-full" type="submit" disabled={isRunning || !githubUrl}>
              {isRunning ? "Running on DGX..." : "Quick check on DGX"}
            </button>

            <button
              className="button-secondary w-full"
              type="button"
              onClick={() => setShowAdvancedRunOptions((current) => !current)}
            >
              {showAdvancedRunOptions ? "Hide advanced commands" : "Advanced commands"}
            </button>

            {showAdvancedRunOptions ? (
              <div className="grid gap-4 rounded-[1.2rem] border border-slate-200/80 bg-white/82 p-4">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Runtime
                  <select
                    className="field"
                    value={runtime}
                    onChange={(event) => setRuntime(event.target.value as SandboxRuntime)}
                  >
                    <option value="node">Node.js</option>
                    <option value="python">Python</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Setup command
                  <input
                    className="field"
                    value={setupCommand}
                    onChange={(event) => setSetupCommand(event.target.value)}
                    placeholder={
                      runtime === "python" ? "pip install -r requirements.txt" : "npm install"
                    }
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Run command
                  <input
                    className="field"
                    value={runCommand}
                    onChange={(event) => setRunCommand(event.target.value)}
                    placeholder={runtime === "python" ? "python app.py" : "npm run build"}
                  />
                </label>
                <button
                  className="button-secondary w-full"
                  type="submit"
                  disabled={isRunning || !githubUrl}
                >
                  {isRunning ? "Running custom command..." : "Run with advanced commands"}
                </button>
              </div>
            ) : null}

            {runError ? (
              <div className="rounded-[1rem] border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-950">
                {runError}
              </div>
            ) : null}
          </form>

          <div className="mt-6 space-y-3">
            {sandboxRuns.length === 0 ? (
              <div className="rounded-[1.1rem] border border-dashed border-slate-300 bg-white/55 px-4 py-5 text-sm leading-7 text-slate-600">
                No sandbox runs yet.
              </div>
            ) : (
              sandboxRuns.map((run) => (
                <article
                  key={run.id}
                  className="rounded-[1.1rem] border border-slate-200/80 bg-white/82 p-4"
                >
                  <div className="flex flex-wrap gap-2">
                    <span className="pill">{run.runtime}</span>
                    <span className="pill">{run.status}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {run.summary ?? "The DGX sandbox is still running."}
                  </p>
                  {run.studentExplanation ? (
                    <div className="mt-3 rounded-[1rem] border border-sky-200/80 bg-sky-50/85 px-4 py-3 text-sm leading-7 text-sky-950">
                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-sky-700">
                        What went wrong
                      </p>
                      <p className="mt-2">{run.studentExplanation}</p>
                    </div>
                  ) : null}
                  <div className="mt-3 rounded-[1rem] bg-slate-950 px-4 py-3 text-xs leading-6 text-slate-100">
                    <p className="font-mono uppercase tracking-[0.22em] text-slate-400">
                      Exit code
                    </p>
                    <p className="mt-2">{run.exitCode === null ? "--" : run.exitCode}</p>
                    <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words text-slate-200">
                      {run.logs || "No logs captured yet."}
                    </pre>
                  </div>
                </article>
              ))
            )}
          </div>

          {latestRun ? (
            <p className="mt-4 text-xs leading-6 text-slate-500">
              Latest sandbox status: <strong>{latestRun.status}</strong>
            </p>
          ) : null}
        </section>
      </aside>

      <section className="glass-panel flex min-h-[48rem] flex-col rounded-[1.75rem] p-5 sm:p-6">
        <div className="border-b border-slate-200/80 pb-4">
          <span className="pill">Ask Gemma</span>
          <h2 className="mt-4 text-2xl font-semibold text-slate-900">Project chat</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Talk through bugs, setup issues, architecture choices, missing pieces, or deployment
            concerns. Gemma answers from the code and files attached to this project.
          </p>
        </div>

        {projectOverview ? (
          <section className="mt-5 rounded-[1.4rem] border border-slate-200/80 bg-white/86 p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
              Project snapshot
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-700">{projectOverview.summary}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {projectOverview.detectedStack.map((item) => (
                <span key={item} className="pill">
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[1.1rem] bg-emerald-50/80 px-4 py-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-emerald-700">
                  What to do next
                </p>
                <ul className="mt-3 grid gap-2 text-sm leading-7 text-emerald-950">
                  {projectOverview.whatToDoNext.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[1.1rem] bg-amber-50/90 px-4 py-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-amber-700">
                  Watch out for
                </p>
                <ul className="mt-3 grid gap-2 text-sm leading-7 text-amber-950">
                  {projectOverview.watchOutFor.length === 0 ? (
                    <li>• No major issues were automatically flagged yet.</li>
                  ) : (
                    projectOverview.watchOutFor.map((item) => <li key={item}>• {item}</li>)
                  )}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        <div className="flex-1 space-y-4 overflow-y-auto py-5 pr-1">
          {chatHistory.length === 0 ? (
            <div className="flex h-full min-h-72 items-center justify-center rounded-[1.4rem] border border-dashed border-slate-300 bg-white/60 px-6 text-center text-sm leading-7 text-slate-600">
              Start the conversation by asking Gemma what looks broken, how to improve your README,
              or why your GitHub project may fail on the DGX.
            </div>
          ) : (
            chatHistory.map((message) => (
              <article
                key={message.id}
                className={`max-w-4xl rounded-[1.4rem] px-5 py-4 text-sm leading-7 shadow-sm ${
                  message.role === "assistant"
                    ? "mr-12 border border-slate-200/80 bg-white/90 text-slate-900"
                    : "ml-auto max-w-3xl border border-emerald-300/60 bg-emerald-50/90 text-emerald-950"
                }`}
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  {message.role === "assistant" ? "Gemma" : "You"}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
              </article>
            ))
          )}
        </div>

        <form
          className="border-t border-slate-200/80 pt-4"
          onSubmit={handleAskGemma}
        >
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Message
            <textarea
              className="field min-h-28"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask Gemma about your code, setup, architecture, debugging, or deployment..."
            />
          </label>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-6 text-slate-500">
              Grades stay hidden from students. This workspace is for testing, debugging, and
              improving the project itself.
            </p>
            <button className="button-primary sm:min-w-40" type="submit" disabled={isChatting}>
              {isChatting ? "Gemma is thinking..." : "Send"}
            </button>
          </div>

          {chatError ? (
            <div className="mt-3 rounded-[1rem] border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-950">
              {chatError}
            </div>
          ) : null}
        </form>
      </section>
    </section>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] bg-white/78 px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
