/**
 * A4T Toolhead Configurator
 * Main application script
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { partsManifest } from './partsManifest.js';

const HDRI_PATH = 'assets/bg.hdr';
const BASE_BRIGHTNESS = 1.0;
const DEFAULT_BRIGHTNESS_SCALE = 1.5;

const loadingPhrases = [
    'Reticulating splines',
    'Realigning the dilithium crystals',
    'Downloading more RAM',
    'Getting more DDR5 from the back of a truck',
    'Bribing the hamsters',
    'Summoning the ancient ones',
    'Consulting the oracle',
    'Sharpening the voxels',
    'Asking Jeeves',
    'Blowing on the cartridge',
    'Synchronizing quantum entanglement buffers',
    'Resolving cascading temporal anomalies',
    'Almost done (lying)',
    'This is taking longer than expected (it isn’t)',
    'Please enjoy this interstitial moment'
];

// Set up DRACO loader for compressed GLTF files
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
dracoLoader.setDecoderConfig({ type: 'js' });

// ============================================
// Application State
// ============================================

// Default configuration
const defaultConfig = {
    config: {
        carriage: 'xol-carriage',
        hotend: 'dragon',
        extruder: 'wwbmg',
        wwbmgSensors: 'no-sensors',
        wwbmgIdler: 'smooth-bearing',
        toolheadBoard: 'none',
        filamentCutter: 'none',
        hexCowl: false
    },
    mainColor: 0x444444,      // Dark grey (cowlings, wwbmg main body)
    accentColor: 0xA62C2B     // Dark red (extruder adapters, wwbmg tension arm & motor plate)
};

const state = {
    config: { ...defaultConfig.config },
    loadedModels: new Map(),  // Cache of loaded GLTF models
    activeModels: new Map(),  // Currently displayed models
    wireframe: false,
    initialLoad: true,  // Track if this is the first load
    mainColor: defaultConfig.mainColor,
    accentColor: defaultConfig.accentColor
};

// ============================================
// URL Hash State Management
// ============================================

/**
 * Extract shareable state (config + colors)
 */
function getShareableState() {
    return {
        config: state.config,
        mainColor: state.mainColor,
        accentColor: state.accentColor
    };
}

/**
 * Validate configuration object to prevent corruption
 */
function validateConfig(config) {
    const validKeys = ['carriage', 'hotend', 'extruder', 'wwbmgSensors', 
                       'wwbmgIdler', 'toolheadBoard', 'filamentCutter', 'hexCowl'];
    
    const validated = {};
    for (const key of validKeys) {
        if (config.hasOwnProperty(key)) {
            validated[key] = config[key];
        }
    }
    
    return validated;
}

/**
 * Encode state to URL hash (base64 JSON)
 */
function encodeStateToHash(shareableState) {
    const json = JSON.stringify(shareableState);
    return btoa(json);
}

/**
 * Decode state from URL hash
 */
function decodeHashToState(hash) {
    try {
        const json = atob(hash);
        return JSON.parse(json);
    } catch (e) {
        console.warn('Failed to decode hash:', e);
        return null;
    }
}

/**
 * Generate shareable URL with current state
 */
function generateShareUrl() {
    const shareableState = getShareableState();
    const hash = encodeStateToHash(shareableState);
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}#${hash}`;
}

/**
 * Copy shareable URL to clipboard
 */
async function copyShareUrl() {
    const shareUrl = generateShareUrl();

    try {
        await navigator.clipboard.writeText(shareUrl);
        return true;
    } catch (err) {
        console.error('Failed to copy URL:', err);
        return false;
    }
}

/**
 * Load state from URL hash on page load
 */
function loadStateFromHash() {
    const hash = window.location.hash.slice(1); // Remove '#'
    if (!hash) return false;

    const decoded = decodeHashToState(hash);
    if (!decoded) {
        // Invalid share URL - notify user
        console.warn('Invalid configuration URL - ignoring and using existing/default config');
        setTimeout(() => {
            alert('The shared configuration URL is invalid or corrupted. Loading your saved configuration instead.');
        }, 500); // Delay to ensure DOM is ready
        return false;
    }

    // Merge config with validation
    if (decoded.config) {
        const validatedConfig = validateConfig(decoded.config);
        Object.assign(state.config, validatedConfig);
    }

    // Merge colors
    if (decoded.mainColor !== undefined) {
        state.mainColor = decoded.mainColor;
    }
    if (decoded.accentColor !== undefined) {
        state.accentColor = decoded.accentColor;
    }

    return true;
}

/**
 * Save state to session storage
 */
function saveStateToSession() {
    try {
        const shareableState = getShareableState();
        sessionStorage.setItem('a4t-config', JSON.stringify(shareableState));
    } catch (e) {
        console.warn('Failed to save to session storage:', e);
    }
}

/**
 * Load state from session storage
 */
function loadStateFromSession() {
    try {
        const stored = sessionStorage.getItem('a4t-config');
        if (!stored) return false;

        const decoded = JSON.parse(stored);
        if (!decoded) return false;

        // Merge config with validation
        if (decoded.config) {
            const validatedConfig = validateConfig(decoded.config);
            Object.assign(state.config, validatedConfig);
        }

        // Merge colors
        if (decoded.mainColor !== undefined) {
            state.mainColor = decoded.mainColor;
        }
        if (decoded.accentColor !== undefined) {
            state.accentColor = decoded.accentColor;
        }

        return true;
    } catch (e) {
        console.warn('Failed to load from session storage:', e);
        return false;
    }
}

