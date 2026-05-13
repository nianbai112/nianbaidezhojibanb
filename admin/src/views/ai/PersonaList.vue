<template>
  <div class="page-container">
    <div class="page-header">
      <h2>人设管理</h2>
      <el-button type="primary" @click="showCreateDialog = true">创建人设</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="personas" v-loading="loading">
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="personality" label="性格" width="120" />
        <el-table-column prop="speakingStyle" label="说话风格" width="120" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" @click="editPersona(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingPersona ? '编辑人设' : '创建人设'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="人设名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="人设描述" />
        </el-form-item>
        <el-form-item label="性格">
          <el-input v-model="form.personality" placeholder="如：活泼开朗" />
        </el-form-item>
        <el-form-item label="说话风格">
          <el-input v-model="form.speakingStyle" placeholder="如：幽默风趣" />
        </el-form-item>
        <el-form-item label="兴趣爱好">
          <el-input v-model="form.interests" placeholder="如：运动、音乐" />
        </el-form-item>
        <el-form-item label="背景故事">
          <el-input v-model="form.background" type="textarea" :rows="3" placeholder="人设背景" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitPersona" :loading="submitting">确定</el-button>
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
const editingPersona = ref<any>(null)
const personas = ref<any[]>([])

const form = reactive({
  name: '',
  description: '',
  personality: '',
  speakingStyle: '',
  interests: '',
  background: '',
})

const loadPersonas = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/ai/personas')
    personas.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载人设失败')
  } finally {
    loading.value = false
  }
}

const editPersona = (persona: any) => {
  editingPersona.value = persona
  form.name = persona.name
  form.description = persona.description
  form.personality = persona.personality
  form.speakingStyle = persona.speakingStyle
  form.interests = persona.interests
  form.background = persona.background
  showCreateDialog.value = true
}

const submitPersona = async () => {
  submitting.value = true
  try {
    if (editingPersona.value) {
      await request.put(`/admin/ai/personas/${editingPersona.value.id}`, form)
      ElMessage.success('人设已更新')
    } else {
      await request.post('/admin/ai/personas', form)
      ElMessage.success('人设已创建')
    }
    showCreateDialog.value = false
    editingPersona.value = null
    loadPersonas()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => { loadPersonas() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>
