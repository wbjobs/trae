import { invoke } from '@tauri-apps/api/core';
import type {
  PasswordEntry,
  PasswordListItem,
  AddPasswordRequest,
  UpdatePasswordRequest,
  PasswordStrengthResponse,
  PasswordAnalysis,
  ServerStatus,
  ServerConfig,
  EmergencyConfig,
  SetupEmergencyRequest,
  RecoveryRequest,
  RecoveryStatus,
} from '../types';

export async function initializeVault(masterPassword: string, dbPath?: string): Promise<{ success: boolean; salt: string; message: string }> {
  return invoke('initialize_vault', {
    request: { masterPassword: masterPassword, dbPath },
  });
}

export async function unlockVault(masterPassword: string, dbPath?: string): Promise<{ success: boolean; message: string }> {
  return invoke('unlock_vault', {
    request: { masterPassword: masterPassword, dbPath },
  });
}

export async function lockVault(): Promise<void> {
  return invoke('lock_vault');
}

export async function addPassword(request: AddPasswordRequest): Promise<PasswordEntry> {
  return invoke('add_password', { request });
}

export async function getPassword(id: string): Promise<PasswordEntry> {
  return invoke('get_password', { id });
}

export async function updatePassword(request: UpdatePasswordRequest): Promise<PasswordEntry> {
  return invoke('update_password', { request });
}

export async function deletePassword(id: string): Promise<void> {
  return invoke('delete_password', { id });
}

export async function listPasswords(): Promise<PasswordListItem[]> {
  return invoke('list_passwords');
}

export async function searchPasswords(query: string): Promise<PasswordListItem[]> {
  return invoke('search_passwords', { query });
}

export async function generatePassword(length?: number, includeSymbols?: boolean): Promise<string> {
  return invoke('generate_password', {
    request: { length, includeSymbols },
  });
}

export async function checkPasswordStrength(password: string): Promise<PasswordStrengthResponse> {
  return invoke('check_password_strength', { password });
}

export async function analyzePasswords(): Promise<PasswordAnalysis> {
  return invoke('analyze_passwords');
}

export async function startServer(config?: ServerConfig): Promise<ServerStatus> {
  return invoke('start_server', { config: config || {} });
}

export async function stopServer(): Promise<void> {
  return invoke('stop_server');
}

export async function getServerStatus(): Promise<ServerStatus> {
  return invoke('get_server_status');
}

export async function setupEmergencyContacts(request: SetupEmergencyRequest): Promise<EmergencyConfig> {
  return invoke('setup_emergency_contacts', { request });
}

export async function getEmergencyConfig(): Promise<EmergencyConfig | null> {
  return invoke('get_emergency_config');
}

export async function disableEmergencyContacts(): Promise<void> {
  return invoke('disable_emergency_contacts');
}

export async function requestRecovery(contactId: string, verificationCode: string): Promise<RecoveryRequest> {
  return invoke('request_recovery', {
    request: { contactId, verificationCode },
  });
}

export async function getRecoveryRequests(): Promise<RecoveryRequest[]> {
  return invoke('get_recovery_requests');
}

export async function approveRecoveryRequest(requestId: string): Promise<void> {
  return invoke('approve_recovery_request', { requestId });
}

export async function getRecoveryStatus(): Promise<RecoveryStatus> {
  return invoke('get_recovery_status');
}

export async function recoverVault(shares: string[]): Promise<string> {
  return invoke('recover_vault', {
    request: { shares },
  });
}

export async function clearRecoveryRequests(): Promise<void> {
  return invoke('clear_recovery_requests');
}
