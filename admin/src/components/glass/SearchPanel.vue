<template>
  <div class="glass-card search-panel">
    <div class="card-body">
      <el-form :model="model" label-position="top">
        <div :class="['form-grid', collapsed && canCollapse ? 'collapsed-grid' : '']">
          <el-form-item v-for="(field, idx) in fields" :key="field.key" v-show="!collapsed || !canCollapse || idx < 3" :label="field.label">
            <el-input v-if="field.type === 'input'" v-model="model[field.key]" :placeholder="field.placeholder || '请输入' + field.label" clearable />
            <el-select v-else-if="field.type === 'select'" v-model="model[field.key]" :placeholder="field.placeholder || '请选择'" clearable style="width:100%">
              <el-option v-for="op in field.options || []" :key="op.value" :label="op.label" :value="op.value" />
            </el-select>
            <el-date-picker v-else-if="field.type === 'daterange'" v-model="model[field.key]" type="daterange" range-separator="~" start-placeholder="开始日期" end-placeholder="结束日期" style="width:100%" />
            <el-date-picker v-else v-model="model[field.key]" type="date" placeholder="选择日期" style="width:100%" />
          </el-form-item>
        </div>
        <div class="form-actions">
          <el-button v-if="canCollapse" link type="primary" class="collapse-toggle" @click="collapsed = !collapsed">
            {{ collapsed ? '展开筛选' : '收起' }} <el-icon><ArrowDown v-if="collapsed" /><ArrowUp v-else /></el-icon>
          </el-button>
          <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
          <el-button type="primary" :icon="Search" @click="$emit('search', model)">查询</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { RefreshLeft, Search, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import type { SearchField } from '@/types/admin'
const props = defineProps<{ fields: SearchField[] }>()
defineEmits<{ search:[Record<string, any>] }>()
const model = reactive<Record<string, any>>({})
props.fields.forEach(f => model[f.key] = '')
const canCollapse = computed(() => props.fields.length > 4)
const collapsed = ref(true)
function reset(){ Object.keys(model).forEach(k => model[k] = '') }
</script>
<style scoped>
.search-panel {
  box-shadow: none;
}

.search-panel :deep(.card-body) {
  padding: 18px 20px;
}

.search-panel :deep(.el-form-item) {
  margin-bottom: 0;
}

.collapsed-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.collapse-toggle {
  font-weight: 800;
}

@media (max-width: 780px) {
  .collapsed-grid {
    grid-template-columns: 1fr;
  }
}
</style>
