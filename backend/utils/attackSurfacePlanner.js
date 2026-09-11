// Converts Web Surface Mapper evidence into a conservative, auditable tool plan.
// Surface findings are routing signals, not proof that a vulnerability exists.

const {
  buildAttackGraph,
  deriveEndpointPlans,
  formUrl,
  loadRuleDatabase,
  mergeSurfaceReports,
  sanitizeEndpointUrl,
} = require('./surfaceIntelligence');

const BASELINE_TOOLS = [
  'subfinder', 'sublist3r', 'ctlog', 'dnsx', 'naabu', 'nmap', 'httpx',
  'takeover', 'tlsx', 'gau', 'wayback', 'urlscan', 'robots', 'katana',
];

const OPTIONAL_TOOLS = ['headers', 'ffuf', 'nuclei', 'sqli', 'xss', 'idor'];

function inspectSignals(report = {}, options = {}) {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const forms = Array.isArray(report.forms) ? report.forms : [];
  const ids = new Set(findings.map((item) => item?.id).filter(Boolean));
  const endpointPlan = deriveEndpointPlans(report, options);
  const pageCount = Number(report.summary?.pages_visited || report.pages?.length || 0);
  const coveredHeaders = (report.pages || []).filter((page) => (
    page.security_headers && Array.isArray(page.missing_security_headers)
  )).length;
  const parameterized = endpointPlan.plans.some((plan) => plan.features.hasQuery || plan.features.hasBodyParameters);
  const hasTextInput = endpointPlan.plans.some((plan) => plan.features.textInput);
  const hasIdParameter = endpointPlan.plans.some((plan) => plan.features.idParameter || plan.features.idPath);

  return {
    pageCount,
    endpointCount: endpointPlan.plans.length,
    findingCount: findings.length,
    formCount: forms.length,
    apiCount: endpointPlan.plans.filter((plan) => plan.features.api).length,
    parameterizedCount: endpointPlan.plans.filter(
      (plan) => plan.features.hasQuery || plan.features.hasBodyParameters,
    ).length,
    idCandidateCount: endpointPlan.plans.filter(
      (plan) => plan.features.idParameter || plan.features.idPath,
    ).length,
    hasAuthentication: ids.has('WSM-SURFACE-001') || endpointPlan.plans.some((plan) => plan.features.authentication),
    hasUpload: ids.has('WSM-SURFACE-002') || endpointPlan.plans.some((plan) => plan.features.upload),
    hasApi: ids.has('WSM-SURFACE-003') || endpointPlan.plans.some((plan) => plan.features.api),
    hasAdmin: ids.has('WSM-SURFACE-005') || endpointPlan.plans.some((plan) => plan.features.admin),
    hasWebSocket: ids.has('WSM-SURFACE-006') || (report.websockets || []).length > 0,
    hasTextInput,
    hasIdParameter,
    parameterized,
    headerCoverage: pageCount ? Number((coveredHeaders / pageCount).toFixed(2)) : 0,
    technologies: endpointPlan.technologies,
  };
}

function decision(selected, reason, metadata = {}) {
  return {
    selected: Boolean(selected),
    reason,
    confidence: metadata.confidence ?? 1,
    coverage: metadata.coverage ?? 0,
    estimatedRequests: metadata.estimatedRequests ?? 0,
    evidence: metadata.evidence || [],
  };
}

