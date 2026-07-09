---
description: Scaffold a SESSION handoff doc with machine facts pre-filled
argument-hint: [label]
allowed-tools: Bash(cadence:*), Read
---

<!-- managed-by: cadence -->

!cadence handoff $ARGUMENTS

Open the new SESSION doc and fill every FILL-IN section (TL;DR, what landed, gotchas, next action as **Action:**/**Verify:**/**If it fails:**). Redact sensitive filenames (.env*, *credentials*, *.key, *.pem, id_rsa*) from anything you write. Then run `cadence handoff --check` — it must print "complete" before you finish. Commit the SESSION doc + state stamp as `chore(cadence): stamp session handoff` unless told otherwise; never push without asking.
