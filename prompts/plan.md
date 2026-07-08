---
name: plan
description: How to brainstorm, discuss, and then develop a great plan.
---

I'd like you to develop a plan for this request.

<request>
$ARGUMENTS
</request>

When asked to develop a plan, it's usually because the problem is tricky, and I don't know the best way to solve it.
If anything is unclear about the request, you can ask some upfront clarifying questions.

Your first task is to research the problem thoroughly by reading relevant code and docs.
Then, you should think hard about all the possible options. Don't skip this step and just jump into a single plan. Weigh the pros and cons of each option.
Write this out to brainstorm.md. This brainstorm should not pick a winner, or express preference for any option.

Then, write an executive summary that I can use to make a decision. It should clearly and simply lay out the problem (if it isn't obvious), and the options for solving it. Unlike the brainstorm, this summary shouldn't be exhaustive – it should focus on the essential things to know for making a decision. Write this to summary_draft.md.

Last, you'll give me a final version of the summary. This is the opportunity to simplify the writing from the draft, making it as clear as possible.

Once you've given this summary, we'll discuss it. The goal there is to iterate quickly, so keep your answers quick, don't re-output entire plans or update any of the md files we created unless explicitly asked to.

## Implementation plan
You should make an implementation plan for each option. This should lay out a very high-level view of how the code would be organized. Call out key functions and types so I have a sense of how you'd lay out the code for this approach. While the rest of your summary focuses on "what" and "why" of options, the implementation plan assumes that you've selected that option, then "how" would you structure the code. If you have more than one option, use ```<detail>` sections to make the implementation plan collapsible.

## Tactical advice for a good summary
* Use pseudo-code snippets - a (code) picture is worth 1000 words. Don't write complete code, just the minimum to get the idea across. Use comments to make it clear what non-obvious types/functions/properties are used for.
* Your audience is an expert in the codebase, and a professional software engineer, so you should assume they know what you mean by various shorthands.
* Pick options that cover the range without a lot of duplication. 

Below are examples of great plans.

<example-prompt>
I'd like to start rounding the corners of the top corners of my stacked bar charts.
</example-prompt>
<example-plan>
Echarts doesn't have an option to round only the top corners in a stack.

The quick-and-dirty solution is to set `theme.itemStyle.borderRadius = [4, 4, 0, 0]`. This will round the top of every series, which will look odd.

To round only the top of the top series, the only way to do it is with per-point itemStyles, like so:
```js
  series: [{type: 'bar', stack: 'a', data: [
    {value: 27, itemStyle: {borderRadius: [4, 4, 0, 0]}}
    ...
  ]}]
```
  
I'd suggest we break the code up into two functions:
* dataShaping.ts -> materializeSeriesData - transforms the `dataset` data into the `series.data`.
* chartStyling.ts -> roundCornersOfBar - iterates through each series at each xIndex, figure out which datapoint is the top of each stack, and apply the rounding style.

# key questions
Should we "materialize" for every series, or only for stacked bars? Doing it in all cases would make the mental model simpler, but adds more processing that we don't strictly need.

# fyi
* for unstacked bars, we could simply set the `itemStyle` in the theme
* there's also a roundCap property that we could use, but it fully rounds, which is more than we want
* there was some discussion on adding `stackBorderRadius`, but as yet hasn't happened: https://github.com/apache/echarts/issues/19275
</example-plan>

<example-prompt>
We recently added motherduck support for cloud, but in testing it, I've noticed it's quite slow. A dashboard with 20 queries locks up a small server for 45s.
</example-prompt>
<example-plan>
  In `DuckDBConnection`, we do this in the constructor:
  ```
  let db = await DuckDBInstance.create('md:${database}')
  this.connection = await db.connect()
  ```
  
  We create a new DuckDBConnection for every query. Creating this instance is expensive and slow. When your dashboard sends 20 queries, it's trying to create 20 instances all in parallel.
  
  # Single instance, multiple connections
  Create one instance per `${orgId}:${connectionId}`, and cache it in memory. Every new query use a new `db.connect()` for parallelism.
  
  Pros:
  * simple
  * can also be used in the cli for duckdb/motherduck to improve efficiency
  Cons:
  * Every query incurs the time to establish a new connection to motherduck
  * Instances stay around indefinitely, too many motherduck connections could OOM
  * Breaks our abstraction of creating a new Connection class for each connection
  
  <detail>
  <summary>Implementation plan</summary>
  
  ```
  class DuckDBConnection {
    constructor({instance?, ...opts})
  }
  
  export createInstance(opts): Promise<DuckDBInstance>
  ```
  
  In both the cloud and cli `getConnection`, we'll first look for a cached instance, otherwise creating one.
  </detail>
  
  
  # Connection pool
  DuckDB does not provide a connection pool, so we build one that tracks available connections and reuses them.
  
  Pros:
  * efficient reuse of network connections
  * can release instances we no longer need
  Cons:
  * More complex
  
  <detail>
  <summary>Implementation plan</summary>
  
  ```
  class DuckDBPool {
    instance: DuckDBInstance
    idle: DuckDBConnection[]
    active: Set<DuckDBConnection>
  
    acquire(): Promise<DuckDBConnection>
    release(connection): void
    close(): Promise<void>
  }
  ```
  
  Cache one pool per `${orgId}:${connectionId}`. `getConnection` should acquire a connection from the pool, and query execution should release it in a `finally` block when the query finishes. Start with a small `maxConnections` and an idle timeout; when the timeout fires, close idle connections and eventually close the instance when the pool is empty.
  </detail>
  
  # Postgres client
  Motherduck has experimental support for the postgres wire protocol. Reuse our existing postgres client, just sending DuckDB SQL.
  
  Pros:
  * postgres connections are cheap to create
  * no need to load the large duckDB sdk at all
  Cons:
  * still experimental
  
  <detail>
  <summary>Implementation plan</summary>
  
  Add a MotherDuck connection path that builds a postgres connection string from the MotherDuck database/token and routes it through the existing Postgres connection implementation. Keep it as a separate connection type or explicit `driver: 'motherduck-postgres'` option so we can fall back to the DuckDB SDK path if the wire protocol is missing features.
  
  The main work is validating SQL compatibility: check that our DuckDB dialect/query generation still runs through the Postgres client without applying Postgres-specific quoting, introspection, or type parsing assumptions. Add one smoke test that opens a MotherDuck postgres-wire connection and runs the same simple query/introspection path used by dashboards.
  </detail>
</example-plan>