/**
 * Reset configuration to defaults
 */
function resetToDefaults() {
    // Reset config
    state.config = { ...defaultConfig.config };

    // Reset colors
    state.mainColor = defaultConfig.mainColor;
    state.accentColor = defaultConfig.accentColor;

    // Clear session storage
    sessionStorage.removeItem('a4t-config');

    // Update UI
    syncUIToState();

    // Update viewer
    updateViewer();
    
    // Force color update for all existing models (fixes bug where colors don't reset)
    updateModelColors();
}

/**
 * Show/hide WW-BMG options based on extruder
 */
function updateWwbmgOptionsVisibility() {
    const wwbmgOptions = document.getElementById('wwbmg-options');
    if (wwbmgOptions) {
        wwbmgOptions.style.display = state.config.extruder === 'wwbmg' ? 'block' : 'none';
    }
}

/**
 * Update UI inputs to match loaded state
 */
function syncUIToState() {
    // Sync config selects and checkboxes
    for (const [key, value] of Object.entries(state.config)) {
        // Convert camelCase to kebab-case
        const inputName = key.replace(/([A-Z])/g, '-$1').toLowerCase();

        if (typeof value === 'boolean') {
            // Checkbox
            const checkbox = document.querySelector(`input[name="${inputName}"][type="checkbox"]`);
            if (checkbox) {
                checkbox.checked = value;
            }
        } else {
            // Select dropdown
            const select = document.querySelector(`select[name="${inputName}"]`);
            if (select) {
                select.value = value;
            }
        }
    }

    // Sync color pickers with safe hex conversion
    const mainColorInput = document.getElementById('main-color');
    if (mainColorInput) {
        const mainColorHex = Math.abs(state.mainColor & 0xFFFFFF).toString(16).padStart(6, '0');
        mainColorInput.value = '#' + mainColorHex;
    }

    const accentColorInput = document.getElementById('accent-color');
    if (accentColorInput) {
        const accentColorHex = Math.abs(state.accentColor & 0xFFFFFF).toString(16).padStart(6, '0');
        accentColorInput.value = '#' + accentColorHex;
    }

    updateWwbmgOptionsVisibility();
}

// ============================================
// Color Utilities
// ============================================

/**
 * Darken a hex color by a percentage (0-1)
 * @param {number} color - Hex color value (e.g., 0x444444)
 * @param {number} amount - Amount to darken (0-1, where 0.2 = 20% darker)
 * @returns {number} Darkened hex color
 */
function darkenColor(color, amount) {
    const r = Math.max(0, ((color >> 16) & 0xFF) * (1 - amount)) | 0;
    const g = Math.max(0, ((color >> 8) & 0xFF) * (1 - amount)) | 0;
    const b = Math.max(0, (color & 0xFF) * (1 - amount)) | 0;
    return (r << 16) | (g << 8) | b;
}

/**
 * Normalize a Three.js node name for matching against manifest mesh-name lists.
 * Mirrors the cleanup the CADScope STEP→GLB pipeline applies during Blender export
 * (strip path, strip .step, strip (mesh)/(group), spaces→underscores, drop [].:/).
 */
function cleanNodeName(name) {
    if (!name) return '';
    let cleaned = name.includes('/') ? name.substring(name.lastIndexOf('/') + 1) : name;
    cleaned = cleaned.replace(/\.step/i, '');
    cleaned = cleaned.replace(/\s*\(mesh\)\s*/i, '').replace(/\s*\(group\)\s*/i, '');
    cleaned = cleaned.replace(/ /g, '_').replace(/[\[\].:\/]/g, '');
    return cleaned.trim();
}

/**
 * Strip a "-N" numeric suffix that Blender/Three.js append to deduplicate
 * repeated node names. Used as the second tier of mesh-name matching.
 */
function stripNumericSuffix(name) {
    return name.replace(/-\d+$/, '');
}

/**
 * Resolve which colorMap to use for a part — variant overrides category default.
 * Falls back to the hex variant when the user has the Hex Cowl option enabled
 * (cowlings) or whenever isHexCowl is set on the part. Returns null when no
 * routing is defined and the category default color should apply to all meshes.
 */
function resolveColorMap(part, isHexCowl) {
    const category = partsManifest.parts[part.category];
    const variantMap = isHexCowl ? part.colorMapHex : part.colorMap;
    const categoryMap = isHexCowl ? category?.colorMapHex : category?.colorMap;
    return variantMap || categoryMap || null;
}

/**
 * Resolve the default {color, opacity} for a part based on its category.
 * Per-mesh overrides from a colorMap are layered on top of this default.
 */
function getCategoryDefault(part) {
    if (part.id === 'crossbow-assembly') {
        return { color: 0x888888, opacity: 0.6 };
    }
    switch (part.category) {
        case 'cowlings':         return { color: state.mainColor, opacity: 1.0 };
        case 'hotendDucts':      return { color: darkenColor(state.mainColor, 0.2), opacity: 1.0 };
        case 'extruderAdapters':
        case 'boardMounts':      return { color: state.accentColor, opacity: 1.0 };
        case 'wwbmg':            return { color: state.mainColor, opacity: 1.0 };
        case 'carriages':
        case 'hotends':
        case 'extruders':        return { color: 0x888888, opacity: 0.6 };
        case 'hotendSpacers':    return { color: 0xd94a4a, opacity: 1.0 };
        case 'ledHolders':       return { color: 0xeeeeee, opacity: 1.0 };
        default:                 return { color: 0x888888, opacity: 1.0 };
    }
}

