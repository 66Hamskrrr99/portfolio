import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- Theme Switcher ---
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;
const loadStatus = document.getElementById('load-status');

window.onerror = function(msg, url, lineNo, columnNo, error) {
    if (loadStatus) loadStatus.textContent = "Script Error: " + msg;
    console.error(msg, url, lineNo, columnNo, error);
    return false;
};

themeToggle.addEventListener('click', () => {
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'minimalist' ? 'cyberpunk' : 'minimalist';
    body.setAttribute('data-theme', newTheme);
    themeToggle.textContent = newTheme === 'minimalist' ? 'SWITCH TO CYBERPUNK' : 'SWITCH TO MINIMALIST';
    updateSceneColors(newTheme);
});

// --- Three.js Setup ---
const container = document.getElementById('viewer-container');
const canvas = document.getElementById('canvas3d');
const resetBtn = document.getElementById('reset-view');
const toonBtn = document.getElementById('toggle-toon');
const wireframeBtn = document.getElementById('toggle-wireframe');
const lightsBtn = document.getElementById('toggle-lights');
const orthoBtn = document.getElementById('toggle-ortho');
const thumbsContainer = document.getElementById('viewer-thumbnails');

// Light Controls
const lightControlsPanel = document.getElementById('light-controls-panel');
const toggleLightPanelBtn = document.getElementById('toggle-light-panel');
const toggleBloomBtn = document.getElementById('toggle-bloom');
const bloomIntensitySlider = document.getElementById('bloom-intensity');
const bloomRadiusSlider = document.getElementById('bloom-radius');
const bloomThresholdSlider = document.getElementById('bloom-threshold');
const colorWheelContainer = document.getElementById('color-wheel-container');
const lightAngleH = document.getElementById('light-angle-h');
const lightAngleV = document.getElementById('light-angle-v');

const scene = new THREE.Scene();

const aspect = container.clientWidth / container.clientHeight;
const perspectiveCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
perspectiveCamera.position.set(0, 5, 15);

const frustumSize = 15;
const orthographicCamera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1, 1000
);
orthographicCamera.position.set(0, 5, 15);
orthographicCamera.zoom = 1;

let camera = perspectiveCamera;
let isOrthographic = false;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Post-processing setup
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// UnrealBloomPass( resolution, strength, radius, threshold )
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.8, 0.5);
bloomPass.enabled = false; // Off by default
composer.addPass(bloomPass);

// Extremely important: OutputPass handles sRGB encoding and ToneMapping at the end of the post-processing chain!
const outputPass = new OutputPass();
composer.addPass(outputPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 2, 0);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const frontLight = new THREE.DirectionalLight(0xffffff, 1.2);
frontLight.position.set(0, 5, 10);
scene.add(frontLight);
const backLight = new THREE.DirectionalLight(0xffffff, 0.8);
backLight.position.set(0, 5, -10);
scene.add(backLight);
const cameraLight = new THREE.PointLight(0xffffff, 0.5);
scene.add(cameraLight);

const gridHelper = new THREE.GridHelper(30, 30, 0x888888, 0x888888);
scene.add(gridHelper);
const gridBtn = document.getElementById('toggle-grid');
if (gridBtn) {
    gridBtn.addEventListener('click', () => {
        gridHelper.visible = !gridHelper.visible;
        gridBtn.classList.toggle('active');
    });
}
scene.background = new THREE.Color(0x111111); 

// Global State
let currentModel = null;
let currentTexture = null;
let currentConfig = null;
let originalMaterials = new Map();
let toonMaterials = new Map();
let isToonMode = false;
let isLightsOn = true;

const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');

// Create UTS2-style 2-step Gradient Map (Clean 2D Anime style - Multiply Color)
const toneColors = new Uint8Array([150, 255]); // Shadow opacity, Base color
const gradientMap = new THREE.DataTexture(toneColors, toneColors.length, 1, THREE.RedFormat);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false;
gradientMap.needsUpdate = true;

