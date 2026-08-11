<template>
  <div class="page-container">
    <PageHeader title="评论抽奖" subtitle="查看帖子评论抽奖，支持手动开奖、取消和中奖名单核对" icon="Present">
      <template #actions>
        <el-button @click="loadList">刷新</el-button>
      </template>
    </PageHeader>

    <SearchPanel @search="handleSearch" @reset="resetFilters">
      <el-input v-model="filters.keyword" placeholder="搜索抽奖标题或帖子ID" clearable style="width: 240px" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 150px">
        <el-option label="未开奖" value="active" />
        <el-option label="已开奖" value="drawn" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
    </SearchPanel>

    <div class="glass-card table-card">
      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column label="抽奖" min-width="220">
          <template #default="{ row }">
            <div class="lottery-title">{{ row.lottery?.title || '-' }}</div>
            <div class="muted">ID {{ row.lottery?.id || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="所属帖子" min-width="260">
          <template #default="{ row }">
            <div class="post-title">{{ postTitle(row) }}</div>
            <div class="muted">{{ row.post?.user?.nickname || '未知作者' }} / {{ row.post?.region?.name || '未绑定区域' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="开奖时间" width="170">
          <template #default="{ row }">
            <TimeText :time="row.lottery?.drawAt || row.lottery?.draw_at" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.lottery?.raw_status || row.lottery?.status)" size="small">
              {{ statusText(row.lottery?.raw_status || row.lottery?.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="奖项" width="90">
          <template #default="{ row }">{{ row.prizes?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="中奖人" width="90">
          <template #default="{ row }">{{ row.winners?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button
              v-if="canDraw(row)"
              size="small"
              link
              type="success"
              @click="drawLottery(row)"
            >
              立即开奖
            </el-button>
            <el-button
              v-if="canCancel(row)"
              size="small"
              link
              type="danger"
              @click="cancelLottery(row)"
            >
              取消
            </el-button>
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
          @current-change="loadList"
          @size-change="loadList"
        />
      </div>
    </div>

    <el-drawer v-model="showDetail" title="评论抽奖详情" size="720px">
      <template v-if="detail">
        <div class="detail-section">
          <h4>基础信息</h4>
          <div class="detail-row"><span>抽奖标题：</span>{{ detail.lottery?.title || '-' }}</div>
          <div class="detail-row"><span>所属帖子：</span>{{ postTitle(detail) }}</div>
          <div class="detail-row"><span>帖子作者：</span>{{ detail.post?.user?.nickname || '-' }}</div>
          <div class="detail-row"><span>开奖时间：</span><TimeText :time="detail.lottery?.drawAt || detail.lottery?.draw_at" /></div>
          <div class="detail-row" v-if="detail.lottery?.drawnAt || detail.lottery?.drawn_at"><span>实际开奖：</span><TimeText :time="detail.lottery?.drawnAt || detail.lottery?.drawn_at" /></div>
          <div class="detail-row"><span>重复中奖：</span>{{ detail.lottery?.allowDuplicate || detail.lottery?.allow_duplicate ? '允许' : '不允许' }}</div>
          <div class="detail-row"><span>参与统计：</span>{{ detail.lottery?.participant_count || detail.lottery?.participantCount || 0 }} 人 / {{ detail.lottery?.candidate_comment_count || detail.lottery?.candidateCommentCount || 0 }} 条评论 / {{ detail.lottery?.winner_count || detail.lottery?.winnerCount || detail.winners?.length || 0 }} 个中奖名额</div>
          <div class="detail-row" v-if="detail.lottery?.draw_seed || detail.lottery?.drawSeed"><span>开奖种子：</span><code>{{ detail.lottery?.draw_seed || detail.lottery?.drawSeed }}</code></div>
          <div class="detail-row" v-if="detail.lottery?.cancelledReason"><span>取消原因：</span>{{ detail.lottery.cancelledReason }}</div>
        </div>

        <div class="detail-section">
          <h4>奖项</h4>
          <el-table :data="detail.prizes || []" size="small" border empty-text="暂无奖项">
            <el-table-column prop="name" label="奖项名称" />
            <el-table-column label="奖品描述" min-width="160">
              <template #default="{ row }">{{ row.reward_text || row.rewardText || '-' }}</template>
            </el-table-column>
            <el-table-column prop="count" label="中奖名额" width="120" />
            <el-table-column label="权重" width="90">
              <template #default="{ row }">{{ row.probability_weight || row.probabilityWeight || 100 }}</template>
            </el-table-column>
            <el-table-column label="排序" width="90">
              <template #default="{ row }">{{ row.sort_order ?? row.sortOrder ?? 0 }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="detail-section">
          <h4>中奖名单</h4>
          <el-table :data="detail.winners || []" size="small" border empty-text="暂未开奖或暂无中奖人">
            <el-table-column label="用户" width="180">
              <template #default="{ row }">
                <div class="user-cell">
                  <el-avatar :size="28" :src="row.user_avatar || row.user?.avatar">{{ (row.user_nickname || '?')[0] }}</el-avatar>
                  <span>{{ row.user_nickname || row.user?.nickname || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="prize_name" label="奖项" width="140" />
            <el-table-column label="评论ID" width="180">
              <template #default="{ row }">{{ row.comment_id || row.commentId || '-' }}</template>
            </el-table-column>
            <el-table-column prop="comment_content" label="中奖评论" show-overflow-tooltip />
            <el-table-column label="开奖时间" width="160">
              <template #default="{ row }"><TimeText :time="row.createdAt || row.created_at" /></template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </el-drawer>
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
const rows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const showDetail = ref(false)
const detail = ref<any>(null)

const filters = reactive({
  keyword: '',
  status: ''
})

const loadList = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/comments/lotteries', {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        keyword: filters.keyword,
        status: filters.status
      }
    })
    rows.value = res.data?.list || []
    total.value = res.data?.total || 0
  } catch (e: any) {
    rows.value = []
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  page.value = 1
  loadList()
}

const resetFilters = () => {
  filters.keyword = ''
  filters.status = ''
  page.value = 1
  loadList()
}

const statusText = (status = '') => {
  const map: Record<string, string> = {
    active: '未开奖',
    scheduled: '未开奖',
    processing: '开奖中',
    drawn: '已开奖',
    finished: '已开奖',
    cancelled: '已取消'
  }
  return map[status] || status || '-'
}

const statusType = (status = '') => {
  if (status === 'drawn' || status === 'finished') return 'success'
  if (status === 'cancelled') return 'info'
  if (status === 'processing') return 'warning'
  return ''
}

const postTitle = (row: any) => {
  const title = row.post?.title || ''
  const content = row.post?.content || ''
  return title || content.slice(0, 50) || row.lottery?.postId || '-'
}

const rawStatus = (row: any) => row.lottery?.raw_status || row.lottery?.status || ''
const canDraw = (row: any) => !['drawn', 'finished', 'cancelled'].includes(rawStatus(row)) && !(row.winners?.length)
const canCancel = (row: any) => !['drawn', 'finished', 'cancelled'].includes(rawStatus(row))

const openDetail = (row: any) => {
  detail.value = row
  showDetail.value = true
}

const drawLottery = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定现在为该评论抽奖开奖？系统会随机生成中奖名单并通知中奖用户。', '确认开奖')
    const res = await request.post(`/admin/comments/lotteries/${row.lottery.id}/draw`)
    ElMessage.success('开奖完成')
    detail.value = res.data || row
    loadList()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '开奖失败')
  }
}

const cancelLottery = async (row: any) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入取消原因', '取消抽奖', {
      inputValue: '后台取消',
      confirmButtonText: '确定取消',
      cancelButtonText: '返回'
    })
    await request.post(`/admin/comments/lotteries/${row.lottery.id}/cancel`, { reason: value || '后台取消' })
    ElMessage.success('抽奖已取消')
    loadList()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '取消失败')
  }
}

onMounted(loadList)
</script>

<style scoped>
.page-container { padding: 24px; }
.table-card { padding: 0; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 14px; border: 1px solid rgba(255,255,255,0.8); }
.lottery-title,
.post-title { font-size: 14px; font-weight: 600; color: #1f2937; line-height: 1.5; }
.muted { color: #94a3b8; font-size: 12px; margin-top: 4px; }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.detail-section { padding: 14px 0; border-bottom: 1px solid #e5e7eb; }
.detail-section h4 { margin: 0 0 10px; font-size: 15px; color: #111827; }
.detail-row { font-size: 13px; color: #334155; line-height: 2; }
.detail-row span { color: #64748b; }
.user-cell { display: flex; align-items: center; gap: 8px; }
</style>
