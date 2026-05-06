<template>
  <div class="page-container">
    <div class="page-title mb-4">爆照评选配置</div>

    <a-card>
      <a-spin :spinning="loading">
        <a-tabs v-model:activeKey="activeSection">
          <a-tab-pane key="basic" tab="基本设置">
            <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 14 }">
              <a-form-item label="开启爆照评选功能">
                <a-switch v-model:checked="form.enableContest" />
              </a-form-item>
              <a-form-item label="每人最多提交作品数">
                <a-input-number v-model:value="form.maxPhotosPerUser" :min="1" style="width:100%" />
                <div class="text-secondary mt-1">每个用户在单次评选中最多可提交的作品数量</div>
              </a-form-item>
              <a-form-item label="每月可创建评选数">
                <a-input-number v-model:value="form.maxCompetitionsPerMonth" :min="1" style="width:100%" placeholder="留空则不限制" />
              </a-form-item>
              <a-form-item label="开启评分功能">
                <a-switch v-model:checked="form.enableRating" />
              </a-form-item>
              <a-form-item label="开启评论功能">
                <a-switch v-model:checked="form.enableCommenting" />
              </a-form-item>
            </a-form>
          </a-tab-pane>

          <a-tab-pane key="audit" tab="审核设置">
            <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 14 }">
              <a-form-item label="新作品需要审核">
                <a-switch v-model:checked="form.requirePhotoApproval" />
                <div class="text-secondary mt-1">开启后用户提交的作品需要管理员审核后才能参与投票</div>
              </a-form-item>
              <a-form-item label="自动通过审核">
                <a-switch v-model:checked="form.photoAutoApproval" :disabled="!form.requirePhotoApproval" />
                <div class="text-secondary mt-1">开启后用户提交的作品自动通过，无需人工审核</div>
              </a-form-item>
            </a-form>
          </a-tab-pane>

          <a-tab-pane key="vote" tab="投票限制">
            <a-form :model="form" :label-col="{ span: 7 }" :wrapper-col="{ span: 14 }">
              <a-form-item label="每人每日投票数">
                <a-input-number v-model:value="form.maxVotesPerUserDaily" :min="1" style="width:100%" />
              </a-form-item>
              <a-form-item label="每评选总投票数">
                <a-input-number v-model:value="form.maxVotesPerCompetition" :min="1" style="width:100%" placeholder="留空则不限制" />
              </a-form-item>
              <a-form-item label="每作品最多投票数">
                <a-input-number v-model:value="form.maxVotesPerPhoto" :min="1" style="width:100%" />
              </a-form-item>
              <a-form-item label="允许给自己投票">
                <a-switch v-model:checked="form.allowSelfVoting" />
              </a-form-item>
              <a-form-item label="投票间隔(小时)">
                <a-input-number v-model:value="form.votingIntervalHours" :min="0" style="width:100%" placeholder="留空则不限制" />
                <div class="text-secondary mt-1">用户两次投票之间最少等待的小时数</div>
              </a-form-item>
            </a-form>
          </a-tab-pane>

          <a-tab-pane key="watermark" tab="水印设置">
            <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 14 }">
              <a-form-item label="开启水印">
                <a-switch v-model:checked="form.watermarkEnabled" />
              </a-form-item>
              <a-form-item label="水印文字">
                <a-input v-model:value="form.watermarkText" placeholder="自定义水印文字" :disabled="!form.watermarkEnabled" />
              </a-form-item>
              <a-form-item label="水印位置">
                <a-select v-model:value="form.watermarkPosition" :disabled="!form.watermarkEnabled">
                  <a-select-option value="top-left">左上</a-select-option>
                  <a-select-option value="top-right">右上</a-select-option>
                  <a-select-option value="bottom-left">左下</a-select-option>
                  <a-select-option value="bottom-right">右下</a-select-option>
                  <a-select-option value="center">居中</a-select-option>
                </a-select>
              </a-form-item>
            </a-form>
          </a-tab-pane>

          <a-tab-pane key="notify" tab="通知设置">
            <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 14 }">
              <a-form-item label="管理员通知邮箱">
                <a-input v-model:value="form.adminNotificationEmail" placeholder="有新的参赛作品时发送通知到此邮箱" />
              </a-form-item>
            </a-form>
          </a-tab-pane>
        </a-tabs>

        <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 14 }" style="margin-top:24px;border-top:1px solid #f0f0f0;padding-top:24px">
          <a-form-item :wrapper-col="{ offset: 6, span: 14 }">
            <a-button type="primary" :loading="saving" @click="handleSave">保存配置</a-button>
          </a-form-item>
        </a-form>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { photoContestApi } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const activeSection = ref('basic')

const defaultForm = {
  enableContest: true,
  maxCompetitionsPerMonth: null,
  maxPhotosPerUser: 3,
  requirePhotoApproval: true,
  photoAutoApproval: false,
  maxVotesPerUserDaily: 10,
  maxVotesPerCompetition: null,
  maxVotesPerPhoto: 1,
  allowSelfVoting: false,
  votingIntervalHours: null,
  watermarkEnabled: false,
  watermarkText: null,
  watermarkPosition: 'bottom-right',
  enableRating: true,
  enableCommenting: true,
  adminNotificationEmail: null,
}
const form = reactive({ ...defaultForm })

const fetchConfig = async () => {
  loading.value = true
  try {
    const res = await photoContestApi.getRegionSettings(userStore.regionId)
    if (res.data) {
      Object.keys(defaultForm).forEach((k) => {
        if (res.data[k] !== undefined) (form as any)[k] = res.data[k]
      })
    }
  } finally { loading.value = false }
}

const handleSave = async () => {
  saving.value = true
  try {
    await photoContestApi.updateRegionSettings(userStore.regionId, { ...form })
    message.success('配置已保存')
  } finally { saving.value = false }
}

onMounted(() => fetchConfig())
</script>