// Models Configuration
const modelsConfig = [
    {
        id: 'horse',
        name: 'Horse',
        icon: 'fa-horse',
        modelUrl: './models/horse/horse.fbx',
        textureUrl: './models/horse/horse3dmodel_basecolor.jpg',
        scale: 10
    },
    {
        id: 'sofa',
        name: 'Sofa',
        icon: 'fa-couch',
        modelUrl: './models/sofa/sofa.fbx',
        textureUrl: './models/sofa/sofa_texture.jpg',
        scale: 12
    },
    {
        id: 'character',
        name: 'Character',
        icon: 'fa-user',
        modelUrl: './models/character/chra.fbx',
        textureMap: {
            'Body': './models/character/texture/tex_Meechu_Body_야힛.png',
            'Dress': './models/character/texture/tex_Meechu_Dress_야힛_와이어수정.png',
            'Face': './models/character/texture/tex_Meechu_Face_야힛.png',
            'Hair': './models/character/texture/tex_Meechu_Hair_야힛_와이어수정.png'
        },
        scale: 10
    }
];

function updateSceneColors(theme) {
    if (theme === 'cyberpunk') {
        scene.fog = new THREE.FogExp2(0x050510, 0.05);
        gridHelper.material.color.setHex(0xff00ff);
        ambientLight.color.setHex(0x00f2ff);
    } else {
        scene.fog = null;
        gridHelper.material.color.setHex(0x444444);
        ambientLight.color.setHex(0xffffff);
    }
}

