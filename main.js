import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ===== 기본 준비 =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10, 20, 10);
scene.add(sun);

// ===== 맵 =====
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x4a8f4a })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
function addWall(x, z, width, depth) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, 2, depth), wallMaterial);
  wall.position.set(x, 1, z);
  scene.add(wall);
}
addWall(0, -20, 40, 1);
addWall(0, 20, 40, 1);
addWall(-20, 0, 1, 40);
addWall(20, 0, 1, 40);

// ===== 플레이어 (파란 상자 + 노란 코) =====
const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x3366ff })
);
player.position.set(0, 0.5, 0);
scene.add(player);

// 어느 쪽을 보고 있는지 알려 주는 작은 노란 상자
const nose = new THREE.Mesh(
  new THREE.BoxGeometry(0.3, 0.3, 0.3),
  new THREE.MeshStandardMaterial({ color: 0xffdd00 })
);
nose.position.set(0, 0, 0.6);
player.add(nose);

// ===== 키보드 입력 =====
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.code] = true));
window.addEventListener("keyup", (e) => (keys[e.code] = false));

// ===== 카메라 조작 (우클릭 드래그 + 휠) =====
let yaw = 0;        // 좌우 회전
let pitch = 0.7;    // 위아래 각도
let distance = 12;  // 플레이어와의 거리 (0에 가까우면 1인칭)

const MAX_DISTANCE = 25;
const FIRST_PERSON_BELOW = 0.5; // 이보다 가까우면 1인칭

let dragging = false;

renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault()); // 우클릭 메뉴 막기
renderer.domElement.addEventListener("mousedown", (e) => {
  if (e.button === 2) dragging = true;
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 2) dragging = false;
});
window.addEventListener("blur", () => (dragging = false));

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  yaw -= e.movementX * 0.005;
  pitch += e.movementY * 0.005;
});

window.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    distance += e.deltaY * 0.01;
    distance = THREE.MathUtils.clamp(distance, 0, MAX_DISTANCE);
  },
  { passive: false }
);

// ===== 해골 불러오기 =====
let skeleton = null;
let mixer = null;
let walkAction = null;

const loader = new GLTFLoader();

loader.load("models/skeleton.glb", (modelGltf) => {
  skeleton = modelGltf.scene;
  skeleton.position.set(8, 0, -8);
  scene.add(skeleton);

  loader.load("models/move.glb", (animGltf) => {
    console.log("사용 가능한 움직임:", animGltf.animations.map((a) => a.name));

    mixer = new THREE.AnimationMixer(skeleton);
    const clip =
      animGltf.animations.find((a) => a.name.includes("Walk")) ||
      animGltf.animations[0];

    walkAction = mixer.clipAction(clip);
    walkAction.play();
  });
});

const SKELETON_SPEED = 2.5;   // 해골 속도 (플레이어는 6이라 도망칠 수 있어요)
const STOP_DISTANCE = 1.5;    // 이만큼 가까워지면 멈춤

// ===== 매 순간 실행 =====
const clock = new THREE.Clock();
const move = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // --- 플레이어 이동 (바라보는 방향 기준) ---
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  move.set(0, 0, 0);
  if (keys["KeyW"] || keys["ArrowUp"]) move.add(forward);
  if (keys["KeyS"] || keys["ArrowDown"]) move.sub(forward);
  if (keys["KeyD"] || keys["ArrowRight"]) move.add(right);
  if (keys["KeyA"] || keys["ArrowLeft"]) move.sub(right);

  if (move.lengthSq() > 0) {
    move.normalize();
    player.position.addScaledVector(move, 6 * dt);
    player.rotation.y = Math.atan2(move.x, move.z); // 가는 방향을 바라보기
  }

  player.position.x = THREE.MathUtils.clamp(player.position.x, -19, 19);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -19, 19);

  // --- 해골이 플레이어를 쫓아오기 ---
  if (skeleton) {
    const dx = player.position.x - skeleton.position.x;
    const dz = player.position.z - skeleton.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist > STOP_DISTANCE) {
      skeleton.position.x += (dx / dist) * SKELETON_SPEED * dt;
      skeleton.position.z += (dz / dist) * SKELETON_SPEED * dt;
      skeleton.rotation.y = Math.atan2(dx, dz); // 플레이어 쪽을 바라보기
      if (walkAction) walkAction.paused = false;
    } else if (walkAction) {
      walkAction.paused = true; // 가까워지면 걸음 멈춤
    }

    skeleton.position.x = THREE.MathUtils.clamp(skeleton.position.x, -19, 19);
    skeleton.position.z = THREE.MathUtils.clamp(skeleton.position.z, -19, 19);
  }

  if (mixer) mixer.update(dt);

  // --- 카메라 ---
  const firstPerson = distance < FIRST_PERSON_BELOW;

  // 1인칭일 땐 위로도 볼 수 있게, 3인칭일 땐 땅 아래로 못 내려가게
  pitch = THREE.MathUtils.clamp(pitch, firstPerson ? -1.2 : 0.05, 1.4);

  const head = new THREE.Vector3(player.position.x, 1.2, player.position.z); // 머리 높이

  if (firstPerson) {
    player.visible = false;
    camera.position.copy(head);
    camera.lookAt(
      head.x - Math.sin(yaw) * Math.cos(pitch),
      head.y - Math.sin(pitch),
      head.z - Math.cos(yaw) * Math.cos(pitch)
    );
  } else {
    player.visible = distance > 1.5; // 너무 가까우면 상자가 시야를 가리니 숨김
    camera.position.set(
      head.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      head.y + Math.sin(pitch) * distance,
      head.z + Math.cos(yaw) * Math.cos(pitch) * distance
    );
    camera.lookAt(head);
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
