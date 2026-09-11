# Omnisect smart scanner

Omnisect maps an authorized web target before choosing active checks. The surface mapper is passive: it visits bounded same-origin pages, observes browser traffic, extracts route strings from JavaScript already loaded by the page, and records field names without retaining request values.

## Planning flow

1. Map the exact starting origin with the configured page and time limits.
2. Build a normalized graph of origins, endpoints, parameters, forms, scripts, and technology hints.
3. Match endpoint evidence against the versioned rules in `backend/data/smart-rules.json`.
4. Rank candidate checks globally by confidence and endpoint risk, then enforce endpoint and estimated-request budgets.
5. Run baseline discovery, revisit a bounded number of verified sibling origins without forwarding credentials, and re-plan as new evidence arrives.
6. Send each active validator only the endpoints assigned to it. A disabled or unsupported validator is never silently substituted.
7. Store coverage deltas and privacy-minimized planner outcomes for evaluation.

Surface signals are routing evidence, not vulnerability findings. SQLi and XSS automation currently targets URL query parameters only; observed POST and JSON fields remain in the graph but are not falsely advertised as exercised.

## Authentication and scope

- Authentication is piped to `surface-mapper --auth-stdin`; it is not placed in command-line arguments or reports.
- Extra headers and cookies are applied only to the exact target origin.
- Credentials are not forwarded to discovered sibling subdomains or third-party resources.
- Query values, fragments, embedded credentials, response bodies, payloads, and raw evidence are excluded from planner learning records.
- Numeric and UUID identifiers may be retained in planned URLs because bounded IDOR checks need a testable reference; other query values are emptied.

Only scan systems you own or are explicitly authorized to test.

## Smart-scan controls

- `adaptivePlanning`: enable evidence-driven tool selection.
- `surfaceMaxPages`: initial exact-origin crawl limit.
- `surfaceSecondaryHosts`: maximum verified sibling origins to map.
- `smartMaxEndpoints`: maximum endpoint plans and graph scope.
- `smartMaxRequests`: estimated active-request budget.

The global defaults are available in scan configuration. Each target can inherit or override them.

## Rule database

`backend/data/smart-rules.json` contains the planner version, budgets, endpoint rules, confidence values, request estimates, and technology profiles. Treat rule changes like scanner code: review them, add a focused test, and measure labeled precision before rollout.

## Learning and evaluation

Completed scans append privacy-minimized outcomes to `backend/data/planner-events.jsonl`. Analyst triage changes append supervised labels without URLs, credentials, payloads, notes, or evidence.

Run:

```powershell
cd backend
npm run evaluate:planner
```

The evaluator reports labeled precision by finding type. It deliberately does not estimate recall; recall requires a separate reviewed ground-truth corpus containing known positive and negative cases. Train a model only after the corpus is representative, versioned, split by target rather than individual finding, and evaluated against the rule-based planner as a baseline.

## Verification

```powershell
cd backend
npm test

cd ..\frontend
npm run build

cd ..\..\web-surface-mapper
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```
