<template>
  <a-card title="首页配置" :bordered="false">
    <a-form :label-col="{ span: 4 }" :wrapper-col="{ span: 14 }">
      <a-form-item label="显示轮播图">
        <a-switch v-model:checked="form.showBanner" />
        <span class="form-hint">控制首页是否展示轮播图</span>
      </a-form-item>
      <a-form-item label="显示公告栏">
        <a-switch v-model:checked="form.showAnnouncement" />
        <span class="form-hint">控制首页是否展示公告栏</span>
      </a-form-item>
      <a-form-item label="显示导航区">
        <a-switch v-model:checked="form.showNav" />
        <span class="form-hint">控制首页是否展示功能导航</span>
      </a-form-item>
      <a-form-item label="显示热门帖子">
        <a-switch v-model:checked="form.showHotPosts" />
        <span class="form-hint">控制首页是否展示热门帖子模块</span>
      </a-form-item>
      <a-form-item label="显示推荐内容">
        <a-switch v-model:checked="form.showRecommend" />
        <span class="form-hint">控制首页是否展示推荐内容模块</span>
      </a-form-item>
      <a-form-item label="默认城市">
        <a-input v-model:value="form.defaultCity" placeholder="请输入默认城市，如：北京" style="width: 240px" />
      </a-form-item>
      <a-form-item label="首页主题">
        <a-select v-model:value="form.homeTheme" placeholder="请选择首页主题" style="width: 240px">
          <a-select-option value="default">默认</a-select-option>
          <a-select-option value="fresh">清新</a-select-option>
          <a-select-option value="warm">温暖</a-select-option>
          <a-select-option value="dark">深色</a-select-option>
          <a-select-option value="festival">节日</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item :wrapper-col="{ offset: 4, span: 14 }">
        <a-space>
          <a-button type="primary" :loading="saving" @click="onSave">保存配置</a-button>
          <a-popconfirm title="确定重置为默认值？" ok-text="确定" cancel-text="取消" @confirm="onReset">
            <a-button :loading="resetting">恢复默认</a-button>
          </a-popconfirm>
        </a-space>
      </a-form-item>
    </a-form>
  </a-card>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { configApi } from '@/api/config'

const form = reactive({
  showBanner: true,
  showAnnouncement: true,
  showNav: true,
  showHotPosts: true,
  showRecommend: true,
  defaultCity: '',
  homeTheme: 'default',
})

const saving = ref(false)
const resetting = ref(false)

onMounted(async () => {
  try {
    const res = await configApi.getByGroup('home')
    const items = (res.data?.data || res.data || []) as { key: string; value: string }[]
    items.forEach((item) => {
      if (item.key in form) {
        const target = form as Record<string, unknown>
        if (typeof target[item.key] === 'boolean') {
          target[item.key] = item.value === 'true' || item.value === '1'
        } else {
          target[item.key] = item.value
        }
      }
    })
  } catch {
    /* loaded defaults */
  }
})

async function onSave() {
  saving.value = true
  try {
    const configs = Object.entries(form).map(([key, value]) => {
      const val = typeof value === 'boolean' ? String(value) : String(value)
      return { key, value: val }
    })
    await configApi.save(configs)
    message.success('保存成功')
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function onReset() {
  resetting.value = true
  try {
    await configApi.reset('home')
    const res = await configApi.getByGroup('home')
    const items = (res.data?.data || res.data || []) as { key: string; value: string }[]
    items.forEach((item) => {
      if (item.key in form) {
        const target = form as Record<string, unknown>
        if (typeof target[item.key] === 'boolean') {
          target[item.key] = item.value === 'true' || item.value === '1'
        } else {
          target[item.key] = item.value
        }
      }
    })
    message.success('已重置为默认值')
  } catch {
    message.error('重置失败')
  } finally {
    resetting.value = false
  }
}
</script>

<style lang="less" scoped>
.form-hint {
  margin-left: 12px;
  font-size: 13px;
  color: #9ca3af;
}
</style>
