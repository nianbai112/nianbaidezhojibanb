<template>
  <div class="detail-page">
    <div class="detail-header">
      <div>
        <a-space>
          <a-button @click="$router.back()"><arrow-left-outlined /></a-button>
          <span class="page-title">{{ area?.name || '区域详情' }}</span>
          <StatusTag v-if="area" :status="area.status === 1 ? 'active' : 'disabled'" type="user" />
        </a-space>
      </div>
      <a-space>
        <a-button @click="onEdit">编辑</a-button>
        <a-button type="primary" @click="onDecoration">首页装修</a-button>
      </a-space>
    </div>

    <div class="detail-section">
      <div class="section-title">基本信息</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">区域名称</span><span class="detail-value">{{ area?.name }}</span></div>
        <div class="detail-item"><span class="detail-label">区域编码</span><span class="detail-value">{{ area?.code }}</span></div>
        <div class="detail-item"><span class="detail-label">省市</span><span class="detail-value">{{ area?.province }} {{ area?.city }}</span></div>
        <div class="detail-item"><span class="detail-label">区/县</span><span class="detail-value">{{ area?.district }}</span></div>
        <div class="detail-item"><span class="detail-label">详细地址</span><span class="detail-value">{{ area?.address }}</span></div>
        <div class="detail-item"><span class="detail-label">学生认证限制</span><span class="detail-value">{{ area?.studentOnly ? '是' : '否' }}</span></div>
        <div class="detail-item"><span class="detail-label">服务半径</span><span class="detail-value">{{ area?.serviceRadius }} 米</span></div>
        <div class="detail-item"><span class="detail-label">距离限制</span><span class="detail-value">{{ area?.distanceLimit }} 米</span></div>
        <div class="detail-item"><span class="detail-label">排序</span><span class="detail-value">{{ area?.sort }}</span></div>
        <div class="detail-item"><span class="detail-label">创建时间</span><span class="detail-value">{{ formatTime(area?.createdAt || '') }}</span></div>
      </div>
    </div>

    <div class="detail-section">
      <div class="section-title">封面图</div>
      <a-image v-if="area?.coverImage" :src="area.coverImage" :width="300" style="border-radius:8px" />
    </div>

    <div class="detail-section">
      <div class="section-title">操作日志</div>
      <OperationLogPanel :logs="logs" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import { areaApi } from '@/api/area'
import { contentApi } from '@/api/content'
import StatusTag from '@/components/common/StatusTag.vue'
import OperationLogPanel from '@/components/common/OperationLog.vue'
import { formatTime } from '@/utils/format'
import type { Area } from '@/types/area'
import type { OperationLog as OperationLogItem } from '@/types/system'

const route = useRoute()
const router = useRouter()

const area = ref<Area | null>(null)
const logs = ref<OperationLogItem[]>([])

onMounted(async () => {
  const id = Number(route.params.id)
  const res = await areaApi.getDetail(id)
  area.value = res.data.data

  try {
    const logRes = await contentApi.getOperationLogs('area', id)
    logs.value = logRes.data.data || []
  } catch { /* ignore */ }
})

function onEdit() { /* 复用 AreaList 编辑逻辑 */ }
function onDecoration() { router.push(`/area/decoration/${route.params.id}`) }
</script>
