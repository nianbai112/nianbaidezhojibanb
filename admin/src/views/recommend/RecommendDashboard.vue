<template>
  <div class="page-container">
    <div class="page-header">
      <h2>推荐中心</h2>
      <el-button type="primary" @click="rebuildPool" :loading="rebuilding">重建推荐池</el-button>
    </div>

    <div class="dashboard-grid">
      <div class="stat-card glass-card" @click="$router.push('/recommend/strategy')">
        <el-icon :size="32" style="color: #3b82f6"><Setting /></el-icon>
        <div class="stat-info">
          <div class="stat-label">推荐策略</div>
          <div class="stat-desc">配置推荐算法权重和规则</div>
        </div>
      </div>
      <div class="stat-card glass-card" @click="$router.push('/recommend/pool')">
        <el-icon :size="32" style="color: #10b981"><Box /></el-icon>
        <div class="stat-info">
          <div class="stat-label">推荐池</div>
          <div class="stat-desc">查看和管理推荐内容池</div>
        </div>
      </div>
    </div>

    <div class="glass-card" style="padding: 20px; margin-top: 20px;">
      <h3>推荐池统计</h3>
      <el-table :data="poolStats" v-loading="loading">
        <el-table-column prop="targetType" label="类型" width="120" />
        <el-table-column prop="count" label="数量" width="120" />
        <el-table-column prop="avgScore" label="平均分" width="120" />
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting, Box } from '@element-plus/icons-vue'
import { request } from '@/api/request'

const loading = ref(false)
const rebuilding = ref(false)
const poolStats = ref([])

const loadPoolStats = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/recommend/pool', { params: { pageSize: 100 } })
    const list = res.data?.list || []
    const stats = new Map()
    list.forEach((item: any) => {
      if (!stats.has(item.targetType)) {
        stats.set(item.targetType, { count: 0, totalScore: 0 })
      }
      const s = stats.get(item.targetType)
      s.count++
      s.totalScore += item.score
    })
    poolStats.value = Array.from(stats.entries()).map(([type, s]: any) => ({
      targetType: type,
      count: s.count,
      avgScore: (s.totalScore / s.count).toFixed(1),
    }))
  } catch { poolStats.value = [] } finally { loading.value = false }
}

const rebuildPool = async () => {
  try {
    await ElMessageBox.confirm('确定要重建推荐池吗？这可能需要一些时间。', '确认')
    rebuilding.value = true
    await request.post('/admin/recommend/rebuild', { targetType: 'post' })
    ElMessage.success('推荐池重建完成')
    loadPoolStats()
  } catch { /* cancelled */ } finally { rebuilding.value = false }
}

onMounted(() => loadPoolStats())
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.dashboard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
.stat-card { display: flex; align-items: center; gap: 16px; padding: 20px; cursor: pointer; transition: transform 0.2s; }
.stat-card:hover { transform: translateY(-2px); }
.stat-label { font-weight: 600; font-size: 16px; }
.stat-desc { font-size: 12px; color: #666; margin-top: 4px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; }
</style>
