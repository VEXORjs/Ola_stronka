'use client';

import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef} from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";

export default function TDF_InteractiveFlower(props) {
    const {
        petalColor = "#3a64ff",
        innerGlowColor = "#ff82f3",
        stamenColor = "#ffcc44",
        stemColor = "#0a2a0a",
        backgroundColor = "#08080c",
        bloomStrength = 50,
        petalCount = 8,
        flowerScale = 100,
        petalLength = 50,
        stemLength = 100,
        style
    } = props;

    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const isStatic = false; // In Next.js always interactive

    useEffect(() => {
        if (!containerRef.current) return;
        const engine = new FlowerEngine(containerRef.current, {
            petalColor, innerGlowColor, stamenColor, stemColor,
            backgroundColor, bloomStrength, petalCount,
            flowerScale, petalLength, stemLength
        });
        engineRef.current = engine;
        engine.start(isStatic);

        return () => engine.dispose();
    }, []);

    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.update(props, isStatic);
        }
    }, [
        petalColor, innerGlowColor, stamenColor, stemColor,
        backgroundColor, bloomStrength, petalCount,
        flowerScale, petalLength, stemLength
    ]);

    return _jsx("div", {
        ref: containerRef,
        style: {
            ...style,
            width: "100%",
            height: "100%",
            background: backgroundColor,
            overflow: "hidden",
            touchAction: "none"
        }
    });
}

// ============================================================================
// ENGINE
// ============================================================================
class FlowerEngine {
    scene; camera; renderer; composer; bloomPass; flower;
    container; clock; rafId = 0;
    mouse = new THREE.Vector2(-99, -99);
    raycaster = new THREE.Raycaster();
    resizeObserver;
    isStatic = false;

    constructor(container, params) {
        this.container = container;
        this.clock = new THREE.Timer();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
        this.camera.position.set(0, 2, 8);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        THREE.ColorManagement.enabled = true;
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.3;
        container.appendChild(this.renderer.domElement);

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(container.clientWidth, container.clientHeight),
            (params.bloomStrength ?? 50) / 200,
            1,
            0.1
        );
        this.composer.addPass(this.bloomPass);

        this.flower = new FlowerGroup(this.scene, params);

