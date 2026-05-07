<template>
  <el-drawer v-model="visible" :title="title" size="560px" class="glass-drawer">
    <template v-if="row">
      <div class="user-line" style="margin-bottom:18px">
        <div class="avatar">{{ title.slice(0,1) }}</div>
        <div><div class="name-main">{{ displayName }}</div><div class="name-sub">{{ row.id || row.orderNo || row.flowNo || '业务详情' }}</div></div>
      </div>
      <el-tabs>
        <el-tab-pane v-for="tab in tabs" :key="tab" :label="tab">
          <div class="glass-card" style="box-shadow:none; margin-bottom:14px"><div class="card-body">
            <el-descriptions :column="1" border>
              <el-descriptions-item v-for="(v,k) in flatRow" :key="k" :label="String(k)">{{ stringify(v) }}</el-descriptions-item>
            </el-descriptions>
          </div></div>
        </el-tab-pane>
      </el-tabs>
    </template>
    <template #footer>
      <el-button @click="visible=false">关闭</el-button>
      <el-button type="primary">保存处理结果</el-button>
    </template>
  </el-drawer>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
const visible = ref(false)
const row = ref<any>(null)
const tabs = ref<string[]>([])
const title = ref('详情')
defineExpose({ open })
function open(payload:any, options?:{ title?:string; tabs?:string[] }){ row.value = payload; tabs.value = options?.tabs || ['基础信息','操作记录']; title.value = options?.title || '详情'; visible.value = true }
const displayName = computed(()=> row.value?.user?.name || row.value?.merchant?.name || row.value?.name?.name || row.value?.content?.name || row.value?.activity?.name || '详情信息')
const flatRow = computed(()=> Object.fromEntries(Object.entries(row.value || {}).slice(0,12)))
function stringify(v:any){ if(typeof v==='object' && v) return v.name || JSON.stringify(v); return v }
</script>
