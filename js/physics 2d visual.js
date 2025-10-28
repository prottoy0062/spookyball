import { System } from './engine/core/ecs.js';
import { Stage } from './engine/core/stage.js';
import { Mesh, Geometry, Attribute } from './engine/core/mesh.js';
import { UnlitMaterial } from './engine/core/materials.js';
import { StaticTransform } from './engine/core/transform.js';
import { Physics2DBody } from './physics-2d.js';
import { vec3, quat } from 'gl-matrix';

const tmpQuat = quat.create();

function createRectangleMesh(gpu) {
  const boundsVerts = new Float32Array([
     0.5, 0.0,  0.5,
    -0.5, 0.0,  0.5,
    -0.5, 0.0, -0.5,
     0.5, 0.0, -0.5,
     0.5, 0.0,  0.5,
  ]);

  const vertexBuffer = gpu.createStaticBuffer(boundsVerts, 'vertex');

  const geometry = new Geometry({
    drawCount: 5,
    attributes: [ new Attribute('position', vertexBuffer) ],
    topology: 'line-strip'
  });

  const material = new UnlitMaterial();
  material.baseColorFactor = [1.0, 1.0, 0.0]; // default yellow
  material.depthCompare = 'less-equal';
  material.emissiveFactor = [0.1, 0.4, 0.1]; // slight glow

  const mesh = new Mesh({ geometry, material });
  mesh.name = 'Physics 2D Rectangle Visualization Mesh';

  return mesh;
}

function createCircleMesh(gpu) {
  const ringSegments = 16;
  const colliderVerts = [];

  for (let i = 0; i <= ringSegments; ++i) {
    const u = (i / ringSegments) * Math.PI * 2;
    colliderVerts.push(Math.cos(u), 0, Math.sin(u));
  }

  const vertexBuffer = gpu.createStaticBuffer(new Float32Array(colliderVerts), 'vertex');

  const geometry = new Geometry({
    drawCount: ringSegments + 1,
    attributes: [ new Attribute('position', vertexBuffer) ],
    topology: 'line-strip'
  });

  const material = new UnlitMaterial();
  material.baseColorFactor = [0.0, 1.0, 0.0];
  material.depthCompare = 'less-equal';
  material.emissiveFactor = [0.1, 0.4, 0.1];

  const mesh = new Mesh({ geometry, material });
  mesh.name = 'Physics 2D Circle Visualization Mesh';

  return mesh;
}

const verticesMeshes = new WeakMap();
function getOrCreateVerticesMesh(gpu, body) {
  let mesh = verticesMeshes.get(body);
  if (mesh) return mesh;

  const verts = body.body.vertices;
  const vertexBuffer = gpu.createStaticBuffer((verts.length + 1) * 12, 'vertex');
  const arrayBuffer = new Float32Array(vertexBuffer.arrayBuffer);

  for (let i = 0; i < verts.length; ++i) {
    arrayBuffer[i * 3] = verts[i].x - body.body.position.x;
    arrayBuffer[i * 3 + 2] = verts[i].y - body.body.position.y;
  }
  arrayBuffer[verts.length * 3] = verts[0].x - body.body.position.x;
  arrayBuffer[verts.length * 3 + 2] = verts[0].y - body.body.position.y;

  vertexBuffer.finish();

  const geometry = new Geometry({
    drawCount: verts.length + 1,
    attributes: [ new Attribute('position', vertexBuffer) ],
    topology: 'line-strip'
  });

  const material = new UnlitMaterial();
  material.baseColorFactor = [0.0, 1.0, 0.2];
  material.depthCompare = 'less-equal';
  material.emissiveFactor = [0.1, 0.4, 0.1];

  mesh = new Mesh({ geometry, material });
  mesh.name = 'Vertices Visualization Mesh';
  verticesMeshes.set(body, mesh);

  return mesh;
}

export class Physics2DVisualizerSystem extends System {
  stage = Stage.PostFrameLogic;

  init(gpu) {
    this.rectMesh = createRectangleMesh(gpu);
    this.circleMesh = createCircleMesh(gpu);
    this.bodyQuery = this.query(Physics2DBody);
  }

  execute(delta, time, gpu) {
    this.bodyQuery.forEach((entity, body) => {
      const position = [body.body.position.x, 0, body.body.position.y];
      quat.identity(tmpQuat);
      quat.rotateZ(tmpQuat, tmpQuat, body.body.angle);

      // 🟢 Velocity-based color animation
      const vx = body.body.velocity?.x || 0;
      const vy = body.body.velocity?.y || 0;
      const speed = Math.hypot(vx, vy);
      const t = Math.min(speed / 10, 1.0);
      const color = [t, 1.0 - t, 0.2]; // red ↔ green gradient

      // 🌀 Pulsing scale animation
      const pulse = 1 + 0.05 * Math.sin(time * 5);
      let scale;

      switch (body.type) {
        case 'rectangle':
          this.rectMesh.material.baseColorFactor.set(color);
          scale = [body.width * pulse, 1, body.height * pulse];
          gpu.addFrameMeshInstance(this.rectMesh, new StaticTransform({
            position,
            scale,
            orientation: tmpQuat
          }));
          break;

        case 'circle':
          this.circleMesh.material.baseColorFactor.set(color);
          scale = [body.radius * pulse, 1, body.radius * pulse];
          gpu.addFrameMeshInstance(this.circleMesh, new StaticTransform({
            position,
            scale,
            orientation: tmpQuat
          }));
          break;

        case 'fromVertices':
          let mesh = getOrCreateVerticesMesh(gpu, body);
          if (mesh) {
            mesh.material.baseColorFactor.set(color);
            gpu.addFrameMeshInstance(mesh, new StaticTransform({
              position,
              orientation: tmpQuat
            }));
          }
          break;
      }
    });
  }
}
