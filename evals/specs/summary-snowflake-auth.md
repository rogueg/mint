---
name: summary-snowflake-auth
pr: https://github.com/graphene-data/graphene/pull/451
prompt: |
  /summary {{pr}}
---

This spec tests summarizing a PR that contains two distinct changes: a refactor that moves local connection-option loading into per-connector `localDbOptions()` functions, and the actual feature — Snowflake browser OAuth login. A good summary gives those changes separate sections, explains the refactor's purpose, and treats pnpm-lock/test churn as background.

# Evaluation guidance
This is a summary eval: judge the response, not code changes. Use `good-communication` for the general standard, and compare against the example below.

Specific things to look for:
* separates the two changes: local option-loading refactor and Snowflake browser login.
* preserves the refactor's real reason: local CLI code can read env vars; cloud-server code paths must not.
* explains login behavior, credential caching, and the meaning of the Snowflake authenticator values.
* notes that private-key setups still use `SNOWFLAKE_JWT`.
* treats the Playwright/otplib test as supporting coverage, not a feature.
* bonus: flags the docs/code tension around the default authenticator as a question.

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
