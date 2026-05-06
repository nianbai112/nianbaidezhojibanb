<template>
  <div class="data-table">
    <!-- 工具栏 -->
    <div class="table-toolbar" v-if="$slots.toolbar || showBatchBar">
      <div class="toolbar-left">
        <slot name="toolbar" />
        <template v-if="showBatchBar && selectedRowKeys.length > 0">
          <span class="selected-count">已选 {{ selectedRowKeys.length }} 项</span>
          <a-button
            v-for="action in batchActions"
            :key="action.key"
            :type="action.type || 'default'"
            :danger="action.danger"
            size="small"
            @click="$emit('batch-action', action.key, selectedRowKeys)"
          >
            {{ action.label }}
          </a-button>
        </template>
      </div>
      <div class="toolbar-right">
        <slot name="toolbar-right" />
      </div>
    </div>

    <!-- 表格 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="paginationConfig"
      :row-selection="rowSelection ? rowSelectionConfig : undefined"
      :row-key="rowKey"
      :scroll="resolvedScroll"
      :size="size"
      :bordered="bordered"
      @change="onTableChange"
      v-bind="$attrs"
    >
      <!-- 动态插槽 -->
      <template v-for="col in columns" :key="col.key || col.dataIndex" #[getSlotName(col)]="scope">
        <slot :name="col.slot || col.dataIndex" v-bind="scope" />
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TablePaginationConfig } from 'ant-design-vue'

interface BatchAction {
  key: string
  label: string
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text'
  danger?: boolean
}

type DataTableColumn = Record<string, any>

const props = withDefaults(defineProps<{
  columns: DataTableColumn[]
  dataSource: any[]
  loading?: boolean
  total?: number
  page?: number
  pageSize?: number
  rowKey?: string
  scroll?: { x?: number | string; y?: number | string }
  size?: 'small' | 'middle' | 'large'
  bordered?: boolean
  showSizeChanger?: boolean
  pageSizeOptions?: string[]
  rowSelection?: boolean
  selectedKeys?: (string | number)[]
  batchActions?: BatchAction[]
}>(), {
  loading: false,
  total: 0,
  page: 1,
  pageSize: 20,
  rowKey: 'id',
  size: 'middle',
  bordered: false,
  showSizeChanger: true,
  pageSizeOptions: () => ['10', '20', '50', '100'],
  rowSelection: false,
  selectedKeys: () => [],
  batchActions: () => [],
})

const emit = defineEmits<{
  (e: 'change', pagination: TablePaginationConfig, filters: any, sorter: any): void
  (e: 'update:page', page: number): void
  (e: 'update:pageSize', pageSize: number): void
  (e: 'update:selectedKeys', keys: (string | number)[]): void
  (e: 'batch-action', action: string, keys: (string | number)[]): void
}>()

const selectedRowKeys = ref<(string | number)[]>(props.selectedKeys)

watch(() => props.selectedKeys, (val) => {
  selectedRowKeys.value = val
})

const showBatchBar = computed(() => props.batchActions.length > 0)

const rowSelectionConfig = computed(() => props.rowSelection ? {
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (string | number)[]) => {
    selectedRowKeys.value = keys
    emit('update:selectedKeys', keys)
  },
} : undefined)

const resolvedScroll = computed(() => props.scroll || { x: 'max-content' })

const paginationConfig = computed(() => ({
  current: props.page,
  pageSize: props.pageSize,
  total: props.total,
  showSizeChanger: props.showSizeChanger,
  showQuickJumper: true,
  pageSizeOptions: props.pageSizeOptions,
  showTotal: (total: number) => `共 ${total} 条`,
  responsive: true,
}))

function onTableChange(pag: TablePaginationConfig, filters: any, sorter: any) {
  emit('change', pag, filters, sorter)
  if (pag.current !== props.page) emit('update:page', pag.current || 1)
  if (pag.pageSize !== props.pageSize) emit('update:pageSize', pag.pageSize || 20)
}

function getSlotName(col: DataTableColumn): string {
  return col.slot || col.dataIndex || col.key || ''
}
</script>

<style lang="less" scoped>
.data-table {
  min-width: 0;

  .table-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0 12px;
    margin-bottom: 12px;
  }
  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .selected-count {
    font-size: 13px;
    color: #3B82F6;
    font-weight: 500;
  }

  :deep(.ant-table-wrapper) {
    min-width: 0;
  }

  :deep(.ant-table-cell) {
    vertical-align: middle;
  }
}

@media (max-width: 768px) {
  .data-table {
    .table-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .toolbar-right {
      justify-content: flex-start;
    }
  }
}
</style>
