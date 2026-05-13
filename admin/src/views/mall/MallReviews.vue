<template>
  <div class="page-container">
    <div class="page-header">
      <h2>评价管理</h2>
    </div>

    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索商品名称/评价内容"
        clearable
        style="width: 200px"
        @clear="loadReviews"
        @keyup.enter="loadReviews"
      />
      <el-select v-model="filters.status" placeholder="评价状态" clearable style="width: 120px" @change="loadReviews">
        <el-option label="正常" value="active" />
        <el-option label="已隐藏" value="hidden" />
      </el-select>
      <el-select v-model="filters.rating" placeholder="评分筛选" clearable style="width: 120px" @change="loadReviews">
        <el-option label="5星" :value="5" />
        <el-option label="4星" :value="4" />
        <el-option label="3星" :value="3" />
        <el-option label="2星" :value="2" />
        <el-option label="1星" :value="1" />
      </el-select>
      <el-button type="primary" @click="loadReviews">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="reviews" v-loading="loading" border stripe>
      <el-table-column prop="productName" label="商品名称" min-width="150" show-overflow-tooltip />
      <el-table-column prop="userName" label="用户" width="100" />
      <el-table-column prop="rating" label="评分" width="120">
        <template #default="{ row }">
          <el-rate v-model="row.rating" disabled :max="5" size="small" />
        </template>
      </el-table-column>
      <el-table-column prop="content" label="评价内容" min-width="200" show-overflow-tooltip />
      <el-table-column prop="images" label="图片" width="120">
        <template #default="{ row }">
          <div v-if="row.images?.length" class="review-images">
            <el-image
              v-for="(img, index) in row.images.slice(0, 3)"
              :key="index"
              :src="img"
              :preview-src-list="row.images"
              style="width: 40px; height: 40px; margin-right: 4px"
              fit="cover"
            />
            <span v-if="row.images.length > 3">+{{ row.images.length - 3 }}</span>
          </div>
          <span v-else>无</span>
        </template>
      </el-table-column>
      <el-table-column prop="reply" label="商家回复" width="150" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.reply || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? '正常' : '已隐藏' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="评价时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
          <el-button size="small" @click="replyReview(row)">回复</el-button>
          <el-button
            size="small"
            :type="row.status === 'active' ? 'warning' : 'success'"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '隐藏' : '显示' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadReviews"
        @current-change="loadReviews"
      />
    </div>

    <!-- Detail Dialog -->
    <el-dialog v-model="showDetailDialog" title="评价详情" width="600px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="商品名称" :span="2">{{ selectedReview?.productName }}</el-descriptions-item>
        <el-descriptions-item label="用户">{{ selectedReview?.userName }}</el-descriptions-item>
        <el-descriptions-item label="评分">
          <el-rate v-model="selectedReview.rating" disabled :max="5" />
        </el-descriptions-item>
        <el-descriptions-item label="评价内容" :span="2">{{ selectedReview?.content || '-' }}</el-descriptions-item>
        <el-descriptions-item label="评价图片" :span="2">
          <div v-if="selectedReview?.images?.length" class="review-images">
            <el-image
              v-for="(img, index) in selectedReview.images"
              :key="index"
              :src="img"
              :preview-src-list="selectedReview.images"
              style="width: 80px; height: 80px; margin-right: 8px"
              fit="cover"
            />
          </div>
          <span v-else>无</span>
        </el-descriptions-item>
        <el-descriptions-item label="商家回复" :span="2">{{ selectedReview?.reply || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="selectedReview?.status === 'active' ? 'success' : 'info'">
            {{ selectedReview?.status === 'active' ? '正常' : '已隐藏' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="评价时间">{{ formatDate(selectedReview?.createdAt) }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <!-- Reply Dialog -->
    <el-dialog v-model="showReplyDialog" title="回复评价" width="500px">
      <el-form :model="replyForm" label-width="80px">
        <el-form-item label="评价内容">
          <div>{{ replyingReview?.content || '无内容' }}</div>
        </el-form-item>
        <el-form-item label="回复内容" required>
          <el-input v-model="replyForm.reply" type="textarea" :rows="4" placeholder="请输入回复内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReplyDialog = false">取消</el-button>
        <el-button type="primary" @click="submitReply" :loading="submitting">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '@/api/request'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const reviews = ref<any[]>([])
const filters = ref({ keyword: '', status: '', rating: '' })
const pagination = ref({ page: 1, pageSize: 20, total: 0 })
const showDetailDialog = ref(false)
const showReplyDialog = ref(false)
const selectedReview = ref<any>(null)
const replyingReview = ref<any>(null)
const replyForm = ref({ reply: '' })
const submitting = ref(false)

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const loadReviews = async () => {
  loading.value = true
  try {
    const res = await request.get('/mall/reviews/admin/list', {
      params: {
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
        ...filters.value,
      },
    })
    const data = (res as any).data || res
    reviews.value = data.list || []
    pagination.value.total = data.total || 0
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.value = { keyword: '', status: '', rating: '' }
  loadReviews()
}

const viewDetail = (review: any) => {
  selectedReview.value = review
  showDetailDialog.value = true
}

const replyReview = (review: any) => {
  replyingReview.value = review
  replyForm.value.reply = review.reply || ''
  showReplyDialog.value = true
}

const submitReply = async () => {
  if (!replyForm.value.reply.trim()) {
    ElMessage.warning('请输入回复内容')
    return
  }
  submitting.value = true
  try {
    await request.put(`/mall/reviews/admin/${replyingReview.value.id}/reply`, { reply: replyForm.value.reply })
    ElMessage.success('回复成功')
    showReplyDialog.value = false
    loadReviews()
  } catch (error) {
    ElMessage.error('回复失败')
  } finally {
    submitting.value = false
  }
}

const toggleStatus = async (review: any) => {
  try {
    const newStatus = review.status === 'active' ? 'hidden' : 'active'
    await request.put(`/mall/reviews/admin/${review.id}/visible`, { status: newStatus })
    ElMessage.success(newStatus === 'active' ? '已显示' : '已隐藏')
    loadReviews()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

onMounted(() => {
  loadReviews()
})
</script>

<style scoped>
.page-container {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.review-images {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
</style>