function initThumbnails() {
    if (!thumbsContainer) return;
    thumbsContainer.innerHTML = '';
    
    modelsConfig.forEach(config => {
        const card = document.createElement('div');
        card.className = 'thumb-card';
        if (config.id === 'horse') card.classList.add('active');
        card.innerHTML = `
            <i class="fas ${config.icon}"></i>
            <span class="thumb-name">${config.name}</span>
        `;
        card.onclick = () => {
            document.querySelectorAll('.thumb-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            loadModelFromConfig(config);
            
            // Automatically enable 2D Style (Toon Mode) for Character model
            if (config.id === 'character') {
                if (!isToonMode) toggleToonMode();
            } else {
                // Return to 3D Style for other models
                if (isToonMode) toggleToonMode();
            }
        };
        thumbsContainer.appendChild(card);
    });
}

function prepareStyles(model) {
    const meshesToProcess = [];
    model.traverse((child) => {
        if (child.isMesh && child.name !== "OUTLINE" && child.name !== "WIREFRAME_OVERLAY") {
            meshesToProcess.push(child);
        }
    });

    meshesToProcess.forEach((child) => {
        if (child.material) {
            const applyTex = (mat) => {
                if (currentConfig && currentConfig.textureMap && currentConfig.loadedTextures) {
                    for (const [key, tex] of Object.entries(currentConfig.loadedTextures)) {
                        if (mat.name && mat.name.toLowerCase().includes(key.toLowerCase())) {
                            mat.map = tex;
                        } else if (!mat.name) {
                            // fallback if name is not set, we just hope it works out or skip
                        }
                    }
                } else if (currentTexture) {
                    mat.map = currentTexture;
                }
                mat.color.set(0xffffff); 
                
                if (currentConfig && currentConfig.id === 'character') {
                    mat.vertexColors = false; 
                    if (mat.map) {
                        mat.transparent = true;
                        mat.alphaTest = 0.5;
                    }
                }
                
                mat.metalness = 0.0;
                mat.roughness = 0.8; 
                mat.needsUpdate = true;
            };

            if (Array.isArray(child.material)) {
                child.material.forEach(applyTex);
            } else {
                applyTex(child.material);
            }
            originalMaterials.set(child.uuid, child.material);
        }
        
        const createToon = (mat) => {
            const toonMat = new THREE.MeshToonMaterial({
                color: 0xffffff,
                map: mat.map,
                gradientMap: gradientMap // UTS2 Cel Shading Step
            });
            
            // UTS2 Rim Lighting & Shadow Color Injection
            toonMat.userData.shadowTintColor = { value: new THREE.Color(0xa5a5c7) };
            
            toonMat.onBeforeCompile = (shader) => {
                toonMat.userData.shader = shader; // Store for dynamic updates
                shader.uniforms.rimColor = { value: new THREE.Color(0xffffff) };
                shader.uniforms.rimIntensity = { value: 0.6 };
                shader.uniforms.shadowTintColor = toonMat.userData.shadowTintColor;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <color_pars_fragment>',
                    `#include <color_pars_fragment>
                     uniform vec3 rimColor;
                     uniform float rimIntensity;
                     uniform vec3 shadowTintColor;`
                );

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <output_fragment>',
                    `
                    // Anime Shading Fix: Prevent bright lights from blowing out the base texture 
                    // This clamps the lit surface to EXACTLY the base texture color (diffuseColor.rgb)
                    // and allows the shadows to naturally darken it via the gradient map.
                    outgoingLight = min(outgoingLight, diffuseColor.rgb);

                    // --- COLORED SHADOW (MULTIPLY) INJECTION ---
                    float unlitLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
                    float litLuma = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
                    
                    // Fixed Shadow Threshold:
                    // In shadow, outgoingLight drops to ambient light levels (e.g. 75% of base texture).
                    // We check if the ratio drops below 98%.
                    float ratio = litLuma / (unlitLuma + 0.0001);
                    float isShadow = 1.0 - smoothstep(0.70, 0.98, ratio);

                    // Photoshop Multiply effect: 
                    // Enrich the base color slightly (Texture * Texture) so skin doesn't look dead
                    vec3 saturatedBase = mix(diffuseColor.rgb, diffuseColor.rgb * diffuseColor.rgb, 0.4);
                    
                    // Global anime shadow color (comes from UI Uniform)
                    vec3 shadowTint = shadowTintColor;
                    vec3 finalShadow = saturatedBase * shadowTint;

                    // Apply the colored shadow exactly where the standard shadow falls
                    outgoingLight = mix(outgoingLight, finalShadow, isShadow);
                    // --------------------------------

                    vec3 userViewDir = normalize(vViewPosition);
                    vec3 userNormal = normalize(vNormal);
                    float userRim = 1.0 - max(dot(userViewDir, userNormal), 0.0);
                    // UTS2 style sharp rim step
                    float userRimGlow = smoothstep(0.65, 0.70, userRim) * rimIntensity;
                    
                    outgoingLight += rimColor * userRimGlow;
                    
                    #include <output_fragment>
                    `
                );
            };
            
            if (currentConfig && currentConfig.id === 'character') {
                toonMat.transparent = mat.transparent;
                toonMat.alphaTest = mat.alphaTest;
                toonMat.vertexColors = mat.vertexColors;
                // Disabling toneMapping protects the 2D texture from being washed out by ACESFilmic
                toonMat.toneMapped = false;
            }
            return toonMat;
        };
        
        let toonMat;
        if (child.material && Array.isArray(child.material)) {
            toonMat = child.material.map(createToon);
        } else if (child.material) {
            toonMat = createToon(child.material);
        } else {
            toonMat = new THREE.MeshToonMaterial({ color: 0xffffff });
        }
        toonMaterials.set(child.uuid, toonMat);
        
        // UTS2-style Outline using Vertex Normal Displacement Instead of Scaling
        let existingOutline = child.children.find(c => c.name === "OUTLINE");
        if (!existingOutline) {
            const outlineMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
            outlineMat.onBeforeCompile = (shader) => {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    vec3 transformed = vec3( position );
                    transformed += normalize(objectNormal) * 0.015; // Extrude by normal
                    `
                );
            };
            const outlineMesh = new THREE.Mesh(child.geometry, outlineMat);
            outlineMesh.name = "OUTLINE";
            // Do not use outlineMesh.scale, let the shader handle the thickness evenly
            outlineMesh.visible = isToonMode;
            child.add(outlineMesh);
        }

        // Wireframe Overlay
        let existingWire = child.children.find(c => c.name === "WIREFRAME_OVERLAY");
        if (!existingWire) {
            const wireMat = new THREE.MeshBasicMaterial({ 
                color: 0x000000, 
                wireframe: true, 
                transparent: true, 
                opacity: 0.5 
            });
            const wireMesh = new THREE.Mesh(child.geometry, wireMat);
            wireMesh.name = "WIREFRAME_OVERLAY";
            wireMesh.visible = false; 
            child.add(wireMesh);
        }
    });

    // Re-apply toon if active
    if (isToonMode) {
        model.traverse(c => {
            if (c.isMesh && c.name !== "OUTLINE" && c.name !== "WIREFRAME_OVERLAY") {
                const mat = toonMaterials.get(c.uuid);
                if (mat) c.material = mat;
            }
        });
    }
}

function loadModelFromConfig(config) {
    if (loadStatus) loadStatus.innerHTML = `Loading ${config.name}...`;
    if (progressContainer) progressContainer.style.display = 'block';

    const textureLoader = new THREE.TextureLoader();
    currentConfig = config;

    const loadTextures = async () => {
        if (config.textureUrl) {
            return new Promise(resolve => {
                textureLoader.load(config.textureUrl, (tex) => {
                    tex.colorSpace = THREE.SRGBColorSpace;
                    tex.flipY = true; 
                    tex.needsUpdate = true;
                    currentTexture = tex;
                    resolve();
                });
            });
        } else if (config.textureMap) {
            currentTexture = null;
            config.loadedTextures = {};
            const promises = Object.entries(config.textureMap).map(([key, url]) => {
                return new Promise(resolve => {
                    textureLoader.load(url, (tex) => {
                        tex.colorSpace = THREE.SRGBColorSpace;
                        // FBX textures might need specific flipY depending on exports
                        tex.flipY = true;
                        tex.needsUpdate = true;
                        config.loadedTextures[key] = tex;
                        resolve();
                    });
                });
            });
            await Promise.all(promises);
            return Promise.resolve();
        } else {
            currentTexture = null;
            return Promise.resolve();
        }
    };

    loadTextures().then(() => {
        loadModel(config.modelUrl, config.scale);
    });
}

function loadModel(url, targetSize) {
    const fbxLoader = new FBXLoader();
    fbxLoader.load(url, (fbx) => {
        if (progressContainer) progressContainer.style.display = 'none';
        if (loadStatus) loadStatus.innerHTML = `3D Asset Loaded [V18]`;
        
        if (currentModel) {
            scene.remove(currentModel);
            originalMaterials.clear();
            toonMaterials.clear();
        }
        
        currentModel = fbx;
        
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = targetSize / maxDim;
        fbx.scale.set(scale, scale, scale);
        
        const newBox = new THREE.Box3().setFromObject(fbx);
        const center = newBox.getCenter(new THREE.Vector3());
        fbx.position.sub(center);
        fbx.position.y += (newBox.max.y - newBox.min.y) / 2;
        
        scene.add(fbx);
        prepareStyles(fbx);
    }, (xhr) => {
        if (xhr.lengthComputable) {
            const percent = (xhr.loaded / xhr.total) * 100;
            if (progressBar) progressBar.style.width = percent + '%';
        }
    }, (error) => {
        console.error("FBX Load Error:", error);
        if (loadStatus) loadStatus.textContent = 'Load failed.';
    });
}

function toggleToonMode() {
    isToonMode = !isToonMode;
    if (!currentModel) return;
    currentModel.traverse((child) => {
        if (child.isMesh) {
            if (child.name === "OUTLINE") {
                child.visible = isToonMode;
            } else if (child.name === "WIREFRAME_OVERLAY") {
                // Skip
            } else {
                const mat = isToonMode ? toonMaterials.get(child.uuid) : originalMaterials.get(child.uuid);
                if (mat) child.material = mat;
            }
        }
    });
    // Don't change textContent because it removes the icon! Just toggle active class.
    toonBtn.classList.toggle('active', isToonMode);

    // Turn off secondary lights in Toon Mode to prevent overlapping multiple shadow steps
    if (isLightsOn) {
        backLight.visible = !isToonMode;
        cameraLight.visible = !isToonMode;
        // Set ambient to 0.75 in toon mode so shadows distinctly trigger the custom color shadow shader threshold (<0.98)
        ambientLight.intensity = isToonMode ? 0.75 : 0.6; 
    }
    
    // Toon Mode bypasses ToneMapping globally so OutputPass preserves the pure raw texture colors exactly (no ACES darkening)
    renderer.toneMapping = isToonMode ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
}

function toggleWireframe() {
    if (!currentModel) return;
    currentModel.traverse((child) => {
        if (child.name === "WIREFRAME_OVERLAY") child.visible = !child.visible;
    });
    wireframeBtn.classList.toggle('active');
}

function toggleLights() {
    isLightsOn = !isLightsOn;
    frontLight.visible = isLightsOn;
    backLight.visible = isLightsOn && !isToonMode; 
    cameraLight.visible = isLightsOn && !isToonMode;
    // Boost ambient light when directional lights are off so the model is not completely black
    ambientLight.intensity = isLightsOn ? (isToonMode ? 0.75 : 0.6) : 1.5;
    
    if (lightsBtn) {
        // Just toggle active class, do not overwrite HTML to preserve icon
        lightsBtn.classList.toggle('active', !isLightsOn);
    }
    
    // Toggle controls panel visibility
    if (lightControlsPanel) {
        lightControlsPanel.style.opacity = isLightsOn ? "1" : "0.3";
        lightControlsPanel.style.pointerEvents = isLightsOn ? "auto" : "none";
    }
}

function updateLightPosition() {
    if (!frontLight) return;
    const h = (parseFloat(lightAngleH.value) * Math.PI) / 180;
    const v = (parseFloat(lightAngleV.value) * Math.PI) / 180;
    const radius = 10;
    const y = radius * Math.sin(v);
    const r = radius * Math.cos(v);
    const x = r * Math.sin(h);
    const z = r * Math.cos(h);
    frontLight.position.set(x, y, z);
}

// Logic moved to toggleLightPanelBtn listener at the bottom

if (colorWheelContainer && typeof iro !== 'undefined') {
    const colorPicker = new iro.ColorPicker(colorWheelContainer, {
        width: 100, // Reduced width so both can fit side-by-side
        color: "#ffffff",
        borderWidth: 1,
        borderColor: "#444"
    });

    colorPicker.on('color:change', function(color) {
        frontLight.color.set(color.hexString);
    });
    
    const shadowColorWheelContainer = document.getElementById('shadow-color-wheel-container');
    if (shadowColorWheelContainer) {
        const shadowColorPicker = new iro.ColorPicker(shadowColorWheelContainer, {
            width: 100,
            color: "#a5a5c7", // Match initial uniform uniform vec3 shadowTintColor
            borderWidth: 1,
            borderColor: "#444"
        });
        
        shadowColorPicker.on('color:change', function(color) {
            // Update all toon materials
            toonMaterials.forEach(mat => {
                if (mat.userData && mat.userData.shadowTintColor) {
                    mat.userData.shadowTintColor.value.set(color.hexString);
                }
            });
        });
    }
}

if (lightAngleH) {
    lightAngleH.addEventListener('input', updateLightPosition);
    lightAngleV.addEventListener('input', updateLightPosition);
}

resetBtn.addEventListener('click', () => controls.reset());
toonBtn.addEventListener('click', toggleToonMode);
wireframeBtn.addEventListener('click', toggleWireframe);
if (lightsBtn) lightsBtn.addEventListener('click', toggleLights);

if (toggleLightPanelBtn) {
    toggleLightPanelBtn.addEventListener('click', () => {
        const isHidden = lightControlsPanel.style.display === 'none';
        lightControlsPanel.style.display = isHidden ? 'block' : 'none';
        
        // Ensure icon stays active
        if (isHidden) toggleLightPanelBtn.classList.add('active');
        else toggleLightPanelBtn.classList.remove('active');
    });
}

if (toggleBloomBtn) {
    toggleBloomBtn.addEventListener('click', () => {
        bloomPass.enabled = !bloomPass.enabled;
        if (bloomPass.enabled) {
            toggleBloomBtn.classList.add('active');
        } else {
            toggleBloomBtn.classList.remove('active');
        }
    });
}

if (bloomIntensitySlider) {
    bloomIntensitySlider.addEventListener('input', (e) => {
        bloomPass.strength = parseFloat(e.target.value);
    });
}
if (bloomRadiusSlider) {
    bloomRadiusSlider.addEventListener('input', (e) => {
        bloomPass.radius = parseFloat(e.target.value);
    });
}
if (bloomThresholdSlider) {
    bloomThresholdSlider.addEventListener('input', (e) => {
        bloomPass.threshold = parseFloat(e.target.value);
    });
}

initThumbnails();
loadModelFromConfig(modelsConfig[0]);

function toggleOrtho() {
    isOrthographic = !isOrthographic;
    
    if (isOrthographic) {
        orthographicCamera.position.copy(perspectiveCamera.position);
        orthographicCamera.quaternion.copy(perspectiveCamera.quaternion);
        
        const distance = perspectiveCamera.position.distanceTo(controls.target);
        orthographicCamera.zoom = frustumSize / (2 * distance * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2)));
        orthographicCamera.updateProjectionMatrix();
        
        camera = orthographicCamera;
        if (orthoBtn) orthoBtn.classList.add('active');
    } else {
        perspectiveCamera.position.copy(orthographicCamera.position);
        perspectiveCamera.quaternion.copy(orthographicCamera.quaternion);
        
        const targetDistance = frustumSize / (2 * orthographicCamera.zoom * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2)));
        const dir = new THREE.Vector3().subVectors(orthographicCamera.position, controls.target).normalize();
        perspectiveCamera.position.copy(controls.target).add(dir.multiplyScalar(targetDistance));
        perspectiveCamera.updateProjectionMatrix();
        
        camera = perspectiveCamera;
        if (orthoBtn) orthoBtn.classList.remove('active');
    }
    
    controls.object = camera;
    renderPass.camera = camera;
    controls.update();
}

if (orthoBtn) orthoBtn.addEventListener('click', toggleOrtho);

window.addEventListener('resize', () => {
    const newAspect = container.clientWidth / container.clientHeight;
    
    perspectiveCamera.aspect = newAspect;
    perspectiveCamera.updateProjectionMatrix();
    
    orthographicCamera.left = -frustumSize * newAspect / 2;
    orthographicCamera.right = frustumSize * newAspect / 2;
    orthographicCamera.top = frustumSize / 2;
    orthographicCamera.bottom = -frustumSize / 2;
    orthographicCamera.updateProjectionMatrix();
    
    renderer.setSize(container.clientWidth, container.clientHeight);
    composer.setSize(container.clientWidth, container.clientHeight);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    cameraLight.position.copy(camera.position);
    composer.render();
}
animate();
updateSceneColors('minimalist');

/* --- Image Portfolio Slider Logic --- */
const portfolioSlider = document.getElementById('portfolio-slider');
if (portfolioSlider) {
    const track = document.getElementById('slider-track');
    const slides = Array.from(document.querySelectorAll('.slider-slide'));
    const nextBtn = document.getElementById('slider-next');
    const prevBtn = document.getElementById('slider-prev');
    const pagination = document.getElementById('slider-pagination');

    let currentIndex = 0;
    let isDragging = false;
    let startPos = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;
    let animationID = 0;

    // Initialize Pagination Dots
    slides.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.classList.add('pagination-dot');
        if (i === 0) dot.classList.add('active');
        dot.addEventListener('click', () => goToSlide(i));
        pagination.appendChild(dot);
    });

    const dots = Array.from(document.querySelectorAll('.pagination-dot'));

    function updateSlider() {
        currentTranslate = currentIndex * -100;
        prevTranslate = currentTranslate;
        track.style.transition = 'transform 0.7s cubic-bezier(0.19, 1, 0.22, 1)';
        track.style.transform = `translateX(${currentTranslate}%)`;
        
        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === currentIndex);
        });
        
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
        });
    }

    function goToSlide(index) {
        currentIndex = index;
        updateSlider();
    }

    function nextSlide() {
        if (currentIndex < slides.length - 1) {
            currentIndex++;
        } else {
            currentIndex = 0; // Loop back
        }
        updateSlider();
    }

    function prevSlide() {
        if (currentIndex > 0) {
            currentIndex--;
        } else {
            currentIndex = slides.length - 1; // Loop to end
        }
        updateSlider();
    }

    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);

    // Drag Logic
    portfolioSlider.addEventListener('pointerdown', touchStart);
    portfolioSlider.addEventListener('pointermove', touchMove);
    portfolioSlider.addEventListener('pointerup', touchEnd);
    portfolioSlider.addEventListener('pointerleave', touchEnd);

    // Prevent default context menu on long press
    portfolioSlider.addEventListener('contextmenu', e => e.preventDefault());

    function touchStart(e) {
        isDragging = true;
        startPos = e.clientX;
        track.style.transition = 'none'; // Instant response while dragging
        animationID = requestAnimationFrame(animation);
        portfolioSlider.style.cursor = 'grabbing';
    }

    function touchMove(e) {
        if (isDragging) {
            const currentPosition = e.clientX;
            const diff = currentPosition - startPos;
            const moveFactor = (diff / portfolioSlider.offsetWidth) * 100;
            currentTranslate = prevTranslate + moveFactor;
        }
    }

    function touchEnd() {
        if (!isDragging) return;
        isDragging = false;
        cancelAnimationFrame(animationID);
        portfolioSlider.style.cursor = 'grab';
        
        const movedBy = currentTranslate - prevTranslate;
        
        // Threshold for swiping (10% of width)
        if (movedBy < -10 && currentIndex < slides.length - 1) currentIndex += 1;
        else if (movedBy > 10 && currentIndex > 0) currentIndex -= 1;
        
        updateSlider();
    }

    function animation() {
        if (isDragging) {
            track.style.transform = `translateX(${currentTranslate}%)`;
            requestAnimationFrame(animation);
        }
    }

    // Keyboard Navigation
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') prevSlide();
        if (e.key === 'ArrowRight') nextSlide();
    });
}

// Modal Logic
const modal = document.getElementById('image-modal');
const modalImg = document.getElementById('modal-img');
const captionText = document.getElementById('modal-caption');
const closeModal = document.getElementById('modal-close');

if (modal && modalImg && closeModal) {
    document.querySelectorAll('.clickable-img').forEach(img => {
        img.onclick = function() {
            modal.style.display = "block";
            modalImg.src = this.src;
            captionText.innerHTML = this.alt;
            document.body.style.overflow = "hidden"; // Prevent scroll
        }
    });

    closeModal.onclick = function() {
        modal.style.display = "none";
        document.body.style.overflow = "auto";
    }

    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            modal.style.display = "none";
            document.body.style.overflow = "auto";
        }
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === "block") {
            modal.style.display = "none";
            document.body.style.overflow = "auto";
        }
    });
}
