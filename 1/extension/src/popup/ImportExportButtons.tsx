import React, { useRef } from 'react';
import { ExtensionSettings, Rule, ExportData } from '../types';
import { ApiClient } from '../utils/api';
import { getRules, setRules } from '../utils/storage';

interface Props {
  settings: ExtensionSettings;
  groups: { id: string; name: string; isActive: boolean }[];
  activeGroupId: string;
  onImportComplete: (rules: Rule[]) => void;
  onSync: () => void;
}

const ImportExportButtons: React.FC<Props> = ({
  settings,
  groups,
  activeGroupId,
  onImportComplete,
  onSync,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const api = new ApiClient(settings);

  const handleExport = async () => {
    try {
      const data = await api.exportRules(activeGroupId);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rules_${data.group?.name || 'export'}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export rules');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data: ExportData = JSON.parse(text);

      let rulesToImport: Omit<Rule, 'id' | 'groupId' | 'createdAt' | 'updatedAt'>[];

      if (data.rules && Array.isArray(data.rules)) {
        rulesToImport = data.rules.map(rule => ({
          name: rule.name,
          urlPattern: rule.urlPattern,
          methods: rule.methods,
          headerConditions: rule.headerConditions,
          actionType: rule.actionType,
          forwardUrl: rule.forwardUrl,
          mockStatusCode: rule.mockStatusCode,
          mockHeaders: rule.mockHeaders,
          mockBody: rule.mockBody,
          requestHeaders: rule.requestHeaders,
          responseHeaders: rule.responseHeaders,
          enabled: rule.enabled,
          priority: rule.priority,
        }));
      } else if (Array.isArray(data)) {
        rulesToImport = data.map((rule: Rule) => ({
          name: rule.name,
          urlPattern: rule.urlPattern,
          methods: rule.methods,
          headerConditions: rule.headerConditions,
          actionType: rule.actionType,
          forwardUrl: rule.forwardUrl,
          mockStatusCode: rule.mockStatusCode,
          mockHeaders: rule.mockHeaders,
          mockBody: rule.mockBody,
          requestHeaders: rule.requestHeaders,
          responseHeaders: rule.responseHeaders,
          enabled: rule.enabled,
          priority: rule.priority,
        }));
      } else {
        alert('Invalid file format');
        return;
      }

      if (rulesToImport.length === 0) {
        alert('No rules found in file');
        return;
      }

      const confirmImport = confirm(
        `Import ${rulesToImport.length} rule(s) to active group?\n\n` +
        `Group: ${groups.find(g => g.id === activeGroupId)?.name}`
      );

      if (!confirmImport) return;

      const result = await api.importRules(rulesToImport, activeGroupId);
      alert(`Successfully imported ${result.imported} rule(s)`);

      const updatedRules = await api.getRules();
      await setRules(updatedRules);
      await chrome.runtime.sendMessage({ type: 'UPDATE_RULES', rules: updatedRules });
      onImportComplete(updatedRules);
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import rules');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex gap-8 mb-12">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => fileInputRef.current?.click()}
      >
        Import
      </button>
      <button
        className="btn btn-secondary btn-sm"
        onClick={handleExport}
      >
        Export
      </button>
    </div>
  );
};

export default ImportExportButtons;
