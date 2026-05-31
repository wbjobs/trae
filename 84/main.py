import sys
import logging
import argparse
from typing import List, Optional

import numpy as np

from core import (
    HighPrecisionOrbitEngine,
    EngineConfig,
    PrecisionLevel,
    CelestialBody,
    OrbitalElements,
    CentralBody,
    OrbitParameterImporter,
    OrbitElementUnit,
    const,
    degrees_to_radians
)
from data_io import DataLoader, ObservationParser, ObservationData
from output import ResultExporter, Visualizer, ExportConfig, VisualizationConfig
from config import DEFAULT_CONFIG, DEFAULT_SIMULATION


def setup_logging(level: str = "INFO"):
    """设置日志"""
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler('orbit_calculation.log', encoding='utf-8')
        ]
    )


def create_sample_bodies() -> List[CelestialBody]:
    """创建示例天体"""
    bodies = []
    
    earth_orbital_elements = OrbitalElements(
        a=149.598e9,
        e=0.0167,
        i=0.0,
        omega=0.0,
        w=degrees_to_radians(114.207),
        M=degrees_to_radians(357.529),
        epoch=const.MJD_J2000,
        central_body=CentralBody.SUN
    )
    
    earth = CelestialBody(
        name="Earth_Satellite_1",
        mass=5.972e24,
        radius=const.R_EARTH,
        gm=const.GM_EARTH,
        elements=earth_orbital_elements
    )
    bodies.append(earth)
    
    sample_satellite = OrbitalElements(
        a=7000000.0,
        e=0.001,
        i=degrees_to_radians(55.0),
        omega=degrees_to_radians(0.0),
        w=degrees_to_radians(0.0),
        M=degrees_to_radians(0.0),
        epoch=const.MJD_J2000,
        central_body=CentralBody.EARTH
    )
    
    satellite = CelestialBody(
        name="Sample_Satellite",
        mass=1000.0,
        radius=1.0,
        gm=0,
        elements=sample_satellite
    )
    bodies.append(satellite)
    
    return bodies


def run_basic_simulation():
    """运行基础模拟"""
    print("=" * 60)
    print("天体轨道摄动偏差计算平台 - 基础模拟")
    print("=" * 60)
    
    engine_config = EngineConfig(
        precision=PrecisionLevel.MEDIUM,
        parallel=True,
        enable_logging=True,
        log_level="INFO"
    )
    
    engine = HighPrecisionOrbitEngine(engine_config)
    
    print("\n[1/6] 初始化计算引擎...")
    print(f"   - 精度级别: {engine.config.precision.value}")
    print(f"   - 启用摄动: {[p.name for p in engine.perturbation_config.enabled_perturbations]}")
    
    print("\n[2/6] 加载目标天体...")
    bodies = create_sample_bodies()
    for body in bodies:
        engine.add_target_body(body)
        print(f"   - 添加天体: {body.name}")
    
    start_mjd = const.MJD_J2000
    end_mjd = const.MJD_J2000 + 30
    
    print(f"\n[3/6] 传播轨道 (MJD {start_mjd:.2f} -> {end_mjd:.2f})...")
    propagation_results = engine.propagate_all(start_mjd, end_mjd)
    
    for name, result in propagation_results.items():
        print(f"   - {name}: {len(result.time)} 时间步, 时长 {result.time[-1] - result.time[0]:.2f} 天")
    
    print("\n[4/6] 计算轨道摄动偏差...")
    deviation_analyses = {}
    for name in propagation_results.keys():
        try:
            analysis = engine.compute_orbit_deviation(name, start_mjd, end_mjd)
            deviation_analyses[name] = analysis
            print(f"   - {name}: 平均位置偏差 {analysis.statistics.get('mean', 0):.3f} m")
        except Exception as e:
            print(f"   - {name}: 计算失败 - {e}")
    
    print("\n[5/6] 偏差拟合分析...")
    for name, analysis in deviation_analyses.items():
        try:
            fitting_results = engine.fit_deviation(name, "position")
            best_key, best_fit = engine.analyzer.select_best_fit(fitting_results)
            print(f"   - {name}: 最佳拟合 {best_key}, R²={best_fit.r_squared:.6f}, RMSE={best_fit.rmse:.3f} m")
        except Exception as e:
            print(f"   - {name}: 拟合失败 - {e}")
    
    print("\n[6/6] 导出结果...")
    exporter = ResultExporter(ExportConfig(output_dir="output"))
    visualizer = Visualizer(VisualizationConfig(output_dir="output"))
    
    for name, result in propagation_results.items():
        exporter.export_propagation_result(result)
    
    for name, analysis in deviation_analyses.items():
        exporter.export_deviation_analysis(analysis)
        exporter.generate_report(analysis)
        
        if name in propagation_results:
            visualizer.plot_orbit_3d(propagation_results[name])
        visualizer.plot_deviation_time(analysis)
        visualizer.create_dashboard(analysis)
    
    print("\n" + "=" * 60)
    print("模拟完成！结果已保存到 output/ 目录")
    print("=" * 60)
    
    return engine, propagation_results, deviation_analyses


