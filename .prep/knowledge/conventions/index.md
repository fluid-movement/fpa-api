# conventions

## Entries

* [Degrade and flag, never drop](/conventions/degrade-and-flag.md) - How broken upstream references are kept, flagged and surfaced on /health instead of dropped
* [Layering rules](/conventions/layering.md) - Who may import whom: upstream never interprets, domain never does I/O, routes never compute; read before adding code to src/ or moving logic between layers
* [Defining routes and schemas](/conventions/routes-and-schemas.md) - createRoute() with Zod schemas as the single source for validation, types and OpenAPI; pagination; regenerate openapi.json
* [Testing](/conventions/testing.md) - How tests are written: fixtures mirroring real upstream quirks (commented), store.hydrate() for HTTP tests, mocked sources, no network
