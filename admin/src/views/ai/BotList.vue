<template>
  <div class="ai-page">
    <div class="page-head">
      <div>
        <div class="breadcrumb">AI 运营中心 / 机器人管理</div>
        <h1>机器人管理</h1>
        <p>机器人是真正执行发帖、评论、互动和冷启动的账号池。</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">创建机器人</el-button>
    </div>

    <div class="filter-card">
      <el-input v-model="query.keyword" clearable placeholder="搜索机器人昵称" :prefix-icon="Search" />
      <el-select v-model="query.status" clearable placeholder="状态">
        <el-option label="启用" value="active" />
        <el-option label="暂停" value="paused" />
        <el-option label="禁用" value="disabled" />
      </el-select>
      <el-select v-model="query.regionId" clearable filterable placeholder="区域">
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="loadBots">查询</el-button>
      <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
    </div>

    <div class="table-card">
      <el-table :data="bots" v-loading="loading" empty-text="暂无机器人">
        <el-table-column label="机器人" min-width="240">
          <template #default="{ row }">
            <div class="bot-cell">
              <el-avatar :src="row.avatar" :size="42">{{ row.nickname?.slice(0, 1) }}</el-avatar>
              <div>
                <b>{{ row.nickname || '-' }}</b>
                <span>{{ row.personaName || '未绑定人设' }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="regionName" label="区域" min-width="140" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.botStatus)" size="small">{{ statusLabel(row.botStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="dailyLimit" label="日任务上限" width="120" />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editBot(row)">编辑</el-button>
            <el-button
              size="small"
              :type="row.botStatus === 'active' ? 'warning' : 'success'"
              @click="toggleStatus(row)"
            >
              {{ row.botStatus === 'active' ? '暂停' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <span>共 {{ total }} 个机器人</span>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          layout="sizes, prev, pager, next"
          :total="total"
          :page-sizes="[10, 20, 50]"
          @change="loadBots"
        />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingBot ? '编辑机器人' : '创建机器人'" width="720px">
      <el-form :model="form" label-position="top">
        <div class="dialog-grid">
          <div>
            <el-form-item label="头像">
              <ImageUploadBox v-model="form.avatar" scene="ai-bot-avatar" shape="square" placeholder="上传头像" tip="建议 200x200" :max-size="2" />
            </el-form-item>
          </div>
          <div class="dialog-fields">
            <el-form-item label="昵称" required>
              <el-input v-model="form.nickname" placeholder="如：校园小助手" />
            </el-form-item>
            <el-form-item label="区域">
              <el-select v-model="form.regionId" style="width: 100%" clearable filterable placeholder="不选则为全局机器人">
                <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="绑定人设">
              <el-select v-model="form.personaId" style="width: 100%" clearable filterable placeholder="选择机器人口吻">
                <el-option v-for="persona in personas" :key="persona.id" :label="persona.name" :value="persona.id" />
              </el-select>
            </el-form-item>
            <div class="inline-fields">
              <el-form-item label="日任务上限">
                <el-input-number v-model="form.dailyLimit" :min="1" :max="200" style="width: 100%" />
              </el-form-item>
              <el-form-item label="状态">
                <el-select v-model="form.status" style="width: 100%">
                  <el-option label="启用" value="active" />
                  <el-option label="暂停" value="paused" />
                  <el-option label="禁用" value="disabled" />
                </el-select>
              </el-form-item>
            </div>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitBot" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const editingBot = ref<any>(null)
const bots = ref<any[]>([])
const regions = ref<any[]>([])
const personas = ref<any[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  status: '',
  regionId: '',
})

const form = reactive<any>({
  nickname: '',
  avatar: '',
  regionId: '',
  personaId: '',
  dailyLimit: 10,
  status: 'active',
})

const pickPage = (res: any) => res?.data || res || { list: [], total: 0 }

const loadBots = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/ai/bots', { params: query })
    const page = pickPage(res)
    bots.value = page.list || []
    total.value = page.total || 0
  } catch (error: any) {
    ElMessage.error(error?.message || '加载机器人失败')
  } finally {
    loading.value = false
  }
}

