<template>
  <a-config-provider :locale="zhCN" :theme="themeConfig">
    <router-view />
  </a-config-provider>
</template>

<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import type { ThemeConfig } from 'ant-design-vue/es/config-provider/context'

const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#2563eb',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    borderRadius: 4,
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f5f7fb',
    fontFamily: '"Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif',
    fontSize: 14,
    colorText: '#1f2937',
    colorTextSecondary: '#4b5563',
    colorTextTertiary: '#94a3b8',
    colorBorder: '#d7dde8',
    colorBorderSecondary: '#e8edf5',
    controlHeight: 34,
    paddingContentHorizontal: 20,
    paddingContentVertical: 16,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
  },
}
</script>
