<template>
  <div class="page-shell">
    <PageHeader title="徽章称号" subtitle="管理用户徽章和称号" icon="Medal" />
    <div class="filter-bar">
      <el-button type="primary" @click="openCreateBadge">新增徽章</el-button>
    </div>
    <el-table :data="badges" v-loading="loading" border stripe>
      <el-table-column prop="name" label="徽章名称" min-width="150" />
      <el-table-column prop="icon" label="图标" width="80">
        <template #default="{ row }">
          <el-image v-if="row.icon" :src="row.icon" style="width: 30px; height: 30px" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column prop="condition" label="获取条件" min-width="220" show-overflow-tooltip />
      <el-table-column prop="sortOrder" label="排序" width="90" />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="editBadge(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="delBadge(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="showBadgeDialog" :title="editingBadge ? '编辑徽章' : '新增徽章'" width="720px" class="badge-dialog">
      <el-form :model="badgeForm" label-width="100px">
        <el-form-item label="徽章名称" required><el-input v-model="badgeForm.name" placeholder="请输入徽章名称" /></el-form-item>
        <el-form-item label="徽章图标">
          <ImageUploadBox
            v-model="badgeForm.icon"
            scene="badge-icon"
            shape="square"
            placeholder="上传徽章图标"
            tip="建议 160x160px，支持替换、预览、删除"
            :max-size="2"
          />
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="badgeForm.description" type="textarea" :rows="2" placeholder="徽章描述" /></el-form-item>
        <el-form-item label="获取规则">
          <div class="condition-builder">
            <div class="condition-row">
              <el-select v-model="conditionBuilder.type" placeholder="选择获取方式" style="width: 220px">
                <el-option v-for="option in conditionOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
              <el-input-number
                v-if="conditionNeedsNumber"
                v-model="conditionBuilder.value"
                :min="1"
                :step="1"
                controls-position="right"
                style="width: 160px"
              />
              <el-input
                v-if="conditionBuilder.type === 'custom'"
                v-model="conditionBuilder.custom"
                placeholder="例如：连续签到 7 天后获得"
                style="flex: 1"
              />
            </div>
            <el-alert
              type="info"
              :closable="false"
              show-icon
              :title="conditionPreview"
            />
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="badgeForm.sortOrder" :min="0" :step="1" controls-position="right" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBadgeDialog = false">取消</el-button>
        <el-button type="primary" @click="submitBadge">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const badges = ref<any[]>([])
const showBadgeDialog = ref(false)
const editingBadge = ref<any>(null)
const badgeForm = reactive({ name: '', icon: '', description: '', condition: '', sortOrder: 0 })
const conditionBuilder = reactive({ type: 'manual', value: 1, custom: '' })

const conditionOptions: Array<{ label: string; value: string; build: (value: number) => string }> = [
  { label: '后台手动发放', value: 'manual', build: () => '由运营后台手动发放' },
  { label: '完成学生认证', value: 'studentVerified', build: () => '完成学生认证后获得' },
  { label: '发布笔记数量', value: 'postCount', build: (value: number) => `发布 ${value} 篇笔记后获得` },
  { label: '评论互动数量', value: 'commentCount', build: (value: number) => `累计评论 ${value} 次后获得` },
  { label: '累计获赞数量', value: 'likeCount', build: (value: number) => `累计获得 ${value} 个赞后获得` },
  { label: '完成订单数量', value: 'orderCount', build: (value: number) => `完成 ${value} 笔订单后获得` },
  { label: '自定义条件', value: 'custom', build: () => conditionBuilder.custom.trim() || '请填写自定义获取条件' }
]

const conditionNeedsNumber = computed(() => ['postCount', 'commentCount', 'likeCount', 'orderCount'].includes(conditionBuilder.type))
const conditionPreview = computed(() => {
  const option = conditionOptions.find(item => item.value === conditionBuilder.type) || conditionOptions[0]
  return option.build(Math.max(1, Number(conditionBuilder.value || 1)))
})

const syncConditionFromBuilder = () => {
  const preview = conditionPreview.value
  badgeForm.condition = preview === '请填写自定义获取条件' ? '' : preview
}

const resetBadgeForm = () => {
  badgeForm.name = ''
  badgeForm.icon = ''
  badgeForm.description = ''
  badgeForm.condition = ''
  badgeForm.sortOrder = 0
  conditionBuilder.type = 'manual'
  conditionBuilder.value = 1
  conditionBuilder.custom = ''
  editingBadge.value = null
}

const openCreateBadge = () => {
  resetBadgeForm()
  showBadgeDialog.value = true
}

const editBadge = (row: any) => {
  editingBadge.value = row
  badgeForm.name = row.name
  badgeForm.icon = row.icon || ''
  badgeForm.description = row.description || ''
  badgeForm.condition = row.condition || ''
  badgeForm.sortOrder = Number(row.sortOrder || 0)
  conditionBuilder.type = row.condition ? 'custom' : 'manual'
  conditionBuilder.value = 1
  conditionBuilder.custom = row.condition || ''
  showBadgeDialog.value = true
}

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/marketing/badges')
    badges.value = res?.list || res?.data?.list || res || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const submitBadge = async () => {
  if (!badgeForm.name.trim()) { ElMessage.warning('请输入徽章名称'); return }
  syncConditionFromBuilder()
  if (!badgeForm.condition.trim()) { ElMessage.warning('请填写获取条件'); return }
  const payload = { ...badgeForm }
  try {
    if (editingBadge.value) {
      await request.put(`/admin/marketing/badges/${editingBadge.value.id}`, payload)
      ElMessage.success('更新成功')
    } else {
      await request.post('/admin/marketing/badges', payload)
      ElMessage.success('创建成功')
    }
    showBadgeDialog.value = false; resetBadgeForm(); loadData()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

const delBadge = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定删除该徽章？', '确认', { type: 'warning' })
    await request.delete(`/admin/marketing/badges/${row.id}`)
    ElMessage.success('删除成功'); loadData()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; }

.condition-builder {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.condition-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  width: 100%;
}
</style>
