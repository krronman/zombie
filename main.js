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

// ===== 플레이어 (기사) =====
const PLAYER_SCALE = 0.7; // 기사 크기 (너무 크거나 작으면 이 숫자를 조절)
const EYE_HEIGHT = 1.5;   // 카메라가 보는 높이
const player = new THREE.Group();
player.position.set(0, 0, 0);
scene.add(player);

// ===== 키보드 입력 =====
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.code] = true));
window.addEventListener("keyup", (e) => (keys[e.code] = false));

// ===== 체력(HP) =====
const PLAYER_MAX_HP = 100;
let playerHp = PLAYER_MAX_HP;

// 화면 왼쪽 아래에 체력바 만들기
const hpWrap = document.createElement("div");
Object.assign(hpWrap.style, {
  position: "fixed", left: "20px", bottom: "20px",
  width: "260px", height: "22px",
  background: "rgba(0,0,0,0.6)", border: "2px solid #fff",
  borderRadius: "6px", overflow: "hidden", zIndex: "10",
});
const hpFill = document.createElement("div");
Object.assign(hpFill.style, {
  width: "100%", height: "100%", background: "#e03030", transition: "width 0.15s",
});
hpWrap.appendChild(hpFill);
document.body.appendChild(hpWrap);

function updateHpBar() {
  hpFill.style.width = (playerHp / PLAYER_MAX_HP) * 100 + "%";
}

function damagePlayer(amount) {
  playerHp -= amount;
  if (playerHp <= 0) {
    // 지금은 임시로: 죽으면 체력을 채우고 가운데서 다시 시작
    playerHp = PLAYER_MAX_HP;
    player.position.set(0, 0, 0);
  }
  updateHpBar();
}

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

window.addEventListener("mousemove", (e) => {
  const rightHeld = (e.buttons & 2) !== 0; // 지금 실제로 우클릭이 눌려 있는지
  if (!(rightHeld || shiftLock || isFirstPerson())) return;
  yaw -= e.movementX * 0.005;
  pitch += e.movementY * 0.005;
});

window.addEventListener("blur", () => (dragging = false));


window.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    distance += e.deltaY * 0.01;
    distance = THREE.MathUtils.clamp(distance, 0, MAX_DISTANCE);
  },
  { passive: false }
);
// ===== 1인칭 판별 + 마우스 커서 고정(Shift 락) =====
let shiftLock = false;

function isFirstPerson() {
  return distance < FIRST_PERSON_BELOW;
}

// 커서를 화면에 가둬서 마우스를 계속 돌릴 수 있게 하는 기능
function tryLock() {
  const p = renderer.domElement.requestPointerLock();
  if (p && p.catch) p.catch(() => {}); // 브라우저가 거절해도 조용히 넘어감
}

// Shift 키로 켜고 끄기
window.addEventListener("keydown", (e) => {
  if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat) {
    shiftLock = !shiftLock;
    if (shiftLock) tryLock();
    else if (document.pointerLockElement && !isFirstPerson()) document.exitPointerLock();
  }
});

// Esc로 커서 고정이 풀리면 Shift 락도 같이 꺼짐
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== renderer.domElement) shiftLock = false;
});

// 휠로 1인칭에 들어가면 커서 고정 시도, 나오면 해제
window.addEventListener("wheel", () => {
  if (isFirstPerson()) tryLock();
  else if (!shiftLock && document.pointerLockElement) document.exitPointerLock();
});

// ===== 해골 불러오기 =====
let skeleton = null;
let mixer = null;
let walkAction = null;
let attackAction = null;

// 해골 공격 상태
let skeletonAttacking = false;
let attackElapsed = 0;
let attackHitDone = false;
let attackDuration = 1;
let attackHitTime = 0.5;

const loader = new GLTFLoader();

loader.load("models/skeleton.glb", (modelGltf) => {
  skeleton = modelGltf.scene;
  skeleton.position.set(8, 0, -8);
  skeleton.scale.setScalar(PLAYER_SCALE);
  scene.add(skeleton);

  mixer = new THREE.AnimationMixer(skeleton);

  // 걷기 움직임
  loader.load("models/move.glb", (g) => {
    console.log("걷기 파일 움직임:", g.animations.map((a) => a.name));
    const clip = g.animations.find((a) => a.name.includes("Walk")) || g.animations[0];
    walkAction = mixer.clipAction(clip);
    walkAction.play();
  });

  // 공격 움직임
  loader.load("models/combat.glb", (g) => {
    const clip =
      g.animations.find((a) => a.name === "Melee_1H_Attack_Chop") || g.animations[0];
    attackAction = mixer.clipAction(clip);
    attackAction.setLoop(THREE.LoopOnce, 1); // 한 번만 재생
    attackAction.clampWhenFinished = true; // 끝나도 마지막 자세를 유지 (T자 방지)
    attackDuration = clip.duration;
    attackHitTime = clip.duration * 0.45;    // 모션의 45% 지점에서 피해가 들어감
  });
});

