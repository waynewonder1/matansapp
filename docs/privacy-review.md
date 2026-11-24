# Matan learner dashboard: data protection review

**Prepared:** 24 November 2026, for the director of Matan Premier Kindergarten and the person who checks it legally.
**Law:** Kenya Data Protection Act, 2019 (DPA) and its 2021 regulations, plus the ODPC *Guidance Note for the Education Sector*.
**This is not legal advice.** It is a technical review of what the app does with children's data, written so a qualified advisor can check it quickly. Section numbers are given to help that check; the advisor should confirm them.

---

## 1. Summary

| Area | Status |
|---|---|
| Who can see what | **Good.** Class teachers see only their own class, and the database enforces it (migration 10). The director and senior teacher see all classes. |
| Data sent to the AI | **Good after this update.** No names, phone numbers, emails or ID numbers. Names are now also removed on the server. Only runs with the guardian's AI consent. |
| Google's use of AI data | **Action needed.** If the Gemini key is on Google's *free* tier, Google may use what is sent to improve its products, and people at Google may read it. |
| Registration with the ODPC | **Action needed.** Schools must register as data controllers, whatever their size. |
| Backups | **Fixed in this update.** Supabase's free plan keeps none. The director can now download a password-locked backup from the app. |
| Consent forms | **Advisor to check.** The app records consent; the paper forms must say clearly what is collected, why, and that it is stored and processed outside Kenya. |
| Keeping and deleting records | **Gap.** No written retention period, and the app can hide a child who has left but cannot fully delete their records yet. |
| Data breach plan | **Gap.** No written plan for the 72-hour report to the Data Commissioner. |

## 2. What the app holds

| Kind of data | Examples | Sensitive? |
|---|---|---|
| Child's identity | Full name, class, year of birth, date joined | Personal data of a child (DPA s.33) |
| Guardian contact | Guardian name and phone number | Personal data |
| Learning records | Scores, teacher comments, attendance, curriculum covered, report card comments | Personal data of a child |
| Support and health | Need types (e.g. visual, hearing), accommodations, support goals, support tier, **doctor's report text**, health note | **Sensitive personal data: health** (DPA s.44 to s.46) |
| Consents | Which consents a guardian gave, and when | Personal data |
| Staff | Names, roles, phone numbers, staff attendance | Personal data |

## 3. Where the data goes

| Service | What it does | Where | Data it handles |
|---|---|---|---|
| Supabase | The database and staff logins | EU (Ireland, eu-west-1) | Everything above |
| Vercel | Hosts the website and the small server functions | Website worldwide; functions in the USA by default | Passes data between the browser, Supabase and Gemini; stores nothing |
| Google Gemini | Drafts goals, questions, notes, summaries and support-tier suggestions | Google's servers (outside Kenya) | Only what is listed in section 4 |
| GitHub | Stores the app's code | USA | **No children's data** (code, database structure, question bank only) |

All three providers that touch children's data are **outside Kenya**. That is a cross-border transfer (DPA s.48 to s.50). For health data, the Act expects the guardian's consent **and** proof of appropriate safeguards. See actions A3 and A4.

## 4. Exactly what is sent to the AI

Nothing is sent unless the guardian's **AI consent** is recorded for that child. The server checks this every time, not only the browser.

| Feature | Sent | Never sent |
|---|---|---|
| Monthly goals and questions | Class, age, support pathway, need *types*, accommodations, scores, current goals, earlier questions, curriculum topics | Name, guardian, phone, notes, doctor's report, health note |
| Support-tier suggestion | Class, age, what the form says (none, some, severe), and the doctor's report **with names, phone and ID numbers removed** | Name, guardian, phone |
| Learner summary | Class, age, attendance %, scores, short teacher comments **with names removed** | Name, guardian, phone |
| Report and check notes | Class, scores, curriculum topics | Any free text |
| Question bank drafts | Curriculum outcome text only | Anything about a child |

**Fixed in this update:** teacher comments (learner summary) and goal or question text (monthly plans) could have contained a child's name typed by a teacher. The server now looks up the child's and guardians' names and removes them, along with phone, email and ID numbers, before anything goes to Gemini (`api/_privacy.js`). The doctor's report already had names removed in the browser; the server now does it again.

**Still true:** a doctor's report can mention a hospital, a doctor or a date. These are not removed. The report is health data, so it is sent only with consent (see A3).

## 5. Checks against the Act

