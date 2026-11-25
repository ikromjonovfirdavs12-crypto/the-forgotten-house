import * as THREE from 'three';

const game = document.querySelector('#game');
const hud = document.querySelector('#hud');
const menu = document.querySelector('#menu');
const pause = document.querySelector('#pause');
const interactionHint = document.querySelector('#interaction');
const notification = document.querySelector('#notification');
const batteryBar = document.querySelector('#battery-bar');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090b0d);
scene.fog = new THREE.FogExp2(0x090b0d, 0.018);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 100);
camera.position.set(0, 1.65, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
game.appendChild(renderer.domElement);

const ambient = new THREE.HemisphereLight(0x7c90aa, 0x16100b, 0.16);
scene.add(ambient);

const moon = new THREE.DirectionalLight(0x9cb6d4, 0.7);
moon.position.set(-8, 12, 6);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
scene.add(moon);

const flashlight = new THREE.SpotLight(0xffdfad, 3.5, 18, Math.PI / 7.5, 0.42, 1.5);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(512, 512);
scene.add(flashlight, flashlight.target);

const player = { position: camera.position, height: 1.65, radius: 0.32, velocity: new THREE.Vector3(), keys: {}, yaw: 0, pitch: 0, battery: 100, flashlightOn: true, grounded: true, inventory: [] };
const colliders = [];
const interactables = [];
let activeInteractable = null;
let started = false;
let paused = false;

function mat(color, roughness = 0.85, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(name, size, position, material, collision = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collision) colliders.push(mesh);
  return mesh;
}

// House shell
const wallMat = mat(0x3e3a34, 0.98);
const floorMat = mat(0x29231d, 0.92);
box('floor', [18, 0.18, 22], [0, -0.09, 0], floorMat);
box('ceiling', [18, 0.15, 22], [0, 4.25, 0], mat(0x24201c));
box('back wall', [18, 4.2, 0.2], [0, 2.1, -11], wallMat);
box('left wall', [0.2, 4.2, 22], [-9, 2.1, 0], wallMat);
box('right wall', [0.2, 4.2, 22], [9, 2.1, 0], wallMat);
box('front wall L', [5.5, 4.2, 0.2], [-6.25, 2.1, 11], wallMat);
box('front wall R', [5.5, 4.2, 0.2], [6.25, 2.1, 11], wallMat);
box('front lintel', [7, 1.4, 0.2], [0, 3.5, 11], wallMat);

// Corridors and room walls
box('hall divider', [0.18, 4.2, 9], [-3.2, 2.1, 6.5], wallMat);
box('living divider', [5.8, 4.2, 0.18], [-6.1, 2.1, 2], wallMat);
box('living opening L', [1.2, 1, 0.18], [-2.9, 0.5, 2], wallMat);
box('kitchen divider', [5.8, 4.2, 0.18], [6.1, 2.1, 2], wallMat);
box('back bedroom divider', [0.18, 4.2, 7], [3.2, 2.1, -7.5], wallMat);

// Doorways / usable doors
function makeDoor(x, z, ry = 0, id = 'door') {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, z);
  pivot.rotation.y = ry;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.15, 0.12), mat(0x30261d, 0.72));
  door.position.set(-0.9, 1.575, 0);
  door.castShadow = true;
  pivot.add(door);
  scene.add(pivot);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mat(0x8b8063, 0.35, 0.7));
  knob.position.set(-1.55, 1.55, 0.09);
  pivot.add(knob);
  pivot.userData = { id, open: false, busy: false, homeRotation: ry, door };
  interactables.push(pivot);
  colliders.push(door);
  return pivot;
}

const frontDoor = makeDoor(0, 10.72, 0, 'frontDoor');
const kitchenDoor = makeDoor(-3.1, 2, Math.PI / 2, 'kitchenDoor');

// Furniture
function table(x, z) {
  box('table', [2.2, 0.12, 1.25], [x, 0.92, z], mat(0x4b3322));
  box('table leg', [0.12, 0.9, 0.12], [x - 0.86, 0.45, z - 0.48], mat(0x27190f));
  box('table leg', [0.12, 0.9, 0.12], [x + 0.86, 0.45, z - 0.48], mat(0x27190f));
  box('table leg', [0.12, 0.9, 0.12], [x - 0.86, 0.45, z + 0.48], mat(0x27190f));
  box('table leg', [0.12, 0.9, 0.12], [x + 0.86, 0.45, z + 0.48], mat(0x27190f));
}
table(-6.2, -3);
box('sofa', [3.4, 0.75, 1.25], [-6.5, 0.38, 5], mat(0x24283a, 0.95));
box('cabinet', [2.2, 2.1, 0.55], [6.8, 1.05, -8.5], mat(0x453326, 0.8));

// Window glow
const window = box('window', [2.4, 1.7, 0.08], [-8.88, 2.3, 6.5], mat(0x9db3c1, 0.2, 0.1), false);
const coldWindow = new THREE.PointLight(0x91b2c9, 0.8, 12);
coldWindow.position.set(-8.2, 2.3, 6.5);
scene.add(coldWindow);

// Collectible key
const key = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16), mat(0xa99a64, 0.25, 0.8));
key.position.set(6.3, 1.1, -8.5);
key.rotation.x = Math.PI / 2;
key.userData = { id: 'brassKey', label: 'Pick up brass key' };
scene.add(key);
interactables.push(key);

// Note
box('radio', [0.9, 0.45, 0.55], [5.5, 0.23, -1], mat(0x282624, 0.65, 0.15), false);
const note = box('note', [0.48, 0.035, 0.32], [5.5, 0.48, -1], mat(0xbeb6a1, 1), false);
note.userData = { id: 'note', label: 'Read torn note' };
interactables.push(note);

