<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.auditStatus" placeholder="审核状态" allow-clear style="width:130px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="approved">已通过</a-select-option>
        <a-select-option value="rejected">已驳回</a-select-option>
      </a-select>
      <a-select v-model:value="filter.gender" placeholder="性别" allow-clear style="width:100px">
        <a-select-option value="MALE">男</a-select-option>
        <a-select-option value="FEMALE">女</a-select-option>
      </a-select>
      <a-input v-model:value="filter.keyword" placeholder="昵称/学校" allow-clear style="width:180px" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">资料管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #avatar="{ record }">
          <a-image v-if="firstPhoto(record)" :src="firstPhoto(record)" :width="44" :height="44" style="object-fit:cover;border-radius:6px" />
          <a-avatar v-else :size="44" />
        </template>
        <template #gender="{ record }">
          <a-tag :color="record.user?.profile?.gender === 'FEMALE' ? 'pink' : 'blue'" size="small">
            {{ record.user?.profile?.gender === 'FEMALE' ? '女' : record.user?.profile?.gender === 'MALE' ? '男' : '未知' }}
          </a-tag>
        </template>
        <template #bio="{ record }">
          <span style="color:#8590a6;font-size:12px">{{ (record.bio || '').slice(0, 30) || '-' }}</span>
        </template>
        <template #tags="{ record }">
          <span style="font-size:12px;color:#8590a6">{{ (record.tags || []).join(' / ') || '-' }}</span>
        </template>
        <template #auditStatus="{ record }">
          <a-tag :color="record.auditStatus === 'approved' ? 'green' : record.auditStatus === 'rejected' ? 'red' : 'orange'" size="small">
            {{ record.auditStatus === 'approved' ? '已通过' : record.auditStatus === 'rejected' ? '已驳回' : '待审核' }}
          </a-tag>
        </template>
        <template #isOpen="{ record }">
          <a-tag :color="record.isOpen ? 'green' : 'default'" size="small">{{ record.isOpen ? '开放' : '关闭' }}</a-tag>
        </template>
        <template #action="{ record }">
          <a-space size="small">
            <template v-if="record.auditStatus === 'pending'">
              <a @click="onAudit(record, 'approved')" style="color:#389e0d">通过</a>
              <a @click="onAudit(record, 'rejected')" style="color:#cf1322">驳回</a>
            </template>
            <a @click="onViewDetail(record)">详情</a>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- Detail Drawer -->
    <a-drawer v-model:open="drawerVisible" title="资料详情" width="560px">
      <template v-if="detail">
        <!-- Photos -->
        <div v-if="detail.photos?.length" style="margin-bottom:20px">
          <div style="font-weight:500;margin-bottom:8px;color:#666">照片</div>
          <a-image-preview-group>
            <a-space :size="8" wrap>
              <a-image v-for="(p, i) in detail.photos" :key="i" :src="p" :width="120" :height="120" style="object-fit:cover;border-radius:8px" />
            </a-space>
          </a-image-preview-group>
        </div>

        <a-descriptions :column="2" size="small" bordered>
          <a-descriptions-item label="用户">{{ detail.user?.nickname || '-' }}</a-descriptions-item>
          <a-descriptions-item label="性别">
            <a-tag :color="detail.user?.profile?.gender === 'FEMALE' ? 'pink' : 'blue'" size="small">
              {{ detail.user?.profile?.gender === 'FEMALE' ? '女' : detail.user?.profile?.gender === 'MALE' ? '男' : '未知' }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="年龄">{{ calcAge(detail.user?.profile?.birthday) }}</a-descriptions-item>
          <a-descriptions-item label="学校">{{ detail.user?.profile?.school || '-' }}</a-descriptions-item>
          <a-descriptions-item label="专业">{{ detail.user?.profile?.major || '-' }}</a-descriptions-item>
          <a-descriptions-item label="年级">{{ detail.user?.profile?.grade || '-' }}</a-descriptions-item>
          <a-descriptions-item label="状态" :span="2">
            <a-tag :color="detail.auditStatus === 'approved' ? 'green' : detail.auditStatus === 'rejected' ? 'red' : 'orange'" size="small">
              {{ detail.auditStatus === 'approved' ? '已通过' : detail.auditStatus === 'rejected' ? '已驳回' : '待审核' }}
            </a-tag>
            <span style="margin-left:12px">公开：{{ detail.isOpen ? '是' : '否' }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="简介" :span="2">{{ detail.bio || '-' }}</a-descriptions-item>
          <a-descriptions-item label="标签" :span="2">{{ (detail.tags || []).join(' / ') || '-' }}</a-descriptions-item>
          <a-descriptions-item v-if="detail.auditRemark" label="审核备注" :span="2" style="color:#ef4444">{{ detail.auditRemark }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ detail.createdAt }}</a-descriptions-item>
        </a-descriptions>

        <div v-if="detail.auditStatus === 'pending'" style="margin-top:24px;text-align:right">
          <a-space>
            <a-button danger @click="onAudit(detail, 'rejected')">驳回</a-button>
            <a-button type="primary" @click="onAudit(detail, 'approved')">审核通过</a-button>
          </a-space>
        </div>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { datingApi } from '@/api/dating'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ keyword: '', auditStatus: undefined as string | undefined, gender: undefined as string | undefined })

const columns = [
  { title: '照片', dataIndex: 'photos', width: 60, slot: 'avatar' },
  { title: '昵称', dataIndex: 'user', width: 120, format: (v: any) => v?.nickname || '-' },
  { title: '性别', dataIndex: 'gender', width: 60, slot: 'gender' },
  { title: '学校', dataIndex: 'user', width: 130, format: (v: any) => v?.profile?.school || '-' },
  { title: '简介', dataIndex: 'bio', width: 160, slot: 'bio' },
  { title: '标签', dataIndex: 'tags', width: 140, slot: 'tags' },
  { title: '审核', dataIndex: 'auditStatus', width: 75, slot: 'auditStatus' },
  { title: '公开', dataIndex: 'isOpen', width: 55, slot: 'isOpen' },
  { title: '操作', dataIndex: 'action', width: 130, slot: 'action', fixed: 'right' },
]

function firstPhoto(r: any) {
  const p = r.photos
  if (!p) return null
  if (Array.isArray(p)) return p[0]
  return null
}

function calcAge(birthday: string | undefined) {
  if (!birthday) return '-'
  const d = new Date(birthday)
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return isNaN(age) ? '-' : `${age}岁`
}

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, keyword: filter.keyword || undefined, auditStatus: filter.auditStatus, gender: filter.gender }
    const res = await datingApi.getProfileList(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.auditStatus = undefined; filter.gender = undefined; onSearch() }

async function onAudit(record: any, auditStatus: string) {
  try {
    await datingApi.auditProfile(record.id, { auditStatus, auditRemark: auditStatus === 'rejected' ? '审核驳回' : undefined })
    message.success(auditStatus === 'approved' ? '已通过' : '已驳回')
    drawerVisible.value = false
    fetchList()
  } catch { message.error('操作失败') }
}

// Detail Drawer
const drawerVisible = ref(false)
const detail = ref<any>(null)

function onViewDetail(record: any) { detail.value = record; drawerVisible.value = true }

fetchList()
</script>
