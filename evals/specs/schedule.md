---
name: core-schedule-endpoint
repo: https://github.com/grant-gh-test/core.git
githubToken: GH_TEST
sha: a8a35398d86cf418d9ed05820c5d93a2fc71a11a
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

  Return JSON with the available meeting slots that fit within the date range, working hours, and existing busy intervals.
  Don't add any dependencies.
timeoutSeconds: 80
judgeTimeoutSeconds: 25
---

# Evaluation guidance

An excellent result should add a compact scheduling implementation to the existing tiny server without replacing the project structure or adding framework scaffolding. The scheduling logic should be testable separately from HTTP handling, but this repo is intentionally small, so one helper module plus the existing server is enough.

Good scheduling behavior:

- `durationMinutes` must be a positive integer.
- `workingHours.start` and `.end` are `HH:mm` UTC times, with start before end.
- `range.start` and `.end` are valid ISO timestamps, with start before end.
- busy intervals are valid ISO timestamp ranges, sorted/merged before slot generation.
- overlapping and adjacent busy intervals are treated as one blocked interval.
- generated slots stay inside the requested date range and daily working hours.
- generated slots do not overlap busy time.
- output is deterministic, sorted, and uses ISO strings.

Good code shape:

- no runtime dependencies
- no Express/Fastify/Zod/etc.
- no large generic calendar abstraction
- scheduling logic is readable and has direct tests
- HTTP handler returns JSON for success and errors
- README gives an accurate example request and response

# Things to penalize

- Using local timezone APIs in a way that changes behavior based on machine timezone.
- Ignoring overlapping/adjacent busy intervals.
- Producing slots outside working hours or outside the requested range.
- Accepting malformed dates, negative durations, empty/invalid working hours, or invalid busy intervals.
- Mixing all algorithmic logic into the route handler with no focused tests.
- Replacing the existing server/project setup unnecessarily.
- Adding runtime dependencies for validation or routing.
