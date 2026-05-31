import { create } from 'zustand';
import type { Project, Geometry, Mesh, Result } from '@/types';

interface AppState {
  currentProject: Project | null;
  projects: Project[];
  geometries: Geometry[];
  meshes: Mesh[];
  results: Result[];
  selectedGeometry: Geometry | null;
  selectedMesh: Mesh | null;
  selectedResult: Result | null;
  activeTab: 'geometry' | 'mesh' | 'results';
  setCurrentProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
  setGeometries: (geometries: Geometry[]) => void;
  setMeshes: (meshes: Mesh[]) => void;
  setResults: (results: Result[]) => void;
  setSelectedGeometry: (geometry: Geometry | null) => void;
  setSelectedMesh: (mesh: Mesh | null) => void;
  setSelectedResult: (result: Result | null) => void;
  setActiveTab: (tab: 'geometry' | 'mesh' | 'results') => void;
  resetSelection: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentProject: null,
  projects: [],
  geometries: [],
  meshes: [],
  results: [],
  selectedGeometry: null,
  selectedMesh: null,
  selectedResult: null,
  activeTab: 'geometry',
  setCurrentProject: (project) => set({ currentProject: project }),
  setProjects: (projects) => set({ projects }),
  setGeometries: (geometries) => set({ geometries }),
  setMeshes: (meshes) => set({ meshes }),
  setResults: (results) => set({ results }),
  setSelectedGeometry: (geometry) => set({ selectedGeometry: geometry }),
  setSelectedMesh: (mesh) => set({ selectedMesh: mesh }),
  setSelectedResult: (result) => set({ selectedResult: result }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  resetSelection: () => set({
    selectedGeometry: null,
    selectedMesh: null,
    selectedResult: null
  }),
}));
