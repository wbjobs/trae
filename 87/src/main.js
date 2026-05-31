import { WatershedAnalysisApp } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
  const app = new WatershedAnalysisApp();
  app.init();
  window.__watershedApp = app;
});
