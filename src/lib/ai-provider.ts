import { GoogleGenAI } from "@google/genai";

type ProviderName = "gemini" | "ollama" | "none";

type StructuredGenerationInput = {
  systemInstruction: string;
  prompt: string;
  schema: Record<string, unknown>;
  geminiModel?: string;
  ollamaModel?: string;
};

type TextGenerationInput = {
  systemInstruction: string;
  prompt: string;
  geminiModel?: string;
  ollamaModel?: string;
  temperature?: number;
};

function getTrimmedEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

async function readResponseBodySafe(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOllamaWithRetry(
  input: string,
  init: RequestInit,
  retries = 2,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(1000 * 60 * 3),
      });

      if (response.ok) {
        return response;
      }

      const body = await readResponseBodySafe(response);
      const message = `Ollama request failed: ${response.status} ${body}`.trim();

      if (attempt === retries) {
        throw new Error(message);
      }

      lastError = new Error(message);
    } catch (error) {
      lastError = error;

      if (attempt === retries) {
        break;
      }
    }

    await delay(1000 * (attempt + 1));
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Ollama request failed after multiple attempts.");
}

export function getAiProviderName(): ProviderName {
  const configured = getTrimmedEnvValue("AI_PROVIDER").toLowerCase();

  if (configured === "gemini" || configured === "ollama") {
    return configured;
  }

  if (getTrimmedEnvValue("OLLAMA_MODEL", "OLLAMA_BASE_URL")) {
    return "ollama";
  }

  if (getTrimmedEnvValue("GEMINI_API_KEY")) {
    return "gemini";
  }

  return "none";
}

export function hasAiProviderConfigured() {
  const provider = getAiProviderName();

  if (provider === "gemini") {
    return Boolean(getTrimmedEnvValue("GEMINI_API_KEY"));
  }

  if (provider === "ollama") {
    return Boolean(getTrimmedEnvValue("OLLAMA_MODEL"));
  }

  return false;
}

export function getAiProviderDiagnostics() {
  const provider = getAiProviderName();

  return {
    provider,
    configured: hasAiProviderConfigured(),
    geminiKeyDetected: Boolean(getTrimmedEnvValue("GEMINI_API_KEY")),
    geminiModel: getTrimmedEnvValue("GEMINI_MODEL") || "gemini-2.5-flash",
    ollamaBaseUrl: getTrimmedEnvValue("OLLAMA_BASE_URL") || "http://127.0.0.1:11434",
    ollamaModel: getTrimmedEnvValue("OLLAMA_MODEL"),
  };
}

export async function generateStructuredObject({
  systemInstruction,
  prompt,
  schema,
  geminiModel,
  ollamaModel,
}: StructuredGenerationInput) {
  const provider = getAiProviderName();

  if (provider === "gemini") {
    return generateWithGemini({
      systemInstruction,
      prompt,
      schema,
      model: geminiModel || getTrimmedEnvValue("GEMINI_MODEL") || "gemini-2.5-flash",
    });
  }

  if (provider === "ollama") {
    return generateWithOllama({
      systemInstruction,
      prompt,
      schema,
      model: ollamaModel || getTrimmedEnvValue("OLLAMA_MODEL"),
      baseUrl: getTrimmedEnvValue("OLLAMA_BASE_URL") || "http://127.0.0.1:11434",
    });
  }

  throw new Error(
    "No AI provider is configured. Set AI_PROVIDER=ollama with OLLAMA_MODEL, or configure Gemini with GEMINI_API_KEY.",
  );
}

export async function generateTextResponse({
  systemInstruction,
  prompt,
  geminiModel,
  ollamaModel,
  temperature = 0.3,
}: TextGenerationInput) {
  const provider = getAiProviderName();

  if (provider === "gemini") {
    const apiKey = getTrimmedEnvValue("GEMINI_API_KEY");

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing from the server environment.");
    }

    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: geminiModel || getTrimmedEnvValue("GEMINI_MODEL") || "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("The Gemini assistant returned an empty response.");
    }

    return text;
  }

  if (provider === "ollama") {
    const model = ollamaModel || getTrimmedEnvValue("OLLAMA_MODEL");
    if (!model) {
      throw new Error("OLLAMA_MODEL is missing from the server environment.");
    }

    const baseUrl = getTrimmedEnvValue("OLLAMA_BASE_URL") || "http://127.0.0.1:11434";
    const response = await fetchOllamaWithRetry(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: false,
        options: {
          temperature,
        },
        messages: [
          {
            role: "system",
            content: systemInstruction,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      cache: "no-store",
    });

    const payload = (await response.json()) as {
      message?: {
        content?: string;
      };
    };

    const text = payload.message?.content?.trim();
    if (!text) {
      throw new Error("The Ollama assistant returned an empty response.");
    }

    return text;
  }

  throw new Error(
    "No AI provider is configured. Set AI_PROVIDER=ollama with OLLAMA_MODEL, or configure Gemini with GEMINI_API_KEY.",
  );
}

async function generateWithGemini({
  systemInstruction,
  prompt,
  schema,
  model,
}: {
  systemInstruction: string;
  prompt: string;
  schema: Record<string, unknown>;
  model: string;
}) {
  const apiKey = getTrimmedEnvValue("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from the server environment.");
  }

  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    },
  });

  if (!response.text) {
    throw new Error("The Gemini grader returned an empty response.");
  }

  return parseJsonResponse(response.text);
}

async function generateWithOllama({
  systemInstruction,
  prompt,
  schema,
  model,
  baseUrl,
}: {
  systemInstruction: string;
  prompt: string;
  schema: Record<string, unknown>;
  model: string;
  baseUrl: string;
}) {
  if (!model) {
    throw new Error("OLLAMA_MODEL is missing from the server environment.");
  }

  const response = await fetchOllamaWithRetry(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: schema,
      options: {
        temperature: 0.2,
      },
      messages: [
        {
          role: "system",
          content: systemInstruction,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    message?: {
      content?: string;
    };
  };

  const text = payload.message?.content?.trim();
  if (!text) {
    throw new Error("The Ollama grader returned an empty response.");
  }

  return parseJsonResponse(text);
}

function parseJsonResponse(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as unknown;
}
