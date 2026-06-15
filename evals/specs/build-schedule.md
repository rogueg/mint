---
name: build-schedule
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
This is a build eval: judge the resulting code first. Use `good-code` for the general standard.

Specific things to look for:
* scheduling logic has a clear mental model: range -> working-hour windows -> subtract busy intervals -> keep slots that fit the duration.
* types and comments make the time/range logic easy to follow.
* no new dependencies.
* little or no input validation; if validation exists, it should be small and not dominate the feature.
* final response explains the implementation and notes any validation assumptions.
