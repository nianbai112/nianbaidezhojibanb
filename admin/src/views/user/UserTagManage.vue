<template>
  <div class="page-container">
    <div class="page-title mb-4">标签管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="3">
          <a-input v-model:value="f.keyword" placeholder="标签名称" allow-clear @pressEnter="onSearch" />
        </a-col>
        <a-col :span="2">
          <a-button type="primary" @click="openCreate">新增标签</a-button>
        </a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="cols" :loading="ld" :pagination="{ current: p, pageSize: ps, total: t }" @change="onTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'preview'">
          <a-tag :color="record.textColor || record.tagColor || '#999'" :style="tagStyle(record)">
            {{ record.tagName }}
          </a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'tagLevel'">
          <a-rate :value="record.tagLevel" disabled :count="5" style="font-size:12px" />
        </template>
        <template v-else-if="column.dataIndex === 'isSystem'">
          <a-tag :color="record.isSystem ? 'blue' : 'default'">{{ record.isSystem ? '系统' : '自定义' }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'isActive'">
          <a-tag :color="record.isActive ? 'green' : 'default'">{{ record.isActive ? '启用' : '停用' }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a @click="openEdit(record)">编辑</a>
            <a-popconfirm title="确定删除该标签？" @confirm="onDelete(record)">
              <a style="color:#ff4d4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 新增/编辑弹窗 -->
    <a-modal v-model:open="modalVisible" :title="editingId ? '编辑标签' : '新增标签'" :width="600" @ok="onSubmit" :confirm-loading="submitting">
      <a-form layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="标签名称" required>
              <a-input v-model:value="form.tagName" :maxlength="10" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="标签等级">
              <a-rate v-model:value="form.tagLevel" :count="5" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="显示顺序">
              <a-input-number v-model:value="form.displayOrder" :min="0" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="标签颜色">
              <div style="display:flex;gap:8px;align-items:center">
                <input type="color" v-model="form.tagColor" style="width:40px;height:36px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;padding:2px" />
                <a-input v-model:value="form.tagColor" placeholder="#3B82F6" style="width:120px" />
              </div>
              <div style="margin-top:8px;display:flex;gap:6px">
                <span v-for="c in colorPresets" :key="c" :style="{ width:'24px',height:'24px',borderRadius:'4px',background:c,cursor:'pointer',border:form.tagColor===c?'2px solid #333':'1px solid #e5e7eb' }" @click="form.tagColor = c" />
              </div>
            </a-form-item>
          </a-col>
        </a-row>

        <a-divider>样式设置</a-divider>
        <a-row :gutter="12">
          <a-col :span="6">
            <a-form-item label="背景色"><a-input v-model:value="form.backgroundColor" type="color" style="width:50px" /></a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="文字颜色"><a-input v-model:value="form.textColor" type="color" style="width:50px" /></a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="边框颜色"><a-input v-model:value="form.borderColor" type="color" style="width:50px" /></a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="字重">
              <a-select v-model:value="form.fontWeight" allow-clear>
                <a-select-option value="normal">normal</a-select-option>
                <a-select-option value="bold">bold</a-select-option>
                <a-select-option value="500">500</a-select-option>
                <a-select-option value="600">600</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="字号(px)"><a-input-number v-model:value="form.fontSize" :min="8" :max="36" style="width:100%" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="边框宽(px)"><a-input-number v-model:value="form.borderWidth" :min="0" style="width:100%" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="圆角(px)"><a-input-number v-model:value="form.borderRadius" :min="0" style="width:100%" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="上内边距"><a-input-number v-model:value="form.paddingTop" :min="0" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="右内边距"><a-input-number v-model:value="form.paddingRight" :min="0" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="下内边距"><a-input-number v-model:value="form.paddingBottom" :min="0" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="左内边距"><a-input-number v-model:value="form.paddingLeft" :min="0" /></a-form-item></a-col>
          <a-col :span="6" />
        </a-row>

        <a-form-item label="标签描述">
          <a-textarea v-model:value="form.tagDesc" :rows="2" />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="系统标签"><a-switch v-model:checked="form.isSystem" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="启用"><a-switch v-model:checked="form.isActive" /></a-form-item>
          </a-col>
        </a-row>

        <a-divider />
        <div style="text-align:center">预览: <a-tag :color="form.textColor || form.tagColor || '#999'" :style="tagStyle(form)">{{ form.tagName || '标签预览' }}</a-tag></div>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { userApi } from '@/api/user'
import type { UserTagDef } from '@/types/user'

const ld = ref(false), list = ref<UserTagDef[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const f = reactive({ keyword: '' })

const colorPresets = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6B7280']

const cols = [
  { title: '预览', dataIndex: 'preview', width: 120 },
  { title: '等级', dataIndex: 'tagLevel', width: 110 },
  { title: '类型', dataIndex: 'isSystem', width: 70 },
  { title: '状态', dataIndex: 'isActive', width: 60 },
  { title: '使用人数', dataIndex: 'usedCount', width: 70 },
  { title: '描述', dataIndex: 'tagDesc', ellipsis: true },
  { title: '创建时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 100 },
]

function tagStyle(r: any) {
  const s: any = {}
  if (r.backgroundColor) s.backgroundColor = r.backgroundColor
  if (r.textColor) s.color = r.textColor
  else if (r.tagColor) s.color = r.tagColor
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
  return s
}

async function fetchList() {
  ld.value = true
  try {
    const params: any = { page: p.value, pageSize: ps.value }
    if (f.keyword) params.keyword = f.keyword
    const res = await userApi.getTagDefList(params)
    const data = res.data as any
    list.value = data.list || []
    t.value = data.total || 0
  } catch { /* ignore */ } finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onTableChange(pag: any) { p.value = pag.current; fetchList() }

const modalVisible = ref(false), editingId = ref(''), submitting = ref(false)
const form = reactive<any>({
  tagName: '', tagLevel: 1, tagColor: '#3B82F6', tagDesc: '',
  isSystem: false, isActive: true, displayOrder: 0,
  backgroundColor: '', textColor: '', borderColor: '', borderWidth: 0, borderRadius: 4,
  fontSize: 12, fontWeight: 'normal',
  paddingTop: 2, paddingRight: 8, paddingBottom: 2, paddingLeft: 8,
})

function openCreate() {
  editingId.value = ''
  Object.assign(form, {
    tagName: '', tagLevel: 1, tagColor: '#3B82F6', tagDesc: '',
    isSystem: false, isActive: true, displayOrder: 0,
    backgroundColor: '', textColor: '', borderColor: '', borderWidth: 0, borderRadius: 4,
    fontSize: 12, fontWeight: 'normal',
    paddingTop: 2, paddingRight: 8, paddingBottom: 2, paddingLeft: 8,
  })
  modalVisible.value = true
}

function openEdit(r: Record<string, any>) {
  editingId.value = r.id
  Object.assign(form, {
    tagName: r.tagName, tagLevel: r.tagLevel || 1, tagColor: r.tagColor || '#3B82F6', tagDesc: r.tagDesc || '',
    isSystem: r.isSystem, isActive: r.isActive, displayOrder: r.displayOrder || 0,
    backgroundColor: r.backgroundColor || '', textColor: r.textColor || '', borderColor: r.borderColor || '',
    borderWidth: r.borderWidth || 0, borderRadius: r.borderRadius ?? 4,
    fontSize: r.fontSize || 12, fontWeight: r.fontWeight || 'normal',
    paddingTop: r.paddingTop ?? 2, paddingRight: r.paddingRight ?? 8, paddingBottom: r.paddingBottom ?? 2, paddingLeft: r.paddingLeft ?? 8,
  })
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    if (editingId.value) {
      await userApi.updateTagDef(editingId.value, form)
      message.success('已更新')
    } else {
      await userApi.createTagDef(form)
      message.success('已创建')
    }
    modalVisible.value = false
    fetchList()
  } catch { /* ignore */ } finally { submitting.value = false }
}

async function onDelete(r: Record<string, any>) {
  await userApi.deleteTagDef(r.id)
  message.success('已删除')
  fetchList()
}

onMounted(() => fetchList())
</script>
