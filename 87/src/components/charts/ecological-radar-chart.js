import { ChartBase } from './chart-base.js';
import * as echarts from 'echarts';

export class EcologicalRadarChart extends ChartBase {
  constructor(container, options = {}) {
    super(container, options);
    this.maxValue = options.maxValue || 100;
    this.splitNumber = options.splitNumber || 5;
  }

  renderEvaluation(evaluationResult, title = '生态平衡评估') {
    if (!evaluationResult || !evaluationResult.indicatorScores) {
      this.renderEmptyState('暂无评估数据');
      return;
    }

    const radarData = this.formatRadarData(evaluationResult);
    const option = this.buildRadarOption(radarData, evaluationResult, title);
    
    this.setOption(option, true);
  }

  formatRadarData(evaluationResult) {
    const indicatorNames = {
      flow_stability: '流量稳定性',
      ecological_flow_satisfaction: '生态流量',
      water_quality: '水质状况',
      habitat_suitability: '生境适宜性',
      species_diversity: '物种多样性',
      riparian_vegetation: '河岸植被',
      flood_plain_connectivity: '洪泛连通性',
      sediment_transport: '泥沙输运'
    };

    const indicators = [];
    const values = [];
    const details = [];

    for (const [key, score] of Object.entries(evaluationResult.indicatorScores)) {
      indicators.push({
        name: indicatorNames[key] || key,
        max: this.maxValue
      });
      values.push(Number(score.toFixed(2)));
      details.push({
        key,
        name: indicatorNames[key] || key,
        score: Number(score.toFixed(2)),
        weight: evaluationResult.weights?.[key] || 0
      });
    }

    return {
      indicators,
      values,
      details,
      totalScore: evaluationResult.totalScore,
      gradeLabel: evaluationResult.gradeLabel,
      gradeColor: evaluationResult.gradeColor
    };
  }

