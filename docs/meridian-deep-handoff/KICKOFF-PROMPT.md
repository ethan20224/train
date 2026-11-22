# Kickoff prompt: paste this to the agent that will finish Meridian Deep

**Intended builder:** Gemini 4 Neon (Google Antigravity, or any agent tool with terminal and file access), with **thinking level set to High or Extra High (xhigh)**. Never Low.

**Setup for Ethan:**
1. Open the project folder `/Users/ethanpeleg/Desktop/Dev/Marble` in Antigravity. A fresh clone of `https://github.com/ethan20224/train` also works (all textures are committed): run `npm install`, then `npx playwright install chromium` for the screenshot and perf scripts.
2. Pick Gemini 4 Neon and set thinking to Extra High for the first session (reading and planning).
3. Paste everything inside the block below.

```text
You are taking over "Meridian Deep", the metro station under the Grand Hall in this Three.js project.
The previous agent (the director, a Claude model) designed it with me and built Phases 1-2. Your job is
to build Phases 3, 4 and 5 to completion, exactly to the director's standard, taste and style — no
compromise, no redesign.

Before doing anything else:
1. git checkout meridian-deep   (never commit to main)
2. Read docs/meridian-deep-handoff/00-START-HERE.md, then 09-FOR-GEMINI-4-NEON.md, then everything else
   in the reading order of 00 §1, including every image in docs/meridian-deep-handoff/refs/. Read all of
   00-09 and the spec before writing any code.
3. Score the calibration images as 09 §3 describes, and write your scores in
   docs/meridian-deep-handoff/LEDGER.md.
4. Run the first-session checklist in 00 §6 and walk the existing station on localhost.

Then work through 05-PHASE-3-CAVERN.md, 06-PHASE-4-METRO.md and 07-PHASE-5-SOUND-POLISH-ACCEPTANCE.md
task by task, starting with P3-0. For every task:
- read the code you will touch
- check any three.js / postprocessing API in node_modules, not from memory (09 §1)
- build exactly what the task specifies
- run the tests
- take the screenshots and write the scored review from 09 §3 against the reference images
- iterate until every score is 8 or more
- commit only that task's files and add a line to LEDGER.md

Non-negotiable:
- at least 45 fps on my M2 MacBook Air for the whole station, and at least 50 fps in metro views at a
  pixel ratio of 1.0 or more, measured headed with scripts/perf-presets.mjs on a quiet machine
- hi-tech, never sci-fi; no people, music or announcements; no new dependencies
- never change how the hall looks
- proof (tests + screenshots you looked at and scored), never claims

Where the package is silent, decide in its spirit and record a ruling in LEDGER.md instead of stopping.
Ask me only for decisions that are genuinely mine (taste trade-offs the package doesn't settle, merging
to main).

At each phase gate, put the gate screenshots and your scores in docs/meridian-deep-handoff/evidence/<phase>/
(09 §8), push the branch, and report to me in plain, short language with a localhost link. I am not
technical. Do not merge to main until I explicitly approve.
```

**Recommended at each phase gate (3 times in total):** open a session with the director (Claude) and say: "Review the Phase N gate of Meridian Deep: read `docs/meridian-deep-handoff/evidence/<phase>/` and the diff since the previous gate, against the handoff package. Report taste and quality findings." Then paste the findings back to the builder as binding fix items. This is the cheapest way to keep the director's taste in the loop.
