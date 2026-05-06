<template>
  <div class="page-container">
    <div class="page-title mb-4">收益配置</div>

    <a-card>
      <a-spin :spinning="loading">
        <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 14 }">
          <a-alert message="收益分成比例总和建议为 1（100%），实际分成 = 收益 × 对应比例" type="info" show-icon class="mb-4" />

          <a-form-item label="平台抽成比例">
            <a-input-number v-model:value="form.platformCommission" :min="0" :max="1" :step="0.01" :precision="4" style="width:100%" />
            <div class="text-secondary mt-1">平台抽取的收益比例（0-1，如 0.1 = 10%）</div>
          </a-form-item>

          <a-form-item label="区域抽成比例">
            <a-input-number v-model:value="form.regionCommission" :min="0" :max="1" :step="0.01" :precision="4" style="width:100%" />
            <div class="text-secondary mt-1">区域抽取的收益比例（0-1）</div>
          </a-form-item>

          <a-form-item label="作者分成比例">
            <a-input-number v-model:value="form.authorShare" :min="0" :max="1" :step="0.01" :precision="4" style="width:100%" />
            <div class="text-secondary mt-1">作者获得的分成比例（0-1，如 0.7 = 70%）</div>
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
import { netdiskApi } from '@/api/netdisk'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false), saving = ref(false)

const form = reactive({
  platformCommission: 0,
  regionCommission: 0,
  authorShare: 1,
})

async function fetchConfig() {
  loading.value = true
  try {
    const res = await netdiskApi.getProfitConfig(userStore.regionId)
    if (res.data) {
      const data = res.data as any
      form.platformCommission = Number(data.platformCommission) || 0
      form.regionCommission = Number(data.regionCommission) || 0
      form.authorShare = Number(data.authorShare) || 1
    }
  } catch { /* ignore */ }
  finally { loading.value = false }
}

async function handleSave() {
  saving.value = true
  try {
    await netdiskApi.updateProfitConfig(userStore.regionId, {
      platformCommission: form.platformCommission,
      regionCommission: form.regionCommission,
      authorShare: form.authorShare,
    })
    message.success('配置已保存')
  } catch { /* ignore */ }
  finally { saving.value = false }
}

onMounted(() => fetchConfig())
</script>
