export const stratumData = [
    {
        id: 'stratum_0',
        name: '耕植土层',
        nameEn: 'Topsoil',
        color: 0x8B7355,
        topDepth: 0,
        bottomDepth: -2,
        thickness: 2,
        description: '地表耕植土，含植物根系和腐殖质',
        properties: {
            soilType: '粉质黏土',
            density: '1.8-2.0 g/cm³',
            porosity: '40-50%',
            permeability: '中等',
            bearingCapacity: '80-120 kPa'
        }
    },
    {
        id: 'stratum_1',
        name: '粉质黏土层',
        nameEn: 'Silty Clay',
        color: 0xCD853F,
        topDepth: -2,
        bottomDepth: -8,
        thickness: 6,
        description: '黄褐色-灰褐色，可塑-硬塑状态，含少量铁锰氧化物',
        properties: {
            soilType: '粉质黏土',
            density: '1.9-2.1 g/cm³',
            porosity: '35-45%',
            permeability: '低',
            bearingCapacity: '150-200 kPa',
            compressionModulus: '4-6 MPa'
        }
    },
    {
        id: 'stratum_2',
        name: '砂质粉土层',
        nameEn: 'Sandy Silt',
        color: 0xDAA520,
        topDepth: -8,
        bottomDepth: -15,
        thickness: 7,
        description: '灰黄色，稍密-中密状态，含石英、长石颗粒',
        properties: {
            soilType: '砂质粉土',
            density: '2.0-2.2 g/cm³',
            porosity: '30-40%',
            permeability: '中高',
            bearingCapacity: '180-250 kPa',
            frictionAngle: '25-30°'
        }
    },
    {
        id: 'stratum_3',
        name: '圆砾层',
        nameEn: 'Gravel',
        color: 0x808080,
        topDepth: -15,
        bottomDepth: -22,
        thickness: 7,
        description: '灰白色-灰色，中密-密实状态，颗粒级配良好',
        properties: {
            soilType: '圆砾',
            density: '2.2-2.4 g/cm³',
            porosity: '25-35%',
            permeability: '高',
            bearingCapacity: '300-400 kPa',
            particleSize: '2-20 mm'
        }
    },
    {
        id: 'stratum_4',
        name: '强风化岩',
        nameEn: 'Highly Weathered Rock',
        color: 0x696969,
        topDepth: -22,
        bottomDepth: -30,
        thickness: 8,
        description: '紫红色，原岩结构大部分破坏，风化裂隙发育',
        properties: {
            rockType: '泥质粉砂岩',
            weatheringDegree: '强风化',
            density: '2.3-2.5 g/cm³',
            uniaxialStrength: '5-10 MPa',
            rqd: '20-40%'
        }
    },
    {
        id: 'stratum_5',
        name: '中风化岩',
        nameEn: 'Moderately Weathered Rock',
        color: 0x556B2F,
        topDepth: -30,
        bottomDepth: -45,
        thickness: 15,
        description: '紫红色，原岩结构部分破坏，岩质较完整',
        properties: {
            rockType: '泥质粉砂岩',
            weatheringDegree: '中风化',
            density: '2.5-2.7 g/cm³',
            uniaxialStrength: '15-30 MPa',
            rqd: '60-80%',
            elasticModulus: '5-10 GPa'
        }
    },
    {
        id: 'stratum_6',
        name: '微风化岩',
        nameEn: 'Slightly Weathered Rock',
        color: 0x2F4F4F,
        topDepth: -45,
        bottomDepth: -60,
        thickness: 15,
        description: '青灰色，原岩结构基本完整，仅节理面有风化痕迹',
        properties: {
            rockType: '粉砂岩',
            weatheringDegree: '微风化',
            density: '2.6-2.8 g/cm³',
            uniaxialStrength: '40-60 MPa',
            rqd: '85-95%',
            elasticModulus: '15-25 GPa'
        }
    }
];

