import { System, Tag } from './engine/core/ecs.js';
import { Transform } from './engine/core/transform.js';
import { PointLight, ShadowCastingLight } from './engine/core/light.js';

import { Physics2DBody } from './physics-2d.js';
import { Paddle, GameState } from './player.js';

import { vec3 } from 'gl-matrix';
import { Collisions, ImpactDamage } from './impact-damage.js';

export class Ball {
  waitingForLaunch = true;
  speed = 0.5;
  glowIntensity = 45;
  color = [0.0, 0.5, 1.0];
}

export class BonusBall { }

export class BallSystem extends System {
  executesWhenPaused = false;

  init(gpu, gltfLoader) {
    this.ballQuery = this.query(Ball, Physics2DBody, Transform);
    this.paddleQuery = this.query(Paddle);
    this.bonusQuery = this.query(Transform, BonusBall, Tag('dead'));

    gltfLoader.fromUrl('./media/models/ball-compressed.glb').then(scene => {
      for (const material of scene.materials) {
        material.castsShadow = false;
        material.additiveBlend = true;
        material.depthWrite = false;
      }
      this.ballScene = scene;
    });
  }

  execute(delta, time, gpu) {
    const gameState = this.singleton.get(GameState);
    let ballCount = 0;
    let lostBall = false;
    let paddleState;
    let waitingBallCount = 0;

    this.paddleQuery.forEach((entity, paddle) => {
      paddleState = paddle;
      return false;
    });

    this.ballQuery.forEach((entity, ball, body, transform) => {
      // Position ball on paddle before launch
      if (ball.waitingForLaunch && paddleState) {
        Matter.Body.setPosition(body.body, { x: paddleState.x, y: 23 });
        if (paddleState.launch) {
          const direction = vec3.fromValues(
            (Math.random() * 2.0 - 1.0) * 0.5,
            0,
            -1.5
          );
          this.launchBall(ball, body, direction);
        } else waitingBallCount++;
      }

      // Maintain constant speed
      const speed = Math.sqrt(
        body.body.velocity.x ** 2 + body.body.velocity.y ** 2
      );
      if (speed !== 0 && speed < ball.speed) {
        const scaleFactor = ball.speed / speed;
        Matter.Body.setVelocity(body.body, {
          x: body.body.velocity.x * scaleFactor,
          y: body.body.velocity.y * scaleFactor,
        });
      }

      // 🔥 Dynamic color based on speed
      const intensity = Math.min(speed * 70, 200);
      const hue = Math.abs(Math.sin(time * 0.5)) * 0.6 + 0.2;
      ball.color = [hue, 0.5 + 0.5 * Math.sin(time), 1.0 - hue];
      ball.glowIntensity = 30 + intensity * 0.5;

      const light = entity.get(PointLight);
      if (light) {
        light.color = ball.color;
        light.intensity = ball.glowIntensity;
      }

      // 🎇 Curve the motion slightly for fun
      if (!ball.waitingForLaunch) {
        const curve = Math.sin(time * 2.0) * 0.0015;
        Matter.Body.setVelocity(body.body, {
          x: body.body.velocity.x + curve,
          y: body.body.velocity.y,
        });
      }

      // Ball lost check
      if (transform.position[2] > 30) {
        entity.add(Tag('dead'));
        lostBall = true;
      } else {
        ballCount++;
      }
    });

    // 🟡 Bonus balls: spawn colorful, faster versions
    this.bonusQuery.forEach((entity, transform) => {
      const direction = vec3.fromValues(
        (Math.random() * 2.0 - 1.0),
        0,
        -(Math.random() * 2.0 - 1.0)
      );
      const bonus = this.spawnBall(
        [transform.position[0], 1, transform.position[2]],
        direction,
        gpu.flags.ballShadows
      );
      const bonusLight = bonus.get(PointLight);
      if (bonusLight) {
        bonusLight.color = [1.0, 0.4, 0.2]; // fiery orange
        bonusLight.intensity = 60;
      }
    });

    // Respawn if no balls left
    if (ballCount === 0) {
      if (lostBall) gameState.lives--;
      if (!gameState.levelStarting && gameState.lives > 0) {
        this.spawnBall([paddleState.x, 1, 23], null, gpu.flags.ballShadows);
      }
    }

    if (gpu.flags.lucasMode && waitingBallCount === 0 && paddleState) {
      this.spawnBall([paddleState.x, 1, 23], null, gpu.flags.ballShadows);
    }
  }

  spawnBall(position, velocity = null, castShadow = false) {
    if (!this.ballScene) return;

    const gameState = this.singleton.get(GameState);
    const ball = this.ballScene.createInstance(this.world);
    ball.add(this.ballScene.animations['Take 001']);

    const transform = ball.get(Transform);
    transform.position = position;

    const body = new Physics2DBody('circle', transform.position[0], transform.position[2], 0.8, {
      friction: 0,
      restitution: 1,
      frictionAir: 0,
    });

    const ballState = new Ball();
    ballState.speed = 0.5 + gameState.level * 0.04;

    if (velocity) this.launchBall(ballState, body, velocity);

    // 💡 Dynamic light intensity + damage
    ball.add(
      ballState,
      transform,
      body,
      new PointLight({ color: ballState.color, intensity: ballState.glowIntensity, range: 30 }),
      new ImpactDamage(1)
    );

    if (castShadow) {
      ball.add(new ShadowCastingLight({ textureSize: 256, zNear: 0.8, zFar: 30 }));
    }

    ball.name = 'The Ball';
    return ball;
  }

  launchBall(ball, body, direction) {
    vec3.normalize(direction, direction);
    vec3.scale(direction, direction, ball.speed);
    Matter.Body.setVelocity(body.body, { x: direction[0], y: direction[2] });
    ball.waitingForLaunch = false;
  }
}
