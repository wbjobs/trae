import { NfcReadResult } from '@/types';

export const isWebNfcSupported = (): boolean => {
  return 'NDEFReader' in window;
};

export const readNfcCard = async (): Promise<NfcReadResult> => {
  if (!isWebNfcSupported()) {
    throw new Error('Web NFC is not supported in this browser. Please use Chrome or Edge.');
  }

  const ndef = new (window as any).NDEFReader();
  const abortController = new AbortController();

  try {
    await ndef.scan({ signal: abortController.signal });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('NFC scan cancelled');
    }
    throw new Error(`Failed to start NFC scan: ${error.message}`);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      abortController.abort();
      reject(new Error('NFC reading timeout. Please try again.'));
    }, 30000);

    ndef.onreading = (event: any) => {
      clearTimeout(timeout);
      abortController.abort();

      try {
        const serialNumber = event.serialNumber || event.message?.records?.[0]?.data;
        
        if (!serialNumber) {
          reject(new Error('Could not read card UID'));
          return;
        }

        const uid = Array.from(new Uint8Array(serialNumber))
          .map((b: number) => b.toString(16).padStart(2, '0'))
          .join(':')
          .toUpperCase();

        resolve({
          uid,
          sak: event.sak || '',
          atqa: event.atqa || '',
        });
      } catch (error) {
        reject(new Error('Failed to parse NFC card data'));
      }
    };

    ndef.onreadingerror = () => {
      clearTimeout(timeout);
      abortController.abort();
      reject(new Error('Failed to read NFC card. Please try again.'));
    };
  });
};

export const formatUid = (uid: string): string => {
  if (!uid) return '';
  return uid.toUpperCase().replace(/[^A-F0-9]/g, '').match(/.{2}/g)?.join(':') || uid;
};

export const validateUid = (uid: string): boolean => {
  const cleanUid = uid.replace(/[^A-Fa-f0-9]/g, '');
  return cleanUid.length === 8 || cleanUid.length === 14;
};

export const detectCardType = (uid: string, sak?: string): string => {
  if (sak === '08') return 'Mifare Classic 1K';
  if (sak === '18') return 'Mifare Classic 4K';
  if (sak === '00') return 'Mifare Ultralight';
  if (sak === '20') return 'Mifare DESFire';
  
  const uidLength = uid.replace(/[^A-Fa-f0-9]/g, '').length;
  if (uidLength === 8) return 'Mifare Classic 1K';
  if (uidLength === 14) return 'Mifare Classic 1K (7 byte UID)';
  
  return 'Unknown';
};
