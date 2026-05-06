<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="f.keyword" placeholder="分类名称" allow-clear style="width:180px" />
      <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="ENABLED">启用</a-select-option>
        <a-select-option value="DISABLED">禁用</a-select-option>
      </a-select>
    </FilterBar>
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">分类管理</span>
        <a-button type="primary" @click="onCreate">新建分类</a-button>
      </div>
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #status="{ record }">
          <a-tag :color="record.status === 'ENABLED' ? 'green' : 'default'">{{ record.status === 'ENABLED' ? '启用' : '禁用' }}</a-tag>
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a-popconfirm title="确定删除该分类吗？" @confirm="onDelete(record)">
              <a style="color:#ff4d4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑分类' : '新建分类'" @ok="onSubmit" :confirm-loading="submitting">
      <a-form layout="vertical">
        <a-form-item label="名称" required>
          <a-input v-model:value="form.name" placeholder="分类名称" />
        </a-form-item>
        <a-form-item label="图标">
          <a-input v-model:value="form.icon" placeholder="图标URL" />
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model:value="form.sortOrder" :min="0" style="width:100%" />
        </a-form-item>
        <a-form-item label="状态">
          <a-radio-group v-model:value="form.status">
            <a-radio value="ENABLED">启用</a-radio>
            <a-radio value="DISABLED">禁用</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { punchInApi } from '@/api/punchIn'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ keyword: '', status: undefined as string | undefined })

const cols = [
  { title: 'ID', dataIndex: 'id', width: 200, ellipsis: true },
  { title: '名称', dataIndex: 'name', width: 150 },
  { title: '图标', dataIndex: 'icon', width: 100 },
  { title: '排序', dataIndex: 'sortOrder', width: 70 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '地点数', dataIndex: 'locationCount', width: 80 },
  { title: '创建时间', dataIndex: 'createdAt', width: 170 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action' },
]

async function fetchData() {
  ld.value = true
  try {
    const res = await punchInApi.getCategoryList({ page: p.value, pageSize: ps.value, ...f })
    list.value = res.data.data?.list || []
    t.value = res.data.data?.total || 0
  } catch { /* handled by interceptor */ }
  finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchData() }
function onReset() { f.keyword = ''; f.status = undefined; onSearch() }

const modalVisible = ref(false), editingId = ref(''), submitting = ref(false)
const form = reactive({ name: '', icon: '', sortOrder: 0, status: 'ENABLED' as string })

function onCreate() {
  editingId.value = ''
  Object.assign(form, { name: '', icon: '', sortOrder: 0, status: 'ENABLED' })
  modalVisible.value = true
}

function onEdit(r: any) {
  editingId.value = r.id
  Object.assign(form, { name: r.name, icon: r.icon || '', sortOrder: r.sortOrder, status: r.status })
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    if (editingId.value) {
      await punchInApi.updateCategory(editingId.value, { ...form } as any)
    } else {
      await punchInApi.createCategory({ ...form } as any)
    }
    message.success('保存成功')
    modalVisible.value = false
    fetchData()
  } catch { /* handled */ }
  finally { submitting.value = false }
}

async function onDelete(r: any) {
  await punchInApi.deleteCategory(r.id)
  message.success('已删除')
  fetchData()
}

fetchData()
</script>
