#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import json
import argparse
import time
from typing import Dict, Optional

from core import (
    MeshGenerator, MeshConfig,
    ParameterIterator, IterationConfig, ParameterRange,
    ConvergenceChecker, ConvergenceCriteria,
    FluidSolver, SolverConfig,
    get_precision_info
)
from scheduler import (
    ResourceManager, ResourceConfig,
    TaskScheduler, TaskConfig, TaskPriority,
    ResourceMonitor, MonitorConfig
)
from storage import ResultStorage, StorageConfig, ResultExporter, ExportConfig


def load_config(config_path: str) -> Dict:
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def create_mesh_config(config: Dict) -> MeshConfig:
    mesh_cfg = config.get("mesh", {})
    return MeshConfig(
        nx=mesh_cfg.get("nx", 100),
        ny=mesh_cfg.get("ny", 100),
        nz=mesh_cfg.get("nz", 1),
        x_min=mesh_cfg.get("x_min", 0.0),
        x_max=mesh_cfg.get("x_max", 1.0),
        y_min=mesh_cfg.get("y_min", 0.0),
        y_max=mesh_cfg.get("y_max", 1.0),
        z_min=mesh_cfg.get("z_min", 0.0),
        z_max=mesh_cfg.get("z_max", 1.0),
        mesh_type=mesh_cfg.get("mesh_type", "structured"),
        refinement_level=mesh_cfg.get("refinement_level", 1)
    )


def create_solver_config(config: Dict) -> SolverConfig:
    solver_cfg = config.get("solver", {})
    gravity = tuple(solver_cfg.get("gravity", [0.0, -9.81, 0.0]))
    return SolverConfig(
        solver_type=solver_cfg.get("solver_type", "navier_stokes"),
        time_integration=solver_cfg.get("time_integration", "implicit"),
        relaxation_factor=solver_cfg.get("relaxation_factor", 0.3),
        cfl_number=solver_cfg.get("cfl_number", 0.5),
        viscosity=solver_cfg.get("viscosity", 1e-3),
        density=solver_cfg.get("density", 1.0),
        gravity=gravity,
        boundary_conditions=solver_cfg.get("boundary_conditions", {})
    )


def create_convergence_criteria(config: Dict) -> ConvergenceCriteria:
    conv_cfg = config.get("convergence", {})
    return ConvergenceCriteria(
        absolute_tolerance=conv_cfg.get("absolute_tolerance", 1e-6),
        relative_tolerance=conv_cfg.get("relative_tolerance", 1e-4),
        max_residual=conv_cfg.get("max_residual", 1e10),
        min_window_size=conv_cfg.get("min_window_size", 5),
        oscillation_threshold=conv_cfg.get("oscillation_threshold", 0.1),
        required_consecutive=conv_cfg.get("required_consecutive", 3)
    )


def create_iteration_config(config: Dict) -> IterationConfig:
    iter_cfg = config.get("iteration", {})
    return IterationConfig(
        max_iterations=iter_cfg.get("max_iterations", 1000),
        convergence_threshold=iter_cfg.get("convergence_threshold", 1e-6),
        relaxation_factor=iter_cfg.get("relaxation_factor", 0.3),
        adaptive_stepping=iter_cfg.get("adaptive_stepping", True),
        min_step_size=iter_cfg.get("min_step_size", 1e-8),
        max_step_size=iter_cfg.get("max_step_size", 1.0)
    )


def create_resource_config(config: Dict) -> ResourceConfig:
    sched_cfg = config.get("scheduler", {})
    return ResourceConfig(
        max_cpu_cores=sched_cfg.get("max_cpu_cores", 0),
        max_memory_gb=sched_cfg.get("max_memory_gb", 0.0),
        cpu_threshold=sched_cfg.get("cpu_threshold", 80.0),
        memory_threshold=sched_cfg.get("memory_threshold", 80.0),
        reserve_cores=sched_cfg.get("reserve_cores", 1),
        reserve_memory_gb=sched_cfg.get("reserve_memory_gb", 1.0),
        enable_dynamic_allocation=True
    )


