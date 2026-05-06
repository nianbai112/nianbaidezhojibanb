<template>
  <div class="page-container table-page">
    <div class="table-toolbar">
      <div class="page-title">取件点管理</div>
      <a-space>
        <a-button type="primary" @click="handleAdd">新增取件点</a-button>
      </a-space>
    </div>

    <div class="table-container">
      <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'type'">
            <a-tag :color="record.type === 'pickup' ? 'blue' : 'green'">
              {{ record.type === 'pickup' ? '取件点' : '配送点' }}
            </a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'isOpen'">
            <a-switch v-model:checked="record.isOpen" @change="handleToggleStatus(record)" />
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-space>
              <a @click="handleEdit(record)">编辑</a>
              <a-popconfirm title="确定要删除该取件点吗？" @confirm="handleDelete(record)">
                <a class="text-danger">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <a-modal v-model:visible="visible" :title="isEdit ? '编辑取件点' : '新增取件点'" @ok="handleSave" :confirmLoading="saving">
      <a-form :model="form" :label-col="{span: 5}" :wrapper-col="{span: 18}">
        <a-form-item label="名称" required>
          <a-input v-model:value="form.name" placeholder="请输入取件点名称" />
        </a-form-item>
        <a-form-item label="类型">
          <a-select v-model:value="form.type">
            <a-select-option value="pickup">取件点</a-select-option>
            <a-select-option value="deliver">配送点</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="详细地址">
          <a-input v-model:value="form.address" placeholder="请输入地址" />
        </a-form-item>
        <a-form-item label="经度">
          <a-input-number v-model:value="form.longitude" style="width: 100%" />
        </a-form-item>
        <a-form-item label="纬度">
          <a-input-number v-model:value="form.latitude" style="width: 100%" />
        </a-form-item>
        <a-form-item label="是否营业">
          <a-switch v-model:checked="form.isOpen" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { errandApi } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const list = ref([])
const visible = ref(false)
const isEdit = ref(false)

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0
})

const columns = [
  { title: '名称', dataIndex: 'name' },
  { title: '类型', dataIndex: 'type' },
  { title: '地址', dataIndex: 'address' },
  { title: '状态', dataIndex: 'isOpen' },
  { title: '创建时间', dataIndex: 'createdAt' },
  { title: '操作', dataIndex: 'action', width: 150 }
]

const form = reactive({
  id: '',
  name: '',
  type: 'pickup',
  address: '',
  longitude: 0,
  latitude: 0,
  isOpen: true
})

const fetchList = async () => {
  loading.value = true
  try {
    const res = await errandApi.getPickupPointList({
      page: pagination.current,
      pageSize: pagination.pageSize,
      regionId: userStore.regionId
    })
    list.value = res.data.list
    pagination.total = res.data.total
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  fetchList()
}

const handleAdd = () => {
  isEdit.value = false
  Object.assign(form, { id: '', name: '', type: 'pickup', address: '', longitude: 0, latitude: 0, isOpen: true })
  visible.value = true
}

const handleEdit = (record: any) => {
  isEdit.value = true
  Object.assign(form, record)
  visible.value = true
}

const handleToggleStatus = async (record: any) => {
  try {
    await errandApi.updatePickupPoint(record.id, { isOpen: record.isOpen })
    message.success('状态已更新')
  } catch (err) {
    record.isOpen = !record.isOpen
  }
}

const handleSave = async () => {
  if (!form.name) return message.warning('请输入名称')
  saving.value = true
  try {
    const payload = { ...form, regionId: userStore.regionId }
    if (isEdit.value) {
      await errandApi.updatePickupPoint(form.id, payload)
    } else {
      await errandApi.createPickupPoint(payload)
    }
    message.success('保存成功')
    visible.value = false
    fetchList()
  } finally {
    saving.value = false
  }
}

const handleDelete = async (record: any) => {
  try {
    await errandApi.deletePickupPoint(record.id)
    message.success('删除成功')
    fetchList()
  } catch (err) {}
}

onMounted(() => {
  fetchList()
})
</script>
