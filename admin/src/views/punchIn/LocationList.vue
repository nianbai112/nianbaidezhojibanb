<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="f.keyword" placeholder="地点名称" allow-clear style="width:180px" />
      <a-select v-model:value="f.regionId" placeholder="区域" allow-clear style="width:140px">
        <a-select-option v-for="r in regions" :key="r.id" :value="r.id">{{ r.name }}</a-select-option>
      </a-select>
      <a-select v-model:value="f.categoryId" placeholder="分类" allow-clear style="width:140px">
        <a-select-option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
      </a-select>
      <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="DRAFT">草稿</a-select-option>
        <a-select-option value="PUBLISHED">发布</a-select-option>
        <a-select-option value="CLOSED">关闭</a-select-option>
      </a-select>
    </FilterBar>
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">地点管理</span>
        <a-button type="primary" @click="onCreate">新建地点</a-button>
      </div>
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #coverImage="{ record }">
          <img v-if="record.coverImage" :src="record.coverImage" style="width:50px;height:50px;object-fit:cover;border-radius:4px" />
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'PUBLISHED' ? 'green' : record.status === 'DRAFT' ? 'blue' : 'default'">
            {{ record.status === 'PUBLISHED' ? '发布' : record.status === 'DRAFT' ? '草稿' : '关闭' }}
          </a-tag>
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onEdit(record)">编辑</a>
            <a-popconfirm title="确定删除该地点吗？" @confirm="onDelete(record)">
              <a style="color:#ff4d4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑地点' : '新建地点'" @ok="onSubmit" :confirm-loading="submitting" width="640px">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="名称" required>
              <a-input v-model:value="form.name" placeholder="地点名称" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="分类">
              <a-select v-model:value="form.categoryId" placeholder="选择分类" allow-clear>
                <a-select-option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="区域ID" required>
          <a-input v-model:value="form.regionId" placeholder="区域ID" />
        </a-form-item>
        <a-form-item label="地址">
          <a-input v-model:value="form.address" placeholder="详细地址" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="纬度">
              <a-input-number v-model:value="form.latitude" :precision="7" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="经度">
              <a-input-number v-model:value="form.longitude" :precision="7" style="width:100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="封面图">
          <a-input v-model:value="form.coverImage" placeholder="封面图URL" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="form.description" :rows="3" placeholder="地点描述" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="状态">
              <a-radio-group v-model:value="form.status">
                <a-radio value="DRAFT">草稿</a-radio>
                <a-radio value="PUBLISHED">发布</a-radio>
                <a-radio value="CLOSED">关闭</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="共享全区">
              <a-switch v-model:checked="form.isShared" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { punchInApi } from '@/api/punchIn'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ keyword: '', regionId: undefined as string | undefined, categoryId: undefined as string | undefined, status: undefined as string | undefined })
const regions = ref<any[]>([]), categories = ref<any[]>([])

const cols = [
  { title: 'ID', dataIndex: 'id', width: 180, ellipsis: true },
  { title: '封面', dataIndex: 'coverImage', width: 60, slot: 'coverImage' },
  { title: '名称', dataIndex: 'name', width: 150 },
  { title: '分类', dataIndex: 'categoryName', width: 100 },
  { title: '地址', dataIndex: 'address', width: 180, ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 70, slot: 'status' },
  { title: '打卡数', dataIndex: 'recordCount', width: 70 },
  { title: '创建时间', dataIndex: 'createdAt', width: 170 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action' },
]

async function fetchData() {
  ld.value = true
  try {
    const res = await punchInApi.getLocationList({ page: p.value, pageSize: ps.value, ...f })
    list.value = res.data.data?.list || []
    t.value = res.data.data?.total || 0
  } catch { /* handled */ }
  finally { ld.value = false }
}

async function loadOptions() {
  try {
    const catRes = await punchInApi.getCategoryList({ page: 1, pageSize: 100 })
    categories.value = catRes.data.data?.list || []
  } catch { /* */ }
}

function onSearch() { p.value = 1; fetchData() }
function onReset() { f.keyword = ''; f.regionId = undefined; f.categoryId = undefined; f.status = undefined; onSearch() }

const modalVisible = ref(false), editingId = ref(''), submitting = ref(false)
const form = reactive({ regionId: '', categoryId: undefined as string | undefined, name: '', address: '', latitude: undefined as number | undefined, longitude: undefined as number | undefined, coverImage: '', description: '', status: 'DRAFT', isShared: false })

function onCreate() {
  editingId.value = ''
  Object.assign(form, { regionId: '', categoryId: undefined, name: '', address: '', latitude: undefined, longitude: undefined, coverImage: '', description: '', status: 'DRAFT', isShared: false })
  modalVisible.value = true
}

function onEdit(r: any) {
  editingId.value = r.id
  Object.assign(form, {
    regionId: r.regionId, categoryId: r.categoryId, name: r.name, address: r.address || '',
    latitude: r.latitude, longitude: r.longitude, coverImage: r.coverImage || '',
    description: r.description || '', status: r.status, isShared: r.isShared,
  })
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    if (editingId.value) {
      await punchInApi.updateLocation(editingId.value, { ...form } as any)
    } else {
      await punchInApi.createLocation({ ...form } as any)
    }
    message.success('保存成功')
    modalVisible.value = false
    fetchData()
  } catch { /* handled */ }
  finally { submitting.value = false }
}

async function onDelete(r: any) {
  await punchInApi.deleteLocation(r.id)
  message.success('已删除')
  fetchData()
}

onMounted(() => { loadOptions(); fetchData() })
</script>