// ============================================
// Three.js Setup
// ============================================
let scene, camera, renderer, controls, pmrem;
let modelGroup;  // Group to hold all part models
let baseLightIntensities = [];  // Populated by setupLighting; consumed by brightness slider

function initThreeJS() {
    const container = document.getElementById('viewer-3d');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c10);

    // Camera - set up for mm scale (parts are ~100mm)
    camera = new THREE.PerspectiveCamera(25, width / height, 1, 10000);
    camera.position.set(143.84, 82.10, 285.96);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0.91, 25.89, -35.32);
    controls.update();

    // Lighting
    setupLighting();

    // HDRI environment for image-based reflections
    pmrem = new THREE.PMREMGenerator(renderer);
    new RGBELoader().load(
        HDRI_PATH,
        (texture) => {
            const envMap = pmrem.fromEquirectangular(texture).texture;
            scene.environment = envMap;
            texture.dispose();
        },
        undefined,
        (err) => console.warn('HDRI load failed:', err)
    );

    // Model group
    modelGroup = new THREE.Group();
    scene.add(modelGroup);

    // Expose for dev tools
    window.modelGroup = modelGroup;
    window.scene = scene;
    window.camera = camera;
    window.controls = controls;

    // Handle resize
    window.addEventListener('resize', onWindowResize);

    // Start render loop
    animate();

    // Loading overlay is hidden after models finish loading in updateConfiguration()
}

function setupLighting() {
    // Ambient base — keeps shadowed faces from going pure black under HDRI
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    // Hemisphere — sky/ground bias for natural shading
    const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, BASE_BRIGHTNESS * DEFAULT_BRIGHTNESS_SCALE);
    scene.add(hemi);

    // Key directional
    const dir = new THREE.DirectionalLight(0xffffff, BASE_BRIGHTNESS * DEFAULT_BRIGHTNESS_SCALE);
    dir.position.set(50, 100, 70);
    scene.add(dir);

    // Fill directional from opposite side
    const dirFill = new THREE.DirectionalLight(0xffffff, BASE_BRIGHTNESS * DEFAULT_BRIGHTNESS_SCALE * 0.6);
    dirFill.position.set(-50, -100, -70);
    scene.add(dirFill);

    // Brightness slider scales these against their base intensities
    baseLightIntensities = [
        { light: hemi, base: BASE_BRIGHTNESS },
        { light: dir, base: BASE_BRIGHTNESS },
        { light: dirFill, base: BASE_BRIGHTNESS * 0.6 }
    ];
}

function onWindowResize() {
    const container = document.getElementById('viewer-3d');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // Render main scene
    renderer.render(scene, camera);
}

// ============================================
// Model Loading
// ============================================
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/**
 * Dispose of geometry, materials, and any textures attached to a model subtree.
 * Call when removing a model from the scene to free GPU resources.
 * Cached models in state.loadedModels stay alive — only call on instances
 * that have been deep-cloned out of the cache.
 */
function disposeObject(obj) {
    obj.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) {
            if (!mat) continue;
            for (const value of Object.values(mat)) {
                if (value && value.isTexture) value.dispose();
            }
            mat.dispose();
        }
    });
}

/**
 * Deep clone a Three.js object, including materials and geometries
 */
function deepCloneModel(source) {
    const clone = source.clone(true);
    
    // Clone materials to avoid shared state issues
    clone.traverse((child) => {
        if (child.isMesh) {
            // Clone the material so each instance has its own
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(m => m.clone());
                } else {
                    child.material = child.material.clone();
                }
            }
        }
    });
    
    return clone;
}

async function loadModel(partId, partData, isHexCowl = false) {
    // Build file path: basePath + file + extension
    let filePath;
    
    if (isHexCowl && partData.category === 'cowlings') {
        // For hex cowlings, prepend "Hex " to the filename
        const parts = partData.file.split('/');
        const fileName = parts.pop();
        parts.push('Hex ' + fileName);
        filePath = partsManifest.basePath + parts.join('/') + '.' + partsManifest.fileExtension;
    } else {
        filePath = partsManifest.basePath + partData.file + '.' + partsManifest.fileExtension;
    }
    
    // Check cache first
    if (state.loadedModels.has(filePath)) {
        return deepCloneModel(state.loadedModels.get(filePath));
    }
    
    return new Promise((resolve, reject) => {
        gltfLoader.load(
            filePath,
            (gltf) => {
                const model = gltf.scene;
                
                // Store in cache (use deep clone to prevent shared state issues)
                state.loadedModels.set(filePath, deepCloneModel(model));
                
                resolve(model);
            },
            undefined, // Progress callback not needed
            (error) => {
                console.warn(`Failed to load model: ${filePath}`, error);
                resolve(null); // Return null - we'll skip missing models
            }
        );
    });
}

function applyTransform(model, transform) {
    if (!transform) return;
    
    // Position in mm
    if (transform.position) {
        model.position.set(...transform.position);
    }
    
    // Rotation (convert degrees to radians)
    if (transform.rotation) {
        model.rotation.set(
            THREE.MathUtils.degToRad(transform.rotation[0]),
            THREE.MathUtils.degToRad(transform.rotation[1]),
            THREE.MathUtils.degToRad(transform.rotation[2])
        );
    }
    
    // Scale - apply global scale first, then part-specific scale
    const globalScale = partsManifest.globalScale || 1;
    const partScale = transform.scale || 1;
    const finalScale = globalScale * partScale;
    model.scale.set(finalScale, finalScale, finalScale);
}

