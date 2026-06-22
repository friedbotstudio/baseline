// Domain: validate a sprint manifest against the feature schema.
// A feature is complete-shaped when it carries id, priority, done_record,
// a non-empty edge_tests array, and a wiring_test. Duplicate ids are invalid.

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function featureErrors(feature) {
  const errors = [];
  if (!isNonEmptyString(feature?.id)) errors.push({ field: 'id', reason: 'id must be a non-empty string' });
  if (!isNonEmptyString(feature?.priority)) errors.push({ field: 'priority', reason: 'priority must be a non-empty string' });
  if (!isNonEmptyString(feature?.done_record)) errors.push({ field: 'done_record', reason: 'done_record must be a non-empty string' });
  if (!isNonEmptyArray(feature?.edge_tests)) errors.push({ field: 'edge_tests', reason: 'edge_tests must be a non-empty array' });
  if (!isNonEmptyString(feature?.wiring_test)) errors.push({ field: 'wiring_test', reason: 'wiring_test must be a non-empty string' });
  return errors;
}

export function validateManifest(manifest) {
  const features = Array.isArray(manifest?.features) ? manifest.features : [];
  const errors = [];
  const seen = new Set();
  for (const feature of features) {
    const id = feature?.id;
    const label = isNonEmptyString(id) ? id : '(unknown)';
    for (const e of featureErrors(feature)) {
      errors.push({ feature: label, field: e.field, reason: e.reason });
    }
    if (isNonEmptyString(id)) {
      if (seen.has(id)) errors.push({ feature: id, field: 'id', reason: `duplicate feature id: ${id}` });
      seen.add(id);
    }
  }
  return { valid: errors.length === 0, errors };
}
