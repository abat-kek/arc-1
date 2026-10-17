# Follow-up evidence

Read [the decision report](../../../2026-10-17-diagnostic-main-decision.md).

| Artifact | Meaning |
|---|---|
| `qwen36-trials.zip`, `qwen36-files.json` | Ten synthetic trials, partial checkpoints, exact catalog/model/config manifest, raw scores and SHA-256 file hashes |
| `manual-review.json` | Original answers and manually checked outcomes; prose success is separate from strict JSON scoring |
| `workflow-spike.json` | Six runs: existing/batch scheduling under stable, drift and missing-report conditions |
| `live-filter-summary.json` | Aggregate positive/negative A4H match evidence; raw incidents are private |

Reproduce the offline checks from the repository root:

```bash
npx vitest run --config vitest.eval.config.ts tests/evals/diagnostic-workflow-spike.test.ts
DIAGNOSTIC_VALUE_EVAL=1 DIAGNOSTIC_EVAL_MODELS=qwen3.6:35b-mlx \
  DIAGNOSTIC_EVAL_REPEATS=1 \
  DIAGNOSTIC_EVAL_CASES=syntax-one,syntax-four,dumps-target,log-available,log-freshness \
  npx vitest run --config vitest.eval.config.ts tests/evals/diagnostic-value.test.ts
```

The live probe is `npx tsx scripts/probe-diagnostic-filter.ts <new-private-directory>`.
It requires existing A4H/001 credentials from the local environment, forces HTTPS 443, performs
read-only calls, and refuses to create a dump when none exists. Never commit its raw outputs.

The workflow spike initially loaded the HTTP module before the test mock. Its failed run was a
harness import-order error; dynamic import fixed it. No source in `src/` changed. Keep synthetic
and live results distinct: fixture assertions do not establish server latency or release coverage.

## Independent review

[Claude Code Opus 5.5 Max review](../diagnostics-review/claude-value-review-4.md) approved
`7604606b` with no blockers and reproduced the offline spike. Its documentation nits are addressed:
near-context-limit trials are disclosed, roadmap links use a commit permalink, and the report
says "observed" value. The optional test-placement nit is accepted deliberately: the deterministic,
offline spike also runs under `npm run test:eval`; it calls neither models nor SAP.