function buildToolPlan(report, options = {}) {
  const adaptive = options.adaptive !== false;
  const configuredTools = options.tools || {};
  const rules = options.rules || loadRuleDatabase();
  const endpointPlan = deriveEndpointPlans(report || {}, { ...options, rules });
  const signals = inspectSignals(report || {}, { ...options, rules });
  const available = Boolean(report && !report.error && signals.pageCount > 0);
  const decisions = {};

  decisions.surfaceMapper = decision(
    true,
    available ? 'passive evidence collection completed' : 'required planning phase',
    { confidence: available ? 1 : 0.4, coverage: available ? 1 : 0 },
  );

  for (const tool of BASELINE_TOOLS) {
    decisions[tool] = decision(
      true,
      adaptive
        ? 'baseline reconnaissance expands or validates the passive inventory'
        : 'adaptive planning disabled',
      { confidence: adaptive ? 0.9 : 1 },
    );
  }

  if (!adaptive || !available) {
    for (const tool of OPTIONAL_TOOLS) {
      decisions[tool] = decision(
        true,
        !adaptive ? 'adaptive planning disabled' : 'surface evidence unavailable; using safe fallback plan',
        { confidence: adaptive ? 0.35 : 1 },
      );
    }
  } else {
    decisions.headers = decision(
      false,
      'header checks already completed by the passive surface phase',
    );
    decisions.ffuf = decision(
      signals.hasAdmin || signals.hasAuthentication || signals.pageCount < 3,
      signals.hasAdmin || signals.hasAuthentication
        ? 'administrative or authentication surface merits bounded content discovery'
        : signals.pageCount < 3
          ? 'small visible surface merits bounded content discovery'
          : 'passive crawl found a broad surface; path guessing is not currently needed',
      { confidence: 0.72, estimatedRequests: 250 },
    );
    decisions.nuclei = decision(
      signals.pageCount > 0,
      signals.pageCount > 0
        ? 'a reachable web application was observed'
        : 'no reachable page was observed by the passive phase',
      { confidence: 0.75, coverage: signals.endpointCount ? 1 : 0 },
    );
    decisions.sqli = decision(
      signals.parameterized,
      signals.parameterized
        ? 'query, form, or request-body parameters were observed'
        : 'no parameterized request surface was observed',
    );
    decisions.xss = decision(
      signals.parameterized || signals.hasTextInput,
      signals.parameterized || signals.hasTextInput
        ? 'parameterized URLs or user-controlled text inputs were observed'
        : 'no reflected-input candidate was observed',
    );
    decisions.idor = decision(
      endpointPlan.byTool.idor.length > 0,
      endpointPlan.byTool.idor.length > 0
        ? endpointPlan.byTool.idor.length + ' identifier-bearing API or resource paths were observed'
        : 'no API identifier pattern was observed',
      { confidence: 0.8, estimatedRequests: endpointPlan.byTool.idor.length * 2 },
    );
  }

  if (adaptive && available) {
    decisions.headers = decision(
      signals.headerCoverage < 0.8,
      signals.headerCoverage < 0.8
        ? 'passive header coverage is incomplete'
        : 'passive phase covered security headers on at least 80% of pages',
      {
        confidence: 0.92,
        coverage: signals.headerCoverage,
        estimatedRequests: signals.headerCoverage < 0.8 ? signals.pageCount : 0,
      },
    );
    decisions.sqli = decision(
      endpointPlan.byTool.sqli.length > 0,
      endpointPlan.byTool.sqli.length
        ? endpointPlan.byTool.sqli.length + ' parameter-bearing endpoints match injection rules'
        : 'no parameter-bearing endpoint suitable for the current SQLi validator',
      { confidence: 0.78, estimatedRequests: endpointPlan.byTool.sqli.length * 7 },
    );
    decisions.xss = decision(
      endpointPlan.byTool.xss.length > 0,
      endpointPlan.byTool.xss.length
        ? endpointPlan.byTool.xss.length + ' reflected-input candidates match XSS rules'
        : 'no reflected-input candidate was observed',
      { confidence: 0.74, estimatedRequests: endpointPlan.byTool.xss.length * 4 },
    );
  }

  const scanPacks = [];
  for (const [name, profile] of Object.entries(rules.technologyProfiles)) {
    if (!signals.technologies.includes(name)) continue;
    scanPacks.push({
      id: name,
      label: profile.label,
      tools: profile.tools,
      nucleiTags: profile.nucleiTags,
      reason: profile.reason,
    });
    for (const tool of profile.tools || []) {
      if (decisions[tool] && configuredTools[tool] !== false) {
        decisions[tool] = decision(
          true,
          profile.label + ' profile: ' + profile.reason,
          {
            confidence: profile.confidence || 0.8,
            estimatedRequests: decisions[tool].estimatedRequests,
            evidence: ['technology:' + name],
          },
        );
      }
    }
  }

  for (const [tool, enabled] of Object.entries(configuredTools)) {
    if (enabled === false && decisions[tool]) {
      decisions[tool] = decision(false, 'explicitly disabled in scan configuration');
    }
  }

  const maxEstimatedRequests = Number(options.maxEstimatedRequests || rules.budgets.maxEstimatedRequests);
  let estimatedRequests = endpointPlan.estimatedRequests;
  if (adaptive && available) {
    for (const tool of ['ffuf', 'headers']) {
      const item = decisions[tool];
      if (!item?.selected) continue;
      const cost = item.estimatedRequests || (tool === 'headers' ? signals.pageCount : 0);
      if (estimatedRequests + cost > maxEstimatedRequests) {
        decisions[tool] = decision(
          false,
          'smart-scan request budget was allocated to higher-confidence endpoint checks',
          { confidence: item.confidence, evidence: item.evidence },
        );
      } else {
        estimatedRequests += cost;
      }
    }
  }

  const selectedTools = Object.entries(decisions)
    .filter(([, value]) => value.selected)
    .map(([name]) => name);
  const skippedTools = Object.entries(decisions)
    .filter(([, value]) => !value.selected)
    .map(([name]) => name);
  const commandFor = (tool) => {
    if (tool === 'surfaceMapper') return 'surface-mapper';
    if (['sqli', 'xss', 'idor'].includes(tool)) return 'curl';
    return tool;
  };
  const unavailableTools = selectedTools.filter((tool) => options.availableTools?.[commandFor(tool)] === false);
  const runnableTools = selectedTools.filter((tool) => !unavailableTools.includes(tool));

  return {
    schemaVersion: 2,
    plannerVersion: rules.plannerVersion,
    ruleDatabase: { version: rules.version, updatedAt: rules.updatedAt },
    mode: adaptive ? 'adaptive' : 'manual',
    iteration: Math.max(0, Number(options.iteration || 0)),
    evidenceAvailable: available,
    signals,
    decisions,
    selectedTools,
    skippedTools,
    runnableTools,
    unavailableTools,
    scanPacks,
    endpointPlan,
    budget: {
      maxEndpointPlans: Number(options.maxEndpoints || rules.budgets.maxEndpointPlans),
      estimatedRequests,
      maxEstimatedRequests,
    },
    generatedAt: new Date().toISOString(),
  };
}