def run_long_term_prediction():
    """运行长期偏差预测"""
    print("\n" + "=" * 60)
    print("长周期偏差预测")
    print("=" * 60)
    
    engine_config = EngineConfig(
        precision=PrecisionLevel.LOW,
        parallel=True,
        enable_logging=True
    )
    
    engine = HighPrecisionOrbitEngine(engine_config)
    
    bodies = create_sample_bodies()
    for body in bodies:
        engine.add_target_body(body)
    
    start_mjd = const.MJD_J2000
    end_mjd = const.MJD_J2000 + 365
    
    print(f"\n传播1年轨道数据 (MJD {start_mjd:.2f} -> {end_mjd:.2f})...")
    
    for name in engine.target_bodies.keys():
        try:
            analysis = engine.long_term_deviation_analysis(
                name, start_mjd, end_mjd, forecast_years=5.0
            )
            print(f"   - {name}: 完成长期分析与预测")
            print(f"     最大位置偏差: {np.max(analysis.position_deviation):.3f} m")
            
            if analysis.periodicity.get('has_periodicity', False):
                print(f"     主导周期: {analysis.periodicity.get('dominant_period', 0):.2f} 天")
            
        except Exception as e:
            print(f"   - {name}: 长期分析失败 - {e}")
    
    exporter = ResultExporter()
    visualizer = Visualizer()
    
    for name, analysis in engine.analysis_results.items():
        exporter.export_deviation_analysis(analysis, filename=f"{name}_long_term")
        
        for elem_type, forecast in analysis.forecast_results.items():
            exporter.export_forecast_result(forecast, name, elem_type)
            visualizer.plot_forecast(
                forecast, name, elem_type,
                analysis.time, analysis.position_deviation
            )
    
    print("\n长期预测完成！")


def run_multi_body_simulation():
    """运行多星体同步模拟"""
    print("\n" + "=" * 60)
    print("多星体同步轨道演算")
    print("=" * 60)
    
    engine_config = EngineConfig(
        precision=PrecisionLevel.MEDIUM,
        parallel=True
    )
    
    engine = HighPrecisionOrbitEngine(engine_config)
    
    importer = OrbitParameterImporter()
    
    satellite_data = [
        ("Satellite_A", 7000000.0, 0.001, 45.0, 0.0, 0.0, 0.0),
        ("Satellite_B", 8000000.0, 0.002, 60.0, 90.0, 45.0, 180.0),
        ("Satellite_C", 9000000.0, 0.001, 30.0, 180.0, 90.0, 270.0),
    ]
    
    for name, a, e, i_deg, omega_deg, w_deg, M_deg in satellite_data:
        body = importer.import_from_kepler_elements(
            name=name,
            a=a,
            e=e,
            i=i_deg,
            omega=omega_deg,
            w=w_deg,
            M=M_deg,
            epoch=const.MJD_J2000,
            central_body=CentralBody.EARTH,
            units={'angles': OrbitElementUnit.DEGREES}
        )
        engine.add_target_body(body)
    
    start_mjd = const.MJD_J2000
    end_mjd = const.MJD_J2000 + 7
    
    print(f"\n同步传播 {len(satellite_data)} 个星体 (MJD {start_mjd:.2f} -> {end_mjd:.2f})...")
    
    results = engine.multi_body_simulation(
        [name for name, *_ in satellite_data],
        start_mjd,
        end_mjd,
        mutual_perturbation=False
    )
    
    print("\n计算各星体轨道偏差...")
    analyses = engine.batch_analysis(
        [name for name, *_ in satellite_data],
        start_mjd,
        end_mjd
    )
    
    for name, analysis in analyses.items():
        print(f"   - {name}: 平均位置偏差 {analysis.statistics.get('mean', 0):.3f} m")
    
    print("\n生成多体对比图表...")
    visualizer = Visualizer()
    visualizer.plot_multi_body_orbits(results)
    visualizer.plot_multi_body_deviations(analyses)
    
    exporter = ResultExporter()
    exporter.export_batch_results(analyses, filename="multi_body_results")
    
    print("\n多星体同步模拟完成！")


