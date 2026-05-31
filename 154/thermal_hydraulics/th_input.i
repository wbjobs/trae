[Mesh]
  type = GeneratedMesh
  dim = 3
  nx = 50
  ny = 50
  nz = 100
  xmin = -0.63
  xmax = 0.63
  ymin = -0.63
  ymax = 0.63
  zmin = 0
  zmax = 300
[]

[Variables]
  [temperature]
    order = FIRST
    family = LAGRANGE
    initial_condition = 565.0
  []
[]

[AuxVariables]
  [power_source]
    order = CONSTANT
    family = MONOMIAL
  []
  [density]
    order = FIRST
    family = LAGRANGE
  []
[]

[Functions]
  [axial_power_shape]
    type = PiecewiseLinear
    x = '0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0'
    y = '0.5 0.75 0.9 0.98 1.0 0.98 0.9 0.75 0.5 0.3 0.1'
    axis = z
  []
[]

[Kernels]
  [heat_conduction]
    type = HeatConduction
    variable = temperature
  []
  [heat_source]
    type = BodyForce
    variable = temperature
    value = 1.0
    function = power_distribution_func
  []
  [time_derivative]
    type = TimeDerivative
    variable = temperature
  []
[]

[AuxKernels]
  [power_source_aux]
    type = ParsedAux
    variable = power_source
    function = 'if(z>0 && z<300, 1.0, 0.0)'
    args = ''
  []
[]

[BCs]
  [inlet_temp]
    type = DirichletBC
    variable = temperature
    boundary = back
    value = 565.0
  []
  [outlet_convection]
    type = ConvectiveFluxBC
    variable = temperature
    boundary = front
    T_infinity = 565.0
    coefficient = 35000.0
  []
  [insulated_sides]
    type = NeumannBC
    variable = temperature
    boundary = 'left right top bottom'
    value = 0.0
  []
[]

[Materials]
  [thermal_props]
    type = GenericConstantMaterial
    prop_names = 'thermal_conductivity specific_heat density'
    prop_values = '2.5 300.0 10400.0'
  []
[]

[Postprocessors]
  [max_temp]
    type = NodalExtremeValue
    variable = temperature
    value_type = max
  []
  [min_temp]
    type = NodalExtremeValue
    variable = temperature
    value_type = min
  []
  [avg_temp]
    type = AverageNodalVariableValue
    variable = temperature
  []
  [total_heat]
    type = ElementIntegralVariablePostprocessor
    variable = power_source
    execute_on = 'initial timestep_end'
  []
[]

[Executioner]
  type = Transient
  scheme = bdf2
  solve_type = 'PJFNK'

  petsc_options_iname = '-pc_type -pc_hypre_type -ksp_gmres_restart'
  petsc_options_value = 'hypre boomeramg 100'

  l_tol = 1e-8
  l_max_its = 100
  nl_rel_tol = 1e-10
  nl_abs_tol = 1e-8
  nl_max_its = 50

  start_time = 0.0
  end_time = 1.0
  dt = 0.1
[]

[Outputs]
  exodus = true
  csv = true
  print_perf_log = true
  [console]
    type = Console
    max_rows = 10
  []
[]
