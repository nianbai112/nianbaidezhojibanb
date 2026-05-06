<template>
  <div class="page-container">
    <div class="page-title mb-4">笔记配置管理</div>

    <a-row :gutter="16">
      <a-col :span="8">
        <!-- 区域列表 -->
        <a-card title="选择区域" size="small">
          <a-spin :spinning="regionLoading">
            <a-list
              :data-source="regions"
              size="small"
              :pagination="{ pageSize: 10, size: 'small' }"
            >
              <template #renderItem="{ item }">
                <a-list-item
                  :class="{ 'selected-region': selectedRegion?.id === item.id }"
                  @click="selectRegion(item)"
                  style="cursor:pointer"
                >
                  <a-list-item-meta>
                    <template #title>{{ item.name }}</template>
                    <template #avatar>
                      <a-tag :color="item.hasConfig ? 'green' : 'default'" size="small">
                        {{ item.hasConfig ? '已配置' : '未配置' }}
                      </a-tag>
                    </template>
                  </a-list-item-meta>
                </a-list-item>
              </template>
            </a-list>
          </a-spin>
        </a-card>
      </a-col>

      <a-col :span="16">
        <!-- 配置表单 -->
        <a-card title="笔记发布设置" size="small">
          <a-spin :spinning="loading">
            <template v-if="selectedRegion">
              <a-form :model="form" :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
                <a-divider orientation="left" plain>内容类型</a-divider>
                <a-form-item label="允许图文笔记">
                  <a-switch v-model:checked="form.allowTextNote" />
                </a-form-item>
                <a-form-item label="允许图片笔记">
                  <a-switch v-model:checked="form.allowImageNote" />
                </a-form-item>
                <a-form-item label="允许视频笔记">
                  <a-switch v-model:checked="form.allowVideoNote" />
                </a-form-item>

                <a-divider orientation="left" plain>发布限制</a-divider>
                <a-form-item label="每日发布上限">
                  <a-input-number v-model:value="form.maxNotesPerDay" :min="0" :max="100" style="width:100%" />
                </a-form-item>
                <a-form-item label="内容最大长度">
                  <a-input-number v-model:value="form.maxLength" :min="1" :max="50000" style="width:100%" placeholder="字符数" />
                </a-form-item>
                <a-form-item label="发布冷却时间(秒)">
                  <a-input-number v-model:value="form.cooldownSeconds" :min="0" :max="3600" style="width:100%" />
                </a-form-item>
                <a-form-item label="最多上传图片">
                  <a-input-number v-model:value="form.maxImages" :min="1" :max="30" style="width:100%" />
                </a-form-item>

                <a-divider orientation="left" plain>安全设置</a-divider>
                <a-form-item label="强制绑定手机号">
                  <a-switch v-model:checked="form.forceBindPhone" />
                </a-form-item>
                <a-form-item label="强制学生认证">
                  <a-switch v-model:checked="form.forceStudentAuth" />
                </a-form-item>
                <a-form-item label="二维码图片检测">
                  <a-switch v-model:checked="form.enableQrcodeFilter" />
                </a-form-item>

                <a-divider orientation="left" plain>评论设置</a-divider>
                <a-form-item label="允许评论">
                  <a-switch v-model:checked="form.allowComments" />
                </a-form-item>
                <a-form-item label="评论最大长度">
                  <a-input-number v-model:value="form.commentMaxLength" :min="1" :max="5000" style="width:100%" />
                </a-form-item>
                <a-form-item label="匿名评论">
                  <a-switch v-model:checked="form.allowAnonymousComments" />
                </a-form-item>

                <a-divider orientation="left" plain>审核设置</a-divider>
                <a-form-item label="笔记审核方式">
                  <a-select v-model:value="form.approvalType" style="width:100%">
                    <a-select-option value="none">无需审核</a-select-option>
                    <a-select-option value="manual">人工审核</a-select-option>
                    <a-select-option value="ai">AI 审核</a-select-option>
                  </a-select>
                </a-form-item>

                <a-form-item :wrapper-col="{ offset: 8 }">
                  <a-button type="primary" :loading="saving" @click="onSave">保存配置</a-button>
                </a-form-item>
              </a-form>
            </template>
            <a-empty v-else description="请从左侧选择一个区域" :image-style="{ height: '60px' }" />
          </a-spin>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { contentApi } from '@/api/content'
