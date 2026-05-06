<template>
  <div class="page-container">
    <div class="page-title mb-4">资源管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="4">
          <a-input v-model:value="f.keyword" placeholder="资源标题" allow-clear @pressEnter="onSearch" />
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="f.categoryId" placeholder="分类" allow-clear style="width:100%" :options="catOpts" :field-names="{ value: 'id', label: 'name' }" @change="onSearch" />
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="f.platformId" placeholder="平台" allow-clear style="width:100%" :options="platOpts" :field-names="{ value: 'id', label: 'name' }" @change="onSearch" />
        </a-col>
        <a-col :span="2">
          <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:100%" @change="onSearch">
            <a-select-option value="active">正常</a-select-option>
            <a-select-option value="banned">封禁</a-select-option>
            <a-select-option value="pending">待审核</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="2">
          <a-button type="primary" @click="openCreate" v-permission="'netdisk:edit'">新建资源</a-button>
        </a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="cols" :loading="ld" :pagination="{ current: p, pageSize: ps, total: t }" @change="onTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'cover'">
          <a-image v-if="record.cover" :src="record.cover" :width="40" :height="40" style="object-fit:cover;border-radius:4px" />
          <span v-else style="color:#ccc">-</span>
        </template>
        <template v-else-if="column.dataIndex === 'category'">
          {{ record.category?.name || '-' }}
        </template>
        <template v-else-if="column.dataIndex === 'platform'">
          {{ record.platform?.name || '-' }}
        </template>
        <template v-else-if="column.dataIndex === 'price'">
          <span v-if="record.price">¥{{ (Number(record.price)).toFixed(2) }}</span>
          <span v-else style="color:#999">免费</span>
        </template>
        <template v-else-if="column.dataIndex === 'size'">
          {{ (record.size / 1024 / 1024).toFixed(2) }}MB
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <a-tag :color="record.status === 'active' ? 'green' : record.status === 'banned' ? 'red' : 'orange'">
            {{ record.status === 'active' ? '正常' : record.status === 'banned' ? '封禁' : '待审核' }}
          </a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'user'">
          {{ record.User?.nickname || '-' }}
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a v-if="record.status === 'pending'" @click="onAudit(record, 'active')" v-permission="'netdisk:audit'">通过</a>
            <a v-if="record.status !== 'banned'" @click="onAudit(record, 'banned')" v-permission="'netdisk:audit'">封禁</a>
            <a v-if="record.status === 'banned'" @click="onAudit(record, 'active')" v-permission="'netdisk:audit'">解除</a>
            <a @click="openEdit(record)" v-permission="'netdisk:edit'">编辑</a>
            <a-popconfirm title="确定删除该资源？" @confirm="onDelete(record)" v-permission="'netdisk:audit'">
              <a style="color:#ff4d4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 新建/编辑弹窗 -->
    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑资源' : '新建资源'" :width="560" @ok="onSubmit" :confirm-loading="submitting">
      <a-form layout="vertical">
        <a-form-item label="标题" required><a-input v-model:value="form.title" /></a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="分类">
              <a-select v-model:value="form.categoryId" placeholder="选择分类" :options="catOpts" :field-names="{ value: 'id', label: 'name' }" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="平台">
              <a-select v-model:value="form.platformId" placeholder="选择平台" :options="platOpts" :field-names="{ value: 'id', label: 'name' }" allow-clear />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="封面"><a-input v-model:value="form.cover" placeholder="封面图片URL" /></a-form-item>
        <a-form-item label="描述"><a-textarea v-model:value="form.description" :rows="2" /></a-form-item>
        <a-form-item label="下载链接" required><a-input v-model:value="form.url" placeholder="资源下载链接" /></a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="提取码"><a-input v-model:value="form.extractCode" placeholder="如无则不填" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="价格 (元)"><a-input-number v-model:value="form.price" :min="0" :precision="2" style="width:100%" placeholder="0=免费" /></a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="文件大小 (字节)"><a-input-number v-model:value="form.size" :min="0" style="width:100%" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { netdiskApi } from '@/api/netdisk'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const catOpts = ref<any[]>([]), platOpts = ref<any[]>([])
const f = reactive({ keyword: '', categoryId: undefined as string | undefined, platformId: undefined as string | undefined, status: undefined as string | undefined })

const cols = [
  { title: '封面', dataIndex: 'cover', width: 60 },
  { title: '标题', dataIndex: 'title', width: 180 },
  { title: '分类', dataIndex: 'category', width: 90 },
  { title: '平台', dataIndex: 'platform', width: 90 },
  { title: '价格', dataIndex: 'price', width: 80 },
  { title: '大小', dataIndex: 'size', width: 80 },
  { title: '下载量', dataIndex: 'downloadCount', width: 70 },
  { title: '上传者', dataIndex: 'user', width: 100 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '创建时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 180 },
]

async function fetchOpts() {
  try {
    const [catRes, platRes] = await Promise.all([
      netdiskApi.getCategoryList({ page: 1, pageSize: 200 }),
      netdiskApi.getPlatformList({ page: 1, pageSize: 200 }),
    ])
    catOpts.value = (catRes.data as any).list || []
    platOpts.value = (platRes.data as any).list || []
  } catch { /* ignore */ }
}

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.keyword) params.keyword = f.keyword
    if (f.categoryId) params.categoryId = f.categoryId
    if (f.platformId) params.platformId = f.platformId
    if (f.status) params.status = f.status
    const res = await netdiskApi.getResourceList(params)
    const data = res.data as any
    list.value = data.list || []
    t.value = data.total || 0
  } catch { /* ignore */ }
  finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onTableChange(pag: any) { p.value = pag.current; fetchList() }

async function onAudit(r: any, status: string) {
  await netdiskApi.updateResourceStatus(r.id, status)
  message.success('已更新'); fetchList()
}

const modalVisible = ref(false), editingId = ref(''), submitting = ref(false)
const form = reactive<any>({
  title: '', categoryId: undefined, platformId: undefined, cover: '',
  description: '', url: '', extractCode: '', price: undefined, size: 0,
})

function openCreate() {
  editingId.value = ''
  Object.assign(form, { title: '', categoryId: undefined, platformId: undefined, cover: '', description: '', url: '', extractCode: '', price: undefined, size: 0 })
  modalVisible.value = true
}
function openEdit(r: any) {
  editingId.value = r.id
  form.title = r.title; form.categoryId = r.categoryId; form.platformId = r.platformId
  form.cover = r.cover || ''; form.description = r.description || ''
  form.url = r.url; form.extractCode = r.extractCode || ''
  form.price = r.price ? Number(r.price) : undefined; form.size = r.size
  modalVisible.value = true
}
async function onSubmit() {
  submitting.value = true
  try {
    if (editingId.value) {
      await netdiskApi.updateResource(editingId.value, form)
      message.success('已保存')
    } else {
      await netdiskApi.createResource(form)
      message.success('已创建')
    }
    modalVisible.value = false; fetchList()
  } catch { /* ignore */ }
  finally { submitting.value = false }
}
async function onDelete(r: any) {
  await netdiskApi.deleteResource(r.id)
  message.success('已删除'); fetchList()
}

onMounted(() => { fetchOpts(); fetchList() })
</script>
