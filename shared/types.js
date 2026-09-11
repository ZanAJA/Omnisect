// Shared JSDoc type definitions for the Omnisect job/finding shape.
// Import via `/** @typedef {import('../shared/types.js').Job} Job */` from
// backend, or `@shared/types.js` from the frontend — keeps the contract in one place.

/**
 * @typedef {'critical' | 'high' | 'medium' | 'low' | 'info'} Severity
 */

/**
 * @typedef {'surface' | 'subdomains' | 'sublist3r' | 'ctlog' | 'dnsx' | 'ports' | 'nmap'
 *           | 'probe' | 'headers' | 'takeover' | 'tls' | 'crawl' | 'wayback'
 *           | 'urlscan' | 'robots' | 'ffuf' | 'katana' | 'technologies'
 *           | 'nuclei' | 'sqli' | 'xss' | 'idor'} PhaseName
 */

/**
 * @typedef {'pending' | 'running' | 'done' | 'error' | 'skipped'} PhaseState
 */

/**
 * @typedef {'queued' | 'running' | 'completed' | 'cancelled' | 'failed'} JobStatus
 */

/**
 * @typedef {'nuclei' | 'sqli' | 'xss' | 'idor'} FindingType
 */

/**
 * @typedef Finding
 * @property {string} id
 * @property {string} fingerprint           Deterministic dedup key (sha256-trunc).
 * @property {FindingType} type
 * @property {Severity} severity
 * @property {string} url
 * @property {string} [name]
 * @property {string} [description]
 * @property {string} [template]            Nuclei template-id, when applicable.
 * @property {string} [payload]             Tested payload string (SQLi/XSS/IDOR).
 * @property {string} [testUrl]             Mutated URL used in the probe.
 * @property {string} [evidence]            Response excerpt or comparison summary.
 * @property {string} [reference]           External CVE / advisory link.
 * @property {string} detectedAt            ISO timestamp.
 * @property {boolean} [isNew]              True when diff vs previous scan flags this.
 */

/**
 * @typedef OpenPort
 * @property {string} host
 * @property {number} port
 * @property {string} [protocol]
 * @property {string} [ip]
 */

/**
 * @typedef LiveHost
 * @property {string} url
 * @property {number} status
 * @property {string} [title]
 * @property {string[]} [tech]
 */

/**
 * @typedef TlsMetadata
 * @property {string} host
 * @property {number} [port]
 * @property {string} [subject]
 * @property {string} [issuer]
 * @property {string} [notBefore]
 * @property {string} [notAfter]
 * @property {string[]} [san]
 */

/**
 * @typedef ScanConfig
 * @property {number} threads
 * @property {boolean} aggressive          Enables destructive payloads (SLEEP, etc).
 * @property {boolean} adaptivePlanning    Uses passive evidence to choose optional tools.
 * @property {number} surfaceMaxPages      Initial passive crawl page budget.
 * @property {number} surfaceSecondaryHosts Maximum discovered origins to map again.
 * @property {number} smartMaxEndpoints    Maximum endpoint-level plans retained.
 * @property {number} smartMaxRequests     Estimated active-request planning budget.
 * @property {Record<string, boolean>} tools
 */

/**
 * @typedef Job
 * @property {string} id                   uuid
 * @property {string} target               Domain (no scheme).
 * @property {string | null} [startUrl]    Optional full URL seed for path scans.
 * @property {ScanConfig} [config]
 * @property {JobStatus} status
 * @property {PhaseName | 'initializing' | 'done' | 'error'} phase
 * @property {number} progress             0-100
 * @property {Record<PhaseName, PhaseState>} phases
 * @property {string} startedAt
 * @property {string | null} completedAt
 * @property {Record<Severity, Finding[]>} findings
 * @property {string[]} subdomains
 * @property {OpenPort[]} openPorts
 * @property {LiveHost[]} liveHosts
 * @property {TlsMetadata[]} tls
 * @property {string[]} endpoints
 * @property {object | null} attackSurface Compact passive surface inventory.
 * @property {object | null} attackGraph   Normalized origin/endpoint/parameter evidence graph.
 * @property {object | null} endpointPlan  Endpoint-scoped validator recommendations.
 * @property {object[]} planningHistory    Bounded observe/plan iteration summaries.
 * @property {object | null} toolPlan      Auditable surface-guided tool decisions.
 * @property {object | null} coverage      Coverage totals and delta from the prior scan.
 * @property {boolean} learningRecordSaved Privacy-minimized planner outcome was recorded.
 * @property {string[]} errors             Tool-level error messages.
 */

/**
 * @typedef Scope
 * @property {string[]} allowed            Glob patterns; empty list = allow all.
 * @property {string[]} blocked            Glob patterns; always rejected.
 */

/**
 * @typedef ToolStatusResult
 * @property {Record<string, boolean>} tools
 * @property {string[]} missing
 * @property {boolean} allOk
 */

module.exports = {}; // type-only module
