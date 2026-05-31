import sys
import numpy as np

print("=" * 60)
print("天体轨道摄动计算平台 - 修复验证测试")
print("=" * 60)

passed_tests = 0
failed_tests = 0

def run_test(test_name, test_func):
    global passed_tests, failed_tests
    try:
        result = test_func()
        if result:
            print(f"✓ {test_name}: 通过")
            passed_tests += 1
        else:
            print(f"✗ {test_name}: 失败")
            failed_tests += 1
    except Exception as e:
        print(f"✗ {test_name}: 异常 - {e}")
        failed_tests += 1

print("\n[1/6] 测试天文单位换算模块...")
def test_unit_conversion():
    from core import const, degrees_to_radians, velocity_to_orbital_elements, orbital_elements_to_velocity
    
    assert abs(const.AU - 149597870700.0) < 1e-6, "AU常数错误"
    assert abs(const.GM_EARTH - 3.986004418e14) < 1e6, "GM_EARTH常数错误"
    
    rad = degrees_to_radians(180.0)
    assert abs(rad - np.pi) < 1e-10, "角度转弧度错误"
    
    a = 7000000.0
    e = 0.001
    i = degrees_to_radians(55.0)
    omega = 0.0
    w = 0.0
    f = 0.0
    gm = const.GM_EARTH
    
    r, v = orbital_elements_to_velocity(a, e, i, omega, w, f, gm)
    assert r.shape == (3,), "位置矢量形状错误"
    assert v.shape == (3,), "速度矢量形状错误"
    assert not np.any(np.isnan(r)), "位置矢量包含NaN"
    assert not np.any(np.isnan(v)), "速度矢量包含NaN"
    
    a2, e2, i2, omega2, w2, f2 = velocity_to_orbital_elements(r, v, gm)
    assert abs(a2 - a) / a < 1e-6, "半长轴转换误差过大"
    assert abs(e2 - e) < 1e-6, "偏心率转换误差过大"
    
    return True

run_test("天文单位换算", test_unit_conversion)

print("\n[2/6] 测试大尺度轨道数据导入...")
def test_orbit_import():
    from core import OrbitParameterImporter, CentralBody, OrbitElementUnit, const
    
    importer = OrbitParameterImporter()
    
    body = importer.import_from_kepler_elements(
        name="Test_Satellite",
        a=7000000.0,
        e=0.001,
        i=55.0,
        omega=0.0,
        w=0.0,
        M=0.0,
        epoch=const.MJD_J2000,
        central_body=CentralBody.EARTH,
        units={'angles': OrbitElementUnit.DEGREES}
    )
    
    assert body.name == "Test_Satellite", "名称错误"
    assert body.elements.a == 7000000.0, "半长轴错误"
    assert abs(body.elements.e - 0.001) < 1e-10, "偏心率错误"
    assert body.elements.central_body == CentralBody.EARTH, "中心天体错误"
    
    try:
        importer.import_from_kepler_elements(
            name="Invalid_Body",
            a=100.0,
            e=0.001,
            i=0.0,
            omega=0.0,
            w=0.0,
            M=0.0,
            epoch=const.MJD_J2000
        )
        assert False, "应该抛出半长轴过小的异常"
    except ValueError:
        pass
    
    try:
        importer.import_from_kepler_elements(
            name="Invalid_Body",
            a=7000000.0,
            e=1.5,
            i=0.0,
            omega=0.0,
            w=0.0,
            M=0.0,
            epoch=const.MJD_J2000
        )
        assert False, "应该抛出偏心率过大的异常"
    except ValueError:
        pass
    
    return True

run_test("大尺度轨道数据导入", test_orbit_import)

print("\n[3/6] 测试摄动计算模块...")
def test_perturbation():
    from core import const, PerturbationCalculator, PerturbationConfig, PerturbationType
    
    config = PerturbationConfig(
        enabled_perturbations=[PerturbationType.J2]
    )
    calc = PerturbationCalculator(config)
    
    r = np.array([7000000.0, 0.0, 0.0])
    v = np.array([0.0, 7500.0, 0.0])
    mjd = const.MJD_J2000
    
    result = calc.calculate_total_acceleration(r, v, mjd, const.GM_EARTH)
    
    assert result.total.shape == (3,), "摄动加速度形状错误"
    assert not np.any(np.isnan(result.total)), "摄动加速度包含NaN"
    assert not np.any(np.isinf(result.total)), "摄动加速度包含Inf"
    
    r_small = np.array([1e-15, 0.0, 0.0])
    result_small = calc.calculate_total_acceleration(r_small, v, mjd, const.GM_EARTH)
    assert np.all(result_small.total == 0), "小位置应该返回零加速度"
    
    return True

run_test("摄动计算模块", test_perturbation)