def create_storage_config(config: Dict) -> StorageConfig:
    storage_cfg = config.get("storage", {})
    return StorageConfig(
        base_dir=storage_cfg.get("base_dir", "results"),
        use_hdf5=storage_cfg.get("use_hdf5", True),
        compression=storage_cfg.get("compression", True),
        save_initial_state=storage_cfg.get("save_initial_state", True),
        save_final_state=storage_cfg.get("save_final_state", True),
        save_residual_history=storage_cfg.get("save_residual_history", True),
        save_mesh_data=storage_cfg.get("save_mesh_data", True)
    )


def create_monitor_config(config: Dict) -> MonitorConfig:
    mon_cfg = config.get("monitoring", {})
    return MonitorConfig(
        log_dir=mon_cfg.get("log_dir", "logs"),
        log_file=mon_cfg.get("log_file", "resource_monitor.log"),
        polling_interval=mon_cfg.get("polling_interval", 1.0),
        enable_csv_log=mon_cfg.get("enable_csv_log", True),
        enable_console_log=mon_cfg.get("enable_console_log", True),
        alert_cpu_threshold=mon_cfg.get("alert_cpu_threshold", 90.0),
        alert_memory_threshold=mon_cfg.get("alert_memory_threshold", 90.0),
        alert_disk_threshold=mon_cfg.get("alert_disk_threshold", 90.0)
    )


def create_export_config(config: Dict) -> ExportConfig:
    exp_cfg = config.get("export", {})
    return ExportConfig(
        export_dir=exp_cfg.get("export_dir", "exports"),
        formats=exp_cfg.get("formats", ["csv", "json", "hdf5"]),
        include_residuals=exp_cfg.get("include_residuals", True),
        include_field_data=exp_cfg.get("include_field_data", True),
        downsample_factor=exp_cfg.get("downsample_factor", 1),
        image_dpi=exp_cfg.get("image_dpi", 150),
        image_format=exp_cfg.get("image_format", "png"),
        compression_level=exp_cfg.get("compression_level", 6)
    )