function summarizeAttackSurface(report = {}, options = {}) {
  const signals = inspectSignals(report, options);
  return {
    schemaVersion: report.schema_version || null,
    target: report.target || null,
    completedAt: report.completed_at || null,
    summary: {
      pages: signals.pageCount,
      forms: signals.formCount,
      apiEndpoints: signals.apiCount,
      findings: signals.findingCount,
      endpoints: signals.endpointCount,
      parameterizedEndpoints: signals.parameterizedCount,
      objectReferences: signals.idCandidateCount,
      technologies: signals.technologies.length,
      headerCoverage: signals.headerCoverage,
      websockets: Number(report.summary?.websockets_observed || report.websockets?.length || 0),
    },
    technologies: signals.technologies,
    findings: (report.findings || []).slice(0, 100).map((item) => ({
      id: item.id,
      title: item.title,
      scanner: item.scanner,
      severity: item.severity,
      type: item.type,
      location: item.location,
      confidence: item.confidence,
      evidence: item.evidence,
      recommendedReview: item.recommended_review,
    })),
  };
}

function surfaceEndpoints(report = {}, target) {
  const expected = String(target || '').toLowerCase();
  const values = [
    ...(report.pages || []).map((item) => item?.url),
    ...(report.forms || []).map((item) => formUrl(item)),
    ...(report.requests || []).map((item) => item?.url),
    ...(report.script_endpoints || []),
    ...(report.websockets || []),
  ];
  const scoped = new Set();
  for (const value of values) {
    const parsed = sanitizeEndpointUrl(value);
    const hostname = parsed?.hostname.toLowerCase();
    if (!parsed || (hostname !== expected && !hostname.endsWith('.' + expected))) continue;
    if (!['http:', 'https:'].includes(parsed.protocol)) continue;
    scoped.add(parsed.toString());
  }
  return [...scoped];
}

module.exports = {
  BASELINE_TOOLS,
  OPTIONAL_TOOLS,
  buildToolPlan,
  buildAttackGraph,
  inspectSignals,
  summarizeAttackSurface,
  surfaceEndpoints,
  mergeSurfaceReports,
  loadRuleDatabase,
};
