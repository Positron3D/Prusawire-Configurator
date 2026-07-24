// ABOUTME: Sidecar (colors.json) lookups and category resolution for the
// ABOUTME: composite-GLB configurator: palette, autoAssign globs, node entries.

/**
 * Normalize a Three.js node name for matching against sidecar keys.
 * Mirrors the cleanup the CADScope STEP→GLB pipeline applies during Blender
 * export (strip path, strip .step, strip (mesh)/(group), spaces→underscores,
 * drop [].:/).
 */
export function cleanNodeName(name) {
    if (!name) return '';
    let cleaned = name.includes('/') ? name.substring(name.lastIndexOf('/') + 1) : name;
    cleaned = cleaned.replace(/\.step/i, '');
    cleaned = cleaned.replace(/\s*\(mesh\)\s*/i, '').replace(/\s*\(group\)\s*/i, '');
    cleaned = cleaned.replace(/ /g, '_').replace(/[\[\].:\/]/g, '');
    return cleaned.trim();
}

/**
 * Strip a "-N" numeric suffix that Blender/Three.js append to deduplicate
 * repeated node names. Second tier of node-name matching.
 */
export function stripNumericSuffix(name) {
    return name.replace(/-\d+$/, '');
}

/** Translate a shell-style glob (* and ?) to an anchored regex. */
export function globToRegExp(glob) {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + pattern + '$');
}

/**
 * Append a child's cleaned name to a parent path. Empty/nameless components
 * are skipped so paths match the scaffold emitted by the CADScope generator.
 */
export function extendPath(parentPath, childName) {
    const cleaned = cleanNodeName(childName);
    if (!cleaned) return parentPath;
    return parentPath ? `${parentPath}/${cleaned}` : cleaned;
}

/**
 * Resolve a sidecar into ready-to-query lookup tables.
 * palette: name -> { color, metalness, opacity, showInPicker }
 * autoAssign: ordered [{ category, regex }] — first match wins
 * nodesByPath: full slash-joined path -> entry
 * nodesByLeaf: bare-leaf key -> entry (forgiveness path)
 */
export function buildSidecarLookups(colorSet) {
    const palette = new Map();
    const autoAssign = [];
    const nodesByPath = new Map();
    const nodesByLeaf = new Map();

    if (colorSet?.palette) {
        for (const [name, raw] of Object.entries(colorSet.palette)) {
            palette.set(name, {
                color: raw.color,
                metalness: raw.metalness ?? 0.0,
                opacity: raw.opacity ?? 1.0,
                showInPicker: raw.showInPicker !== false,
            });
        }
    }

    if (Array.isArray(colorSet?.autoAssign)) {
        for (const rule of colorSet.autoAssign) {
            if (!rule || !rule.category || !rule.match) continue;
            if (!palette.has(rule.category)) {
                console.warn(`Sidecar autoAssign rule references category "${rule.category}" which is not defined in palette.`);
            }
            autoAssign.push({ category: rule.category, regex: globToRegExp(rule.match) });
        }
    }

    if (colorSet?.nodes) {
        for (const [key, entry] of Object.entries(colorSet.nodes)) {
            if (entry?.category && !palette.has(entry.category)) {
                console.warn(`Sidecar node "${key}" references category "${entry.category}" which is not defined in palette.`);
            }
            if (key.includes('/')) {
                nodesByPath.set(key, entry);
            } else {
                nodesByLeaf.set(key, entry);
            }
        }
    }

    return { palette, autoAssign, nodesByPath, nodesByLeaf };
}

/**
 * Look up the sidecar entry for a node by its path: exact path first, then
 * fuzzy bare-leaf keys (cleaned, then -N stripped).
 */
export function lookupNode(lookups, path) {
    if (!lookups) return null;
    const direct = lookups.nodesByPath.get(path);
    if (direct) return direct;
    if (lookups.nodesByLeaf.size === 0) return null;
    const leaf = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path;
    const cleaned = cleanNodeName(leaf);
    return lookups.nodesByLeaf.get(cleaned)
        || lookups.nodesByLeaf.get(stripNumericSuffix(cleaned))
        || null;
}

/**
 * Resolve a node's effective color category: its own sidecar entry wins,
 * then its own autoAssign match, then the category inherited from the
 * nearest matched ancestor.
 */
export function categoryFor(lookups, path, name, inherited) {
    const entry = lookupNode(lookups, path);
    if (entry?.category) return entry.category;
    for (const rule of lookups.autoAssign) {
        if (rule.regex.test(name || '')) return rule.category;
    }
    return inherited || null;
}
