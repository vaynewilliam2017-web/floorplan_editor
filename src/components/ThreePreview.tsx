import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { boundsOf, normalizeVector, polygonArea, segmentLength } from '../lib/geometry';
import { ROOM_CATEGORIES } from '../lib/roomCategories';
import type { CameraPreset, FloorplanModel, LayerVisibility, Point, Vec3 } from '../lib/types';

interface Props {
  model: FloorplanModel;
  layers?: LayerVisibility;
  cameraAngle?: CameraAngleId;
  cameraPreset?: CameraPreset | null;
  interactive?: boolean;
  onCameraChange?: (position: Vec3, target: Vec3) => void;
}

export type CameraAngleId = 'overview' | 'top' | 'entry' | 'diagonal' | 'low';

export const CAMERA_ANGLE_OPTIONS: Array<{
  id: CameraAngleId;
  name: string;
  lens: string;
  height: string;
  description: string;
}> = [
  {
    id: 'overview',
    name: 'Overview',
    lens: '24 mm',
    height: 'High',
    description: 'Checks the whole generated shell, rooms, openings, and furniture footprint.',
  },
  {
    id: 'top',
    name: 'Plan top',
    lens: 'Orthographic',
    height: 'Top',
    description: 'Best for comparing the 3D rebuild against the 2D plan geometry.',
  },
  {
    id: 'entry',
    name: 'Entry view',
    lens: '28 mm',
    height: '1.5 m',
    description: 'Low oblique view for entry circulation and door or opening placement.',
  },
  {
    id: 'diagonal',
    name: 'Diagonal',
    lens: '35 mm',
    height: '1.4 m',
    description: 'Corner angle for checking room depth and furniture relationships.',
  },
  {
    id: 'low',
    name: 'Low interior',
    lens: '50 mm',
    height: '1.1 m',
    description: 'Interior-like view that keeps the open top while showing wall height.',
  },
];

