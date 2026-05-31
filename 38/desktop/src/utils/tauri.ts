import { invoke } from '@tauri-apps/api/core';
import { NfcReader } from '@/types';

export const listNfcReaders = async (): Promise<NfcReader[]> => {
  try {
    const readers = await invoke<string[]>('list_nfc_readers');
    return readers.map(name => ({ name, status: 'connected' }));
  } catch (error) {
    console.error('Failed to list NFC readers:', error);
    return [];
  }
};

export const connectNfcReader = async (readerName: string): Promise<boolean> => {
  try {
    await invoke('connect_nfc_reader', { readerName });
    return true;
  } catch (error) {
    console.error('Failed to connect NFC reader:', error);
    return false;
  }
};

export const authenticateMifare = async (
  block: number,
  keyType: 'A' | 'B',
  key: string,
  uid: string
): Promise<boolean> => {
  try {
    return await invoke('authenticate_mifare', { block, keyType, key, uid });
  } catch (error) {
    console.error('Mifare authentication failed:', error);
    return false;
  }
};

export const writeCardToPn532 = async (
  uid: string,
  keyA: string,
  keyB: string
): Promise<boolean> => {
  try {
    return await invoke('write_card_to_pn532', { uid, keyA, keyB });
  } catch (error) {
    console.error('Failed to write card to PN532:', error);
    return false;
  }
};

export const getAppConfig = async (): Promise<{ serverAddress: string }> => {
  try {
    return await invoke('get_app_config');
  } catch (error) {
    console.error('Failed to get app config:', error);
    return { serverAddress: 'http://localhost:50051' };
  }
};

export const saveAppConfig = async (config: { serverAddress: string }): Promise<boolean> => {
  try {
    await invoke('save_app_config', { config });
    return true;
  } catch (error) {
    console.error('Failed to save app config:', error);
    return false;
  }
};
