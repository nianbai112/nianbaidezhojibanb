<template>
  <div class="page-container">
    <div class="page-header">
      <h2>机器人管理</h2>
      <el-button type="primary" @click="showCreateDialog = true">创建机器人</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="bots" v-loading="loading">
        <el-table-column prop="avatar" label="头像" width="80">
          <template #default="{ row }">
            <el-avatar :src="row.avatar" :size="32" />
          </template>
        </el-table-column>
        <el-table-column prop="nickname" label="昵称" />
        <el-table-column prop="regionName" label="区域" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="small">
              {{ row.status === 'ACTIVE' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="editBot(row)">编辑</el-button>
            <el-button size="small" :type="row.status === 'ACTIVE' ? 'warning' : 'success'" @click="toggleStatus(row)">
              {{ row.status === 'ACTIVE' ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingBot ? '编辑机器人' : '创建机器人'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="昵称" required>
          <el-input v-model="form.nickname" placeholder="机器人昵称" />
        </el-form-item>
        <el-form-item label="头像">
          <el-input v-model="form.avatar" placeholder="头像URL" />
        </el-form-item>
        <el-form-item label="区域" required>
          <el-select v-model="form.regionId" style="width: 100%">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="人设">
          <el-select v-model="form.personaId" style="width: 100%" clearable>
            <el-option v-for="persona in personas" :key="persona.id" :label="persona.name" :value="persona.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitBot" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const submitting = ref(false)
const showCreateDialog = ref(false)
const editingBot = ref<any>(null)
const bots = ref<any[]>([])
const regions = ref<any[]>([])
const personas = ref<any[]>([])

const form = reactive({
  nickname: '',
  avatar: '',
  regionId: '',
  personaId: '',
})

const loadBots = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/ai/bots')
    bots.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载机器人失败')
  } finally {
    loading.value = false
  }
}

const loadRegions = async () => {
  try {
    const res = await request.get('/admin/regions')
    regions.value = res.data?.list || []
  } catch (error) {
    console.error('加载区域失败', error)
    ElMessage.warning('加载区域列表失败')
  }
}

const loadPersonas = async () => {
  try {
    const res = await request.get('/admin/ai/personas')
    personas.value = res.data?.list || []
  } catch (error) {
    console.error('加载人设失败', error)
    ElMessage.warning('加载人设列表失败')
  }
}

const editBot = (bot: any) => {
  editingBot.value = bot
  form.nickname = bot.nickname
  form.avatar = bot.avatar
  form.regionId = bot.regionId
  form.personaId = bot.botConfig?.personaId || ''
  showCreateDialog.value = true
}

const submitBot = async () => {
  submitting.value = true
  try {
    if (editingBot.value) {
      await request.put(`/admin/ai/bots/${editingBot.value.id}`, form)
      ElMessage.success('机器人已更新')
    } else {
      await request.post('/admin/ai/bots', form)
      ElMessage.success('机器人已创建')
    }
    showCreateDialog.value = false
    editingBot.value = null
    loadBots()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

const toggleStatus = async (bot: any) => {
  try {
    await request.put(`/admin/ai/bots/${bot.id}/status`, {
      status: bot.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
    })
    ElMessage.success('状态已更新')
    loadBots()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

onMounted(() => {
  loadBots()
  loadRegions()
  loadPersonas()
})
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>