/**
 * Apply per-mesh materials to a model. Mesh names are routed via the
 * provided colorMap ({ accent, main, hidden } — each an array of mesh names
 * to match using the three-tier rule: clean name, numeric-suffix-stripped,
 * parent name). Unmatched meshes inherit the part's category default.
 */
function applyMaterial(model, defaultColor, defaultOpacity, colorMap) {
    // Lowercase the manifest entries so matching against mixed-case mesh names
    // is forgiving — preserves the original toLowerCase().includes() behavior
    // for GLBs that pre-date the CADScope STEP→GLB pipeline normalization.
    const lc = (arr) => new Set((arr || []).map(s => s.toLowerCase()));
    const accentSet = lc(colorMap?.accent);
    const mainSet = lc(colorMap?.main);
    const hiddenSet = lc(colorMap?.hidden);

    model.traverse((child) => {
        if (!child.isMesh) return;

        const cleaned = cleanNodeName(child.name).toLowerCase();
        const stripped = stripNumericSuffix(cleaned);
        const parentCleaned = child.parent ? cleanNodeName(child.parent.name).toLowerCase() : '';
        const matchesIn = (set) => set.size > 0 && (set.has(cleaned) || set.has(stripped) || set.has(parentCleaned));

        if (matchesIn(hiddenSet)) {
            child.visible = false;
            return;
        }

        let meshColor = defaultColor;
        let meshOpacity = defaultOpacity;

        if (matchesIn(accentSet)) {
            meshColor = state.accentColor;
            meshOpacity = 1.0;
        } else if (matchesIn(mainSet)) {
            meshColor = state.mainColor;
            meshOpacity = 1.0;
        }

        child.visible = true;
        child.material = new THREE.MeshStandardMaterial({
            color: meshColor,
            metalness: 0.1,
            roughness: 0.7,
            transparent: meshOpacity < 1.0,
            opacity: meshOpacity
        });
        child.castShadow = false;
        child.receiveShadow = false;
    });
}

/**
 * Re-apply materials to all active models (used when colors change)
 */
function updateModelColors() {
    state.activeModels.forEach((model) => {
        const part = model.userData;
        if (!part) return;
        const { color, opacity } = getCategoryDefault(part);
        const colorMap = resolveColorMap(part, part.isHexCowl || false);
        applyMaterial(model, color, opacity, colorMap);
    });
}

// ============================================
// Configuration Logic
// ============================================

/**
 * Check if a part variant matches the current configuration
 */
function partMatchesConfig(partData, config) {
    // Check required exact matches
    if (partData.requires) {
        for (const [key, value] of Object.entries(partData.requires)) {
            if (config[key] !== value) {
                return false;
            }
        }
    }
    
    // Check requiresAny (for each key, at least one value must match - ALL keys must pass)
    if (partData.requiresAny) {
        for (const [key, values] of Object.entries(partData.requiresAny)) {
            if (!values.includes(config[key])) {
                return false;
            }
        }
    }
    
    // Check exclusions
    if (partData.excludeIf) {
        for (const [key, values] of Object.entries(partData.excludeIf)) {
            if (values.includes(config[key])) {
                return false;
            }
        }
    }
    
    // Check always-include parts
    if (partData.always) {
        return true;
    }
    
    return true;
}

/**
 * Get all parts that match the current configuration
 */
function getMatchingParts(config) {
    const matching = [];
    
    // Check if current extruder has no extruder adapter (like Sherpa Mini)
    const extruderRule = partsManifest.compatibility[config.extruder];
    const skipExtruderAdapterForExtruder = extruderRule?.noExtruderAdapter === true;
    
    // Check if current hotend has no extruder adapter (like UHF)
    const hotendRule = partsManifest.compatibility[config.hotend];
    const skipExtruderAdapterForHotend = hotendRule?.noExtruderAdapter === true;
    
    const skipExtruderAdapter = skipExtruderAdapterForExtruder || skipExtruderAdapterForHotend;
    
    for (const [categoryId, category] of Object.entries(partsManifest.parts)) {
        // Skip extruder adapters for extruders/hotends that don't use them
        if (skipExtruderAdapter && categoryId === 'extruderAdapters') {
            continue;
        }
        
        for (const [partId, partData] of Object.entries(category.variants)) {
            const matches = partMatchesConfig(partData, config);
            if (matches) {
                matching.push({
                    id: partId,
                    category: categoryId,
                    categoryLabel: category.category,
                    ...partData
                });
            }
        }
    }
    
    return matching;
}

/**
 * Get STL-only parts that match the current configuration (not rendered, just for download)
 */
function getMatchingStlOnlyParts(config) {
    const matching = [];
    
    if (!partsManifest.stlOnlyParts) return matching;
    
    for (const [categoryId, category] of Object.entries(partsManifest.stlOnlyParts)) {
        for (const [partId, partData] of Object.entries(category.variants)) {
            if (partMatchesConfig(partData, config)) {
                matching.push({
                    id: partId,
                    category: categoryId,
                    categoryLabel: category.category,
                    ...partData
                });
            }
        }
    }
    
    return matching;
}

