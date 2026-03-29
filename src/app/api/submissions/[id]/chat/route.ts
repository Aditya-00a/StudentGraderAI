import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromCookieHeader, isLocalAuthEnabled, userHasRole } from "@/lib/auth";
import { answerProjectQuestion } from "@/lib/project-chat";
import { appendSubmissionChatMessage, getSubmissionById } from "@/lib/store";

export const runtime = "nodejs";

const chatSchema = z.object({
  message: z.string().trim().min(2).max(2_000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const currentUser = isLocalAuthEnabled()
    ? getCurrentUserFromCookieHeader(request.headers.get("cookie"))
    : null;

  if (isLocalAuthEnabled() && !currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const submission = await getSubmissionById(id);

  if (!submission) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (
    currentUser &&
    currentUser.role === "student" &&
    submission.studentEmail.trim().toLowerCase() !== currentUser.email.trim().toLowerCase()
  ) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (
    currentUser &&
    !userHasRole(currentUser.role, ["student", "faculty", "admin"])
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = chatSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  const userMessage = await appendSubmissionChatMessage(id, {
    role: "user",
    content: parsed.data.message,
  });

  if (!userMessage) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  try {
    const assistantReply = await answerProjectQuestion({
      submission,
      question: parsed.data.message,
      history: [...submission.chatHistory, userMessage],
    });

    const assistantMessage = await appendSubmissionChatMessage(id, {
      role: "assistant",
      content: assistantReply,
    });

    return NextResponse.json({
      userMessage,
      assistantMessage,
    });
  } catch (error) {
    const fallback =
      error instanceof Error
        ? error.message
        : "The project chat assistant could not answer right now.";

    const assistantMessage = await appendSubmissionChatMessage(id, {
      role: "assistant",
      content: fallback,
    });

    return NextResponse.json(
      {
        userMessage,
        assistantMessage,
      },
      { status: 200 },
    );
  }
}
