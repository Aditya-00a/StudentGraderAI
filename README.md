# StudentGraderAI

StudentGraderAI is an AI-powered grading portal for professors. It lets instructors create assignments with custom rubrics, lets students submit GitHub repositories or uploaded files, and generates a score plus written feedback using either Gemini or a local Ollama model.

## Why this exists

Many professors want one place where they can:

- collect project submissions online
- review GitHub repositories and uploaded files together
- score work on a custom scale like `10`, `20`, or `100`
- give students feedback on what was done well and what should improve

This project is an MVP for exactly that workflow.

## Core features

- Professor dashboard for creating assignments
- AI-generated rubric drafts that professors can edit before saving
- Private professor dashboard plus separate student submission portal
- Student submission form for:
  - public GitHub repository links
  - uploaded source files
  - zip archives
  - optional student notes
- AI grading with:
  - final score
  - summary
  - strengths
  - improvement areas
  - rubric breakdown
  - professor-facing narrative feedback
- Submission result page showing the analyzed evidence

## Tech stack

- Next.js 16
- React 19
- Tailwind CSS 4
- Gemini API via `@google/genai`
- Ollama-compatible local model support
- Zod for validation
- JSZip for archive analysis
- Local JSON persistence for assignments/submissions
- Local disk storage for uploaded files

## How grading works

1. A professor creates an assignment with a title, score scale, and assignment description.
2. The app can draft a rubric and grading focus automatically from the assignment description.
3. The professor edits the generated rubric before saving if needed.
4. A student submits a GitHub repo, files, or both.
5. The app reads text-based source files from the submission.
6. The app sends the assignment rubric plus sampled project evidence to the configured AI provider.
7. Gemini or Ollama returns structured JSON with a score and feedback.
8. The app stores the result and renders a grading report page for the professor dashboard.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` and add your keys:

   ```bash
   AI_PROVIDER=ollama
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=gemma3:27b
   GEMINI_API_KEY=
   GEMINI_MODEL=gemini-2.5-flash
   GITHUB_TOKEN=optional_for_higher_github_rate_limits
   PERSISTENCE_ROOT=
   PROFESSOR_ACCESS_KEY=choose_a_private_password
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open:

   ```text
   http://localhost:3000
   ```

If port `3000` is already busy, Next.js will usually move to the next free port such as `3001`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AI_PROVIDER` | Recommended | `ollama` for local models or `gemini` for Gemini |
| `GEMINI_API_KEY` | Required for Gemini | Enables AI grading through Gemini |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.5-flash` |
| `OLLAMA_BASE_URL` | No | Defaults to `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Required for Ollama | Local model name, for example `gemma3:27b` |
| `GITHUB_TOKEN` | No | Helps avoid GitHub API rate limits |
| `PERSISTENCE_ROOT` | No | Root directory for stored app data in production |
| `PROFESSOR_ACCESS_KEY` | Recommended | Protects the professor dashboard and grading results |
| `BLOB_READ_WRITE_TOKEN` | Required on Vercel | Enables persistent Blob storage for assignments, submissions, and uploads |
| `SUPABASE_URL` | Optional | Enables Supabase-backed persistent storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Server-side key for reading and writing Supabase Storage |
| `SUPABASE_STORAGE_BUCKET` | Optional | Defaults to `student-grader-ai` |

## Deployment

This MVP writes to the local filesystem, so it should be deployed on a host with persistent disk support.

If you deploy on Vercel, connect either Supabase Storage or Vercel Blob. Without one of them, assignments and uploads will not persist across requests.

### Recommended: Railway

1. Push this repo to GitHub.
2. Import the repo into Railway.
3. Add environment variables:

   ```bash
   AI_PROVIDER=ollama
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=gemma3:27b
   GEMINI_API_KEY=
   GEMINI_MODEL=gemini-2.5-flash
   GITHUB_TOKEN=
   PERSISTENCE_ROOT=/data
   PROFESSOR_ACCESS_KEY=choose_a_private_password
   ```

4. Attach a persistent volume mounted at `/data`.
5. Deploy and add a public domain.

### Other good options

- Render with a persistent disk
- Fly.io with volumes
- A VPS with PM2, Docker, or systemd
- Supabase Storage for persistent files and app records

### Not ideal right now

- Vercel, because this version stores uploads and JSON data on disk

## Data storage

By default the app stores:

- assignments/submissions in `data/student-grader-ai.json`
- uploaded student files in `storage/submissions`

If `PERSISTENCE_ROOT` is set, those paths move under that root instead.

Example:

```bash
PERSISTENCE_ROOT=/data
```

Then the app stores:

- `/data/data/student-grader-ai.json`
- `/data/storage/submissions`

## Current limitations

- Professor access is password-gated, but there is no full user account system yet
- GitHub submissions currently expect public repos
- No relational database yet for assignments/submissions metadata
- Object storage is supported through Supabase Storage or Vercel Blob
- No plagiarism detection
- No LMS integration yet

## Good next steps

- Add professor and student authentication
- Move storage to Postgres + S3/R2/Supabase Storage
- Add assignment due dates and statuses
- Add manual override/editing of AI grades
- Add downloadable PDF or CSV grading reports
- Add class roster and submission tracking

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Project structure

```text
src/
  app/
    api/
    submissions/
  lib/
data/        # generated locally
storage/     # generated locally
```

## Model choice

This project supports either `gemini-2.5-flash` or a local Ollama model. For a self-hosted university machine, Ollama is the best fit because the app already downloads GitHub repositories and uploaded files itself before sending compact evidence to the model. The default local recommendation in this repo is now `gemma3:27b`.

Official docs:

- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output

## Status

This is a working MVP. It is suitable for demos, professor review, and early testing. For real classroom rollout, the next step should be adding authentication plus production-grade storage.
