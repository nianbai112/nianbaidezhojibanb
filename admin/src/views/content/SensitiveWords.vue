<template>
  <div class="page-container">
    <PageHeader title="敏感词库" subtitle="管理敏感词过滤规则，支持批量导入导出" icon="Filter">
      <template #actions>
        <el-button type="primary" @click="showAddDialog = true">添加敏感词</el-button>
        <el-button @click="showBatchDialog = true">批量导入</el-button>
        <el-button @click="exportWords">导出</el-button>
        <el-button @click="loadWords">刷新</el-button>
      </template>
    </PageHeader>

    <div class="stats-row glass-card">
      <div class="stat-item">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">总敏感词</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.active }}</div>
        <div class="stat-label">启用中</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.categories }}</div>
        <div class="stat-label">分类数</div>
      </div>
    </div>

    <SearchPanel @search="loadWords" @reset="resetFilters">
      <el-input v-model="filters.keyword" placeholder="搜索敏感词" clearable style="width: 200px" />
      <el-select v-model="filters.category" placeholder="分类" clearable style="width: 120px">
        <el-option label="广告" value="ad" />
        <el-option label="色情" value="porn" />
        <el-option label="暴力" value="violence" />
        <el-option label="政治" value="politics" />
        <el-option label="其他" value="other" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px">
        <el-option label="启用" :value="1" />
        <el-option label="禁用" :value="0" />
      </el-select>
    </SearchPanel>

    <div class="glass-card" style="padding: 0;">
      <el-table :data="words" v-loading="loading" border stripe>
        <el-table-column type="selection" width="55" />
        <el-table-column prop="word" label="敏感词" min-width="150" />
        <el-table-column prop="category" label="分类" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ getCategoryLabel(row.category) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="级别" width="80">
          <template #default="{ row }">
            <el-tag :type="row.level === 'strict' ? 'danger' : row.level === 'audit' ? 'warning' : 'info'" size="small">
              {{ row.level === 'strict' ? '严格' : row.level === 'audit' ? '审核' : '提示' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="replaceWord" label="替换词" width="120" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="1" :inactive-value="0" @change="toggleStatus(row)" />
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            <TimeText :time="row.createdAt" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="editWord(row)">编辑</el-button>
            <el-button size="small" link type="danger" @click="deleteWord(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadWords"
          @size-change="loadWords"
        />
      </div>
    </div>

    <el-dialog v-model="showAddDialog" :title="editingWord ? '编辑敏感词' : '添加敏感词'" width="500px">
      <el-form :model="wordForm" label-width="80px">
        <el-form-item label="敏感词" required>
          <el-input v-model="wordForm.word" placeholder="请输入敏感词" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="wordForm.category" style="width: 100%">
            <el-option label="广告" value="ad" />
            <el-option label="色情" value="porn" />
            <el-option label="暴力" value="violence" />
            <el-option label="政治" value="politics" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="wordForm.level" style="width: 100%">
            <el-option label="严格（直接拦截）" value="strict" />
            <el-option label="审核（需要人工审核）" value="audit" />
            <el-option label="提示（仅提示用户）" value="tip" />
          </el-select>
        </el-form-item>
        <el-form-item label="替换词">
          <el-input v-model="wordForm.replaceWord" placeholder="替换词（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="saveWord" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBatchDialog" title="批量导入敏感词" width="500px">
      <el-form label-width="80px">
        <el-form-item label="敏感词">
          <el-input v-model="batchWords" type="textarea" :rows="8" placeholder="每行一个敏感词" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="batchCategory" style="width: 100%">
            <el-option label="广告" value="ad" />
            <el-option label="色情" value="porn" />
            <el-option label="暴力" value="violence" />
            <el-option label="政治" value="politics" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="batchLevel" style="width: 100%">
            <el-option label="严格（直接拦截）" value="strict" />
            <el-option label="审核（需要人工审核）" value="audit" />
            <el-option label="提示（仅提示用户）" value="tip" />
          </el-select>
        </el-form-item>
        <el-form-item label="替换词">
          <el-input v-model="batchReplaceWord" placeholder="统一替换词（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBatchDialog = false">取消</el-button>
        <el-button type="primary" @click="batchImport" :loading="importing">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import TimeText from '@/components/common/TimeText.vue'

const loading = ref(false)
const saving = ref(false)
const importing = ref(false)
const words = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const showAddDialog = ref(false)
const showBatchDialog = ref(false)
const editingWord = ref<any>(null)
const batchWords = ref('')
const batchCategory = ref('other')
const batchLevel = ref('audit')
const batchReplaceWord = ref('')

const stats = reactive({
  total: 0,
  active: 0,
  categories: 0
})

const filters = reactive({
  keyword: '',
  category: '',
  status: undefined as number | undefined
})

const wordForm = reactive({
  word: '',
  category: 'other',
  level: 'audit',
  replaceWord: ''
})

const categoryLabels: Record<string, string> = {
  ad: '广告',
  porn: '色情',
  violence: '暴力',
  politics: '政治',
  other: '其他'
}

const getCategoryLabel = (category: string) => categoryLabels[category] || category

const loadWords = async () => {
  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      ...filters
    }
    const res = await request.get('/admin/sensitive-words', { params })
    words.value = res.data?.list || []
    total.value = res.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
    words.value = []
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const res = await request.get('/admin/sensitive-words/stats')
    if (res.data) Object.assign(stats, res.data)
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.category = ''
  filters.status = undefined
  loadWords()
}

const saveWord = async () => {
  if (!wordForm.word) {
    ElMessage.warning('请输入敏感词')
    return
  }
  saving.value = true
  try {
    if (editingWord.value) {
      await request.put(`/admin/sensitive-words/${editingWord.value.id}`, wordForm)
      ElMessage.success('更新成功')
    } else {
      await request.post('/admin/sensitive-words', wordForm)
      ElMessage.success('添加成功')
    }
    showAddDialog.value = false
    editingWord.value = null
    loadWords()
    loadStats()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    saving.value = false
  }
}

const editWord = (row: any) => {
  editingWord.value = row
  Object.assign(wordForm, {
    word: row.word,
    category: row.category,
    level: row.level,
    replaceWord: row.replaceWord || ''
  })
  showAddDialog.value = true
}

const deleteWord = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定删除敏感词"${row.word}"？`, '确认')
    await request.delete(`/admin/sensitive-words/${row.id}`)
    ElMessage.success('删除成功')
    loadWords()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

const toggleStatus = async (row: any) => {
  try {
    await request.put(`/admin/sensitive-words/${row.id}`, { status: row.status })
    ElMessage.success('状态已更新')
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

const batchImport = async () => {
  if (!batchWords.value.trim()) {
    ElMessage.warning('请输入敏感词')
    return
  }
  importing.value = true
  try {
    await request.post('/admin/sensitive-words/batch', {
      words: batchWords.value.split('\n').filter(w => w.trim()),
      category: batchCategory.value,
      level: batchLevel.value,
      replaceWord: batchReplaceWord.value || undefined
    })
    ElMessage.success('导入成功')
    showBatchDialog.value = false
    batchWords.value = ''
    loadWords()
    loadStats()
  } catch (e: any) {
    ElMessage.error(e?.message || '导入失败')
  } finally {
    importing.value = false
  }
}

const exportWords = () => {
  const csv = ['敏感词,分类,级别,替换词,状态']
  words.value.forEach(w => {
    csv.push(`${w.word},${getCategoryLabel(w.category)},${w.level},${w.replaceWord || ''},${w.status ? '启用' : '禁用'}`)
  })
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '敏感词库.csv'
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  loadWords()
  loadStats()
})
</script>

<style scoped>
.page-container { padding: 24px; }
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 20px;
  margin-bottom: 16px;
}
.stat-item { text-align: center; }
.stat-value { font-size: 24px; font-weight: 700; color: #1e293b; }
.stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 14px; border: 1px solid rgba(255,255,255,0.8); }
</style>
