<template>
  <div class="glass-card">
    <div class="card-header">
      <div>
        <div class="card-title">{{ title }}</div>
        <div class="muted" style="margin-top:5px">共 {{ total.toLocaleString() }} 条数据</div>
      </div>
      <div class="btn-row">
        <el-button size="small" :icon="Setting">列设置</el-button>
        <el-button size="small" :icon="Filter">筛选</el-button>
      </div>
    </div>
    <div class="card-body" style="padding-top:0; overflow:auto;">
      <table class="soft-table">
        <thead><tr><th style="width:36px"><el-checkbox /></th><th v-for="c in columns" :key="c.prop" :style="{minWidth: c.minWidth ? c.minWidth + 'px' : undefined}">{{ c.label }}</th><th style="min-width:130px">操作</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id || row.orderNo || row.flowNo">
            <td><el-checkbox /></td>
            <td v-for="c in columns" :key="c.prop"><FieldRender :value="row[c.prop]" :type="c.type" /></td>
            <td><el-button link type="primary" @click="$emit('detail', row)">详情</el-button><el-button link type="primary">编辑</el-button><el-button link type="danger">处理</el-button></td>
          </tr>
        </tbody>
      </table>
      <div style="display:flex; justify-content:flex-end; padding-top:16px;">
        <el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="total" :page-size="10" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { Setting, Filter } from '@element-plus/icons-vue'
import FieldRender from './FieldRender.vue'
import type { TableColumn } from '@/types/admin'
defineProps<{ title:string; columns: TableColumn[]; rows:any[]; total:number }>()
defineEmits<{ detail:[any] }>()
</script>
