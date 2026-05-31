import request from '@/utils/request';
import { ApprovalFlow, ApprovalNode, ApprovalTask, ApprovalInstance } from '@/types';

export interface CreateFlowData {
  name: string;
  description?: string;
  formId: string;
  nodes: Omit<ApprovalNode, 'id' | 'flowId' | 'flow' | 'createdAt'>[];
}

export interface UpdateFlowData {
  name?: string;
  description?: string;
  nodes?: Omit<ApprovalNode, 'id' | 'flowId' | 'flow' | 'createdAt'>[];
  status?: 'draft' | 'active' | 'inactive';
}

export const approvalApi = {
  getFlows(): Promise<ApprovalFlow[]> {
    return request.get('/approval/flows');
  },

  getFlow(id: string): Promise<ApprovalFlow> {
    return request.get(`/approval/flows/${id}`);
  },

  getFlowByFormId(formId: string): Promise<ApprovalFlow | null> {
    return request.get(`/approval/flows/form/${formId}`);
  },

  createFlow(data: CreateFlowData): Promise<ApprovalFlow> {
    return request.post('/approval/flows', data);
  },

  updateFlow(id: string, data: UpdateFlowData): Promise<ApprovalFlow> {
    return request.put(`/approval/flows/${id}`, data);
  },

  deleteFlow(id: string): Promise<void> {
    return request.delete(`/approval/flows/${id}`);
  },

  activateFlow(id: string): Promise<ApprovalFlow> {
    return request.post(`/approval/flows/${id}/activate`);
  },

  deactivateFlow(id: string): Promise<ApprovalFlow> {
    return request.post(`/approval/flows/${id}/deactivate`);
  },

  enableFlow(id: string): Promise<ApprovalFlow> {
    return request.post(`/approval/flows/${id}/enable`);
  },

  disableFlow(id: string): Promise<ApprovalFlow> {
    return request.post(`/approval/flows/${id}/disable`);
  },

  startApproval(submissionId: string): Promise<ApprovalInstance> {
    return request.post(`/approval/start/${submissionId}`);
  },

  getMyTasks(params?: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: ApprovalTask[]; total: number; page: number; pageSize: number }> {
    return request.get('/approval/tasks', { params });
  },

  getMyTaskHistory(): Promise<ApprovalTask[]> {
    return request.get('/approval/tasks/history');
  },

  getTask(id: string): Promise<ApprovalTask> {
    return request.get(`/approval/tasks/${id}`);
  },

  approveTask(id: string, data?: { comment?: string }): Promise<ApprovalTask> {
    return request.post(`/approval/tasks/${id}/approve`, data);
  },

  rejectTask(id: string, data?: { comment?: string }): Promise<ApprovalTask> {
    return request.post(`/approval/tasks/${id}/reject`, data);
  },

  getInstance(id: string): Promise<ApprovalInstance> {
    return request.get(`/approval/instances/${id}`);
  },
};
