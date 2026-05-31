import './yjs-server.js';
import './app-server.js';
import { docs, wss } from './yjs-server.js';
import { setDocsRef } from './api-server.js';

setDocsRef(docs, wss);
