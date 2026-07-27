<template>
  <div class="ai-page">
    <div class="page-head">
      <div>
        <div class="breadcrumb">AI 运营中心 / 人设管理</div>
        <h1>人设管理</h1>
        <p>人设决定机器人身份、语气、背景和内容边界，避免所有机器人说话都像同一个人。</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">创建人设</el-button>
    </div>

    <div class="persona-grid" v-loading="loading">
      <article v-for="persona in personas" :key="persona.id" class="persona-card">
        <div class="persona-top">
          <el-avatar :src="persona.avatar" :size="48">{{ persona.name?.slice(0, 1) }}</el-avatar>
          <div>
            <h3>{{ persona.name }}</h3>
            <span>{{ persona.style || '未设置风格' }} · {{ persona.ageRange || '不限年龄' }}</span>
          </div>
          <el-tag :type="persona.status === 'active' ? 'success' : 'info'" size="small">
            {{ persona.status === 'active' ? '启用' : '停用' }}
          </el-tag>
        </div>
        <p>{{ persona.bio || '暂无人设背景。' }}</p>
        <div class="persona-meta">
          <span>绑定机器人 {{ persona.botCount || 0 }}</span>
          <span>{{ formatTime(persona.createdAt) }}</span>
        </div>
        <el-button @click="editPersona(persona)">编辑人设</el-button>
      </article>
      <EmptyState v-if="!loading && !personas.length" description="暂无人设" />
    </div>

    <el-dialog v-model="dialogVisible" :title="editingPersona ? '编辑人设' : '创建人设'" width="760px">
      <el-form :model="form" label-position="top">
        <div class="dialog-grid">
          <div>
            <el-form-item label="头像">
              <ImageUploadBox v-model="form.avatar" scene="ai-persona-avatar" shape="square" placeholder="上传头像" tip="用于人设识别" :max-size="2" />
            </el-form-item>
          </div>
          <div class="dialog-fields">
            <div class="form-grid">
              <el-form-item label="名称" required>
                <el-input v-model="form.name" placeholder="如：热心学长" />
              </el-form-item>
              <el-form-item label="状态">
                <el-select v-model="form.status" style="width:100%">
                  <el-option label="启用" value="active" />
                  <el-option label="停用" value="disabled" />
                </el-select>
              </el-form-item>
              <el-form-item label="性别倾向">
                <el-select v-model="form.gender" style="width:100%">
                  <el-option label="不限" value="UNKNOWN" />
                  <el-option label="男" value="MALE" />
                  <el-option label="女" value="FEMALE" />
                </el-select>
              </el-form-item>
              <el-form-item label="年龄段">
                <el-input v-model="form.ageRange" placeholder="如：18-24" />
              </el-form-item>
            </div>
            <el-form-item label="说话风格">
              <el-input v-model="form.style" placeholder="如：真实、短句、校园口吻、不浮夸" />
            </el-form-item>
          </div>
        </div>
        <el-form-item label="背景故事">
          <el-input v-model="form.bio" type="textarea" :rows="3" placeholder="写清楚这个人设是谁、在哪个场景下出现、不能说什么。" />
        </el-form-item>
        <el-form-item label="系统提示词">
          <el-input v-model="form.prompt" type="textarea" :rows="5" placeholder="给模型的系统提示词，例如：你是东校区热心学长，回答要自然，不要营销腔。" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitPersona" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const editingPersona = ref<any>(null)
const personas = ref<any[]>([])

const form = reactive<any>({
  name: '',
  avatar: '',
  gender: 'UNKNOWN',
  ageRange: '',
  style: '',
  bio: '',
  prompt: '',
  status: 'active',
})

const loadPersonas = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/ai/personas', { params: { pageSize: 200 } })
    personas.value = (res?.data || res)?.list || []
  } catch (error: any) {
    ElMessage.error(error?.message || '加载人设失败')
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  Object.assign(form, { name: '', avatar: '', gender: 'UNKNOWN', ageRange: '', style: '', bio: '', prompt: '', status: 'active' })
}

const openCreate = () => {
  editingPersona.value = null
  resetForm()
  dialogVisible.value = true
}

const editPersona = (persona: any) => {
  editingPersona.value = persona
  Object.assign(form, {
    name: persona.name || '',
    avatar: persona.avatar || '',
    gender: persona.gender || 'UNKNOWN',
    ageRange: persona.ageRange || '',
    style: persona.style || '',
    bio: persona.bio || '',
    prompt: persona.prompt || '',
    status: persona.status || 'active',
  })
  dialogVisible.value = true
}

const submitPersona = async () => {
  if (!form.name?.trim()) {
    ElMessage.warning('请填写人设名称')
    return
  }
  submitting.value = true
  try {
    if (editingPersona.value) {
      await request.put(`/admin/ai/personas/${editingPersona.value.id}`, form)
      ElMessage.success('人设已更新')
    } else {
      await request.post('/admin/ai/personas', form)
      ElMessage.success('人设已创建')
    }
    dialogVisible.value = false
    await loadPersonas()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存人设失败')
  } finally {
    submitting.value = false
  }
}

const formatTime = (value: string) => value ? new Date(value).toLocaleDateString('zh-CN') : '-'

onMounted(loadPersonas)
</script>

<style scoped>
.ai-page {
  padding: 28px;
  color: var(--mx-text);
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.breadcrumb {
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 8px;
}

.page-head h1 {
  margin: 0;
  font-size: 32px;
}

.page-head p {
  margin: 8px 0 0;
  color: var(--mx-sub);
  font-size: 15px;
  font-weight: 700;
}

.persona-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.persona-card {
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  background: var(--mx-card);
  box-shadow: var(--mx-shadow);
  backdrop-filter: blur(14px);
  padding: 18px;
}

.persona-top {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.persona-top h3 {
  margin: 0 0 4px;
  font-size: 17px;
}

.persona-top span,
.persona-meta,
.persona-card p {
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 700;
}

.persona-card p {
  min-height: 54px;
  margin: 16px 0;
  line-height: 1.7;
}

.persona-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
}

.dialog-grid {
  display: grid;
  grid-template-columns: 190px 1fr;
  gap: 22px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 1280px) {
  .persona-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 760px) {
  .ai-page { padding: 18px; }
  .page-head { flex-direction: column; }
  .persona-grid,
  .dialog-grid,
  .form-grid { grid-template-columns: 1fr; }
}
</style>
