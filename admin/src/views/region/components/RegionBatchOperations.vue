<template>
  <el-drawer v-model="visible" title="批量操作" size="680px" direction="rtl" :before-close="handleClose">
    <div class="batch-container">
      <!-- 步骤1：选择区域 -->
      <div class="batch-section">
        <div class="section-title">
          <span class="step-badge">1</span>
          <span>选择区域</span>
          <el-button size="small" @click="selectAll">全选</el-button>
          <el-button size="small" @click="selectNone">取消全选</el-button>
        </div>
        <div class="region-select-list">
          <el-checkbox-group v-model="selectedRegionIds">
            <div v-for="region in regions" :key="region.id" class="region-checkbox-item">
              <el-checkbox :value="region.id" :label="region.id">
                <div class="region-checkbox-content">
                  <div class="region-logo-small" :style="region.logo ? {backgroundImage: `url(${region.logo})`, backgroundSize: 'cover'} : {}">
                    {{ region.logo ? '' : (region.name || '').slice(0, 1) }}
                  </div>
                  <div class="region-info-small">
                    <span class="region-name-small">{{ region.name }}</span>
                    <span class="region-code-small">{{ region.code || region.id }}</span>
                  </div>
                  <el-tag :type="region.isOpen !== false ? 'success' : 'info'" size="small">
                    {{ region.isOpen !== false ? '运营中' : '已关闭' }}
                  </el-tag>
                </div>
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </div>
        <div class="selected-count">已选择 {{ selectedRegionIds.length }} 个区域</div>
      </div>

      <!-- 步骤2：选择操作 -->
      <div class="batch-section">
        <div class="section-title">
          <span class="step-badge">2</span>
          <span>选择操作</span>
        </div>
        <div class="operation-list">
          <div v-for="op in operations" :key="op.key" class="operation-item" :class="{ active: selectedOperations.includes(op.key) }" @click="toggleOperation(op.key)">
            <div class="operation-icon" :style="{ background: op.color }">
              <el-icon><component :is="op.icon" /></el-icon>
            </div>
            <div class="operation-info">
              <div class="operation-name">{{ op.name }}</div>
              <div class="operation-desc">{{ op.description }}</div>
            </div>
            <el-checkbox v-model="selectedOperations" :value="op.key" @click.stop />
          </div>
        </div>
      </div>

      <!-- 步骤3：设置值 -->
      <div class="batch-section" v-if="selectedOperations.length > 0">
        <div class="section-title">
          <span class="step-badge">3</span>
          <span>设置值</span>
        </div>
        <div class="value-settings">
          <div v-for="opKey in selectedOperations" :key="opKey" class="value-item">
            <div class="value-label">{{ getOperationName(opKey) }}</div>
            <div class="value-control">
              <el-switch v-if="getOperationType(opKey) === 'switch'" v-model="operationValues[opKey]" />
              <el-select v-else-if="getOperationType(opKey) === 'select'" v-model="operationValues[opKey]" style="width: 200px">
                <el-option v-for="opt in getOperationOptions(opKey)" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
              <el-input-number v-else-if="getOperationType(opKey) === 'number'" v-model="operationValues[opKey]" :min="0" :max="100" style="width: 150px" />
            </div>
          </div>
        </div>
      </div>

      <!-- 执行按钮 -->
      <div class="batch-actions">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" :loading="executing" :disabled="selectedRegionIds.length === 0 || selectedOperations.length === 0" @click="executeBatch">
          执行批量操作
        </el-button>
      </div>

      <!-- 执行结果 -->
      <div v-if="executionResult" class="execution-result" :class="executionResult.success ? 'success' : 'error'">
        <div class="result-header">
          <el-icon v-if="executionResult.success"><SuccessFilled /></el-icon>
          <el-icon v-else><CircleCloseFilled /></el-icon>
          <span>{{ executionResult.success ? '操作成功' : '操作失败' }}</span>
        </div>
        <div class="result-detail">
          <div>成功：{{ executionResult.successCount }} 个区域</div>
          <div v-if="executionResult.failCount > 0">失败：{{ executionResult.failCount }} 个区域</div>
          <div v-if="executionResult.errors.length > 0" class="result-errors">
            <div v-for="(err, idx) in executionResult.errors" :key="idx" class="error-item">{{ err }}</div>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { SuccessFilled, CircleCloseFilled, Open, TurnOff, Star, ChatDotRound, User, Lock, Connection, Position } from '@element-plus/icons-vue'