/**
 * Check compatibility and return warnings
 */
function checkCompatibility(config) {
    const warnings = [];
    
    // Check specific compatibility rules
    const extruderRule = partsManifest.compatibility[config.extruder];
    if (extruderRule?.incompatibleWith) {
        for (const [key, values] of Object.entries(extruderRule.incompatibleWith)) {
            if (values.includes(config[key])) {
                warnings.push(extruderRule.warningMessage);
            }
        }
    }
    
    return warnings;
}

// ============================================
// UI Updates
// ============================================

/**
 * Update disabled state of options based on compatibility rules
 */
function updateToolheadBoardNote(config) {
    const tapNote = document.getElementById('toolhead-note-tap');
    const xolNote = document.getElementById('toolhead-note-xol');
    
    if (config.carriage === 'xol-carriage') {
        tapNote.style.display = 'none';
        xolNote.style.display = 'block';
    } else {
        tapNote.style.display = 'block';
        xolNote.style.display = 'none';
    }
}

function updateDisabledOptions(config) {
    // Update the toolhead board section note based on carriage
    updateToolheadBoardNote(config);
    
    // Define incompatibility rules
    const uhfHotends = ['dragon-uhf', 'dragon-ace-mze', 'dragon-ace-volcano-mze', 'rapido-uhf'];
    const isUHF = uhfHotends.includes(config.hotend);
    const isCrossbow = config.filamentCutter === 'crossbow';
    const isSherpaMini = config.extruder === 'sherpa-mini';
    
    // Show/hide UHF crossbow incompatibility notes
    const uhfCrossbowNote = document.getElementById('uhf-crossbow-note');
    if (uhfCrossbowNote) {
        uhfCrossbowNote.style.display = isCrossbow ? 'block' : 'none';
    }
    const crossbowUhfNote = document.getElementById('crossbow-uhf-note');
    if (crossbowUhfNote) {
        crossbowUhfNote.style.display = isUHF ? 'block' : 'none';
    }
    
    // Board mount availability matrix
    const boardCompatibility = {
        'ebb36-sht36v2': ['wwbmg', 'wwg2', 'sherpa-mini', 'lgx-lite', 'vz-hextrudort'],
        'h36': ['wwbmg'],
        'nh36': ['wwbmg', 'orbiter'],
        'sht36v3': ['wwbmg'],
        'xol-pcb': ['wwbmg', 'orbiter']
    };

    // Disable incompatible options within each select
    document.querySelectorAll('.config-section select').forEach(select => {
        const selectName = select.name;
        select.querySelectorAll('option').forEach(option => {
            const value = option.value;
            let shouldDisable = false;

            // Rule 1: Sherpa-mini is disabled if crossbow is selected or UHF hotend is selected
            if (selectName === 'extruder' && value === 'sherpa-mini') {
                shouldDisable = isCrossbow || isUHF;
            }

            // Rule 2: LGX-Lite and VZ-Hextrudort are disabled if UHF hotend is selected
            if (selectName === 'extruder' && (value === 'lgx-lite' || value === 'vz-hextrudort')) {
                shouldDisable = isUHF;
            }

            // Rule 3: UHF hotends are disabled if crossbow is selected
            if (selectName === 'hotend' && uhfHotends.includes(value)) {
                shouldDisable = isCrossbow;
            }

            // Rule 4: Toolhead board compatibility based on extruder (Xol Carriage only)
            if (selectName === 'toolhead-board' && value !== 'none') {
                if (config.carriage !== 'xol-carriage') {
                    shouldDisable = true;
                } else if (boardCompatibility[value] && !boardCompatibility[value].includes(config.extruder)) {
                    shouldDisable = true;
                }
            }

            option.disabled = shouldDisable;
        });

        // If the currently selected option is now disabled, switch to the first enabled option
        const selectedOption = select.options[select.selectedIndex];
        if (selectedOption && selectedOption.disabled) {
            const firstEnabled = select.querySelector('option:not(:disabled)');
            if (firstEnabled) {
                select.value = firstEnabled.value;
                select.dispatchEvent(new Event('change'));
            }
        }
    });

    // Disable crossbow checkbox if sherpa-mini is selected or UHF hotend is selected
    const crossbowCheckbox = document.querySelector('input[name="filament-cutter"]');
    if (crossbowCheckbox) {
        const label = crossbowCheckbox.closest('.option');
        const shouldDisable = isSherpaMini || isUHF;
        crossbowCheckbox.disabled = shouldDisable;
        if (shouldDisable) {
            label.classList.add('disabled');
        } else {
            label.classList.remove('disabled');
        }
    }
}

