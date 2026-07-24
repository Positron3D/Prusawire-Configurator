/**
 * Prusawire Configurator
 * Main application script
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { defaultConfig as buildDefaultConfig, matchesClause, evaluateVisible, validConfigKeys } from './manifest_rules.js';
import { buildSidecarLookups, extendPath, categoryFor } from './sidecar_colors.js';
import { renderOptions } from './options_ui.js';

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

const MODEL_ID = 'Prusawire_2026.R1';
const MODELS_BASE = 'models/';

const state = {
    manifest: null,        // generated configurator manifest
    lookups: null,         // sidecar (colors.json) lookup tables
    optionsUI: null,       // widget controller from renderOptions()
    partNodes: new Map(),  // manifest part id -> scene nodes
    sceneRoot: null,       // composite model root (glTF Scene wrapper skipped)
    config: {},            // current option choices, keyed by option id
    wireframe: false,
    mainColor: 0x797979,   // overwritten from the palette at load
    accentColor: 0x9F6204
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
    const validKeys = state.manifest ? validConfigKeys(state.manifest.configOptions) : [];
    
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
    state.config = buildDefaultConfig(state.manifest.configOptions);
    state.mainColor = paletteColorInt('Main');
    state.accentColor = paletteColorInt('Accent');
    sessionStorage.removeItem('a4t-config');
    syncUIToState();
    applyColors();
    updateConfiguration();
}

/**
 * Update UI inputs to match loaded state
 */