def run_single_simulation(config: Dict, task_name: Optional[str] = None,
                           task_params: Optional[Dict] = None,
                           monitor: Optional[ResourceMonitor] = None) -> Dict:
    print(f"{'='*60}")
    print(f"开始仿真: {task_name or 'default'}")
    print(f"{'='*60}")

    precision_info = get_precision_info()
    print(f"浮点精度: {precision_info['precision']}, "
          f"Numba加速: {'已启用' if precision_info['numba_enabled'] else '未启用'}")

    mesh_config = create_mesh_config(config)
    solver_config = create_solver_config(config)
    convergence_criteria = create_convergence_criteria(config)
    iteration_config = create_iteration_config(config)

    if task_params and "viscosity" in task_params:
        solver_config.viscosity = task_params["viscosity"]

    checkpoint_cfg = config.get("checkpointing", {})
    export_cfg = config.get("export", {})

    print("[1/5] 生成网格...")
    mesh_gen = MeshGenerator(mesh_config)
    mesh = mesh_gen.generate_structured_mesh()
    print(f"  网格节点数: {mesh.node_count}, 单元数: {mesh.element_count}")
    print(f"  网格质量 (平均): {mesh.quality_metrics.get('avg_quality', 'N/A')}")

    print("[2/5] 初始化求解器...")
    solver = FluidSolver(mesh, solver_config)
    solver.initialize_state()
    print(f"  求解器类型: {solver_config.solver_type}")
    print(f"  粘度: {solver_config.viscosity}, 密度: {solver_config.density}")

    if checkpoint_cfg.get("enabled", False):
        checkpoint_dir = os.path.join(checkpoint_cfg.get("checkpoint_dir", "checkpoints"),
                                      task_name or "default")
        solver.enable_checkpointing(checkpoint_dir, checkpoint_cfg.get("interval", 50))
        if checkpoint_cfg.get("auto_resume", False):
            latest = solver.find_latest_checkpoint()
            if latest:
                start_iter = solver.load_checkpoint(latest)
                print(f"  从检查点恢复: 迭代 {start_iter}")

    print("[3/5] 开始迭代计算...")
    param_iterator = ParameterIterator(iteration_config)
    param_iterator.start_iteration()

    convergence = ConvergenceChecker(convergence_criteria)

    storage = ResultStorage(create_storage_config(config))
    storage.initialize_task(task_name or "default", task_name or "default", task_params or {})

    start_time = time.time()
    max_iterations = iteration_config.max_iterations
    start_iteration = solver.state.iteration if solver.state else 0

    if monitor:
        monitor.log_task_event(task_name or "default", "开始执行",
                                f"最大迭代: {max_iterations}")

    for iteration in range(start_iteration, max_iterations):
        residual = solver.solve_step()
        param_iterator.record_iteration(
            type('obj', (object,), {'param_id': f'iter_{iteration}'})(),
            residual.mass_residual
        )

        status = convergence.check_convergence(residual)

        if iteration % config.get("storage", {}).get("save_interval", 10) == 0:
            storage.save_snapshot(task_name or "default", iteration, solver.state, residual)
            elapsed = time.time() - start_time
            progress = (iteration + 1) / max_iterations * 100
            print(f"  迭代 {iteration:4d}: 质量残差={residual.mass_residual:.2e}, "
                  f"动量残差={residual.momentum_residual:.2e}, "
                  f"进度={progress:.1f}%, 耗时={elapsed:.1f}s")

            if monitor:
                monitor.log_solver_metrics(
                    iteration,
                    {"mass": residual.mass_residual, "momentum": residual.momentum_residual},
                    elapsed / (iteration - start_iteration + 1)
                )

        if status.value == "converged":
            print(f"  收敛达成! 迭代次数: {iteration}")
            if monitor:
                monitor.log_task_event(task_name or "default", "收敛", f"迭代 {iteration}")
            break

        if status.value == "diverged":
            print(f"  发散! 迭代次数: {iteration}")
            if monitor:
                monitor.log_task_event(task_name or "default", "发散", f"迭代 {iteration}")
            break

        if status.value == "oscillating":
            print(f"  振荡检测! 迭代次数: {iteration}")

        if not param_iterator.should_continue(residual.mass_residual):
            break

    total_time = time.time() - start_time
    final_metrics = solver.get_state_dict()
    conv_metrics = convergence.get_convergence_metrics()

    print("[4/5] 保存结果...")
    storage.finalize_task(task_name or "default", final_metrics, conv_metrics)

    print("[5/5] 导出结果...")
    export_results = []
    if export_cfg.get("enabled", False):
        exporter = ResultExporter(create_export_config(config))
        export_results = exporter.export_task(
            task_name or "default",
            {"task_name": task_name, "total_time": total_time, **final_metrics},
            config.get("storage", {}).get("base_dir", "results")
        )
        for result in export_results:
            if result.success:
                print(f"  ✓ {result.format.upper()}: {result.filepath} ({result.size_bytes/1024:.1f} KB)")
            else:
                print(f"  ✗ {result.format.upper()}: {result.error_message}")

    if monitor:
        monitor.log_task_event(task_name or "default", "完成",
                                f"总耗时: {total_time:.2f}s, 状态: {conv_metrics.get('status', 'unknown')}")

    print(f"\n仿真完成! 总耗时: {total_time:.2f}s")
    print(f"最终状态: {conv_metrics.get('status', 'unknown')}")
    print(f"结果路径: {storage.get_task_path(task_name or 'default')}")

    return {
        "task_name": task_name,
        "total_time": total_time,
        "iterations": solver.state.iteration if solver.state else 0,
        "status": conv_metrics.get("status", "unknown"),
        "final_metrics": final_metrics,
        "result_path": storage.get_task_path(task_name or "default"),
        "export_results": [r.to_dict() for r in export_results]
    }


