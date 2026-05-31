import { Condition, ConditionGroup, ComparisonOperator, Rule, RuleAction } from '../types';
import { createDebugLog } from '../controllers/debugController';

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

export async function evaluateRules(
  rules: Rule[],
  formData: Record<string, unknown>,
  formId: string = '',
  debugMode: boolean = false
): Promise<Record<string, { hidden?: boolean; disabled?: boolean }>> {
  const effects: Record<string, { hidden?: boolean; disabled?: boolean }> = {};

  for (const rule of rules) {
    if (!rule.conditions || !rule.actions) {
      continue;
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
        try {
          await createDebugLog({
            formId,
            ruleId: rule.id,
            ruleName: rule.name,
            conditionResult,
            conditionsEvaluated: conditionLogs.join('\n'),
            actionsExecuted: actionsExecuted.join(', ') || '(无)',
            executionTime: Math.round(executionTime * 100) / 100,
            formData,
          });
        } catch (logError) {
          console.error('Failed to write debug log:', logError);
        }
      }

      console.log(`Rule [${rule.name}]: ${conditionResult ? '触发' : '未触发'}, 耗时: ${executionTime.toFixed(2)}ms`);
      console.log(`  条件评估:\n${conditionLogs.map(l => `    ${l}`).join('\n')}`);
      console.log(`  执行动作: ${actionsExecuted.length > 0 ? actionsExecuted.join(', ') : '无'}`);
      
    } catch (error) {
      console.error('Error evaluating rule:', rule.id, error);
      
      if (debugMode) {
        try {
          await createDebugLog({
            formId,
            ruleId: rule.id,
            ruleName: rule.name,
            conditionResult: false,
            conditionsEvaluated: `执行错误: ${error instanceof Error ? error.message : String(error)}`,
            actionsExecuted: '(执行失败)',
            executionTime: Math.round((performance.now() - startTime) * 100) / 100,
            formData,
          });
        } catch (logError) {
          console.error('Failed to write error debug log:', logError);
        }
      }
    }
  }

  return effects;
}