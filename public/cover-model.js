import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const canvas = document.querySelector('#house-model');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
camera.position.set(3.2, 2.6, 4.5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

scene.add(new THREE.HemisphereLight(0xf5fff4, 0x24372f, 2.1));
const keyLight = new THREE.DirectionalLight(0xffe5bd, 3.2);
keyLight.position.set(4, 6, 5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x9bd8e3, 1.5);
fillLight.position.set(-4, 2, -3);
scene.add(fillLight);

const model = new THREE.Group();
scene.add(model);

function resize() {
  const {width, height} = canvas.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(canvas.parentElement);
resize();

new STLLoader().load('/house.stl', geometry => {
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();
  const bounds = geometry.boundingBox;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.rotateX(-Math.PI / 2);
  const longestSide = Math.max(size.x, size.y, size.z);
  geometry.scale(2.2 / longestSide, 2.2 / longestSide, 2.2 / longestSide);

  const material = new THREE.MeshStandardMaterial({
    color: 0xc5d6c7,
    roughness: 0.68,
    metalness: 0.04,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.y = -0.35;
  model.add(mesh);
}, undefined, error => {
  console.error('Could not load cover house model:', error);
  canvas.setAttribute('aria-label', 'House model failed to load');
});

const clock = new THREE.Clock();
function animate() {
  const elapsed = clock.getElapsedTime();
  model.rotation.y += 0.0025;
  model.position.y = Math.sin(elapsed * 1.2) * 0.045;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();