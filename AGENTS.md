# Changing requirements

Feedback on the issue currently being worked on updates that issue file in place:
add the new acceptance criteria to it, then implement them.

Feedback on an earlier issue goes in an **addendum** (`issues/NNN-addendum.md`,
e.g. `004-addendum.md`). Use one addendum per issue. If one already exists, add a
new section to it instead of creating another. An addendum:

- links back to the original issue, and the original issue links to it;
- lists the additional acceptance criteria as checkboxes;
- has its own status (`todo` · `doing` · `done`), tracked in the
  [issues index](issues/README.md);
- is finished like an issue, following the steps below.

Never edit the acceptance criteria of a completed issue; add them to its addendum.

# Finishing an issue

After implementing an issue, review the "Future considerations (low priority)"
sections in earlier [issue files](issues/). Reassess each open point against the
current changes: address points that now fit the scope, and leave unrelated work
deferred. Record resolved points and the reason for any relevant deferrals in the
issue being completed so later agents can distinguish open work from history.

After code review, record remaining non-blocking review points under a
"Future considerations (low priority)" section in that issue.

## Clean up before reporting done

Stop every process you started (dev servers, `tauri dev`, browsers, watchers)
before reporting a task as done. A leftover Vite server on port 1420 has blocked
`npm run tauri dev` for the user before. Verify cleanup, don't assume it:

- List your active shells and stop any that are still running.
- Check that ports 1420 and 1421 have no listener, and that no `vite`, `node` or
  `phalbummakr` processes from your session remain.
