# Race scoring system implementation plan
_Exported on 4/7/2026 at 22:46:58 GMT+2 from Cursor (3.0.12)_

---

**User**

Read PROJECT_PLAN.md and docs/features/F01-domain-model-and-storage.md and produce a detailed implementation plan with tasks and test cases. Each individual participant has a name (string), YOB, Gender (M/F/X), optionally a club. They also have a Startnr., but this differs over races and only needs to be kept for completeness. They earn distance (km) and points. For couples, each individual member has Name, gender, YOB and club (Verein), Verein is not necessarily the same between the two. Both together earn a distance and points. The different groups which exist are:

1/2h lauf
Männer
Frauen
Paare Männer
Paare Frauen
Paare Mix

h-lauf
Männer
Frauen
Paare Männer
Paare Frauen
Paare Mix

Design so potentially we have a diverse gender option for the individual races in the future.

Each race series typically spans a year, so we have "Stundenlauf Männer 2026" as one category for scoring, "1/2-Stundenlauf Paare Mix" as another and so on.

A Paar with one member difference is not the same team! Only races with the same participants in a couple will be accumulated together.

---

**Cursor**

I’ll read `PROJECT_PLAN.md` and `docs/features/F01-domain-model-and-storage.md` first, then draft a detailed implementation plan with concrete tasks and test cases aligned to your race/category rules.

I’ve got the context and will now expand `docs/features/F01-domain-model-and-storage.md` into a concrete implementation plan that captures your exact category model, couple identity rules, season/category structure, and a detailed task + test matrix.

Implemented a detailed feature implementation plan in `docs/features/F01-domain-model-and-storage.md` tailored to your domain rules.

### What was added

- Expanded the plan to map explicitly to `R2`, `R3`, `R7` and milestone `M1`.
- Added concrete **domain decisions** for:
  - Individual participant fields (`name`, `yob`, `gender`, optional `club`)
  - Couple/team identity with **order-insensitive matching**
  - Race-scoped `startnr` (kept for completeness, not identity)
  - Year/duration/division category keys (for season scoring buckets)
  - Extensible gender design (`M/F/X` in schema + configurable category eligibility)
- Captured all required divisions for both race durations:
  - `half_hour` and `hour`
  - `men`, `women`, `couples_men`, `couples_women`, `couples_mixed`
- Added an 8-step **implementation task breakdown** (entities, validation, schema, repository, migrations, integration points, docs).
- Added a detailed **test matrix** with 25 test cases across:
  - domain invariants
  - serialization/versioning
  - repository reliability
  - business semantics (including “one member changed => different couple/team”)

### Key rule coverage from your request

- Couple members retain independent club values.
- Same person/couple can have different `startnr` across races.
- Same exact two-person couple accumulates together; one-member difference is treated as a different team.
- Category accumulation separated by year + duration + division (e.g. `Stundenlauf Männer 2026` vs others).
- Design leaves room for future more diverse individual race categories without schema redesign.

If you want, I can next produce a matching `F01` JSON schema example file (`docs/examples/f01-schema-v1.json`) so implementation can start directly from test fixtures.

