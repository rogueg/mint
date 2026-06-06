---
description: Take some messy code and make it great
---

I'd like you to take at some code we have that I think has gotten too sloppy. Here's the code I'd like you to focus on:

<request>
$ARGUMENTS
</request>

If you haven't yet, read the `good-code` skill to ensure you know what we're looking for.

Start by reading through the code in question so you have a good understanding of what it's trying to accomplish.

Then I want you to think critically about it:
Does the code have more options and parameters than it needs?
Can we simplify the mental model of how it works?
Can we simplify the data model and types being used?
Can we rename things to be clearer?
Can we inline functions to avoid indirection?
Is there overly defensive code for situations that seem unlikely?
Are there features/edge cases we should consider dropping to dramatically simplify things?

It's tempting to try and stay close to the existing code, but the whole reason I'm asking you to take a look at this is because it _feels_ like it might be the wrong approach, or the right approach very poorly communicated.

Before you make changes, I'd like to to provide a high-level summary of how the code currently works, and the plain-english proposal of what we could change/drop in order to simplify the code. This summary should be very concise and skimmable, targeting about half a page. I'll ask followup questions if I don't understand something.

Once I've answered those questions, I'd like you to propose the new shape of the code. That should describe key types, and the signatures of major functions as pseudocode, all with comments describing what things are.

Once we've settled on that plan, you can implement it!