function startSkeletonAttack() {
  skeletonAttacking = true;
  attackElapsed = 0;
  attackHitDone = false;
  attackAction.reset().play();
  // 걷기가 아직 켜져 있을 때만 부드럽게 섞음 (없으면 기본 자세가 비쳐 보임)
  if (walkAction && walkAction.enabled) attackAction.crossFadeFrom(walkAction, 0.15, false);
}

function startWalking() {
  if (!walkAction) return;
  walkAction.reset().play();
  // 공격 동작이 아직 켜져 있을 때만 부드럽게 섞음
  if (attackAction && attackAction.enabled) walkAction.crossFadeFrom(attackAction, 0.15, false);
}

const SKELETON_SPEED = 2.5;   // 해골 속도 (플레이어는 6이라 도망칠 수 있어요)
const STOP_DISTANCE = 1.5;    // 이만큼 가까워지면 멈춤
// ===== 해골 체력 / 공격 / 리스폰 =====
const SKELETON_MAX_HP = 50;
let skeletonHp = SKELETON_MAX_HP;

const ATTACK_RANGE = 1.8;    // 이 거리 안에 들어오면 공격
const ATTACK_DAMAGE = 10;    // 한 번에 주는 피해
const ATTACK_COOLDOWN = 1.0; // 몇 초마다 공격할지
let attackTimer = 0;

// 플레이어에게서 10m 이상 떨어진 곳에 다시 등장
function respawnSkeleton() {
  let x, z, tries = 0;
  do {
    x = (Math.random() * 2 - 1) * 17;
    z = (Math.random() * 2 - 1) * 17;
    tries++;
  } while (Math.hypot(x - player.position.x, z - player.position.z) < 10 && tries < 20);
  skeleton.position.set(x, 0, z);
  skeletonHp = SKELETON_MAX_HP;
  attackTimer = 0;
  skeletonAttacking = false;
  if (attackAction) attackAction.stop();
}

// 맞았을 때 잠깐 빨갛게 번쩍

// 맞았을 때 잠깐 빨갛게 번쩍 (끝나면 원래 발광색으로 복구)
const originalEmissive = new Map(); // 재질 → 원래 발광색 (눈 안광 등)
let flashTimer = null;

function flashSkeleton() {
  skeleton.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => {
      if (!m.emissive) return;
      // 처음 번쩍이기 전에 원래 색을 기억해 둠
      if (!originalEmissive.has(m)) originalEmissive.set(m, m.emissive.clone());
      m.emissive.setHex(0xff0000);
    });
  });
  clearTimeout(flashTimer);
  flashTimer = setTimeout(restoreSkeletonGlow, 120);
}

function restoreSkeletonGlow() {
  originalEmissive.forEach((color, m) => m.emissive.copy(color));
}

// ===== 기사 캐릭터 + 검 + 움직임 =====
const ATTACK_SPEED = 1.6;  // 공격 모션 배속 (클수록 빠르게 휘두름)
const SWORD_REACH = 2.4;   // 검이 닿는 거리
const SWORD_DAMAGE = 25;   // 해골 체력 50이라 2번 때리면 처치

let playerMixer = null;
const pActions = {};       // idle(대기), run(달리기), attack(공격)
let pCurrent = null;       // 지금 재생 중인 동작
let swingT = -1;           // 0~1: 휘두르는 진행도, -1이면 휘두르는 중이 아님
let swingHit = false;
let swingDuration = 0.7;

// 동작 바꾸기 (앞 동작이 켜져 있을 때만 부드럽게 섞음 → T자 방지)
function playerPlay(next) {
  if (!next || next === pCurrent) return;
  next.reset().play();
  if (pCurrent && pCurrent.enabled) next.crossFadeFrom(pCurrent, 0.15, false);
  pCurrent = next;
}

// 뼈대 안에서 이름으로 뼈 찾기
function findBone(root, name) {
  let found = null;
  const plain = name.replace(/\./g, "");
  root.traverse((o) => {
    if (!found && (o.userData.name === name || o.name === name || o.name === plain)) found = o;
  });
  return found;
}

// 파일에서 이름이 맞는 움직임 하나 꺼내기
function loadClip(file, clipName, onLoad) {
  loader.load(file, (a) => {
    const clip = a.animations.find((c) => c.name === clipName);
    if (clip) onLoad(clip);
    else console.warn("움직임을 못 찾음:", clipName, a.animations.map((c) => c.name));
  });
}

