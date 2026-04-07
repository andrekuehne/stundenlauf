# Development strategy for long-term projects
_Exported on 4/7/2026 at 22:36:09 GMT+2 from Cursor (3.0.12)_

---

**User**

How do I best set up development for a longer-running project where we need one overarching plan first and then individual plans for features? How do we keep track of the global accomplishments?

---

**Cursor**

Use a **2-level planning system** with a lightweight “source of truth”:

## Recommended Structure

- **Level 1: Project Roadmap (global plan)**
  - Defines vision, outcomes, milestones, constraints, and success metrics.
  - Time horizon: full project (e.g., 6–12 months).
  - Keep this stable; update only when strategy changes.

- **Level 2: Feature Plans (delivery plans)**
  - One plan per feature/epic.
  - Includes scope, assumptions, UX/tech approach, tasks, risks, rollout, and acceptance criteria.
  - Time horizon: short (days/weeks), updates frequently.

## What to Track Globally

Track progress by **outcomes**, not just task count:

- **Milestones completed** (e.g., “Auth v2 shipped”)
- **Business KPIs** (activation, conversion, performance, reliability)
- **Engineering health KPIs** (lead time, bug reopen rate, test pass rate, incident count)
- **Dependency/risk status** (blocked, at risk, on track)
- **Decision log** (major architecture/product decisions and why)

## Practical Operating Model

- **Single source of truth**: one roadmap doc + linked feature docs + issue tracker.
- **Weekly cadence**:
  - Update feature status (RAG: red/amber/green)
  - Reconcile with roadmap milestones
  - Log newly completed outcomes and decisions
- **Monthly review**:
  - Re-prioritize based on metrics and risks
  - Adjust roadmap only if needed

## Suggested Templates (minimal but effective)

- **Roadmap doc**
  - Vision
  - Goals & KPIs
  - Milestones (with target dates)
  - Dependencies
  - Risks
  - Change log

- **Feature plan doc**
  - Problem statement
  - User impact
  - Scope (in/out)
  - Technical approach
  - Task breakdown
  - Test/release plan
  - Done criteria
  - Links to PRs/issues

- **Global accomplishments log**
  - Date
  - Accomplishment
  - Milestone/goal linked
  - Evidence (PR/release/metric movement)
  - Owner

## Tooling Setup (simple stack)

- **Docs**: Notion/Confluence/Markdown in repo
- **Execution**: Jira/Linear/GitHub Projects
- **Metrics dashboard**: Datadog/Grafana/Looker (or even a shared sheet early on)
- **Decision records**: ADRs in repo (`/docs/adr`)

## Rule of Thumb

If something doesn’t map to a roadmap goal, challenge whether it should be done now.  
If a feature finishes without measurable impact, improve your acceptance criteria for the next one.

---

If you want, I can give you a ready-to-use folder/doc structure (for a Git repo) plus copy-paste templates for roadmap, feature plan, and accomplishments log.

---

**User**

I mean this more focused on the workflow in cursor I want do define an overall goal/requirements and then work through individual points based on planning for each feature/block.

---

**Cursor**

You want a Cursor-native workflow: one persistent master goal, then repeatable per-feature planning/execution loops. I’ll quickly pull the project-rule best-practice skill so I can give you a concrete setup that fits Cursor well.

Perfect — for Cursor specifically, the cleanest setup is:

## Cursor Workflow (Global -> Feature)

- **Global source of truth**: keep one `PROJECT_PLAN.md` in repo root (`vision`, `requirements`, `milestones`, `non-goals`, `KPIs`).
- **Persistent AI behavior**: add 1–3 rules in `.cursor/rules/*.mdc` so every chat follows your project standards and planning style.
- **Feature workflow**: for each block, create `docs/features/<feature-name>.md` with scope, acceptance criteria, and rollout plan.
- **Execution loop in Cursor**:
  1) open global plan + feature doc  
  2) ask Cursor in **Plan mode** for implementation plan  
  3) approve/refine  
  4) switch to **Agent mode** to implement  
  5) update feature doc + global accomplishments.

## What to Put in Rules (important)

Create an always-on rule (e.g. `project-workflow.mdc`) that tells Cursor to:

- read `PROJECT_PLAN.md` before proposing implementation;
- align any feature plan to a roadmap milestone;
- include “assumptions / risks / test plan” in each feature plan;
- update `docs/ACCOMPLISHMENTS.md` after major completed work;
- avoid work that doesn’t map to a defined requirement.

This is the key to getting consistent behavior across chats.

## Minimal File Structure

- `PROJECT_PLAN.md` (global)
- `docs/ACCOMPLISHMENTS.md` (global progress log)
- `docs/features/<feature>.md` (feature-level plan/history)
- `.cursor/rules/project-workflow.mdc` (persistent instructions)

## Accomplishments Tracking (global)

In `docs/ACCOMPLISHMENTS.md`, log only meaningful outcomes:

- date
- shipped change
- linked requirement/milestone
- evidence (PR/commit/test/release)
- impact (metric or observable result)

That gives you a running “project narrative” rather than just closed tasks.

## Reusable Prompt Pattern in Cursor

Use this each time you start a feature:

```md
Context:
- Read `PROJECT_PLAN.md`
- Read `docs/features/<feature>.md`

Task:
- Produce a concrete implementation plan for this feature.
- Must map to milestone(s) from `PROJECT_PLAN.md`.
- Include: scope, assumptions, risks, step-by-step tasks, test plan, definition of done.
- End with: what to add to `docs/ACCOMPLISHMENTS.md` when complete.
```

If you want, I can now generate ready-to-paste templates for those 4 files (including a strong `.mdc` rule) tailored to your current project.