def run_with_observation_calibration():
    """结合观测数据的校准模拟"""
    print("\n" + "=" * 60)
    print("观测数据校准模拟")
    print("=" * 60)
    
    engine_config = EngineConfig(precision=PrecisionLevel.MEDIUM)
    engine = HighPrecisionOrbitEngine(engine_config)
    
    bodies = create_sample_bodies()
    for body in bodies:
        engine.add_target_body(body)
    
    start_mjd = const.MJD_J2000
    end_mjd = const.MJD_J2000 + 10
    
    print("\n传播初始轨道...")
    result = engine.propagate("Sample_Satellite", start_mjd, end_mjd)
    
    print("\n生成模拟观测数据...")
    obs_times = np.linspace(start_mjd, end_mjd, 50)
    obs_positions = np.array([
        np.interp(obs_times, result.time, result.position[:, i])
        for i in range(3)
    ]).T
    
    noise = np.random.normal(0, 10.0, obs_positions.shape)
    obs_positions += noise
    
    print("   - 生成了 50 个带噪声的观测点 (σ=10m)")
    
    print("\n使用观测数据校准...")
    calibration = engine.calibrate_results(
        "Sample_Satellite",
        obs_times,
        obs_positions
    )
    
    print(f"   - 校准后平均残差: {calibration['mean_residual']:.3f} m")
    print(f"   - 校准后RMSE: {calibration['rmse']:.3f} m")
    print(f"   - 最大残差: {calibration['max_residual']:.3f} m")
    
    exporter = ResultExporter()
    exporter.export_batch_results({"calibration": calibration}, filename="calibration_result")
    
    print("\n校准完成！")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description="天体轨道摄动偏差计算平台",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python main.py basic                  # 运行基础模拟
  python main.py longterm               # 运行长期预测
  python main.py multibody              # 运行多体模拟
  python main.py calibration            # 运行观测校准
  python main.py all                    # 运行所有模块
        """
    )
    
    parser.add_argument(
        "mode",
        nargs="?",
        default="basic",
        choices=["basic", "longterm", "multibody", "calibration", "all"],
        help="运行模式 (默认: basic)"
    )
    
    parser.add_argument(
        "--precision",
        choices=["low", "medium", "high", "ultra"],
        default="medium",
        help="计算精度级别 (默认: medium)"
    )
    
    parser.add_argument(
        "--loglevel",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
        help="日志级别 (默认: INFO)"
    )
    
    args = parser.parse_args()
    
    setup_logging(args.loglevel)
    logger = logging.getLogger(__name__)
    
    precision_map = {
        "low": PrecisionLevel.LOW,
        "medium": PrecisionLevel.MEDIUM,
        "high": PrecisionLevel.HIGH,
        "ultra": PrecisionLevel.ULTRA
    }
    
    DEFAULT_CONFIG.precision = precision_map[args.precision]
    logger.info(f"使用精度级别: {args.precision}")
    
    try:
        if args.mode == "basic":
            run_basic_simulation()
        elif args.mode == "longterm":
            run_long_term_prediction()
        elif args.mode == "multibody":
            run_multi_body_simulation()
        elif args.mode == "calibration":
            run_with_observation_calibration()
        elif args.mode == "all":
            run_basic_simulation()
            run_long_term_prediction()
            run_multi_body_simulation()
            run_with_observation_calibration()
    
    except KeyboardInterrupt:
        print("\n\n用户中断，程序退出")
        sys.exit(0)
    except Exception as e:
        logger.error(f"运行出错: {e}", exc_info=True)
        print(f"\n运行出错: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
