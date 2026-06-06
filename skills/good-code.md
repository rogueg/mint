---
name: good-code
description: Describes what high-quality code looks like, and mistakes to avoid. Always read this before writing or reviewing any code.
---

Good code is easy for anyone to pick up and understand quickly. Legibility is more important than correctness or performance (though ideally we want all 3).

## Organization and mental models
Good code is organized into files that help us build useful abstractions and mental models.
Files should have a comment at the top describing what they're for, the mental model on which it operates, and how other code interacts with it.
It should also have a comment about key things you need to know to understand how it operates within that abstraction.
Line-for-line, these comments are the most important lines in the whole project. It's important that they're clear and concise.
Avoid excessive detail that is better left to type or function comments further in the file.

## Simple data types
Types are great, but try to keep them as simple as possible for the job to be done.
Avoid adding redundant types that do nearly the same thing.
Comment types well: what they're for, and the purpose of any keys, unless they're obvious.
It's always worth reviewing "could these types be simpler?"
Avoid type gymnastics, or trying perfectly type everything.

## Functions
Skew towards fewer, longer functions that encapsulate a unit of work that is easy to understand.
Avoid indirection creating lots of smaller functions that are only used once.
All but the most trivial functions should have a comment above them describing what they're for and what they do.
Functions should have comments throughout describing the steps they're taking, so one can grok how the function works at a high level without having to read the code.

## Error handling
Do not add defensive try/catch or null checking. Code assuming the happy path is always more legible.
Errors and unexpected nulls point to bugs elsewhere, and we shouldn't mask those bugs.

## Code density
Avoid deep nesting past 2-3 levels.
Prefer compact formatting and wide lines where reasonable. For example:

```
function good () {
  let ast = parseQuery(rawSql, {dialect: 'bigquery', functions: {...bqFunctions, hll}})
  let rows = executeQuery(ast).filter(x => !!x).map(rawRow => new RowStruct(rawRow, {engine: 'bigquery'}))
  return {rows}
}

function bad () {
  let ast = parseQuery(
    rawSql,
    {
      dialect: 'bigquery',
      functions: {
        ...bqFunctions,
        hll
    }
  })
  let rows = executeQuery(ast)
    .filter(x => {
      return !!x
    })
    .map(rawRow => {
      return new RowStruct(
        rawRow,
        {
          engine: 'bigquery'
        }
      )
    })
  return {
    rows
  }
}
```
