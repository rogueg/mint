---
name: plan-rebase
repo: https://github.com/rogueg/wt2
githubToken: WT2
sha: b6e4ee3
prompt: |
  /deslop the flow for rebasing (in general, but esp for stacks) has gotten convoluted and hard to follow
---

This spec tests our ability to clean up some code that rebases stacks of git branches. The logic had become quite long and convoluted, and we want both a simple mental model, and fairly straightforward code.

# Evaluation guidance
This is a plan eval: judge the response, not code changes. Use `good-communication` for the general standard, and compare against the example below.

Specific things to look for:
* accurately and concisely explains why the current rebase flow is hard to follow.
* identifies the duplicated plain/plain-continue/stack/stack-continue paths as the main simplification opportunity.
* proposes a short, linear target flow, ideally with pseudocode.
* asks about behavior that could be dropped to simplify the implementation.

<sample-good-output>

## How rebase currently works

The UI sends a request for `rebaseLocal(repoPath, worktreePath, branchName, stack, continueExisting)`.
We only need the worktree path: from there we can infer the repo, current branch, whether the branch is in a stack, and whether it is currently stopped in a rebase.

From there, the implementation fans out into duplicative code depending on plain/stack and continue/not.

Plain branch rebase:
- fetches origin and fast-forwards local `main`/trunk before rebasing.
- rebases current branch onto `origin/<trunk>` with `--autosquash`.
- temporarily commits dirty worktree changes, then mixed-resets the WIP commit afterward.
- conflict does not throw; scan exposes `wt.rebase` and the UI shows “continue”.

Stack rebase:
- rebases the whole stack bottom-to-top, not just the clicked branch.
- uses gh-stack stored `base` values as branch range boundaries, which preserves mid-stack amends/fixups correctly.
- updates each child branch onto the newly rewritten parent.
- writes gh-stack metadata after each successful branch so conflicts leave recoverable metadata.
- preserves dirty worktree changes only when currently on the top branch.
- blocks dirty mid-stack branches.
- blocks rebasing if another worktree has one of the stack branches checked out.
- fetches origin and force-fast-forwards local trunk so stale local `main` does not pollute bottom branch ranges.
- handles already-landed bottom commits by skipping empty rebase steps.
- removes wt2-only `head` before writing gh-stack metadata.

## Simplification proposal
Here's the shape I'd propose:
```
rebaseLocal(repoPath) {
  // if we're in a rebase, finish that first
  if (inRebase(repoPath)) {
    git('rebase --continue')
    if (!res.ok) throw new Error()
  }

  if (dirty(repoPath)) createWipCommit(repoPath)

  git('fetch') // always fetch before anything else
  // determine if we're in a stack
  if (inStack) rebaseStack(stack)
  else rebaseBranch()

  if (hasWipCommit(repoPath)) popWipCommit(repoPath)
}

// walk through each branch in the stack, rebasing it onto the one below it.
// this ensures that if we change a mid-stack branch (say, by amending a commit), branches above it will
// now point at this new sha, instead of the old one.
rebaseStack(stack) {
  let parent = `origin/${stack.trunk.branch}`
  for (let branch of stack.branches) {
    git(`rebase --onto ${parent} ${branch.base} ${branch.branch}`)

    // update the stack metadata file, so if we crash it still accurately represents the current state
    branch.base = getSha(parent)
    branch.head = getSha(branch.branch)
    updateStackMetadata(branch)
  }
}

// simple git rebase
rebaseBranch(repoPath) {}
```

There are a few implied simplifications:
* from a repoPath, we know the repo and the worktree. We'll always assume the current branch, so don't need that as an option
* we can just `continue` any outstanding rebase before we do a full rebase from trunk. No need for a separate codepath.

</sample-good-output>
