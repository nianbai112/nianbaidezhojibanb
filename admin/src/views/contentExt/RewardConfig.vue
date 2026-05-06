<template>
  <div class="page-container">
    <div class="page-title mb-4">用户奖励设置</div>

    <a-row :gutter="16">
      <a-col :span="12">
        <a-card title="签到奖励配置" class="mb-4">
          <a-spin :spinning="loading">
            <a-form :model="rewardForm" :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
              <a-form-item label="每日签到积分">
                <a-input-number v-model:value="rewardForm.dailyCheckInReward" :min="0" style="width: 100%" />
              </a-form-item>
              <a-form-item label="发帖奖励积分">
                <a-input-number v-model:value="rewardForm.postPublishReward" :min="0" style="width: 100%" />
              </a-form-item>
              <a-form-item label="评论奖励积分">
                <a-input-number v-model:value="rewardForm.commentReward" :min="0" style="width: 100%" />
              </a-form-item>
              <a-form-item label="首帖特别奖励">
                <a-input-number v-model:value="rewardForm.firstPostReward" :min="0" style="width: 100%" />
              </a-form-item>
              <a-form-item label="连签第4天奖励">
                <a-input-number v-model:value="rewardForm.continuousBonus[3]" :min="0" style="width: 100%" />
              </a-form-item>
              <a-form-item label="连签第7天奖励">
                <a-input-number v-model:value="rewardForm.continuousBonus[6]" :min="0" style="width: 100%" />
              </a-form-item>
              <a-form-item :wrapper-col="{ offset: 8 }">
                <a-button type="primary" :loading="savingReward" @click="handleSaveReward">保存奖励配置</a-button>
              </a-form-item>
            </a-form>
          </a-spin>
        </a-card>
      </a-col>

      <a-col :span="12">
        <a-card title="徽章管理" extra>
          <template #extra>
            <a-button size="small" type="primary" @click="badgeVisible = true">新增徽章</a-button>
          </template>
          <a-spin :spinning="loadingBadge">
            <a-list :dataSource="badges" :pagination="{ pageSize: 5 }" rowKey="id">
              <template #renderItem="{ item }">
                <a-list-item>
                  <a-list-item-meta :title="item.name" :description="item.condition">
                    <template #avatar>
                      <a-avatar :src="item.icon">{{ item.name?.[0] }}</a-avatar>
                    </template>
                  </a-list-item-meta>
                  <template #actions>
                    <a-popconfirm title="确定删除此徽章？" @confirm="handleDeleteBadge(item.id)">
                      <a class="text-danger">删除</a>
                    </a-popconfirm>
                  </template>
                </a-list-item>
              </template>
            </a-list>
          </a-spin>
        </a-card>
      </a-col>
    </a-row>

    <!-- 新增徽章弹窗 -->
    <a-modal v-model:open="badgeVisible" title="新增徽章" @ok="handleAddBadge" :confirmLoading="savingBadge">
      <a-form :model="badgeForm" layout="vertical">
        <a-form-item label="徽章名称" required>
          <a-input v-model:value="badgeForm.name" />
        </a-form-item>
        <a-form-item label="图标 URL" required>
          <a-input v-model:value="badgeForm.icon" placeholder="徽章图标链接" />
        </a-form-item>
        <a-form-item label="描述">
          <a-input v-model:value="badgeForm.description" />
        </a-form-item>
        <a-form-item label="获取条件说明" required>
          <a-input v-model:value="badgeForm.condition" placeholder="例如: 累计发布帖子 100 篇" />
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model:value="badgeForm.sortOrder" :min="0" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { contentExtApi } from '@/api'

const loading = ref(false)
const loadingBadge = ref(false)
const savingReward = ref(false)
const savingBadge = ref(false)
const badgeVisible = ref(false)
const badges = ref<any[]>([])

const rewardForm = reactive({
  dailyCheckInReward: 10,
  continuousBonus: [0, 0, 0, 5, 5, 5, 20],
  postPublishReward: 5,
  commentReward: 2,
  firstPostReward: 50,
})

const badgeForm = reactive({ name: '', icon: '', description: '', condition: '', sortOrder: 0 })

const fetchRewardConfig = async () => {
  loading.value = true
  try {
    const res = await contentExtApi.getRewardConfig()
    if (res.data) Object.assign(rewardForm, res.data)
  } finally { loading.value = false }
}

const fetchBadges = async () => {
  loadingBadge.value = true
  try {
    const res = await contentExtApi.getBadges({ page: 1, pageSize: 100 })
    badges.value = res.data.list
  } finally { loadingBadge.value = false }
}

const handleSaveReward = async () => {
  savingReward.value = true
  try {
    await contentExtApi.updateRewardConfig(rewardForm)
    message.success('奖励配置已保存')
  } finally { savingReward.value = false }
}

const handleAddBadge = async () => {
  if (!badgeForm.name || !badgeForm.icon || !badgeForm.condition) return message.warning('请完整填写徽章信息')
  savingBadge.value = true
  try {
    await contentExtApi.createBadge(badgeForm)
    message.success('徽章已创建')
    badgeVisible.value = false
    Object.assign(badgeForm, { name: '', icon: '', description: '', condition: '', sortOrder: 0 })
    fetchBadges()
  } finally { savingBadge.value = false }
}

const handleDeleteBadge = async (id: string) => {
  try {
    await contentExtApi.deleteBadge(id)
    message.success('已删除')
    fetchBadges()
  } catch {}
}

onMounted(() => { fetchRewardConfig(); fetchBadges() })
</script>