import { fetchRegions, updateRegion } from '@/api/admin'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'success': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const regions = ref<any[]>([])
const selectedRegionIds = ref<string[]>([])
const selectedOperations = ref<string[]>([])
const executing = ref(false)
const executionResult = ref<{
  success: boolean
  successCount: number
  failCount: number
  errors: string[]
} | null>(null)

// 操作值
const operationValues = reactive<Record<string, any>>({
  isOpen: true,
  isHot: false,
  showHotList: true,
  privateMessageEnabled: true,
  contactsRequireStudentAuth: false,
  onlyStudentAuthUsers: false,
  groupChatEnabled: true,
  enableQrcodeFilter: false,
  hotFeaturedDisplay: 'mixed'
})

// 可用操作列表
const operations = [
  {
    key: 'isOpen',
    name: '运营状态',
    description: '启用或关闭区域',
    icon: Open,
    color: '#10b981',
    type: 'switch'
  },
  {
    key: 'isHot',
    name: '热门标识',
    description: '设置是否为热门区域',
    icon: Star,
    color: '#f59e0b',
    type: 'switch'
  },
  {
    key: 'showHotList',
    name: '热门榜单',
    description: '显示或隐藏首页热门榜单',
    icon: Star,
    color: '#8b5cf6',
    type: 'switch'
  },
  {
    key: 'privateMessageEnabled',
    name: '私信功能',
    description: '开启或关闭用户私信',
    icon: ChatDotRound,
    color: '#3b82f6',
    type: 'switch'
  },
  {
    key: 'contactsRequireStudentAuth',
    name: '通讯录认证',
    description: '查看通讯录是否需要学生认证',
    icon: Lock,
    color: '#6366f1',
    type: 'switch'
  },
  {
    key: 'onlyStudentAuthUsers',
    name: '仅认证访问',
    description: '是否仅允许认证学生访问',
    icon: Lock,
    color: '#ec4899',
    type: 'switch'
  },
  {
    key: 'groupChatEnabled',
    name: '群聊功能',
    description: '开启或关闭群聊创建',
    icon: Connection,
    color: '#14b8a6',
    type: 'switch'
  },
  {
    key: 'enableQrcodeFilter',
    name: '二维码过滤',
    description: '扫描二维码是否验证区域归属',
    icon: Position,
    color: '#f97316',
    type: 'switch'
  },
  {
    key: 'hotFeaturedDisplay',
    name: '精选显示模式',
    description: '设置热门精选的显示方式',
    icon: Star,
    color: '#0ea5e9',
    type: 'select',
    options: [
      { label: '不显示', value: 'none' },
      { label: '仅热门', value: 'hot' },
      { label: '仅精选', value: 'featured' },
      { label: '混合显示', value: 'mixed' }
    ]
  }
]

function handleClose() {
  visible.value = false
  // 重置状态
  selectedRegionIds.value = []
  selectedOperations.value = []
  executionResult.value = null
}

function selectAll() {
  selectedRegionIds.value = regions.value.map(r => r.id)
}

function selectNone() {
  selectedRegionIds.value = []
}

function toggleOperation(key: string) {
  const idx = selectedOperations.value.indexOf(key)
  if (idx === -1) {
    selectedOperations.value.push(key)
    // 设置默认值
    const op = operations.find(o => o.key === key)
    if (op?.type === 'switch') {
      operationValues[key] = true
    } else if (op?.type === 'select' && op.options?.length) {
      operationValues[key] = op.options[0].value
    }
  } else {
    selectedOperations.value.splice(idx, 1)
  }
}

function getOperationName(key: string): string {
  return operations.find(o => o.key === key)?.name || key
}

function getOperationType(key: string): string {
  return operations.find(o => o.key === key)?.type || 'switch'
}

function getOperationOptions(key: string): any[] {
  return operations.find(o => o.key === key)?.options || []
}

