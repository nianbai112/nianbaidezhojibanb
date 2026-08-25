<template>
  <div class="panel-container">
    <div class="glass-card">
      <div class="card-header"><div class="card-title">通知开关</div></div>
      <div class="card-body">
        <div class="switch-grid">
          <div class="switch-item">
            <div>
              <div class="switch-label">订单支付通知</div>
              <div class="switch-desc">用户支付订单后发送通知</div>
            </div>
            <el-switch v-model="form.orderPaymentNotice" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">商家入驻通知</div>
              <div class="switch-desc">商家申请入驻时发送通知</div>
            </div>
            <el-switch v-model="form.merchantJoinNotice" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">退款处理通知</div>
              <div class="switch-desc">退款申请处理时发送通知</div>
            </div>
            <el-switch v-model="form.refundNotice" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">内容举报通知</div>
              <div class="switch-desc">用户举报内容时发送通知</div>
            </div>
            <el-switch v-model="form.reportNotice" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">配送超时通知</div>
              <div class="switch-desc">配送订单超时时发送通知</div>
            </div>
            <el-switch v-model="form.deliveryTimeoutNotice" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">系统告警通知</div>
              <div class="switch-desc">系统异常时发送告警通知</div>
            </div>
            <el-switch v-model="form.systemAlertNotice" />
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header"><div class="card-title">通知渠道</div></div>
      <div class="card-body">
        <div class="switch-grid">
          <div class="switch-item">
            <div>
              <div class="switch-label">微信模板消息</div>
              <div class="switch-desc">通过微信小程序模板消息发送通知</div>
            </div>
            <el-switch v-model="form.wechatTemplateEnabled" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">短信通知（暂不可用）</div>
              <div class="switch-desc">运营短信模板和发送回执尚未接入，当前不会外发短信</div>
            </div>
            <el-switch :model-value="false" disabled />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">邮件通知</div>
              <div class="switch-desc">通过邮件发送通知（需要配置邮箱服务）</div>
            </div>
            <el-switch v-model="form.emailEnabled" />
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header"><div class="card-title">互动通知防刷</div></div>
      <div class="card-body">
        <div class="policy-grid">
          <div class="policy-item">
            <div>
              <div class="switch-label">点赞通知去重</div>
              <div class="switch-desc">同一用户对同一内容反复点赞/取消点赞，24 小时内只产生一条站内通知。</div>
            </div>
            <el-tag type="success" effect="light">已启用</el-tag>
          </div>
          <div class="policy-item">
            <div>
              <div class="switch-label">关注通知去重</div>
              <div class="switch-desc">同一用户关注、取关、再关注同一对象，24 小时内不重复刷关注通知。</div>
            </div>
            <el-tag type="success" effect="light">已启用</el-tag>
          </div>
        </div>
        <div class="form-tip">这是后端安全兜底策略，会直接影响通知入库和实时推送；运营开关仍只控制普通通知渠道。</div>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header"><div class="card-title">管理员通知接收人</div></div>
      <div class="card-body">
        <el-input v-model="form.adminNotifyReceivers" type="textarea" :rows="3" placeholder="请输入管理员ID或手机号，多个用逗号分隔" />
        <div class="form-tip">系统告警和重要通知将发送给这些管理员</div>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">微信模板消息</div>
      </div>
      <div class="card-body">
        <div class="switch-item">
          <div>
            <div class="switch-label">微信模板消息</div>
            <div class="switch-desc">通过微信小程序模板消息发送通知</div>
          </div>
          <el-switch v-model="form.wechatTemplateEnabled" />
        </div>
        <div class="form-tip" style="margin-top:12px">
          模板配置、场景开关、字段映射和发送日志请前往
          <el-link type="primary" @click="$router.push('/marketing/wechat-notify')">服务号通知中心</el-link>
          管理。
        </div>
      </div>
    </div>

    <div class="panel-actions">
      <el-button @click="load" :loading="loading">刷新</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchConfigGroup, saveConfigGroup } from '@/api/admin'

const loading = ref(false)
const saving = ref(false)

const form = reactive<Record<string, any>>({
  orderPaymentNotice: true,
  merchantJoinNotice: true,
  refundNotice: true,
  reportNotice: true,
  deliveryTimeoutNotice: true,
  systemAlertNotice: true,
  wechatTemplateEnabled: true,
  smsEnabled: false,
  emailEnabled: false,
  adminNotifyReceivers: ''
})

async function load() {
  loading.value = true
  try {
    const data = await fetchConfigGroup('notification')
    if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        if (key in form) {
          form[key] = value
        }
      }
    }
    form.smsEnabled = false
  } catch (e: any) {
    ElMessage.error(e?.message || '加载消息通知配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await saveConfigGroup('notification', { ...form })
    ElMessage.success('消息通知配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  load()
})
</script>

<style scoped>
.panel-container {
  display: grid;
  gap: 24px;
}
.switch-grid {
  display: grid;
  gap: 16px;
}
.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.6);
}
.policy-grid {
  display: grid;
  gap: 14px;
}
.policy-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 16px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(240, 253, 244, 0.82), rgba(248, 250, 252, 0.9));
  border: 1px solid rgba(187, 247, 208, 0.8);
}
.switch-label {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
}
.switch-desc {
  color: #94a3b8;
  font-size: 12px;
}
.form-tip {
  color: #94a3b8;
  font-size: 12px;
  margin-top: 4px;
}
.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
}
.binding-info {
  margin-bottom: 12px;
}
.binding-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.6);
}
.binding-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