async function updateViewer() {
    const config = state.config;
    
    // Update which options are disabled based on current selection
    updateDisabledOptions(config);
    
    const matchingParts = getMatchingParts(config);
    const newPartIds = new Set(matchingParts.map(p => p.id));
    const currentPartIds = new Set(state.activeModels.keys());
    
    // Find parts to remove (in current but not in new)
    const toRemoveSet = new Set([...currentPartIds].filter(id => !newPartIds.has(id)));
    
    // Find parts to add (in new but not in current)
    const toAddSet = new Set(matchingParts.filter(p => !currentPartIds.has(p.id)).map(p => p.id));
    
    // Check if any existing cowlings need to be reloaded due to hexCowl change
    for (const [partId, model] of state.activeModels) {
        const part = model.userData;
        if (part && part.category === 'cowlings') {
            const currentIsHex = part.isHexCowl || false;
            const shouldBeHex = config.hexCowl;
            if (currentIsHex !== shouldBeHex) {
                // Cowling hex state changed - need to reload
                toRemoveSet.add(partId);
                toAddSet.add(partId);
            }
        }
    }
    
    // Convert sets back to arrays, getting full part data for toAdd
    const toRemove = [...toRemoveSet];
    const toAdd = matchingParts.filter(p => toAddSet.has(p.id));
    
    // Update warnings
    const warnings = checkCompatibility(config);
    updateWarnings(warnings);
    
    // Only show loading if we need to load new models (not cached)
    const needsLoading = toAdd.some(part => {
        // Check for hex cowling path
        let filePath;
        if (config.hexCowl && part.category === 'cowlings') {
            const parts = part.file.split('/');
            const fileName = parts.pop();
            parts.push('Hex ' + fileName);
            filePath = partsManifest.basePath + parts.join('/') + '.' + partsManifest.fileExtension;
        } else {
            filePath = partsManifest.basePath + part.file + '.' + partsManifest.fileExtension;
        }
        return !state.loadedModels.has(filePath);
    });
    
    if (needsLoading) {
        const loadingText = document.getElementById('loading-text');
        if (loadingText) {
            const phrase = loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)];
            loadingText.textContent = phrase + '...';
        }
        document.getElementById('loading').classList.remove('hidden');
    }
    
    // Remove parts that are no longer needed
    for (const partId of toRemove) {
        const model = state.activeModels.get(partId);
        if (model) {
            modelGroup.remove(model);
            disposeObject(model);
            state.activeModels.delete(partId);
        }
    }
    
    // Add new parts
    for (const part of toAdd) {
        try {
            // Safety check: ensure we don't add duplicates
            if (state.activeModels.has(part.id)) {
                continue;
            }
            
            // Determine if this is a hex cowling
            const isHexCowl = config.hexCowl && part.category === 'cowlings';
            
            const model = await loadModel(part.id, part, isHexCowl);
            
            // Skip if model failed to load
            if (!model) {
                continue;
            }
            
            applyTransform(model, part.transform);

            const { color, opacity } = getCategoryDefault(part);
            const colorMap = resolveColorMap(part, isHexCowl);
            applyMaterial(model, color, opacity, colorMap);

            // Add to scene
            model.name = part.id;
            model.userData = { ...part, isHexCowl };  // Store hex cowl state for color updates
            modelGroup.add(model);
            state.activeModels.set(part.id, model);
            
        } catch (error) {
            console.warn(`Failed to load part ${part.id}:`, error);
        }
    }
    
    // Skip auto-centering on initial load (custom default view is set in initThreeJS)
    if (state.initialLoad) {
        state.initialLoad = false;
    }
    
    // Hide loading
    document.getElementById('loading').classList.add('hidden');
}

function updateWarnings(warnings) {
    const warningsEl = document.getElementById('warnings');
    
    if (warnings.length === 0) {
        warningsEl.classList.remove('visible');
        return;
    }
    
    warningsEl.classList.add('visible');
    warningsEl.innerHTML = '<h3>⚠️ Warnings</h3>';
    
    for (const warning of warnings) {
        const div = document.createElement('div');
        div.className = 'warning-item';
        div.textContent = warning;
        warningsEl.appendChild(div);
    }
}

function centerCameraOnModels() {
    // Reset to preferred default view
    camera.position.set(143.84, 82.10, 285.96);
    controls.target.set(0.91, 25.89, -35.32);
    controls.update();
}

/**
 * Frame the model group from one of the six axis-aligned directions, or
 * return to the predefined home view. Distance is derived from the current
 * scene bounding box so the framing fits whatever assembly is loaded.
 */
function setView(view) {
    if (view === 'home') {
        centerCameraOnModels();
        return;
    }

    const box = new THREE.Box3().setFromObject(modelGroup);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const distance = box.getSize(new THREE.Vector3()).length() * 1.5;

    const offset = new THREE.Vector3();
    switch (view) {
        case 'top':    offset.set(0, distance, 0); break;
        case 'bottom': offset.set(0, -distance, 0); break;
        case 'front':  offset.set(0, 0, distance); break;
        case 'back':   offset.set(0, 0, -distance); break;
        case 'left':   offset.set(-distance, 0, 0); break;
        case 'right':  offset.set(distance, 0, 0); break;
        default: return;
    }

    controls.target.copy(center);
    camera.position.copy(center).add(offset);
    camera.up.set(0, 1, 0);
    camera.lookAt(center);
    controls.update();
}

/**
 * Multiplicative zoom relative to the current camera-target distance.
 * Positive factor zooms out, negative zooms in (matches CADScope buttons).
 * Clamped to [0.1×, 10×] of the model's bounding-box diagonal.
 */
function zoom(factor) {
    const dirVec = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const distance = camera.position.distanceTo(controls.target);

    const box = new THREE.Box3().setFromObject(modelGroup);
    const modelSize = box.isEmpty() ? 100 : box.getSize(new THREE.Vector3()).length();
    const minDist = modelSize * 0.1;
    const maxDist = modelSize * 10;
    const clamped = Math.max(minDist, Math.min(maxDist, distance * (1 + factor)));

    camera.position.copy(controls.target).addScaledVector(dirVec, clamped);
    controls.update();
}

