import type { SubmissionStatus } from "@/lib/types";

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function getStatusAppearance(status: SubmissionStatus) {
  switch (status) {
    case "graded":
      return { label: "Graded", dot: "#0e8c6f" };
    case "failed":
      return { label: "Needs attention", dot: "#b2513a" };
    default:
      return { label: "Processing", dot: "#f4b63f" };
  }
}

export function slugifySegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
