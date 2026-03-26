import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAiProviderDiagnostics } from "@/lib/ai-provider";
import { hasProfessorSessionCookie, isProfessorAccessConfigured } from "@/lib/auth";
import { hasBlobStorageConfigured } from "@/lib/blob-storage";
import {
  checkSupabaseStorageHealth,
  getSupabaseBucketName,
  getSupabaseEnvDiagnostics,
  hasSupabaseStorageConfigured,
} from "@/lib/supabase-storage";

export const dynamic = "force-dynamic";

export default async function ProfessorDebugPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");

  if (isProfessorAccessConfigured() && !hasProfessorSessionCookie(cookieHeader)) {
    redirect("/professor-login?next=/professor-debug");
  }

  const supabaseHealth = await checkSupabaseStorageHealth();
  const supabaseEnv = getSupabaseEnvDiagnostics();
  const aiProvider = getAiProviderDiagnostics();

  const checks = [
    {
      label: "Professor access key detected",
      value: Boolean(process.env.PROFESSOR_ACCESS_KEY),
    },
    {
      label: "AI provider configured",
      value: aiProvider.configured,
    },
    {
      label: "Gemini API key detected",
      value: aiProvider.geminiKeyDetected,
    },
    {
      label: "Ollama model detected",
      value: Boolean(aiProvider.ollamaModel),
    },
    {
      label: "Supabase URL detected",
      value: supabaseEnv.urlDetected,
    },
    {
      label: "Supabase service role key detected",
      value: supabaseEnv.serviceRoleKeyDetected,
    },
    {
      label: "Supabase storage configured",
      value: hasSupabaseStorageConfigured(),
    },
    {
      label: "Vercel Blob configured",
      value: hasBlobStorageConfigured(),
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel rounded-[2rem] p-6 sm:p-8">
        <span className="pill">Professor diagnostics</span>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900">Deployment checks</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          This page only shows whether required deployment settings are visible to the running app.
          It does not reveal any secret values.
        </p>
        <div className="mt-6 grid gap-3">
          {checks.map((check) => (
            <div
              key={check.label}
              className="flex items-center justify-between rounded-[1rem] border border-slate-200/80 bg-white/80 px-4 py-3"
            >
              <span className="text-sm font-medium text-slate-800">{check.label}</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  check.value
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-rose-100 text-rose-900"
                }`}
              >
                {check.value ? "Yes" : "No"}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-[1rem] bg-slate-950 px-4 py-3 text-sm text-slate-100">
          AI provider: {aiProvider.provider}
        </div>
        <div className="mt-4 rounded-[1rem] bg-slate-950 px-4 py-3 text-sm text-slate-100">
          Ollama base URL: {aiProvider.ollamaBaseUrl}
        </div>
        <div className="mt-4 rounded-[1rem] bg-slate-950 px-4 py-3 text-sm text-slate-100">
          Ollama model: {aiProvider.ollamaModel || "Not set"}
        </div>
        <div className="mt-4 rounded-[1rem] bg-slate-950 px-4 py-3 text-sm text-slate-100">
          Supabase bucket name: {getSupabaseBucketName()}
        </div>
        <div className="mt-4 rounded-[1rem] border border-slate-200/80 bg-white/80 px-4 py-3 text-sm leading-7 text-slate-700">
          Accepted variable names: <code>SUPABASE_URL</code> or <code>NEXT_PUBLIC_SUPABASE_URL</code>,
          plus <code>SUPABASE_SERVICE_ROLE_KEY</code> or <code>SUPABASE_SERVICE_KEY</code>.
        </div>
        <div
          className={`mt-4 rounded-[1rem] px-4 py-3 text-sm ${
            supabaseHealth.ok
              ? "bg-emerald-50 text-emerald-950"
              : "bg-rose-50 text-rose-950"
          }`}
        >
          Supabase storage health: {supabaseHealth.ok ? "OK" : "Failed"}
          <div className="mt-2 break-words">{supabaseHealth.detail}</div>
        </div>
      </section>
    </main>
  );
}
