<template>
  <div class="page-container table-page">
    <div class="table-toolbar">
      <div class="page-title">物品大小管理</div>
      <a-space>
        <a-button type="primary" @click="handleAdd">新增物品大小</a-button>
      </a-space>
    </div>

    <div class="table-container">
      <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'weight'">
            {{ record.weightMin }}kg - {{ record.weightMax || '无上限' }}kg
          </template>
          <template v-else-if="column.dataIndex === 'price'">
            <span class="text-danger">+ ¥{{ record.price }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-space>
              <a @click="handleEdit(record)">编辑</a>
              <a-popconfirm title="确定要删除吗？" @confirm="handleDelete(record)">
                <a class="text-danger">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <a-modal v-model:visible="visible" :title="isEdit ? '编辑物品大小' : '新增物品大小'" @ok="handleSave" :confirmLoading="saving">
      <a-form :model="form" :label-col="{span: 5}" :wrapper-col="{span: 18}">
        <a-form-item label="名称" required>
          <a-input v-model:value="form.name" placeholder="如：小件、中件、大件" />
        </a-form-item>
        <a-form-item label="最小重量(kg)">
          <a-input-number v-model:value="form.weightMin" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="最大重量(kg)">
          <a-input-number v-model:value="form.weightMax" :min="0" style="width: 100%" placeholder="不填表示无上限" />
        </a-form-item>
        <a-form-item label="附加费用(元)">
          <a-input-number v-model:value="form.price" :min="0" :precision="2" style="width: 100%" />
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model:value="form.sortOrder" :min="0" style="width: 100%" />
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
  { title: '重量范围', dataIndex: 'weight' },
  { title: '附加费用', dataIndex: 'price' },
  { title: '排序', dataIndex: 'sortOrder' },
  { title: '创建时间', dataIndex: 'createdAt' },
  { title: '操作', dataIndex: 'action', width: 150 }
]

const form = reactive({
  id: '',
  name: '',
  weightMin: 0,
  weightMax: null as number | null,
  price: 0,
  sortOrder: 0
})

const fetchList = async () => {
  loading.value = true
  try {
    const res = await errandApi.getItemSizeList({
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
  Object.assign(form, { id: '', name: '', weightMin: 0, weightMax: null, price: 0, sortOrder: 0 })
  visible.value = true
}

const handleEdit = (record: any) => {
  isEdit.value = true
  Object.assign(form, record)
  visible.value = true
}

const handleSave = async () => {
  if (!form.name) return message.warning('请输入名称')
  saving.value = true
  try {
    const payload = { ...form, regionId: userStore.regionId }
    if (isEdit.value) {
      await errandApi.updateItemSize(form.id, payload)
    } else {
      await errandApi.createItemSize(payload)
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
    await errandApi.deleteItemSize(record.id)
    message.success('删除成功')
    fetchList()
  } catch (err) {}
}

onMounted(() => {
  fetchList()
})
</script>
