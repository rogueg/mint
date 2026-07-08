---
name: plan-connection-pool
repo: https://github.com/graphene-data/co
githubToken: GRAPHENE
sha: ca6636e2a080de945ed10814c3fe98ed4789ed82
prompt: |
  /plan we recently added motherduck support for cloud, but in testing it, I've noticed it's quite slow.
  A dashboard with 20 queries locks up a small server for 45s.
---


<sample-good-output>

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

</sample-good-output>
