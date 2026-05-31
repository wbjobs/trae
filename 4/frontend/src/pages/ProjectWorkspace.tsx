import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  projectApi, geometryApi, meshApi, resultApi
} from '@/utils/api';
import { useAppStore } from '@/store';
import ThreeViewer from '@/components/ThreeViewer';
import type {
  Project, Geometry, Mesh, Result,
  GeometryPreview, ResultData, MeshConfig, MeshQuality,
  MeshRefinementZone
} from '@/types';

const ProjectWorkspace = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const projectId = parseInt(id || '0');

  const {
    activeTab, setActiveTab,
    setCurrentProject
  } = useAppStore();

  const [project, setProject] = useState<Project | null>(null);
  const [geometries, setGeometries] = useState<Geometry[]>([]);
  const [meshes, setMeshes] = useState<Mesh[]>([]);
  const [results, setResults] = useState<Result[]>([]);

  const [selectedGeometry, setSelectedGeometry] = useState<Geometry | null>(null);
  const [selectedMesh, setSelectedMesh] = useState<Mesh | null>(null);
  const [selectedResult, setSelectedResult] = useState<Result | null>(null);

  const [geometryPreview, setGeometryPreview] = useState<GeometryPreview | null>(null);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [selectedField, setSelectedField] = useState('');
  const [showVectors, setShowVectors] = useState(false);
  const [vectorScale, setVectorScale] = useState(1.0);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [showUploadGeo, setShowUploadGeo] = useState(false);
  const [showParametric, setShowParametric] = useState(false);
  const [showMeshConfig, setShowMeshConfig] = useState(false);
  const [showUploadResult, setShowUploadResult] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [showCompareMode, setShowCompareMode] = useState(false);

  const [meshProgress, setMeshProgress] = useState<{ progress: number; message: string } | null>(null);
  const [meshQuality, setMeshQuality] = useState<MeshQuality | null>(null);

  const [newGeoName, setNewGeoName] = useState('');
  const [newGeoFile, setNewGeoFile] = useState<File | null>(null);
  const [newGeoDimensions, setNewGeoDimensions] = useState(3);

  const [paramType, setParamType] = useState('cube');
  const [paramName, setParamName] = useState('');
  const [paramParams, setParamParams] = useState({
    size: 1.0,
    radius: 1.0,
    width: 1.0,
    height: 1.0,
    segments: 32
  });

  const [refinementZones, setRefinementZones] = useState<MeshRefinementZone[]>([]);
  const [newZone, setNewZone] = useState<MeshRefinementZone>({
    zone_type: 'box',
    mesh_size: 0.1,
    center: [0, 0, 0],
    size: [1, 1, 1],
    radius: 0.5,
    height: 1.0
  });

  const [meshConfig, setMeshConfig] = useState<MeshConfig>({
    element_type: 'tetra',
    mesh_size: 0.5,
    min_mesh_size: 0.1,
    max_mesh_size: 2.0,
    algorithm_2d: 8,
    algorithm_3d: 4,
    smoothing_iterations: 5,
    element_order: 1,
    structured: 0,
    refinement_zones: []
  });

  const [newResultName, setNewResultName] = useState('');
  const [newResultFile, setNewResultFile] = useState<File | null>(null);

  const [selectedResult2, setSelectedResult2] = useState<Result | null>(null);
  const [resultData2, setResultData2] = useState<ResultData | null>(null);
  const [selectedField2, setSelectedField2] = useState('');

  const progressIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (projectId > 0) {
      loadProject();
    }
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [projectId]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const [projRes, geoRes, meshRes, resultRes] = await Promise.all([
        projectApi.get(projectId),
        geometryApi.list(projectId),
        meshApi.list(projectId),
        resultApi.list(projectId)
      ]);
      setProject(projRes.data);
      setCurrentProject(projRes.data);
      setGeometries(geoRes.data);
      setMeshes(meshRes.data);
      setResults(resultRes.data);
    } catch (e) {
      console.error('Failed to load project:', e);
      setMessage('加载项目失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGeometry = async (geo: Geometry) => {
    setSelectedGeometry(geo);
    setSelectedMesh(null);
    setSelectedResult(null);
    setResultData(null);
    setGeometryPreview(null);
    try {
      const res = await geometryApi.getPreview(geo.id);
      setGeometryPreview(res.data);
    } catch (e) {
      console.error('Failed to load preview:', e);
    }
  };

  const handleSelectMesh = async (mesh: Mesh) => {
    setSelectedMesh(mesh);
    setSelectedGeometry(null);
    setSelectedResult(null);
    setGeometryPreview(null);
    setResultData(null);
    if (mesh.status === 'completed') {
      setMeshQuality(mesh.quality_stats || null);
    }
  };

  const handleSelectResult = async (result: Result) => {
    setSelectedResult(result);
    setSelectedGeometry(null);
    setSelectedMesh(null);
    setGeometryPreview(null);
    setResultData(null);
    try {
      const res = await resultApi.getData(result.id);
      setResultData(res.data);
      const fields = Object.keys(res.data.fields || {});
      if (fields.length > 0) {
        setSelectedField(fields[0]);
      }
    } catch (e) {
      console.error('Failed to load result data:', e);
    }
  };

  const handleUploadGeometry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGeoName.trim() || !newGeoFile) return;
    setLoading(true);
    try {
      await geometryApi.upload(projectId, newGeoName, newGeoFile, newGeoDimensions);
      setNewGeoName('');
      setNewGeoFile(null);
      setShowUploadGeo(false);
      loadProject();
      setMessage('几何模型上传成功');
    } catch (e: any) {
      setMessage(e.response?.data?.detail || '上传失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateParametric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paramName.trim()) return;
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (paramType === 'cube') {
        params.size = paramParams.size;
      } else if (paramType === 'sphere') {
        params.radius = paramParams.radius;
        params.phi_segments = 16;
        params.theta_segments = 12;
      } else if (paramType === 'rectangle') {
        params.width = paramParams.width;
        params.height = paramParams.height;
      } else if (paramType === 'circle') {
        params.radius = paramParams.radius;
        params.segments = paramParams.segments;
      }

      await geometryApi.createParametric({
        project_id: projectId,
        name: paramName,
        geometry_type: paramType,
        dimensions: paramType === 'cube' || paramType === 'sphere' ? 3 : 2,
        parameters: params
      });
      setParamName('');
      setShowParametric(false);
      loadProject();
      setMessage('参数化几何体创建成功');
    } catch (e: any) {
      setMessage(e.response?.data?.detail || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMesh = async () => {
    if (!selectedGeometry) {
      setMessage('请先选择一个几何模型');
      return;
    }
    setLoading(true);
    setShowMeshConfig(false);
    try {
      const res = await meshApi.generate({
        ...meshConfig,
        project_id: projectId,
        geometry_id: selectedGeometry.id
      });

      const taskId = res.data.task_id;
      setMeshProgress({ progress: 0, message: '开始生成网格...' });

      progressIntervalRef.current = window.setInterval(async () => {
        try {
          const progRes = await meshApi.getProgress(taskId);
          setMeshProgress(progRes.data);
          if (progRes.data.progress >= 1) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
            setTimeout(() => {
              loadProject();
              setMeshProgress(null);
              setLoading(false);
              setMessage('网格生成完成');
            }, 500);
          }
        } catch (e) {
          console.error('Progress error:', e);
        }
      }, 1000);

    } catch (e: any) {
      setMessage(e.response?.data?.detail || '网格生成失败');
      setLoading(false);
    }
  };

  const handleUploadResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResultName.trim() || !newResultFile) return;
    setLoading(true);
    try {
      await resultApi.upload(projectId, newResultName, newResultFile);
      setNewResultName('');
      setNewResultFile(null);
      setShowUploadResult(false);
      loadProject();
      setMessage('结果文件上传成功');
    } catch (e: any) {
      setMessage(e.response?.data?.detail || '上传失败');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMeshQuality = async () => {
    if (!selectedMesh) return;
    try {
      const res = await meshApi.getQuality(selectedMesh.id);
      setMeshQuality(res.data);
      setShowQuality(true);
    } catch (e) {
      console.error('Failed to load quality:', e);
    }
  };

  const handleSelectResult2 = async (result: Result) => {
    setSelectedResult2(result);
    try {
      const res = await resultApi.getData(result.id);
      setResultData2(res.data);
      const fields = Object.keys(res.data.fields || {});
      if (fields.length > 0) {
        setSelectedField2(fields[0]);
      }
    } catch (e) {
      console.error('Failed to load result2:', e);
    }
  };

  const handleAddRefinementZone = () => {
    const zone: MeshRefinementZone = {
      zone_type: newZone.zone_type,
      mesh_size: newZone.mesh_size,
      center: [...newZone.center],
      size: newZone.zone_type === 'box' ? [...newZone.size!] : undefined,
      radius: newZone.zone_type === 'sphere' || newZone.zone_type === 'cylinder' ? newZone.radius : undefined,
      height: newZone.zone_type === 'cylinder' ? newZone.height : undefined
    };
    setRefinementZones([...refinementZones, zone]);
    setMeshConfig({
      ...meshConfig,
      refinement_zones: [...refinementZones, zone]
    });
  };

  const handleRemoveRefinementZone = (index: number) => {
    const newZones = refinementZones.filter((_, i) => i !== index);
    setRefinementZones(newZones);
    setMeshConfig({ ...meshConfig, refinement_zones: newZones });
  };

  const handleExportCsv = async () => {
    if (!selectedResult) return;
    try {
      const res = await resultApi.exportCsv(selectedResult.id, selectedField);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedResult.name}_${selectedField}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('CSV 导出成功');
    } catch (e: any) {
      setMessage(e.response?.data?.detail || 'CSV 导出失败');
    }
  };

  const handleExportPdf = async () => {
    if (!selectedResult) return;
    try {
      const res = await resultApi.exportPdf(selectedResult.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedResult.name}_report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('PDF 报告导出成功');
    } catch (e: any) {
      setMessage(e.response?.data?.detail || 'PDF 导出失败');
    }
  };

  const tabs = [
    { key: 'geometry', label: '几何建模', icon: '📐' },
    { key: 'mesh', label: '网格生成', icon: '🔲' },
    { key: 'results', label: '结果后处理', icon: '📊' }
  ] as const;

  const availableFields = resultData ? Object.keys(resultData.fields || {}) : [];

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/projects')}>
          ← 返回项目列表
        </button>
        <div>
          <h1 style={styles.title}>{project?.name || '加载中...'}</h1>
          <p style={styles.subtitle}>{project?.description || 'FEA 项目工作区'}</p>
        </div>
      </header>

      <div style={styles.main}>
        <div style={styles.sidebar}>
          <div style={styles.tabs}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                style={{
                  ...styles.tab,
                  ...(activeTab === tab.key ? styles.tabActive : {})
                }}
                onClick={() => setActiveTab(tab.key)}
              >
                <span style={{ marginRight: 8 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'geometry' && (
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <h3 style={styles.panelTitle}>几何模型</h3>
                <div style={styles.panelActions}>
                  <button style={styles.btnSmall} onClick={() => setShowUploadGeo(true)}>
                    上传
                  </button>
                  <button style={styles.btnSmall} onClick={() => setShowParametric(true)}>
                    绘制
                  </button>
                </div>
              </div>
              <div style={styles.list}>
                {geometries.length === 0 ? (
                  <div style={styles.emptyList}>暂无几何模型</div>
                ) : (
                  geometries.map(geo => (
                    <div
                      key={geo.id}
                      style={{
                        ...styles.listItem,
                        ...(selectedGeometry?.id === geo.id ? styles.listItemActive : {})
                      }}
                      onClick={() => handleSelectGeometry(geo)}
                    >
                      <div>
                        <div style={styles.itemName}>{geo.name}</div>
                        <div style={styles.itemMeta}>
                          {geo.geometry_type} · {geo.dimensions}D
                          {geo.file_format && ` · ${geo.file_format.toUpperCase()}`}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'mesh' && (
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <h3 style={styles.panelTitle}>网格</h3>
                <div style={styles.panelActions}>
                  <button
                    style={styles.btnSmall}
                    onClick={() => setShowMeshConfig(true)}
                    disabled={!selectedGeometry}
                  >
                    生成
                  </button>
                </div>
              </div>
              <div style={styles.list}>
                {meshes.length === 0 ? (
                  <div style={styles.emptyList}>
                    暂无网格
                    <div style={styles.hint}>先选择几何模型，然后点击"生成"</div>
                  </div>
                ) : (
                  meshes.map(mesh => (
                    <div
                      key={mesh.id}
                      style={{
                        ...styles.listItem,
                        ...(selectedMesh?.id === mesh.id ? styles.listItemActive : {})
                      }}
                      onClick={() => handleSelectMesh(mesh)}
                    >
                      <div>
                        <div style={styles.itemName}>{mesh.name}</div>
                        <div style={styles.itemMeta}>
                          {mesh.element_type}
                          {mesh.num_nodes && ` · ${mesh.num_nodes}节点`}
                          {mesh.num_elements && ` · ${mesh.num_elements}单元`}
                        </div>
                        <div style={{
                          ...styles.status,
                          color: mesh.status === 'completed' ? '#4caf50' :
                                 mesh.status === 'failed' ? '#ef5350' : '#ffa726'
                        }}>
                          {mesh.status === 'completed' ? '✓ 完成' :
                           mesh.status === 'running' ? '⏳ 运行中' :
                           mesh.status === 'failed' ? '✗ 失败' : '等待中'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedMesh && selectedMesh.status === 'completed' && (
                <div style={styles.meshInfo}>
                  <h4 style={styles.infoTitle}>网格信息</h4>
                  <div style={styles.infoRow}>
                    <span>节点数:</span>
                    <span>{selectedMesh.num_nodes}</span>
                  </div>
                  <div style={styles.infoRow}>
                    <span>单元数:</span>
                    <span>{selectedMesh.num_elements}</span>
                  </div>
                  <div style={styles.infoRow}>
                    <span>单元类型:</span>
                    <span>{selectedMesh.element_type}</span>
                  </div>
                  <button
                    style={styles.btnPrimarySmall}
                    onClick={handleLoadMeshQuality}
                  >
                    查看质量评估
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'results' && (
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <h3 style={styles.panelTitle}>分析结果</h3>
                <div style={styles.panelActions}>
                  {selectedResult && (
                    <>
                      <button style={styles.btnSmall} onClick={handleExportCsv} title="导出CSV">
                        CSV
                      </button>
                      <button style={styles.btnSmall} onClick={handleExportPdf} title="导出PDF报告">
                        PDF
                      </button>
                    </>
                  )}
                  {results.length >= 2 && (
                    <button
                      style={{
                        ...styles.btnSmall,
                        ...(showCompareMode ? { background: '#4caf50', color: '#fff', borderColor: '#4caf50' } : {})
                      }}
                      onClick={() => setShowCompareMode(!showCompareMode)}
                    >
                      {showCompareMode ? '退出对比' : '对比'}
                    </button>
                  )}
                  <button style={styles.btnSmall} onClick={() => setShowUploadResult(true)}>
                    上传
                  </button>
                </div>
              </div>
              <div style={styles.list}>
                {results.length === 0 ? (
                  <div style={styles.emptyList}>
                    暂无分析结果
                    <div style={styles.hint}>上传 VTU/VTK 格式结果文件</div>
                  </div>
                ) : (
                  results.map(r => (
                    <div
                      key={r.id}
                      style={{
                        ...styles.listItem,
                        ...(selectedResult?.id === r.id ? styles.listItemActive : {}),
                        ...(showCompareMode && selectedResult2?.id === r.id ? { borderColor: '#ff9800', background: 'rgba(255,152,0,0.1)' } : {})
                      }}
                      onClick={() => {
                        if (showCompareMode) {
                          if (selectedResult?.id === r.id) {
                            handleSelectResult(r);
                          } else {
                            handleSelectResult2(r);
                          }
                        } else {
                          handleSelectResult(r);
                        }
                      }}
                    >
                      <div>
                        <div style={styles.itemName}>
                          {r.name}
                          {selectedResult?.id === r.id && <span style={{ color: '#2196f3', marginLeft: 8 }}>[A]</span>}
                          {showCompareMode && selectedResult2?.id === r.id && <span style={{ color: '#ff9800', marginLeft: 8 }}>[B]</span>}
                        </div>
                        <div style={styles.itemMeta}>
                          {r.file_format?.toUpperCase()}
                          {r.fields && r.fields.length > 0 && ` · ${r.fields.length}个场`}
                          {r.num_timesteps > 1 && ` · ${r.num_timesteps}时间步`}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {showCompareMode && selectedResult2 && (
                <div style={{ ...styles.resultControls, background: 'rgba(255,152,0,0.1)', borderTopColor: 'rgba(255,152,0,0.4)' }}>
                  <h4 style={{ ...styles.infoTitle, color: '#ff9800' }}>对比视图 [B]</h4>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>选择场量 (B)</label>
                    <select
                      style={styles.select}
                      value={selectedField2}
                      onChange={(e) => setSelectedField2(e.target.value)}
                    >
                      {resultData2 ? Object.keys(resultData2.fields || {}).map(f => (
                        <option key={f} value={f}>{f}</option>
                      )) : <option value="">无</option>}
                    </select>
                  </div>
                </div>
              )}

              {selectedResult && resultData && (
                <div style={styles.resultControls}>
                  <h4 style={styles.infoTitle}>
                    可视化控制 {showCompareMode ? '[A]' : ''}
                  </h4>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>选择场量</label>
                    <select
                      style={styles.select}
                      value={selectedField}
                      onChange={(e) => setSelectedField(e.target.value)}
                    >
                      {availableFields.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.checkboxGroup}>
                    <input
                      type="checkbox"
                      id="showVectors"
                      checked={showVectors}
                      onChange={(e) => setShowVectors(e.target.checked)}
                    />
                    <label htmlFor="showVectors" style={styles.checkboxLabel}>
                      显示矢量场
                    </label>
                  </div>
                  {showVectors && (
                    <div style={styles.formGroup}>
                      <label style={styles.label}>
                        矢量缩放: {vectorScale.toFixed(1)}
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="10"
                        step="0.1"
                        value={vectorScale}
                        onChange={(e) => setVectorScale(parseFloat(e.target.value))}
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={styles.viewer}>
          {showCompareMode && selectedResult2 && resultData2 ? (
            <div style={styles.compareViewer}>
              <div style={styles.comparePanel}>
                <div style={styles.compareLabel}>A: {selectedResult?.name}</div>
                <ThreeViewer
                  geometryPreview={null}
                  resultData={resultData}
                  selectedField={selectedField}
                  showVectors={showVectors}
                  vectorScale={vectorScale}
                />
              </div>
              <div style={styles.compareDivider}></div>
              <div style={styles.comparePanel}>
                <div style={{ ...styles.compareLabel, background: 'rgba(255,152,0,0.8)' }}>
                  B: {selectedResult2?.name}
                </div>
                <ThreeViewer
                  geometryPreview={null}
                  resultData={resultData2}
                  selectedField={selectedField2}
                  showVectors={showVectors}
                  vectorScale={vectorScale}
                />
              </div>
            </div>
          ) : (
            <>
              <ThreeViewer
                geometryPreview={geometryPreview}
                resultData={resultData}
                selectedField={selectedField}
                showVectors={showVectors}
                vectorScale={vectorScale}
              />
            </>
          )}

          <div style={styles.viewerInfo}>
            <div style={styles.viewerInfoItem}>
              平移: 鼠标中键 | 旋转: 鼠标左键 | 缩放: 滚轮
            </div>
            {geometryPreview && (
              <div style={styles.viewerInfoItem}>
                顶点: {geometryPreview.vertices?.length || 0}
                {geometryPreview.faces && ` | 面: ${geometryPreview.faces.length}`}
              </div>
            )}
            {resultData && !showCompareMode && (
              <div style={styles.viewerInfoItem}>
                节点: {resultData.nodes?.length || 0}
                {selectedField && (
                  <span>
                    | 场: {selectedField}
                    {resultData.fields[selectedField]?.min !== undefined &&
                     resultData.fields[selectedField]?.max !== undefined &&
                     ` [${resultData.fields[selectedField].min?.toExponential(2)} - ${resultData.fields[selectedField].max?.toExponential(2)}]`
                    }
                  </span>
                )}
              </div>
            )}
            {showCompareMode && resultData && resultData2 && (
              <div style={styles.viewerInfoItem}>
                [A]节点: {resultData.nodes?.length || 0} | [B]节点: {resultData2.nodes?.length || 0}
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingContent}>
            <div style={styles.spinner}></div>
            <div style={styles.loadingText}>
              {meshProgress ? `${(meshProgress.progress * 100).toFixed(0)}% - ${meshProgress.message}` : '加载中...'}
            </div>
          </div>
        </div>
      )}

      {showUploadGeo && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>上传几何模型</h3>
            <form onSubmit={handleUploadGeometry}>
              <div style={styles.formGroup}>
                <label style={styles.label}>名称</label>
                <input
                  type="text"
                  style={styles.input}
                  value={newGeoName}
                  onChange={(e) => setNewGeoName(e.target.value)}
                  placeholder="几何模型名称"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>维度</label>
                <select
                  style={styles.select}
                  value={newGeoDimensions}
                  onChange={(e) => setNewGeoDimensions(parseInt(e.target.value))}
                >
                  <option value={3}>3D</option>
                  <option value={2}>2D</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>文件 (STEP/IGES/STL)</label>
                <input
                  type="file"
                  style={styles.fileInput}
                  onChange={(e) => setNewGeoFile(e.target.files?.[0] || null)}
                  accept=".step,.stp,.iges,.igs,.stl"
                />
              </div>
              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.btnSecondary}
                  onClick={() => setShowUploadGeo(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  style={styles.btnPrimary}
                  disabled={!newGeoName.trim() || !newGeoFile}
                >
                  上传
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showParametric && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>创建参数化几何体</h3>
            <form onSubmit={handleCreateParametric}>
              <div style={styles.formGroup}>
                <label style={styles.label}>名称</label>
                <input
                  type="text"
                  style={styles.input}
                  value={paramName}
                  onChange={(e) => setParamName(e.target.value)}
                  placeholder="几何体名称"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>类型</label>
                <select
                  style={styles.select}
                  value={paramType}
                  onChange={(e) => setParamType(e.target.value)}
                >
                  <option value="cube">立方体 (3D)</option>
                  <option value="sphere">球体 (3D)</option>
                  <option value="rectangle">矩形 (2D)</option>
                  <option value="circle">圆形 (2D)</option>
                </select>
              </div>
              {paramType === 'cube' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>尺寸: {paramParams.size}</label>
                  <input
                    type="range"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={paramParams.size}
                    onChange={(e) => setParamParams({ ...paramParams, size: parseFloat(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
              {(paramType === 'sphere' || paramType === 'circle') && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>半径: {paramParams.radius}</label>
                  <input
                    type="range"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={paramParams.radius}
                    onChange={(e) => setParamParams({ ...paramParams, radius: parseFloat(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
              {paramType === 'rectangle' && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>宽度: {paramParams.width}</label>
                    <input
                      type="range"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={paramParams.width}
                      onChange={(e) => setParamParams({ ...paramParams, width: parseFloat(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>高度: {paramParams.height}</label>
                    <input
                      type="range"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={paramParams.height}
                      onChange={(e) => setParamParams({ ...paramParams, height: parseFloat(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </>
              )}
              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.btnSecondary}
                  onClick={() => setShowParametric(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  style={styles.btnPrimary}
                  disabled={!paramName.trim()}
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMeshConfig && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>网格配置</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>单元类型</label>
              <select
                style={styles.select}
                value={meshConfig.element_type}
                onChange={(e) => setMeshConfig({ ...meshConfig, element_type: e.target.value as any })}
              >
                <option value="tetra">四面体</option>
                <option value="hex">六面体</option>
                <option value="triangle">三角形</option>
                <option value="quad">四边形</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>网格尺寸: {meshConfig.mesh_size}</label>
              <input
                type="range"
                min="0.05"
                max="5"
                step="0.05"
                value={meshConfig.mesh_size}
                onChange={(e) => setMeshConfig({ ...meshConfig, mesh_size: parseFloat(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>最小尺寸: {meshConfig.min_mesh_size}</label>
              <input
                type="range"
                min="0.01"
                max="1"
                step="0.01"
                value={meshConfig.min_mesh_size}
                onChange={(e) => setMeshConfig({ ...meshConfig, min_mesh_size: parseFloat(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>最大尺寸: {meshConfig.max_mesh_size}</label>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.1"
                value={meshConfig.max_mesh_size}
                onChange={(e) => setMeshConfig({ ...meshConfig, max_mesh_size: parseFloat(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>平滑次数: {meshConfig.smoothing_iterations}</label>
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={meshConfig.smoothing_iterations}
                onChange={(e) => setMeshConfig({ ...meshConfig, smoothing_iterations: parseInt(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>单元阶数</label>
              <select
                style={styles.select}
                value={meshConfig.element_order}
                onChange={(e) => setMeshConfig({ ...meshConfig, element_order: parseInt(e.target.value) })}
              >
                <option value={1}>线性 (1阶)</option>
                <option value={2}>二次 (2阶)</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...styles.label, margin: 0 }}>
                  局部加密区域 ({refinementZones.length})
                </label>
                <button
                  type="button"
                  style={styles.btnSmall}
                  onClick={handleAddRefinementZone}
                >
                  + 添加
                </button>
              </div>

              {refinementZones.length === 0 ? (
                <div style={{ fontSize: 11, color: '#6b859e', padding: '8px 0' }}>
                  未添加加密区域，使用全局尺寸
                </div>
              ) : (
                <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                  {refinementZones.map((zone, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 10px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 4,
                      marginBottom: 4,
                      fontSize: 12
                    }}>
                      <span>
                        {zone.zone_type} · {zone.mesh_size} @ ({zone.center[0]},{zone.center[1]},{zone.center[2]})
                      </span>
                      <button
                        type="button"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef5350',
                          cursor: 'pointer',
                          padding: '2px 6px'
                        }}
                        onClick={() => handleRemoveRefinementZone(idx)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {refinementZones.length < 5 && (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: 'rgba(33,150,243,0.1)',
                  borderRadius: 6
                }}>
                  <div style={{ fontSize: 12, color: '#64b5f6', marginBottom: 8 }}>新加密区域配置</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#6b859e' }}>类型</label>
                      <select
                        style={{ ...styles.select, padding: '6px 10px', fontSize: 12, width: '100%' }}
                        value={newZone.zone_type}
                        onChange={(e) => setNewZone({ ...newZone, zone_type: e.target.value as any })}
                      >
                        <option value="box">长方体</option>
                        <option value="sphere">球体</option>
                        <option value="cylinder">圆柱体</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6b859e' }}>尺寸</label>
                      <input
                        type="number"
                        step="0.01"
                        style={{ ...styles.input, padding: '6px 10px', fontSize: 12, width: '100%' }}
                        value={newZone.mesh_size}
                        onChange={(e) => setNewZone({ ...newZone, mesh_size: parseFloat(e.target.value) || 0.1 })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6b859e' }}>中心 X</label>
                      <input
                        type="number"
                        step="0.1"
                        style={{ ...styles.input, padding: '6px 10px', fontSize: 12, width: '100%' }}
                        value={newZone.center[0]}
                        onChange={(e) => setNewZone({ ...newZone, center: [parseFloat(e.target.value) || 0, newZone.center[1], newZone.center[2]] })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6b859e' }}>中心 Y</label>
                      <input
                        type="number"
                        step="0.1"
                        style={{ ...styles.input, padding: '6px 10px', fontSize: 12, width: '100%' }}
                        value={newZone.center[1]}
                        onChange={(e) => setNewZone({ ...newZone, center: [newZone.center[0], parseFloat(e.target.value) || 0, newZone.center[2]] })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6b859e' }}>中心 Z</label>
                      <input
                        type="number"
                        step="0.1"
                        style={{ ...styles.input, padding: '6px 10px', fontSize: 12, width: '100%' }}
                        value={newZone.center[2]}
                        onChange={(e) => setNewZone({ ...newZone, center: [newZone.center[0], newZone.center[1], parseFloat(e.target.value) || 0] })}
                      />
                    </div>
                    {newZone.zone_type === 'box' ? (
                      <div>
                        <label style={{ fontSize: 11, color: '#6b859e' }}>范围 WxHxD</label>
                        <input
                          type="text"
                          placeholder="1,1,1"
                          style={{ ...styles.input, padding: '6px 10px', fontSize: 12, width: '100%' }}
                          value={(newZone.size || [1, 1, 1]).join(',')}
                          onChange={(e) => {
                            const parts = e.target.value.split(',').map(v => parseFloat(v.trim()) || 1);
                            setNewZone({ ...newZone, size: [parts[0] || 1, parts[1] || 1, parts[2] || 1] });
                          }}
                        />
                      </div>
                    ) : (
                      <div>
                        <label style={{ fontSize: 11, color: '#6b859e' }}>半径</label>
                        <input
                          type="number"
                          step="0.1"
                          style={{ ...styles.input, padding: '6px 10px', fontSize: 12, width: '100%' }}
                          value={newZone.radius || 0.5}
                          onChange={(e) => setNewZone({ ...newZone, radius: parseFloat(e.target.value) || 0.5 })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.btnSecondary}
                onClick={() => setShowMeshConfig(false)}
              >
                取消
              </button>
              <button
                style={styles.btnPrimary}
                onClick={handleGenerateMesh}
              >
                开始生成
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadResult && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>上传分析结果</h3>
            <form onSubmit={handleUploadResult}>
              <div style={styles.formGroup}>
                <label style={styles.label}>名称</label>
                <input
                  type="text"
                  style={styles.input}
                  value={newResultName}
                  onChange={(e) => setNewResultName(e.target.value)}
                  placeholder="结果名称"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>文件 (VTU/VTK)</label>
                <input
                  type="file"
                  style={styles.fileInput}
                  onChange={(e) => setNewResultFile(e.target.files?.[0] || null)}
                  accept=".vtu,.vtk"
                />
              </div>
              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.btnSecondary}
                  onClick={() => setShowUploadResult(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  style={styles.btnPrimary}
                  disabled={!newResultName.trim() || !newResultFile}
                >
                  上传
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQuality && meshQuality && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>网格质量评估</h3>
            <div style={styles.qualityGrid}>
              <div style={styles.qualityItem}>
                <div style={styles.qualityLabel}>单元质量</div>
                <div style={styles.qualityValue}>
                  最小: {meshQuality.min_quality.toFixed(3)}<br />
                  最大: {meshQuality.max_quality.toFixed(3)}<br />
                  平均: {meshQuality.avg_quality.toFixed(3)}
                </div>
              </div>
              <div style={styles.qualityItem}>
                <div style={styles.qualityLabel}>纵横比</div>
                <div style={styles.qualityValue}>
                  最小: {meshQuality.min_aspect_ratio.toFixed(2)}<br />
                  最大: {meshQuality.max_aspect_ratio.toFixed(2)}<br />
                  平均: {meshQuality.avg_aspect_ratio.toFixed(2)}
                </div>
              </div>
              <div style={styles.qualityItem}>
                <div style={styles.qualityLabel}>内角 (°)</div>
                <div style={styles.qualityValue}>
                  最小: {meshQuality.min_angle.toFixed(1)}<br />
                  最大: {meshQuality.max_angle.toFixed(1)}<br />
                  平均: {meshQuality.avg_angle.toFixed(1)}
                </div>
              </div>
            </div>
            <div style={styles.qualityBar}>
              <div style={styles.qualityBarLabel}>质量分布 (0-1)</div>
              <div style={styles.qualityBarContainer}>
                {meshQuality.quality_histogram.map((count, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.qualityBarSegment,
                      height: `${Math.max(5, (count / Math.max(...meshQuality.quality_histogram, 1)) * 80)}px`,
                      background: `hsl(${120 - i * 12}, 70%, 50%)`
                    }}
                    title={`区间 ${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}: ${count}个单元`}
                  />
                ))}
              </div>
            </div>
            <div style={styles.modalActions}>
              <button
                style={styles.btnPrimary}
                onClick={() => setShowQuality(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div style={styles.message} onDoubleClick={() => setMessage('')}>
          {message}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#0d1b2a',
    color: '#e0e6ed',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    background: '#1e3a5f',
  },
  backBtn: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#e0e6ed',
    padding: '8px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
    color: '#fff',
  },
  subtitle: {
    fontSize: 13,
    color: '#8aa4c4',
    margin: 0,
    marginTop: 2,
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  sidebar: {
    width: 320,
    background: '#162a42',
    borderRight: '1px solid rgba(255,255,255,0.1)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  tab: {
    flex: 1,
    padding: '12px 8px',
    background: 'transparent',
    border: 'none',
    color: '#8aa4c4',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  },
  tabActive: {
    color: '#fff',
    borderBottom: '2px solid #2196f3',
    background: 'rgba(33,150,243,0.1)',
  },
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
  },
  panelActions: {
    display: 'flex',
    gap: 8,
  },
  btnSmall: {
    background: 'rgba(33,150,243,0.2)',
    border: '1px solid rgba(33,150,243,0.4)',
    color: '#64b5f6',
    padding: '6px 12px',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
  },
  btnPrimarySmall: {
    background: '#2196f3',
    border: 'none',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    width: '100%',
    marginTop: 12,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
  },
  emptyList: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#6b859e',
    fontSize: 13,
  },
  hint: {
    fontSize: 11,
    color: '#5a718a',
    marginTop: 8,
  },
  listItem: {
    padding: 12,
    borderRadius: 8,
    cursor: 'pointer',
    marginBottom: 4,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid transparent',
  },
  listItemActive: {
    background: 'rgba(33,150,243,0.15)',
    borderColor: 'rgba(33,150,243,0.4)',
  },
  itemName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#fff',
  },
  itemMeta: {
    fontSize: 11,
    color: '#6b859e',
    marginTop: 2,
  },
  status: {
    fontSize: 11,
    marginTop: 4,
  },
  viewer: {
    flex: 1,
    position: 'relative',
    background: '#0a1628',
  },
  viewerInfo: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    display: 'flex',
    justifyContent: 'space-between',
    pointerEvents: 'none',
  },
  viewerInfoItem: {
    background: 'rgba(0,0,0,0.6)',
    padding: '8px 16px',
    borderRadius: 6,
    fontSize: 11,
    color: '#8aa4c4',
  },
  meshInfo: {
    padding: 16,
    borderTop: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.2)',
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: 600,
    margin: 0,
    marginBottom: 12,
    color: '#fff',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#8aa4c4',
    marginBottom: 6,
  },
  resultControls: {
    padding: 16,
    borderTop: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.2)',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1e3a5f',
    borderRadius: 12,
    padding: 28,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
    marginBottom: 20,
    color: '#fff',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: '#8aa4c4',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    boxSizing: 'border-box',
  },
  fileInput: {
    width: '100%',
    padding: 10,
    color: '#8aa4c4',
    fontSize: 13,
  },
  checkboxGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#8aa4c4',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  btnPrimary: {
    background: '#2196f3',
    border: 'none',
    color: '#fff',
    padding: '10px 24px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#e0e6ed',
    padding: '10px 24px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  loadingOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  loadingContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  spinner: {
    width: 48,
    height: 48,
    border: '4px solid rgba(33,150,243,0.3)',
    borderTopColor: '#2196f3',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
  },
  qualityGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    marginBottom: 20,
  },
  qualityItem: {
    background: 'rgba(0,0,0,0.2)',
    padding: 16,
    borderRadius: 8,
    textAlign: 'center',
  },
  qualityLabel: {
    fontSize: 12,
    color: '#8aa4c4',
    marginBottom: 8,
  },
  qualityValue: {
    fontSize: 13,
    color: '#fff',
    lineHeight: 1.6,
  },
  qualityBar: {
    background: 'rgba(0,0,0,0.2)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  qualityBarLabel: {
    fontSize: 12,
    color: '#8aa4c4',
    marginBottom: 12,
    textAlign: 'center',
  },
  qualityBarContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 100,
    gap: 4,
  },
  qualityBarSegment: {
    flex: 1,
    borderRadius: '4px 4px 0 0',
    minWidth: 4,
    transition: 'height 0.3s',
  },
  message: {
    position: 'fixed',
    top: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(33,150,243,0.95)',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: 8,
    fontSize: 13,
    zIndex: 2000,
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  compareViewer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    gap: 2,
  },
  comparePanel: {
    flex: 1,
    position: 'relative',
    background: '#0a1628',
  },
  compareDivider: {
    width: 2,
    background: 'rgba(255,255,255,0.2)',
  },
  compareLabel: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 10,
    background: 'rgba(33,150,243,0.9)',
    color: '#fff',
    padding: '4px 12px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
  },
};

export default ProjectWorkspace;
