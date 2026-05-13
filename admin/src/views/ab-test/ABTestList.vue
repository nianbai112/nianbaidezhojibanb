<template>
  <div class="page-container">
    <div class="page-header">
      <h2>A/B 测试</h2>
      <el-button type="primary" @click="showCreateDialog = true">创建实验</el-button>
    </div>

    <div class="glass-card" style="padding: 20px;">
      <el-table :data="tests" v-loading="loading">
        <el-table-column prop="name" label="实验名称" min-width="150" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="targetMetric" label="目标指标" width="120" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button size="small" @click="viewResults(row)">结果</el-button>
            <el-button v-if="row.status === 'draft'" size="small" type="success" @click="startTest(row)">启动</el-button>
            <el-button v-if="row.status === 'running'" size="small" type="warning" @click="stopTest(row)">停止</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" title="创建A/B测试" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="实验名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="布局测试" value="layout" />
            <el-option label="信息流样式" value="feed_style" />
            <el-option label="弹窗广告" value="popup" />
            <el-option label="推荐算法" value="recommend" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标指标">
          <el-input v-model="form.targetMetric" placeholder="如：click_rate, conversion_rate" />
        </el-form-item>
        <el-form-item label="变体配置">
          <div v-for="(v, i) in form.variants" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px;">
            <el-input v-model="v.name" placeholder="变体名称" style="width: 120px" />
            <el-input-number v-model="v.weight" :min="1" :max="100" placeholder="权重" style="width: 100px" />
            <el-button v-if="form.variants.length > 2" type="danger" size="small" @click="form.variants.splice(i, 1)">删除</el-button>
          </div>
          <el-button size="small" @click="form.variants.push({ id: 'v' + (form.variants.length + 1), name: '', weight: 50, config: {} })">添加变体</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createTest">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showResultsDialog" title="实验结果" width="700px">
      <div v-if="testResults">
        <h4>{{ testResults.testName }}</h4>
        <p>状态: {{ statusLabel(testResults.status) }} | 总分配: {{ testResults.totalAssignments }} 人</p>
        <el-table :data="testResults.variants" style="margin-top: 16px;">
          <el-table-column prop="variantName" label="变体" width="120" />
          <el-table-column prop="assignments" label="分配人数" width="100" />
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const tests = ref([])
const showCreateDialog = ref(false)
const showResultsDialog = ref(false)
const testResults = ref(null)

const form = reactive({
  name: '',
  type: 'layout',
  targetMetric: '',
  variants: [
    { id: 'control', name: '对照组', weight: 50, config: {} },
    { id: 'variant_a', name: '实验组A', weight: 50, config: {} },
  ],
})

const statusType = (s: string) => ({ draft: 'info', running: 'success', paused: 'warning', completed: '' }[s] || 'info')
const statusLabel = (s: string) => ({ draft: '草稿', running: '运行中', paused: '已暂停', completed: '已完成' }[s] || s)

const loadTests = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/ab-tests')
    tests.value = res.data?.list || []
  } catch { tests.value = [] } finally { loading.value = false }
}

const createTest = async () => {
  try {
    await request.post('/admin/ab-tests', form)
    ElMessage.success('实验已创建')
    showCreateDialog.value = false
    loadTests()
  } catch { ElMessage.error('创建失败') }
}

const startTest = async (row: any) => {
  try {
    await request.put(`/admin/ab-tests/${row.id}/start`)
    ElMessage.success('实验已启动')
    loadTests()
  } catch { ElMessage.error('启动失败') }
}

const stopTest = async (row: any) => {
  try {
    await request.put(`/admin/ab-tests/${row.id}/stop`)
    ElMessage.success('实验已停止')
    loadTests()
  } catch { ElMessage.error('停止失败') }
}

const viewResults = async (row: any) => {
  try {
    const res = await request.get(`/admin/ab-tests/${row.id}/results`)
    testResults.value = res.data
    showResultsDialog.value = true
  } catch { ElMessage.error('获取结果失败') }
}

onMounted(() => loadTests())
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; }
</style>
