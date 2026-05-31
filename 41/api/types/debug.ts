export interface DebugLog {
  id: string;
  formId: string;
  ruleId: string;
  ruleName: string;
  conditionResult: boolean;
  conditionsEvaluated: string;
  actionsExecuted: string;
  executionTime: number;
  timestamp: string;
  formData: Record<string, unknown>;
}