async function executeBatch() {
  if (selectedRegionIds.value.length === 0) {
    ElMessage.warning('请至少选择一个区域')
    return
  }
  if (selectedOperations.value.length === 0) {
    ElMessage.warning('请至少选择一个操作')
    return
  }

  await ElMessageBox.confirm(
    `确定要对 ${selectedRegionIds.value.length} 个区域执行 ${selectedOperations.value.length} 个操作吗？`,
    '确认批量操作',
    { type: 'warning' }
  )

  executing.value = true
  executionResult.value = null

  let successCount = 0
  let failCount = 0
  const errors: string[] = []

  try {
    // 构建更新数据
    const updateData: Record<string, any> = {}
    for (const opKey of selectedOperations.value) {
      updateData[opKey] = operationValues[opKey]
    }

    // 逐个更新区域
    for (const regionId of selectedRegionIds.value) {
      try {
        await updateRegion(regionId, updateData)
        successCount++
      } catch (e: any) {
        failCount++
        const region = regions.value.find(r => r.id === regionId)
        errors.push(`${region?.name || regionId}: ${e?.message || '更新失败'}`)
      }
    }

    executionResult.value = {
      success: failCount === 0,
      successCount,
      failCount,
      errors
    }

    if (failCount === 0) {
      ElMessage.success(`批量操作成功，共更新 ${successCount} 个区域`)
      emit('success')
    } else {
      ElMessage.warning(`批量操作完成，成功 ${successCount} 个，失败 ${failCount} 个`)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '批量操作失败')
  } finally {
    executing.value = false
  }
}

// 加载区域列表
async function loadRegions() {
  try {
    regions.value = await fetchRegions()
  } catch (e) {
    console.error('加载区域失败', e)
    ElMessage.warning('加载区域列表失败')
  }
}

// 监听抽屉打开
watch(visible, (val) => {
  if (val) {
    loadRegions()
  }
})
</script>

<style scoped lang="scss">
.batch-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 0 24px;
}

.batch-section {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  border: 1px solid var(--mx-border);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 16px;
  color: var(--mx-text);
}

.step-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #3b82f6;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}

.region-select-list {
  max-height: 300px;
  overflow-y: auto;
  padding-right: 8px;
}

.region-checkbox-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--el-fill-color);
}

.region-checkbox-item:last-child {
  border-bottom: none;
}

.region-checkbox-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.region-logo-small {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: linear-gradient(135deg, #dbeafe, #60a5fa);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #1f6fff;
  font-size: 14px;
  flex-shrink: 0;
}

.region-info-small {
  flex: 1;
  min-width: 0;
}

.region-name-small {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.region-code-small {
  display: block;
  font-size: 12px;
  color: var(--mx-muted);
}

.selected-count {
  margin-top: 12px;
  font-size: 13px;
  color: var(--mx-sub);
  text-align: right;
}

.operation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.operation-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid var(--mx-border);
  cursor: pointer;
  transition: all 0.2s;
}

.operation-item:hover {
  background: var(--mx-soft);
  border-color: var(--mx-border-strong);
}

.operation-item.active {
  background: var(--el-color-primary-light-9);
  border-color: #93c5fd;
}

.operation-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  flex-shrink: 0;
}

.operation-info {
  flex: 1;
  min-width: 0;
}

.operation-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-regular);
  margin-bottom: 2px;
}

.operation-desc {
  font-size: 12px;
  color: var(--mx-sub);
}

.value-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.value-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  background: var(--mx-soft);
  border-radius: 6px;
}

.value-label {
  font-weight: 500;
  font-size: 14px;
  color: var(--mx-sub);
}

.value-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.batch-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--mx-border);
}

.execution-result {
  border-radius: 10px;
  padding: 16px;
  margin-top: 8px;
}

.execution-result.success {
  background: var(--el-color-success-light-9);
  border: 1px solid #86efac;
}

.execution-result.error {
  background: var(--el-color-danger-light-9);
  border: 1px solid #fca5a5;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 8px;
}

.success .result-header {
  color: #16a34a;
}

.error .result-header {
  color: var(--el-color-danger);
}

.result-detail {
  font-size: 13px;
  color: var(--mx-sub);
  line-height: 1.6;
}

.result-errors {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.error-item {
  color: var(--el-color-danger);
  font-size: 12px;
  padding: 2px 0;
}

:deep(.el-checkbox__label) {
  width: 100%;
}

:deep(.el-drawer__body) {
  padding: 16px 20px;
}
</style>
