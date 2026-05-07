<template>
  <div class="page-shell">
    <GlassPageHeader :title="config.title" :subtitle="config.subtitle">
      <template #actions><el-button :icon="Calendar">2025-05-19</el-button><el-button :icon="Refresh">刷新</el-button></template>
    </GlassPageHeader>
    <StatGrid :items="config.stats" />
    <div class="page-two-col">
      <div class="page-shell">
        <SearchPanel :fields="config.search" @search="onSearch" />
        <div class="action-bar">
          <div class="btn-row">
            <el-button v-for="(a,idx) in config.actions" :key="a" :type="idx===0 ? 'primary' : idx > 1 ? 'warning' : 'default'" :icon="idx===0 ? Plus : idx===1 ? Download : Operation">{{ a }}</el-button>
          </div>
          <div class="muted">{{ loading ? '正在连接真实接口...' : error || ('接口：' + (config.endpoint || '待配置')) }}</div>
        </div>
        <DataTableCard v-loading="loading" :title="config.title.replace('管理','列表')" :columns="config.columns" :rows="rows" :total="total" @detail="openDetail" />
      </div>
      <SidePanels :chart-title="config.chartTitle" :side-title="config.sideTitle" :metrics="config.sideMetrics" />
    </div>
    <DetailDrawer ref="drawer" />
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Calendar, Refresh, Plus, Download, Operation } from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import SearchPanel from '@/components/glass/SearchPanel.vue'
import DataTableCard from '@/components/glass/DataTableCard.vue'
import SidePanels from '@/components/glass/SidePanels.vue'
import DetailDrawer from '@/components/glass/DetailDrawer.vue'
import { moduleConfigs } from '@/data/moduleConfigs'
import { fetchModulePage } from '@/api/admin'
const props = defineProps<{ moduleKey:string }>()
const config = computed(() => moduleConfigs[props.moduleKey])
const rows = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const drawer = ref<InstanceType<typeof DetailDrawer>>()
async function load(params: Record<string, any> = {}) {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchModulePage(props.moduleKey, params)
    rows.value = data.rows
    total.value = data.total
  } catch (e: any) {
    rows.value = []
    total.value = 0
    error.value = e?.message || '接口连接失败'
  } finally {
    loading.value = false
  }
}
function onSearch(params: Record<string, any>){ load(params) }
function openDetail(row:any){ drawer.value?.open(row, { title: config.value.title + '详情', tabs: config.value.detailTabs }) }
onMounted(() => load())
</script>
