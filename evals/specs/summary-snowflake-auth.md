---
name: summary-snowflake-auth
repo: https://github.com/graphene-data/graphene
# https://github.com/graphene-data/graphene/pull/451 was rebase-merged as 3 commits ending here
sha: 118143963ab257fd0497f2f0597e91a03b7db1b0
prompt: |
  /change-summary HEAD~3..HEAD
---

This spec tests summarizing a PR that contains two distinct changes: a refactor that moves local connection-option loading into per-connector `localDbOptions()` functions, and the actual feature — Snowflake browser OAuth login. A good summary recognizes these as separate and gives each its own section, rather than blending them into one narrative. It explains the refactor's actual purpose rather than just describing the code motion, and treats the pnpm-lock/test churn as background.

# Evaluation guidance
We're evaluating the written summary only. The agent should not make any changes.

The audience is an expert teammate who hasn't seen this change and wants to understand it without reading the diff. Evaluate:
* **accuracy** — every claim should be checkable against the diff. Penalize invented motivations or wrong mechanics.
* **structure** — the two changes (option-loading refactor, snowflake auth) are presented separately, each under its own header. Interleaving them into one undifferentiated story is a failure.
* **judgment about why** — the refactor's reason (keeping env-var reading out of code paths the cloud server runs) was stated in a comment that the diff *deletes* from `connections/index.ts`. A good summary preserves that reasoning; a lazy one just says "refactored for cleanliness".
* **concision** — small snippets only where they earn their keep.

Key things a good summary covers:
* the user-visible change: `graphene login` now logs into the configured database when no cloud host is set; for Snowflake it delegates the OAuth flow to the SDK and caches the credential (`clientStoreTemporaryCredential`) so later commands don't re-prompt.
* the new `snowflake.authenticator` config option, explaining what the values are: these are Snowflake SDK authenticators — `OAUTH_AUTHORIZATION_CODE` is Snowflake's built-in browser OAuth flow, `EXTERNALBROWSER` is browser-based external SSO/SAML (e.g. Okta), and `SNOWFLAKE_JWT` is key-pair auth. Naming the values without saying what they mean is not enough.
* providing a private key still forces `SNOWFLAKE_JWT`, so existing service-account setups are unaffected.
* the structural change: each connector now exports `localDbOptions()` assembling options from config + env, leaving `getConnection()` a thin dispatcher — and *why* (local CLI reads env vars; the cloud server must not).
* a snippet showing the *shape* of a `localDbOptions()` implementation — how config and env vars combine — is much more informative than a snippet of the dispatcher call site.
* the in-memory pglite postgres setup moved from `connections/index.ts` into `postgres.ts` as part of the same motion.
* the end-to-end test that drives the real Snowflake login page with Playwright and otplib-generated TOTP codes, then asserts the cached credential is reused.

Bonus points for noticing the docs/code tension: `docs/config.md` says `graphene login` defaults to `OAUTH_AUTHORIZATION_CODE` when no key is configured, but `localDbOptions()` defaults the authenticator to `SNOWFLAKE_JWT`. Flagging that (as a question, not an accusation) is exactly the kind of observation we want.

Things to penalize:
* one blended narrative instead of separate sections for the two changes.
* "refactored to be cleaner" with no mention of the env-var/cloud-server rationale.
* listing the authenticator values without explaining what they do.
* describing otplib/pnpm-lock changes as significant rather than as test-dependency plumbing.

<sample-good-output>

This PR has two parts: a refactor of how local connections assemble their options, and Snowflake browser-based OAuth login built on top of it.

## Refactor: local connection option loading
`connections/index.ts` used to assemble options for every dialect inline — a couple hundred lines of config/env merging in one file. Each connector (snowflake, postgres, bigquery, athena, clickhouse, duckdb) now exports its own `localDbOptions()`, and `getConnection()` is a thin dispatcher that just imports the module and passes `mod.localDbOptions()` to the constructor.

The shape of each `localDbOptions()` is the same: merge file config with env vars, env winning for secrets. Snowflake's, for example:

```ts
export function localDbOptions(): SnowflakeOptions {
  let privateKeyPath = process.env.SNOWFLAKE_PRI_KEY_PATH || config.snowflake?.privateKeyPath
  let authenticator = config.snowflake?.authenticator || 'SNOWFLAKE_JWT'
  return {privateKeyPath, authenticator, ...}
}
```

## Snowflake browser login
Snowflake connections previously required key-pair (JWT) credentials.

Now `graphene login` branches:
* with `config.host` set it keeps the existing Graphene Cloud PKCE flow
* otherwise, on a snowflake dialect, it simply opens a database connection — the Snowflake SDK runs the auth flow itself

Config gains `snowflake.authenticator`, which maps directly onto the SDK's authenticators:
* `SNOWFLAKE_JWT` — key-pair auth, the previous behavior and still the default.
* `OAUTH_AUTHORIZATION_CODE` — Snowflake's built-in browser OAuth flow, logging in against Snowflake itself.
* `EXTERNALBROWSER` — browser-based external SSO/SAML, for accounts federated through an identity provider like Okta.

# fyi
* there's a real end-to-end test (`connectionAuth.test.ts`, gated on `SLOW_TEST`) that drives the actual Snowflake login page with Playwright, fills in TOTP MFA codes generated with otplib (the new test dependency), and asserts a second connection reuses the cached credential without opening a browser.

</sample-good-output>
