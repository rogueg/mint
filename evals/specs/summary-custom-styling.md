---
name: summary-custom-styling
pr: https://github.com/graphene-data/graphene/pull/468
prompt: |
  /summary {{pr}}
---

This spec tests summarizing the hardest kind of change: a feature (custom page styling) that is inseparable from a security fix (markdown could previously execute JavaScript via passed-through Svelte syntax). The diff is also noisy — a 500-line example dashboard, lockfile churn, and snapshot updates dwarf the actual policy code in `cli/sanitization.ts`. A good summary organizes the change around the actual parts of the feature: stronger sanitization, more allowed HTML/attrs, style-tag support, and the example that shows why the feature exists.

# Evaluation guidance
This is a summary eval: judge the response, not code changes. Use `good-communication` for the general standard, and compare against the example below.

Specific things to look for:
* organizes around the main parts: stronger sanitization, more allowed HTML/attrs, style-tag support, and the example.
* does not miss the security fix: authored Svelte used to execute, and invalid dynamic markup now fails at compile time.
* mentions the important policy details: `cli/sanitization.ts`, `sanitize-html`, `validateSvelteMarkup`, generated expression exceptions, dropped inline `style=""`, and postcss CSS sanitization.
* notes that remote CSS resources are allowed; best answers also mention the arbitrary-host request implication.
* does not turn the example dashboard, lockfile, or snapshot updates into the headline.

<sample-good-output>

## Stronger sanitization
We weren't blocking all js, so something like `{alert(1)}` would run. `cli/sanitization.ts` now enforces the boundary in two steps: 
* `sanitize-html` keeps only allowed tags/attrs and escapes `{` in component attrs
* `validateSvelteMarkup` rejects executable Svelte syntax: expressions, blocks, `{@html}`, directives, spreads, and `<svelte:*>`. 

Invalid markup now fails at compile time with line/caret errors.

## Allow more HTML
Can now use more html tags along with `class`, `id` attrs. Inline `style=""` attrs are still removed.

## Style tags
Page `<style>` blocks are moved into `<svelte:head>` and sanitized with postcss. The CSS sanitizer removes execution and breakout paths (`expression()`, `javascript:`, `behavior`, `-moz-binding`, comments, angle brackets), but keeps remote visual resources like `@import`, fonts, and image URLs.

## Flight control example
The new `flights/control-room.md` example shows the kind of custom dashboard this enables.

</sample-good-output>
