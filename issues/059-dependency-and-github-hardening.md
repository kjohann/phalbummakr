# 059 - Dependency supply-chain and GitHub hardening

Status: todo · Type: feature · Depends on: none

## What

Harden dependency updates and the public GitHub repository without changing app
behaviour. This issue records the agreed design; implementation and GitHub
settings changes have not started. A deeper application-security audit is out
of scope.

Use pnpm instead of npm because the user requires a minimum release age to be
enforced over locked JavaScript registry dependencies, not just during new
version selection. Ordinary updates wait 14 days after publication. Known
vulnerabilities receive prompt triage and reviewed exceptions when needed.

### Dependency policy

- Pin direct JavaScript dependencies to exact versions and direct Cargo
  dependencies with exact `=version` requirements. Retain committed lockfiles
  for both complete resolved graphs.
- Migrate the existing npm lockfile to pnpm without unrelated upgrades.
  Investigate and document any unavoidable graph changes before accepting them.
  Remove the obsolete npm lockfile and update Tauri hooks, scripts and
  contributor documentation consistently.
- Pin a verified pnpm version. Configure a 14-day minimum release age
  (`20160` minutes), strict enforcement, rejection of missing publication-age
  evidence, and enabled lockfile verification. CI uses frozen installation and
  must not trust a lockfile in place of verifying its age policy.
- The JavaScript gate covers locked registry packages, including transitive
  and development dependencies. Local/git dependencies do not have equivalent
  registry age evidence: introducing them requires explicit review.
- Deny dependency lifecycle/build scripts by default. Individually review and
  document only the permissions necessary for the existing build.
- Use Cargo's committed lockfile and `--locked` for tests/builds. Cargo has a
  14-day Dependabot cooldown, not a strict locked-package installation-age gate.
- Security age exceptions name exact JavaScript package versions, not blanket
  package names or globs. Record the advisory, justification and removal
  condition; remove an exception once ordinary age policy permits the version.
  Dependencies of an exempt package are not automatically exempt.
- A new advisory triggers triage regardless of severity label. If no suitable
  fix exists, document a mitigation or explicitly approved risk exception.
  Updating a lockfile does not repair existing installations or built binaries:
  reinstall/rebuild guidance is required.

### Dependabot and vulnerability monitoring

- Configure weekly ordinary JavaScript and Cargo updates, with a 14-day
  publication cooldown. Review all updates manually; no automatic merging.
- Enable and verify dependency graph ingestion, Dependabot alerts and
  Dependabot security updates. Security-update proposals do not wait for the
  ordinary cooldown, but remain subject to CI's reviewed age-exception policy.
- Check both dependency graphs for known vulnerabilities on PRs/pushes and
  weekly on `main`, including development dependencies. Weekly monitoring does
  not need to rebuild the entire desktop application.
- Fail checks on any known vulnerability unless a narrow, documented, expiring
  exception has been explicitly approved. Surface advisory-service failures
  and informational warnings; do not turn failed scans into successful checks.
- Verify notification delivery for security alerts and scheduled-check failures.
  Advisory databases cannot detect every malicious package or unknown flaw.

### CI and repository controls

- Run frontend lint/tests/build and Rust tests/desktop build on standard
  GitHub-hosted Windows runners for pushes to `main` and PR changes.
  Standard hosted compute is free for public repositories; larger runners and
  storage have separate billing/limits. Avoid unnecessary retained artifacts.
- Pin CI tools to reviewed versions and third-party Actions/reusable workflows
  to immutable commits. Allow only required Actions and require full SHA pins.
- Explicitly use read-only workflow tokens and non-persistent checkout
  credentials. No secrets, signing/deployment credentials, self-hosted runners,
  automatic merging or workflow PR approval are needed for these checks.
- Do not build PR code with privileged triggers such as `pull_request_target`.
  Do not add issue/comment-triggered builds or privileged consumers of
  untrusted PR artifacts/caches.
- Restrict PR creation to collaborators, with `kjohann` the sole collaborator,
  and verify that Dependabot can still create PRs. Do not grant speculative bot
  permissions or silently reopen public PR creation if it cannot.
- Require approval for all outside contributors' workflow runs as
  defense-in-depth. Keep PR jobs limited to intended owner/Dependabot activity;
  editable workflow conditions alone are not a repository-wide security barrier.
- Protect `main`: require PRs and passing checks, block force pushes/deletion,
  and do not require another person's approval when there is only one
  maintainer. Document any narrowly scoped emergency bypass.
- Preserve existing secret scanning/push protection and read-only defaults.

## Implementation route: PR plus live settings

**Use a branch and PR for repository files, not direct commits to `main`.**
Package-manager migration, manifests/lockfiles, workflows, Dependabot config
and documentation all belong in that PR. GitHub repository settings are live
configuration, not commits; they are performed alongside the PR.

The implementing agent must do the settings work for the user where supported
and authorized, or guide the user through the exact UI steps when permissions,
approvals or human-only actions prevent automation. Do not merely leave a
generic settings checklist. Read current values first, explain intended
changes, apply only this issue's scope, and verify the resulting values.

Suggested bootstrap sequence:

1. Create the implementation branch/PR and validate locally. Preserve unrelated
   worktree changes. Recheck current GitHub capabilities and tool versions.
