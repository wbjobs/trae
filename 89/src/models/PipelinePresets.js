import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import PipelineModel from './PipelineModel.js';

class PipelinePresets {
  static createComplexPipeline(pipelineModel) {
    const pipeOptions = { radius: 2, segments: 16 };

    const mainLinePoints = [
      new THREE.Vector3(-80, 0, 0),
      new THREE.Vector3(-50, 0, 0),
      new THREE.Vector3(-30, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(30, 0, 0),
      new THREE.Vector3(50, 0, 0),
      new THREE.Vector3(80, 0, 0),
    ];

    for (let i = 0; i < mainLinePoints.length - 1; i++) {
      pipelineModel.createPipe(mainLinePoints[i], mainLinePoints[i + 1], {
        ...pipeOptions,
        id: `main_pipe_${i}`,
        name: `主管道-${i + 1}`,
      });
    }

    for (let i = 1; i < mainLinePoints.length - 1; i++) {
      pipelineModel.createJoint(mainLinePoints[i], {
        radius: 3,
        id: `main_joint_${i}`,
        name: `主接头-${i}`,
      });
    }

    const branch1Points = [
      new THREE.Vector3(-50, 0, 0),
      new THREE.Vector3(-50, 20, 0),
      new THREE.Vector3(-50, 20, 30),
      new THREE.Vector3(-50, 20, 50),
    ];

    for (let i = 0; i < branch1Points.length - 1; i++) {
      pipelineModel.createPipe(branch1Points[i], branch1Points[i + 1], {
        ...pipeOptions,
        color: 0x3cb371,
        id: `branch1_pipe_${i}`,
        name: `分支管道1-${i + 1}`,
      });
    }

    pipelineModel.createJoint(new THREE.Vector3(-50, 20, 0), {
      radius: 2.5,
      color: 0x6b8e23,
      id: 'branch1_joint_1',
      name: '分支接头1-1',
    });
    pipelineModel.createJoint(new THREE.Vector3(-50, 20, 30), {
      radius: 2.5,
      color: 0x6b8e23,
      id: 'branch1_joint_2',
      name: '分支接头1-2',
    });

    pipelineModel.createValve(new THREE.Vector3(-50, 10, 0), {
      radius: 2.5,
      height: 6,
      id: 'valve_1',
      name: '控制阀-1',
    });

    const branch2Points = [
      new THREE.Vector3(30, 0, 0),
      new THREE.Vector3(30, -25, 0),
      new THREE.Vector3(60, -25, 0),
      new THREE.Vector3(60, -25, 40),
    ];

    for (let i = 0; i < branch2Points.length - 1; i++) {
      pipelineModel.createPipe(branch2Points[i], branch2Points[i + 1], {
        ...pipeOptions,
        color: 0xdaa520,
        id: `branch2_pipe_${i}`,
        name: `分支管道2-${i + 1}`,
      });
    }

    pipelineModel.createJoint(new THREE.Vector3(30, -25, 0), {
      radius: 2.5,
      color: 0xb8860b,
      id: 'branch2_joint_1',
      name: '分支接头2-1',
    });
    pipelineModel.createJoint(new THREE.Vector3(60, -25, 0), {
      radius: 2.5,
      color: 0xb8860b,
      id: 'branch2_joint_2',
      name: '分支接头2-2',
    });

    pipelineModel.createValve(new THREE.Vector3(45, -25, 0), {
      radius: 2.5,
      height: 6,
      id: 'valve_2',
      name: '控制阀-2',
    });

    const branch3Points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 30, 0),
      new THREE.Vector3(-20, 30, 0),
      new THREE.Vector3(-20, 30, -30),
      new THREE.Vector3(20, 30, -30),
      new THREE.Vector3(20, 30, 0),
      new THREE.Vector3(0, 30, 0),
    ];

    for (let i = 0; i < branch3Points.length - 1; i++) {
      pipelineModel.createPipe(branch3Points[i], branch3Points[i + 1], {
        ...pipeOptions,
        color: 0x8b4513,
        id: `branch3_pipe_${i}`,
        name: `分支管道3-${i + 1}`,
      });
    }

    pipelineModel.createPump(new THREE.Vector3(0, 15, 0), {
      radius: 4,
      height: 8,
      id: 'pump_1',
      name: '循环泵-1',
      isRunning: true,
    });

