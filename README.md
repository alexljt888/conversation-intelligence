# Conversation Intelligence

An AI-assisted full-stack application that turns labeled conversation transcripts into structured, reviewable follow-up actions. Built as a phased mock interview project, with a working end-to-end flow before adding human review and explainability.

## Features

- Paste speaker-labeled transcripts and extract actionable follow-ups with AI.
- View tasks, owners, and deadlines; missing information stays unspecified.
- Distinguish explicit commitments from suggestions, with both retained in results.
- Read exact transcript evidence for AI-generated items and see **Needs review** signals for ambiguity.
- Edit tasks, owners, and deadlines; save or cancel changes.
- Add manual follow-ups, delete items, and mark complete or reopen.
- Handle blank input, loading, API errors, and conversations with no follow-ups.

State lives only in React memory. There is no database or persistence: refreshing clears the session, and changing the transcript clears the current results and editor.

## Architecture

```text
React + TypeScript
  → POST /api/analyze → FastAPI / Python
  → OpenAI structured extraction → Pydantic result
  → deterministic backend validation → React state → human review
```

The frontend collects input and manages review actions locally. Vite proxies `/api` to the backend during local development. FastAPI validates requests, calls OpenAI using a server-side key, checks evidence, enforces the unknown-owner review rule, and returns structured JSON. Editing, adding, deleting, and completion never call the AI or backend.

## AI Reliability / Guardrails

- OpenAI Structured Outputs and Pydantic define the result shape instead of parsing free-form text. Each AI item contains `task`, nullable `owner` and `deadline`, `evidence`, `commitment_type` (`explicit` or `suggestion`), and `needs_review`.
- Instructions tell the model not to invent owners or deadlines, and to preserve relative deadlines such as “tomorrow.”
- Every evidence value must be a nonblank, exact substring of the supplied transcript. Invalid evidence causes an error rather than being displayed.
- Missing ownership (`null` or blank) deterministically forces **Needs review**, even when the model returns false. Other ambiguity is flagged by the model; this is not a numerical confidence score.
- A missing deadline alone does not automatically trigger review.
- Human edits remain possible. Original AI evidence, classification, and review flags are retained after edits, with a note that they have not been reassessed.
- Manual items are labeled **Manual**, have no AI evidence, and start without a review flag.

These checks do not guarantee extraction accuracy. Exact matching proves that a quote exists, not that it supports every interpretation. Model-generated ownership and classification still need human judgment.

## Tech Stack

- **Frontend:** React, TypeScript, Vite.
- **Backend:** Python, FastAPI, Pydantic, OpenAI Python SDK, Uvicorn.
- **AI:** OpenAI Responses API with structured output; `gpt-4.1-mini` by default, configurable with `OPENAI_MODEL`.

## Project Structure

```text
backend/
  main.py                # Endpoint, schemas, extraction instructions, validation
  requirements.txt
  .env.example           # Placeholders only; local .env is ignored
frontend/
  src/
    App.tsx              # Transcript input, results, and human review
    main.tsx
    style.css
  index.html
  package.json
  package-lock.json
  tsconfig.json
  vite.config.ts
work/
  check_backend.py       # Backend regression checks with mocked OpenAI responses
.gitignore
README.md
```

## Local Setup

Use Python 3.10+ and Node.js 20+ with npm. An OpenAI API key with access to the configured model is needed for live analysis. Run these commands from your cloned project folder.

**Backend — terminal 1 (macOS/Linux):**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp -n .env.example .env
```

Edit `backend/.env` locally and replace the `OPENAI_API_KEY` placeholder with your key. Optionally change `OPENAI_MODEL`. Never commit this file or place the key in frontend code. Restart the backend after changing environment settings.

```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend runs at <http://127.0.0.1:8000>; interactive API documentation is at <http://127.0.0.1:8000/docs>.

**Frontend — terminal 2, from the project root:**

```bash
cd frontend
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. Keep both terminals running. This setup uses Vite's development proxy; production hosting is outside the current scope.

## Example

```text
Alex: I'll send Sarah the revised proposal tomorrow.
Alex: We should probably talk to the design team about the new mockups.
Alex: Someone should follow up with the customer next week.
```

The first action should identify Alex as owner, preserve “tomorrow,” and be classified as explicit. The remaining proposals should appear as suggestions. The customer follow-up should have an unspecified owner, “next week” as its deadline, and **Needs review**. Each AI item includes an exact supporting excerpt; task wording can vary.

## Verification / Testing

From the project root, after installing backend dependencies:

```bash
backend/.venv/bin/python work/check_backend.py
```

These regression checks mock OpenAI responses and cover input validation, missing configuration, structured results, empty results, evidence rejection, unknown-owner review enforcement, missing-deadline behavior, preserved review flags, and incomplete output. They make no live model calls and do not measure extraction quality.

```bash
cd frontend
npm run build
```

The build command runs TypeScript checking (`tsc --noEmit`) followed by the Vite production build. There is currently no automated frontend test suite.

Phases 1–3 were manually verified end-to-end during development, including normal extraction, missing fields, blank input, no-results handling, evidence/classification/review signals, and editing, adding, deleting, completing, and reopening items. To repeat this, run both servers, analyze the example above, compare quotes to the source, exercise review actions, and analyze a new transcript. Confirm review actions do not issue additional API requests.

## Design Decisions / Tradeoffs

- Session-only state keeps scope small; persistence was intentionally deferred.
- Backend model calls keep the API key out of the browser. Transcripts are sent to OpenAI for analysis; the API call uses `store=False`.
- Deterministic checks supplement model instructions where requirements can be enforced directly.
- Human review is part of the workflow rather than treating AI output as final truth.
- No authentication, deployment infrastructure, or complex transcript highlighting is included.

## Future Improvements

- Database-backed persistence.
- Automated integration and frontend tests.
- Richer transcript evidence highlighting.
- Systematic extraction-quality evaluation against labeled examples.
