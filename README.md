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

1. **Database.** In Supabase, open the SQL Editor and run every file in `sql/` in number order (migration 4 to 11 are the newest). For a brand-new, empty Supabase project, run `SQL/0-rebuild-from-empty.sql` instead, then any migration newer than the date at its top. Skip any you already ran.
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

## Demo mode

For presentations, add `?demo` to the address (or use "Open the demo" on the sign-in page). The app then runs with 24 made-up children and 4 made-up staff, entirely inside the browser tab: nothing is read from or saved to the real database, the AI answers are canned (nothing is sent to Gemini), WhatsApp messages are shown on screen instead of sent, and every change disappears on refresh. The yellow bar at the top has "View as" buttons for the director, senior teacher and class teachers, and printed report cards say "Sample report card · made-up child". The question bank, curriculum, classes and terms in the demo are the real ones, copied into `demo-data.js` by `python -I SQL/backup/make-demo-data.py` (run it again after refreshing the rebuild file). The made-up children are in `demo.js`.

## Monthly plans

Each month the AI drafts every consenting child's goals and individual test again. This starts by itself a few seconds after the director, senior teacher or a class teacher signs in, for the classes that person can see. A box in the corner shows progress and has a Stop button, and people can keep working while it runs. Anything left over (stopped, failed, or a child added later) is tried again at the next sign-in. The "Make plans" button on the Learners page does the same by hand. Nothing is used until a teacher approves it.

## Messages to parents

The Parents page sends every parent in a class either a personal **term update** or the same **notice**, in **English or Kiswahili**:
- A term update covers attendance, the level in each learning area, what the child does best and one thing to try at home.
- Each parent has a WhatsApp and an SMS button. Notices also have "SMS to all", which opens one SMS with every number filled in.
- Everything opens on the staff member's own phone, and they press send there. The app sends nothing by itself, and the school pays no bulk-SMS fees.
- Each tap is saved in `parent_messages`, so the page shows when each family was last messaged.
- Messages never mention support tiers, needs or health.
- Teachers see only their own class.
- The Kiswahili wording is built in. Have a fluent staff member read it once.

## Privacy

No child's or guardian's name, phone number, email or ID number is sent to the AI: the server removes them from any typed text first (`api/_privacy.js`). The support-tier suggestion does send the doctor's report with those details removed, because that is what it reads. AI features only run when the guardian's AI consent is recorded, and the server checks it. The AI only drafts: a teacher reads and approves everything. Children's health information is sensitive under the Kenya Data Protection Act 2019. See `docs/privacy-review.md` for the full review and the school's to-do list (ODPC registration, Gemini paid tier, consent forms, retention).

## Problems

- "The AI service is not set up yet": an environment variable is missing in Vercel, or you have not redeployed since adding it.
- "No guardian consent": tick the consent box on the learner's page first.
- A new tab says it needs migration-8: run `sql/migration-8-checks-curriculum-reports.sql`.
- The question bank shows "Needs sight" but no "Add touch version" button: run `SQL/Migration 9 touch questions`.
- No "Open the curriculum design" button on the Curriculum page: run `SQL/Migration 11 curriculum PDFs`. If the button says the design "has not been uploaded yet", upload `PG.pdf`, `PP1.pdf` and `PP2.pdf` in Supabase under Storage > curriculum. The bucket is private, so only signed-in staff can open them.

## Backups

**Children's records (do this monthly).** Supabase's free plan keeps no backups. The director downloads one from the Staff page (Data backup): one file with every record, locked with a password. Keep the file and the password in separate safe places. To restore into a new, empty project: run `SQL/0-rebuild-from-empty.sql` (and newer migrations), then `python -I SQL/backup/make-restore.py <backup file>`, which asks for the password and each staff member's email and writes a restore file to run in the SQL Editor (delete it afterwards). The restore step has been tested on made-up data but not yet in a real Supabase project: try it once on a spare project.

**Database structure (after every new migration).**

Run the five read-only queries in `SQL/backup/` in the SQL Editor, download each result as CSV, then run
`python -I SQL/backup/make-rebuild.py tables.csv keys.csv code.csv security.csv data.csv` to refresh `SQL/0-rebuild-from-empty.sql`.
It holds the structure, security rules and question bank, not learner records. Do this after every new migration.