// Dust particles
const dustGeometry = new THREE.BufferGeometry();
const dustPositions = [];
for (let i = 0; i < 180; i++) dustPositions.push((Math.random() - 0.5) * 16, Math.random() * 4, (Math.random() - 0.5) * 20);
dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xc9c1a8, size: 0.018, transparent: true, opacity: 0.32 }));
scene.add(dust);

function notify(text, duration = 2200) {
  notification.textContent = text;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => notification.textContent = '', duration);
}

function isBlocked(next) {
  for (const c of colliders) {
    c.geometry.computeBoundingBox();
    c.updateWorldMatrix(true, false);
    const box3 = new THREE.Box3().setFromObject(c);
    const minDistance = player.radius;
    if (box3.distanceToPoint(new THREE.Vector3(next.x, 1, next.z)) < minDistance) return true;
  }
  return false;
}

function interact() {
  if (!activeInteractable) return;
  const o = activeInteractable;
  if (o.userData.id === 'brassKey') {
    player.inventory.push('Brass key');
    o.visible = false;
    notify('Brass key added to inventory');
    save();
  } else if (o.userData.id === 'note') {
    document.querySelector('#letter').classList.add('visible');
    paused = true;
    document.exitPointerLock?.();
  } else if (o.userData.open !== undefined) {
    o.userData.busy = true;
    o.userData.open = !o.userData.open;
    notify(o.userData.open ? 'Door opened' : 'Door closed');
  }
}

function save() {
  localStorage.setItem('forgotten-house-save', JSON.stringify({ position: camera.position.toArray(), inventory: player.inventory, battery: player.battery }));
}

function load() {
  const data = JSON.parse(localStorage.getItem('forgotten-house-save') || 'null');
  if (!data) return false;
  camera.position.fromArray(data.position || [0, 1.65, 8]);
  player.inventory = data.inventory || [];
  player.battery = data.battery ?? 100;
  return true;
}

function startGame() {
  menu.classList.remove('visible');
  pause.classList.remove('visible');
  hud.classList.add('visible');
  started = true;
  paused = false;
  renderer.domElement.requestPointerLock();
}

menu.querySelector('#new-game').addEventListener('click', () => { localStorage.removeItem('forgotten-house-save'); camera.position.set(0, 1.65, 8); startGame(); });
menu.querySelector('#continue-game').addEventListener('click', () => { load(); startGame(); notify(player.inventory.length ? 'Saved progress restored' : 'No new progress', 1800); });
pause.querySelector('#resume').addEventListener('click', startGame);
pause.querySelector('#save-game').addEventListener('click', () => { save(); notify('Game saved'); });

document.querySelector('#close-letter').addEventListener('click', () => { document.querySelector('#letter').classList.remove('visible'); paused = false; });

addEventListener('keydown', e => {
  player.keys[e.code] = true;
  if (e.code === 'KeyF' && started) { player.flashlightOn = !player.flashlightOn; if (player.battery <= 0) player.flashlightOn = false; }
  if (e.code === 'KeyE' && started) interact();
  if (e.code === 'Escape' && started) { pause.classList.toggle('visible'); hud.classList.toggle('visible'); paused = !paused; }
});
addEventListener('keyup', e => player.keys[e.code] = false);

addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement || paused) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (started && !paused) {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const wish = new THREE.Vector3();
    if (player.keys.KeyW) wish.add(forward);
    if (player.keys.KeyS) wish.sub(forward);
    if (player.keys.KeyD) wish.add(right);
    if (player.keys.KeyA) wish.sub(right);

    if (wish.lengthSq() > 0) wish.normalize();
    const speed = player.keys.ShiftLeft || player.keys.ShiftRight ? 4.2 : (player.keys.ControlLeft ? 1.5 : 2.45);
    const next = camera.position.clone().addScaledVector(wish, speed * dt);
    next.y = player.height;
    if (!isBlocked(next)) camera.position.copy(next);

    if (player.flashlightOn && player.battery > 0) {
      player.battery = Math.max(0, player.battery - dt * 0.18);
      flashlight.intensity = 3.5 + (Math.random() < 0.012 ? (Math.random() - 0.5) * 0.35 : 0);
      flashlight.visible = true;
    } else {
      flashlight.visible = false;
    }
    batteryBar.style.width = `${player.battery}%`;

    flashlight.position.copy(camera.position);
    const target = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
    flashlight.target.position.copy(target);

    // Center interaction detection
    activeInteractable = null;
    const ray = new THREE.Raycaster(camera.position, new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), 0, 2.2);
    const hits = ray.intersectObjects(interactables, true);
    if (hits.length) {
      let object = hits[0].object;
      while (object.parent && !interactables.includes(object)) object = object.parent;
      if (interactables.includes(object) && object.visible !== false) activeInteractable = object;
    }
    if (activeInteractable) {
      interactionHint.style.opacity = '1';
      interactionHint.textContent = `E — ${activeInteractable.userData.label || 'Interact'}`;
    } else interactionHint.style.opacity = '0';

    // Animate doors
    for (const d of interactables) {
      if (d.userData.open !== undefined) {
        const angle = d.userData.open ? -Math.PI / 2 : d.userData.homeRotation;
        d.rotation.z = THREE.MathUtils.lerp(d.rotation.z, d.userData.open ? 0 : 0, 0.12);
        d.rotation.y = THREE.MathUtils.lerp(d.rotation.y, angle, 0.12);
      }
    }

    dust.rotation.y += dt * 0.025;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
