export type SubmissionStatus = "processing" | "graded" | "failed";

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

export type Submission = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
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
