"use client";

import { useMemo, useState } from "react";
import type {
  SandboxRuntime,
  SubmissionChatMessage,
  SubmissionSandboxRun,
} from "@/lib/types";

type SubmissionWorkspaceProps = {
  submissionId: string;
  initialChatHistory: SubmissionChatMessage[];
  initialSandboxRuns: SubmissionSandboxRun[];
  githubUrl: string | null;
};

export function SubmissionWorkspace({
  submissionId,
  initialChatHistory,
  initialSandboxRuns,
  githubUrl,
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
      setChatError(error instanceof Error ? error.message : "The project chat is unavailable right now.");
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

    const nextRunCommand = runCommand.trim();
    if (!nextRunCommand) {
      setRunError("Add a run or test command first.");
      return;
    }

    setIsRunning(true);
    setRunError(null);

    try {
      const response = await fetch(`/api/submissions/${submissionId}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runtime,
          setupCommand,
          runCommand: nextRunCommand,
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

      setSandboxRuns((current) => [payload.run!, ...current.filter((item) => item.id !== payload.run!.id)]);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "The DGX sandbox could not run this project.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
        <span className="pill">Ask Gemma</span>
        <h2 className="mt-4 text-2xl font-semibold text-slate-900">Project chat</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Ask about architecture, bugs, missing pieces, setup steps, or how to improve the project.
          Gemma answers from the uploaded files and GitHub repository attached to this submission.
        </p>

        <div className="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {chatHistory.length === 0 ? (
            <div className="rounded-[1.1rem] border border-dashed border-slate-300 bg-white/55 px-5 py-8 text-sm leading-7 text-slate-600">
              No chat yet. Ask Gemma how your project works, what might break, or how to improve it.
            </div>
          ) : (
            chatHistory.map((message) => (
              <article
                key={message.id}
                className={`rounded-[1.1rem] px-4 py-4 text-sm leading-7 ${
                  message.role === "assistant"
                    ? "border border-sky-200/80 bg-sky-50/85 text-sky-950"
                    : "border border-slate-200/80 bg-white/82 text-slate-900"
                }`}
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  {message.role === "assistant" ? "Gemma" : "You"}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
              </article>
            ))
          )}
        </div>

        <form className="mt-5 grid gap-3" onSubmit={handleAskGemma}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Ask about this project
            <textarea
              className="field min-h-28"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What is the biggest issue in my repo? How should I structure the README? Why might this fail on the DGX?"
            />
          </label>
          {chatError ? (
            <div className="rounded-[1rem] border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-950">
              {chatError}
            </div>
          ) : null}
          <button className="button-primary" type="submit" disabled={isChatting}>
            {isChatting ? "Gemma is thinking..." : "Ask Gemma"}
          </button>
        </form>
      </div>

      <div className="glass-panel rounded-[1.75rem] p-6 sm:p-7">
        <span className="pill">Run on DGX</span>
        <h2 className="mt-4 text-2xl font-semibold text-slate-900">Sandbox run check</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          This runs the GitHub repository inside a Docker container on the DGX, not directly on the
          host. For now, the DGX runner only works with public GitHub repositories and explicit
          setup or run commands.
        </p>

        <form className="mt-5 grid gap-4" onSubmit={handleRunSandbox}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Runtime
            <select
              className="field"
              value={runtime}
              onChange={(event) => setRuntime(event.target.value as SandboxRuntime)}
            >
              <option value="node">Node.js project</option>
              <option value="python">Python project</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Setup command
            <input
              className="field"
              value={setupCommand}
              onChange={(event) => setSetupCommand(event.target.value)}
              placeholder={runtime === "python" ? "pip install -r requirements.txt" : "npm install"}
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Run or test command
            <input
              className="field"
              value={runCommand}
              onChange={(event) => setRunCommand(event.target.value)}
              placeholder={runtime === "python" ? "python app.py" : "npm run build"}
              required
            />
          </label>
          {!githubUrl ? (
            <div className="rounded-[1rem] border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Add a public GitHub repository to use the DGX sandbox runner.
            </div>
          ) : null}
          {runError ? (
            <div className="rounded-[1rem] border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-950">
              {runError}
            </div>
          ) : null}
          <button className="button-primary" type="submit" disabled={isRunning || !githubUrl}>
            {isRunning ? "Running on DGX..." : "Run on DGX"}
          </button>
        </form>

        <div className="mt-6 space-y-4">
          {sandboxRuns.length === 0 ? (
            <div className="rounded-[1.1rem] border border-dashed border-slate-300 bg-white/55 px-5 py-8 text-sm leading-7 text-slate-600">
              No DGX runs yet. Start one to check whether the repository installs and runs the way you expect.
            </div>
          ) : (
            sandboxRuns.map((run) => (
              <article
                key={run.id}
                className="rounded-[1.15rem] border border-slate-200/80 bg-white/82 p-4"
              >
                <div className="flex flex-wrap gap-2">
                  <span className="pill">{run.runtime}</span>
                  <span className="pill">{run.status}</span>
                  <span className="pill">{new Date(run.startedAt).toLocaleString()}</span>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-700">
                  {run.summary ?? "The DGX sandbox is still working on this run."}
                </p>
                <div className="mt-4 rounded-[1rem] bg-slate-950 px-4 py-3 text-xs leading-6 text-slate-100">
                  <p className="font-mono uppercase tracking-[0.22em] text-slate-400">
                    Exit code
                  </p>
                  <p className="mt-2">{run.exitCode === null ? "--" : run.exitCode}</p>
                  <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words text-slate-200">
                    {run.logs || "No logs captured yet."}
                  </pre>
                </div>
              </article>
            ))
          )}
        </div>

        {latestRun ? (
          <p className="mt-4 text-xs leading-6 text-slate-500">
            Latest run status: <strong>{latestRun.status}</strong>
          </p>
        ) : null}
      </div>
    </section>
  );
}
