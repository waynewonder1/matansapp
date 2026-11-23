# Matan Kindergarten system

A school system for Playgroup, PP1 and PP2. It runs on **Vercel** (the website and the small AI functions) and **Supabase** (the database and sign-in). There is no other server.

## What is in the project

| Path | What it does |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The whole website. No build step. |
| `config.js` | Your Supabase address and public key. Keep your own copy. Leave `API_URL` as an empty string. |
| `api/*.js` | Vercel functions that hold secrets: AI planning, tier suggestion, question drafting, report notes, staff logins. |
| `api/learners/[id]/insights.js` | The "Generate insights" button. |
| `sql/` | Database migrations, run once each in the Supabase SQL Editor, in number order. |
| `vercel.json` | Tells Vercel how long each function may run. |

## Set up

1. **Database.** In Supabase, open the SQL Editor and run every file in `sql/` in number order (migration 4 to 10 are the newest). For a brand-new, empty Supabase project, run `SQL/0-rebuild-from-empty.sql` instead, then any migration newer than the date at its top. Skip any you already ran.
2. **Secrets.** In Vercel, open your project, then Settings, then Environment Variables. Add these for Production and Preview:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (secret, only used to create staff logins)
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (for example `gemini-2.5-flash`)
3. **Deploy.** Push to GitHub. Vercel deploys by itself. Redeploy once after adding or changing variables.
4. **First check.** Sign in as the director. Open Staff, Learners, Curriculum and Report cards.

## Who can do what

- **Director:** everything, including staff and roles.
- **Senior teacher:** all classes, can approve questions, no Teaching insights.
- **Class teachers (Playgroup, PP1, PP2):** their own class only.

## Privacy

Nothing that identifies a child (name, phone number, diagnosis, notes, doctor's report) is sent to the AI. AI features only run when the guardian's signed consent is recorded. The AI only drafts: a teacher reads and approves everything. Children's health information is sensitive under the Kenya Data Protection Act 2019, so have the school's consent forms and doctor's-report handling checked by someone qualified.

## Problems

- "The AI service is not set up yet": an environment variable is missing in Vercel, or you have not redeployed since adding it.
- "No guardian consent": tick the consent box on the learner's page first.
- A new tab says it needs migration-8: run `sql/migration-8-checks-curriculum-reports.sql`.
- The question bank shows "Needs sight" but no "Add touch version" button: run `SQL/Migration 9 touch questions`.

## Backups

Run the five read-only queries in `SQL/backup/` in the SQL Editor, download each result as CSV, then run
`python -I SQL/backup/make-rebuild.py tables.csv keys.csv code.csv security.csv data.csv` to refresh `SQL/0-rebuild-from-empty.sql`.
It holds the structure, security rules and question bank, not learner records. Do this after every new migration.
