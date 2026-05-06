<template>
  <div class="page-container">
    <div class="page-title mb-4">等级管理</div>

    <a-tabs v-model:activeKey="activeTab">
      <!-- 等级配置 -->
      <a-tab-pane key="config" tab="等级配置">
        <a-card size="small" class="mb-4">
          <a-row :gutter="12">
            <a-col :span="4">
              <a-input v-model:value="f.keyword" placeholder="等级名称" allow-clear @pressEnter="onSearch" />
            </a-col>
            <a-col :span="2">
              <a-button type="primary" @click="openCreate">新增等级</a-button>
            </a-col>
          </a-row>
        </a-card>

        <a-table :dataSource="list" :columns="cols" :loading="ld" :pagination="{ current: p, pageSize: ps, total: t }" @change="onTableChange" rowKey="id" size="small">
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'preview'">
              <a-tag :color="record.textColor || '#999'" :style="tagStyle(record)">
                {{ record.levelPrefix || '' }}{{ record.levelName }}
              </a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'isActive'">
              <a-tag :color="record.isActive ? 'green' : 'default'">{{ record.isActive ? '启用' : '停用' }}</a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'action'">
              <a-space>
                <a @click="openEdit(record)">编辑</a>
                <a-popconfirm title="确定删除？" @confirm="onDelete(record)">
                  <a style="color:#ff4d4f">删除</a>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <!-- 用户等级查询 -->
      <a-tab-pane key="users" tab="用户等级查询">
        <a-card size="small" class="mb-4">
          <a-row :gutter="12">
            <a-col :span="4">
              <a-input v-model:value="uf.keyword" placeholder="昵称/手机号" allow-clear @pressEnter="onUserSearch" />
            </a-col>
          </a-row>
        </a-card>

        <a-table :dataSource="ulist" :columns="ucols" :loading="uld" :pagination="{ current: up, pageSize: ups, total: ut }" @change="onUserTableChange" rowKey="userId" size="small">
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'user'">
              <a-space>
                <a-avatar :src="record.avatar" size="small" />
                <span>{{ record.nickname || '-' }}</span>
              </a-space>
            </template>
            <template v-else-if="column.dataIndex === 'progress'">
              <div>
                <a-progress :percent="record.maxLevel ? 100 : Math.round((record.currentExp / record.nextExp) * 100)" :size="20" :show-info="false" />
                <small style="color:#999">{{ record.currentExp }} / {{ record.nextExp || record.currentExp }}</small>
              </div>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>

    <!-- 等级编辑弹窗 -->
    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑等级' : '新增等级'" :width="600" @ok="onSubmit" :confirm-loading="submitting">
      <a-form layout="vertical">
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="等级序号" required>
              <a-input-number v-model:value="form.levelNumber" :min="1" :max="100" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="等级名称" required>
              <a-input v-model:value="form.levelName" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="等级前缀">
              <a-input v-model:value="form.levelPrefix" placeholder="如: Lv." />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="所需经验">
          <a-input-number v-model:value="form.requiredExp" :min="0" style="width:200px" />
        </a-form-item>

        <a-divider>样式设置</a-divider>
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="背景色"><a-input v-model:value="form.backgroundColor" type="color" style="width:60px" /></a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="文字颜色"><a-input v-model:value="form.textColor" type="color" style="width:60px" /></a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="边框颜色"><a-input v-model:value="form.borderColor" type="color" style="width:60px" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6">
            <a-form-item label="字号(px)"><a-input-number v-model:value="form.fontSize" :min="8" :max="48" style="width:100%" /></a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="边框宽(px)"><a-input-number v-model:value="form.borderWidth" :min="0" style="width:100%" /></a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="圆角(px)"><a-input-number v-model:value="form.borderRadius" :min="0" style="width:100%" /></a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="字重">
              <a-select v-model:value="form.fontWeight" allow-clear>
                <a-select-option value="normal">normal</a-select-option>
                <a-select-option value="bold">bold</a-select-option>
                <a-select-option value="500">500</a-select-option>
                <a-select-option value="600">600</a-select-option>
                <a-select-option value="700">700</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="上内边距"><a-input-number v-model:value="form.paddingTop" :min="0" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="右内边距"><a-input-number v-model:value="form.paddingRight" :min="0" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="下内边距"><a-input-number v-model:value="form.paddingBottom" :min="0" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="左内边距"><a-input-number v-model:value="form.paddingLeft" :min="0" /></a-form-item></a-col>
        </a-row>

        <a-divider>前缀样式</a-divider>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="前缀字号(px)"><a-input-number v-model:value="form.prefixFontSize" :min="8" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="前缀颜色"><a-input v-model:value="form.prefixTextColor" type="color" style="width:60px" /></a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="等级描述"><a-textarea v-model:value="form.levelDescription" :rows="2" /></a-form-item>
        <a-form-item label="等级权益"><a-textarea v-model:value="form.levelBenefits" :rows="2" /></a-form-item>
        <a-form-item label="启用"><a-switch v-model:checked="form.isActive" /></a-form-item>

        <a-divider />
        <div style="text-align:center">预览: <a-tag :color="form.textColor || '#999'" :style="tagStyle(form)">{{ form.levelPrefix || 'Lv.' }}{{ form.levelName || '等级' }}</a-tag></div>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import { userApi } from '@/api/user'