    pipelineModel.createPump(new THREE.Vector3(-50, 20, 50), {
      radius: 3.5,
      height: 7,
      id: 'pump_2',
      name: '加压泵-2',
      isRunning: false,
    });

    const verticalPoints = [
      new THREE.Vector3(-80, 0, 0),
      new THREE.Vector3(-80, 40, 0),
      new THREE.Vector3(-80, 40, 30),
      new THREE.Vector3(-80, 0, 30),
    ];

    for (let i = 0; i < verticalPoints.length - 1; i++) {
      pipelineModel.createPipe(verticalPoints[i], verticalPoints[i + 1], {
        ...pipeOptions,
        color: 0x20b2aa,
        id: `vertical_pipe_${i}`,
        name: `竖向管道-${i + 1}`,
      });
    }

    return pipelineModel;
  }

  static createSimpleDemoPipeline(pipelineModel) {
    const pipeOptions = { radius: 2, segments: 16 };

    const points = [
      new THREE.Vector3(-60, 0, 0),
      new THREE.Vector3(-30, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(30, 0, 0),
      new THREE.Vector3(60, 0, 0),
      new THREE.Vector3(60, 25, 0),
      new THREE.Vector3(0, 25, 0),
      new THREE.Vector3(-60, 25, 0),
      new THREE.Vector3(-60, 0, 0),
    ];

    for (let i = 0; i < points.length - 1; i++) {
      pipelineModel.createPipe(points[i], points[i + 1], {
        ...pipeOptions,
        id: `demo_pipe_${i}`,
        name: `演示管道-${i + 1}`,
      });
    }

    for (let i = 1; i < points.length - 1; i++) {
      pipelineModel.createJoint(points[i], {
        radius: 2.8,
        id: `demo_joint_${i}`,
        name: `演示接头-${i}`,
      });
    }

    pipelineModel.createPump(new THREE.Vector3(-30, 0, 0), {
      radius: 4,
      height: 8,
      id: 'demo_pump',
      name: '主循环泵',
      isRunning: true,
    });

    pipelineModel.createValve(new THREE.Vector3(30, 0, 0), {
      radius: 2.5,
      height: 6,
      id: 'demo_valve',
      name: '流量控制阀',
    });

    return pipelineModel;
  }

  static createGridPipeline(pipelineModel) {
    const pipeOptions = { radius: 1.5, segments: 12 };
    const gridSize = 20;
    const gridCount = 5;

    for (let i = 0; i <= gridCount; i++) {
      const start = new THREE.Vector3(-gridSize * gridCount / 2, 0, -gridSize * i + gridSize * gridCount / 2);
      const end = new THREE.Vector3(gridSize * gridCount / 2, 0, -gridSize * i + gridSize * gridCount / 2);
      pipelineModel.createPipe(start, end, {
        ...pipeOptions,
        id: `grid_h_${i}`,
        name: `水平管道-${i + 1}`,
      });
    }

    for (let i = 0; i <= gridCount; i++) {
      const start = new THREE.Vector3(-gridSize * i + gridSize * gridCount / 2, 0, gridSize * gridCount / 2);
      const end = new THREE.Vector3(-gridSize * i + gridSize * gridCount / 2, 0, -gridSize * gridCount / 2);
      pipelineModel.createPipe(start, end, {
        ...pipeOptions,
        color: 0x9370db,
        id: `grid_v_${i}`,
        name: `垂直管道-${i + 1}`,
      });
    }

    for (let i = 0; i <= gridCount; i++) {
      for (let j = 0; j <= gridCount; j++) {
        const pos = new THREE.Vector3(
          -gridSize * i + gridSize * gridCount / 2,
          0,
          -gridSize * j + gridSize * gridCount / 2
        );
        if (i === 0 || i === gridCount || j === 0 || j === gridCount) {
          if (!(i === 0 && j === 0) && !(i === gridCount && j === gridCount)) {
            pipelineModel.createJoint(pos, {
              radius: 2,
              id: `grid_joint_${i}_${j}`,
              name: `网格接头-${i}-${j}`,
            });
          }
        }
      }
    }

    return pipelineModel;
  }
}

export default PipelinePresets;
