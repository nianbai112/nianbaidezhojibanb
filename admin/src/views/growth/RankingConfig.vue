<template>
  <div class="growth-page">
    <div class="growth-header">
      <div>
        <p class="eyebrow">营销增长 / 榜单推荐</p>
        <h2>榜单推荐中心</h2>
        <p>榜单规则写入 Ranking 表，推荐位写入推荐配置，避免前台读取空壳配置。</p>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="榜单规则" name="rules">
        <div class="toolbar-card">
          <el-select v-model="ruleFilters.type" clearable placeholder="榜单类型">
            <el-option label="帖子榜" value="post" />
            <el-option label="用户榜" value="user" />
            <el-option label="商家榜" value="merchant" />
            <el-option label="骑手榜" value="rider" />
            <el-option label="商品榜" value="product" />
            <el-option label="活动榜" value="activity" />
          </el-select>
          <el-select v-model="ruleFilters.regionId" clearable filterable placeholder="区域">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
          <el-button type="primary" @click="loadRules">查询</el-button>
          <el-button @click="resetRuleFilters">重置</el-button>
          <el-button type="primary" class="push-right" @click="openRuleDialog()">添加规则</el-button>
        </div>

        <div class="data-card">
          <el-table :data="rules" v-loading="loadingRules" empty-text="暂无真实榜单规则">
            <el-table-column label="规则名称" min-width="200">
              <template #default="{ row }">{{ row.title || row.name }}</template>
            </el-table-column>
            <el-table-column label="类型" width="110">
              <template #default="{ row }"><el-tag size="small">{{ typeLabel(row.type) }}</el-tag></template>
            </el-table-column>
            <el-table-column label="周期" width="100">
              <template #default="{ row }">{{ periodLabel(row.period) }}</template>
            </el-table-column>
            <el-table-column label="区域" min-width="140">
              <template #default="{ row }">{{ regionName(row.regionId) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="ruleStatus(row) === 'active' ? 'success' : 'info'" size="small">
                  {{ ruleStatus(row) === 'active' ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="180">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="170" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openRuleDialog(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="deleteRule(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="rulePagination.page"
              v-model:page-size="rulePagination.pageSize"
              :total="rulePagination.total"
              layout="total, sizes, prev, pager, next"
              @current-change="loadRules"
              @size-change="loadRules"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="推荐位配置" name="slots">
        <div class="toolbar-card">
          <el-button type="primary" class="push-right" @click="openSlotDialog()">添加推荐位</el-button>
        </div>
        <div class="data-card">
          <el-table :data="slots" v-loading="loadingSlots" empty-text="暂无推荐位配置">
            <el-table-column prop="name" label="推荐位名称" min-width="180" />
            <el-table-column prop="position" label="位置" width="140" />
            <el-table-column prop="limit" label="数量限制" width="110" />
            <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                  {{ row.status === 'active' ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openSlotDialog(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="ruleDialog.visible" :title="ruleDialog.id ? '编辑榜单规则' : '添加榜单规则'" width="720px">
      <el-form :model="ruleForm" label-width="100px">
        <el-form-item label="规则名称" required>
          <el-input v-model="ruleForm.title" placeholder="如：首页热门帖子榜" />
        </el-form-item>
        <div class="dialog-grid">
          <el-form-item label="榜单类型">
            <el-select v-model="ruleForm.type" style="width: 100%">
              <el-option label="帖子榜" value="post" />
              <el-option label="用户榜" value="user" />
              <el-option label="商家榜" value="merchant" />
              <el-option label="骑手榜" value="rider" />
              <el-option label="商品榜" value="product" />
              <el-option label="活动榜" value="activity" />
            </el-select>
          </el-form-item>
          <el-form-item label="周期">
            <el-select v-model="ruleForm.period" style="width: 100%">
              <el-option label="日榜" value="day" />
              <el-option label="周榜" value="week" />
              <el-option label="月榜" value="month" />
            </el-select>
          </el-form-item>
          <el-form-item label="区域">
            <el-select v-model="ruleForm.regionId" clearable filterable style="width: 100%">
              <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="启用状态">
            <el-switch v-model="ruleForm.enabled" />
          </el-form-item>
        </div>
        <el-form-item label="榜单数据">
          <el-input
            v-model="ruleForm.dataText"
            type="textarea"
            :rows="7"
            placeholder='可填 JSON，例如 {"limit":10,"sort":"heat"}；留空则创建空规则'
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submittingRule" @click="submitRule">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="slotDialog.visible" :title="slotDialog.id ? '编辑推荐位' : '添加推荐位'" width="620px">
      <el-form :model="slotForm" label-width="100px">
        <el-form-item label="推荐位名称" required>
          <el-input v-model="slotForm.name" placeholder="如：首页热门推荐" />
        </el-form-item>
        <div class="dialog-grid">
          <el-form-item label="位置">
            <el-input v-model="slotForm.position" placeholder="home / post_detail / merchant" />
          </el-form-item>
          <el-form-item label="数量限制">
            <el-input-number v-model="slotForm.limit" :min="1" :max="100" />
          </el-form-item>
          <el-form-item label="状态">
            <el-switch v-model="slotForm.enabled" />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="slotForm.remark" type="textarea" :rows="3" placeholder="运营用途说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="slotDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submittingSlot" @click="submitSlot">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import { errorMessage, formatTime, unwrapPage } from '../marketing/utils'

const activeTab = ref('rules')
const loadingRules = ref(false)
const loadingSlots = ref(false)
const submittingRule = ref(false)
const submittingSlot = ref(false)
const rules = ref<any[]>([])
const slots = ref<any[]>([])
const regions = ref<any[]>([])
const rulePagination = reactive({ page: 1, pageSize: 20, total: 0 })
const ruleFilters = reactive({ type: '', regionId: '' })

const ruleDialog = reactive({ visible: false, id: '' })
const ruleForm = reactive({
  title: '',
  type: 'post',
  period: 'week',
  regionId: '',
  enabled: true,
  dataText: '',
})
const slotDialog = reactive({ visible: false, id: '' })
const slotForm = reactive({
  name: '',
  position: 'home',
  limit: 10,
  enabled: true,
  remark: '',
})

function typeLabel(type: string) {
  const map: Record<string, string> = {
    user: '用户榜',
    post: '帖子榜',
    topic: '话题榜',
    circle: '圈子榜',
    merchant: '商家榜',
    rider: '骑手榜',
    product: '商品榜',
    activity: '活动榜',
  }
  return map[type] || type || '-'
}

function periodLabel(period: string) {
  const map: Record<string, string> = { day: '日榜', week: '周榜', month: '月榜' }
  return map[period] || period || '-'
}

function ruleStatus(row: any) {
  return row?.data?.status || row?.status || 'active'
}

function regionName(regionId: string) {
  if (!regionId) return '全部区域'
  return regions.value.find((item) => item.id === regionId)?.name || regionId
}

async function loadRegions() {
  try {
    regions.value = unwrapPage(await request.get('/admin/regions')).list
  } catch (error: any) {
    ElMessage.warning(errorMessage(error, '加载区域失败'))
  }
}

async function loadRules() {
  loadingRules.value = true
  try {
    const res = await request.get('/admin/ranking/rules', {
      params: {
        page: rulePagination.page,
        pageSize: rulePagination.pageSize,
        type: ruleFilters.type,
        regionId: ruleFilters.regionId,
      },
    })
    const page = unwrapPage(res)
    rules.value = page.list
    rulePagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载榜单规则失败'))
  } finally {
    loadingRules.value = false
  }
}

async function loadSlots() {
  loadingSlots.value = true
  try {
    slots.value = unwrapPage(await request.get('/admin/recommend/slots')).list
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载推荐位失败'))
  } finally {
    loadingSlots.value = false
  }
}

function resetRuleFilters() {
  ruleFilters.type = ''
  ruleFilters.regionId = ''
  rulePagination.page = 1
  loadRules()
}

function openRuleDialog(row?: any) {
  ruleDialog.id = row?.id || ''
  const data = row?.data || {}
  Object.assign(ruleForm, {
    title: row?.title || row?.name || '',
    type: row?.type || 'post',
    period: row?.period || 'week',
    regionId: row?.regionId || '',
    enabled: ruleStatus(row || {}) !== 'inactive',
    dataText: row ? JSON.stringify(data?.items ?? data, null, 2) : '',
  })
  ruleDialog.visible = true
}

function parseRuleData() {
  if (!ruleForm.dataText.trim()) return {}
  try {
    const parsed = JSON.parse(ruleForm.dataText)
    return Array.isArray(parsed) ? { items: parsed } : parsed
  } catch {
    throw new Error('榜单数据必须是合法 JSON')
  }
}

async function submitRule() {
  if (!ruleForm.title.trim()) {
    ElMessage.warning('请填写规则名称')
    return
  }
  submittingRule.value = true
  try {
    const payload = {
      title: ruleForm.title.trim(),
      type: ruleForm.type,
      period: ruleForm.period,
      regionId: ruleForm.regionId || null,
      status: ruleForm.enabled ? 'active' : 'inactive',
      data: parseRuleData(),
    }
    if (ruleDialog.id) {
      await request.put(`/admin/ranking/rules/${ruleDialog.id}`, payload)
      ElMessage.success('榜单规则已更新')
    } else {
      await request.post('/admin/ranking/rules', payload)
      ElMessage.success('榜单规则已创建')
    }
    ruleDialog.visible = false
    await loadRules()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, error?.message || '保存榜单规则失败'))
  } finally {
    submittingRule.value = false
  }
}

async function deleteRule(rule: any) {
  try {
    await ElMessageBox.confirm(`确定删除「${rule.title || rule.name}」吗？`, '确认删除', { type: 'warning' })
    await request.delete(`/admin/ranking/rules/${rule.id}`)
    ElMessage.success('规则已删除')
    await loadRules()
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(errorMessage(error, '删除失败'))
  }
}

function openSlotDialog(row?: any) {
  slotDialog.id = row?.id || ''
  Object.assign(slotForm, {
    name: row?.name || '',
    position: row?.position || 'home',
    limit: Number(row?.limit || 10),
    enabled: (row?.status || 'active') === 'active',
    remark: row?.remark || '',
  })
  slotDialog.visible = true
}

async function submitSlot() {
  if (!slotForm.name.trim()) {
    ElMessage.warning('请填写推荐位名称')
    return
  }
  submittingSlot.value = true
  try {
    const payload = {
      name: slotForm.name.trim(),
      position: slotForm.position,
      limit: slotForm.limit,
      status: slotForm.enabled ? 'active' : 'inactive',
      remark: slotForm.remark,
    }
    if (slotDialog.id) {
      await request.put(`/admin/recommend/slots/${slotDialog.id}`, payload)
      ElMessage.success('推荐位已更新')
    } else {
      await request.post('/admin/recommend/slots', payload)
      ElMessage.success('推荐位已创建')
    }
    slotDialog.visible = false
    await loadSlots()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '保存推荐位失败'))
  } finally {
    submittingSlot.value = false
  }
}

onMounted(() => {
  loadRegions()
  loadRules()
  loadSlots()
})
</script>

<style scoped>
.growth-page { padding: 24px; }
.growth-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.growth-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.growth-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.toolbar-card,
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 16px; box-shadow: 0 14px 36px rgba(37,99,235,.08); }
.toolbar-card { display: flex; gap: 12px; align-items: center; padding: 16px; margin-bottom: 18px; }
.toolbar-card .el-select { width: 180px; }
.push-right { margin-left: auto; }
.data-card { padding: 18px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
@media (max-width: 900px) {
  .toolbar-card { display: grid; grid-template-columns: 1fr; }
  .toolbar-card .el-select { width: 100%; }
  .push-right { margin-left: 0; }
  .dialog-grid { grid-template-columns: 1fr; }
}
</style>