| DPA | Requirement | How the app does it | Status |
|---|---|---|---|
| s.18 | Register with the Data Commissioner | Not an app matter | **Action A1** |
| s.25 | Collect only what is needed, keep it accurate and secure | Only learning, attendance and support data; staff can correct records; revisions are kept | Good |
| s.26, s.40 | Rights to access, correct and delete | Records can be corrected; the report card and profile show what is held. No one-step export or full deletion of one child yet | **Gap, action A6** |
| s.29 | Tell guardians what is collected and why | Done on paper at admission, if the forms say so | **Advisor to check, A3** |
| s.30, s.32, s.33 | Lawful basis; consent from a parent or guardian for a child; can be withdrawn | AI and support-needs consents are recorded with date and who gave them, and can be withdrawn; AI stops when withdrawn | Good in the app; forms to check |
| s.31 | Impact assessment for high-risk processing | Children's health data and AI use are likely high risk | **Action A5** |
| s.39 | Keep data no longer than needed | No written period; leavers are only hidden | **Gap, action A6** |
| s.41 | Privacy by design and default | Class-level access in the database, consent checks on the server, names removed before AI, AI only drafts and a teacher approves, demo mode with made-up children for presentations | Good |
| s.42 | Written contracts with processors | Supabase, Vercel and Google each publish data processing terms | **Action A4** |
| s.43 | Report a breach to the Commissioner within 72 hours | No written plan | **Action A7** |
| s.44 to s.46 | Health data only for permitted reasons, with care | Health notes and doctor's reports are readable only by the director, senior teacher and the child's class teacher; never shown on report cards | Good in the app; consent wording to check |
| s.48 to s.50 | Transfers outside Kenya need safeguards (and consent for sensitive data) | All three providers are abroad | **Actions A3, A4** |

## 6. Security in place

- Every staff member has their own login; roles are director, senior teacher and teacher.
- The database itself enforces who sees what (row level security). A teacher's login cannot read another class's children, even by calling the database directly.
- Report cards never show support tiers, needs or health notes, so they are safe to give to parents.
- WhatsApp messages to parents are opened by a teacher and sent from their own phone; the app sends nothing by itself.
- The database structure files are no longer published on the website (this update).
- Presentations use demo mode (`?demo`): made-up children only, nothing real is read or saved.

## 7. Backups (this update)

Supabase's **free plan keeps no backups** at all. Before this update, a damaged or deleted project would have lost every record.

- **Staff page, Data backup** (director only): downloads every record as one file, **locked with a password** the director chooses (AES-256). The file is useless without the password.
- **Overview** reminds the director when no backup has been downloaded on that computer for 30 days.
- **Restoring:** `SQL/backup/make-restore.py` opens a backup with its password and writes a restore file for a new Supabase project. This has been tested on made-up data. **The final step, running it in a real Supabase project, has not been tested yet:** do that once on a spare project (it fits with moving to the school's own account, task 10).
- **Rules for the file:** keep it on the school computer or a USB stick that is locked away; never send it by WhatsApp or email; keep the password separately; delete old copies.

## 8. Actions for the school

| # | Action | Who | Priority |
|---|---|---|---|
| A1 | **Register with the ODPC** as a data controller (odpc.go.ke). Educational institutions must register regardless of size. | Director | High |
| A2 | **Gemini:** check whether the API key's Google project has billing turned on. If not, either turn on billing (paid tier: Google does not use the data to improve its products; the cost at this school's size should be small) or stop using the AI features until it is. | Director / developer | High |
| A3 | **Consent forms:** have the advisor check that the admission and support forms say what is collected (including health), why, who can see it, that it is stored and processed **outside Kenya** (EU and USA) by named providers, that AI drafts suggestions, and how to withdraw. Separate tick boxes for AI use and for support or health data. | Advisor | High |
| A4 | **Processor terms:** accept or keep a copy of the data processing terms of Supabase, Vercel and Google (Gemini paid terms). Note the safeguards relied on for transfers abroad. | Director | Medium |
| A5 | **Impact assessment (DPIA):** a short written assessment of the risks of holding children's health data and using AI, and the measures in this document. Sections 2 to 7 can be used as its base. | Director with advisor | Medium |
| A6 | **Retention and deletion:** decide how long records are kept after a child leaves (for example, until the end of the following year, then deleted). The app can then get a "delete this child's records" step and a "download everything about this child" step for guardian requests. | Director decides; developer builds | Medium |
| A7 | **Breach plan:** one page saying who decides, how to change passwords and lock accounts, and how to tell the ODPC within 72 hours and guardians when needed. | Director | Medium |
| A8 | **Backups:** download a locked backup at least monthly; test a restore once on a spare project. | Director | Medium |
| A9 | **Own the accounts:** move Supabase (and ideally Vercel and the Gemini key) into accounts owned by the school, not by individuals (task 10). | Director / developer | Medium |
| A10 | **Staff:** strong passwords, no shared logins, sign out on shared computers; remove staff who leave on the Staff page. | All staff | Ongoing |

## 9. Questions for the advisor

1. Do the current consent forms meet s.32 and s.33 for a child, and s.49 for sending health data outside Kenya?
2. Is consent the right lawful basis for sending (de-identified) support information to an AI provider, or is another basis better, given that the AI only drafts and a teacher decides?
3. How long should learner, support and health records be kept after a child leaves?
4. Does the school need a formal DPIA (s.31) for this system, and does the ODPC expect it to be filed?
5. Is a data protection officer advisable for a school of this size (s.24)?
