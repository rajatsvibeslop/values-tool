# Values Tool Implementation Plan

## Architecture

- Build a Next.js App Router application with strict TypeScript and Tailwind CSS.
- Store all durable state in a local SQLite database accessed through Drizzle ORM.
- Use server actions for validated writes and server components for initial data reads.
- Keep comparison events append-only. Corrections create superseding events; ratings are
  deterministic derived state rebuilt from the effective event stream.
- Put rating, matchmaking, convergence, tension detection, import/export, and reporting
  logic in framework-independent domain modules with focused Vitest coverage.

## Delivery Checklist

- [x] Application scaffold, quality tooling, local database bootstrap, and migrations
- [x] Normalized schema, repositories, presets, default contexts, and development seed
- [x] TrueSkill-style Bayesian rating adapter, replay, snapshots, and context ratings
- [x] Adaptive match selection, inspectable queue, and convergence diagnostics
- [x] Value sets, values, aliases, imports, clone/merge, and definition revisions
- [x] Sessions, comparison workflow, keyboard controls, notes, and corrections
- [x] Rankings, tiers, uncertainty, matrices, timelines, and context comparisons
- [x] Evidence profiles, claims, tension suggestions, audit history, and search
- [x] Complete JSON backup/restore, normalized CSV export, Markdown/HTML reports
- [x] Settings, dark mode, responsive navigation, empty/error states, and accessibility
- [x] Unit, integration, and Playwright end-to-end tests
- [x] Lint, strict typecheck, tests, production builds, README, and schema diagram
- [x] Finite exact-order sessions with deterministic progress and targeted-retest diagnostics
- [x] Broad 100 and public-domain Miller card-sort presets
- [x] Tier-first ranking/report views with interval plots and relation matrices
- [x] Committed Swiss instrument visual system and bundled typography
- [x] Rapid five-value ranking sessions with a sub-100-question budget
- [x] Automatic scenario generation with local, OpenRouter Free, and DeepSeek providers
- [x] Transactional evidence reset for one value set or the full workspace

## Key Decisions

1. **Rating updates:** Strength and confidence are recorded but do not affect ratings by
   default. An opt-in setting applies a documented bounded multiplier to performance
   variance. Incomparable, skipped, and malformed events update evidence counters only.
2. **Context evidence:** Global rankings replay all effective ranked comparisons.
   Context rankings use a configurable prior blended from global evidence, then replay
   events tagged with the selected context. The UI labels these views explicitly.
3. **Immutability:** Meaning-bearing comparison fields are never updated. Correction and
   error actions append an event referencing the superseded event.
4. **Uncertainty display:** Rankings use sampled posterior intervals and top-k
   probabilities with a seeded PRNG, making diagnostics reproducible.
5. **Synthesis:** Rule-based aggregation only groups original notes, tags, outcomes, and
   reversal conditions. It never rewrites source text. Optional AI support is an
   interface with no configured provider; generated output remains a draft.
6. **Preset licensing:** Presets contain short descriptive paraphrases and bibliographic
   metadata, not proprietary prompt or scoring text.
7. **Exact ordering:** A stable, transitive preference is scheduled with deterministic
   binary insertion. For 100 distinct values this needs at most 573 decisive answers,
   close to the 525-comparison information lower bound. Existing consistent evidence is
   reused. TrueSkill remains the uncertainty model and drives focused verification once
   an ordering exists.
8. **Unresolved relations:** Ties remain tier relations; incomparable, skipped, and
   malformed answers do not become wins or draws. Exact-order progress is explicitly
   separated from Bayesian convergence.
9. **Rapid ranking:** Five-value questions capture a complete local ordering as four
   adjacent immutable events. This avoids treating the ten correlated pair relations as
   ten independent observations. The 100-value default uses 80 adaptive questions and
   reports remaining uncertainty rather than claiming guaranteed exactness.
10. **Scenario providers:** Scenarios are generated from the current values, definitions,
    context, and question purpose. Definition-derived generation is always available;
    optional OpenAI-compatible providers use session-only credentials that are excluded
    from exports and durable storage.

## Verification Gates

1. Run migrations and seed against an isolated database.
2. Run `npm run lint`, `npm run typecheck`, and `npm test`.
3. Run `npm run test:e2e` against the local production-like server.
4. Run `npm run build` and resolve all route/static-generation failures.
5. Smoke-test the seeded application at desktop and mobile widths.