def run_batch_simulation(config: Dict):
    print(f"{'='*60}")
    print("批量流体力学仿真计算")
    print(f"{'='*60}")

    resource_config = create_resource_config(config)
    resource_manager = ResourceManager(resource_config)
    max_workers = config.get("scheduler", {}).get("max_workers", 4)

    print(f"系统资源: {resource_manager._total_cores} 核心, {resource_manager._total_memory_gb:.1f} GB 内存")
    print(f"调度器配置: 最大并行任务数 = {max_workers}")

    scheduler = TaskScheduler(resource_manager, max_workers=max_workers)
    scheduler.start()

    tasks = config.get("tasks", [])
    task_ids = []

    print(f"\n提交 {len(tasks)} 个任务...")
    for task_def in tasks:
        task_config = TaskConfig(
            mesh_config=create_mesh_config(config),
            iteration_config=create_iteration_config(config),
            solver_config=create_solver_config(config),
            convergence_criteria=create_convergence_criteria(config),
            estimated_iterations=task_def.get("estimated_iterations", 100),
            save_interval=config.get("storage", {}).get("save_interval", 10)
        )

        priority_str = task_def.get("priority", "NORMAL")
        priority = TaskPriority[priority_str] if priority_str in TaskPriority.__members__ else TaskPriority.NORMAL

        task_id = scheduler.submit_task(
            name=task_def["name"],
            config=task_config,
            priority=priority,
            parameters=task_def.get("parameters", {})
        )
        task_ids.append(task_id)
        print(f"  已提交: {task_def['name']} (优先级: {priority_str})")

    print(f"\n开始执行任务，按 Ctrl+C 停止...")
    try:
        while True:
            stats = scheduler.get_scheduler_stats()
            resource_stats = resource_manager.get_resource_summary()

            print(f"\r队列: {stats['queued']} | "
                  f"运行: {stats['running']} | "
                  f"完成: {stats['completed']} | "
                  f"失败: {stats['failed']} | "
                  f"CPU: {resource_stats['cpu_percent']:.0f}% | "
                  f"内存: {resource_stats['memory_percent']:.0f}%", end="")

            if stats["queued"] == 0 and stats["running"] == 0:
                break

            time.sleep(2.0)

    except KeyboardInterrupt:
        print("\n\n收到停止信号，正在关闭...")
        scheduler.stop(wait_for_tasks=False)

    print(f"\n\n{'='*60}")
    print("任务执行摘要:")
    print(f"{'='*60}")

    for task_id in task_ids:
        task = scheduler.get_task_status(task_id)
        if task:
            duration = 0.0
            if task.started_at and task.completed_at:
                duration = task.completed_at - task.started_at
            print(f"  {task.name}: {task.status.value} "
                  f"(进度: {task.progress*100:.0f}%, 耗时: {duration:.1f}s)")

    scheduler.stop(wait_for_tasks=True)

    print("\n批量仿真完成!")
    return scheduler.get_scheduler_stats()


