import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.1/examples/jsm/controls/OrbitControls.js"


let scene, camera, renderer, controls;
let gridSize = 60;
let spacing = 1.5;
let rowHeight;
let particles = [];
let springs = [];
let indexMap = new Map();
let mesh, geometry;
let stiffness = 1.0;
let damping = 0.5;
let indexCounter = 0;
let masses = [];
let massMeshes = [];

init();
animate();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  const zoom = 60;
  camera.position.set(
    0,
    -zoom * Math.cos(Math.PI / 4),
    zoom * Math.sin(Math.PI / 4)
  );
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer();
  const angleSlider = document.getElementById("angleSlider");
  const angleVal = document.getElementById("angleVal");

  angleSlider.addEventListener("input", () => {
    const angle = parseFloat(angleSlider.value);
    angleVal.textContent = angle;
    const zoom = camera.position.length();
    const rad = (angle * Math.PI) / 180;
    camera.position.set(0, -zoom * Math.cos(rad), zoom * Math.sin(rad));
    camera.lookAt(0, 0, 0);
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.enableRotate = true;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  document.getElementById("setupButton").onclick = setup;
  document.getElementById("resetButton").onclick = () =>
    window.location.reload();

  document.getElementById("stiffnessSlider").oninput = (e) => {
    stiffness = parseFloat(e.target.value);
    document.getElementById("stiffnessVal").textContent = stiffness.toFixed(2);
  };

  document.getElementById("dampingSlider").oninput = (e) => {
    damping = parseFloat(e.target.value);
    document.getElementById("dampingVal").textContent = damping.toFixed(2);
  };

  document.getElementById("gridSizeSlider").oninput = (e) => {
    gridSize = parseInt(e.target.value);
    document.getElementById("gridSizeVal").textContent = gridSize;
  };

  renderer.domElement.addEventListener("click", (e) => {
    if (!mesh) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(mesh);
    if (intersects.length > 0) {
      const point = intersects[0].point.clone();
      masses.push({ point: point, radius: 5 });

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff3333 })
      );
      sphere.position.copy(point);
      massMeshes.push({ mesh: sphere, center: point });
      scene.add(sphere);
    }
  });
}

function animate() {
  requestAnimationFrame(animate);
  if (!geometry) return;

  for (const p of particles) {
    if (!p || p.fixed) continue;
    const temp = p.pos.clone();
    const velocity = p.pos.clone().sub(p.prev).multiplyScalar(damping);
    p.pos.add(velocity);
    p.prev = temp;
  }

  for (const { i, j, rest } of springs) {
    const p1 = particles[i],
      p2 = particles[j];
    const diff = p2.pos.clone().sub(p1.pos);
    const dist = diff.length();
    const offset = diff.multiplyScalar(
      ((dist - rest) / dist) * 0.5 * stiffness
    );
    if (!p1.fixed) p1.pos.add(offset);
    if (!p2.fixed) p2.pos.sub(offset);
  }

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    geometry.attributes.position.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
  }
  geometry.attributes.position.needsUpdate = true;

  const influenceSlider = document.getElementById("influenceSlider");
  const influenceVal = document.getElementById("influenceVal");
  let influenceRadius = parseFloat(influenceSlider.value);
  influenceSlider.addEventListener("input", () => {
    influenceRadius = parseFloat(influenceSlider.value);
    influenceVal.textContent = influenceRadius;
  });

  for (let idx = 0; idx < masses.length; idx++) {
    const m = masses[idx];
    for (const p of particles) {
      const dist = p.pos.distanceTo(m.point);
      if (dist < influenceRadius) {
        p.pos.z -= 2 * Math.exp((-dist * dist) / (influenceRadius * 1.5));
      }
    }
    const closest = particles.reduce((a, b) =>
      !b
        ? a
        : !a
        ? b
        : a.pos.distanceTo(m.point) < b.pos.distanceTo(m.point)
        ? a
        : b
    );
    massMeshes[idx].mesh.position.set(m.point.x, m.point.y, closest.pos.z + 1);
  }

  controls.update();
  renderer.render(scene, camera);
}

function setup() {
  if (mesh) scene.remove(mesh);
  particles = [];
  springs = [];
  indexMap.clear();
  indexCounter = 0;

  spacing = 1.5;
  rowHeight = (Math.sqrt(3) * spacing) / 2;
  const hexRadius = gridSize / 2 - 1;
  const centerX = Math.floor(gridSize / 2);
  const centerY = Math.floor(gridSize / 2);

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const offsetX = y % 2 === 0 ? 0 : spacing / 2;
      const px = x * spacing + offsetX - (gridSize * spacing) / 2;
      const py = y * rowHeight - (gridSize * rowHeight) / 2;

      const col = x - centerX;
      const row = y - centerY;
      const q = col - Math.floor(row / 2);
      const r = row;
      const s = -q - r;

      const inHex =
        Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= hexRadius;
      if (!inHex) continue;

      const isEdge =
        Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === hexRadius;

      particles.push({
        pos: new THREE.Vector3(px, py, 0),
        prev: new THREE.Vector3(px, py, 0),
        fixed: isEdge,
      });
      indexMap.set(`${x},${y}`, indexCounter++);
    }
  }

  const getIndex = (x, y) => indexMap.get(`${x},${y}`);
  const positions = particles.flatMap((p) => [p.pos.x, p.pos.y, p.pos.z]);
  const indices = [];

  for (let y = 0; y < gridSize - 1; y++) {
    for (let x = 0; x < gridSize - 1; x++) {
      const a = getIndex(x, y);
      const b = getIndex(x + 1, y);
      const c = getIndex(x, y + 1);
      const d = getIndex(x + 1, y + 1);
      if ([a, b, c, d].some((i) => i === undefined)) continue;
      if (y % 2 === 0) {
        indices.push(a, b, c);
        indices.push(b, d, c);
      } else {
        indices.push(a, d, c);
        indices.push(a, b, d);
      }
    }
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x88ccee, wireframe: true })
  );
  scene.add(mesh);

  const neighborOffsetsEven = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
  ];
  const neighborOffsetsOdd = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const i = getIndex(x, y);
      if (i === undefined) continue;
      const offsets = y % 2 === 0 ? neighborOffsetsEven : neighborOffsetsOdd;
      for (const [dx, dy] of offsets) {
        const j = getIndex(x + dx, y + dy);
        if (j === undefined) continue;
        if (
          !springs.some(
            (s) => (s.i === i && s.j === j) || (s.i === j && s.j === i)
          )
        ) {
          const rest = particles[i].pos.distanceTo(particles[j].pos);
          springs.push({ i, j, rest });
        }
      }
    }
  }
}

// Activer rotation uniquement si ALT + clic milieu
renderer.domElement.addEventListener("mousedown", (event) => {
  if (event.altKey && event.button === 1) {
    controls.enableRotate = true;
  } else {
    controls.enableRotate = false;
  }
});
