<template>
  <div class="page-shell">
    <GlassPageHeader title="系统设置" subtitle="管理平台配置、权限角色、消息通知、安全策略、存储上传和第三方配置" />
    <div class="settings-layout">
      <div class="glass-card settings-sidebar">
        <div class="card-body side-tabs">
          <button v-for="t in tabs" :key="t.key" :class="{ active: t.key === active }" @click="active = t.key">
            <el-icon><component :is="t.icon" /></el-icon>
            {{ t.label }}
          </button>
        </div>
      </div>
      <div class="settings-main">
        <component :is="currentPanel" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef } from 'vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import { Setting, Lock, Bell, Warning, Upload, Connection, PictureFilled } from '@element-plus/icons-vue'
import BasicSettingsPanel from './components/BasicSettingsPanel.vue'
import PermissionSettingsPanel from './components/PermissionSettingsPanel.vue'
import NotificationSettingsPanel from './components/NotificationSettingsPanel.vue'
import SecuritySettingsPanel from './components/SecuritySettingsPanel.vue'
import StorageUploadPanel from './components/StorageUploadPanel.vue'
import ThirdPartySettingsPanel from './components/ThirdPartySettingsPanel.vue'
import LoginPageVisualPanel from './components/LoginPageVisualPanel.vue'

const tabs = [
  { key: 'basic', label: '基础设置', icon: Setting },
  { key: 'permission', label: '权限角色', icon: Lock },
  { key: 'notification', label: '消息通知', icon: Bell },
  { key: 'security', label: '安全策略', icon: Warning },
  { key: 'storage', label: '存储上传', icon: Upload },
  { key: 'loginPage', label: '登录页视觉', icon: PictureFilled },
  { key: 'thirdParty', label: '第三方配置', icon: Connection }
]

const active = ref('basic')

const panelMap: Record<string, any> = {
  basic: BasicSettingsPanel,
  permission: PermissionSettingsPanel,
  notification: NotificationSettingsPanel,
  security: SecuritySettingsPanel,
  storage: StorageUploadPanel,
  thirdParty: ThirdPartySettingsPanel,
  loginPage: LoginPageVisualPanel
}

const currentPanel = computed(() => panelMap[active.value] || BasicSettingsPanel)
</script>

<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.settings-sidebar {
  position: sticky;
  top: 92px;
}
.settings-main {
  min-width: 0;
}
.side-tabs {
  display: grid;
  gap: 6px;
}
.side-tabs button {
  height: 44px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  text-align: left;
  padding: 0 14px;
  font-weight: 900;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: 0.15s ease;
}
.side-tabs button:hover {
  background: rgba(239, 246, 255, 0.6);
}
.side-tabs button.active {
  background: #eff6ff;
  color: #1f6fff;
}
@media (max-width: 1050px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }
  .settings-sidebar {
    position: static;
  }
  .side-tabs {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 600px) {
  .side-tabs {
    grid-template-columns: 1fr;
  }
}
</style>
