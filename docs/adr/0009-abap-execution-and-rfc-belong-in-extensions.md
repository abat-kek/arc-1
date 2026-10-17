# ADR 0009 — ABAP execution and RFC belong in extensions

**Status:** Accepted
**Date:** 2026-10-17
**Related:** [Stored-text implementation, PR #1012](https://github.com/arc-mcp/arc-1/pull/1012)

## Context

Custom ABAP helpers require SAP-side installation, execution permissions, maintenance, and cleanup.
Even a temporary helper turns a read into a write-and-execute workflow that can leave objects or
side effects behind.

The stored-text work demonstrated the intended approach: guarded ADT queries plus TypeScript
decoding, with explicit limits on supported storage formats.

## Decision

**Core ARC-1 must not run reports, run classes, call RFC directly, or use custom ABAP helpers as
its implementation.** This covers built-in tools and their production request paths in the npm
package and Docker image. General execution belongs in explicitly configured extensions.

- Do not bundle, install, generate, or invoke ABAP helpers for core operations. This includes
  permanent add-ons, temporary classes/reports, dynamic ABAP, and custom RFC/ICF wrappers.
  Preinstallation or a write opt-in does not exempt a helper.
- Do not add built-in report-run, class-run, arbitrary ABAP, or RFC-call actions, even for existing
  SAP or customer objects. Calling a native ADT run endpoint or an HTTP wrapper does not make
  general execution acceptable in core. Direct RFC clients and generic function-module
  dispatchers also belong outside core.
- Use existing SAP APIs and TypeScript processing. Return an explicit unsupported result when
  necessary. Never fall back to create/run/delete ABAP or instruct a model to do so.
- Keep custom execution in explicitly configured extensions with separate operator ownership.
  The core extension API may provide guarded transport operations; no built-in feature may
  silently load or depend on an extension to bypass this boundary.

## Scope and permitted uses

| Use | Boundary |
| --- | --- |
| User ABAP development | Read, generate, edit, and activate user deliverables under existing gates. Creating a class/report does not authorize core to run it. |
| Native development operations | Dedicated syntax checks, ATC, and ABAP Unit keep their APIs and safety policies. SAP may execute ABAP/RFC internally; these workflows do not authorize a generic executor. |
| Existing optional backends | Independently maintained services such as abapGit ADT remain capability-gated. ARC-1 does not install or maintain their SAP-side code. |
| Extensions | `ctx.run.classRun` / `programRun` require `SAP_ALLOW_PLUGIN_EXECUTE`, `SAP_ALLOW_WRITES`, a write-scoped tool, caller authorization, and SAP authorization. RFC integration belongs here too; this ADR adds no RFC API. See the [extension guide](../../docs_page/extensions.md#executing-abap-classes-and-reports). |
| Tests and research | ABAP fixtures and authorized disposable test-system oracles are allowed with cleanup, outside production request paths. They cannot become runtime fallbacks. |

## Consequences

Core needs no ARC-1 ABAP installation. Reads do not gain hidden writes or arbitrary execution.
Existing scopes, safety ceilings, and SAP permissions still apply.

Some capabilities will remain unsupported or need a separately managed extension. Qualify any
TypeScript replacement's semantics before shipping it.

## Alternatives rejected

- **Ship an ARC-1 ABAP add-on:** adds a second product deployment and upgrade lifecycle.
- **Create, execute, then delete a helper per request:** needs write/execute authority and cannot
  guarantee cleanup or undo execution side effects.
- **Hide helpers behind a core opt-in flag:** changes activation, but retains the same architectural
  dependency. Extensions provide the explicit boundary for custom execution.

Changing this boundary requires an explicit replacement ADR and security review. This ADR records
the implementation rule; it does not add a new runtime flag or claim automatic static enforcement.
