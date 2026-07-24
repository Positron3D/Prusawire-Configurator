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

// Resolve the ZIP download contents for a config: the always-included files
// plus each group whose when-clause matches, deduped in declaration order.
export function downloadFileList(downloads, config) {
    if (!downloads) return [];
    const files = [];
    const seen = new Set();
    const push = (f) => {
        if (!seen.has(f)) {
            seen.add(f);
            files.push(f);
        }
    };
    for (const f of downloads.always || []) push(f);
    for (const group of downloads.groups || []) {
        if (matchesClause(group.when || {}, config)) {
            for (const f of group.files || []) push(f);
        }
    }
    return files;
}

// The choices of a selection option that are offered under a config: a
// choice with a when-clause is available only while the clause matches.
export function availableChoices(optionBody, config) {
    return (optionBody.choices || []).filter(
        (c) => !c.when || matchesClause(c.when, config));
}

// Repair a config whose selections point at unavailable choices: each such
// option falls back to its flagged default when available, else the first
// available choice. Iterates until stable so cascaded constraints settle.
export function reconcileConfig(configOptions, config) {
    const fixed = { ...config };
    for (let pass = 0; pass < 10; pass++) {
        let changed = false;
        for (const [optId, body] of Object.entries(configOptions || {})) {
            if (body.type === 'bool' || !body.choices) continue;
            const avail = availableChoices(body, fixed);
            if (avail.length === 0) continue;
            if (!avail.some((c) => c.id === fixed[optId])) {
                const pick = avail.find((c) => c.default) || avail[0];
                fixed[optId] = pick.id;
                changed = true;
            }
        }
        if (!changed) break;
    }
    return fixed;
}
