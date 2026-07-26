<template>
  <div class="page-container">
    <PageHeader title="圈子话题" subtitle="管理圈子和话题，支持创建、编辑、审核、成员管理" icon="Connection">
      <template #actions>
        <el-button type="primary" @click="showCreateDialog = true">创建圈子</el-button>
        <el-button @click="loadCircles" :loading="loading">刷新</el-button>
      </template>
    </PageHeader>

    <div class="stats-row glass-card">
      <div class="stat-item">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">总圈子数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.active }}</div>
        <div class="stat-label">活跃圈子</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.totalMembers }}</div>
        <div class="stat-label">总成员数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.totalPosts }}</div>
        <div class="stat-label">总帖子数</div>
      </div>
    </div>

    <SearchPanel @search="loadCircles" @reset="resetFilters">
      <el-input v-model="filters.keyword" placeholder="搜索圈子名称" clearable style="width: 200px" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px">
        <el-option label="活跃" value="active" />
        <el-option label="已禁用" value="disabled" />
        <el-option label="已解散" value="dissolved" />
      </el-select>
      <el-select v-model="filters.joinType" placeholder="加入方式" clearable style="width: 120px">
        <el-option label="公开" value="OPEN" />
        <el-option label="需审核" value="APPLY" />
        <el-option label="邀请制" value="INVITE" />
      </el-select>
      <RegionSelector v-model="filters.regionId" width="160px" />
    </SearchPanel>

    <div class="glass-card" style="padding: 0;">
      <el-table :data="circles" v-loading="loading" border stripe>
        <el-table-column label="圈子信息" min-width="200">
          <template #default="{ row }">
            <div class="circle-cell">
              <el-avatar :size="36" :src="row.cover || row.icon">{{ (row.name || '?')[0] }}</el-avatar>
              <div>
                <div class="circle-name">{{ row.name }}</div>
                <div class="circle-desc">{{ row.description || '暂无简介' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="regionName" label="区域" width="100" />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag size="small">{{ row.joinType === 'OPEN' ? '公开' : row.joinType === 'APPLY' ? '需审核' : '邀请' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="成员" width="80" prop="memberCount" />
        <el-table-column label="帖子" width="80" prop="postCount" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <StatusTag :status="row.status || 'active'" />
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            <TimeText :time="row.createdAt" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="viewDetail(row)">详情</el-button>
            <el-button size="small" link @click="editCircle(row)">编辑</el-button>
            <el-button size="small" link @click="viewMembers(row)">成员</el-button>
            <el-dropdown trigger="click" @command="(cmd: string) => handleCommand(cmd, row)">
              <el-button size="small" link type="primary">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="row.status === 'active'" command="disable">禁用</el-dropdown-item>
                  <el-dropdown-item v-if="row.status === 'disabled'" command="enable">启用</el-dropdown-item>
                  <el-dropdown-item command="dissolve" divided>解散</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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
          @current-change="loadCircles"
          @size-change="loadCircles"
        />
      </div>
    </div>

    <!-- 创建/编辑圈子对话框 -->
    <el-dialog v-model="showCreateDialog" :title="editingCircle ? '编辑圈子' : '创建圈子'" width="600px">
      <el-form :model="circleForm" label-width="100px">
        <el-form-item label="圈子名称" required>
          <el-input v-model="circleForm.name" placeholder="请输入圈子名称" />
        </el-form-item>
        <el-form-item label="区域" required>
          <RegionSelector v-model="circleForm.regionId" width="100%" :show-all-option="false" />
        </el-form-item>
        <el-form-item label="加入方式">
          <el-select v-model="circleForm.joinType" style="width: 100%">
            <el-option label="公开" value="OPEN" />
            <el-option label="需审核" value="APPLY" />
            <el-option label="邀请制" value="INVITE" />
          </el-select>
        </el-form-item>
        <el-form-item label="圈子简介">
          <el-input v-model="circleForm.description" type="textarea" :rows="3" placeholder="请输入圈子简介" />
        </el-form-item>
        <el-form-item label="图标">
          <ImageUploadBox
            v-model="circleForm.icon"
            scene="admin"
            shape="square"
            :max-size="2"
            placeholder="上传圈子图标"
            tip="建议 200x200，支持 jpg/png/webp"
          />
        </el-form-item>
        <el-form-item label="封面">
          <ImageUploadBox
            v-model="circleForm.cover"
            scene="admin"
            shape="wide"
            :max-size="5"
            placeholder="上传圈子封面"
            tip="建议 750x350，列表与分享预览使用"
          />
        </el-form-item>
        <el-form-item label="最大成员数">
          <el-input-number v-model="circleForm.maxMembers" :min="1" :max="10000" />
        </el-form-item>
        <el-form-item label="付费加入">
          <el-switch v-model="circleForm.paidJoin" />
        </el-form-item>
        <el-form-item v-if="circleForm.paidJoin" label="价格">
          <el-input-number v-model="circleForm.price" :min="0" :precision="2" />
          <span style="margin-left: 8px; color: #64748b;">元</span>
        </el-form-item>
        <el-form-item label="邀请码">
          <el-input v-model="circleForm.inviteCode" placeholder="邀请码（可选）" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="circleForm.tagsInput" placeholder="多个标签用逗号分隔" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCircle" :loading="saving">{{ editingCircle ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- 圈子详情抽屉 -->
    <el-drawer v-model="showDetail" title="圈子详情" size="550px">
      <template v-if="detailData">
        <div class="detail-section">
          <h4>基本信息</h4>
          <div class="detail-row"><span class="label">名称：</span>{{ detailData.name }}</div>
          <div class="detail-row"><span class="label">区域：</span>{{ detailData.regionName || '-' }}</div>
          <div class="detail-row"><span class="label">加入方式：</span>{{ detailData.joinType === 'OPEN' ? '公开' : detailData.joinType === 'APPLY' ? '需审核' : '邀请制' }}</div>
          <div class="detail-row"><span class="label">状态：</span><StatusTag :status="detailData.status" /></div>
          <div class="detail-row"><span class="label">官方圈子：</span>{{ detailData.isOfficial ? '是' : '否' }}</div>
          <div class="detail-row"><span class="label">创建时间：</span>{{ detailData.createdAt }}</div>
        </div>
        <div class="detail-section">
          <h4>统计数据</h4>
          <div class="detail-stats">
            <div class="stat-box">
              <div class="stat-num">{{ detailData.memberCount || 0 }}</div>
              <div class="stat-label">成员数</div>
            </div>
            <div class="stat-box">
              <div class="stat-num">{{ detailData.postCount || 0 }}</div>
              <div class="stat-label">帖子数</div>
            </div>
            <div class="stat-box">
              <div class="stat-num">{{ detailData.maxMembers || 500 }}</div>
              <div class="stat-label">最大成员</div>
            </div>
          </div>
        </div>
        <div class="detail-section" v-if="detailData.description">
          <h4>简介</h4>
          <div class="detail-content">{{ detailData.description }}</div>
        </div>
        <div class="detail-section" v-if="detailData.paidJoin">
          <h4>付费信息</h4>
          <div class="detail-row"><span class="label">付费加入：</span>是</div>
          <div class="detail-row"><span class="label">价格：</span>{{ detailData.price }} 元</div>
        </div>
      </template>
    </el-drawer>

    <!-- 成员管理抽屉 -->
    <el-drawer v-model="showMembers" title="成员管理" size="600px">
      <div v-if="currentCircle" style="margin-bottom: 16px;">
        <el-tag type="primary">{{ currentCircle.name }}</el-tag>
        <span style="margin-left: 8px; color: #64748b;">共 {{ memberTotal }} 名成员</span>
      </div>
      <el-table :data="memberList" v-loading="loadingMembers" border stripe>
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="28" :src="row.user?.avatar">{{ (row.user?.nickname || '?')[0] }}</el-avatar>
              <span>{{ row.user?.nickname || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="80">
          <template #default="{ row }">
            <el-tag :type="row.role === 'OWNER' ? 'danger' : row.role === 'ADMIN' ? 'warning' : 'info'" size="small">
              {{ row.role === 'OWNER' ? '群主' : row.role === 'ADMIN' ? '管理员' : '成员' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="加入时间" width="160">
          <template #default="{ row }">
            <TimeText :time="row.joinAt" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="danger" v-if="row.role !== 'OWNER'" @click="removeMember(row)">踢出</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-pagination
          v-model:current-page="memberPage"
          v-model:page-size="memberPageSize"
          :total="memberTotal"
          :page-sizes="[50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadMembers"
          @size-change="loadMembers"
        />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'
import RegionSelector from '@/components/common/RegionSelector.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

const loading = ref(false)
const saving = ref(false)
const circles = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const showCreateDialog = ref(false)
const showDetail = ref(false)
const showMembers = ref(false)
const editingCircle = ref<any>(null)
const detailData = ref<any>(null)
const currentCircle = ref<any>(null)

const stats = reactive({
  total: 0,
  active: 0,
  totalMembers: 0,
  totalPosts: 0
})

const filters = reactive({
  keyword: '',
  status: '',
  joinType: '',
  regionId: ''
})

const circleForm = reactive({
  name: '',
  regionId: '',
  joinType: 'OPEN',
  description: '',
  icon: '',
  cover: '',
  maxMembers: 500,
  paidJoin: false,
  price: 0,
  inviteCode: '',
  tagsInput: ''
})

// 成员管理
const loadingMembers = ref(false)
const memberList = ref<any[]>([])
const memberTotal = ref(0)
const memberPage = ref(1)
const memberPageSize = ref(50)

const loadCircles = async () => {
  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      ...filters
    }
    const res: any = await request.get('/admin/circles', { params })
    circles.value = res.data?.list || res.list || []
    total.value = res.data?.total || res.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
    circles.value = []
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const res = await request.get('/admin/circles/stats')
    if (res.data) Object.assign(stats, res.data)
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.status = ''
  filters.joinType = ''
  filters.regionId = ''
  loadCircles()
}

const saveCircle = async () => {
  if (!circleForm.name || !circleForm.regionId) {
    ElMessage.warning('请填写必填项')
    return
  }
  saving.value = true
  try {
    const data: any = { ...circleForm }
    if (data.tagsInput) {
      data.tags = data.tagsInput.split(',').map((t: string) => t.trim()).filter(Boolean)
    }
    delete data.tagsInput
    if (editingCircle.value) {
      await request.put(`/admin/circles/${editingCircle.value.id}`, data)
      ElMessage.success('更新成功')
    } else {
      await request.post('/admin/circles', data)
      ElMessage.success('圈子创建成功')
    }
    showCreateDialog.value = false
    editingCircle.value = null
    resetForm()
    loadCircles()
    loadStats()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    saving.value = false
  }
}

const resetForm = () => {
  circleForm.name = ''
  circleForm.regionId = ''
  circleForm.joinType = 'OPEN'
  circleForm.description = ''
  circleForm.icon = ''
  circleForm.cover = ''
  circleForm.maxMembers = 500
  circleForm.paidJoin = false
  circleForm.price = 0
  circleForm.inviteCode = ''
  circleForm.tagsInput = ''
}

const editCircle = (row: any) => {
  editingCircle.value = row
  circleForm.name = row.name
  circleForm.regionId = row.regionId || ''
  circleForm.joinType = row.joinType || 'OPEN'
  circleForm.description = row.description || ''
  circleForm.icon = row.icon || ''
  circleForm.cover = row.cover || ''
  circleForm.maxMembers = row.maxMembers || 500
  circleForm.paidJoin = row.paidJoin || false
  circleForm.price = row.price || 0
  circleForm.inviteCode = row.inviteCode || ''
  circleForm.tagsInput = Array.isArray(row.tags) ? row.tags.join(', ') : ''
  showCreateDialog.value = true
}

const viewDetail = async (row: any) => {
  try {
    const res = await request.get(`/admin/circles/${row.id}`)
    detailData.value = res.data || res
    showDetail.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '获取详情失败')
  }
}

const viewMembers = (row: any) => {
  currentCircle.value = row
  memberPage.value = 1
  showMembers.value = true
  loadMembers()
}

const loadMembers = async () => {
  if (!currentCircle.value) return
  loadingMembers.value = true
  try {
    const res: any = await request.get(`/admin/circles/${currentCircle.value.id}/members`, {
      params: { page: memberPage.value, limit: memberPageSize.value }
    })
    memberList.value = res.data?.list || res.list || []
    memberTotal.value = res.data?.total || res.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载成员失败')
  } finally {
    loadingMembers.value = false
  }
}

const removeMember = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定踢出成员"${row.user?.nickname || ''}"？`, '确认')
    await request.delete(`/admin/circles/members/${row.id}`)
    ElMessage.success('已踢出')
    loadMembers()
    loadCircles()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

const handleCommand = async (cmd: string, row: any) => {
  try {
    if (cmd === 'disable') {
      await request.put(`/admin/circles/${row.id}/status`, { status: 'disabled' })
      ElMessage.success('已禁用')
    } else if (cmd === 'enable') {
      await request.put(`/admin/circles/${row.id}/status`, { status: 'active' })
      ElMessage.success('已启用')
    } else if (cmd === 'dissolve') {
      await ElMessageBox.confirm(`确定解散圈子"${row.name}"？`, '确认')
      await request.put(`/admin/circles/${row.id}/dissolve`)
      ElMessage.success('圈子已解散')
    }
    loadCircles()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

onMounted(() => {
  loadCircles()
  loadStats()
})
</script>

<style scoped>
.page-container { padding: 24px; }
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 20px;
  margin-bottom: 16px;
}
.stat-item { text-align: center; }
.stat-value { font-size: 24px; font-weight: 700; color: #1e293b; }
.stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }
.circle-cell { display: flex; align-items: center; gap: 10px; }
.circle-name { font-weight: 600; font-size: 14px; }
.circle-desc { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.user-cell { display: flex; align-items: center; gap: 8px; }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 16px; border: 1px solid rgba(255,255,255,0.8); }
.detail-section { margin-bottom: 20px; }
.detail-section h4 { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
.detail-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; }
.detail-row .label { color: #64748b; min-width: 80px; }
.detail-content { font-size: 14px; line-height: 1.6; }
.detail-stats { display: flex; gap: 24px; }
.stat-box { text-align: center; }
.stat-box .stat-num { font-size: 20px; font-weight: 700; color: #1e293b; }
.stat-box .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; }
</style>
