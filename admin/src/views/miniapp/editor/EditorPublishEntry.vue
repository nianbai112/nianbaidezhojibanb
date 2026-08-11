<template>
  <div class="pe">
    <div class="pe-bar glass-card">
      <el-select v-model="regionId" placeholder="选择区域" style="width: 200px" filterable @change="load">
        <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
      </el-select>
      <span class="pe-hint">发布弹窗（+ 号）的展示文案与插画，按区域保存</span>
      <el-button type="primary" :icon="Check" :loading="saving" :disabled="!regionId" @click="save">保存</el-button>
    </div>
    <div v-loading="loading" class="pe-body">
      <RegionPublishEntryEditor v-if="regionId" v-model="publishMenu" />
      <el-empty v-else description="先选择区域" :image-size="90" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import RegionPublishEntryEditor from '@/views/region/components/RegionPublishEntryEditor.vue'

const regions = ref<any[]>([])
const regionId = ref('')
const publishMenu = ref<any>(null)
const settings = ref<any>({})
const loading = ref(false)
const saving = ref(false)

async function load() {
  if (!regionId.value) return
  loading.value = true
  try {
    const res: any = await request.get(`/admin/regions/${regionId.value}`)
    const data = res?.data || res
    settings.value = data?.settings || {}
    publishMenu.value = settings.value?.publishMenu || null
  } catch {
    ElMessage.error('加载发布入口配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await request.put(`/admin/regions/${regionId.value}`, {
      settings: { ...settings.value, publishMenu: publishMenu.value },
    })
    ElMessage.success('发布入口已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const res: any = await request.get('/admin/regions')
    regions.value = res.data?.list || res.list || []
    if (regions.value.length) {
      regionId.value = regions.value[0].id || regions.value[0].region_id
      await load()
    }
  } catch {
    ElMessage.error('加载区域列表失败')
  }
})
</script>

<style scoped lang="scss">
.pe { display: grid; gap: 14px; }
.pe-bar {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 18px;
  position: sticky; top: 0; z-index: 10;
}
.pe-hint { flex: 1; color: var(--mx-muted); font-size: 12.5px; }
.pe-body { min-height: 300px; }
</style>
