export const professorSessionCookie = "student-grader-professor";

function getNormalizedProfessorAccessKey() {
  return (process.env.PROFESSOR_ACCESS_KEY || "").trim();
}

export function isProfessorAccessConfigured() {
  return Boolean(getNormalizedProfessorAccessKey());
}

export function isProfessorPasswordValid(password: string) {
  const configuredPassword = getNormalizedProfessorAccessKey();
  return Boolean(configuredPassword) && password.trim() === configuredPassword;
}