def run_parameter_sweep(config: Dict):
    sweep_config = config.get("parameter_sweep", {})
    if not sweep_config.get("enabled", False):
        print("参数扫描未启用，跳过。")
        return

    print(f"{'='*60}")
    print("参数扫描仿真")
    print(f"{'='*60}")

    param_iterator = ParameterIterator()
    param_iterator.config.sweep_mode = sweep_config.get("sweep_mode", "cartesian")

    for param_def in sweep_config.get("parameters", []):
        param_range = ParameterRange(
            name=param_def["name"],
            min_value=param_def["min"],
            max_value=param_def["max"],
            num_samples=param_def.get("num_samples", 10),
            distribution=param_def.get("distribution", "linear")
        )
        param_iterator.add_parameter_range(param_range)

    param_sets = param_iterator.generate_parameter_sets()
    print(f"生成 {len(param_sets)} 个参数组合")

    results = []
    for i, param_set in enumerate(param_sets):
        print(f"\n参数组合 {i+1}/{len(param_sets)}: {param_set.parameters}")
        task_config = config.copy()
        if "viscosity" in param_set.parameters:
            task_config["solver"]["viscosity"] = param_set.parameters["viscosity"]
        if "relaxation_factor" in param_set.parameters:
            task_config["solver"]["relaxation_factor"] = param_set.parameters["relaxation_factor"]

        result = run_single_simulation(task_config, task_name=f"sweep_{param_set.param_id}",
                                        task_params=param_set.parameters)
        results.append(result)

    print(f"\n参数扫描完成，共执行 {len(results)} 个仿真")
    return results


def main():
    parser = argparse.ArgumentParser(description="流体力学离线仿真计算系统")
    parser.add_argument("-c", "--config", default="config/simulation_config.json",
                        help="配置文件路径")
    parser.add_argument("-m", "--mode", choices=["single", "batch", "sweep"], default="single",
                        help="运行模式: single=单仿真, batch=批量任务, sweep=参数扫描")
    parser.add_argument("-t", "--task", help="指定运行单个任务的名称")
    parser.add_argument("--no-monitor", action="store_true", help="禁用资源监控")
    parser.add_argument("--export", action="store_true", help="导出已完成任务的结果")
    parser.add_argument("--export-formats", default=None, help="指定导出格式, 用逗号分隔")

    args = parser.parse_args()

    if not os.path.exists(args.config):
        print(f"错误: 配置文件不存在: {args.config}")
        sys.exit(1)

    config = load_config(args.config)
    print(f"项目: {config.get('project_name', 'FluidDynamics')} v{config.get('version', '1.0')}")
    print(f"描述: {config.get('description', '')}")

    monitor = None
    if not args.no_monitor and config.get("monitoring", {}).get("enabled", True):
        monitor = ResourceMonitor(create_monitor_config(config))
        monitor.start()
        print("资源监控已启动")

    try:
        if args.export:
            print("\n开始批量导出结果...")
            exporter_config = create_export_config(config)
            if args.export_formats:
                exporter_config.formats = args.export_formats.split(",")
            exporter = ResultExporter(exporter_config)
            results = exporter.export_all_tasks(config.get("storage", {}).get("base_dir", "results"))
            for task_id, exports in results.items():
                print(f"\n任务 {task_id}:")
                for exp in exports:
                    status = "✓" if exp.success else "✗"
                    print(f"  {status} {exp.format}: {exp.filepath}")
            print(f"\n导出完成! 总导出: {sum(len(e) for e in results.values())} 个文件")
            return

        if args.mode == "single":
            if args.task:
                task_def = next((t for t in config.get("tasks", []) if t["name"] == args.task), None)
                if task_def:
                    run_single_simulation(config, task_name=task_def["name"],
                                           task_params=task_def.get("parameters", {}),
                                           monitor=monitor)
                else:
                    print(f"错误: 未找到任务 '{args.task}'")
                    sys.exit(1)
            else:
                run_single_simulation(config, monitor=monitor)

        elif args.mode == "batch":
            run_batch_simulation(config)

        elif args.mode == "sweep":
            run_parameter_sweep(config)

    except KeyboardInterrupt:
        print("\n\n用户中断，程序退出。")
        if monitor:
            monitor.stop()
        sys.exit(0)
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
        if monitor:
            monitor.stop()
        sys.exit(1)
    finally:
        if monitor:
            monitor.stop()
            print("\n资源监控已停止")
            stats = monitor.get_stats_summary()
            if stats:
                print(f"监控统计: CPU平均 {stats.get('cpu_avg', 0):.1f}%, "
                      f"内存平均 {stats.get('memory_avg', 0):.1f}%")


if __name__ == "__main__":
    main()
