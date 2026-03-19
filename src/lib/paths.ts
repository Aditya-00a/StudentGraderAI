import path from "node:path";

const persistenceRoot = process.env.PERSISTENCE_ROOT || process.cwd();

export const dataDirectory = path.join(persistenceRoot, "data");
export const storageRoot = path.join(persistenceRoot, "storage", "submissions");
