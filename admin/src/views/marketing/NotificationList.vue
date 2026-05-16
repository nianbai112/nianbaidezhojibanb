<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 通知</p>
        <h2>系统通知群发</h2>
        <p>通知入库并可实时推送，列表读取真实 notifications 数据。</p>
      </div>
      <el-button type="primary" @click="showSendDialog = true">发送通知</el-button>
    </div>

    <div class="data-card">
      <el-table :data="notifications" v-loading="loading" empty-text="暂无真实通知数据">
        <el-table-column prop="title" label="标题" min-width="180" />
        <el-table-column prop="content" label="内容" min-width="260" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="140">
          <template #default="{ row }"><el-tag size="small">{{ row.type }}</el-tag></template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.isRead ? 'success' : 'warning'" size="small">{{ row.isRead ? '已读' : '未读' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="190">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadNotifications"
          @size-change="loadNotifications"
        />
      </div>
    </div>

    <el-dialog v-model="showSendDialog" title="发送通知" width="660px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="发送目标">
          <el-select v-model="form.targetType" style="width: 100%">
            <el-option label="全部用户" value="all" />
            <el-option label="指定区域" value="region" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.targetType === 'region'" label="选择区域" required>
          <el-select v-model="form.regionId" filterable clearable style="width: 100%">
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
        <div class="dialog-grid">
          <el-form-item label="跳转类型">
            <el-select v-model="form.linkType" clearable style="width: 100%">
              <el-option label="无跳转" value="" />
              <el-option label="帖子" value="post" />
              <el-option label="用户" value="user" />
              <el-option label="订单" value="order" />
              <el-option label="自定义页面" value="page" />
            </el-select>
          </el-form-item>
          <el-form-item label="跳转值">
            <el-input v-model="form.linkValue" placeholder="ID 或小程序路径" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showSendDialog = false">取消</el-button>
        <el-button type="primary" @click="sendNotification" :loading="sending">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { sendNotification as apiSendNotification } from '@/api/admin'
import { request } from '@/api/request'
import { errorMessage, formatTime, unwrapPage } from './utils'

const loading = ref(false)
const sending = ref(false)
const showSendDialog = ref(false)
const notifications = ref<any[]>([])
const regions = ref<any[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

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

async function loadNotifications() {
  loading.value = true
  try {
    const res = await request.get('/admin/notifications', {
      params: { page: pagination.page, pageSize: pagination.pageSize },
    })
    const page = unwrapPage(res)
    notifications.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载通知失败'))
  } finally {
    loading.value = false
  }
}

async function loadRegions() {
  try {
    regions.value = unwrapPage(await request.get('/admin/regions')).list
  } catch (error: any) {
    ElMessage.warning(errorMessage(error, '加载区域列表失败'))
  }
}

async function sendNotification() {
  if (!form.title.trim() || !form.content.trim()) {
    ElMessage.warning('请填写标题和内容')
    return
  }
  if (form.targetType === 'region' && !form.regionId) {
    ElMessage.warning('请选择区域')
    return
  }
  sending.value = true
  try {
    const result: any = await apiSendNotification({
      targetType: form.targetType,
      title: form.title.trim(),
      content: form.content.trim(),
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
    const createdCount = result?.createdCount ?? result?.count ?? result?.data?.createdCount ?? 0
    ElMessage.success(`通知已发送${createdCount ? `，覆盖 ${createdCount} 人` : ''}`)
    showSendDialog.value = false
    form.title = ''
    form.content = ''
    form.linkType = ''
    form.linkValue = ''
    await loadNotifications()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '发送失败'))
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
.marketing-page { padding: 24px; }
.marketing-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 16px; box-shadow: 0 14px 36px rgba(37,99,235,.08); padding: 18px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
@media (max-width: 900px) {
  .dialog-grid { grid-template-columns: 1fr; }
}
</style>
