---
description: Finish the current task end-to-end with a commit
argument-hint: "[instructions]"
---
Let's wrap up this current bit of work and commit it.

Additional instructions: $ARGUMENTS

First, figure out the context of exactly what we're wrapping up.

Usually, we're wrapping up the feature or bug we started with, but sometimes we go on sidequests to fix tangential things.
The additional instructions should give a hint on whether we want to commit this sidequest as a separate thing, but if it doesn't and it's not clear from context, you can always stop and ask.

Make a commit with only the changes we made in this session/sidequest. Don't commit unrelated changes.

A good commit message has a short, clear one-liner, followed by a concise description of the issue and resolution, or a summary of the feature built.

Constraints:
- Never stage unrelated files.
- Never use `git add .` or `git add -A`.
