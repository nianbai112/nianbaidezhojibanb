<template>
  <div class="page-shell">
    <PageHeader title="商家评价" subtitle="管理商家评价" icon="Star" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索评价内容" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="全部" value="" />
        <el-option label="正常" value="active" />
        <el-option label="已隐藏" value="hidden" />
      </el-select>
      <el-select v-model="filters.rating" placeholder="评分" clearable style="width: 100px" @change="loadData">
        <el-option label="5星" value="5" />
        <el-option label="4星" value="4" />
        <el-option label="3星" value="3" />
        <el-option label="2星" value="2" />
        <el-option label="1星" value="1" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="user" label="用户" width="120">
        <template #default="{ row }">
          <div class="user-cell">
            <el-avatar v-if="row.userAvatar || row.user?.avatar" :src="row.userAvatar || row.user?.avatar" size="small" />
            <span>{{ row.userNickname || row.user?.nickname || row.userId }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="merchantName" label="商家" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.merchantName || row.merchant?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="productName" label="商品" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.productName || row.product?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="rating" label="评分" width="100">
        <template #default="{ row }"><el-rate v-model="row.rating" disabled :max="5" size="small" /></template>
      </el-table-column>
      <el-table-column prop="content" label="评价内容" min-width="180" show-overflow-tooltip />
      <el-table-column prop="images" label="图片" width="100">
        <template #default="{ row }">
          <el-image v-if="Array.isArray(row.images) && row.images.length" :src="row.images[0]" style="width: 40px; height: 40px; border-radius: 4px; cursor: pointer;" preview-teleported :preview-src-list="row.images" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="reply" label="商家回复" min-width="120" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status === 'active' ? '正常' : '已隐藏' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="评价时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="reply(row)">回复</el-button>
          <el-button size="small" :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">
            {{ row.status === 'active' ? '隐藏' : '恢复' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>

    <el-dialog v-model="showReplyDialog" title="回复评价" width="500px">
      <el-form label-width="80px">
        <el-form-item label="评价内容"><div>{{ replyingReview?.content || '无' }}</div></el-form-item>
        <el-form-item label="回复内容" required><el-input v-model="replyText" type="textarea" :rows="4" placeholder="请输入回复内容" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReplyDialog = false">取消</el-button>
        <el-button type="primary" @click="submitReply">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { getReviews, replyReview, updateReviewStatus } from '@/api/merchant'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', status: '', rating: '' })
const showReplyDialog = ref(false)
const replyingReview = ref<any>(null)
const replyText = ref('')

const formatDate = (d: any) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getReviews({ page: page.value, pageSize: pageSize.value, ...filters })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载评价失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '', rating: '' })
  page.value = 1
  loadData()
}

const reply = (row: any) => { replyingReview.value = row; replyText.value = row.reply || ''; showReplyDialog.value = true }

const submitReply = async () => {
  if (!replyText.value.trim()) { ElMessage.warning('请输入回复内容'); return }
  try {
    await replyReview(replyingReview.value.id, replyText.value)
    ElMessage.success('回复成功')
    showReplyDialog.value = false
    loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '回复失败')
  }
}

const toggleStatus = async (row: any) => {
  try {
    const isHide = row.status === 'active'
    const msg = isHide ? '确定隐藏该评价？' : '确定恢复显示该评价？'
    await ElMessageBox.confirm(msg, '确认', { type: 'warning' })
    await updateReviewStatus(row.id, isHide ? 'hidden' : 'active')
    ElMessage.success(isHide ? '已隐藏' : '已恢复')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.user-cell { display: flex; align-items: center; gap: 8px; }
</style>
