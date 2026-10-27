// three.js stage — light "lab" theme.
//  - live 3D hand mirror built from the 21 landmarks streamed by the backend
//  - extruded letter pops on every committed letter + particle burst
//  - soft blueprint grid floor, ambient particles, orbit + gentle auto-rotate

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { HAND_CONNECTIONS } from "./constants.js";

const UP = new THREE.Vector3(0, 1, 0);
const HAND_SCALE = 3.2;
const FLOOR_Y = -1.75;

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xeef2f7, 9, 18);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 0.45, 4.8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 9;
    this.controls.maxPolarAngle = Math.PI * 0.72;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.addEventListener("start", () => { this.controls.autoRotate = false; });

    this._lights();
    this._floor();
    this._hand();
    this._particles();
    this._burst();

    this._letters = [];
    this._pendingLetters = [];
    this._font = null;
    this._handVisible = false;
    this._handAlpha = 0;
    this._pulse = 0;
    this.mirrored = true;

    new FontLoader().load(
      "vendor/three/fonts/helvetiker_regular.typeface.json",
      (font) => {
        this._font = font;
        const queued = this._pendingLetters.splice(0);
        queued.forEach((ch) => this._spawn(ch));
      },
      undefined,
      () => console.warn("[scene3d] font failed to load — letter pops disabled")
    );

    this._clock = new THREE.Clock();
    const ro = new ResizeObserver(() => this._resize());
    ro.observe(canvas.parentElement);
    this._resize();

    this._tick = this._tick.bind(this);
    this.renderer.setAnimationLoop(this._tick);
  }

  // ------------------------------------------------------------------ #
  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdbe3ec, 1.15));

    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(2.6, 5.2, 4.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -3.4;
    sun.shadow.camera.right = 3.4;
    sun.shadow.camera.top = 3.4;
    sun.shadow.camera.bottom = -3.4;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 14;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xe0e7ff, 0.5);
    fill.position.set(-3, 2, -3);
    this.scene.add(fill);
  }

  _floor() {
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.ShadowMaterial({ opacity: 0.16 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = FLOOR_Y - 0.001;
    shadowPlane.receiveShadow = true;
    this.scene.add(shadowPlane);

    const grid = new THREE.GridHelper(14, 28, 0xc7d2e0, 0xe3e9f2);
    grid.position.y = FLOOR_Y;
    this.scene.add(grid);
  }

  _hand() {
    this.handGroup = new THREE.Group();
    this.handGroup.visible = false;

    this.jointMat = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
      opacity: 0,
    });
    this.boneMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.6,
      metalness: 0.05,
      transparent: true,
      opacity: 0,
    });

    const jointGeo = new THREE.SphereGeometry(0.055, 20, 14);
    this.joints = [];
    for (let i = 0; i < 21; i++) {
      const joint = new THREE.Mesh(jointGeo, this.jointMat);
      joint.castShadow = true;
      this.handGroup.add(joint);
      this.joints.push(joint);
    }

    const boneGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 8);
    this.bones = [];
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const bone = new THREE.Mesh(boneGeo, this.boneMat);
      bone.castShadow = true;
      this.handGroup.add(bone);
      this.bones.push(bone);
    }

    this.scene.add(this.handGroup);
    this._targets = Array.from({ length: 21 }, () => new THREE.Vector3());
  }

  _particles() {
    const COUNT = 150;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 1] = Math.random() * 4.2 - 1.7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this._particleMat = new THREE.PointsMaterial({
      size: 0.045,
      color: 0xaab8cc,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this._particles = new THREE.Points(geo, this._particleMat);
    this._particles.frustumCulled = false;
    this.scene.add(this._particles);
  }

  _burst() {
    this._burstCount = 80;
    this._burstVel = new Float32Array(this._burstCount * 3);
    const positions = new Float32Array(this._burstCount * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this._burstMat = new THREE.PointsMaterial({
      size: 0.06,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0x6366f1,
    });
    this._burstPoints = new THREE.Points(geo, this._burstMat);
    this._burstPoints.frustumCulled = false;
    this.scene.add(this._burstPoints);
    this._burstAge = 99;
  }

  // ------------------------------------------------------------------ #
  /** Flip the hand mirror horizontally (matches the preview mode). */
  setMirrored(mirrored) {
    this.mirrored = !!mirrored;
  }

  /** Called for every server frame. */
  update(msg) {
    if (msg.hand && msg.landmarks && msg.landmarks.length === 21) {
      for (let i = 0; i < 21; i++) {
        const [x, y, z] = msg.landmarks[i];
        const mx = this.mirrored ? 0.5 - x : x - 0.5; // follow the preview
        this._targets[i].set(
          mx * HAND_SCALE,
          (0.5 - y) * HAND_SCALE,
          -z * HAND_SCALE * 0.9
        );
      }
      this._handVisible = true;
      this._pulse = 1;
    } else {
      this._handVisible = false;
    }
  }

  /** Fired once per committed letter (from the stabilizer). */
  spawnLetter(ch) {
    if (!this._font) {
      this._pendingLetters.push(ch);
      return;
    }
    this._spawn(ch);
  }

  _spawn(ch) {
    const hue = ((((ch.charCodeAt(0) - 65) % 26) + 26) % 26) / 26 * 360;
    const geo = new TextGeometry(ch, {
      font: this._font,
      size: 1.45,
      depth: 0.3,   // three >= r163
      height: 0.3,  // drei/three < r163 fallback — unknown keys are ignored
      curveSegments: 10,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelSegments: 4,
    });
    geo.center();

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(`hsl(${hue.toFixed(0)}, 58%, 42%)`),
      roughness: 0.32,
      metalness: 0.14,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.set(0, -0.55, 0.5);
    mesh.scale.setScalar(0.15);
    this.scene.add(mesh);

    this._letters.push({ mesh, mat, age: 0, life: 1.7 });
    this._triggerBurst(new THREE.Color(`hsl(${hue.toFixed(0)}, 70%, 55%)`));
  }

  _triggerBurst(color) {
    const positions = this._burstPoints.geometry.attributes.position.array;
    for (let i = 0; i < this._burstCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -0.3;
      positions[i * 3 + 2] = 0.5;
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize().multiplyScalar(0.9 + Math.random() * 1.2);
      this._burstVel[i * 3] = dir.x;
      this._burstVel[i * 3 + 1] = dir.y + 0.6;
      this._burstVel[i * 3 + 2] = dir.z;
    }
    this._burstMat.color.copy(color);
    this._burstPoints.geometry.attributes.position.needsUpdate = true;
    this._burstAge = 0;
  }

  // ------------------------------------------------------------------ #
  _resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth || 1;
    const h = parent.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _tick() {
    const dt = Math.min(this._clock.getDelta(), 0.05);

    // hand alpha + joint smoothing
    const targetAlpha = this._handVisible ? 1 : 0;
    this._handAlpha += (targetAlpha - this._handAlpha) * Math.min(1, dt * 8);
    const alpha = this._handAlpha;
    this.handGroup.visible = alpha > 0.02;
    this.jointMat.opacity = alpha;
    this.boneMat.opacity = alpha * 0.85;

    if (this.handGroup.visible) {
      const k = Math.min(1, dt * 14);
      for (let i = 0; i < 21; i++) this.joints[i].position.lerp(this._targets[i], k);

      for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
        const [ia, ib] = HAND_CONNECTIONS[i];
        const a = this.joints[ia].position;
        const b = this.joints[ib].position;
        const bone = this.bones[i];
        bone.position.copy(a).add(b).multiplyScalar(0.5);
        const dir = b.clone().sub(a);
        const len = dir.length() || 1e-4;
        bone.scale.set(1, len, 1);
        bone.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
      }
    }

    // recognition pulse on the joints
    this._pulse *= Math.pow(0.02, dt);
    this.jointMat.emissiveIntensity = 0.3 + 0.9 * this._pulse * (this._handVisible ? 1 : 0);

    // letter pops
    for (let i = this._letters.length - 1; i >= 0; i--) {
      const letter = this._letters[i];
      letter.age += dt;
      const t = letter.age / letter.life;
      if (t >= 1) {
        this.scene.remove(letter.mesh);
        letter.mesh.geometry.dispose();
        letter.mat.dispose();
        this._letters.splice(i, 1);
        continue;
      }
      const grow = Math.min(1, t * 3);
      letter.mesh.scale.setScalar(0.15 + 1.05 * (1 - Math.pow(1 - grow, 3)));
      letter.mat.opacity = t < 0.12 ? t / 0.12 : 1 - Math.max(0, (t - 0.55) / 0.45);
      letter.mesh.position.y = -0.55 + t * 1.9;
      letter.mesh.rotation.y += dt * 1.1;
    }

    // ambient particle drift
    const pp = this._particles.geometry.attributes.position.array;
    for (let i = 0; i < pp.length; i += 3) {
      pp[i + 1] += dt * 0.08;
      if (pp[i + 1] > 2.6) pp[i + 1] = FLOOR_Y;
    }
    this._particles.geometry.attributes.position.needsUpdate = true;

    // commit burst
    if (this._burstAge < 0.9) {
      this._burstAge += dt;
      const bp = this._burstPoints.geometry.attributes.position.array;
      for (let i = 0; i < this._burstCount; i++) {
        bp[i * 3] += this._burstVel[i * 3] * dt;
        this._burstVel[i * 3 + 1] -= 2.4 * dt;
        bp[i * 3 + 1] += this._burstVel[i * 3 + 1] * dt;
        bp[i * 3 + 2] += this._burstVel[i * 3 + 2] * dt;
      }
      this._burstPoints.geometry.attributes.position.needsUpdate = true;
      this._burstMat.opacity = Math.max(0, 1 - this._burstAge / 0.9);
    } else {
      this._burstMat.opacity = 0;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