import type { UserLevel, UserLevelInfo } from '@/types/user'

const activeTab = ref('config')

// === 等级配置 ===
const ld = ref(false), list = ref<UserLevel[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ keyword: '' })

const cols = [
  { title: '序号', dataIndex: 'levelNumber', width: 60 },
  { title: '预览', dataIndex: 'preview', width: 120 },
  { title: '经验门槛', dataIndex: 'requiredExp', width: 80 },
  { title: '状态', dataIndex: 'isActive', width: 60 },
  { title: '描述', dataIndex: 'levelDescription', ellipsis: true },
  { title: '操作', dataIndex: 'action', width: 100 },
]

function tagStyle(r: any) {
  const s: any = {}
  if (r.backgroundColor) s.backgroundColor = r.backgroundColor
  if (r.textColor) s.color = r.textColor
  if (r.borderColor) s.borderColor = r.borderColor
  if (r.borderWidth) s.borderWidth = r.borderWidth + 'px'
  if (r.borderRadius) s.borderRadius = r.borderRadius + 'px'
  if (r.fontSize) s.fontSize = r.fontSize + 'px'
  if (r.fontWeight) s.fontWeight = r.fontWeight
  if (r.paddingTop) s.paddingTop = r.paddingTop + 'px'
  if (r.paddingBottom) s.paddingBottom = r.paddingBottom + 'px'
  if (r.paddingLeft) s.paddingLeft = r.paddingLeft + 'px'
  if (r.paddingRight) s.paddingRight = r.paddingRight + 'px'
  if (r.borderWidth) s.border = r.borderWidth + 'px solid ' + (r.borderColor || '#ccc')
  s.borderStyle = 'solid'
  return s
}

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.keyword) params.keyword = f.keyword
    const res = await userApi.getLevelList(params)
    const data = res.data as any
    list.value = data.list || []
    t.value = data.total || 0
  } catch { /* ignore */ } finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onTableChange(pag: any) { p.value = pag.current; fetchList() }

// === 用户等级查询 ===
const uld = ref(false), ulist = ref<UserLevelInfo[]>([]), ut = ref(0), up = ref(1), ups = ref(20)
const uf = reactive({ keyword: '' })

const ucols = [
  { title: '用户', dataIndex: 'user', width: 140 },
  { title: '手机号', dataIndex: 'phone', width: 120 },
  { title: '当前等级', dataIndex: 'currentLevelName', width: 100 },
  { title: '经验进度', dataIndex: 'progress', width: 200 },
  { title: '下级等级', dataIndex: 'nextLevelName', width: 100 },
]

async function fetchUserLevels() {
  uld.value = true
  try {
    const params: any = { page: up.value, pageSize: ups.value }
    if (uf.keyword) params.keyword = uf.keyword
    const res = await userApi.getUserLevels(params)
    const data = res.data as any
    ulist.value = data.list || []
    ut.value = data.total || 0
  } catch { /* ignore */ } finally { uld.value = false }
}

function onUserSearch() { up.value = 1; fetchUserLevels() }
function onUserTableChange(pag: any) { up.value = pag.current; fetchUserLevels() }

// === 等级编辑 ===
const modalVisible = ref(false), editingId = ref(''), submitting = ref(false)
const form = reactive<any>({
  levelNumber: 1, levelName: '', levelPrefix: '', requiredExp: 0,
  backgroundColor: '', textColor: '#333', borderColor: '', borderWidth: 0, borderRadius: 4,
  fontSize: 12, fontWeight: 'normal',
  paddingTop: 2, paddingRight: 8, paddingBottom: 2, paddingLeft: 8,
  prefixFontSize: 10, prefixTextColor: '#999',
  levelDescription: '', levelBenefits: '', isActive: true,
})

function openCreate() {
  editingId.value = ''
  Object.assign(form, {
    levelNumber: 1, levelName: '', levelPrefix: '', requiredExp: 0,
    backgroundColor: '', textColor: '#333', borderColor: '', borderWidth: 0, borderRadius: 4,
    fontSize: 12, fontWeight: 'normal',
    paddingTop: 2, paddingRight: 8, paddingBottom: 2, paddingLeft: 8,
    prefixFontSize: 10, prefixTextColor: '#999',
    levelDescription: '', levelBenefits: '', isActive: true,
  })
  modalVisible.value = true
}

function openEdit(r: Record<string, any>) {
  editingId.value = r.id
  Object.assign(form, r)
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    if (editingId.value) {
      await userApi.updateLevel(editingId.value, form)
      message.success('已更新')
    } else {
      await userApi.createLevel(form)
      message.success('已创建')
    }
    modalVisible.value = false
    fetchList()
  } catch { /* ignore */ } finally { submitting.value = false }
}

async function onDelete(r: Record<string, any>) {
  await userApi.deleteLevel(r.id)
  message.success('已删除')
  fetchList()
}

onMounted(() => { fetchList(); fetchUserLevels() })
</script>