2. Apply safe prerequisite settings: restricted PR creation and fork approvals,
   narrow Actions permissions/pinning, and dependency-security features.
   Verify the owner can still operate the bootstrap PR.
3. Run the proposed PR checks and establish their actual names. Configure
   required-check protection once those checks are registered, preferably
   before merging the bootstrap PR. Do not require nonexistent checks or an
   unavailable second reviewer.
4. Merge through the PR after checks pass. Dependabot configuration and scheduled
   workflows need to exist on the default branch to complete verification.
5. Verify default-branch runs, weekly scheduling, dependency ingestion, alerts,
   and an actual Dependabot-created PR under collaborator-only access. If
   necessary, request a Dependabot update check rather than waiting a week.
6. Record final settings and evidence in this issue. If any platform bootstrap
   limitation needs a temporary protection bypass or direct-main change, obtain
   explicit user approval, keep it minimal and restore/verify protection.

An incompatible Dependabot/access setting, an unverified check, or a required
manual step is an open acceptance criterion, not a reason to report completion.
Follow [AGENTS.md](../AGENTS.md#finishing-an-issue) for recording open criteria.

## Acceptance criteria

- [ ] pnpm migration, Tauri hooks and documentation are consistent; direct
  JavaScript/Cargo declarations are exact and both resolved graphs are locked.
- [ ] No unrelated dependency upgrades or app behaviour changes are introduced;
  any unavoidable migration differences are reviewed and documented.
- [ ] Pinned pnpm and frozen CI installs enforce the 14-day locked-registry
  policy with strict enforcement and missing-age rejection.
- [ ] Focused verification rejects locked transitive versions younger than
  20160 minutes and permits versions at/above that threshold. Repeat installs
  with existing dependencies/cache still enforce the policy; missing age
  evidence is rejected and an exact exception does not permit another version.
- [ ] Dependency scripts are denied by default; only reviewed necessary
  exceptions are allowed, and the existing build works.
- [ ] Cargo tests/builds use `--locked`; documentation explicitly distinguishes
  its update cooldown from strict JavaScript locked-package enforcement.
- [ ] Weekly Dependabot version updates have the agreed cooldown; alerts and
  security updates are enabled and both dependency graphs are verified.
- [ ] PR/main CI passes frontend checks and Windows Rust tests/desktop build
  using free standard hosted runners and pinned tools/Actions.
- [ ] Vulnerability checks cover both graphs and development dependencies on
  PRs/pushes and weekly on `main`; scan errors do not pass silently.
- [ ] Known vulnerabilities fail checks unless covered by an explicitly
  approved, narrow, expiring exception; exception expiry/removal is enforced.
- [ ] Security triage, exact-version age exceptions and reinstall/rebuild steps
  are documented; notification delivery is verified.
- [ ] Only the intended collaborator can create human PRs, and an actual
  Dependabot PR succeeds under the same access policy.
- [ ] All-outside-contributor workflow approval, narrow Actions access/SHA
  pinning, read-only tokens and non-persistent checkout are verified.
- [ ] `main` requires PRs and passing registered checks, blocks force pushes
  and deletion, and has no impossible self-approval requirement.
- [ ] No privileged PR/issue-comment execution, CI secrets, self-hosted runners,
  automatic merging or workflow PR approval are introduced.
- [ ] The agent applies authorized live GitHub settings or guides the user
  through blocked steps, verifies them, and records evidence and any open steps.
- [ ] Repository changes are delivered through a PR; default-branch bootstrap
  and any explicitly approved temporary bypass are documented and verified.

## Research notes and implementation checks

Read-only checks on 2026-11-27 found no workflows or Dependabot configuration,
unprotected `main`, PR creation open to everyone, first-time-contributor workflow
approval, and disabled Dependabot alerts/security updates. Secret scanning,
push protection and read-only workflow defaults were already enabled. These
are hardening gaps, not confirmed exploitable vulnerabilities. Recheck settings
before implementation rather than treating this snapshot as permanent.

Source inspection identified pnpm 12.23.0 as supporting frozen locked-package
verification, policy-aware verification caches and exact-version exceptions.
This was not an executed integration test. Reverify the selected version and
test the required behaviour; do not assume npm's age filter verifies existing
locks. Successful pnpm verification may reuse sufficient cached age evidence.

GitHub supports collaborator-only PR creation, but its documentation did not
explicitly establish Dependabot compatibility. Actual verification is required.
Cargo dependency-graph ingestion/security updates also need verification; do
not infer complete transitive relationship coverage from file recognition.

Sources:

- [pnpm release-age settings](https://pnpm.io/settings/dependency-resolution#minimumreleaseage)
- [pnpm frozen-install options](https://pnpm.io/cli/install#--trust-lockfile)
- [pnpm frozen verification source](https://github.com/pnpm/pnpm/blob/v12.23.0/pnpm/crates/deps-restorer/src/install_frozen_lockfile/verification.rs)
- [Dependabot options and cooldown](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#cooldown)
- [Dependabot supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories)
- [Dependency-graph coverage](https://docs.github.com/en/code-security/reference/supply-chain-security/dependency-graph-supported-package-ecosystems)
- [Collaborator-only PR creation](https://github.blog/changelog/2026-02-13-new-repository-settings-for-configuring-pull-request-access/)
- [Actions security](https://docs.github.com/en/actions/reference/security/secure-use)
- [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