  buildRadarOption(radarData, evaluationResult, title) {
    return {
      title: {
        text: title,
        subtext: `综合评分: ${radarData.totalScore} - ${radarData.gradeLabel}`,
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        },
        subtextStyle: {
          color: radarData.gradeColor,
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          if (params.value === undefined) return '';
          
          let html = '<div style="font-weight:bold;margin-bottom:8px;">指标详情</div>';
          for (let i = 0; i < radarData.details.length; i++) {
            const detail = radarData.details[i];
            const score = params.value[i] !== undefined ? params.value[i] : detail.score;
            const color = score >= 60 ? '#52c41a' : '#ff4d4f';
            html += `<div style="margin:4px 0;">${detail.name}: <span style="color:${color};font-weight:bold;">${score}</span></div>`;
          }
          html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;">权重合计: 100%</div>`;
          
          return html;
        }
      },
      legend: {
        data: ['评分', '目标值'],
        bottom: 10
      },
      radar: {
        center: ['50%', '55%'],
        radius: '60%',
        indicator: radarData.indicators,
        shape: 'polygon',
        splitNumber: this.splitNumber,
        axisName: {
          color: '#333',
          fontSize: 11
        },
        splitArea: {
          areaStyle: {
            color: ['rgba(82, 196, 26, 0.1)', 'rgba(250, 173, 20, 0.1)', 'rgba(255, 77, 79, 0.1)'],
            shadowColor: 'rgba(0, 0, 0, 0.2)',
            shadowBlur: 10
          }
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(0, 0, 0, 0.3)'
          }
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(0, 0, 0, 0.2)'
          }
        }
      },
      series: [
        {
          name: '生态评估',
          type: 'radar',
          data: [
            {
              value: radarData.values,
              name: '评分',
              symbol: 'circle',
              symbolSize: 6,
              lineStyle: {
                width: 2,
                color: radarData.gradeColor
              },
              areaStyle: {
                color: radarData.gradeColor,
                opacity: 0.3
              },
              itemStyle: {
                color: radarData.gradeColor,
                borderColor: '#fff',
                borderWidth: 2
              }
            },
            {
              value: new Array(radarData.indicators.length).fill(60),
              name: '合格线',
              lineStyle: {
                width: 2,
                type: 'dashed',
                color: '#faad14'
              },
              areaStyle: {
                opacity: 0
              },
              itemStyle: {
                color: '#faad14'
              }
            }
          ]
        }
      ]
    };
  }

  renderMultiZoneComparison(evaluationResults, title = '多流域生态评估对比') {
    if (!evaluationResults || evaluationResults.length === 0) {
      this.renderEmptyState('暂无对比数据');
      return;
    }

    const firstResult = evaluationResults[0];
    const indicatorNames = {
      flow_stability: '流量稳定性',
      ecological_flow_satisfaction: '生态流量',
      water_quality: '水质状况',
      habitat_suitability: '生境适宜性',
      species_diversity: '物种多样性',
      riparian_vegetation: '河岸植被',
      flood_plain_connectivity: '洪泛连通性',
      sediment_transport: '泥沙输运'
    };

    const indicators = [];
    const firstIndicators = Object.keys(firstResult.indicatorScores);
    
    for (const key of firstIndicators) {
      indicators.push({
        name: indicatorNames[key] || key,
        max: this.maxValue
      });
    }

    const seriesData = evaluationResults.map(result => ({
      value: Object.values(result.indicatorScores).map(s => Number(s.toFixed(2))),
      name: result.zoneName,
      lineStyle: {
        width: 2
      },
      areaStyle: {
        opacity: 0.2
      },
      itemStyle: {
        borderWidth: 2,
        borderColor: '#fff'
      }
    }));

    const option = {
      title: {
        text: title,
        left: 'center',
        top: 10
      },
      tooltip: {
        trigger: 'item'
      },
      legend: {
        data: evaluationResults.map(r => r.zoneName),
        bottom: 10,
        type: 'scroll'
      },
      radar: {
        center: ['50%', '55%'],
        radius: '55%',
        indicator: indicators,
        splitNumber: this.splitNumber
      },
      series: [{
        type: 'radar',
        data: seriesData
      }]
    };

    this.setOption(option, true);
  }

  renderScoreBar(evaluationResult, title = '各指标评分详情') {
    if (!evaluationResult || !evaluationResult.indicatorScores) {
      this.renderEmptyState('暂无数据');
      return;
    }

    const indicatorNames = {
      flow_stability: '流量稳定性',
      ecological_flow_satisfaction: '生态流量',
      water_quality: '水质状况',
      habitat_suitability: '生境适宜性',
      species_diversity: '物种多样性',
      riparian_vegetation: '河岸植被',
      flood_plain_connectivity: '洪泛连通性',
      sediment_transport: '泥沙输运'
    };

    const categories = [];
    const scores = [];
    const weights = [];
    const colors = [];

    for (const [key, score] of Object.entries(evaluationResult.indicatorScores)) {
      categories.push(indicatorNames[key] || key);
      scores.push(Number(score.toFixed(2)));
      weights.push(evaluationResult.weights?.[key] || 0);
      colors.push(score >= 60 ? '#52c41a' : '#ff4d4f');
    }

    const option = {
      title: {
        text: title,
        subtext: `综合评分: ${evaluationResult.totalScore} - ${evaluationResult.gradeLabel}`,
        left: 'center',
        top: 10,
        subtextStyle: {
          color: evaluationResult.gradeColor
        }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: (params) => {
          const score = params[0];
          const weight = weights[score.dataIndex];
          return `
            <div style="font-weight:bold;">${score.name}</div>
            <div>评分: <span style="color:${score.color};">${score.value}</span></div>
            <div>权重: ${(weight * 100).toFixed(1)}%</div>
          `;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '18%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          rotate: 30,
          fontSize: 11
        }
      },
      yAxis: {
        type: 'value',
        max: 100,
        name: '评分',
        axisLabel: {
          formatter: '{value}'
        }
      },
      series: [
        {
          type: 'bar',
          data: scores.map((value, index) => ({
            value,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: colors[index] },
                { offset: 1, color: colors[index] + '66' }
              ]),
              borderRadius: [4, 4, 0, 0]
            }
          })),
          barWidth: '50%',
          markLine: {
            data: [{
              yAxis: 60,
              lineStyle: {
                color: '#faad14',
                type: 'dashed'
              },
              label: {
                formatter: '合格线',
                color: '#faad14'
              }
            }]
          }
        }
      ]
    };

    this.setOption(option, true);
  }

  renderTrendAnalysis(historicalEvaluations, title = '生态评估趋势分析') {
    if (!historicalEvaluations || historicalEvaluations.length < 2) {
      this.renderEmptyState('历史数据不足，无法分析趋势');
      return;
    }

    const sorted = [...historicalEvaluations].sort((a, b) => 
      new Date(a.evaluationDate) - new Date(b.evaluationDate)
    );

    const dates = sorted.map(e => {
      const d = new Date(e.evaluationDate);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const totalScores = sorted.map(e => e.totalScore);
    const flowStability = sorted.map(e => Number((e.indicatorScores.flow_stability || 0).toFixed(2)));
    const ecologicalFlow = sorted.map(e => Number((e.indicatorScores.ecological_flow_satisfaction || 0).toFixed(2)));
    const waterQuality = sorted.map(e => Number((e.indicatorScores.water_quality || 0).toFixed(2)));

    const option = {
      title: {
        text: title,
        left: 'center',
        top: 10
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['综合评分', '流量稳定', '生态流量', '水质状况'],
        bottom: 10
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false
      },
      yAxis: {
        type: 'value',
        max: 100,
        name: '评分'
      },
      series: [
        {
          name: '综合评分',
          type: 'line',
          data: totalScores,
          smooth: true,
          lineStyle: {
            width: 3,
            color: '#1890ff'
          },
          itemStyle: {
            color: '#1890ff'
          },
          areaStyle: {
            color: 'rgba(24, 144, 255, 0.1)'
          }
        },
        {
          name: '流量稳定',
          type: 'line',
          data: flowStability,
          smooth: true,
          lineStyle: {
            type: 'dashed'
          }
        },
        {
          name: '生态流量',
          type: 'line',
          data: ecologicalFlow,
          smooth: true,
          lineStyle: {
            type: 'dashed'
          }
        },
        {
          name: '水质状况',
          type: 'line',
          data: waterQuality,
          smooth: true,
          lineStyle: {
            type: 'dashed'
          }
        }
      ]
    };

    this.setOption(option, true);
  }
}

export default EcologicalRadarChart;
