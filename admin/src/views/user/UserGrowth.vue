<template>
  <div class="page-shell growth-page">
    <PageHeader title="成长中心" subtitle="按区域配置成长等级、升级奖励和用户成长流水" icon="Trophy" />

    <div class="toolbar">
      <el-select v-model="selectedRegionId" filterable placeholder="选择区域" style="width: 220px" @change="reloadAll">
        <el-option label="通用等级模板" value="__global__" />
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-input v-model="keyword" clearable placeholder="搜索等级/用户" style="width: 240px" @keyup.enter="reloadAll" />
      <el-button @click="reloadAll">刷新</el-button>
      <el-button type="primary" @click="openLevelDialog()">新增等级</el-button>
      <el-button type="success" @click="openExperienceDialog()">手动加经验</el-button>
    </div>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="等级素材" name="levels">
        <el-table :data="levels" v-loading="loadingLevels" border stripe>
          <el-table-column label="等级" width="110">
            <template #default="{ row }">
              <strong>Lv.{{ row.levelNumber }}</strong>
            </template>
          </el-table-column>
          <el-table-column prop="levelName" label="等级名称" min-width="150" />
          <el-table-column prop="requiredExp" label="所需经验" width="120" />
          <el-table-column label="等级图标" width="130">
            <template #default="{ row }">
              <el-image v-if="row.levelIcon" :src="row.levelIcon" fit="contain" class="asset-thumb square" />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="横向等级牌" min-width="180">
            <template #default="{ row }">
              <el-image v-if="row.levelBadgeImage" :src="row.levelBadgeImage" fit="contain" class="asset-thumb wide" />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="已生效权益" min-width="260">
            <template #default="{ row }">
              <el-tag v-for="benefit in rowBenefits(row)" :key="benefit.id" size="small" :type="benefit.type === 'content_boost' ? 'warning' : benefit.type === 'title' ? '' : 'success'" class="benefit-tag">{{ benefit.name }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="范围" width="120">
            <template #default="{ row }">
              <el-tag size="small" :type="row.regionId ? 'success' : 'info'">{{ row.regionId ? (row.regionName || '区域等级') : '通用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-switch v-model="row.isActive" @change="toggleLevel(row)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openLevelDialog(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="deleteLevel(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="levelPage.page"
            v-model:page-size="levelPage.pageSize"
            :total="levelPage.total"
            layout="total, sizes, prev, pager, next"
            @current-change="loadLevels"
            @size-change="loadLevels"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="用户成长" name="users">
        <el-table :data="users" v-loading="loadingUsers" border stripe>
          <el-table-column label="用户" min-width="220">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar :src="row.avatar" :size="36">{{ row.nickname?.slice?.(0, 1) || '用' }}</el-avatar>
                <div>
                  <strong>{{ row.nickname || row.userId }}</strong>
                  <p>{{ row.phone || row.userId }}</p>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="当前等级" min-width="180">
            <template #default="{ row }">
              <div class="level-cell">
                <el-image v-if="row.currentLevel?.levelIcon" :src="row.currentLevel.levelIcon" fit="contain" class="level-icon" />
                <span>{{ row.currentLevelName }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="currentExp" label="当前经验" width="120" />
          <el-table-column label="升级进度" min-width="220">
            <template #default="{ row }">
              <el-progress :percentage="Number(row.progress || 0)" :stroke-width="8" />
              <small v-if="row.levelConfigIncomplete">请至少启用两个等级后再展示升级进度</small>
              <small v-else-if="!row.maxLevel">还差 {{ row.expToNextLevel || 0 }} EXP 到 {{ row.nextLevelName }}</small>
              <small v-else>已达最高等级</small>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="success" @click="openExperienceDialog(row.userId)">加经验</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="userPage.page"
            v-model:page-size="userPage.pageSize"
            :total="userPage.total"
            layout="total, sizes, prev, pager, next"
            @current-change="loadUsers"
            @size-change="loadUsers"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="经验记录" name="records">
        <el-table :data="records" v-loading="loadingRecords" border stripe>
          <el-table-column label="用户" min-width="190">
            <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
          </el-table-column>
          <el-table-column label="区域" min-width="150">
            <template #default="{ row }">{{ row.region?.name || regionName(row.regionId) || (row.regionId ? '区域' : '旧全局记录') }}</template>
          </el-table-column>
          <el-table-column label="变动" width="110">
            <template #default="{ row }">
              <el-tag :type="Number(row.changeAmount || 0) >= 0 ? 'success' : 'danger'">
                {{ Number(row.changeAmount || 0) >= 0 ? '+' : '' }}{{ row.changeAmount }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="经验" width="160">
            <template #default="{ row }">{{ row.beforeExp }} → {{ row.afterExp }}</template>
          </el-table-column>
          <el-table-column label="等级" min-width="190">
            <template #default="{ row }">{{ row.beforeLevel || '无等级' }} → {{ row.afterLevel || '无等级' }}</template>
          </el-table-column>
          <el-table-column label="来源" width="140">
            <template #default="{ row }">{{ sourceLabel(row.source) }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" min-width="180" show-overflow-tooltip />
          <el-table-column label="时间" width="180">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="recordPage.page"
            v-model:page-size="recordPage.pageSize"
            :total="recordPage.total"
            layout="total, sizes, prev, pager, next"
            @current-change="loadRecords"
            @size-change="loadRecords"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showLevelDialog" :title="editingLevel ? '编辑成长等级' : '新增成长等级'" width="820px">
      <el-form :model="levelForm" label-width="110px">
        <div class="form-grid">
          <el-form-item label="等级范围">
            <el-select v-model="levelForm.regionId" filterable @change="loadTitleOptions(levelForm.regionId === '__global__' ? '' : levelForm.regionId)">
              <el-option label="通用等级" value="__global__" />
              <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="等级序号" required>
            <el-input-number v-model="levelForm.levelNumber" :min="1" controls-position="right" />
          </el-form-item>
          <el-form-item label="等级名称" required>
            <el-input v-model="levelForm.levelName" maxlength="16" placeholder="例如：校园达人" />
          </el-form-item>
          <el-form-item label="所需经验" required>
            <el-input-number v-model="levelForm.requiredExp" :min="0" :step="50" controls-position="right" :disabled="Number(levelForm.levelNumber) === 1" />
            <div v-if="Number(levelForm.levelNumber) === 1" class="form-tip">Lv.1 是初始等级，所需经验固定为 0。</div>
          </el-form-item>
        </div>
        <el-form-item label="等级前缀">
          <el-input v-model="levelForm.levelPrefix" maxlength="12" placeholder="例如：成长等级" />
        </el-form-item>
        <div class="asset-grid">
          <el-form-item label="等级图标">
            <ImageUploadBox v-model="levelForm.levelIcon" scene="growth-level-icon" shape="square" placeholder="上传 Lv 等级图标" tip="小程序个人主页和成长中心显示，建议透明 PNG" :max-size="3" />
          </el-form-item>
          <el-form-item label="横向等级牌">
            <ImageUploadBox v-model="levelForm.levelBadgeImage" scene="growth-level-badge" shape="wide" placeholder="上传横向等级牌" tip="用于图一横向称号牌位置" :max-size="4" />
          </el-form-item>
        </div>
        <el-form-item label="等级说明">
          <el-input v-model="levelForm.levelDescription" type="textarea" :rows="2" maxlength="120" />
        </el-form-item>
        <el-form-item label="等级权益">
          <div class="benefit-editor">
            <div v-for="(benefit, index) in levelForm.levelBenefits" :key="benefit.id" class="benefit-editor-item">
              <div class="benefit-editor-head"><strong>权益 {{ index + 1 }}</strong><el-switch v-model="benefit.enabled" active-text="启用" inactive-text="停用" /><el-button v-if="benefit.type !== 'identity'" link type="danger" @click="removeBenefit(index)">删除</el-button></div>
              <div class="benefit-editor-grid">
                <el-select v-model="benefit.type" :disabled="benefit.type === 'identity'" @change="changeBenefitType(benefit)"><el-option v-for="option in benefitTypeOptions" :key="option.value" :label="option.label" :value="option.value" :disabled="option.value !== benefit.type && levelForm.levelBenefits.some(item => item.type === option.value)" /></el-select>
                <el-input v-model="benefit.name" maxlength="24" placeholder="前台权益名称" />
                <ImageUploadBox v-model="benefit.icon" scene="growth-benefit-icon" shape="square" placeholder="上传权益图标" tip="建议透明 PNG，独立于等级图标" :max-size="2" />
                <el-input v-model="benefit.description" maxlength="80" placeholder="前台权益说明" />
                <el-select v-if="benefit.type === 'title'" v-model="benefit.titleId" clearable filterable placeholder="选择升级自动发放的称号"><el-option v-for="title in titleOptions" :key="title.id" :label="title.name" :value="title.id" /></el-select>
                <el-input-number v-if="benefit.type === 'content_boost'" v-model="benefit.value" :min="0" :max="20" controls-position="right" />
              </div>
            </div>
            <el-button :disabled="levelForm.levelBenefits.length >= benefitTypeOptions.length" @click="addBenefit">添加权益</el-button>
            <div class="form-tip">称号和推荐加权会由服务端真实执行；未开发的业务权益不会出现在可选列表中。</div>
          </div>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="levelForm.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLevelDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingLevel" @click="submitLevel">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showExperienceDialog" title="手动加经验" width="520px">
      <el-form :model="experienceForm" label-width="90px">
        <el-form-item label="归属区域" required>
          <el-select v-model="experienceForm.regionId" filterable placeholder="请选择区域">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="用户ID" required>
          <el-input v-model="experienceForm.userId" placeholder="请输入用户 ID" clearable />
        </el-form-item>
        <el-form-item label="经验变动" required>
          <el-input-number v-model="experienceForm.changeAmount" :step="10" controls-position="right" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="experienceForm.reason" maxlength="40" placeholder="例如：运营奖励、违规扣减" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showExperienceDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingExperience" @click="submitExperience">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { request } from '@/api/request'

const activeTab = ref('levels')
const regions = ref<any[]>([])
const selectedRegionId = ref('__global__')
const keyword = ref('')

const levels = ref<any[]>([])
const titleOptions = ref<any[]>([])
const users = ref<any[]>([])
const records = ref<any[]>([])
const loadingLevels = ref(false)
const loadingUsers = ref(false)
const loadingRecords = ref(false)
const savingLevel = ref(false)
const savingExperience = ref(false)
const showLevelDialog = ref(false)
const showExperienceDialog = ref(false)
const editingLevel = ref<any>(null)

const levelPage = reactive({ page: 1, pageSize: 20, total: 0 })
const userPage = reactive({ page: 1, pageSize: 20, total: 0 })
const recordPage = reactive({ page: 1, pageSize: 20, total: 0 })

const levelForm = reactive({
  regionId: '__global__',
  levelNumber: 1,
  levelName: '',
  levelPrefix: '',
  requiredExp: 0,
  isActive: true,
  levelIcon: '',
  levelBadgeImage: '',
  levelDescription: '',
  levelTitleId: '',
  contentBoostWeight: 0,
  levelBenefits: [] as any[],
})

const benefitTypeOptions = [
  { value: 'identity', label: '等级身份展示', defaultName: '专属等级标识', defaultDescription: '在个人主页和成长中心展示' },
  { value: 'title', label: '专属等级称号', defaultName: '专属等级称号', defaultDescription: '升级后自动发放，可在我的称号中佩戴' },
  { value: 'content_boost', label: '内容推荐加权', defaultName: '优质内容加权', defaultDescription: '公开笔记在推荐流获得额外排序权重' },
]

const experienceForm = reactive({
  userId: '',
  regionId: '',
  changeAmount: 10,
  reason: '运营奖励',
})

function pageData(data: any) {
  return {
    list: Array.isArray(data?.list) ? data.list : Array.isArray(data) ? data : [],
    total: Number(data?.total ?? data?.count ?? (Array.isArray(data) ? data.length : 0)),
  }
}

function paramsWithRegion(page: any) {
  return {
    page: page.page,
    pageSize: page.pageSize,
    keyword: keyword.value || undefined,
    regionId: selectedRegionId.value,
  }
}

function normalizeRegionForSave(value: string) {
  return value === '__global__' ? null : value
}

function selectedRealRegionId() {
  return selectedRegionId.value === '__global__' ? '' : selectedRegionId.value
}

function regionName(regionId: string) {
  return regions.value.find(region => String(region.id) === String(regionId))?.name || ''
}

function sourceLabel(source: string) {
  const map: Record<string, string> = {
    admin_adjust: '后台调整',
    region_signin: '区域签到',
    publish_post: '发布内容',
    comment_post: '评论互动',
  }
  return map[source] || source || '手动/旧记录'
}

function formatTime(value: any) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

async function loadRegions() {
  const data: any = await request.get('/admin/user-levels/region-options')
  regions.value = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : Array.isArray(data?.data) ? data.data : []
  if (selectedRegionId.value === '__global__' && regions.value[0]?.id) {
    selectedRegionId.value = regions.value[0].id
  }
}

async function loadTitleOptions(regionId = selectedRealRegionId()) {
  const data: any = await request.get('/admin/user-levels/title-options', { params: { regionId: regionId || '__global__' } })
  titleOptions.value = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : Array.isArray(data?.data) ? data.data : []
}

async function loadLevels() {
  loadingLevels.value = true
  try {
    const data: any = await request.get('/admin/user-levels', { params: paramsWithRegion(levelPage) })
    const page = pageData(data)
    levels.value = page.list
    levelPage.total = page.total
  } finally {
    loadingLevels.value = false
  }
}

async function loadUsers() {
  loadingUsers.value = true
  try {
    const data: any = await request.get('/admin/user-levels-info', { params: paramsWithRegion(userPage) })
    const page = pageData(data)
    users.value = page.list
    userPage.total = page.total
  } finally {
    loadingUsers.value = false
  }
}

async function loadRecords() {
  loadingRecords.value = true
  try {
    const data: any = await request.get('/admin/user-experiences', { params: paramsWithRegion(recordPage) })
    const page = pageData(data)
    records.value = page.list
    recordPage.total = page.total
  } finally {
    loadingRecords.value = false
  }
}

function handleTabChange() {
  if (activeTab.value === 'levels') loadLevels()
  if (activeTab.value === 'users') loadUsers()
  if (activeTab.value === 'records') loadRecords()
}

function reloadAll() {
  levelPage.page = 1
  userPage.page = 1
  recordPage.page = 1
  handleTabChange()
}

function resetLevelForm() {
  Object.assign(levelForm, {
    regionId: selectedRegionId.value,
    levelNumber: 1,
    levelName: '',
    levelPrefix: '',
    requiredExp: 0,
    isActive: true,
    levelIcon: '',
    levelBadgeImage: '',
    levelDescription: '',
    levelTitleId: '',
    contentBoostWeight: 0,
    levelBenefits: [makeBenefit('identity')],
  })
}

function makeBenefit(type: string) {
  const option = benefitTypeOptions.find(item => item.value === type) || benefitTypeOptions[0]
  return { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, enabled: true, name: option.defaultName, description: option.defaultDescription, icon: '', titleId: '', value: 0 }
}

function parseBenefits(value: any, row: any = {}) {
  try {
    const list = Array.isArray(value) ? value : JSON.parse(value || '[]')
    if (Array.isArray(list) && list.length) return list.map((item, index) => ({ ...makeBenefit(item.type), ...item, id: item.id || `${item.type}-${index}` }))
  } catch (_) {}
  const list = [makeBenefit('identity')]
  if (row.levelTitleId) list.push({ ...makeBenefit('title'), titleId: row.levelTitleId })
  if (Number(row.contentBoostWeight || 0) > 0) list.push({ ...makeBenefit('content_boost'), value: Number(row.contentBoostWeight) })
  return list
}

function rowBenefits(row: any) {
  return parseBenefits(row.levelBenefits, row).filter((item: any) => item.enabled !== false).map((item: any) => ({ ...item, name: item.name || item.label || benefitTypeOptions.find(option => option.value === item.type)?.label || '等级权益' }))
}

function addBenefit() {
  const option = benefitTypeOptions.find(item => !levelForm.levelBenefits.some((benefit: any) => benefit.type === item.value))
  if (option) levelForm.levelBenefits.push(makeBenefit(option.value))
}

function removeBenefit(index: number) {
  levelForm.levelBenefits.splice(index, 1)
}

function changeBenefitType(benefit: any) {
  const next = makeBenefit(benefit.type)
  Object.assign(benefit, { ...next, id: benefit.id })
}

function openLevelDialog(row?: any) {
  editingLevel.value = row || null
  resetLevelForm()
  if (row) {
    Object.assign(levelForm, {
      regionId: row.regionId || '__global__',
      levelNumber: row.levelNumber,
      levelName: row.levelName,
      levelPrefix: row.levelPrefix || '',
      requiredExp: row.requiredExp || 0,
      isActive: row.isActive !== false,
      levelIcon: row.levelIcon || '',
      levelBadgeImage: row.levelBadgeImage || '',
      levelDescription: row.levelDescription || '',
      levelTitleId: row.levelTitleId || '',
      contentBoostWeight: Number(row.contentBoostWeight || 0),
      levelBenefits: parseBenefits(row.levelBenefits, row),
    })
  }
  loadTitleOptions(levelForm.regionId === '__global__' ? '' : levelForm.regionId)
  showLevelDialog.value = true
}

async function submitLevel() {
  if (!levelForm.levelName.trim()) {
    ElMessage.warning('请填写等级名称')
    return
  }
  savingLevel.value = true
  try {
    const payload = { ...levelForm, regionId: normalizeRegionForSave(levelForm.regionId) }
    if (Number(payload.levelNumber) === 1) payload.requiredExp = 0
    if (editingLevel.value?.id) await request.put(`/admin/user-levels/${editingLevel.value.id}`, payload)
    else await request.post('/admin/user-levels', payload)
    ElMessage.success('等级已保存')
    showLevelDialog.value = false
    await loadLevels()
  } finally {
    savingLevel.value = false
  }
}

async function toggleLevel(row: any) {
  await request.put(`/admin/user-levels/${row.id}`, { isActive: row.isActive })
  ElMessage.success(row.isActive ? '等级已启用' : '等级已停用')
}

async function deleteLevel(row: any) {
  await ElMessageBox.confirm(`确定删除 Lv.${row.levelNumber} ${row.levelName} 吗？`, '删除成长等级', { type: 'warning' })
  await request.delete(`/admin/user-levels/${row.id}`)
  ElMessage.success('等级已删除')
  await loadLevels()
}

function openExperienceDialog(userId?: string) {
  experienceForm.userId = typeof userId === 'string' ? userId : ''
  experienceForm.regionId = selectedRealRegionId()
  experienceForm.changeAmount = 10
  experienceForm.reason = '运营奖励'
  showExperienceDialog.value = true
}

async function submitExperience() {
  if (!experienceForm.userId.trim()) {
    ElMessage.warning('请填写用户 ID')
    return
  }
  if (!experienceForm.regionId) {
    ElMessage.warning('请先选择经验归属区域')
    return
  }
  savingExperience.value = true
  try {
    await request.post('/admin/user-experiences', { ...experienceForm })
    ElMessage.success('经验已调整')
    showExperienceDialog.value = false
    await Promise.all([loadUsers(), loadRecords()])
  } finally {
    savingExperience.value = false
  }
}

onMounted(async () => {
  await loadRegions()
  await loadTitleOptions()
  await loadLevels()
})
</script>

<style scoped>
.growth-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 16px;
  background: #fff;
  border: 1px solid #e6ebf2;
  border-radius: 6px;
}

.asset-thumb {
  display: block;
  background: #f7f9fc;
  border: 1px solid #edf1f7;
  border-radius: 6px;
}

.asset-thumb.square {
  width: 64px;
  height: 64px;
}

.asset-thumb.wide {
  width: 128px;
  height: 54px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0 0;
}

.user-cell,
.level-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-cell p {
  margin: 2px 0 0;
  color: #7d8ba3;
  font-size: 12px;
}

.level-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #f7f9fc;
}

.form-grid,
.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.asset-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.form-tip {
  margin-top: 6px;
  color: #8a96a8;
  font-size: 12px;
  line-height: 1.5;
}

.benefit-tag {
  margin-left: 6px;
}

.benefit-editor { width: 100%; }
.benefit-editor-item { margin-bottom: 12px; padding: 12px; border: 1px solid #e7ecf3; border-radius: 6px; background: #fbfcfe; }
.benefit-editor-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.benefit-editor-head .el-button { margin-left: auto; }
.benefit-editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: start; }

@media (max-width: 900px) {
  .form-grid,
  .asset-grid {
    grid-template-columns: 1fr;
  }
  .benefit-editor-grid { grid-template-columns: 1fr; }
}
</style>
