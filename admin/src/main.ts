import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import Antd from 'ant-design-vue'
import App from './App.vue'
import router from './router'
import { setupDirectives } from './directives'

// 样式
import 'ant-design-vue/dist/reset.css'
import './styles/global.less'
import './styles/variables.less'

const app = createApp(App)

// Pinia
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

// Router
app.use(router)

// Ant Design Vue
app.use(Antd)

// 自定义指令
setupDirectives(app)

app.mount('#app')
