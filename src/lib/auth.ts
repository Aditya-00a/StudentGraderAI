export const professorSessionCookie = "student-grader-professor";

export function isProfessorAccessConfigured() {
  return Boolean(process.env.PROFESSOR_ACCESS_KEY);
}

export function isProfessorPasswordValid(password: string) {
  return Boolean(process.env.PROFESSOR_ACCESS_KEY) && password === process.env.PROFESSOR_ACCESS_KEY;
}
