import { Condition, ConditionGroup, ComparisonOperator, Rule } from '../types';

export interface EvaluationLog {
  ruleId: string;
  ruleName: string;
  conditionResult: boolean;
  conditionsEvaluated: string[];
  actionsExecuted: string[];
  executionTime: number;
}

function evaluateCondition(
  condition: Condition,
  formData: Record<string, unknown>
): { result: boolean; log: string } {
  const fieldValue = formData[condition.fieldId];
  const compareValue = condition.value;
  let result = false;

  switch (condition.operator) {
    case '>':
      result = Number(fieldValue) > Number(compareValue);
      break;
    case '<':
      result = Number(fieldValue) < Number(compareValue);
      break;
    case '==':
      result = String(fieldValue) === String(compareValue);
      break;
    case '!=':
      result = String(fieldValue) !== String(compareValue);
      break;
    case 'contains':
      result = String(fieldValue).includes(String(compareValue));
      break;
    default:
      result = false;
  }

  const log = `${condition.fieldId} ${condition.operator} ${compareValue} => ${result} (实际值: ${fieldValue})`;
  return { result, log };
}

export function evaluateConditions(
  conditions: ConditionGroup | Condition,
  formData: Record<string, unknown>,
  indent: number = 0
): { result: boolean; logs: string[] } {
  const logs: string[] = [];
  const padding = '  '.repeat(indent);

  if ('children' in conditions && Array.isArray(conditions.children)) {
    if (conditions.children.length === 0) {
      logs.push(`${padding}条件组 (${conditions.type}) 为空 => false`);
      return { result: false, logs };
    }

    logs.push(`${padding}条件组 (${conditions.type}):`);
    
    const results: boolean[] = [];
    const childLogs: string[] = [];

    conditions.children.forEach((child) => {
      if (child === null || child === undefined) {
        logs.push(`${padding}  null/undefined => false`);
        results.push(false);
        return;
      }

      const { result, logs: childResultLogs } = evaluateConditions(child, formData, indent + 1);
      results.push(result);
      childLogs.push(...childResultLogs);
    });

    logs.push(...childLogs);

    let finalResult: boolean;
    if (conditions.type === 'AND') {
      finalResult = results.every((r) => r === true);
    } else {
      finalResult = results.some((r) => r === true);
    }

    logs.push(`${padding}条件组 (${conditions.type}) 结果 => ${finalResult}`);
    return { result: finalResult, logs };
  } else if ('operator' in conditions) {
    const { result, log } = evaluateCondition(conditions, formData);
    logs.push(`${padding}${log}`);
    return { result, logs };
  }

  logs.push(`${padding}未知条件类型 => false`);
  return { result: false, logs };
}

export function evaluateRules(
  rules: Rule[],
  formData: Record<string, unknown>,
  debugMode: boolean = false
): {
  effects: Record<string, { hidden?: boolean; disabled?: boolean }>;
  logs: EvaluationLog[];
} {
  const effects: Record<string, { hidden?: boolean; disabled?: boolean }> = {};
  const logs: EvaluationLog[] = [];

  rules.forEach((rule) => {
    if (!rule.conditions || !rule.actions) {
      return;
    }

    const startTime = performance.now();
    
    try {
      const { result: conditionResult, logs: conditionLogs } = evaluateConditions(rule.conditions, formData);
      
      const executionTime = performance.now() - startTime;
      
      const actionsExecuted: string[] = [];
      
      if (conditionResult) {
        rule.actions.forEach((action) => {
          const targetId = action.targetFieldId;
          if (!effects[targetId]) {
            effects[targetId] = {};
          }

          switch (action.type) {
            case 'hide':
              effects[targetId].hidden = true;
              break;
            case 'show':
              effects[targetId].hidden = false;
              break;
            case 'disable':
              effects[targetId].disabled = true;
              break;
            case 'enable':
              effects[targetId].disabled = false;
              break;
          }
          
          actionsExecuted.push(`${action.type} ${targetId}`);
        });
      }

      if (debugMode) {
        logs.push({
          ruleId: rule.id,
          ruleName: rule.name,
          conditionResult,
          conditionsEvaluated: conditionLogs,
          actionsExecuted,
          executionTime: Math.round(executionTime * 100) / 100,
        });
      }

    } catch (error) {
      if (debugMode) {
        logs.push({
          ruleId: rule.id,
          ruleName: rule.name,
          conditionResult: false,
          conditionsEvaluated: [`执行错误: ${error instanceof Error ? error.message : String(error)}`],
          actionsExecuted: ['(执行失败)'],
          executionTime: Math.round((performance.now() - startTime) * 100) / 100,
        });
      }
    }
  });

  return { effects, logs };
}