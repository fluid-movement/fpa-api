/**
 * Shapes as they come off the wire from the upstream microservices.
 *
 * These are documented from observed production payloads, not from a contract —
 * upstream publishes no schema. Everything is therefore optional/defensive:
 * treat these as "what we hope to find", and let the normalizer decide what to
 * do when a field is missing. Never widen these into guarantees.
 */
export {};
//# sourceMappingURL=types.js.map