function evaluateRecords(records = []) {
  const feedback = records.filter((item) => item?.event === 'triage-feedback');
  const groups = new Map();
  for (const item of feedback) {
    const type = item.findingType || 'unknown';
    if (!groups.has(type)) groups.set(type, { confirmed: 0, falsePositive: 0, unlabeled: 0 });
    const group = groups.get(type);
    if (['confirmed', 'reported', 'resolved'].includes(item.triageStatus)) group.confirmed += 1;
    else if (item.triageStatus === 'false_positive') group.falsePositive += 1;
    else group.unlabeled += 1;
  }
  const byType = Object.fromEntries([...groups].map(([type, group]) => {
    const labeled = group.confirmed + group.falsePositive;
    return [type, {
      ...group,
      labeled,
      precision: labeled ? Number((group.confirmed / labeled).toFixed(4)) : null,
    }];
  }));
  const totals = Object.values(byType).reduce(
    (sum, item) => ({
      confirmed: sum.confirmed + item.confirmed,
      falsePositive: sum.falsePositive + item.falsePositive,
      unlabeled: sum.unlabeled + item.unlabeled,
      labeled: sum.labeled + item.labeled,
    }),
    { confirmed: 0, falsePositive: 0, unlabeled: 0, labeled: 0 },
  );
  return {
    schemaVersion: 1,
    feedbackEvents: feedback.length,
    totals: {
      ...totals,
      precision: totals.labeled ? Number((totals.confirmed / totals.labeled).toFixed(4)) : null,
    },
    byType,
    note: 'Recall requires a reviewed ground-truth corpus and is intentionally not estimated from scanner output alone.',
  };
}

module.exports = { evaluateRecords };
