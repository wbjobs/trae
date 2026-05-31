import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { websocketService } from './services/websocket';
import './styles.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

websocketService.connect();

app.mount('#app');
