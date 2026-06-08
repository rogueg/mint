---
name: rebase
repo: https://github.com/rogueg/wt2
githubToken: WT2
sha: b6e4ee3
prompt: |
  We've come up with the following plan on how to clean up rebasing. I'd like you to implement it.

  ## How rebase currently works
  `hud/workMap.svelte` decides whether the clicked branch group is a singleton or gh-stack, sends `{repoPath, worktreePath, branchName, stack, continueExisting}` to the server.
  
  localGit.ts handles this in `rebaseLocal`, depending on the type of rebase requested.
  
  - Plain branch rebase:
    - fetches origin and fast-forwards local `main`/trunk before rebasing.
    - rebases current branch onto `origin/<trunk>` with `--autosquash`.
    - temporarily commits dirty worktree changes, then mixed-resets the WIP commit afterward.
    - conflict does not throw; scan exposes `wt.rebase` and the UI shows “continue”.
  
  - Stack rebase:
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
  
  There are a lot of different code paths and conditionals here, and we could simplify a lot. A few questions:
  - do we care about being able to resume if a branch is stopped on a conflict mid-rebase?
  - do we need in interactive autosquash? It adds a lot of code
  - do we care about preventing rebasing if you're on a mid-stack commit with dirty files?
  
  ## Simplification proposal
  Here's the shape I'd propose:
  ```
  rebaseLocal(repoPath) {
    // if we're in a rebase, finish that first
    if (inRebase(repoPath)) {
      git('rebase --continue')
      if (!res.ok) throw new Error()
      writeStack(stack)
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
      parent = branch.head // next branch starts on top of this one
      updateStackMetadata(branch)
    }
  }
  ```
---

This spec tests our ability to clean up some code that rebases stacks of git branches. The logic had become quite long and convoluted, and we want both a simple mental model, and fairly straightforward code.

# Evaluation guidance
The deslop prompt tells the agent to create an analysis of the existing code, and a plan to fix it. This output is what we're evaluating. We're not expecting it to make any changes.

We want to evaluate a few things:
* that the description of the current state of the code is accurate and concise.
* that it correctly identifies and asks about things we could drop to simplify.
* that the proposed plan is much simpler, and communicated clearly and concisely.

Some key things I'd look for:
* having 4 versions [plain, plain-continue, stack, stack-continue] adds a lot of overlapping logic. It'd be nice to have either a single flow for all cases, or one for plain, and one for stacks.
* it writes pseudocode to concisely communicate the logic it's proposing
* the logic is short and simple. It doesn't need to exactly what I have below as an example, there are few valid ways to solve this, the point is that the logic is pretty straightforward, linear, and self-contained.
* It asks about things that we could consider dropping to simplify the logic.

<sample-good-output>

## How rebase currently works
`hud/workMap.svelte` decides whether the clicked branch group is a singleton or gh-stack, sends `{repoPath, worktreePath, branchName, stack, continueExisting}` to the server.

localGit.ts handles this in `rebaseLocal`, depending on the type of rebase requested.

- Plain branch rebase:
  - fetches origin and fast-forwards local `main`/trunk before rebasing.
  - rebases current branch onto `origin/<trunk>` with `--autosquash`.
  - temporarily commits dirty worktree changes, then mixed-resets the WIP commit afterward.
  - conflict does not throw; scan exposes `wt.rebase` and the UI shows “continue”.

- Stack rebase:
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

There are a lot of different code paths and conditionals here, and we could simplify a lot. A few questions:
- do we care about being able to resume if a branch is stopped on a conflict mid-rebase?
- do we need in interactive autosquash? It adds a lot of code
- do we care about preventing rebasing if you're on a mid-stack commit with dirty files?

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