function syncUIToState() {
    if (state.optionsUI) {
        state.optionsUI.setValues(state.config);
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
}

// ============================================
// Color Utilities
// ============================================

/** Resolve a palette category's color as a numeric hex int. */
function paletteColorInt(name) {
    const entry = state.lookups?.palette.get(name);
    if (!entry?.color) return 0x888888;
    return parseInt(entry.color.replace('#', ''), 16);
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
 * Load the composite GLB, index its nodes by scaffold path, and add it to
 * the scene. Visibility and colors are applied by the callers afterwards.
 */
function loadCompositeModel() {
    const url = MODELS_BASE + state.manifest.glb;
    const loadingText = document.getElementById('loading-text');
    return new Promise((resolve, reject) => {
        gltfLoader.load(
            url,
            (gltf) => {
                state.sceneRoot = (gltf.scene.children.length === 1 && gltf.scene.name === 'Scene')
                    ? gltf.scene.children[0]
                    : gltf.scene;
                indexPartNodes();
                modelGroup.add(gltf.scene);
                resolve();
            },
            (progress) => {
                if (loadingText && progress.total) {
                    const pct = Math.round((progress.loaded / progress.total) * 100);
                    loadingText.textContent = `Loading model... ${pct}%`;
                }
            },
            reject
        );
    });
}

/**
 * Walk the composite model once, stamping each node's scaffold path into
 * userData and resolving manifest part ids to their scene nodes.
 */
function indexPartNodes() {
    const wanted = new Map();
    for (const part of state.manifest.parts) {
        for (const nodePath of part.nodes) {
            if (!wanted.has(nodePath)) wanted.set(nodePath, []);
            wanted.get(nodePath).push(part.id);
        }
    }

    state.partNodes = new Map();
    const walk = (node, path) => {
        for (const child of node.children) {
            const childPath = extendPath(path, child.name);
            child.userData.scaffoldPath = childPath;
            const ids = wanted.get(childPath);
            if (ids) {
                for (const id of ids) {
                    if (!state.partNodes.has(id)) state.partNodes.set(id, []);
                    state.partNodes.get(id).push(child);
                }
                wanted.delete(childPath);
            }
            walk(child, childPath);
        }
    };
    walk(state.sceneRoot, '');

    for (const missing of wanted.keys()) {
        console.warn(`Manifest part path not found in GLB: ${missing}`);
    }
}

/**
 * Apply the current config: every manifest part toggles its scene subtree
 * per its visibility rules. Nodes without rules keep their loaded state.
 */
function applyConfig() {
    for (const part of state.manifest.parts) {
        const visible = evaluateVisible(part, state.config);
        for (const node of state.partNodes.get(part.id) || []) {
            node.visible = visible;
        }
    }
}

/**
 * Apply the sidecar color cascade: a node's own entry category wins, then
 * its own autoAssign match, then the nearest ancestor's category. Main and
 * Accent use the user-picked colors; other categories use palette values.
 * Categories without a color (e.g. Hidden) leave materials untouched.
 */
function applyColors() {
    if (!state.lookups || !state.sceneRoot) return;
    const materials = new Map();

    const materialFor = (category) => {
        if (materials.has(category)) return materials.get(category);
        const entry = state.lookups.palette.get(category);
        let mat = null;
        if (entry) {
            let colorInt = null;
            if (category === 'Main') colorInt = state.mainColor;
            else if (category === 'Accent') colorInt = state.accentColor;
            else if (entry.color) colorInt = parseInt(entry.color.replace('#', ''), 16);
            if (colorInt != null) {
                mat = new THREE.MeshStandardMaterial({
                    color: colorInt,
                    metalness: entry.metalness,
                    roughness: 0.7,
                    transparent: entry.opacity < 1.0,
                    opacity: entry.opacity,
                    wireframe: state.wireframe
                });
            }
        }
        materials.set(category, mat);
        return mat;
    };

    const walk = (node, inherited) => {
        const category = categoryFor(
            state.lookups, node.userData.scaffoldPath || '', node.name || '', inherited);
        if (node.isMesh && category) {
            const mat = materialFor(category);
            if (mat) node.material = mat;
        }
        for (const child of node.children) {
            walk(child, category);
        }
    };
    for (const child of state.sceneRoot.children) {
        walk(child, null);
    }
}

/**
 * Evaluate the manifest's compatibility rules against a config and return
 * the triggered warning messages.
 */
function checkCompatibility(config) {
    const warnings = [];
    for (const rule of state.manifest.compatibility || []) {
        if (rule.message && rule.when && matchesClause(rule.when, config)) {
            warnings.push(rule.message);
        }
    }
    return warnings;
}

/** Re-evaluate part visibility and compatibility for the current config. */
function updateConfiguration() {
    applyConfig();
    updateWarnings(checkCompatibility(state.config));
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
    // Option widgets are wired by renderOptions() in the bootstrap.

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
            applyColors();
            saveStateToSession();
        }
    });
    document.getElementById('accent-color').addEventListener('input', (e) => {
        const colorValue = parseInt(e.target.value.replace('#', ''), 16);
        if (!isNaN(colorValue)) {
            state.accentColor = colorValue;
            applyColors();
            saveStateToSession();
        }
    });

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

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    initThreeJS();

    // Fetch the generated manifest and color sidecar.
    const [manifest, sidecar] = await Promise.all([
        fetch(`${MODELS_BASE}${MODEL_ID}.manifest.json`).then(r => r.json()),
        fetch(`${MODELS_BASE}${MODEL_ID}.colors.json`).then(r => r.json())
    ]);
    state.manifest = manifest;
    state.lookups = buildSidecarLookups(sidecar);
    state.mainColor = paletteColorInt('Main');
    state.accentColor = paletteColorInt('Accent');
    state.config = buildDefaultConfig(manifest.configOptions);

    // Build the option widgets from the manifest.
    state.optionsUI = renderOptions(
        manifest.configOptions,
        document.getElementById('option-sections'),
        (optionId, value) => {
            state.config[optionId] = value;
            updateConfiguration();
            saveStateToSession();
        }
    );

    // Restore shared/persisted state on top of the defaults.
    const hasLoadedFromHash = loadStateFromHash();
    if (!hasLoadedFromHash) {
        loadStateFromSession();
    }
    if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
    }

    setupEventListeners();
    syncUIToState();

    const loadingText = document.getElementById('loading-text');
    const phrase = loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)];
    loadingText.textContent = phrase + '...';
    document.getElementById('loading').classList.remove('hidden');
    await loadCompositeModel();
    applyColors();
    updateConfiguration();
    document.getElementById('loading').classList.add('hidden');

    saveStateToSession();

    // Listen for hash changes (e.g., when the user pastes a shared URL).
    window.addEventListener('hashchange', () => {
        const loaded = loadStateFromHash();
        if (loaded) {
            window.history.replaceState(null, '', window.location.pathname);
            syncUIToState();
            applyColors();
            updateConfiguration();
            saveStateToSession();
        }
    });
});