export function ThreePreview({ model, layers, cameraAngle = 'overview', cameraPreset = null, interactive = false, onCameraChange }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const width = host.clientWidth || 520;
    const height = host.clientHeight || 360;
    const points = [
      ...model.boundary.points,
      ...model.rooms.flatMap((room) => room.polygon),
      ...model.walls.flatMap((wall) => wall.centerline),
      ...model.furniture.flatMap((item) => [
        item.position,
        [item.position[0] + item.size[0], item.position[1] + item.size[1]] as Point,
      ]),
    ];
    const bounds = boundsOf(points.length ? points : [[0, 0]]);
    const centerX = bounds.minX + bounds.width / 2;
    const centerZ = bounds.minY + bounds.height / 2;
    const planSpan = Math.max(bounds.width, bounds.height, 1000);
    const previewWallHeight = model.source.calibrated ? 2800 : Math.max(160, Math.min(360, planSpan * 0.28));
    const sceneSpan = Math.max(planSpan, previewWallHeight * 2.6, 1000);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8fafc');

    const baseFrustum = sceneSpan * (cameraAngle === 'low' || cameraAngle === 'entry' ? 1.05 : 1.55);
    const aspect = width / height;
    let camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
    if (cameraPreset) {
      camera = new THREE.PerspectiveCamera(clampNumber(cameraPreset.fovDeg, 30, 105), aspect, model.source.calibrated ? 80 : 1, sceneSpan * 30);
      applyCameraPreset(camera, cameraPreset, centerX, centerZ);
    } else {
      camera = new THREE.OrthographicCamera(
        (-baseFrustum * aspect) / 2,
        (baseFrustum * aspect) / 2,
        baseFrustum / 2,
        -baseFrustum / 2,
        1,
        sceneSpan * 10,
      );
      applyCameraAngle(camera, sceneSpan, cameraAngle);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight('#ffffff', 2.1);
    light.position.set(sceneSpan * 0.5, sceneSpan * 1.4, sceneSpan * 0.65);
    light.castShadow = true;
    scene.add(light);
    scene.add(new THREE.AmbientLight('#ffffff', 1.8));

    const root = new THREE.Group();
    root.position.set(-centerX, 0, -centerZ);
    scene.add(root);

    if (layers?.roomLayer !== false) model.rooms.forEach((room) => {
      if (room.polygon.length < 4 || polygonArea(room.polygon) <= 0) return;
      const shape = new THREE.Shape();
      room.polygon.forEach((point, index) => {
        if (index === 0) shape.moveTo(point[0], point[1]);
        else shape.lineTo(point[0], point[1]);
      });
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(Math.PI / 2);
      const category = ROOM_CATEGORIES[room.category] || ROOM_CATEGORIES[-1];
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(category.color),
        roughness: 0.88,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 0;
      mesh.receiveShadow = true;
      root.add(mesh);
    });

    if (layers?.wallLayer !== false) model.walls.forEach((wall) => {
      const length = segmentLength(wall.centerline);
      if (length <= 0) return;
      const heightMm = model.source.calibrated ? wall.heightMm || 2800 : previewWallHeight;
      const geometry = createOpenTopBoxGeometry(length, heightMm, wall.thicknessMm);
      const material = new THREE.MeshStandardMaterial({
        color: wall.structural === 'load_bearing' ? '#172033' : '#435065',
        roughness: 0.72,
        transparent: true,
        opacity: cameraPreset ? 0.48 : 0.82,
        depthWrite: !cameraPreset,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const mid: Point = [
        (wall.centerline[0][0] + wall.centerline[1][0]) / 2,
        (wall.centerline[0][1] + wall.centerline[1][1]) / 2,
      ];
      const unit = normalizeVector(wall.centerline[0], wall.centerline[1]);
      mesh.position.set(mid[0], heightMm / 2, mid[1]);
      mesh.rotation.y = -Math.atan2(unit[1], unit[0]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    });

    if (layers?.openingLayer !== false) model.openings.forEach((opening) => {
      const mid: Point = [
        (opening.segment[0][0] + opening.segment[1][0]) / 2,
        (opening.segment[0][1] + opening.segment[1][1]) / 2,
      ];
      const isWindow = opening.type.includes('window');
      const heightMm = model.source.calibrated ? (isWindow ? 850 : 2100) : previewWallHeight * (isWindow ? 0.42 : 0.72);
      const yMm = model.source.calibrated ? (isWindow ? 1350 : 1050) : heightMm / 2;
      const geometry = new THREE.BoxGeometry(Math.max(opening.widthMm, 80), heightMm, 70);
      const material = new THREE.MeshStandardMaterial({
        color: isWindow ? '#38bdf8' : '#fb923c',
        transparent: true,
        opacity: 0.62,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const unit = normalizeVector(opening.segment[0], opening.segment[1]);
      mesh.position.set(mid[0], yMm, mid[1]);
      mesh.rotation.y = -Math.atan2(unit[1], unit[0]);
      root.add(mesh);
    });

    if (layers?.furnitureLayer !== false) model.furniture.forEach((item) => {
      const furnitureHeight = model.source.calibrated
        ? Math.max(80, Math.min(900, Math.min(item.size[0], item.size[1]) * 0.45))
        : Math.max(10, Math.min(90, Math.min(item.size[0], item.size[1]) * 0.45));
      const geometry = new THREE.BoxGeometry(item.size[0], furnitureHeight, item.size[1]);
      const material = new THREE.MeshStandardMaterial({
        color: '#bf5af2',
        roughness: 0.82,
        transparent: true,
        opacity: 0.72,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(item.size[0] / 2, furnitureHeight / 2, item.size[1] / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const group = new THREE.Group();
      group.position.set(item.position[0], 0, item.position[1]);
      group.rotation.y = -THREE.MathUtils.degToRad(item.rotationDeg);
      group.add(mesh);
      root.add(group);
    });

    if (layers?.controlLayer !== false) {
      const grid = new THREE.GridHelper(planSpan * 1.45, 24, '#cbd5e1', '#e2e8f0');
      grid.position.set(0, -2, 0);
      scene.add(grid);
    }

    const render = () => renderer.render(scene, camera);
    render();

    let controls: OrbitControls | null = null;
    let animId = 0;
    if (interactive) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.set(0, 0, 0);
      controls.addEventListener('change', () => {
        if (onCameraChange) {
          onCameraChange(
            [camera.position.x, camera.position.y, camera.position.z],
            [controls!.target.x, controls!.target.y, controls!.target.z],
          );
        }
      });
      const animate = () => {
        animId = requestAnimationFrame(animate);
        controls!.update();
        render();
      };
      animate();
    }

    const resize = () => {
      const nextWidth = host.clientWidth || width;
      const nextHeight = host.clientHeight || height;
      const nextAspect = nextWidth / nextHeight;
      if (camera instanceof THREE.OrthographicCamera) {
        camera.left = (-baseFrustum * nextAspect) / 2;
        camera.right = (baseFrustum * nextAspect) / 2;
        camera.top = baseFrustum / 2;
        camera.bottom = -baseFrustum / 2;
      } else {
        camera.aspect = nextAspect;
      }
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      controls?.dispose();
      observer.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      host.innerHTML = '';
    };
  }, [model, layers, cameraAngle, cameraPreset, interactive, onCameraChange]);

  return <div className="three-preview" ref={hostRef} />;
}

function createOpenTopBoxGeometry(width: number, height: number, depth: number) {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const vertices = new Float32Array([
    -x,
    -y,
    z,
    x,
    -y,
    z,
    x,
    y,
    z,
    -x,
    y,
    z,
    x,
    -y,
    -z,
    -x,
    -y,
    -z,
    -x,
    y,
    -z,
    x,
    y,
    -z,
    -x,
    -y,
    -z,
    -x,
    -y,
    z,
    -x,
    y,
    z,
    -x,
    y,
    -z,
    x,
    -y,
    z,
    x,
    -y,
    -z,
    x,
    y,
    -z,
    x,
    y,
    z,
  ]);
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function applyCameraAngle(camera: THREE.OrthographicCamera, sceneSpan: number, angle: CameraAngleId) {
  camera.up.set(0, 1, 0);

  if (angle === 'top') {
    camera.up.set(0, 0, -1);
    camera.position.set(0, sceneSpan * 1.75, 0.01);
  } else if (angle === 'entry') {
    camera.position.set(0, sceneSpan * 0.42, sceneSpan * 1.18);
  } else if (angle === 'diagonal') {
    camera.position.set(sceneSpan * 0.82, sceneSpan * 0.85, sceneSpan * 0.92);
  } else if (angle === 'low') {
    camera.position.set(-sceneSpan * 0.62, sceneSpan * 0.38, sceneSpan * 0.74);
  } else {
    camera.position.set(sceneSpan * 0.56, sceneSpan * 1.22, sceneSpan * 0.68);
  }

  camera.lookAt(0, 0, 0);
}

function applyCameraPreset(camera: THREE.Camera, preset: CameraPreset, centerX: number, centerZ: number) {
  const position = preset.position;
  const target = preset.target;
  const x = position[0] - centerX;
  const y = position[1];
  const z = position[2] - centerZ;
  const tx = target[0] - centerX;
  const ty = target[1];
  const tz = target[2] - centerZ;
  const isTopDown = Math.abs(x - tx) < 0.001 && Math.abs(z - tz) < 0.001;
  camera.up.set(0, isTopDown ? 0 : 1, isTopDown ? -1 : 0);
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
