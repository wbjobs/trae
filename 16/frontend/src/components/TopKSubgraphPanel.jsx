import React from 'react'
import {
  Paper,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Divider,
} from '@mui/material'
import {
  Warning,
  Error,
  FiberManualRecord,
} from '@mui/icons-material'

function getAnomalyIcon(level) {
  switch(level) {
    case 'critical':
      return <Error style={{ color: '#ff0000' }} />
    case 'warning':
      return <Warning style={{ color: '#ff8c00' }} />
    default:
      return <FiberManualRecord style={{ color: '#00c8ff' }} />
  }
}

function TopKSubgraphPanel({ subgraphs = [], loading = false }) {
  if (loading) {
    return (
      <Box sx={{ p: 2, background: 'rgba(10, 22, 40, 0.8)', borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: 'white', mb: 2 }}>
          Top-K 异常子图
        </Typography>
        <LinearProgress />
      </Box>
    )
  }

  if (subgraphs.length === 0) {
    return (
      <Box sx={{ p: 3, background: 'rgba(10, 22, 40, 0.8)', borderRadius: 2 }}>
        <Typography variant="h6" sx={{ color: 'white', mb: 2 }}>
          Top-K 异常子图
        </Typography>
        <Typography sx={{ color: '#888', fontSize: 13 }}>
          请先运行异常检测以生成 Top-K 异常子图
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ 
      maxHeight: '100%',
      overflowY: 'auto',
      '&::-webkit-scrollbar': {
        width: '6px',
      },
      '&::-webkit-scrollbar-track': {
        background: 'rgba(255,255,255,0.05)',
      },
      '&::-webkit-scrollbar-thumb': {
        background: 'rgba(255,255,255,0.2)',
        borderRadius: '3px',
      },
    }}>
      <Typography variant="h6" sx={{ 
        color: 'white', 
        mb: 2, 
        fontWeight: 'bold',
        fontSize: 15,
      }}>
        Top-K 异常子图 ({subgraphs.length})
      </Typography>

      {subgraphs.map((sg, index) => (
        <Paper 
          key={sg.rank || index}
          elevation={0}
          sx={{ 
            mb: 2,
            p: 2,
            background: 'rgba(10, 22, 40, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 2,
            '&:hover': {
              borderColor: 'rgba(255, 140, 0, 0.5)',
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Chip
              label={`#${sg.rank || index + 1}`}
              size="small"
              sx={{
                background: sg.anomaly_score >= 2.0 ? '#ff0000' : 
                            sg.anomaly_score >= 1.0 ? '#ff8c00' : '#ffdc00',
                color: '#000',
                fontWeight: 'bold',
              }}
            />
            {getAnomalyIcon(sg.dominant_anomaly)}
            <Typography sx={{ color: '#aaa', fontSize: 12, ml: 1 }}>
              {sg.dominant_anomaly === 'critical' ? '严重异常聚集' : 
               sg.dominant_anomaly === 'warning' ? '警告聚集' : '正常聚集'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ color: '#666', fontSize: 11 }}>异常评分</Typography>
              <Typography sx={{ 
                color: 'white', 
                fontSize: 16,
                fontWeight: 'bold',
              }}>
                {sg.anomaly_score.toFixed(2)}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ color: '#666', fontSize: 11 }}>节点数</Typography>
              <Typography sx={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
                {sg.size}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ color: '#666', fontSize: 11 }}>边密度</Typography>
              <Typography sx={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
                {(sg.density * 100).toFixed(1)}%
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ color: '#666', fontSize: 11 }}>边数</Typography>
              <Typography sx={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
                {sg.edges?.length || 0}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 1.5 }} />

          <Box sx={{ mb: 1 }}>
            <Typography sx={{ color: '#666', fontSize: 11, mb: 0.5 }}>
              异常类型分布
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {sg.distribution && Object.entries(sg.distribution).map(([type, count]) => (
                <Chip
                  key={type}
                  label={`${type}: ${count}`}
                  size="small"
                  sx={{
                    fontSize: 11,
                    background: type === 'critical' ? 'rgba(255,0,0,0.2)' :
                               type === 'warning' ? 'rgba(255,140,0,0.2)' :
                               'rgba(0,200,255,0.2)',
                    color: type === 'critical' ? '#ff6666' :
                          type === 'warning' ? '#ffb366' : '#66d9ff',
                    border: 'none',
                  }}
                />
              ))}
            </Box>
          </Box>

          {sg.nodes && sg.nodes.length > 0 && (
            <Box>
              <Typography sx={{ color: '#666', fontSize: 11, mb: 0.5 }}>
                涉及节点:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {sg.nodes.map((node, ni) => (
                  <Chip
                    key={ni}
                    label={typeof node === 'object' ? node.name : `WH-${node}`}
                    size="small"
                    sx={{
                      fontSize: 10,
                      background: 'rgba(255,255,255,0.05)',
                      color: '#ccc',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Paper>
      ))}
    </Box>
  )
}

export default TopKSubgraphPanel
