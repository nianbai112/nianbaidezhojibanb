<template>
  <div class="page-container">
    <div class="page-header">
      <h2>系统通知</h2>
      <el-button type="primary" @click="showSendDialog = true">发送通知</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="notifications" v-loading="loading">
        <el-table-column prop="title" label="标题" />
        <el-table-column prop="content" label="内容" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showSendDialog" title="发送通知" width="650px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="发送目标">
          <el-select v-model="form.targetType" style="width: 100%">
            <el-option label="全部用户" value="all" />
            <el-option label="指定区域" value="region" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.targetType === 'region'" label="选择区域">
          <el-select v-model="form.regionId" style="width: 100%">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="通知标题" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="form.content" type="textarea" :rows="4" placeholder="通知内容" />
        </el-form-item>
        <el-form-item label="通知渠道">
          <el-checkbox v-model="form.channelInApp" disabled>站内通知</el-checkbox>
          <el-checkbox v-model="form.channelWebSocket">实时推送</el-checkbox>
          <el-checkbox v-model="form.channelWechat">微信订阅消息</el-checkbox>
        </el-form-item>
        <el-form-item label="跳转类型">
          <el-select v-model="form.linkType" clearable style="width: 100%">
            <el-option label="无跳转" value="" />
            <el-option label="帖子" value="post" />
            <el-option label="用户" value="user" />
            <el-option label="订单" value="order" />
            <el-option label="自定义页面" value="page" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.linkType" label="跳转值">
          <el-input v-model="form.linkValue" placeholder="如帖子ID、页面路径等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSendDialog = false">取消</el-button>
        <el-button type="primary" @click="sendNotification" :loading="sending">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { sendNotification as apiSendNotification } from '@/api/admin'
import { request } from '@/api/request'

const loading = ref(false)
const sending = ref(false)
const showSendDialog = ref(false)
const notifications = ref<any[]>([])
const regions = ref<any[]>([])

const form = reactive({
  targetType: 'all',
  regionId: '',
  title: '',
  content: '',
  channelInApp: true,
  channelWebSocket: true,
  channelWechat: false,
  linkType: '',
  linkValue: '',
})

function formatTime(t: string) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN')
}

const loadNotifications = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/notifications')
    notifications.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载通知失败')
  } finally {
    loading.value = false
  }
}

const loadRegions = async () => {
  try {
    const res = await request.get('/admin/regions')
    regions.value = res.data?.list || []
  } catch (error) {
    console.error('加载区域失败', error)
    ElMessage.warning('加载区域列表失败')
  }
}

const sendNotification = async () => {
  if (!form.title || !form.content) {
    ElMessage.warning('请填写标题和内容')
    return
  }
  sending.value = true
  try {
    await apiSendNotification({
      title: form.title,
      content: form.content,
      regionId: form.targetType === 'region' ? form.regionId : undefined,
      linkType: form.linkType || undefined,
      linkValue: form.linkValue || undefined,
      channelMask: {
        inApp: form.channelInApp,
        websocket: form.channelWebSocket,
        wechatSubscribe: form.channelWechat,
        officialAccount: false,
      },
    })
    ElMessage.success('通知已发送')
    showSendDialog.value = false
    form.title = ''
    form.content = ''
    form.linkType = ''
    form.linkValue = ''
    loadNotifications()
  } catch (error: any) {
    ElMessage.error(error.message || '发送失败')
  } finally {
    sending.value = false
  }
}

onMounted(() => {
  loadNotifications()
  loadRegions()
})
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>
