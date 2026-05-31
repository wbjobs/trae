import client from './client';

export interface DataSource {
  id: number;
  name: string;
  type: 'influxdb' | 'prometheus' | 'csv';
  connection_info: Record<string, any>;
  field_mapping: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DataSourceCreate {
  name: string;
  type: string;
  connection_info: Record<string, any>;
  field_mapping: Record<string, any>;
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  tags?: Record<string, any>;
}

export interface DataQueryParams {
  start_time: string;
  end_time: string;
  aggregation: 'mean' | 'sum' | 'max' | 'min';
  interval: string;
}

export const datasourceApi = {
  getAll: () => client.get<DataSource[]>('/datasources'),
  getById: (id: number) => client.get<DataSource>(`/datasources/${id}`),
  create: (data: DataSourceCreate) => client.post<DataSource>('/datasources', data),
  update: (id: number, data: Partial<DataSourceCreate>) =>
    client.put<DataSource>(`/datasources/${id}`, data),
  delete: (id: number) => client.delete(`/datasources/${id}`),
  test: (id: number) => client.post(`/datasources/${id}/test`),
  uploadCsv: (id: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post(`/datasources/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  query: (id: number, params: DataQueryParams) =>
    client.post<{ datasource: string; data: TimeSeriesPoint[]; count: number }>(
      `/datasources/${id}/query`,
      params
    ),
};