function resetZoom() {
    centerCameraOnModels();
}

// ============================================
// Event Handlers
// ============================================

function setupEventListeners() {
    // Configuration select dropdowns
    document.querySelectorAll('.config-section select').forEach(select => {
        select.addEventListener('change', (e) => {
            // Convert kebab-case to camelCase (e.g., "wwbmg-sensors" -> "wwbmgSensors")
            const configKey = e.target.name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            const value = e.target.value;
            state.config[configKey] = value;

            // Show/hide WW-BMG sensor options based on extruder selection
            if (configKey === 'extruder') {
                updateWwbmgOptionsVisibility();
            }

            updateViewer();
            saveStateToSession();
        });
    });

    // Checkboxes
    document.querySelectorAll('.option-group input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', (e) => {
            // Convert kebab-case to camelCase (e.g., "filament-cutter" -> "filamentCutter")
            const configKey = e.target.name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

            // hexCowl is a boolean, others use value/'none'
            if (configKey === 'hexCowl') {
                state.config[configKey] = e.target.checked;
            } else {
                state.config[configKey] = e.target.checked ? e.target.value : 'none';
            }
            updateViewer();
            saveStateToSession();
        });
    });

    // Viewer controls — view cube uses event delegation on data-view attribute
    document.querySelectorAll('.viewer-controls [data-view]').forEach(btn => {
        btn.addEventListener('click', () => setView(btn.dataset.view));
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => zoom(0.2));
    document.getElementById('btn-zoom-in').addEventListener('click', () => zoom(-0.2));
    document.getElementById('btn-zoom-reset').addEventListener('click', resetZoom);
    document.getElementById('btn-wireframe').addEventListener('click', toggleWireframe);

    // Brightness slider scales hemi + directional lights against their base intensities
    const brightnessSlider = document.getElementById('brightness-slider');
    if (brightnessSlider) {
        brightnessSlider.addEventListener('input', (e) => {
            const scale = e.target.value / 100;
            for (const { light, base } of baseLightIntensities) {
                light.intensity = base * scale;
            }
        });
    }

    // Color pickers
    document.getElementById('main-color').addEventListener('input', (e) => {
        const colorValue = parseInt(e.target.value.replace('#', ''), 16);
        if (!isNaN(colorValue)) {
            state.mainColor = colorValue;
            updateModelColors();
            saveStateToSession();
        }
    });
    document.getElementById('accent-color').addEventListener('input', (e) => {
        const colorValue = parseInt(e.target.value.replace('#', ''), 16);
        if (!isNaN(colorValue)) {
            state.accentColor = colorValue;
            updateModelColors();
            saveStateToSession();
        }
    });

    // Download button
    document.getElementById('download-btn').addEventListener('click', downloadParts);

    // Copy URL button
    const copyUrlBtn = document.getElementById('copy-url-btn');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', async () => {
            const success = await copyShareUrl();
            const originalText = copyUrlBtn.textContent;

            if (success) {
                copyUrlBtn.textContent = 'Copied!';
            } else {
                copyUrlBtn.textContent = 'Failed to copy';
            }

            setTimeout(() => {
                copyUrlBtn.textContent = originalText;
            }, 2000);
        });
    }

    // Reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Reset configuration to defaults? This will clear all your current settings.')) {
                resetToDefaults();
            }
        });
    }

    // Mobile scroll indicator
    setupScrollIndicator();
}

// Scroll indicator constants
const SCROLL_THRESHOLD_PX = 20;
const SCROLL_NUDGE_PX = 150;
const RENDER_DELAY_MS = 100;

/**
 * Setup scroll indicator for mobile config panel
 */
function setupScrollIndicator() {
    const configPanel = document.querySelector('.config-panel');
    const configContent = document.querySelector('.config-panel-content');
    const scrollIndicator = document.querySelector('.scroll-indicator');
    
    if (!configPanel || !configContent) return;
    
    function updateScrollIndicator() {
        const scrollTop = configContent.scrollTop;
        const scrollHeight = configContent.scrollHeight;
        const clientHeight = configContent.clientHeight;
        
        // Check if there's content to scroll
        const hasMoreContent = scrollHeight - scrollTop - clientHeight > SCROLL_THRESHOLD_PX;
        
        configPanel.classList.toggle('has-more-content', hasMoreContent);
    }
    
    // Click on indicator scrolls down
    if (scrollIndicator) {
        scrollIndicator.addEventListener('click', () => {
            configContent.scrollBy({ top: SCROLL_NUDGE_PX, behavior: 'smooth' });
        });
    }
    
    // Check on scroll
    configContent.addEventListener('scroll', updateScrollIndicator);
    
    // Check on resize (note: not removed since this is a single-page app)
    window.addEventListener('resize', updateScrollIndicator);
    
    // Initial check (with slight delay to ensure content is rendered)
    setTimeout(updateScrollIndicator, RENDER_DELAY_MS);
}

function toggleWireframe() {
    state.wireframe = !state.wireframe;
    document.getElementById('btn-wireframe').classList.toggle('active', state.wireframe);
    
    modelGroup.traverse((child) => {
        if (child.isMesh) {
            child.material.wireframe = state.wireframe;
        }
    });
}

// GitHub raw content base URLs
const GITHUB_STL_BASE = 'https://raw.githubusercontent.com/Armchair-Heavy-Industries/A4T/main/STL/';
const GITHUB_3MF_BASE = 'https://raw.githubusercontent.com/Armchair-Heavy-Industries/A4T/main/3mf/';

