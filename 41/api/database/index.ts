import Datastore from 'nedb';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data');

if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

export const formsDB = new Datastore({
  filename: path.join(dbPath, 'forms.db'),
  autoload: true,
});

export const rulesDB = new Datastore({
  filename: path.join(dbPath, 'rules.db'),
  autoload: true,
});

export const submissionsDB = new Datastore({
  filename: path.join(dbPath, 'submissions.db'),
  autoload: true,
});

export const debugLogsDB = new Datastore({
  filename: path.join(dbPath, 'debugLogs.db'),
  autoload: true,
});

formsDB.ensureIndex({ fieldName: 'id', unique: true });
rulesDB.ensureIndex({ fieldName: 'id', unique: true });
rulesDB.ensureIndex({ fieldName: 'formId' });
submissionsDB.ensureIndex({ fieldName: 'id', unique: true });
submissionsDB.ensureIndex({ fieldName: 'formId' });
debugLogsDB.ensureIndex({ fieldName: 'id', unique: true });
debugLogsDB.ensureIndex({ fieldName: 'formId' });
debugLogsDB.ensureIndex({ fieldName: 'ruleId' });