import axios from 'axios';
import type {
  Project, Geometry, Mesh, MeshConfig, Result,
  GeometryPreview, ResultData, MeshQuality, MeshProgress,
  ParametricGeomType
} from '@/types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const projectApi = {
  list: () => api.get<Project[]>('/projects'),
  create: (data: { name: string; description?: string }) =>
    api.post<Project>('/projects', data),
  get: (id: number) => api.get<Project>(`/projects/${id}`),
  update: (id: number, data: Partial<Project>) =>
    api.put<Project>(`/projects/${id}`, data),
  delete: (id: number) => api.delete(`/projects/${id}`),
  summary: (id: number) => api.get(`/projects/${id}/summary`),
};

export const geometryApi = {
  list: (projectId: number) =>
    api.get<Geometry[]>('/geometry', { params: { project_id: projectId } }),
  upload: (projectId: number, name: string, file: File, dimensions: number = 3) => {
    const formData = new FormData();
    formData.append('project_id', String(projectId));
    formData.append('name', name);
    formData.append('file', file);
    formData.append('dimensions', String(dimensions));
    return api.post<Geometry>('/geometry/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  createParametric: (data: {
    project_id: number;
    name: string;
    geometry_type: string;
    dimensions: number;
    parameters?: Record<string, any>;
  }) => api.post<Geometry>('/geometry/parametric', data),
  get: (id: number) => api.get<Geometry>(`/geometry/${id}`),
  getPreview: (id: number) =>
    api.get<GeometryPreview>(`/geometry/${id}/preview`),
  delete: (id: number) => api.delete(`/geometry/${id}`),
  getTypes: () => api.get<{ '2d': ParametricGeomType[]; '3d': ParametricGeomType[] }>('/geometry/types/available'),
};

export const meshApi = {
  list: (projectId: number) =>
    api.get<Mesh[]>('/mesh', { params: { project_id: projectId } }),
  generate: (config: MeshConfig & { project_id: number; geometry_id?: number }) =>
    api.post('/mesh/generate', config),
  getProgress: (taskId: string) =>
    api.get<MeshProgress>(`/mesh/progress/${taskId}`),
  get: (id: number) => api.get<Mesh>(`/mesh/${id}`),
  download: (id: number, format: 'vtk' | 'msh') =>
    api.get(`/mesh/${id}/download/${format}`, { responseType: 'blob' }),
  delete: (id: number) => api.delete(`/mesh/${id}`),
  getQuality: (id: number) =>
    api.get<MeshQuality>(`/mesh/${id}/quality`),
};

export const resultApi = {
  list: (projectId: number) =>
    api.get<Result[]>('/results', { params: { project_id: projectId } }),
  upload: (projectId: number, name: string, file: File, resultType: string = 'analysis') => {
    const formData = new FormData();
    formData.append('project_id', String(projectId));
    formData.append('name', name);
    formData.append('result_type', resultType);
    formData.append('file', file);
    return api.post('/results/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  get: (id: number) => api.get<Result>(`/results/${id}`),
  getData: (id: number) => api.get<ResultData>(`/results/${id}/data`),
  getField: (id: number, fieldName: string, timestep: number = 0) =>
    api.get(`/results/${id}/field/${fieldName}`, { params: { timestep } }),
  getSlice: (id: number, plane: { origin: number[]; normal: number[] }, fieldName?: string) =>
    api.post(`/results/${id}/slice`, plane, { params: { field_name: fieldName } }),
  getContours: (id: number, fieldName: string, numLevels: number = 10) =>
    api.get(`/results/${id}/contours/${fieldName}`, { params: { num_levels: numLevels } }),
  download: (id: number) =>
    api.get(`/results/${id}/download`, { responseType: 'blob' }),
  exportCsv: (id: number, fieldName?: string, timestep: number = 0) =>
    api.get(`/results/${id}/export/csv`, { 
      params: { field_name: fieldName, timestep },
      responseType: 'blob' 
    }),
  exportPdf: (id: number) =>
    api.get(`/results/${id}/export/pdf`, { responseType: 'blob' }),
  delete: (id: number) => api.delete(`/results/${id}`),
  getAnimationInfo: (id: number) =>
    api.get(`/results/${id}/animation`),
  getTimestep: (id: number, timestep: number) =>
    api.get<ResultData>(`/results/${id}/timestep/${timestep}`),
};

export default api;
