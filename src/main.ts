import './assets/main.css';
import 'lxgw-wenkai-webfont/lxgwwenkai-bold.css';

import { createApp } from 'vue';
import App from './App.vue';
import VueVirtualScroller from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

const app = createApp(App);

app.use(VueVirtualScroller);

app.mount('#app');
