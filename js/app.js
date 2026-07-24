/**
 * Prusawire Configurator
 * Main application script
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { defaultConfig as buildDefaultConfig, matchesClause, evaluateVisible, validConfigKeys, downloadFileList, reconcileConfig } from './manifest_rules.js';
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
// glTF assets are authored in meters; the scene, camera, and lights work in
// millimeters, so the composite model is scaled up on load.
const MODEL_SCALE = 1000;

const state = {
    manifest: null,        // generated configurator manifest
    lookups: null,         // sidecar (colors.json) lookup tables
    optionsUI: null,       // widget controller from renderOptions()
    partNodes: new Map(),  // manifest part id -> scene nodes
    sceneRoot: null,       // composite model root (glTF Scene wrapper skipped)
    config: {},            // current option choices, keyed by option id
    colorsPicked: false,   // colors persist/share only once the user picks one
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
    const shareable = { v: 2, config: state.config };
    if (state.colorsPicked) {
        shareable.mainColor = state.mainColor;
        shareable.accentColor = state.accentColor;
    }
    return shareable;
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

    // Merge colors — only from v2+ payloads, so stale pre-palette
    // sessions cannot override the sidecar defaults.
    if (decoded.v >= 2 && decoded.mainColor !== undefined) {
        state.mainColor = decoded.mainColor;
        state.colorsPicked = true;
    }
    if (decoded.v >= 2 && decoded.accentColor !== undefined) {
        state.accentColor = decoded.accentColor;
        state.colorsPicked = true;
    }

    return true;
}

/**
 * Save state to session storage
 */
function saveStateToSession() {
    try {
        const shareableState = getShareableState();
        sessionStorage.setItem('prusawire-config', JSON.stringify(shareableState));
    } catch (e) {
        console.warn('Failed to save to session storage:', e);
    }
}

/**
 * Load state from session storage
 */
function loadStateFromSession() {
    try {
        const stored = sessionStorage.getItem('prusawire-config');
        if (!stored) return false;

        const decoded = JSON.parse(stored);
        if (!decoded) return false;

        // Merge config with validation
        if (decoded.config) {
            const validatedConfig = validateConfig(decoded.config);
            Object.assign(state.config, validatedConfig);
        }

        // Merge colors — only from v2+ payloads, so stale pre-palette
        // sessions cannot override the sidecar defaults.
        if (decoded.v >= 2 && decoded.mainColor !== undefined) {
            state.mainColor = decoded.mainColor;
            state.colorsPicked = true;
        }
        if (decoded.v >= 2 && decoded.accentColor !== undefined) {
            state.accentColor = decoded.accentColor;
            state.colorsPicked = true;
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
    state.colorsPicked = false;
    sessionStorage.removeItem('prusawire-config');
    syncUIToState();
    applyColors();
    updateConfiguration();
}

/**
 * Update UI inputs to match loaded state
 */
function syncUIToState() {
    if (state.optionsUI) {
        state.optionsUI.refresh(state.config);
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
            requestRender();
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

    // Renders are on-demand: user input re-renders via the change listener.
    controls.addEventListener('change', requestRender);
    requestRender();

    // Loading overlay is hidden by the bootstrap once the model is ready.
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
    requestRender();
}

// Render-on-demand: a frame is drawn only when something changed. During an
// in-flight camera animation, controls.update() is skipped so the damping
// decay doesn't fight the lerp.
let renderQueued = false;
let cameraAnimation = null;     // { from, to, startedAt, duration }
let defaultView = null;         // rest pose captured after the model loads
let modelCenter = new THREE.Vector3();
let modelSize = 1;
const ANIM_DEFAULT = 600;       // view-button transitions
const ANIM_ZOOM = 250;          // zoom / resetZoom

function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        const stillAnimating = tickCameraAnimation();
        if (!stillAnimating) controls.update();
        renderer.render(scene, camera);
        if (stillAnimating) requestRender();
    });
}

