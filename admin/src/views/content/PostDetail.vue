<template>
  <div class="detail-page">
    <div class="detail-header">
      <div><a-space><a-button @click="$router.back()"><arrow-left-outlined /></a-button><span class="page-title">帖子详情 #{{ post?.id }}</span><StatusTag v-if="post" :status="post.auditStatus" type="audit" /></a-space></div>
      <a-space>
        <a-button v-if="post?.auditStatus === 'pending'" type="primary" @click="onAudit('approve')">通过</a-button>
        <a-button v-if="post?.auditStatus === 'pending'" danger @click="onAudit('reject')">拒绝</a-button>
        <a-button @click="onToggleTop">{{ post?.isTop ? '取消置顶' : '置顶' }}</a-button>
      </a-space>
    </div>
    <div class="detail-section">
      <div class="section-title">帖子内容</div>
      <h3>{{ post?.title }}</h3>
      <p style="white-space:pre-wrap;margin:12px 0">{{ post?.content }}</p>
      <ImagePreview v-if="post?.images.length" :urls="post.images" :width="120" :height="120" />
    </div>
    <div class="detail-section">
      <div class="section-title">数据统计</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">浏览</span><span class="detail-value">{{ post?.viewCount }}</span></div>
        <div class="detail-item"><span class="detail-label">点赞</span><span class="detail-value">{{ post?.likeCount }}</span></div>
        <div class="detail-item"><span class="detail-label">评论</span><span class="detail-value">{{ post?.commentCount }}</span></div>
        <div class="detail-item"><span class="detail-label">分享</span><span class="detail-value">{{ post?.shareCount }}</span></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="section-title">操作日志</div>
      <OperationLogPanel :logs="logs" />
    </div>
    <AuditModal v-model:visible="auditVisible" :images="post?.images || []" @submit="onAuditSubmit" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import { contentApi } from '@/api/content'
import StatusTag from '@/components/common/StatusTag.vue'
import ImagePreview from '@/components/common/ImagePreview.vue'
import OperationLogPanel from '@/components/common/OperationLog.vue'
import AuditModal from '@/components/common/AuditModal.vue'
import type { Post } from '@/types/content'
import type { OperationLog as OperationLogItem } from '@/types/system'

const route = useRoute()
const post = ref<Post | null>(null)
const logs = ref<OperationLogItem[]>([])
const auditVisible = ref(false)

onMounted(async () => {
  const id = Number(route.params.id)
  const res = await contentApi.getPostDetail(id)
  post.value = res.data.data
  try { const logRes = await contentApi.getOperationLogs('post', id); logs.value = logRes.data.data || [] } catch { /* */ }
})

async function onAudit(_action: string) { auditVisible.value = true }
async function onAuditSubmit(action: 'approve' | 'reject', remark: string) {
  if (!post.value) return
  if (action === 'approve') await contentApi.approvePost(post.value.id, remark)
  else await contentApi.rejectPost(post.value.id, remark)
  message.success('操作成功'); auditVisible.value = false
  post.value.auditStatus = action === 'approve' ? 'approved' : 'rejected'
}
async function onToggleTop() { if (post.value) { await contentApi.toggleTop(post.value.id); post.value.isTop = !post.value.isTop; message.success('操作成功') } }
</script>
