<template>
  <div class="page-shell">
    <PageHeader title="称号管理" subtitle="管理区域称号、佩戴称号和运营素材" icon="Medal" />

    <el-tabs v-model="activeTab" class="identity-tabs" @tab-change="handleTabChange">
      <el-tab-pane v-if="false" label="徽章" name="badges">
        <div class="filter-bar">
          <el-input v-model="badgeFilters.keyword" placeholder="搜索徽章名称" clearable style="width: 220px" @keyup.enter="loadBadges" />
          <el-select v-model="badgeFilters.isEnabled" placeholder="启用状态" clearable style="width: 130px">
            <el-option label="已启用" value="1" />
            <el-option label="已停用" value="0" />
          </el-select>
          <el-button @click="loadBadges">刷新</el-button>
          <el-button type="primary" @click="openCreateBadge">新增徽章</el-button>
        </div>

        <el-table :data="badges" v-loading="loadingBadges" border stripe>
          <el-table-column label="图标" width="86">
            <template #default="{ row }">
              <el-image v-if="row.icon" :src="row.icon" class="badge-icon" fit="cover" />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="徽章名称" min-width="150" />
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column prop="condition" label="获取条件" min-width="220" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="row.isEnabled === false ? 'info' : 'success'" size="small">{{ row.isEnabled === false ? '停用' : '启用' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="90" />
          <el-table-column label="操作" width="210" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="editBadge(row)">编辑</el-button>
              <el-button size="small" type="success" @click="openGrantBadge(row)">发放</el-button>
              <el-button size="small" type="danger" @click="delBadge(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="称号" name="titles">
        <div class="filter-bar">
          <el-select v-model="titleFilters.regionId" filterable placeholder="称号范围" clearable style="width: 180px" @change="loadTitles">
            <el-option label="通用称号" value="__global__" />
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
          <el-input v-model="titleFilters.keyword" placeholder="搜索称号名称" clearable style="width: 220px" @keyup.enter="loadTitles" />
          <el-select v-model="titleFilters.isEnabled" placeholder="启用状态" clearable style="width: 130px">
            <el-option label="已启用" value="1" />
            <el-option label="已停用" value="0" />
          </el-select>
          <el-button @click="loadTitles">刷新</el-button>
          <el-button type="primary" @click="openCreateTitle">新增称号</el-button>
        </div>

        <el-table :data="titles" v-loading="loadingTitles" border stripe>
          <el-table-column label="展示" min-width="220">
            <template #default="{ row }">
              <div class="title-preview" :style="titleStyle(row)">
                <img v-if="row.image" :src="row.image" class="title-image" />
                <img v-else-if="row.icon" :src="row.icon" class="title-icon" />
                <span>{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
          <el-table-column prop="condition" label="获取条件" min-width="220" show-overflow-tooltip />
          <el-table-column label="类型" width="90">
            <template #default>称号</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="row.isEnabled === false ? 'info' : 'success'" size="small">{{ row.isEnabled === false ? '停用' : '启用' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="90" />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="editTitle(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="delTitle(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showBadgeDialog" :title="editingBadge ? '编辑徽章' : '新增徽章'" width="720px">
      <el-form :model="badgeForm" label-width="100px">
        <el-form-item label="徽章名称" required><el-input v-model="badgeForm.name" placeholder="请输入徽章名称" /></el-form-item>
        <el-form-item label="徽章图标" required>
          <ImageUploadBox v-model="badgeForm.icon" scene="badge-icon" shape="square" placeholder="上传徽章图标" tip="建议 160x160 或 200x200，PNG 透明底更好" :max-size="2" />
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="badgeForm.description" type="textarea" :rows="2" placeholder="徽章描述" /></el-form-item>
        <el-form-item label="获取规则">
          <ConditionBuilder v-model:type="badgeCondition.type" v-model:value="badgeCondition.value" v-model:custom="badgeCondition.custom" />
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="badgeForm.sortOrder" :min="0" controls-position="right" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="badgeForm.isEnabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBadgeDialog = false">取消</el-button>
        <el-button type="primary" @click="submitBadge">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showGrantDialog" title="发放徽章" width="520px">
      <el-form label-width="90px">
        <el-form-item label="徽章">
          <div class="grant-badge-row">
            <el-image v-if="grantBadge?.icon" :src="grantBadge.icon" class="badge-icon" fit="cover" />
            <span>{{ grantBadge?.name || '-' }}</span>
          </div>
        </el-form-item>
        <el-form-item label="用户ID" required>
          <el-input v-model="grantUserId" placeholder="请输入要发放的用户 ID" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGrantDialog = false">取消</el-button>
        <el-button type="primary" :loading="granting" @click="submitGrantBadge">确认发放</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showTitleDialog" :title="editingTitle ? '编辑称号' : '新增称号'" width="760px">
      <el-form :model="titleForm" label-width="110px">
        <el-form-item label="称号范围">
          <el-select v-model="titleForm.regionId" filterable placeholder="请选择区域">
            <el-option label="通用称号" value="__global__" />
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="称号名称" required><el-input v-model="titleForm.name" placeholder="例如：校园达人、优秀圈主" /></el-form-item>
        <el-form-item label="小图标">
          <ImageUploadBox v-model="titleForm.icon" scene="title-icon" shape="square" placeholder="上传称号小图标" tip="可选，建议 160x160" :max-size="2" />
        </el-form-item>
        <el-form-item label="称号牌图片">
          <ImageUploadBox v-model="titleForm.image" scene="title-image" shape="wide" placeholder="上传横向称号牌" tip="可选，建议 360x96；上传后优先展示图片牌" :max-size="3" />
        </el-form-item>
        <el-form-item label="文字样式">
          <div class="style-row">
            <el-color-picker v-model="titleForm.backgroundColor" show-alpha />
            <el-color-picker v-model="titleForm.textColor" />
            <el-color-picker v-model="titleForm.borderColor" show-alpha />
          </div>
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="titleForm.description" type="textarea" :rows="2" placeholder="称号说明" /></el-form-item>
        <el-form-item label="获取规则">
          <ConditionBuilder v-model:type="titleCondition.type" v-model:value="titleCondition.value" v-model:custom="titleCondition.custom" />
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="titleForm.sortOrder" :min="0" controls-position="right" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="titleForm.isEnabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTitleDialog = false">取消</el-button>
        <el-button type="primary" @click="submitTitle">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref, resolveComponent } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'

const conditionOptions = [
  { label: '后台手动发放', value: 'manual', build: () => '由运营后台手动发放' },
  { label: '完成学生认证', value: 'studentVerified', build: () => '完成学生认证后获得' },
  { label: '发布笔记数量', value: 'postCount', build: (value: number) => `发布 ${value} 篇笔记后获得` },
  { label: '评论互动数量', value: 'commentCount', build: (value: number) => `累计评论 ${value} 次后获得` },
  { label: '累计获赞数量', value: 'likeCount', build: (value: number) => `累计获得 ${value} 个赞后获得` },
  { label: '完成订单数量', value: 'orderCount', build: (value: number) => `完成 ${value} 笔订单后获得` },
  { label: '自定义条件', value: 'custom', build: (_value: number, custom: string) => custom.trim() || '请填写自定义获取条件' }
]

const ConditionBuilder = defineComponent({
  props: {
    type: { type: String, required: true },
    value: { type: Number, required: true },
    custom: { type: String, required: true }
  },
  emits: ['update:type', 'update:value', 'update:custom'],
  setup(props, { emit }) {
    const ElSelect = resolveComponent('el-select')
    const ElOption = resolveComponent('el-option')
    const ElInputNumber = resolveComponent('el-input-number')
    const ElInput = resolveComponent('el-input')
    const ElAlert = resolveComponent('el-alert')
    const needsNumber = computed(() => ['postCount', 'commentCount', 'likeCount', 'orderCount'].includes(props.type))
    const preview = computed(() => {
      const option = conditionOptions.find(item => item.value === props.type) || conditionOptions[0]
      return option.build(Math.max(1, Number(props.value || 1)), props.custom || '')
    })
    return () => h('div', { class: 'condition-builder' }, [
      h('div', { class: 'condition-row' }, [
        h(ElSelect, { modelValue: props.type, 'onUpdate:modelValue': (value: string) => emit('update:type', value), placeholder: '选择获取方式', style: 'width: 220px' }, () => conditionOptions.map(item => h(ElOption, { key: item.value, label: item.label, value: item.value }))),
        needsNumber.value ? h(ElInputNumber, { modelValue: props.value, 'onUpdate:modelValue': (value: number) => emit('update:value', value), min: 1, step: 1, controlsPosition: 'right', style: 'width: 160px' }) : null,
        props.type === 'custom' ? h(ElInput, { modelValue: props.custom, 'onUpdate:modelValue': (value: string) => emit('update:custom', value), placeholder: '例如：连续签到 7 天后获得', style: 'flex: 1' }) : null
      ]),
      h(ElAlert, { type: 'info', closable: false, showIcon: true, title: preview.value })
    ])
  }
})

const activeTab = ref('titles')
const loadingBadges = ref(false)
const loadingTitles = ref(false)
const badges = ref<any[]>([])
const titles = ref<any[]>([])
const regions = ref<any[]>([])
const badgeFilters = reactive({ keyword: '', isEnabled: '' })
const titleFilters = reactive({ regionId: '', keyword: '', type: 'title', isEnabled: '' })

const showBadgeDialog = ref(false)
const editingBadge = ref<any>(null)
const badgeForm = reactive({ name: '', icon: '', description: '', condition: '', sortOrder: 0, isEnabled: true })
const badgeCondition = reactive({ type: 'manual', value: 1, custom: '' })
const showGrantDialog = ref(false)
const grantBadge = ref<any>(null)
const grantUserId = ref('')
const granting = ref(false)

const showTitleDialog = ref(false)
const editingTitle = ref<any>(null)
const titleForm = reactive({
  regionId: '',
  name: '',
  icon: '',
  image: '',
  description: '',
  type: 'title',
  condition: '',
  backgroundColor: '#111111',
  textColor: '#ffffff',
  borderColor: 'rgba(0,0,0,0)',
  sortOrder: 0,
  isEnabled: true
})
const titleCondition = reactive({ type: 'manual', value: 1, custom: '' })

const normalizeRegionForSave = (value: string) => value === '__global__' ? null : value || null
const normalizeRegionForFilter = (value: string) => value || undefined

const loadRegions = async () => {
  try {
    const data: any = await request.get('/admin/user-levels/region-options')
    regions.value = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : Array.isArray(data?.data) ? data.data : []
  } catch {
    regions.value = []
  }
}

const buildCondition = (state: any) => {
  const option = conditionOptions.find(item => item.value === state.type) || conditionOptions[0]
  const value = option.build(Math.max(1, Number(state.value || 1)), state.custom || '')
  return value === '请填写自定义获取条件' ? '' : value
}

const syncConditionToBuilder = (condition: string, state: any) => {
  state.type = condition ? 'custom' : 'manual'
  state.value = 1
  state.custom = condition || ''
}

const loadBadges = async () => {
  loadingBadges.value = true
  try {
    const res: any = await request.get('/admin/marketing/badges', { params: { ...badgeFilters } })
    badges.value = res?.data?.list || res?.list || res || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载徽章失败')
  } finally {
    loadingBadges.value = false
  }
}

const loadTitles = async () => {
  loadingTitles.value = true
  try {
    const params = { ...titleFilters, regionId: normalizeRegionForFilter(titleFilters.regionId) }
    const res: any = await request.get('/admin/marketing/titles', { params })
    titles.value = res?.data?.list || res?.list || res || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载称号失败')
  } finally {
    loadingTitles.value = false
  }
}

const handleTabChange = () => {
  if (activeTab.value === 'titles') loadTitles()
}

const resetBadgeForm = () => {
  Object.assign(badgeForm, { name: '', icon: '', description: '', condition: '', sortOrder: 0, isEnabled: true })
  syncConditionToBuilder('', badgeCondition)
  editingBadge.value = null
}

const openCreateBadge = () => {
  resetBadgeForm()
  showBadgeDialog.value = true
}

const editBadge = (row: any) => {
  editingBadge.value = row
  Object.assign(badgeForm, {
    name: row.name || '',
    icon: row.icon || '',
    description: row.description || '',
    condition: row.condition || '',
    sortOrder: Number(row.sortOrder || 0),
    isEnabled: row.isEnabled !== false
  })
  syncConditionToBuilder(row.condition || '', badgeCondition)
  showBadgeDialog.value = true
}

const submitBadge = async () => {
  if (!badgeForm.name.trim()) { ElMessage.warning('请输入徽章名称'); return }
  if (!badgeForm.icon.trim()) { ElMessage.warning('请上传徽章图标'); return }
  badgeForm.condition = buildCondition(badgeCondition)
  if (!badgeForm.condition.trim()) { ElMessage.warning('请填写获取条件'); return }
  try {
    if (editingBadge.value) await request.put(`/admin/marketing/badges/${editingBadge.value.id}`, { ...badgeForm })
    else await request.post('/admin/marketing/badges', { ...badgeForm })
    ElMessage.success('保存成功')
    showBadgeDialog.value = false
    await loadBadges()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存徽章失败')
  }
}

const delBadge = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定删除徽章"${row.name}"？`, '确认', { type: 'warning' })
    await request.delete(`/admin/marketing/badges/${row.id}`)
    ElMessage.success('删除成功')
    await loadBadges()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '删除失败')
  }
}

const openGrantBadge = (row: any) => {
  grantBadge.value = row
  grantUserId.value = ''
  showGrantDialog.value = true
}

const submitGrantBadge = async () => {
  const userId = grantUserId.value.trim()
  if (!grantBadge.value?.id) return
  if (!userId) { ElMessage.warning('请输入用户ID'); return }
  granting.value = true
  try {
    await request.post(`/admin/marketing/badges/${grantBadge.value.id}/grant`, { userId })
    ElMessage.success('发放成功')
    showGrantDialog.value = false
  } catch (e: any) {
    ElMessage.error(e?.message || '发放失败')
  } finally {
    granting.value = false
  }
}

const resetTitleForm = () => {
  Object.assign(titleForm, {
    regionId: titleFilters.regionId || '',
    name: '',
    icon: '',
    image: '',
    description: '',
    type: 'title',
    condition: '',
    backgroundColor: '#111111',
    textColor: '#ffffff',
    borderColor: 'rgba(0,0,0,0)',
    sortOrder: 0,
    isEnabled: true
  })
  syncConditionToBuilder('', titleCondition)
  editingTitle.value = null
}

const openCreateTitle = () => {
  resetTitleForm()
  showTitleDialog.value = true
}

const editTitle = (row: any) => {
  editingTitle.value = row
  Object.assign(titleForm, {
    regionId: row.regionId || '__global__',
    name: row.name || '',
    icon: row.icon || '',
    image: row.image || '',
    description: row.description || '',
    type: row.type || 'title',
    condition: row.condition || '',
    backgroundColor: row.backgroundColor || '#111111',
    textColor: row.textColor || '#ffffff',
    borderColor: row.borderColor || 'rgba(0,0,0,0)',
    sortOrder: Number(row.sortOrder || 0),
    isEnabled: row.isEnabled !== false
  })
  syncConditionToBuilder(row.condition || '', titleCondition)
  showTitleDialog.value = true
}

const submitTitle = async () => {
  if (!titleForm.name.trim()) { ElMessage.warning('请输入称号名称'); return }
  titleForm.condition = buildCondition(titleCondition)
  if (!titleForm.condition.trim()) { ElMessage.warning('请填写获取条件'); return }
  const payload = { ...titleForm, type: 'title', regionId: normalizeRegionForSave(titleForm.regionId) }
  try {
    if (editingTitle.value) await request.put(`/admin/marketing/titles/${editingTitle.value.id}`, payload)
    else await request.post('/admin/marketing/titles', payload)
    ElMessage.success('保存成功')
    showTitleDialog.value = false
    await loadTitles()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存称号失败')
  }
}

const delTitle = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定删除称号"${row.name}"？`, '确认', { type: 'warning' })
    await request.delete(`/admin/marketing/titles/${row.id}`)
    ElMessage.success('删除成功')
    await loadTitles()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '删除失败')
  }
}

const titleStyle = (row: any) => ({
  backgroundColor: row.backgroundColor || '#111111',
  color: row.textColor || '#ffffff',
  borderColor: row.borderColor || 'transparent'
})

onMounted(async () => {
  await loadRegions()
  await loadTitles()
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.identity-tabs { margin-top: 16px; }
.filter-bar { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 16px; }
.badge-icon { width: 34px; height: 34px; border-radius: 6px; }
.title-preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
}
.title-icon { width: 18px; height: 18px; border-radius: 6px; object-fit: cover; }
.title-image { height: 28px; max-width: 150px; object-fit: contain; }
.condition-builder { display: flex; flex-direction: column; gap: 12px; width: 100%; }
.condition-row { display: flex; flex-wrap: wrap; gap: 12px; width: 100%; }
.style-row { display: flex; gap: 12px; align-items: center; }
.grant-badge-row { display: flex; align-items: center; gap: 10px; }
</style>