print("\n[4/6] 测试偏差拟合精度...")
def test_deviation_fitting():
    from core import DeviationAnalyzer, DeviationData
    
    analyzer = DeviationAnalyzer()
    
    np.random.seed(42)
    n_points = 100
    time = np.linspace(51544.5, 51545.5, n_points)
    deviation = 0.1 * time + 5.0 + np.random.normal(0, 0.01, n_points)
    
    analyzer.add_deviation_data(
        key="test",
        time=time,
        deviation=deviation
    )
    
    data = analyzer.deviations["test"]
    fit_result = analyzer.fit_polynomial(data, degree=1)
    
    assert fit_result.r_squared > 0.99, f"线性拟合R²过低: {fit_result.r_squared}"
    assert fit_result.rmse < 0.02, f"线性拟合RMSE过大: {fit_result.rmse}"
    
    coefficients = fit_result.coefficients
    expected_slope = 0.1
    actual_slope = coefficients[0]
    assert abs(actual_slope - expected_slope) < 0.01, f"斜率误差过大: {actual_slope} vs {expected_slope}"
    
    new_time = np.array([51544.5, 51545.0, 51545.5])
    predicted = fit_result.model(new_time)
    assert not np.any(np.isnan(predicted)), "预测值包含NaN"
    
    return True

run_test("偏差拟合精度", test_deviation_fitting)

print("\n[5/6] 测试批量传播模块...")
def test_batch_propagation():
    from core import (
        HighPrecisionOrbitEngine, EngineConfig, PrecisionLevel,
        CelestialBody, OrbitalElements, CentralBody, const, degrees_to_radians
    )
    
    engine = HighPrecisionOrbitEngine(EngineConfig(
        precision=PrecisionLevel.LOW,
        parallel=False,
        enable_logging=False
    ))
    
    elements = OrbitalElements(
        a=7000000.0,
        e=0.001,
        i=degrees_to_radians(55.0),
        omega=0.0,
        w=0.0,
        M=0.0,
        epoch=const.MJD_J2000,
        central_body=CentralBody.EARTH
    )
    
    body = CelestialBody(
        name="Test_Sat",
        mass=1000.0,
        radius=1.0,
        gm=0,
        elements=elements
    )
    engine.add_target_body(body)
    
    start_mjd = const.MJD_J2000
    end_mjd = const.MJD_J2000 + 0.1
    
    result = engine.propagate("Test_Sat", start_mjd, end_mjd, include_perturbations=False)
    
    assert len(result.time) > 0, "传播结果为空"
    assert result.position.shape[0] == len(result.time), "位置数据长度不匹配"
    assert not np.any(np.isnan(result.position)), "位置包含NaN"
    assert not np.any(np.isinf(result.position)), "位置包含Inf"
    
    r_mags = np.linalg.norm(result.position, axis=1)
    assert np.all(r_mags > 6000000), "轨道高度异常"
    
    return True

run_test("批量传播模块", test_batch_propagation)

print("\n[6/6] 测试关联运算和数值稳定性...")
def test_numerical_stability():
    from core import (
        HighPrecisionOrbitEngine, EngineConfig, PrecisionLevel,
        CelestialBody, OrbitalElements, CentralBody, const, degrees_to_radians
    )
    
    engine = HighPrecisionOrbitEngine(EngineConfig(
        precision=PrecisionLevel.LOW,
        parallel=False,
        enable_logging=False
    ))
    
    elements = OrbitalElements(
        a=7000000.0,
        e=0.001,
        i=degrees_to_radians(55.0),
        omega=0.0,
        w=0.0,
        M=0.0,
        epoch=const.MJD_J2000,
        central_body=CentralBody.EARTH
    )
    
    body = CelestialBody(
        name="Stability_Test",
        mass=1000.0,
        radius=1.0,
        gm=0,
        elements=elements
    )
    engine.add_target_body(body)
    
    start_mjd = const.MJD_J2000
    end_mjd = const.MJD_J2000 + 1.0
    
    try:
        analysis = engine.compute_orbit_deviation("Stability_Test", start_mjd, end_mjd)
        
        assert len(analysis.time) > 0, "偏差分析结果为空"
        assert not np.any(np.isnan(analysis.position_deviation)), "位置偏差包含NaN"
        assert not np.any(np.isinf(analysis.position_deviation)), "位置偏差包含Inf"
        
        assert 'mean' in analysis.statistics, "缺少mean统计量"
        assert 'rmse' in analysis.statistics, "缺少rmse统计量"
        
        fit_results = engine.fit_deviation("Stability_Test", "position")
        assert len(fit_results) > 0, "拟合结果为空"
        
        best_key, best_result = engine.analyzer.select_best_fit(fit_results)
        assert best_result.r_squared > 0.5, f"最佳拟合R²过低: {best_result.r_squared}"
        
        return True
    except Exception as e:
        print(f"  关联运算测试异常: {e}")
        return False

run_test("关联运算和数值稳定性", test_numerical_stability)

print("\n" + "=" * 60)
print(f"测试完成: {passed_tests}/{passed_tests + failed_tests} 通过")
print("=" * 60)

if failed_tests > 0:
    print(f"\n有 {failed_tests} 个测试失败，请检查代码")
    sys.exit(1)
else:
    print("\n所有测试通过！修复验证成功。")
    sys.exit(0)