function animateCameraTo(target, duration = ANIM_DEFAULT) {
    cameraAnimation = {
        from: {
            position: camera.position.clone(),
            quaternion: camera.quaternion.clone(),
            up: camera.up.clone(),
            target: controls.target.clone()
        },
        to: target,
        startedAt: performance.now(),
        duration
    };
    controls.enabled = false;
    requestRender();
}

function tickCameraAnimation() {
    if (!cameraAnimation) return false;
    const t = Math.min(1, (performance.now() - cameraAnimation.startedAt) / cameraAnimation.duration);
    const eased = t * t * (3 - 2 * t);
    const { from, to } = cameraAnimation;
    camera.position.lerpVectors(from.position, to.position, eased);
    camera.quaternion.slerpQuaternions(from.quaternion, to.quaternion, eased);
    camera.up.lerpVectors(from.up, to.up, eased);
    controls.target.copy(from.target).lerp(to.target, eased);
    camera.updateProjectionMatrix();
    if (t >= 1) {
        cameraAnimation = null;
        controls.enabled = true;
        return false;
    }
    return true;
}

// Distance at which the model's bounding sphere fills the camera's FOV,
// with a padding margin. FOV-aware so camera tuning cannot break framing.
function fitDistance(margin = 1.2) {
    const fovRad = camera.fov * Math.PI / 180;
    return ((modelSize / 2) * margin) / Math.tan(fovRad / 2);
}

// Build a target pose looking at modelCenter from a given direction at the
// canonical model-fit distance. Used by all axis-view buttons.
function poseFromDirection(direction, up) {
    const distance = fitDistance();
    const eye = modelCenter.clone().addScaledVector(direction.clone().normalize(), distance);
    const m = new THREE.Matrix4().lookAt(eye, modelCenter, up);
    return {
        position: eye,
        quaternion: new THREE.Quaternion().setFromRotationMatrix(m),
        up: up.clone(),
        target: modelCenter.clone()
    };
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
    const progressFill = document.getElementById('loading-progress-fill');
    const processingLine = document.getElementById('processing-line');
    const processingText = document.getElementById('processing-text');
    loadingText.textContent = 'Retrieving 3D model...';
    return new Promise((resolve, reject) => {
        gltfLoader.load(
            url,
            (gltf) => {
                gltf.scene.scale.setScalar(MODEL_SCALE);
                state.sceneRoot = (gltf.scene.children.length === 1 && gltf.scene.name === 'Scene')
                    ? gltf.scene.children[0]
                    : gltf.scene;
                indexPartNodes();
                modelGroup.add(gltf.scene);

                // Fit the camera and clipping planes to the loaded assembly.
                const box = new THREE.Box3().setFromObject(modelGroup);
                modelSize = box.getSize(new THREE.Vector3()).length();
                modelCenter = box.getCenter(new THREE.Vector3());
                camera.near = modelSize * 0.001;
                camera.far = modelSize * 100;
                const dir = new THREE.Vector3(0.4, 0.25, 0.88).normalize();
                camera.position.copy(modelCenter).addScaledVector(dir, fitDistance());
                controls.target.copy(modelCenter);
                camera.up.set(0, 1, 0);
                camera.lookAt(modelCenter);
                camera.updateProjectionMatrix();
                controls.update();

                // Snapshot the rest pose so Home animates back to this view.
                defaultView = {
                    position: camera.position.clone(),
                    quaternion: camera.quaternion.clone(),
                    up: camera.up.clone(),
                    target: controls.target.clone()
                };
                requestRender();
                resolve();
            },
            (progress) => {
                if (!progress.total) return;
                const pct = Math.min(100, (progress.loaded / progress.total) * 100).toFixed(0);
                progressFill.style.width = `${pct}%`;
                loadingText.textContent = `Retrieving 3D model... ${pct}%`;
                if (pct >= 100 && processingLine.classList.contains('hidden')) {
                    processingText.textContent = loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)] + '...';
                    processingLine.classList.remove('hidden');
                }
            },
            (error) => {
                console.error('Error loading model:', error);
                loadingText.textContent = 'Failed to load model.';
                processingLine.classList.add('hidden');
                reject(error);
            }
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
    requestRender();
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
                    opacity: entry.opacity
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
    requestRender();
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
    if (defaultView) {
        animateCameraTo(defaultView, ANIM_DEFAULT);
    }
}

/**
 * Animate to one of the six axis-aligned views, or back to the captured
 * home pose. Distance derives from the loaded model's bounding size.
 */
function setView(view) {
    if (view === 'home') {
        centerCameraOnModels();
        return;
    }
    const views = {
        top:    [new THREE.Vector3(0, 1, 0),  new THREE.Vector3(0, 0, -1)],
        bottom: [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)],
        front:  [new THREE.Vector3(0, 0, 1),  new THREE.Vector3(0, 1, 0)],
        back:   [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],
        left:   [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)],
        right:  [new THREE.Vector3(1, 0, 0),  new THREE.Vector3(0, 1, 0)]
    };
    const entry = views[view];
    if (!entry) return;
    animateCameraTo(poseFromDirection(entry[0], entry[1]), ANIM_DEFAULT);
}

