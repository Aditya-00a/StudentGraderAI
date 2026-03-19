import { tmpdir } from "node:os";
import path from "node:path";

const persistenceRoot =
  process.env.PERSISTENCE_ROOT ||
  (process.env.VERCEL ? path.join(tmpdir(), "student-grader-ai") : process.cwd());

export const dataDirectory = path.join(persistenceRoot, "data");
export const storageRoot = path.join(persistenceRoot, "storage", "submissions");