        this._onResize = this._onResize.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this.resizeObserver = new ResizeObserver(() => this._onResize());
        this.resizeObserver.observe(container);
        container.addEventListener("mousemove", this._onMouseMove);
    }

    _onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        if (this.isStatic) this.renderFrame(this.clock.getElapsed(), new THREE.Vector3(0, 0, 0));
    }

    _onMouseMove(e) {
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    update(params, isStatic) {
        this.isStatic = isStatic;
        this.bloomPass.strength = (params.bloomStrength ?? 50) / 200;
        this.renderer.setClearColor(params.backgroundColor, 1);
        this.flower.updateParams(params);
        this.flower.setScale((params.flowerScale || 100) / 100);
        if (this.isStatic) this.renderFrame(0, new THREE.Vector3(0, 0, 0));
    }

    renderFrame(t, hit) {
        this.flower.animate(t, hit);
        const orbitRadius = 8;
        this.camera.position.x = Math.sin(t * 0.12) * orbitRadius * 0.15;
        this.camera.position.z = orbitRadius;
        this.camera.position.y = 2 + Math.sin(t * 0.08) * 0.3;
        this.camera.lookAt(0, 0.5, 0);
        this.composer.render();
    }

    start(isStatic) {
        this.isStatic = isStatic;
        if (this.isStatic) {
            this.renderFrame(0, new THREE.Vector3(0, 0, 0));
            return;
        }
        const tick = () => {
            const t = this.clock.getElapsed();
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
            const hit = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(plane, hit);
            this.renderFrame(t, hit);
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    dispose() {
        cancelAnimationFrame(this.rafId);
        this.resizeObserver.disconnect();
        this.container.removeEventListener("mousemove", this._onMouseMove);
        this.renderer.dispose();
        this.flower.dispose();
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}

// ============================================================================
// FLOWER GROUP
// ============================================================================
class FlowerGroup {
    root; petals = []; stamen; stemMesh; stemCurve; scene; headGroup;
    currentPetalCount = 8;

    constructor(scene, params) {
        this.scene = scene;
        this.currentPetalCount = params.petalCount || 8;
        this.root = new THREE.Group();
        scene.add(this.root);

        this.headGroup = new THREE.Group();
        this.root.add(this.headGroup);

        const stemColor = params.stemColor || "#0a2a0a";
        const points = [
            new THREE.Vector3(0, -6.5, 0),
            new THREE.Vector3(0.1, -5, 0.05),
            new THREE.Vector3(-0.05, -3.5, -0.03),
            new THREE.Vector3(0.08, -1.5, 0.02),
            new THREE.Vector3(0, 0.2, 0)
        ];
        this.stemCurve = new THREE.CatmullRomCurve3(points);
        this.stemMesh = this.makeStem(stemColor);
        this.root.add(this.stemMesh);

        this.stamen = new StamenCluster(this.headGroup, params.stamenColor || params.innerGlowColor);
        this.buildPetals(params);
        this.updateParams(params);
    }

    makeStem(color) {
        const geo = new THREE.TubeGeometry(this.stemCurve, 128, 0.06, 20, false);
        const mat = new THREE.ShaderMaterial({
            uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
            vertexShader: STEM_VERT,
            fragmentShader: STEM_FRAG,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        return new THREE.Mesh(geo, mat);
    }

    buildPetals(params) {
        this.petals.forEach(p => p.dispose());
        this.petals = [];
        const layers = 4;
        const perLayer = params.petalCount || 8;
        for (let layer = 0; layer < layers; layer++) {
            const countInLayer = perLayer - layer;
            const angleOffset = (layer * Math.PI) / perLayer;
            const tiltRad = (25 + layer * 18) * (Math.PI / 180);
            const petalScale = 0.7 + layer * 0.25;
            for (let i = 0; i < countInLayer; i++) {
                const yawAngle = (i / countInLayer) * Math.PI * 2 + angleOffset;
                const petal = new PetalUnit(this.headGroup, yawAngle, tiltRad, petalScale, layer, params);
                this.petals.push(petal);
            }
        }
    }

    animate(time, mouseWorld) {
        this.petals.forEach(p => p.animate(time, mouseWorld));
        this.stamen.animate(time);
        if (this.stemMesh.material.uniforms) this.stemMesh.material.uniforms.uTime.value = time;
        this.root.rotation.z = Math.sin(time * 0.4) * 0.025;
        this.root.rotation.x = Math.cos(time * 0.3) * 0.015;
    }

    updateParams(params) {
        if ((params.petalCount || 8) !== this.currentPetalCount) {
            this.currentPetalCount = params.petalCount || 8;
            this.buildPetals(params);
        }
        this.stamen.updateColor(params.stamenColor || params.innerGlowColor);
        this.petals.forEach(p => p.updateProps(params));

        const sLen = (params.stemLength ?? 100) / 100;
        this.stemMesh.scale.y = sLen;
        this.headGroup.position.set(0, -6.5 + 6.7 * sLen, 0);
        if (this.stemMesh.material.uniforms) {
            this.stemMesh.material.uniforms.uColor.value.set(params.stemColor || "#0a2a0a");
        }
    }

    setScale(s) { this.root.scale.set(s, s, s); }
    dispose() {
        this.petals.forEach(p => p.dispose());
        this.stamen.dispose();
        this.scene.remove(this.root);
    }
}

// ============================================================================
// PETAL UNIT
// ============================================================================
class PetalUnit {
    mesh; pivot; material; phase; baseTilt; baseYaw; petalHeight;
    springTilt = 0; springTwist = 0; velTilt = 0; velTwist = 0; tipLocal;

    constructor(parent, yawAngle, tiltRad, scale, layer, params) {
        this.phase = Math.random() * Math.PI * 2;
        this.baseTilt = tiltRad;
        this.baseYaw = yawAngle;

        this.pivot = new THREE.Group();
        this.pivot.rotation.order = "YXZ";
        this.pivot.rotation.y = yawAngle;
        this.pivot.rotation.x = -tiltRad;
        parent.add(this.pivot);

        const petalWidth = 1 * scale;
        this.petalHeight = 3.5 * scale;
        const geo = new THREE.PlaneGeometry(petalWidth, this.petalHeight, 24, 48);
        geo.translate(0, this.petalHeight / 2, 0);
        this.tipLocal = new THREE.Vector3(0, this.petalHeight, 0);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(params.petalColor) },
                uInnerColor: { value: new THREE.Color(params.innerGlowColor) },
                uTime: { value: 0 },
                uLayer: { value: layer },
                uSpring: { value: 0 }
            },
            vertexShader: PETAL_VERT,
            fragmentShader: PETAL_FRAG,
            transparent: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.mesh = new THREE.Mesh(geo, this.material);
        this.pivot.add(this.mesh);
    }

    animate(time, mouseWorld) {
        this.material.uniforms.uTime.value = time;
        const tipWorld = this.tipLocal.clone();
        this.mesh.localToWorld(tipWorld);

        const dx = tipWorld.x - mouseWorld.x;
        const dy = tipWorld.y - mouseWorld.y;
        const dz = tipWorld.z - mouseWorld.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const influence = Math.exp(-(dist * dist) / 6);

        const targetTilt = influence * (dist > 0.01 ? dy / dist : 0) * 0.4;
        const targetTwist = influence * (dist > 0.01 ? dx / dist : 0) * 0.4;

        this.velTilt += (targetTilt - this.springTilt) * 0.12;
        this.velTilt *= 0.85;
        this.springTilt += this.velTilt;

        this.velTwist += (targetTwist - this.springTwist) * 0.12;
        this.velTwist *= 0.85;
        this.springTwist += this.velTwist;

        this.pivot.rotation.x = -this.baseTilt + Math.sin(time * 0.7 + this.phase) * 0.03 + this.springTilt;
        this.pivot.rotation.z = this.springTwist;
        this.material.uniforms.uSpring.value = influence * 0.3;
    }

    updateProps(params) {
        this.material.uniforms.uColor.value.set(params.petalColor);
        this.material.uniforms.uInnerColor.value.set(params.innerGlowColor);
        const L = 0.5 + (params.petalLength ?? 50) / 100;
        this.mesh.scale.y = L;
        this.tipLocal.set(0, this.petalHeight * L, 0);
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.material.dispose();
        this.pivot.parent?.remove(this.pivot);
    }
}

// ============================================================================
// STAMEN CLUSTER
// ============================================================================
class StamenCluster {
    group; fibers = [];
    constructor(parent, color) {
        this.group = new THREE.Group();
        this.group.position.y = 0.1;
        parent.add(this.group);
        const count = 200;
        const geo = new THREE.CapsuleGeometry(0.006, 0.9, 4, 8);
        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending });
            const m = new THREE.Mesh(geo, mat);
            const r = Math.sqrt(i / count) * 0.35;
            const a = i * 2.39996;
            m.position.set(Math.cos(a) * r, Math.random() * 0.25, Math.sin(a) * r);
            m.rotation.set((Math.random() - 0.5) * 0.3, a, (Math.random() - 0.5) * 0.3);
            this.fibers.push(m);
            this.group.add(m);
        }
    }
    animate(time) {
        this.fibers.forEach((f, i) => { f.scale.y = 1 + Math.sin(time * 4 + i * 0.08) * 0.35; });
    }
    updateColor(color) { this.fibers.forEach(f => f.material.color.set(color)); }
    dispose() {
        if (this.fibers.length > 0) this.fibers[0].geometry.dispose();
        this.fibers.forEach(f => f.material.dispose());
        this.group.parent?.remove(this.group);
    }
}

