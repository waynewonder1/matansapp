# Matan Kindergarten learner dashboard

One small service that shows the dashboard and also runs the AI insights. Learners, scores and logins live in Supabase.

## Put it online with Render

1. **Put this folder on GitHub.** Create a new repository, then upload everything in this folder (the files and the `public` and `sql` folders). Do not upload a `.env` file or `node_modules`. The `.gitignore` already blocks them.
2. **In Render:** New, then Web Service, then choose the repository.
3. Fill in the form:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free is fine for a demo
4. **Environment variables** (Advanced, then Add Environment Variable):
   - `SUPABASE_URL` = your project address, like `https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY` = your publishable key (the one that starts with `sb_publishable_`)
   - `GEMINI_API_KEY` = your Gemini key (use a fresh one, never share it)
   - `GEMINI_MODEL` = `gemini-3.6-flash`
   - Do not add `ALLOW_LOCAL`.
5. Click **Create Web Service**. After a few minutes you get an address like `https://matan-dashboard.onrender.com`. Open it and sign in.

Render can also read `render.yaml`: New, then Blueprint, then choose the repository.

### Before a demo
The free plan goes to sleep after about 15 minutes without visitors, and the first page load afterwards can take up to a minute. Open the address a few minutes before you present, and sign in once so it is awake.

### Updating later
Change the files on GitHub and Render redeploys by itself. The dashboard files are in `public`.

## The database (Supabase)

Run these files in the SQL Editor, one at a time, in this order. Skip any you have already run.

1. `sql/schema.sql`
2. `sql/seed.sql`
3. Add your logins (see below)
4. `sql/migration-1.sql`
5. `sql/migration-2.sql`
6. `sql/migration-3.sql`
7. `sql/curriculum-import.sql` (the KICD outcomes and Matan's draft questions, as drafts)
8. `sql/sample-data.sql` (made-up learners for demos only)

### Before real children are added
Delete the sample learners and records. The lines to run are at the bottom of `sql/sample-data.sql`. Matan also needs the guardians' consent that covers an outside AI service.

## Adding people

**Learners:** sign in as the director, open **Add learners**, and add one child or paste a list.

**Staff (teachers or the director):** a login must be created first.
1. In Supabase, open Authentication, then Users, then Add user. Tick Auto Confirm.
2. Run this in the SQL Editor, using their real email and name. Use `'head'` for the director and `'teacher'` for a teacher.

```sql
insert into staff (id, name, role)
select id, 'Ms. Name', 'teacher' from auth.users where email = 'their@email.com';
```

3. To show them as a class teacher:

```sql
update classes set teacher_id = (select id from staff where name = 'Ms. Name') where name = 'PP2';
```

## If something goes wrong
- A red message on the dashboard saying the area names are out of date means `sql/migration-3.sql` has not been run.
- "Could not reach the insights service" means the Render service is asleep or stopped. Refresh after a minute.
- Sign-in fails: check the email and password in Supabase, and that the person is in the `staff` table.