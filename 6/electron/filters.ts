import path from 'path';
import type { FileInfo, FilterConfig } from '../shared/types';

function matchGlobPattern(pattern: string, filePath: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filePath) || regex.test(path.basename(filePath));
}

function getExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext ? ext.slice(1) : '';
}

function isHidden(filePath: string): boolean {
  const basename = path.basename(filePath);
  return basename.startsWith('.') || basename.startsWith('~');
}

export function matchesFilter(file: FileInfo, config: FilterConfig): boolean {
  if (file.isDirectory) {
    return true;
  }

  if (config.excludeHidden && isHidden(file.path)) {
    return false;
  }

  if (config.minFileSize !== undefined && file.size < config.minFileSize) {
    return false;
  }

  if (config.maxFileSize !== undefined && file.size > config.maxFileSize) {
    return false;
  }

  if (config.modifiedAfter !== undefined && file.modifiedAt < config.modifiedAfter) {
    return false;
  }

  if (config.modifiedBefore !== undefined && file.modifiedAt > config.modifiedBefore) {
    return false;
  }

  if (config.includeExtensions.length > 0) {
    const ext = getExtension(file.path);
    if (!config.includeExtensions.map(e => e.toLowerCase()).includes(ext)) {
      return false;
    }
  }

  if (config.excludeExtensions.length > 0) {
    const ext = getExtension(file.path);
    if (config.excludeExtensions.map(e => e.toLowerCase()).includes(ext)) {
      return false;
    }
  }

  if (config.excludePatterns.length > 0) {
    for (const pattern of config.excludePatterns) {
      if (matchGlobPattern(pattern, file.path)) {
        return false;
      }
    }
  }

  if (config.includePatterns.length > 0) {
    let matched = false;
    for (const pattern of config.includePatterns) {
      if (matchGlobPattern(pattern, file.path)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      return false;
    }
  }

  return true;
}

export function filterFiles(files: FileInfo[], config: FilterConfig): FileInfo[] {
  return files.filter(file => matchesFilter(file, config));
}
