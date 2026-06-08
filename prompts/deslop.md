---
description: Take some messy code and make it great
---

I'd like you to take at some code we have that I think has gotten too sloppy. Here's the code I'd like you to focus on:

<request>
$ARGUMENTS
</request>

If you haven't yet, read the `good-code` skill to ensure you know what we're looking for.

Start by reading through the code in question so you have a good understanding of what it's trying to accomplish. Trace the caller-facing flow, the main internal flow, and any tests/docs that reveal intended behavior.

Now, take some time to think critically about the code. You can take it for granted that some of the type/function/mental model shapes and names aren't great. It's tempting to try and stay close to the existing code, but the whole reason I'm asking you to take a look at this is because it _feels_ like it might be the wrong approach, or the right approach very poorly communicated. Don't treat preserving every current behavior as the default goal. Think from first principles about what would be a really good code to solve this problem.

Give a 2-sentence explanation of how this code works today.
Then provide a list of key existing behaviors. For each one, if you think it's a good candidate to be dropped or simplified, say so.

After that, you should provide a 2-sentence explanation of the new simplified approach you're proposing.
Follow that with pseudo-code that shows the key types and high-level sketches of the important functions. The point of this code is to communicate flow, not to be complete.

Some things to consider as you're reviewing the code and preparing your proposal:
Does the code have more options, modes, parameters, or tool/library flags than it needs?
Can we simplify the mental model of how it works?
Can we simplify the data model and types being used?
Can we rename things to be clearer?
Can we inline functions to avoid indirection?
Is there overly defensive code for situations that seem unlikely?
Are there features/edge cases we should consider dropping to dramatically simplify things?
What important behavior, invariants, or edge cases would be easy to accidentally lose during a rewrite?
Which of those behaviors are truly core, and which are just complexity we may have accumulated over time?
Are there underlying tool options, compatibility paths, or recovery flows that add a lot of complexity relative to their value?

Keep your entire response skimmable and concrete, roughly one screen if possible. Don't implement until I'm happy with the plan.

Example of the style/shape I'm looking for, for an unrelated messy notification system:

````md
## How notifications work today
`sendNotification()` is called from signup, billing, and comments. It builds user preferences, chooses email/SMS/push, renders templates, applies quiet hours, retries failures, and writes audit rows. Most of the mess comes from each channel re-checking the same preference and quiet-hour rules in slightly different ways.

Key behaviors and suggestions:
- one user action can fan out to multiple channels.
- quiet hours suppress SMS/push but not security emails.
- write one audit record per attempted channel.
- retries currently happen in three places. Default: keep retries, but move them to the job runner only.
  - change: move logic to the job runner only
- per-template channel overrides
  - drop. they duplicate user preferences and only two old templates use them.

## Propsal
The key simplification is that we decide delivery policy once, before channel-specific code runs. Channel code should only render/send; it should not rediscover preferences, quiet hours, or retry rules.

```
sendNotification(event) {
  let policy = notificationPolicy(event.user, event.type)
  let channels = allowedChannels(policy, event) // preferences + quiet hours decided once

  for (let channel of channels) {
    let message = render(channel, event)
    enqueueDelivery(channel, message) // job runner owns retry + failure logging
    audit(event, channel, 'queued')
  }
}
```

````

Before returning the plan to me, run the `subagent` tool with `promptName: "deslop-plan-reviewer"`. Give it the original request, and the plan you came up with, like so:

```md
Original user request:
<request>
$ARGUMENTS
</request>

First draft plan:
...
```

Use its suggestions and questions to improve your plan. Not all of what it says needs to be followed (it has less context than you), but it often points at things where you could simplify further, or communicate more clearly. Do not include a reviewer-feedback changelog in your final answer.

Once we've settled on that plan, you can implement it!
