<template>
  <div class="page-container">
    <a-page-header title="商品详情" @back="() => $router.back()">
      <template #extra>
        <a-space>
          <a-button v-if="detail?.status === 'ON_SALE'" v-permission="'secondhand:audit'" @click="onToggle">下架</a-button>
          <a-button v-else-if="detail?.status === 'OFFLINE'" v-permission="'secondhand:audit'" type="primary" @click="onToggle">上架</a-button>
          <a-popconfirm title="确定删除该商品？" @confirm="onDelete">
            <a-button danger v-permission="'secondhand:audit'">删除</a-button>
          </a-popconfirm>
        </a-space>
      </template>
    </a-page-header>

    <a-spin :spinning="loading">
      <a-row :gutter="24">
        <a-col :span="12">
          <a-card title="商品信息" size="small">
            <a-descriptions :column="1" size="small">
              <a-descriptions-item label="标题">{{ detail?.title }}</a-descriptions-item>
              <a-descriptions-item label="分类">{{ detail?.category }}</a-descriptions-item>
              <a-descriptions-item label="成色">{{ detail?.condition }}</a-descriptions-item>
              <a-descriptions-item label="售价">{{ detail?.price ? (Number(detail.price)).toFixed(2) : '-' }}</a-descriptions-item>
              <a-descriptions-item label="原价">{{ detail?.originPrice ? (Number(detail.originPrice)).toFixed(2) : '-' }}</a-descriptions-item>
              <a-descriptions-item label="状态">
                <a-tag :color="detail?.status === 'ON_SALE' ? 'green' : detail?.status === 'SOLD' ? 'blue' : 'default'">
                  {{ detail?.status === 'ON_SALE' ? '在售' : detail?.status === 'SOLD' ? '已售' : '下架' }}
                </a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="浏览量">{{ detail?.viewCount }}</a-descriptions-item>
              <a-descriptions-item label="发布时间">{{ detail?.createdAt }}</a-descriptions-item>
            </a-descriptions>
          </a-card>
          <a-card title="描述" size="small" class="mt-4">
            <p style="white-space:pre-wrap">{{ detail?.description || '无描述' }}</p>
          </a-card>
        </a-col>
        <a-col :span="12">
          <a-card title="卖家信息" size="small">
            <a-descriptions :column="1" size="small">
              <a-descriptions-item label="昵称">
                <a-space><a-avatar :src="detail?.user?.avatar" size="small" /><span>{{ detail?.user?.nickname || '-' }}</span></a-space>
              </a-descriptions-item>
              <a-descriptions-item label="用户ID">{{ detail?.userId }}</a-descriptions-item>
              <a-descriptions-item label="手机号">{{ detail?.user?.phone || '-' }}</a-descriptions-item>
              <a-descriptions-item label="区域">{{ detail?.region?.name || '-' }}</a-descriptions-item>
            </a-descriptions>
          </a-card>
          <a-card title="商品图片" size="small" class="mt-4">
            <a-image-preview-group>
              <a-space wrap>
                <a-image v-for="(img, i) in detail?.images" :key="i" :src="img" :width="120" :height="120" style="object-fit:cover;border-radius:4px" />
              </a-space>
              <span v-if="!detail?.images?.length" style="color:#999">暂无图片</span>
            </a-image-preview-group>
          </a-card>
        </a-col>
      </a-row>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { secondHandApi } from '@/api/secondHand'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const detail = ref<any>(null)

async function fetchDetail() {
  loading.value = true
  try {
    const res = await secondHandApi.getProductDetail(route.params.id as string)
    detail.value = (res.data as any).data || res.data
  } catch { /* ignore */ }
  finally { loading.value = false }
}

async function onToggle() {
  const ns = detail.value.status === 'ON_SALE' ? 'OFFLINE' : 'ON_SALE'
  await secondHandApi.updateStatus(detail.value.id, ns)
  message.success(ns === 'ON_SALE' ? '已上架' : '已下架')
  fetchDetail()
}

async function onDelete() {
  await secondHandApi.deleteProduct(detail.value.id)
  message.success('已删除')
  router.back()
}

onMounted(() => fetchDetail())
</script>