import { areaApi } from '@/api/area'

const selectedRegion = ref<any>(null)
const regions = ref<any[]>([])
const regionLoading = ref(false)
const loading = ref(false)
const saving = ref(false)

const form = reactive({
  allowTextNote: true,
  allowImageNote: true,
  allowVideoNote: true,
  maxNotesPerDay: 10,
  maxLength: 5000,
  cooldownSeconds: 30,
  maxImages: 9,
  forceBindPhone: false,
  forceStudentAuth: false,
  enableQrcodeFilter: false,
  allowComments: true,
  commentMaxLength: 500,
  allowAnonymousComments: true,
  approvalType: 'none',
})

async function fetchRegions() {
  regionLoading.value = true
  try {
    const res = await areaApi.getList({ page: 1, pageSize: 200 })
    const body: any = res.data?.data || res.data || {}
    const allRegions = body.list || body.data || []

    // Fetch all note settings to know which regions are configured
    try {
      const settingsRes = await contentApi.getNoteSettings({ page: 1, pageSize: 200 })
      const settingsBody: any = settingsRes.data?.data || settingsRes.data || {}
      const settingsList = settingsBody.list || []
      const configuredIds = new Set(settingsList.map((s: any) => s.regionId))
      regions.value = (allRegions as any[]).map((r: any) => ({
        ...r,
        hasConfig: configuredIds.has(r.id),
      }))
    } catch {
      regions.value = (allRegions as any[]).map((r: any) => ({ ...r, hasConfig: false }))
    }
  } catch { /* ignore */ } finally { regionLoading.value = false }
}

async function selectRegion(region: any) {
  selectedRegion.value = region
  loading.value = true
  try {
    const res = await contentApi.getNoteSettingByRegion(region.id)
    const data: any = res.data?.data || res.data || {}
    // Reset to defaults then apply saved settings
    Object.assign(form, {
      allowTextNote: true, allowImageNote: true, allowVideoNote: true,
      maxNotesPerDay: 10, maxLength: 5000, cooldownSeconds: 30, maxImages: 9,
      forceBindPhone: false, forceStudentAuth: false, enableQrcodeFilter: false,
      allowComments: true, commentMaxLength: 500, allowAnonymousComments: true,
      approvalType: 'none',
    })
    if (data && data.regionId) {
      if (data.allowTextNote !== undefined) form.allowTextNote = data.allowTextNote
      if (data.allowImageNote !== undefined) form.allowImageNote = data.allowImageNote
      if (data.allowVideoNote !== undefined) form.allowVideoNote = data.allowVideoNote
      if (data.maxNotesPerDay !== undefined) form.maxNotesPerDay = data.maxNotesPerDay
      if (data.maxLength !== undefined) form.maxLength = data.maxLength
      if (data.cooldownSeconds !== undefined) form.cooldownSeconds = data.cooldownSeconds
      if (data.maxImages !== undefined) form.maxImages = data.maxImages
      if (data.forceBindPhone !== undefined) form.forceBindPhone = data.forceBindPhone
      if (data.forceStudentAuth !== undefined) form.forceStudentAuth = data.forceStudentAuth
      if (data.enableQrcodeFilter !== undefined) form.enableQrcodeFilter = data.enableQrcodeFilter
      if (data.allowComments !== undefined) form.allowComments = data.allowComments
      if (data.commentMaxLength !== undefined) form.commentMaxLength = data.commentMaxLength
      if (data.allowAnonymousComments !== undefined) form.allowAnonymousComments = data.allowAnonymousComments
      if (data.approvalType !== undefined) form.approvalType = data.approvalType
    }
  } catch { /* use defaults */ } finally { loading.value = false }
}

async function onSave() {
  if (!selectedRegion.value) return
  saving.value = true
  try {
    await contentApi.updateNoteSetting(selectedRegion.value.id, { ...form })
    message.success('配置已保存')
    // Refresh region list to update config status
    const idx = regions.value.findIndex((r: any) => r.id === selectedRegion.value.id)
    if (idx >= 0) regions.value[idx].hasConfig = true
  } catch { message.error('保存失败') } finally { saving.value = false }
}

onMounted(() => fetchRegions())
</script>

<style lang="less" scoped>
.selected-region {
  background: #e6f7ff;
  border-left: 3px solid #1890ff;
}
</style>
