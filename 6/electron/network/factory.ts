import type { ConnectionConfig } from '../../shared/types';
import type { IFileClient } from './types';
import { LocalFileClient } from './local-client';
import { SftpFileClient } from './sftp-client';
import { WebDavFileClient } from './webdav-client';

export function createClient(config: ConnectionConfig): IFileClient {
  switch (config.type) {
    case 'local':
      return new LocalFileClient(config);
    case 'sftp':
      return new SftpFileClient(config);
    case 'webdav':
      return new WebDavFileClient(config);
    default:
      throw new Error(`Unsupported connection type: ${config.type}`);
  }
}
