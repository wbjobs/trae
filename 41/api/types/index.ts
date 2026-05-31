export type ComponentType = 'input' | 'select' | 'date';

export interface FormComponent {
  id: string;
  type: ComponentType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: { value: string; label: string }[];
  hidden?: boolean;
  disabled?: boolean;
}

export interface Form {
  id: string;
  name: string;
  config: FormComponent[];
  createdAt: string;
  updatedAt: string;
}

export type LogicalOperator = 'AND' | 'OR';
export type ComparisonOperator = '>' | '<' | '==' | '!=' | 'contains';

export interface Condition {
  fieldId: string;
  operator: ComparisonOperator;
  value: string | number | boolean;
}

export interface ConditionGroup {
  type: LogicalOperator;
  children: (Condition | ConditionGroup)[];
}

export type ActionType = 'hide' | 'show' | 'disable' | 'enable';

export interface RuleAction {
  type: ActionType;
  targetFieldId: string;
}

export interface Rule {
  id: string;
  formId: string;
  name: string;
  conditions: ConditionGroup;
  actions: RuleAction[];
  createdAt: string;
}

export interface Submission {
  id: string;
  formId: string;
  data: Record<string, unknown>;
  submittedAt: string;
}