export const dataPoints = [
    {
        id: 'dp_001',
        name: 'ZK1钻孔',
        type: 'borehole',
        position: { x: -30, y: -25, z: -20 },
        data: {
            holeNumber: 'ZK1',
            holeDepth: 45.5,
            coordinate: { x: 116.397, y: 39.908 },
            elevation: 45.2,
            drillingDate: '2024-03-15',
            strata: [
                { layer: '耕植土层', depth: '0-2m', thickness: '2m' },
                { layer: '粉质黏土层', depth: '2-8m', thickness: '6m' },
                { layer: '砂质粉土层', depth: '8-15m', thickness: '7m' },
                { layer: '圆砾层', depth: '15-22m', thickness: '7m' },
                { layer: '强风化岩', depth: '22-30m', thickness: '8m' },
                { layer: '中风化岩', depth: '30-45.5m', thickness: '15.5m' }
            ],
            groundwaterLevel: 3.5,
            remarks: '钻探过程正常，未见异常'
        }
    },
    {
        id: 'dp_002',
        name: 'ZK2钻孔',
        type: 'borehole',
        position: { x: 25, y: -35, z: 15 },
        data: {
            holeNumber: 'ZK2',
            holeDepth: 52.0,
            coordinate: { x: 116.398, y: 39.909 },
            elevation: 44.8,
            drillingDate: '2024-03-18',
            strata: [
                { layer: '耕植土层', depth: '0-1.8m', thickness: '1.8m' },
                { layer: '粉质黏土层', depth: '1.8-7.5m', thickness: '5.7m' },
                { layer: '砂质粉土层', depth: '7.5-14.5m', thickness: '7m' },
                { layer: '圆砾层', depth: '14.5-23m', thickness: '8.5m' },
                { layer: '强风化岩', depth: '23-31m', thickness: '8m' },
                { layer: '中风化岩', depth: '31-48m', thickness: '17m' },
                { layer: '微风化岩', depth: '48-52m', thickness: '4m' }
            ],
            groundwaterLevel: 2.8,
            remarks: '在35m处遇见小型溶洞，已处理'
        }
    },
    {
        id: 'dp_003',
        name: '水位监测井',
        type: 'monitoring',
        position: { x: 0, y: -5, z: 30 },
        data: {
            wellNumber: 'SW-01',
            wellDepth: 15.0,
            coordinate: { x: 116.3975, y: 39.9085 },
            elevation: 45.0,
            monitoringData: {
                currentWaterLevel: 3.2,
                historicalMax: 4.5,
                historicalMin: 1.8,
                ph: 7.2,
                temperature: 16.5,
                conductivity: 850
            },
            lastUpdate: '2024-05-10 14:30',
            remarks: '地下水位监测正常'
        }
    },
    {
        id: 'dp_004',
        name: '土壤取样点',
        type: 'sampling',
        position: { x: -25, y: -10, z: 20 },
        data: {
            sampleNumber: 'S-001',
            samplingDepth: '2-4m',
            coordinate: { x: 116.3968, y: 39.9082 },
            samplingDate: '2024-04-02',
            testResults: {
                moistureContent: '22.5%',
                density: '1.95 g/cm³',
                organicMatter: '1.8%',
                ph: 7.1,
                shearStrength: '45 kPa'
            },
            remarks: '取样质量良好'
        }
    },
    {
        id: 'dp_005',
        name: '岩石试样点',
        type: 'sampling',
        position: { x: 35, y: -40, z: -10 },
        data: {
            sampleNumber: 'R-001',
            samplingDepth: '35-38m',
            coordinate: { x: 116.3982, y: 39.9078 },
            samplingDate: '2024-04-15',
            rockType: '中风化泥质粉砂岩',
            testResults: {
                density: '2.65 g/cm³',
                porosity: '8.5%',
                uniaxialStrength: '22.5 MPa',
                tensileStrength: '1.8 MPa',
                elasticModulus: '8.2 GPa',
                poissonsRatio: 0.28
            },
            remarks: '岩芯完整，RQD=82%'
        }
    },
    {
        id: 'dp_006',
        name: '断层标识点',
        type: 'geological',
        position: { x: 10, y: -28, z: -25 },
        data: {
            featureType: '正断层',
            strike: 'NE45°',
            dip: 'SE',
            dipAngle: 65,
            faultWidth: '2-3m',
            fillingMaterial: '断层泥、角砾',
            activity: '不活动',
            discoveryDate: '2024-03-28',
            remarks: '断层带内岩体破碎，建议施工时加强支护'
        }
    }
];

export const projectInfo = {
    name: '某区域地下岩层结构3D可视化',
    location: '中国·北京',
    coordinateSystem: 'WGS84 / UTM Zone 50N',
    area: '约5000平方米',
    maxDrillingDepth: 60,
    surveyDate: '2024-03至2024-05',
    surveyUnit: '某地质勘查研究院'
};

export const getStratumAtDepth = (depth) => {
    for (let i = 0; i < stratumData.length; i++) {
        const stratum = stratumData[i];
        if (depth >= stratum.bottomDepth && depth <= stratum.topDepth) {
            return stratum;
        }
    }
    return stratumData[stratumData.length - 1];
};
