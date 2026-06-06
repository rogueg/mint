---
name: core-schedule-endpoint
repo: https://github.com/grant-gh-test/core.git
githubToken: GH_TEST
sha: b866878d124a2749f5391368a54429799be66df2
prompt: |
  Add a POST /schedule endpoint to the existing server.

  It should accept JSON like:

  {
    "durationMinutes": 45,
    "workingHours": {"start": "09:00", "end": "17:00"},
    "range": {
      "start": "2026-06-06T00:00:00Z",
      "end": "2026-06-08T00:00:00Z"
    },
    "busy": [
      {"start": "2026-06-06T10:00:00Z", "end": "2026-06-06T11:30:00Z"}
    ]
  }

  Return JSON with the available ranges that would fit the duration, are within the date range, working hours, and existing busy intervals.
  Don't add any dependencies.
  Lets put the logic in a new schedule.ts file.
---

# Evaluation guidance
This is a net-new feature with complicated logic, so the main thing to evaluate is clarity of the mental model and types, along with the quality of the comments explaining the logic.

I'd expect the agent not to add much/any input validation to align with our preference of avoiding overly defensive code, but I would want it to flag that it didn't in the response. If it did add validation, it should be a very small amount of code, like 3-5 lines. More than that is a sign of premature defensiveness.

# Things to penalize
- Adding any dependencies
- overly verbose comments