---

**User**

Please do so

---

**Cursor**

I’ll create a ready-to-use planning scaffold now: global plan, accomplishments log, one feature template, and a Cursor rule file. I’ll first check whether these paths already exist so I can avoid overwriting anything unexpectedly.

I found one existing Cursor rule and no existing planning docs, so I’ll add four new files without touching current project code. I’m reading the existing rule style quickly, then creating the templates.

Added a full Cursor-ready planning scaffold so you can run **global planning -> feature planning -> execution -> global tracking** consistently.

### Created files

- `PROJECT_PLAN.md`
- `docs/ACCOMPLISHMENTS.md`
- `docs/features/FEATURE_TEMPLATE.md`
- `.cursor/rules/project-workflow.mdc`

### What this gives you

- **Global control** in `PROJECT_PLAN.md` (vision, requirements, milestones, KPIs, risks).
- **Outcome tracking** in `docs/ACCOMPLISHMENTS.md` (not just task checkboxes).
- **Repeatable feature planning** via `docs/features/FEATURE_TEMPLATE.md`.
- **Persistent Cursor behavior** via `.cursor/rules/project-workflow.mdc` (always apply).

### How to use from now on

- Start each feature by copying `docs/features/FEATURE_TEMPLATE.md` to `docs/features/<feature-name>.md`.
- In Cursor, ask for planning with context:
  - “Read `PROJECT_PLAN.md` and `docs/features/<feature-name>.md`, then propose an implementation plan.”
- After finishing a feature:
  - Add one entry in `docs/ACCOMPLISHMENTS.md`.
  - Update milestone/requirement progress in `PROJECT_PLAN.md`.

If you want, next I can draft your **first real `PROJECT_PLAN.md` version** from your current app goals so the placeholders are replaced with concrete milestones and KPIs.

---

**User**

Here is what we are building. At first, we'll create an overarching plan with rough feature documents, which can then be further refined.

The app is used to store analyze and display (team) race results. The type of race we're looking at is a "Stundenlauf", where individuals or teams run for a defined time (e.g. 1/2h or 1h) and accumulate distance and points over multiple races. Both are accumulated and based on some tbd rules a ranking is created.

While prompting and code is in english, the display language in the GUI will be german.

Current types of races: 1/2 hour and 1 hour for both single Male (Männer) and female (Frauen) as well as a "Paarlauf" (2 participants in a team). 

Participants are identified by their name, YOB and optionally a club ("Verein").

For each race, each participant earns a completed distance as well as points. For the couples race, the team gets a distance and points together.

Not every race has the same participants, some may only enter in one or a few races; and this is not necessarily the first or even consecutive races. We need a way to keep track of this.

The main challenge here is matching of participants over multiple races: As names and other info is entered manually, there are typos, switched first/last names, maybe ommitted titles (Dr. Edwin Jones in one race, Jones, Edwin in another). For the couples, the order may be switched. We need a strong backend to combine participants when a new race data is merged into the current series.

Race data comes in on a race-by race base, we need to be able to store a race, load current results, add a new race and so on.

Data needs to be portable, so a simple current race file needs to be readable by another computer with the app. No background db server etc.

This is an app running locally on a computer. The backend shall be in Python, the frontend uses a modern web layout shown e.g. in pywebview using reactive modern js technology. We need to be able to interactively show which participants might be close matches due to typos etc.

Data currently comes in via excel files of a fixed structure.

---

**Cursor**

Great context. I’ll turn this into a concrete v1 roadmap by filling `PROJECT_PLAN.md` and creating rough feature docs from your description, with special focus on participant matching, race ingestion, and German UI requirements.

I’ve got enough context; next I’m writing a concrete roadmap plus rough feature docs (ingest, model/storage, matching, rankings, UI) so you can refine each block incrementally.

I’ve added three core feature plans. Next I’ll add ranking and German UI workflow feature docs, then update accomplishments to reflect this first concrete planning baseline.

Implemented exactly that: your high-level vision is now translated into a concrete overarching plan plus rough feature-block plans you can refine one by one.

### What I updated

- Filled `PROJECT_PLAN.md` with:
  - project vision tailored to Stundenlauf
  - 8 concrete requirements (`R1`-`R8`)
  - non-goals
  - milestone timeline (`M1`-`M5`)
  - measurable KPIs (import quality, match quality, latency, portability)
  - risks/dependencies and working agreements

- Added rough feature docs:
  - `docs/features/F01-domain-model-and-storage.md`
  - `docs/features/F02-excel-ingestion-and-race-merge.md`
  - `docs/features/F03-participant-and-team-matching.md`
  - `docs/features/F04-ranking-rules-and-standings.md`
  - `docs/features/F05-german-ui-and-review-workflow.md`

- Updated global progress log:
  - `docs/ACCOMPLISHMENTS.md` now includes a dated entry for this v1 domain roadmap baseline.

### Why this structure fits your workflow

- `PROJECT_PLAN.md` is now your stable “north star”.
- Each `F0x` doc is a rough planning block you can open and refine with Cursor before implementation.
- `ACCOMPLISHMENTS.md` gives a global, chronological record of meaningful progress.
- Your existing always-on rule (`.cursor/rules/project-workflow.mdc`) will keep future sessions aligned to this pattern.

### Suggested next step

Pick `F01` first (domain/storage), then ask Cursor:

`Read PROJECT_PLAN.md and docs/features/F01-domain-model-and-storage.md and produce a detailed implementation plan with tasks and test cases.`

If you want, I can now do the next pass and turn **one selected F0x** into a “ready to implement” task breakdown (with concrete backend module structure and API contracts).

