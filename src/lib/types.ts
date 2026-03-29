export type SubmissionStatus = "processing" | "graded" | "failed";
export type AppRole = "student" | "faculty" | "admin";

export type AppUser = {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AppRole;
  mustChangePassword: boolean;
  active: boolean;
  createdAt: string;
};

export type Assignment = {
  id: string;
  title: string;
  courseCode: string;
  description: string;
  maxScore: number;
  gradingFocus: string;
  rubric: string;
  createdAt: string;
};

export type StoredUpload = {
  originalName: string;
  savedPath: string;
  size: number;
};

export type ArtifactPreview = {
  path: string;
  source: "upload" | "github";
  charCount: number;
};

export type RubricBreakdownItem = {
  criterion: string;
  score: number;
  feedback: string;
};

export type SubmissionChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type SandboxRuntime = "node" | "python";
export type SandboxRunStatus = "running" | "completed" | "failed";

export type SubmissionSandboxRun = {
  id: string;
  runtime: SandboxRuntime;
  setupCommand: string | null;
  runCommand: string;
  status: SandboxRunStatus;
  summary: string | null;
  studentExplanation: string | null;
  logs: string;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
};

export type StudentProjectOverview = {
  summary: string;
  detectedStack: string[];
  whatToDoNext: string[];
  watchOutFor: string[];
};

export type Submission = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  projectName: string;
  ownerUserId?: string | null;
  ownerRole?: AppRole | null;
  studentName: string;
  studentEmail: string;
  githubUrl: string | null;
  notes: string | null;
  createdAt: string;
  status: SubmissionStatus;
  files: StoredUpload[];
  analyzedFiles: ArtifactPreview[];
  score: number | null;
  gradingSummary: string | null;
  strengths: string[];
  improvements: string[];
  rubricBreakdown: RubricBreakdownItem[];
  professorFeedback: string | null;
  errorMessage: string | null;
  projectOverview: StudentProjectOverview | null;
  chatHistory: SubmissionChatMessage[];
  sandboxRuns: SubmissionSandboxRun[];
};

export type Database = {
  assignments: Assignment[];
  submissions: Submission[];
};

export type GradingResult = {
  score: number;
  gradingSummary: string;
  strengths: string[];
  improvements: string[];
  rubricBreakdown: RubricBreakdownItem[];
  professorFeedback: string;
};

export type CollectedArtifact = {
  path: string;
  source: "upload" | "github";
  content: string;
};