loader.load("models/Knight.glb", (g) => {
  const knight = g.scene;
  knight.scale.setScalar(PLAYER_SCALE);
  player.add(knight);
  playerMixer = new THREE.AnimationMixer(knight);

  // 검을 오른손 슬롯(handslot.r)에 붙이기
  const handBone = findBone(knight, "handslot.r");
  if (!handBone) console.warn("오른손 뼈를 못 찾음");
  loader.load("models/sword_1handed.gltf", (s) => {
    (handBone || knight).add(s.scene);
  });

  // 움직임 3종
  loadClip("models/Rig_Medium_General.glb", "Idle_A", (clip) => {
    pActions.idle = playerMixer.clipAction(clip);
    playerPlay(pActions.idle);
  });
  loadClip("models/Rig_Medium_MovementBasic.glb", "Running_A", (clip) => {
    pActions.run = playerMixer.clipAction(clip);
  });
  loadClip("models/combat.glb", "Melee_1H_Attack_Chop", (clip) => {
    pActions.attack = playerMixer.clipAction(clip);
    pActions.attack.setLoop(THREE.LoopOnce, 1);
    pActions.attack.clampWhenFinished = true;
    pActions.attack.timeScale = ATTACK_SPEED;
    swingDuration = clip.duration / ATTACK_SPEED;
  });
});

function startSwing() {
  if (swingT >= 0 || !pActions.attack) return;
  swingT = 0;
  swingHit = false;
  const atk = pActions.attack;
  atk.reset().play();
  if (pCurrent && pCurrent !== atk && pCurrent.enabled) atk.crossFadeFrom(pCurrent, 0.1, false);
  pCurrent = atk;
}

// 왼쪽 클릭으로 휘두르기 (1인칭이면 커서 고정도 시도)
window.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  startSwing();
  if (isFirstPerson()) tryLock();
});

function updateSword(dt) {
  if (swingT >= 0) {
    swingT += dt / swingDuration;
    const t = Math.min(swingT, 1);

    // 모션 중간(30~70%)에 한 번만 명중 검사
    if (!swingHit && skeleton && t > 0.3 && t < 0.7) {
      const dx = skeleton.position.x - player.position.x;
      const dz = skeleton.position.z - player.position.z;
      const dist = Math.hypot(dx, dz);
      const fx = Math.sin(player.rotation.y);
      const fz = Math.cos(player.rotation.y);
      const inFront = (dx * fx + dz * fz) / dist > 0.3;

      if (dist <= SWORD_REACH && inFront) {
        swingHit = true;
        skeletonHp -= SWORD_DAMAGE;
        skeleton.position.x += (dx / dist) * 1.0; // 살짝 밀려남
        skeleton.position.z += (dz / dist) * 1.0;
        flashSkeleton();
        if (skeletonHp <= 0) respawnSkeleton();
      }
    }
    if (swingT >= 1) swingT = -1;
  }

  // 휘두르는 중이 아니면 움직임에 따라 달리기/대기
  if (swingT < 0) playerPlay(move.lengthSq() > 0 ? pActions.run : pActions.idle);

  if (playerMixer) playerMixer.update(dt);
}

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
    // Shift 락이나 1인칭이면 캐릭터가 항상 카메라가 보는 쪽을 향함
  if (shiftLock || isFirstPerson()) player.rotation.y = yaw + Math.PI;

  updateSword(dt);

  // --- 해골이 플레이어를 쫓아오기 + 공격 ---
  if (skeleton) {
    const dx = player.position.x - skeleton.position.x;
    const dz = player.position.z - skeleton.position.z;
    const dist = Math.hypot(dx, dz);

    skeleton.rotation.y = Math.atan2(dx, dz); // 항상 플레이어를 바라보기

    if (skeletonAttacking) {
      // 공격 모션 재생 중: 제자리에서 휘두름
      attackElapsed += dt;
      if (!attackHitDone && attackElapsed >= attackHitTime) {
        attackHitDone = true;
        if (dist <= ATTACK_RANGE + 0.5) damagePlayer(ATTACK_DAMAGE); // 그새 도망갔으면 빗나감
      }
      if (attackElapsed >= attackDuration) skeletonAttacking = false;
    } else if (dist <= ATTACK_RANGE && attackAction) {
      startSkeletonAttack(); // 가까우면 공격 시작 (끝나도 아직 가까우면 계속 공격)
    } else if (dist > STOP_DISTANCE) {
      skeleton.position.x += (dx / dist) * SKELETON_SPEED * dt;
      skeleton.position.z += (dz / dist) * SKELETON_SPEED * dt;
      if (walkAction && !walkAction.isRunning()) startWalking();
    } else if (walkAction) {
      walkAction.stop();
    }

    skeleton.position.x = THREE.MathUtils.clamp(skeleton.position.x, -19, 19);
    skeleton.position.z = THREE.MathUtils.clamp(skeleton.position.z, -19, 19);
  }

  if (mixer) mixer.update(dt);

  // --- 카메라 ---
  const firstPerson = distance < FIRST_PERSON_BELOW;

  // 1인칭일 땐 위로도 볼 수 있게, 3인칭일 땐 땅 아래로 못 내려가게
  pitch = THREE.MathUtils.clamp(pitch, firstPerson ? -1.2 : 0.05, 1.4);

  const head = new THREE.Vector3(player.position.x, EYE_HEIGHT, player.position.z);

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
