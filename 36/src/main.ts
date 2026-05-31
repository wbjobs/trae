import { App } from './App';
import './style.css';

async function main() {
  const app = new App();
  await app.init();
}

main().catch(console.error);
