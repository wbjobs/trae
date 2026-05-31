export interface Tenant {
  id: string;
  slug: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'tenant_admin' | 'regular_user';
  status: 'active' | 'inactive';
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'date' | 'file' | 'number' | 'checkbox' | 'radio';
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  validation?: FormFieldValidation;
  linkage?: FormFieldLinkage;
  defaultValue?: any;
  width?: number;
}

export interface FormFieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  customRules?: string[];
}

export interface FormFieldLinkage {
  dependsOn: string;
  showWhen?: { value: any; operator: 'eq' | 'neq' | 'contains' };
  optionsMap?: Record<string, { label: string; value: string }[]>;
  defaultOptions?: { label: string; value: string }[];
}

export interface FormLayout {
  columns: number;
  spacing: number;
}

export interface Form {
  id: string;
  name: string;
  description?: string;
  tenantId: string;
  createdById: string;
  status: 'draft' | 'published' | 'archived';
  currentVersion: number;
  fields: FormField[];
  layout: FormLayout;
  createdAt: string;
  updatedAt: string;
}

export interface FormVersion {
  id: string;
  formId: string;
  version: number;
  fields: FormField[];
  layout: FormLayout;
  changeNote?: string;
  createdById: string;
  createdAt: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  submittedById: string;
  formVersion: number;
  data: Record<string, any>;
  status: 'draft' | 'submitted' | 'pending_approval' | 'approved' | 'rejected' | 'archived';
  approvalInstanceId?: string;
  submittedBy?: User;
  form?: Form;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalFlow {
  id: string;
  name: string;
  description?: string;
  formId: string;
  tenantId: string;
  createdById: string;
  status: 'draft' | 'active' | 'inactive';
  nodes: ApprovalNode[];
  form?: Form;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalNode {
  id: string;
  flowId: string;
  name: string;
  type: 'start' | 'approval' | 'condition' | 'parallel' | 'end';
  order: number;
  prevNodeId?: string;
  nextNodeId?: string;
  approvers?: ApproverConfig[];
  approvalType?: 'single' | 'or' | 'and';
  condition?: NodeCondition;
  description?: string;
}

export interface ApproverConfig {
  type: 'user' | 'role' | 'form_field';
  value: string;
}

export interface NodeCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: any;
}

export interface ApprovalInstance {
  id: string;
  flowId: string;
  submissionId: string;
  tenantId: string;
  currentNodeId?: string;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';
  context?: Record<string, any>;
  tasks: ApprovalTask[];
  submission?: FormSubmission;
  flow?: ApprovalFlow;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalTask {
  id: string;
  instanceId: string;
  nodeId: string;
  assigneeId: string;
  status: 'pending' | 'approved' | 'rejected' | 'transferred';
  comment?: string;
  completedAt?: string;
  instance?: ApprovalInstance;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: 'system' | 'approval' | 'form' | 'email';
  channel: 'in_app' | 'email';
  title: string;
  content?: string;
  data?: Record<string, any>;
  isRead: boolean;
  readAt?: string;
  isEmailSent: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'tenant_admin' | 'regular_user';
    tenantId: string;
    tenantName: string;
  };
}