async function downloadParts() {
    const parts = getMatchingParts(state.config);
    const stlOnlyParts = getMatchingStlOnlyParts(state.config);
    
    // Build file list from both rendered parts and STL-only parts
    // Exclude carriages (from other sources), wwbmg (STL files handled via stlOnlyParts),
    // hotendSpacers (included in the HE Duct STL, separate gltf for visualization only),
    // and visualOnly parts (not printable, just for visualization)
    const renderedFiles = parts
        .filter(p => p.category !== 'carriages' && p.category !== 'wwbmg' && p.category !== 'hotendSpacers' && !p.visualOnly)
        .map(p => {
            // Use stlPath if specified (for parts where STL location differs from GLTF)
            if (p.stlPath) {
                return { path: p.stlPath, isStl: true };
            }
            // Otherwise, convert GLTF path to STL path
            let baseName = p.file.replace('.glb', '');
            const stlPath = baseName.endsWith('.stl') ? baseName : baseName + '.stl';
            return { path: stlPath, isStl: true, isCowling: p.category === 'cowlings' };
        });
    const stlOnlyFiles = stlOnlyParts.map(p => ({ path: p.stlFile, isStl: true }));
    let allFiles = [...renderedFiles, ...stlOnlyFiles];
    
    // Transform cowling files to hex 3MF if hex cowl option is enabled
    if (state.config.hexCowl) {
        allFiles = allFiles.map(file => {
            if (file.isCowling) {
                // Transform: "Cowlings/A4T Cowling - Dragon_Rapido [cw2-tap].stl"
                // To: "Cowlings [Hexagon multi-colour]/Hex A4T Cowling - Dragon_Rapido [cw2-tap].3mf"
                const fileName = file.path.split('/').pop();  // e.g., "A4T Cowling - Dragon_Rapido [cw2-tap].stl"
                const baseName = fileName.replace('.stl', '');  // Remove .stl
                const hexFileName = 'Hex ' + baseName + '.3mf';
                return { 
                    path: 'Cowlings [Hexagon multi-colour]/' + hexFileName, 
                    isStl: false,
                    is3mf: true 
                };
            }
            return file;
        });
    }
    
    // Show download progress
    const downloadBtn = document.getElementById('download-btn');
    const originalText = downloadBtn.textContent;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Preparing download...';
    
    try {
        const zip = new JSZip();
        const folder = zip.folder('A4T-STLs');
        
        let completed = 0;
        const total = allFiles.length;
        
        // Fetch all files in parallel with progress updates
        const fetchPromises = allFiles.map(async (file) => {
            const filePath = file.path;
            // Use appropriate base URL based on file type
            const baseUrl = file.is3mf ? GITHUB_3MF_BASE : GITHUB_STL_BASE;
            
            // Encode the path but keep forward slashes for URL structure
            // GitHub raw URLs need proper encoding for spaces and special chars
            const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const url = baseUrl + encodedPath;
            
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const blob = await response.blob();
                
                // Extract just the filename for the zip (flatten structure)
                const fileName = filePath.split('/').pop();
                folder.file(fileName, blob);
                
                completed++;
                downloadBtn.textContent = `Downloading... ${completed}/${total}`;
                
                return { success: true, file: filePath };
            } catch (error) {
                console.error(`Failed to fetch ${filePath}:`, error);
                completed++;
                downloadBtn.textContent = `Downloading... ${completed}/${total}`;
                return { success: false, file: filePath, error: error.message };
            }
        });
        
        const results = await Promise.all(fetchPromises);
        
        // Check for failures
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
            console.warn('Some files failed to download:', failures);
        }
        
        // Generate the zip
        downloadBtn.textContent = 'Creating ZIP...';
        const zipBlob = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 2 }  // Low compression for faster creation
        }, (metadata) => {
            downloadBtn.textContent = `Creating ZIP... ${Math.round(metadata.percent)}%`;
        });
        
        // Trigger download
        const downloadUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'A4T-STLs.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        
        // Show completion message
        if (failures.length > 0) {
            alert(`Download complete!\n\n${failures.length} file(s) could not be fetched:\n${failures.map(f => f.file).join('\n')}`);
        }
        
    } catch (error) {
        console.error('Download failed:', error);
        alert('Download failed: ' + error.message);
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = originalText;
    }
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Load state from URL hash if present (takes priority over session storage)
    const hasLoadedFromHash = loadStateFromHash();

    // If no hash, try loading from session storage
    const hasLoadedFromSession = !hasLoadedFromHash && loadStateFromSession();

    // Clear hash from URL after loading (whether valid or invalid)
    if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
    }

    initThreeJS();
    setupEventListeners();

    // Sync UI to reflect loaded state
    if (hasLoadedFromHash || hasLoadedFromSession) {
        syncUIToState();
    }

    updateViewer();

    // Save initial state to session storage
    saveStateToSession();

    // Listen for hash changes (e.g., when user pastes a shared URL)
    window.addEventListener('hashchange', () => {
        const loaded = loadStateFromHash();

        if (loaded) {
            // Clear hash after loading
            window.history.replaceState(null, '', window.location.pathname);

            // Update UI and viewer
            syncUIToState();
            updateViewer();

            // Save to session storage
            saveStateToSession();
        }
    });
});
