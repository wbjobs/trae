const MaterialConfig = {
  version: '2.0.0',
  lastUpdated: '2025-07-01',

  pipeMaterials: {
    carbon_steel: {
      name: '碳钢',
      category: '金属',
      color: 0x8B4513,
      roughness: 0.4,
      metalness: 0.8,
      density: 7850,
      thermalConductivity: 54,
      specificHeat: 490,
      youngModulus: 200,
      poissonRatio: 0.3,
      yieldStrength: 250,
      tensileStrength: 550,
      corrosionResistance: 0.3,
      temperatureRange: {
        min: -40,
        max: 450,
      },
      pressureRating: [
        { class: '150', maxPressure: 19.6, maxTemperature: 343 },
        { class: '300', maxPressure: 51.7, maxTemperature: 450 },
        { class: '600', maxPressure: 103.4, maxTemperature: 450 },
        { class: '900', maxPressure: 155.1, maxTemperature: 450 },
        { class: '1500', maxPressure: 258.6, maxTemperature: 450 },
      ],
      fluidParameters: {
        frictionFactor: 0.02,
        roughnessHeight: 0.045,
        corrosionAllowance: 0.003,
        minimumWallThickness: 0.006,
      },
      cost: {
        perMeter: 120,
        unit: 'CNY',
      },
      applications: [
        '一般工艺管道',
        '冷却水系统',
        '蒸汽管道',
        '油气输送',
      ],
      notes: '适用于大多数工业应用，需进行防腐处理',
    },

    stainless_steel_304: {
      name: '304不锈钢',
      category: '金属',
      color: 0xC0C0C0,
      roughness: 0.2,
      metalness: 0.9,
      density: 7930,
      thermalConductivity: 16.2,
      specificHeat: 500,
      youngModulus: 193,
      poissonRatio: 0.29,
      yieldStrength: 215,
      tensileStrength: 515,
      corrosionResistance: 0.85,
      temperatureRange: {
        min: -196,
        max: 870,
      },
      pressureRating: [
        { class: '150', maxPressure: 19.6, maxTemperature: 343 },
        { class: '300', maxPressure: 51.7, maxTemperature: 482 },
        { class: '600', maxPressure: 103.4, maxTemperature: 538 },
      ],
      fluidParameters: {
        frictionFactor: 0.012,
        roughnessHeight: 0.002,
        corrosionAllowance: 0.001,
        minimumWallThickness: 0.005,
      },
      cost: {
        perMeter: 350,
        unit: 'CNY',
      },
      applications: [
        '食品加工',
        '制药行业',
        '化工管道',
        '水处理',
      ],
      notes: '良好的耐腐蚀性和卫生性能',
    },

    stainless_steel_316L: {
      name: '316L不锈钢',
      category: '金属',
      color: 0xD0D0D0,
      roughness: 0.15,
      metalness: 0.9,
      density: 7980,
      thermalConductivity: 14.4,
      specificHeat: 500,
      youngModulus: 193,
      poissonRatio: 0.29,
      yieldStrength: 205,
      tensileStrength: 515,
      corrosionResistance: 0.95,
      temperatureRange: {
        min: -253,
        max: 925,
      },
      pressureRating: [
        { class: '150', maxPressure: 19.6, maxTemperature: 343 },
        { class: '300', maxPressure: 51.7, maxTemperature: 482 },
        { class: '600', maxPressure: 103.4, maxTemperature: 538 },
      ],
      fluidParameters: {
        frictionFactor: 0.01,
        roughnessHeight: 0.0015,
        corrosionAllowance: 0.001,
        minimumWallThickness: 0.005,
      },
      cost: {
        perMeter: 580,
        unit: 'CNY',
      },
      applications: [
        '海洋工程',
        '化工腐蚀环境',
        '生物制药',
        '高纯度流体',
      ],
      notes: '添加钼元素，抗点腐蚀性能优异',
    },

    copper: {
      name: '紫铜',
      category: '金属',
      color: 0xB87333,
      roughness: 0.05,
      metalness: 0.95,
      density: 8960,
      thermalConductivity: 401,
      specificHeat: 385,
      youngModulus: 110,
      poissonRatio: 0.34,
      yieldStrength: 70,
      tensileStrength: 220,
      corrosionResistance: 0.75,
      temperatureRange: {
        min: -200,
        max: 250,
      },
      pressureRating: [
        { class: '150', maxPressure: 10, maxTemperature: 200 },
        { class: '300', maxPressure: 20, maxTemperature: 250 },
      ],
      fluidParameters: {
        frictionFactor: 0.008,
        roughnessHeight: 0.001,
        corrosionAllowance: 0.002,
        minimumWallThickness: 0.003,
      },
      cost: {
        perMeter: 280,
        unit: 'CNY',
      },
      applications: [
        '暖通空调',
        '制冷系统',
        '给排水',
        '天然气',
      ],
      notes: '优异的导热性和延展性，抗菌性能',
    },

    pvc: {
      name: 'PVC (聚氯乙烯)',
      category: '塑料',
      color: 0xFFFFFF,
      roughness: 0.005,
      metalness: 0,
      density: 1400,
      thermalConductivity: 0.19,
      specificHeat: 900,
      youngModulus: 3.2,
      poissonRatio: 0.38,
      yieldStrength: 50,
      tensileStrength: 60,
      corrosionResistance: 0.9,
      temperatureRange: {
        min: -15,
        max: 60,
      },
      pressureRating: [
        { class: 'PN6', maxPressure: 0.6, maxTemperature: 45 },
        { class: 'PN10', maxPressure: 1.0, maxTemperature: 45 },
        { class: 'PN16', maxPressure: 1.6, maxTemperature: 45 },
      ],
      fluidParameters: {
        frictionFactor: 0.005,
        roughnessHeight: 0.0001,
        corrosionAllowance: 0,
        minimumWallThickness: 0.005,
      },
      cost: {
        perMeter: 45,
        unit: 'CNY',
      },
      applications: [
        '给排水',
        '化工防腐',
        '电线电缆保护',
        '农业灌溉',
      ],
      notes: '耐腐蚀、重量轻、安装方便，使用温度受限',
    },

    hdpe: {
      name: 'HDPE (高密度聚乙烯)',
      category: '塑料',
      color: 0x000000,
      roughness: 0.003,
      metalness: 0,
      density: 950,
      thermalConductivity: 0.5,
      specificHeat: 2100,
      youngModulus: 0.8,
      poissonRatio: 0.42,
      yieldStrength: 25,
      tensileStrength: 35,
      corrosionResistance: 0.98,
      temperatureRange: {
        min: -60,
        max: 80,
      },
      pressureRating: [
        { class: 'PN6', maxPressure: 0.6, maxTemperature: 20 },
        { class: 'PN10', maxPressure: 1.0, maxTemperature: 20 },
        { class: 'PN16', maxPressure: 1.6, maxTemperature: 20 },
      ],
      fluidParameters: {
        frictionFactor: 0.004,
        roughnessHeight: 0.00008,
        corrosionAllowance: 0,
        minimumWallThickness: 0.006,
      },
      cost: {
        perMeter: 65,
        unit: 'CNY',
      },
      applications: [
        '燃气输送',
        '给排水',
        '化工防腐',
        '矿山尾矿',
      ],
      notes: '耐冲击、耐腐蚀性极强，柔韧性好',
    },

    cast_iron: {
      name: '铸铁',
      category: '金属',
      color: 0x4A4A4A,
      roughness: 0.26,
      metalness: 0.7,
      density: 7200,
      thermalConductivity: 52,
      specificHeat: 420,
      youngModulus: 120,
      poissonRatio: 0.28,
      yieldStrength: 130,
      tensileStrength: 250,
      corrosionResistance: 0.5,
      temperatureRange: {
        min: -30,
        max: 350,
      },
      pressureRating: [
        { class: 'PN10', maxPressure: 1.0, maxTemperature: 200 },
        { class: 'PN16', maxPressure: 1.6, maxTemperature: 200 },
        { class: 'PN25', maxPressure: 2.5, maxTemperature: 200 },
      ],
      fluidParameters: {
        frictionFactor: 0.025,
        roughnessHeight: 0.26,
        corrosionAllowance: 0.005,
        minimumWallThickness: 0.01,
      },
      cost: {
        perMeter: 180,
        unit: 'CNY',
      },
      applications: [
        '排水系统',
        '污水管道',
        '煤气管道',
        '暖通系统',
      ],
      notes: '价格低廉，抗震性好，重量大',
    },

    galvanized_steel: {
      name: '镀锌钢管',
      category: '金属',
      color: 0x808080,
      roughness: 0.15,
      metalness: 0.85,
      density: 7850,
      thermalConductivity: 54,
      specificHeat: 490,
      youngModulus: 200,
      poissonRatio: 0.3,
      yieldStrength: 235,
      tensileStrength: 470,
      corrosionResistance: 0.6,
      temperatureRange: {
        min: -20,
        max: 100,
      },
      pressureRating: [
        { class: 'PN10', maxPressure: 1.0, maxTemperature: 100 },
        { class: 'PN16', maxPressure: 1.6, maxTemperature: 100 },
      ],
      fluidParameters: {
        frictionFactor: 0.02,
        roughnessHeight: 0.15,
        corrosionAllowance: 0.004,
        minimumWallThickness: 0.006,
      },
      cost: {
        perMeter: 95,
        unit: 'CNY',
      },
      applications: [
        '建筑给水',
        '消防系统',
        '燃气管道',
        '电缆保护',
      ],
      notes: '锌层防腐，使用寿命较碳钢管长',
    },

    fiberglass: {
      name: '玻璃钢 (FRP)',
      category: '复合材料',
      color: 0x90EE90,
      roughness: 0.01,
      metalness: 0,
      density: 1800,
      thermalConductivity: 0.4,
      specificHeat: 1000,
      youngModulus: 17,
      poissonRatio: 0.25,
      yieldStrength: 150,
      tensileStrength: 300,
      corrosionResistance: 0.97,
      temperatureRange: {
        min: -40,
        max: 180,
      },
      pressureRating: [
        { class: 'PN6', maxPressure: 0.6, maxTemperature: 120 },
        { class: 'PN10', maxPressure: 1.0, maxTemperature: 120 },
        { class: 'PN16', maxPressure: 1.6, maxTemperature: 120 },
        { class: 'PN25', maxPressure: 2.5, maxTemperature: 120 },
      ],
      fluidParameters: {
        frictionFactor: 0.007,
        roughnessHeight: 0.0003,
        corrosionAllowance: 0,
        minimumWallThickness: 0.008,
      },
      cost: {
        perMeter: 320,
        unit: 'CNY',
      },
      applications: [
        '化工防腐',
        '污水处理',
        '海洋工程',
        '电力脱硫',
      ],
      notes: '轻质高强，耐腐蚀性极佳，可设计性强',
    },

    titanium: {
      name: '钛合金',
      category: '金属',
      color: 0xB0C4DE,
      roughness: 0.08,
      metalness: 0.9,
      density: 4510,
      thermalConductivity: 21.9,
      specificHeat: 523,
      youngModulus: 116,
      poissonRatio: 0.32,
      yieldStrength: 880,
      tensileStrength: 950,
      corrosionResistance: 0.99,
      temperatureRange: {
        min: -253,
        max: 600,
      },
      pressureRating: [
        { class: '300', maxPressure: 51.7, maxTemperature: 425 },
        { class: '600', maxPressure: 103.4, maxTemperature: 425 },
        { class: '900', maxPressure: 155.1, maxTemperature: 425 },
      ],
      fluidParameters: {
        frictionFactor: 0.01,
        roughnessHeight: 0.001,
        corrosionAllowance: 0,
        minimumWallThickness: 0.004,
      },
      cost: {
        perMeter: 3500,
        unit: 'CNY',
      },
      applications: [
        '航空航天',
        '化工反应器',
        '海洋工程',
        '生物医疗',
      ],
      notes: '耐腐蚀性极佳，强度重量比高，价格昂贵',
    },

    ductile_iron: {
      name: '球墨铸铁',
      category: '金属',
      color: 0x3D3D3D,
      roughness: 0.12,
      metalness: 0.75,
      density: 7150,
      thermalConductivity: 36,
      specificHeat: 544,
      youngModulus: 169,
      poissonRatio: 0.275,
      yieldStrength: 400,
      tensileStrength: 600,
      corrosionResistance: 0.55,
      temperatureRange: {
        min: -40,
        max: 400,
      },
      pressureRating: [
        { class: 'PN10', maxPressure: 1.0, maxTemperature: 200 },
        { class: 'PN16', maxPressure: 1.6, maxTemperature: 200 },
        { class: 'PN25', maxPressure: 2.5, maxTemperature: 200 },
        { class: 'PN40', maxPressure: 4.0, maxTemperature: 200 },
      ],
      fluidParameters: {
        frictionFactor: 0.022,
        roughnessHeight: 0.12,
        corrosionAllowance: 0.005,
        minimumWallThickness: 0.009,
      },
      cost: {
        perMeter: 220,
        unit: 'CNY',
      },
      applications: [
        '市政供水',
        '污水排放',
        '输油管道',
        '电力管道',
      ],
      notes: '强度高、韧性好，比普通铸铁性能优异',
    },
  },

  fluidTypes: {
    water: {
      name: '水',
      density: 1000,
      dynamicViscosity: 0.001,
      kinematicViscosity: 1e-6,
      specificHeat: 4186,
      thermalConductivity: 0.6,
      compressibility: 4.6e-10,
      vaporPressure: 2339,
      phaseChange: {
        meltingPoint: 0,
        boilingPoint: 100,
      },
      color: 0x87CEEB,
      transparency: 0.3,
      pollutionLevel: 0,
    },

    steam: {
      name: '蒸汽',
      density: 0.6,
      dynamicViscosity: 1.2e-5,
      kinematicViscosity: 2e-5,
      specificHeat: 2000,
      thermalConductivity: 0.026,
      compressibility: 1,
      vaporPressure: 101325,
      phaseChange: {
        condensationPoint: 100,
      },
      color: 0xFFFFFF,
      transparency: 0.8,
      pollutionLevel: 0,
    },

    crude_oil: {
      name: '原油',
      density: 850,
      dynamicViscosity: 0.08,
      kinematicViscosity: 9.4e-5,
      specificHeat: 2000,
      thermalConductivity: 0.14,
      compressibility: 1e-9,
      vaporPressure: 1000,
      phaseChange: {
        pourPoint: -20,
        flashPoint: 60,
      },
      color: 0x4A3728,
      transparency: 0.9,
      pollutionLevel: 0.8,
    },

    natural_gas: {
      name: '天然气',
      density: 0.717,
      dynamicViscosity: 1.1e-5,
      kinematicViscosity: 1.5e-5,
      specificHeat: 2200,
      thermalConductivity: 0.033,
      compressibility: 1,
      vaporPressure: 101325,
      phaseChange: {
        boilingPoint: -161.5,
      },
      color: 0x8B4513,
      transparency: 0.95,
      pollutionLevel: 0.3,
    },

    chemical_solution: {
      name: '化学溶液',
      density: 1200,
      dynamicViscosity: 0.005,
      kinematicViscosity: 4.17e-6,
      specificHeat: 3500,
      thermalConductivity: 0.55,
      compressibility: 3.5e-10,
      vaporPressure: 1500,
      phaseChange: {
        freezingPoint: -10,
        boilingPoint: 105,
      },
      color: 0xFF00FF,
      transparency: 0.2,
      pollutionLevel: 0.6,
    },

    sewage: {
      name: '污水',
      density: 1020,
      dynamicViscosity: 0.0015,
      kinematicViscosity: 1.47e-6,
      specificHeat: 4000,
      thermalConductivity: 0.58,
      compressibility: 4.5e-10,
      vaporPressure: 2200,
      phaseChange: {
        freezingPoint: -2,
      },
      color: 0x556B2F,
      transparency: 0.85,
      pollutionLevel: 0.9,
    },

    liquid_oxygen: {
      name: '液氧',
      density: 1141,
      dynamicViscosity: 0.00027,
      kinematicViscosity: 2.37e-7,
      specificHeat: 1695,
      thermalConductivity: 0.148,
      compressibility: 3.6e-10,
      vaporPressure: 504000,
      phaseChange: {
        boilingPoint: -183,
        meltingPoint: -218.8,
      },
      color: 0x00BFFF,
      transparency: 0.4,
      pollutionLevel: 0,
    },

    liquid_nitrogen: {
      name: '液氮',
      density: 807,
      dynamicViscosity: 0.00028,
      kinematicViscosity: 3.47e-7,
      specificHeat: 2040,
      thermalConductivity: 0.142,
      compressibility: 4.4e-10,
      vaporPressure: 1013000,
      phaseChange: {
        boilingPoint: -195.8,
        meltingPoint: -210,
      },
      color: 0xE0FFFF,
      transparency: 0.5,
      pollutionLevel: 0,
    },

    fuel_gasoline: {
      name: '汽油',
      density: 750,
      dynamicViscosity: 0.0006,
      kinematicViscosity: 8e-7,
      specificHeat: 2200,
      thermalConductivity: 0.12,
      compressibility: 9e-10,
      vaporPressure: 60000,
      phaseChange: {
        flashPoint: -40,
        boilingPoint: 200,
      },
      color: 0xFF8C00,
      transparency: 0.2,
      pollutionLevel: 0.7,
    },

    diesel: {
      name: '柴油',
      density: 840,
      dynamicViscosity: 0.004,
      kinematicViscosity: 4.76e-6,
      specificHeat: 1900,
      thermalConductivity: 0.13,
      compressibility: 8.5e-10,
      vaporPressure: 400,
      phaseChange: {
        flashPoint: 55,
        boilingPoint: 360,
      },
      color: 0x8B4513,
      transparency: 0.3,
      pollutionLevel: 0.75,
    },
  },

  materialFluidCompatibility: {
    carbon_steel: {
      compatible: ['water', 'steam', 'crude_oil', 'diesel', 'fuel_gasoline'],
      incompatible: ['chemical_solution', 'liquid_oxygen'],
      notes: '不适合强腐蚀性流体，需防腐处理',
    },
    stainless_steel_304: {
      compatible: ['water', 'steam', 'chemical_solution', 'liquid_oxygen', 'liquid_nitrogen'],
      incompatible: [],
      notes: '适合大多数流体，尤其是腐蚀性介质',
    },
    stainless_steel_316L: {
      compatible: ['water', 'steam', 'chemical_solution', 'crude_oil', 'natural_gas', 'liquid_oxygen', 'liquid_nitrogen'],
      incompatible: [],
      notes: '耐氯离子腐蚀，适合海洋和化工环境',
    },
    copper: {
      compatible: ['water', 'natural_gas', 'liquid_oxygen', 'liquid_nitrogen'],
      incompatible: ['chemical_solution', 'sewage'],
      notes: '不适用于酸性或氨性流体',
    },
    pvc: {
      compatible: ['water', 'sewage', 'chemical_solution'],
      incompatible: ['steam', 'crude_oil', 'natural_gas', 'liquid_oxygen', 'liquid_nitrogen'],
      notes: '不耐高温，不适合有机溶剂',
    },
    hdpe: {
      compatible: ['water', 'sewage', 'natural_gas', 'chemical_solution'],
      incompatible: ['steam', 'crude_oil', 'liquid_oxygen', 'liquid_nitrogen'],
      notes: '耐腐蚀性极佳，温度使用范围受限',
    },
    cast_iron: {
      compatible: ['water', 'sewage', 'natural_gas'],
      incompatible: ['steam', 'chemical_solution'],
      notes: '适用于低压、低温工况',
    },
    galvanized_steel: {
      compatible: ['water', 'natural_gas'],
      incompatible: ['chemical_solution', 'sewage', 'steam'],
      notes: '锌层易受腐蚀，不适合高温',
    },
    fiberglass: {
      compatible: ['water', 'sewage', 'chemical_solution', 'crude_oil', 'natural_gas'],
      incompatible: ['steam', 'liquid_oxygen', 'liquid_nitrogen'],
      notes: '耐腐蚀性极佳，温度使用受限',
    },
    titanium: {
      compatible: ['water', 'steam', 'chemical_solution', 'crude_oil', 'natural_gas', 'liquid_oxygen', 'liquid_nitrogen'],
      incompatible: [],
      notes: '几乎所有流体都兼容，但成本极高',
    },
    ductile_iron: {
      compatible: ['water', 'sewage', 'crude_oil', 'natural_gas'],
      incompatible: ['steam', 'chemical_solution', 'liquid_oxygen', 'liquid_nitrogen'],
      notes: '强度高，适合中低压工况',
    },
  },

  insulationMaterials: {
    rock_wool: {
      name: '岩棉',
      density: 120,
      thermalConductivity: 0.038,
      maximumTemperature: 650,
      minimumTemperature: -40,
      waterAbsorption: 5,
      fireResistance: 'A级',
      thicknessRange: [0.025, 0.15],
      cost: {
        perCubicMeter: 250,
        unit: 'CNY',
      },
      applications: ['蒸汽管道', '工业炉', '建筑保温'],
    },
    glass_wool: {
      name: '玻璃棉',
      density: 64,
      thermalConductivity: 0.034,
      maximumTemperature: 450,
      minimumTemperature: -120,
      waterAbsorption: 5,
      fireResistance: 'A级',
      thicknessRange: [0.025, 0.1],
      cost: {
        perCubicMeter: 180,
        unit: 'CNY',
      },
      applications: ['暖通空调', '制冷管道', '建筑隔音'],
    },
    polyurethane: {
      name: '聚氨酯泡沫',
      density: 60,
      thermalConductivity: 0.024,
      maximumTemperature: 120,
      minimumTemperature: -60,
      waterAbsorption: 3,
      fireResistance: 'B1级',
      thicknessRange: [0.02, 0.2],
      cost: {
        perCubicMeter: 650,
        unit: 'CNY',
      },
      applications: ['制冷管道', 'LNG管道', '建筑保温'],
    },
    ceramic_fiber: {
      name: '硅酸铝陶瓷纤维',
      density: 128,
      thermalConductivity: 0.05,
      maximumTemperature: 1260,
      minimumTemperature: -40,
      waterAbsorption: 2,
      fireResistance: 'A级',
      thicknessRange: [0.015, 0.1],
      cost: {
        perCubicMeter: 1200,
        unit: 'CNY',
      },
      applications: ['高温炉', '加热炉', '窑炉'],
    },
    aerogel: {
      name: '气凝胶',
      density: 10,
      thermalConductivity: 0.012,
      maximumTemperature: 650,
      minimumTemperature: -200,
      waterAbsorption: 1,
      fireResistance: 'A级',
      thicknessRange: [0.005, 0.05],
      cost: {
        perCubicMeter: 8000,
        unit: 'CNY',
      },
      applications: ['特殊管道', '航空航天', '精密仪器'],
    },
  },

  getPipeMaterial(materialId) {
    return this.pipeMaterials[materialId] || null;
  },

  getFluidType(fluidId) {
    return this.fluidTypes[fluidId] || null;
  },

  getCompatibility(materialId, fluidId) {
    const compat = this.materialFluidCompatibility[materialId];
    if (!compat) return null;

    const isCompatible = compat.compatible.includes(fluidId);
    const isIncompatible = compat.incompatible.includes(fluidId);

    return {
      isCompatible: isCompatible && !isIncompatible,
      level: isCompatible ? 'compatible' : (isIncompatible ? 'incompatible' : 'unknown'),
      notes: compat.notes,
    };
  },

  calculateReynoldsNumber(velocity, diameter, kinematicViscosity) {
    return (velocity * diameter) / kinematicViscosity;
  },

  calculatePressureDrop(frictionFactor, length, diameter, density, velocity) {
    return frictionFactor * (length / diameter) * 0.5 * density * velocity * velocity;
  },

  getMaterialList() {
    return Object.entries(this.pipeMaterials).map(([id, material]) => ({
      id,
      name: material.name,
      category: material.category,
      color: material.color,
      corrosionResistance: material.corrosionResistance,
    }));
  },

  getFluidList() {
    return Object.entries(this.fluidTypes).map(([id, fluid]) => ({
      id,
      name: fluid.name,
      density: fluid.density,
      viscosity: fluid.dynamicViscosity,
      color: fluid.color,
    }));
  },

  getInsulationList() {
    return Object.entries(this.insulationMaterials).map(([id, insulation]) => ({
      id,
      name: insulation.name,
      thermalConductivity: insulation.thermalConductivity,
      temperatureRange: {
        min: insulation.minimumTemperature,
        max: insulation.maximumTemperature,
      },
      cost: insulation.cost,
    }));
  },
};

export default MaterialConfig;
