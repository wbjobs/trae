import { create } from 'zustand';
import { FormComponent, Rule, ConditionGroup, RuleAction } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface FormState {
  components: FormComponent[];
  rules: Rule[];
  selectedComponentId: string | null;
  formName: string;
  addComponent: (type: 'input' | 'select' | 'date') => void;
  updateComponent: (id: string, updates: Partial<FormComponent>) => void;
  deleteComponent: (id: string) => void;
  selectComponent: (id: string | null) => void;
  updateFormName: (name: string) => void;
  addRule: (name: string, conditions: ConditionGroup, actions: RuleAction[]) => void;
  updateRule: (id: string, name: string, conditions: ConditionGroup, actions: RuleAction[]) => void;
  deleteRule: (id: string) => void;
  setComponents: (components: FormComponent[]) => void;
  setRules: (rules: Rule[]) => void;
  clearForm: () => void;
}

export const useFormStore = create<FormState>((set) => ({
  components: [],
  rules: [],
  selectedComponentId: null,
  formName: '',
  
  addComponent: (type) => {
    const newComponent: FormComponent = {
      id: uuidv4(),
      type,
      label: type === 'input' ? '文本输入' : type === 'select' ? '下拉选择' : '日期选择',
      placeholder: '',
      required: false,
      options: type === 'select' ? [{ value: '', label: '请选择' }] : undefined,
    };
    set((state) => ({ components: [...state.components, newComponent] }));
  },
  
  updateComponent: (id, updates) => {
    set((state) => ({
      components: state.components.map((comp) =>
        comp.id === id ? { ...comp, ...updates } : comp
      ),
    }));
  },
  
  deleteComponent: (id) => {
    set((state) => ({
      components: state.components.filter((comp) => comp.id !== id),
      selectedComponentId: state.selectedComponentId === id ? null : state.selectedComponentId,
    }));
  },
  
  selectComponent: (id) => set({ selectedComponentId: id }),
  
  updateFormName: (name) => set({ formName: name }),
  
  addRule: (name, conditions, actions) => {
    const newRule: Rule = {
      id: uuidv4(),
      formId: '',
      name,
      conditions,
      actions,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ rules: [...state.rules, newRule] }));
  },
  
  updateRule: (id, name, conditions, actions) => {
    set((state) => ({
      rules: state.rules.map((rule) =>
        rule.id === id ? { ...rule, name, conditions, actions } : rule
      ),
    }));
  },
  
  deleteRule: (id) => {
    set((state) => ({ rules: state.rules.filter((rule) => rule.id !== id) }));
  },
  
  setComponents: (components) => set({ components }),
  
  setRules: (rules) => set({ rules }),
  
  clearForm: () => set({ components: [], rules: [], selectedComponentId: null, formName: '' }),
}));