---
name: wrapup
description: End-of-session close-out for the financieel project. ALWAYS run when the user says they're done, wrapping up, ending the session, or when a feature/phase is complete — and proactively offer it before the session ends if meaningful work happened. Keeps PROJECT-CONTEXT.md (the cross-tool master context) current so the next session, and the claude.ai chat assistant, start from truth instead of stale state.
---

# Session Wrap-up

PROJECT-CONTEXT.md is the shared brain between Claude Code sessions and the claude.ai chat
assistant. It only works if it's folded up to date at the end of every working session. That's
this skill's job.

## Steps

1. **Summarize the session** in 3–8 bullets: what was built/changed, what was decided, what
   broke and how it was fixed, what's verified vs. merely implemented. Distinguish clearly:
   *implemented*, *tested by Claude*, *tested by owner*, *verified against live DB*.

2. **Update `PROJECT-CONTEXT.md`:**
   - §6 (Current standing): move finished items to DONE with a one-line verification status;
     rewrite IMMEDIATE NEXT to reflect reality.
   - §7 (Decision log): append any genuinely new decision with its "why" (one or two lines,
     matching the existing style). Do not relitigate or reword existing entries.
   - §4 (Schema) only if the schema changed this session.
   - §8 (Gotchas) if a new hard-won lesson emerged.
   Keep the file's voice and formatting; edit surgically, don't regenerate sections.

3. **Update `CLAUDE.md`** only if a convention, command, or rule changed. Keep it lean —
   procedures belong in skills, not CLAUDE.md.

4. **Git hygiene:** ensure work is committed on the correct `b/` branch with a descriptive
   message. Never commit to main. Remind the owner to open/merge the PR if ready.

5. **Report back** a compact status block the owner can paste into the claude.ai chat if a
   planning conversation continues there: phase, what's done, what's next, open questions.
