<template>
  <div class="glass-card data-table-card">
    <div class="card-header">
      <div>
        <div class="card-title">{{ title }}</div>
        <div class="table-meta">共 {{ total.toLocaleString() }} 条数据，列表内容来自真实接口</div>
      </div>
      <div class="btn-row">
        <el-button size="small" :icon="Setting">列设置</el-button>
        <el-button size="small" :icon="Filter">筛选</el-button>
      </div>
    </div>
    <div class="card-body table-body">
      <div class="table-scroll">
        <table class="soft-table">
          <thead>
            <tr>
              <th style="width:40px"><el-checkbox :model-value="allChecked" :indeterminate="someChecked" @change="toggleAll" /></th>
              <th v-for="c in columns" :key="c.prop" :style="{minWidth: c.minWidth ? c.minWidth + 'px' : undefined}">{{ c.label }}</th>
              <th class="action-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id || row.orderNo || row.flowNo">
              <td><el-checkbox :model-value="isSelected(row)" @change="toggleRow(row)" /></td>
              <td v-for="c in columns" :key="c.prop"><FieldRender :value="row[c.prop]" :type="c.type" /></td>
              <td class="action-col">
                <div class="action-cell">
                  <el-button link type="primary" size="small" @click="$emit('detail', row)">详情</el-button>
                  <el-button link type="primary" size="small" @click="$emit('edit', row)">编辑</el-button>
                  <el-dropdown trigger="click" @command="cmd => $emit('rowAction', cmd, row)">
                    <el-button link type="primary" size="small">更多</el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="approve">通过</el-dropdown-item>
                        <el-dropdown-item command="reject">驳回</el-dropdown-item>
                        <el-dropdown-item command="enable">启用</el-dropdown-item>
                        <el-dropdown-item command="disable">禁用</el-dropdown-item>
                        <el-dropdown-item command="complete">完成</el-dropdown-item>
                        <el-dropdown-item command="assign">派单</el-dropdown-item>
                        <el-dropdown-item command="resetPassword">重置密码</el-dropdown-item>
                        <el-dropdown-item command="cancel">取消</el-dropdown-item>
                        <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="columns.length + 2" class="empty-cell">
                <el-empty description="暂无真实数据" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination-bar">
        <el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="total" :page-size="10" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Setting, Filter } from '@element-plus/icons-vue'
import FieldRender from './FieldRender.vue'
import type { TableColumn } from '@/types/admin'
const props = defineProps<{ title:string; columns: TableColumn[]; rows:any[]; total:number }>()
const emit = defineEmits<{ detail:[any]; edit:[any]; rowAction:[string, any]; selectionChange:[any[]] }>()
const selectedKeys = ref<Set<string>>(new Set())
const keyOf = (row: any) => String(row.id || row.orderNo || row.flowNo || row.__raw?.id || JSON.stringify(row))
const allChecked = computed(() => props.rows.length > 0 && props.rows.every(row => selectedKeys.value.has(keyOf(row))))
const someChecked = computed(() => props.rows.some(row => selectedKeys.value.has(keyOf(row))) && !allChecked.value)
function selectedRows() { return props.rows.filter(row => selectedKeys.value.has(keyOf(row))) }
function publish() { emit('selectionChange', selectedRows()) }
function isSelected(row: any) { return selectedKeys.value.has(keyOf(row)) }
function toggleRow(row: any) {
  const next = new Set(selectedKeys.value)
  const key = keyOf(row)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedKeys.value = next
  publish()
}
function toggleAll(value: any) {
  selectedKeys.value = value ? new Set(props.rows.map(keyOf)) : new Set()
  publish()
}
watch(() => props.rows, () => {
  selectedKeys.value = new Set([...selectedKeys.value].filter(key => props.rows.some(row => keyOf(row) === key)))
  publish()
})
</script>
<style scoped>
.data-table-card {
  overflow: visible;
}

.table-meta {
  margin-top: 6px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}

.table-body {
  padding-top: 0;
}

.table-scroll {
  overflow-x: auto;
  border: 1px solid #e3e9f2;
  border-radius: 14px;
}

.action-col {
  position: sticky;
  right: 0;
  min-width: 160px;
  white-space: nowrap;
  background: #fff;
  box-shadow: -10px 0 18px rgba(15, 23, 42, .025);
}

.action-cell {
  display: flex;
  gap: 4px;
  align-items: center;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 44px 0;
  background: #fff;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding-top: 16px;
}
</style>
