<template>
  <div class="page-container">
    <div class="page-title mb-4">社群区域配置</div>

    <a-card>
      <a-spin :spinning="loading">
        <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 14 }">
          <a-divider orientation="left">基础设置</a-divider>

          <a-form-item label="最大社群数量">
            <a-input-number v-model:value="form.maxCirclesPerRegion" :min="1" style="width:100%" />
            <div class="text-secondary mt-1">每个区域允许存在的最大社群数量</div>
          </a-form-item>

          <a-form-item label="每人最多加入数">
            <a-input-number v-model:value="form.maxCirclesPerUser" :min="1" style="width:100%" />
            <div class="text-secondary mt-1">每个用户最多可加入的社群数量</div>
          </a-form-item>

          <a-form-item label="每人最多创建数">
            <a-input-number v-model:value="form.maxCirclesCreated" :min="0" style="width:100%" />
          </a-form-item>

          <a-form-item label="新社群需要审核">
            <a-switch v-model:checked="form.requireAudit" />
            <div class="text-secondary mt-1">开启后，用户新建的社群需要后台人工审核</div>
          </a-form-item>

          <a-form-item label="允许用户发布广场帖">
            <a-switch v-model:checked="form.allowPublicPost" />
          </a-form-item>

          <a-divider orientation="left">付费加入</a-divider>

          <a-form-item label="启用付费加入">
            <a-switch v-model:checked="form.enablePaidJoin" />
            <div class="text-secondary mt-1">开启后，社群可设置付费加入</div>
          </a-form-item>

          <a-form-item label="价格下限 (元)">
            <a-input-number v-model:value="form.priceMin" :min="0" :precision="2" style="width:100%" placeholder="最低价格" />
          </a-form-item>

          <a-form-item label="价格上限 (元)">
            <a-input-number v-model:value="form.priceMax" :min="0" :precision="2" style="width:100%" placeholder="最高价格" />
          </a-form-item>

          <a-form-item label="默认邀请码">
            <a-input v-model:value="form.inviteCode" placeholder="可选全局邀请码" style="width:100%" />
          </a-form-item>

          <a-form-item label="人数上限">
            <a-input-number v-model:value="form.memberLimit" :min="1" style="width:100%" placeholder="社群最大人数限制" />
          </a-form-item>

          <a-form-item label="默认截止天数">
            <a-input-number v-model:value="form.defaultDeadlineDays" :min="1" style="width:100%" placeholder="新建社群默认有效天数" />
          </a-form-item>

          <a-divider orientation="left">公告</a-divider>

          <a-form-item label="社群公告">
            <a-textarea v-model:value="form.notice" :rows="4" placeholder="展示在社群列表页顶部的全局公告" />
          </a-form-item>

          <a-form-item :wrapper-col="{ offset: 6, span: 14 }">
            <a-button type="primary" :loading="saving" @click="handleSave">保存配置</a-button>
          </a-form-item>
        </a-form>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { communityApi } from '@/api/community'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)

const form = reactive({
  maxCirclesPerRegion: 200,
  maxCirclesPerUser: 20,
  maxCirclesCreated: 3,
  requireAudit: false,
  allowPublicPost: true,
  enablePaidJoin: false,
  priceMin: undefined as number | undefined,
  priceMax: undefined as number | undefined,
  inviteCode: '',
  memberLimit: undefined as number | undefined,
  defaultDeadlineDays: undefined as number | undefined,
  notice: '',
})

const fetchConfig = async () => {
  loading.value = true
  try {
    const res = await communityApi.getRegionConfig(userStore.regionId)
    if (res.data && Object.keys(res.data).length > 0) {
      Object.assign(form, res.data)
    }
  } catch (err) { /* ignore */ }
  finally { loading.value = false }
}

const handleSave = async () => {
  saving.value = true
  try {
    await communityApi.updateRegionConfig(userStore.regionId, form)
    message.success('配置已保存')
  } finally {
    saving.value = false
  }
}

onMounted(() => fetchConfig())
</script>
