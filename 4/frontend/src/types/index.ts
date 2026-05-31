export interface Project {
  id: number;
  name: string;
  description?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Geometry {
  id: number;
  project_id: number;
  name: string;
  file_path?: string;
  file_format?: string;
  geometry_type: string;
  dimensions: number;
  parameters?: Record<string, any>;
  bounding_box?: {
    min: number[];
    max: number[];
    center: number[];
    size: number[];
  };
  created_at: string;
}

export interface MeshRefinementZone {
  zone_type: 'box' | 'sphere' | 'cylinder';
  mesh_size: number;
  center: number[];
  size?: number[];
  radius?: number;
  height?: number;
}

export interface MeshConfig {
  element_type: 'triangle' | 'quad' | 'tetra' | 'hex';
  mesh_size: number;
  min_mesh_size: number;
  max_mesh_size: number;
  algorithm_2d: number;
  algorithm_3d: number;
  smoothing_iterations: number;
  element_order: number;
  structured: number;
  refinement_zones?: MeshRefinementZone[];
}

export interface MeshQuality {
  min_quality: number;
  max_quality: number;
  avg_quality: number;
  min_aspect_ratio: number;
  max_aspect_ratio: number;
  avg_aspect_ratio: number;
  min_angle: number;
  max_angle: number;
  avg_angle: number;
  quality_histogram: number[];
}

export interface Mesh {
  id: number;
  project_id: number;
  geometry_id?: number;
  name: string;
  element_type?: string;
  num_nodes?: number;
  num_elements?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  quality_stats?: MeshQuality;
  created_at: string;
  mesh_data?: {
    nodes: number[][];
    elements: any[];
  };
}

export interface FieldInfo {
  type: 'scalar' | 'vector';
  num_components: number;
  min?: number;
  max?: number;
}

export interface Result {
  id: number;
  project_id: number;
  mesh_id?: number;
  name: string;
  result_type?: string;
  file_format?: string;
  fields?: string[];
  num_timesteps: number;
  metadata?: {
    field_info?: Record<string, FieldInfo>;
  };
  created_at: string;
}

export interface GeometryPreview {
  vertices: number[][];
  faces: number[][];
  edges?: number[][];
}

export interface ResultData {
  nodes: number[][];
  elements: Array<{ type: string; connectivity: number[][] }>;
  fields: Record<string, {
    type: 'scalar' | 'vector';
    num_components: number;
    data: number[];
    min?: number;
    max?: number;
  }>;
}

export interface MeshProgress {
  progress: number;
  message: string;
}

export interface ParametricGeomType {
  type: string;
  params: string[];
}

export interface Plane {
  origin: number[];
  normal: number[];
}
