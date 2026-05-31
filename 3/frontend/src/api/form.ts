import request from '@/utils/request';
import { Form, FormField, FormLayout, FormVersion, FormSubmission } from '@/types';

export interface CreateFormData {
  name: string;
  description?: string;
  fields?: FormField[];
  layout?: FormLayout;
}

export interface UpdateFormData {
  name?: string;
  description?: string;
  fields?: FormField[];
  layout?: FormLayout;
}

export const formApi = {
  getForms(): Promise<Form[]> {
    return request.get('/forms');
  },

  getPublishedForms(): Promise<Form[]> {
    return request.get('/forms/published');
  },

  getForm(id: string): Promise<Form> {
    return request.get(`/forms/${id}`);
  },

  createForm(data: CreateFormData): Promise<Form> {
    return request.post('/forms', data);
  },

  updateForm(id: string, data: UpdateFormData): Promise<Form> {
    return request.put(`/forms/${id}`, data);
  },

  deleteForm(id: string): Promise<void> {
    return request.delete(`/forms/${id}`);
  },

  publishForm(id: string): Promise<Form> {
    return request.post(`/forms/${id}/publish`);
  },

  unpublishForm(id: string): Promise<Form> {
    return request.post(`/forms/${id}/unpublish`);
  },

  getFormVersions(id: string): Promise<FormVersion[]> {
    return request.get(`/forms/${id}/versions`);
  },

  getFormVersion(id: string, version: number): Promise<FormVersion> {
    return request.get(`/forms/${id}/versions/${version}`);
  },

  restoreVersion(id: string, version: number): Promise<Form> {
    return request.post(`/forms/${id}/versions/${version}/restore`);
  },

  submitForm(id: string, data: { data: Record<string, any> }): Promise<FormSubmission> {
    return request.post(`/form-submissions/form/${id}/submit`, data);
  },

  getSubmissions(id: string, params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }): Promise<{ items: FormSubmission[]; total: number; page: number; pageSize: number }> {
    return request.get(`/form-submissions/form/${id}`, { params });
  },

  exportSubmissions(id: string, format: 'excel' | 'csv'): Promise<Blob> {
    return request.get(`/form-submissions/form/${id}/export/${format}`, {
      responseType: 'blob',
    });
  },
};

export const formSubmissionApi = {
  getMySubmissions(): Promise<FormSubmission[]> {
    return request.get('/form-submissions/mine');
  },

  getFormSubmissions(formId: string, params?: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: FormSubmission[]; total: number; page: number; pageSize: number }> {
    return request.get(`/form-submissions/form/${formId}`, { params });
  },

  getSubmission(id: string): Promise<FormSubmission> {
    return request.get(`/form-submissions/${id}`);
  },

  getFormForSubmission(formId: string): Promise<{ form: Form; fields: FormField[] }> {
    return request.get(`/form-submissions/form/${formId}/view`);
  },

  submitForm(formId: string, data: Record<string, any>): Promise<FormSubmission> {
    return request.post(`/form-submissions/form/${formId}/submit`, { data });
  },

  deleteSubmission(id: string): Promise<void> {
    return request.delete(`/form-submissions/${id}`);
  },

  batchDelete(formId: string, ids: string[]): Promise<void> {
    return request.post(`/form-submissions/form/${formId}/batch-delete`, { ids });
  },

  exportExcel(formId: string): Promise<Blob> {
    return request.get(`/form-submissions/form/${formId}/export/excel`, {
      responseType: 'blob',
    });
  },

  exportCsv(formId: string): Promise<Blob> {
    return request.get(`/form-submissions/form/${formId}/export/csv`, {
      responseType: 'blob',
    });
  },

  getTenantStats(): Promise<{
    totalForms: number;
    totalSubmissions: number;
    todaySubmissions: number;
    pendingApprovals: number;
  }> {
    return request.get('/form-submissions/stats/tenant');
  },

  getTenantTrend(days: number = 30): Promise<{ date: string; count: number }[]> {
    return request.get('/form-submissions/stats/tenant/trend', { params: { days } });
  },

  getFormTrend(formId: string, days: number = 30): Promise<{ date: string; count: number }[]> {
    return request.get(`/form-submissions/stats/form/${formId}/trend`, { params: { days } });
  },

  getFieldDistribution(formId: string): Promise<Record<string, { value: string; count: number }[]>> {
    return request.get(`/form-submissions/stats/form/${formId}/field-distribution`);
  },

  getStatusDistribution(formId: string): Promise<{ status: string; count: number; label: string }[]> {
    return request.get(`/form-submissions/stats/form/${formId}/status-distribution`);
  },

  togglePublic(formId: string, settings?: any): Promise<{
    form: any;
    iframeUrl: string;
    iframeCode: string;
  }> {
    return request.post(`/forms/${formId}/toggle-public`, settings);
  },

  refreshPublicToken(formId: string): Promise<{
    form: any;
    iframeUrl: string;
    iframeCode: string;
  }> {
    return request.post(`/forms/${formId}/refresh-token`);
  },

  getEmbedCode(formId: string): Promise<{
    isPublic: boolean;
    publicToken?: string;
    iframeUrl?: string;
    iframeCode?: string;
    publicSettings?: any;
  }> {
    return request.get(`/forms/${formId}/embed-code`);
  },
};
