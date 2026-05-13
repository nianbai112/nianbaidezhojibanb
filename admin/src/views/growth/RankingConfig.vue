<template>
  <div class="page-container">
    <div class="page-header">
      <h2>榜单推荐中心</h2>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="榜单规则" name="rules">
        <div class="glass-card">
          <div class="card-header">
            <h3>榜单规则配置</h3>
            <el-button type="primary" size="small" @click="showCreateRule = true">添加规则</el-button>
          </div>
          <el-table :data="rules" v-loading="loadingRules">
            <el-table-column prop="name" label="规则名称" />
            <el-table-column prop="type" label="类型" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ getTypeLabel(row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="regionName" label="区域" width="120" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                  {{ row.status === 'active' ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button size="small" @click="editRule(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="deleteRule(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="推荐位配置" name="slots">
        <div class="glass-card">
          <div class="card-header">
            <h3>推荐位配置</h3>
            <el-button type="primary" size="small" @click="showCreateSlot = true">添加推荐位</el-button>
          </div>
          <el-table :data="slots" v-loading="loadingSlots">
            <el-table-column prop="name" label="推荐位名称" />
            <el-table-column prop="position" label="位置" width="120" />
            <el-table-column prop="limit" label="数量限制" width="100" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                  {{ row.status === 'active' ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button size="small" @click="editSlot(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'

const activeTab = ref('rules')
const loadingRules = ref(false)
const loadingSlots = ref(false)
const showCreateRule = ref(false)
const showCreateSlot = ref(false)
const rules = ref<any[]>([])
const slots = ref<any[]>([])

const getTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    user: '用户榜', post: '帖子榜', topic: '话题榜', circle: '圈子榜',
    merchant: '商家榜', rider: '骑手榜', product: '商品榜', activity: '活动榜',
  }
  return map[type] || type
}

const loadRules = async () => {
  loadingRules.value = true
  try {
    const res = await request.get('/admin/ranking/rules')
    rules.value = res.data?.list || []
  } catch (error) {
    console.error('加载规则失败', error)
    ElMessage.warning('加载排名规则失败')
  } finally {
    loadingRules.value = false
  }
}

const loadSlots = async () => {
  loadingSlots.value = true
  try {
    const res = await request.get('/admin/recommend/slots')
    slots.value = res.data?.list || []
  } catch (error) {
    console.error('加载推荐位失败', error)
    ElMessage.warning('加载推荐位列表失败')
  } finally {
    loadingSlots.value = false
  }
}

const editRule = async (rule: any) => {
  try {
    const { value: name } = await ElMessageBox.prompt('请输入规则名称', '编辑规则', {
      inputValue: rule.name,
      inputPlaceholder: '规则名称',
    })
    await request.put(`/admin/ranking/rules/${rule.id}`, { name })
    ElMessage.success('更新成功')
    loadRules()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('编辑失败')
  }
}
const deleteRule = async (rule: any) => {
  try {
    await ElMessageBox.confirm('确定删除此规则吗？', '确认删除', { type: 'warning' })
    await request.delete(`/admin/ranking/rules/${rule.id}`)
    ElMessage.success('规则已删除')
    loadRules()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('删除失败')
  }
}
const editSlot = async (slot: any) => {
  try {
    const { value: name } = await ElMessageBox.prompt('请输入槽位名称', '编辑槽位', {
      inputValue: slot.name,
      inputPlaceholder: '槽位名称',
    })
    await request.put(`/admin/ranking/slots/${slot.id}`, { name })
    ElMessage.success('更新成功')
    loadSlots()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('编辑失败')
  }
}

onMounted(() => {
  loadRules()
  loadSlots()
})
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-header h3 { margin: 0; }
</style>
