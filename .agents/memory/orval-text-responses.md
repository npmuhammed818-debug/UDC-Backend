---
name: OpenAPI text responses
description: A generator compatibility note for primitive text response schemas in this workspace.
---

When an endpoint returns a primitive `text/plain` value, define that value as a named OpenAPI component schema and reference it from the response. This keeps Orval's generated barrel files as valid TypeScript modules in this workspace.

**Why:** An inline primitive response caused Orval to emit empty generated barrels, which failed the composite TypeScript check.

**How to apply:** Use a named `type: string` component for future primitive text responses, then run API codegen and the library typecheck.