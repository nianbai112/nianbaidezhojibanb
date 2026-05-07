<template>
  <div class="glass-card">
    <div class="card-body">
      <el-form :model="model" label-position="top">
        <div class="form-grid">
          <el-form-item v-for="field in fields" :key="field.key" :label="field.label">
            <el-input v-if="field.type === 'input'" v-model="model[field.key]" :placeholder="field.placeholder || '请输入' + field.label" clearable />
            <el-select v-else-if="field.type === 'select'" v-model="model[field.key]" :placeholder="field.placeholder || '请选择'" clearable style="width:100%">
              <el-option v-for="op in field.options || []" :key="op.value" :label="op.label" :value="op.value" />
            </el-select>
            <el-date-picker v-else-if="field.type === 'daterange'" v-model="model[field.key]" type="daterange" range-separator="~" start-placeholder="开始日期" end-placeholder="结束日期" style="width:100%" />
            <el-date-picker v-else v-model="model[field.key]" type="date" placeholder="选择日期" style="width:100%" />
          </el-form-item>
        </div>
        <div class="form-actions">
          <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
          <el-button type="primary" :icon="Search" @click="$emit('search', model)">查询</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>
<script setup lang="ts">
import { reactive } from 'vue'
import { RefreshLeft, Search } from '@element-plus/icons-vue'
import type { SearchField } from '@/types/admin'
const props = defineProps<{ fields: SearchField[] }>()
defineEmits<{ search:[Record<string, any>] }>()
const model = reactive<Record<string, any>>({})
props.fields.forEach(f => model[f.key] = '')
function reset(){ Object.keys(model).forEach(k => model[k] = '') }
</script>
