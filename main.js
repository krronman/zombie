import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// 무대, 카메라, 화면 그리는 도구
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 조명 (없으면 새까맣게 보여요)
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10, 20, 10);
scene.add(sun);

// 바닥 (40m x 40m)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x4a8f4a })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// 사방 벽
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

// 플레이어 (파란 상자)
const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x3366ff })
);
player.position.set(0, 0.5, 0);
scene.add(player);

// 키보드 입력 기억하기
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.code] = true));
window.addEventListener("keyup", (e) => (keys[e.code] = false));

// 해골 병사 불러오기
let skeleton = null;
let mixer = null; // 움직임을 재생해 주는 도구

const loader = new GLTFLoader();

loader.load("models/skeleton.glb", (modelGltf) => {
  skeleton = modelGltf.scene;
  skeleton.position.set(5, 0, -5);
  scene.add(skeleton);

  // 움직임 파일을 따로 불러와서 해골에 붙이기
  loader.load("models/move.glb", (animGltf) => {
    console.log("사용 가능한 움직임:", animGltf.animations.map((a) => a.name));

    mixer = new THREE.AnimationMixer(skeleton);

    // 이름에 Walk가 들어간 움직임을 찾고, 없으면 첫 번째 것
    const clip =
      animGltf.animations.find((a) => a.name.includes("Walk")) ||
      animGltf.animations[0];

    mixer.clipAction(clip).play();
  });
});

// 매 순간 실행되는 부분
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const speed = 6;

  if (keys["KeyW"] || keys["ArrowUp"]) player.position.z -= speed * dt;
  if (keys["KeyS"] || keys["ArrowDown"]) player.position.z += speed * dt;
  if (keys["KeyA"] || keys["ArrowLeft"]) player.position.x -= speed * dt;
  if (keys["KeyD"] || keys["ArrowRight"]) player.position.x += speed * dt;

  // 벽 밖으로 못 나가게 막기
  player.position.x = THREE.MathUtils.clamp(player.position.x, -19, 19);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -19, 19);

  // 카메라가 플레이어를 뒤에서 위로 따라다님
  camera.position.set(player.position.x, 10, player.position.z + 12);
  camera.lookAt(player.position);

  // 해골 움직임 재생
  if (mixer) mixer.update(dt);

  renderer.render(scene, camera);
}
animate();

// 창 크기가 바뀌면 화면도 맞추기
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
