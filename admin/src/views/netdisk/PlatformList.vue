<template>
  <div class="page-container">
    <div class="page-title mb-4">平台管理</div>

    <a-card size="small" class="mb-4">
      <a-button type="primary" @click="openCreate" v-permission="'netdisk:edit'">新建平台</a-button>
    </a-card>

    <a-table :dataSource="list" :columns="cols" :loading="ld" :pagination="{ current: p, pageSize: ps, total: t }" @change="onTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'icon'">
          <a-image v-if="record.icon" :src="record.icon" :width="32" :height="32" style="border-radius:4px" />
          <span v-else>-</span>
        </template>
        <template v-else-if="column.dataIndex === 'resourceCount'">
          {{ record._count?.resources ?? 0 }}
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a @click="openEdit(record)" v-permission="'netdisk:edit'">编辑</a>
            <a-popconfirm title="确定删除该平台？" @confirm="onDelete(record)" v-permission="'netdisk:edit'">
              <a style="color:#ff4d4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑平台' : '新建平台'" @ok="onSubmit" :confirm-loading="submitting">
      <a-form layout="vertical">
        <a-form-item label="名称" required><a-input v-model:value="form.name" placeholder="平台名称" /></a-form-item>
        <a-form-item label="图标"><a-input v-model:value="form.icon" placeholder="图标URL" /></a-form-item>
        <a-form-item label="基础URL"><a-input v-model:value="form.baseUrl" placeholder="如 https://pan.baidu.com" /></a-form-item>
        <a-form-item label="排序"><a-input-number v-model:value="form.sortOrder" :min="0" style="width:100%" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { netdiskApi } from '@/api/netdisk'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)

const cols = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '图标', dataIndex: 'icon', width: 60 },
  { title: '名称', dataIndex: 'name', width: 150 },
  { title: '基础URL', dataIndex: 'baseUrl', width: 200 },
  { title: '资源数', dataIndex: 'resourceCount', width: 80 },
  { title: '排序', dataIndex: 'sortOrder', width: 70 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140 },
]

async function fetchList() {
  ld.value = true
  try {
    const res = await netdiskApi.getPlatformList({ page: p.value, pageSize: ps.value })
    const data = res.data as any
    list.value = data.list || []
    t.value = data.total || 0
  } catch { /* ignore */ }
  finally { ld.value = false }
}

function onTableChange(pag: any) { p.value = pag.current; fetchList() }

const modalVisible = ref(false), editingId = ref(''), submitting = ref(false)
const form = reactive({ name: '', icon: '', baseUrl: '', sortOrder: 0 })

function openCreate() {
  editingId.value = ''
  form.name = ''; form.icon = ''; form.baseUrl = ''; form.sortOrder = 0
  modalVisible.value = true
}
function openEdit(r: any) {
  editingId.value = r.id
  form.name = r.name; form.icon = r.icon || ''; form.baseUrl = r.baseUrl || ''; form.sortOrder = r.sortOrder
  modalVisible.value = true
}
async function onSubmit() {
  submitting.value = true
  try {
    if (editingId.value) {
      await netdiskApi.updatePlatform(editingId.value, form as any)
      message.success('已保存')
    } else {
      await netdiskApi.createPlatform(form as any)
      message.success('已创建')
    }
    modalVisible.value = false; fetchList()
  } catch { /* ignore */ }
  finally { submitting.value = false }
}
async function onDelete(r: any) {
  await netdiskApi.deletePlatform(r.id)
  message.success('已删除'); fetchList()
}

onMounted(() => fetchList())
</script>