const loadRegions = async () => {
  try {
    const res: any = await request.get('/admin/regions')
    regions.value = (res?.data || res)?.list || []
  } catch (error: any) {
    ElMessage.warning(error?.message || '加载区域列表失败')
  }
}

const loadPersonas = async () => {
  try {
    const res: any = await request.get('/admin/ai/personas', { params: { pageSize: 100 } })
    personas.value = (res?.data || res)?.list || []
  } catch (error: any) {
    ElMessage.warning(error?.message || '加载人设列表失败')
  }
}

const resetForm = () => {
  Object.assign(form, { nickname: '', avatar: '', regionId: '', personaId: '', dailyLimit: 10, status: 'active' })
}

const openCreate = () => {
  editingBot.value = null
  resetForm()
  dialogVisible.value = true
}

const editBot = (bot: any) => {
  editingBot.value = bot
  Object.assign(form, {
    nickname: bot.nickname || '',
    avatar: bot.avatar || '',
    regionId: bot.regionId || '',
    personaId: bot.personaId || '',
    dailyLimit: bot.dailyLimit || 10,
    status: bot.botStatus || bot.status || 'active',
  })
  dialogVisible.value = true
}

const submitBot = async () => {
  if (!form.nickname?.trim()) {
    ElMessage.warning('请填写机器人昵称')
    return
  }
  submitting.value = true
  try {
    if (editingBot.value) {
      await request.put(`/admin/ai/bots/${editingBot.value.id}`, form)
      ElMessage.success('机器人已更新')
    } else {
      await request.post('/admin/ai/bots', form)
      ElMessage.success('机器人已创建')
    }
    dialogVisible.value = false
    await loadBots()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存机器人失败')
  } finally {
    submitting.value = false
  }
}

const toggleStatus = async (bot: any) => {
  try {
    await request.put(`/admin/ai/bots/${bot.id}/status`, {
      status: bot.botStatus === 'active' ? 'paused' : 'active',
    })
    ElMessage.success('状态已更新')
    await loadBots()
  } catch (error: any) {
    ElMessage.error(error?.message || '更新状态失败')
  }
}

const resetQuery = () => {
  Object.assign(query, { page: 1, keyword: '', status: '', regionId: '' })
  loadBots()
}

const statusLabel = (status: string) => ({ active: '启用', paused: '暂停', disabled: '禁用' }[status] || status || '-')
const statusType = (status: string) => ({ active: 'success', paused: 'warning', disabled: 'info' }[status] || 'info')
const formatTime = (value: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'

onMounted(() => {
  loadBots()
  loadRegions()
  loadPersonas()
})
</script>

<style scoped>
.ai-page {
  padding: 28px;
  color: #10213d;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.breadcrumb {
  color: #6b7d99;
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
  color: #64748b;
  font-size: 15px;
  font-weight: 700;
}

.filter-card,
.table-card {
  border: 1px solid rgba(190, 207, 230, .72);
  border-radius: 18px;
  background: rgba(255, 255, 255, .78);
  box-shadow: 0 18px 44px rgba(69, 108, 168, .12);
  backdrop-filter: blur(14px);
}

.filter-card {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 160px 220px auto auto;
  gap: 12px;
  padding: 16px;
  margin-bottom: 18px;
}

.table-card {
  padding: 16px;
}

.bot-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bot-cell div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.bot-cell b {
  color: #0f172a;
}

.bot-cell span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
}

.dialog-grid {
  display: grid;
  grid-template-columns: 190px 1fr;
  gap: 22px;
}

.dialog-fields {
  min-width: 0;
}

.inline-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 1100px) {
  .filter-card {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .ai-page { padding: 18px; }
  .page-head { flex-direction: column; }
  .filter-card,
  .dialog-grid,
  .inline-fields { grid-template-columns: 1fr; }
}
</style>
