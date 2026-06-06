---
name: plan
description: How to brainstorm, discuss, and then develop a great plan.
---

I'd like you to develop a plan for this request.

<request>
$ARGUMENTS
</request>

When asked to develop a plan, it's usually because the problem is tricky, and the asker doesn't know the best way to solve it.

If the request is super ill-defined, you might ask some clarifying questions to orient your research.

Your first task is to research the problem thoroughly by reading relevant code and docs.
Then, you should think hard about all the possible options. Don't skip this step and just jump into a single plan. Weigh the pros and cons of each option.

Then you should communicate the options you came up with. Keep it concise and high-level. Your audience is an expert in the codebase, and a professional software engineer, so you should assume they know what you mean by various shorthands. Don't enumerate every option, limit yourself to 3 at most that give a good range.

You can use small code snippets to get key concepts across, but don't write a lot of code.
Outline the high-level code structure you're thinking, showing the key files/functions we'll want to add, and what their purpose is.

If there are key decisions that would impact the direction, be sure to lay them out clearly.

Below is an example prompt and resulting plan to give an example of a well-communicated plan.

<example-prompt>
I'd like to start rounding the corners of the top corners of my stacked bar charts.
</example-prompt>
<example-plan>
This seems like it should be simple, but I looked and echarts does not have an option to round only the top corners.

The quick-and-dirty solution is to set `theme.itemStyle.borderRadius = [4, 4, 0, 0]`. This will round the top of every series, which is technically what you asked for, but might look odd where series meet.

To round only the top of the top series, the only way to do it is with per-point itemStyles, like so:
```
  series: [{type: 'bar', stack: 'a', data: [
    {value: 27, itemStyle: {borderRadius: [4, 4, 0, 0]}}
    ...
  ]}]
```
  
I'd suggest we break the code up into two functions:
* dataShaping.ts -> materializeSeriesData - transforms the `dataset` data into the `series.data`.
* chartStyling.ts -> roundCornersOfBar - iterates through each series at each xIndex, figuring out when datapoint is the top of each stack, and applying the rounding style.

# key questions
Should we "materialize" for every series, or only for stacked bars? Doing it in all cases would make the mental model simpler, but adds more processing that we don't strictly need.

# fyi
* for unstacked bars, we could simply set the itemStyle in the theme
* there's also a roundCap property that we could use, but it fully rounds, which is more than we want
* there was some discussion on adding `stackBorderRadius`, but as yet hasn't happened: https://github.com/apache/echarts/issues/19275
</example-plan>
