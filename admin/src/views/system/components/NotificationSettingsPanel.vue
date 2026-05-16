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
              <div class="switch-label">短信通知</div>
              <div class="switch-desc">通过短信发送通知（需要配置短信服务）</div>
            </div>
            <el-switch v-model="form.smsEnabled" />
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
      <div class="card-header"><div class="card-title">管理员通知接收人</div></div>
      <div class="card-body">
        <el-input v-model="form.adminNotifyReceivers" type="textarea" :rows="3" placeholder="请输入管理员ID或手机号，多个用逗号分隔" />
        <div class="form-tip">系统告警和重要通知将发送给这些管理员</div>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">微信模板消息</div>
        <el-button type="primary" size="small" @click="showAddTemplate = true">添加模板</el-button>
      </div>
      <div class="card-body">
        <el-table :data="templates" v-loading="loadingTemplates" style="width: 100%">
          <el-table-column prop="templateId" label="模板ID" width="200" show-overflow-tooltip />
          <el-table-column prop="title" label="模板标题" />
          <el-table-column prop="platformType" label="平台" width="100" />
          <el-table-column prop="enabled" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="editTemplate(row)">编辑</el-button>
              <el-popconfirm title="确定删除此模板？" @confirm="deleteTemplate(row.id)">
                <template #reference>
                  <el-button link type="danger" size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <el-dialog v-model="showAddTemplate" :title="editingTemplate ? '编辑模板' : '添加模板'" width="600px">
      <el-form label-position="top">
        <el-form-item label="模板ID" required>
          <el-input v-model="templateForm.templateId" placeholder="请输入微信模板ID" />
        </el-form-item>
        <el-form-item label="模板标题">
          <el-input v-model="templateForm.title" placeholder="请输入模板标题" />
        </el-form-item>
        <el-form-item label="平台类型">
          <el-select v-model="templateForm.platformType" style="width: 100%">
            <el-option label="小程序" value="miniprogram" />
            <el-option label="公众号" value="official" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板类型">
          <el-input v-model="templateForm.templateType" placeholder="如：order_status, comment_reply" />
        </el-form-item>
        <el-form-item label="跳转页面模板">
          <el-input v-model="templateForm.pageTemplate" placeholder="如：pages/order/detail?id={{orderId}}" />
        </el-form-item>
        <el-form-item label="字段映射 (JSON)">
          <el-input v-model="templateForm.fieldMapping" type="textarea" :rows="3" placeholder='{"thing1":"title","phrase2":"status"}' />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="templateForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddTemplate = false">取消</el-button>
        <el-button type="primary" :loading="savingTemplate" @click="saveTemplate">保存</el-button>
      </template>
    </el-dialog>

    <div class="glass-card">
      <div class="card-header"><div class="card-title">公众号绑定</div></div>
      <div class="card-body">
        <div class="binding-info">
          <div class="binding-row">
            <div>
              <div class="switch-label">用户公众号绑定</div>
              <div class="switch-desc">用户可通过扫描公众号二维码或访问绑定链接，将小程序账号与公众号 unionId/openid 关联，实现跨平台消息触达。</div>
            </div>
            <el-tag :type="officialConfigured ? 'success' : 'info'" size="large">
              {{ officialConfigured ? '已配置' : '未配置' }}
            </el-tag>
          </div>
        </div>
        <div class="binding-actions">
          <el-button @click="$router.push('/system/settings')">前往公众号配置</el-button>
          <el-button @click="testOfficialToken" :loading="testingOfficial">测试公众号 AccessToken</el-button>
          <el-button @click="$router.push('/system/wechat-logs')">查看微信发送日志</el-button>
        </div>
        <div class="form-tip" style="margin-top:12px">
          公众号 AppID / AppSecret / Token 等密钥配置在「系统配置 → 第三方配置 → 微信公众号配置」中管理。
          此处仅展示绑定功能状态和运营入口。
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
import {
  fetchConfigGroup, saveConfigGroup,
  fetchWechatTemplates, createWechatTemplate, updateWechatTemplate, deleteWechatTemplate,
  testWechatOfficialToken
} from '@/api/admin'

const loading = ref(false)
const saving = ref(false)
const officialConfigured = ref(false)
const testingOfficial = ref(false)
const loadingTemplates = ref(false)
const savingTemplate = ref(false)
const showAddTemplate = ref(false)
const editingTemplate = ref<any>(null)
const templates = ref<any[]>([])

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

const templateForm = reactive<Record<string, any>>({
  templateId: '',
  title: '',
  platformType: 'miniprogram',
  templateType: '',
  pageTemplate: '',
  fieldMapping: '',
  enabled: true
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
  } catch (e: any) {
    ElMessage.error(e?.message || '加载消息通知配置失败')
  } finally {
    loading.value = false
  }
}

async function loadTemplates() {
  loadingTemplates.value = true
  try {
    const res: any = await fetchWechatTemplates()
    templates.value = res?.list || res?.data?.list || res || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载微信模板失败')
  } finally {
    loadingTemplates.value = false
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

async function loadOfficialStatus() {
  try {
    const res: any = await fetchConfigGroup('wechat_official')
    const data = res?.data || res
    const cfg = data?.wechat_official || data
    officialConfigured.value = !!(cfg?.appId && cfg.appId !== '' && cfg.appSecret && cfg.appSecret !== '')
  } catch {
    officialConfigured.value = false
  }
}

async function testOfficialToken() {
  testingOfficial.value = true
  try {
    const res: any = await testWechatOfficialToken()
    if (res?.success) {
      ElMessage.success(`AccessToken 获取成功: ${res.tokenPreview}`)
    } else {
      ElMessage.error(res?.error || '获取失败，请先在系统配置中填写公众号密钥')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '获取失败')
  } finally {
    testingOfficial.value = false
  }
}

function editTemplate(row: any) {
  editingTemplate.value = row
  Object.assign(templateForm, {
    templateId: row.templateId,
    title: row.title || '',
    platformType: row.platformType === 'miniapp' ? 'miniprogram' : row.platformType,
    templateType: row.templateType,
    pageTemplate: row.pageTemplate || row.defaultPage || '',
    fieldMapping: row.fieldMapping ? JSON.stringify(row.fieldMapping) : '',
    enabled: row.enabled
  })
  showAddTemplate.value = true
}

async function saveTemplate() {
  if (!templateForm.templateId) {
    ElMessage.warning('请输入模板ID')
    return
  }
  savingTemplate.value = true
  try {
    let fieldMapping = null
    if (templateForm.fieldMapping) {
      try {
        fieldMapping = JSON.parse(templateForm.fieldMapping)
      } catch {
        ElMessage.error('字段映射 JSON 格式错误')
        savingTemplate.value = false
        return
      }
    }
    const payload: Record<string, any> = {
      ...templateForm,
      fieldMapping,
      defaultPage: templateForm.pageTemplate,
    }
    delete payload.pageTemplate

    if (editingTemplate.value) {
      await updateWechatTemplate(editingTemplate.value.id, payload)
    } else {
      await createWechatTemplate(payload)
    }
    ElMessage.success(editingTemplate.value ? '模板已更新' : '模板已添加')
    showAddTemplate.value = false
    editingTemplate.value = null
    Object.assign(templateForm, { templateId: '', title: '', platformType: 'miniprogram', templateType: '', pageTemplate: '', fieldMapping: '', enabled: true })
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingTemplate.value = false
  }
}

async function deleteTemplate(id: string) {
  try {
    await deleteWechatTemplate(id)
    ElMessage.success('模板已删除')
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败')
  }
}

onMounted(() => {
  load()
  loadTemplates()
  loadOfficialStatus()
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
