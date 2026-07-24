// ABOUTME: Rules engine for the generated configurator manifest: config
// ABOUTME: defaults, visibility clause matching, and part visibility.

// Build the default config map from each option's default markings.
// Selection options pick the first choice flagged default, or the first
// choice if none are flagged. Bool options use their default value.
// Mirrors CADScope model_converter/spec.py default_config().
export function defaultConfig(configOptions) {
  const config = {};
  for (const [optId, body] of Object.entries(configOptions || {})) {
    if (body.type === 'bool') {
      config[optId] = Boolean(body.default);
    } else {
      const choices = body.choices || [];
      const picked = choices.find((c) => c.default) || choices[0];
      if (picked) config[optId] = picked.id;
    }
  }
  return config;
}

// Conjunction over keys; an array value is a disjunction within its key.
export function matchesClause(clause, config) {
  for (const [key, expected] of Object.entries(clause)) {
    const actual = config[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

// Resolve a part's effective visibility under a config map: hidden is
// absolute; a `when` clause must match; an `unless` clause must not.
export function evaluateVisible(part, config) {
  if (part.hidden) return false;
  const visible = part.visible || {};
  if (visible.when && !matchesClause(visible.when, config)) return false;
  if (visible.unless && matchesClause(visible.unless, config)) return false;
  return true;
}

// The set of config keys a shared/persisted state may legally carry.
export function validConfigKeys(configOptions) {
  return Object.keys(configOptions || {});
}