// ============================================================================
// SHADERS
// ============================================================================
const PETAL_VERT = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    uniform float uTime;
    uniform float uLayer;
    uniform float uSpring;
    void main() {
        vUv = uv;
        vec3 pos = position;
        pos.z += pos.x * pos.x * (1.2 - uLayer * 0.15);
        pos.z += pow(vUv.y, 3.0) * 0.4;
        pos.z += uSpring * smoothstep(0.1, 0.9, vUv.y);
        pos.x += sin(uTime * 1.2 + pos.y * 2.0) * 0.02 * vUv.y;
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

const PETAL_FRAG = `
    uniform vec3 uColor;
    uniform vec3 uInnerColor;
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    float petalSDF(vec2 p) {
        p.x = abs(p.x);
        return max(length(p - vec2(0.55, 0.45)) - 0.72, length(p - vec2(-0.55, 0.45)) - 0.72);
    }
    void main() {
        float d = petalSDF(vUv - vec2(0.5, 0.0));
        if (d > 0.0) discard;
        float dotNV = dot(vNormal, vViewDir);
        float fresnel = pow(1.0 - abs(dotNV), 2.5);
        vec3 col = mix(uInnerColor * 2.5, uColor, pow(vUv.y, 0.65));
        col *= (fresnel * 3.0 + (1.0 - abs(dotNV)) * 0.6 + 0.25);
        gl_FragColor = vec4(col, (fresnel * 1.6 + (1.0 - abs(dotNV)) * 0.4) * smoothstep(0.0, -0.04, d) * smoothstep(0.0, 0.12, vUv.y));
    }
`;

const STEM_VERT = `
    varying vec2 vUv;
    varying float vY;
    uniform float uTime;
    void main() {
        vUv = uv;
        vec3 pos = position;
        float influence = smoothstep(-6.5, 0.0, pos.y);
        pos.x += sin(uTime * 0.8 + pos.y * 0.5) * 0.15 * influence;
        pos.z += cos(uTime * 0.6 + pos.y * 0.4) * 0.1 * influence;
        vY = pos.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

const STEM_FRAG = `
    uniform vec3 uColor;
    varying float vY;
    void main() {
        gl_FragColor = vec4(uColor * 1.2, smoothstep(0.2, -0.2, vY));
    }
`;
