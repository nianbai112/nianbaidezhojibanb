<template>
  <div class="page-shell">
    <GlassPageHeader title="协议与条款" subtitle="统一维护用户协议、隐私政策、内容规范、付费服务和入驻规则">
      <template #actions>
        <el-button :loading="loading" @click="loadDocuments">刷新</el-button>
        <el-button type="primary" :loading="saving" @click="saveCurrent">保存协议</el-button>
      </template>
    </GlassPageHeader>

    <div class="agreement-toolbar glass-card">
      <el-input v-model="regionId" clearable placeholder="区域 ID，留空表示全局协议" />
      <el-button @click="loadDocuments">按区域查看</el-button>
      <el-tag effect="plain">{{ documents.length }} 类协议</el-tag>
      <span class="hint">区域未配置时，小程序会自动读取全局协议。</span>
    </div>

    <div class="agreement-layout" v-loading="loading">
      <div class="agreement-list glass-card">
        <button
          v-for="item in documents"
          :key="item.type"
          :class="{ active: current?.type === item.type }"
          @click="selectDocument(item)"
        >
          <span>
            <strong>{{ item.title }}</strong>
            <em>{{ item.scene || '通用' }}</em>
          </span>
          <el-tag size="small" :type="item.exists ? 'success' : 'info'" effect="plain">
            {{ item.inherited ? '继承全局' : item.exists ? '已配置' : '待配置' }}
          </el-tag>
        </button>
      </div>

      <div class="agreement-editor glass-card" v-if="form">
        <div class="editor-grid">
          <el-form-item label="协议标题">
            <el-input v-model="form.title" placeholder="请输入协议标题" />
          </el-form-item>
          <el-form-item label="版本号">
            <el-input v-model="form.version" placeholder="例如 1.0.0" />
          </el-form-item>
          <el-form-item label="使用场景">
            <el-input v-model="form.scene" placeholder="login / post / payment" />
          </el-form-item>
          <el-form-item label="状态">
            <div class="switch-line">
              <span>隐藏</span>
              <el-switch v-model="form.isShow" />
              <span>显示</span>
              <el-checkbox v-model="form.isRequired">必读/必选</el-checkbox>
            </div>
          </el-form-item>
        </div>
        <el-form-item label="协议内容">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="18"
            placeholder="请输入协议正文，支持 HTML 或纯文本"
          />
        </el-form-item>
      </div>
    </div>

    <div class="glass-card consent-card">
      <div class="consent-head">
        <div>
          <h3>用户确认记录</h3>
          <p>用于追踪关键协议版本是否已被用户确认。</p>
        </div>
        <el-button :loading="consentLoading" @click="loadConsents">刷新记录</el-button>
      </div>
      <el-table :data="consents" border stripe>
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">
            {{ row.user?.nickname || '用户' }}<span class="muted"> UID {{ row.user?.uid || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="协议类型" min-width="160" />
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column prop="regionId" label="区域" width="160" />
        <el-table-column prop="source" label="来源" width="110" />
        <el-table-column label="确认时间" width="180">
          <template #default="{ row }"><TimeText :time="row.acceptedAt" /></template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-pagination
          v-model:current-page="consentPage"
          v-model:page-size="consentPageSize"
          :total="consentTotal"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadConsents"
          @size-change="loadConsents"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import TimeText from '@/components/common/TimeText.vue'
import { request } from '@/api/request'

const loading = ref(false)
const saving = ref(false)
const consentLoading = ref(false)
const regionId = ref('')
const documents = ref<any[]>([])
const current = ref<any>(null)
const form = ref<any>(null)
const consents = ref<any[]>([])
const consentTotal = ref(0)
const consentPage = ref(1)
const consentPageSize = ref(20)

function selectDocument(item: any) {
  current.value = item
  form.value = {
    type: item.type,
    title: item.title,
    content: item.content || '',
    version: item.version || '1.0.0',
    scene: item.scene || '',
    isShow: item.isShow !== false,
    isRequired: item.isRequired !== false,
    regionId: regionId.value.trim() || item.regionId || null,
  }
}

async function loadDocuments() {
  loading.value = true
  try {
    const res: any = await request.get('/admin/agreement-documents', { params: { regionId: regionId.value.trim() || undefined } })
    documents.value = res.list || []
    const selected = current.value
      ? documents.value.find((item) => item.type === current.value.type)
      : documents.value[0]
    if (selected) selectDocument(selected)
  } catch (e: any) {
    documents.value = []
    form.value = null
    ElMessage.error(e?.message || '加载协议失败')
  } finally {
    loading.value = false
  }
}

async function saveCurrent() {
  if (!form.value?.type) return
  saving.value = true
  try {
    await request.put(`/admin/agreement-documents/${form.value.type}`, {
      ...form.value,
      regionId: regionId.value.trim() || null,
    })
    ElMessage.success('协议已保存')
    await loadDocuments()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function loadConsents() {
  consentLoading.value = true
  try {
    const res: any = await request.get('/admin/agreement-consents', {
      params: {
        page: consentPage.value,
        pageSize: consentPageSize.value,
        type: current.value?.type || undefined,
        regionId: regionId.value.trim() || undefined,
      },
    })
    consents.value = res.list || []
    consentTotal.value = res.total || 0
  } catch (e: any) {
    consents.value = []
    ElMessage.error(e?.message || '加载确认记录失败')
  } finally {
    consentLoading.value = false
  }
}

onMounted(async () => {
  await loadDocuments()
  await loadConsents()
})
</script>

<style scoped>
.agreement-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  margin-bottom: 16px;
}
.agreement-toolbar .el-input {
  max-width: 360px;
}
.hint,
.muted {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}
.agreement-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.agreement-list {
  padding: 10px;
  display: grid;
  gap: 8px;
}
.agreement-list button {
  border: 0;
  border-radius: 14px;
  background: transparent;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  color: #334155;
}
.agreement-list button.active {
  background: #eff6ff;
  color: #1f6fff;
}
.agreement-list strong {
  display: block;
  font-size: 14px;
  font-weight: 950;
}
.agreement-list em {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  font-style: normal;
  color: #64748b;
}
.agreement-editor {
  padding: 18px;
}
.editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
}
.switch-line {
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
}
.consent-card {
  margin-top: 16px;
  padding: 16px;
}
.consent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.consent-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 950;
  color: #0f172a;
}
.consent-head p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
}
.table-footer {
  padding-top: 14px;
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 1100px) {
  .agreement-layout {
    grid-template-columns: 1fr;
  }
  .editor-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .agreement-toolbar,
  .consent-head {
    align-items: stretch;
    flex-direction: column;
  }
  .agreement-toolbar .el-input {
    max-width: none;
  }
}
</style>