/**
 * Multiplicative zoom relative to the current camera-target distance,
 * animated. Positive factor zooms out, negative zooms in. Clamped to
 * [0.1x, 10x] of the model's bounding size.
 */
function zoom(factor) {
    const dirVec = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const distance = camera.position.distanceTo(controls.target);
    const clamped = Math.max(modelSize * 0.1, Math.min(modelSize * 10, distance * (1 + factor)));
    animateCameraTo({
        position: controls.target.clone().addScaledVector(dirVec, clamped),
        quaternion: camera.quaternion.clone(),
        up: camera.up.clone(),
        target: controls.target.clone()
    }, ANIM_ZOOM);
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

    // Brightness slider scales hemi + directional lights against their base intensities
    const brightnessSlider = document.getElementById('brightness-slider');
    if (brightnessSlider) {
        brightnessSlider.addEventListener('input', (e) => {
            const scale = e.target.value / 100;
            for (const { light, base } of baseLightIntensities) {
                light.intensity = base * scale;
            }
            requestRender();
        });
    }

    // Color pickers
    document.getElementById('main-color').addEventListener('input', (e) => {
        const colorValue = parseInt(e.target.value.replace('#', ''), 16);
        if (!isNaN(colorValue)) {
            state.mainColor = colorValue;
            state.colorsPicked = true;
            applyColors();
            saveStateToSession();
        }
    });
    document.getElementById('accent-color').addEventListener('input', (e) => {
        const colorValue = parseInt(e.target.value.replace('#', ''), 16);
        if (!isNaN(colorValue)) {
            state.accentColor = colorValue;
            state.colorsPicked = true;
            applyColors();
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

/**
 * Mobile-ish detection by capability: coarse pointer plus a small screen.
 * Used to gate the heavy model download behind an explicit tap.
 */
function isProbablyMobile() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const shortEdge = Math.min(window.screen.width, window.screen.height);
    return coarse && shortEdge < 820;
}

/**
 * On mobile, show a best-on-desktop warning and resolve only when the user
 * explicitly asks to load the model. Desktop resolves immediately.
 */
function confirmMobileLoad() {
    const warning = document.getElementById('mobile-warning');
    if (!warning || !isProbablyMobile()) {
        return Promise.resolve();
    }
    const controls = document.querySelector('.viewer-controls');
    document.getElementById('loading').classList.add('hidden');
    controls.style.display = 'none';
    warning.classList.remove('hidden');
    return new Promise((resolve) => {
        document.getElementById('mobile-load-btn').addEventListener('click', () => {
            warning.classList.add('hidden');
            controls.style.display = '';
            resolve();
        }, { once: true });
    });
}

/**
 * Fetch the manifest-selected STL set and hand the user a ZIP. The base URL
 * comes from the manifest; a ?stlBase= query param overrides it for local
 * testing against a served copy of the STL tree.
 */
async function downloadParts() {
    const downloads = state.manifest.downloads;
    if (!downloads) return;
    const base = new URLSearchParams(window.location.search).get('stlBase') || downloads.base;
    const files = downloadFileList(downloads, state.config);
    const downloadBtn = document.getElementById('download-btn');
    const originalText = downloadBtn.textContent;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Preparing download...';

    try {
        const zip = new JSZip();
        const folder = zip.folder('Prusawire-STLs');
        let completed = 0;

        const results = await Promise.all(files.map(async (filePath) => {
            const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
            try {
                const response = await fetch(base + encodedPath);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                // Keep the repo's folder structure inside the ZIP so
                // same-named variant files cannot collide.
                folder.file(filePath, await response.blob());
                return { success: true, file: filePath };
            } catch (error) {
                console.error(`Failed to fetch ${filePath}:`, error);
                return { success: false, file: filePath };
            } finally {
                completed++;
                downloadBtn.textContent = `Downloading... ${completed}/${files.length}`;
            }
        }));

        const failures = results.filter(r => !r.success);
        downloadBtn.textContent = 'Creating ZIP...';
        const zipBlob = await zip.generateAsync(
            { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 2 } },
            (metadata) => {
                downloadBtn.textContent = `Creating ZIP... ${Math.round(metadata.percent)}%`;
            }
        );

        const downloadUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
        a.download = `Prusawire-STLs_${stamp}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

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

document.addEventListener('DOMContentLoaded', async () => {
    initThreeJS();

    // Fetch the generated manifest and color sidecar.
    const [manifest, sidecar] = await Promise.all([
        fetch(`${MODELS_BASE}${MODEL_ID}.manifest.json`).then(r => r.json()),
        fetch(`${MODELS_BASE}${MODEL_ID}.colors.json`).then(r => r.json())
    ]);
    state.manifest = manifest;
    state.lookups = buildSidecarLookups(sidecar);
    document.getElementById('download-btn').disabled = !manifest.downloads;
    state.mainColor = paletteColorInt('Main');
    state.accentColor = paletteColorInt('Accent');
    state.config = buildDefaultConfig(manifest.configOptions);

    // Build the option widgets from the manifest.
    state.optionsUI = renderOptions(
        manifest.configOptions,
        document.getElementById('option-sections'),
        (optionId, value) => {
            state.config[optionId] = value;
            state.config = reconcileConfig(manifest.configOptions, state.config);
            state.optionsUI.refresh(state.config);
            state.optionsUI.setValues(state.config);
            updateConfiguration();
            saveStateToSession();
        }
    );

    // Restore shared/persisted state on top of the defaults.
    const hasLoadedFromHash = loadStateFromHash();
    if (!hasLoadedFromHash) {
        loadStateFromSession();
    }
    state.config = reconcileConfig(manifest.configOptions, state.config);
    if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
    }

    setupEventListeners();
    syncUIToState();

    await confirmMobileLoad();
    document.getElementById('loading').classList.remove('hidden');
    try {
        await loadCompositeModel();
    } catch (error) {
        console.error('Model load failed:', error);
        return;
    }
    applyColors();
    updateConfiguration();
    document.getElementById('loading').classList.add('hidden');

    saveStateToSession();

    // Listen for hash changes (e.g., when the user pastes a shared URL).
    window.addEventListener('hashchange', () => {
        const loaded = loadStateFromHash();
        if (loaded) {
            window.history.replaceState(null, '', window.location.pathname);
            state.config = reconcileConfig(state.manifest.configOptions, state.config);
            syncUIToState();
            applyColors();
            updateConfiguration();
            saveStateToSession();
        }
    });
});
