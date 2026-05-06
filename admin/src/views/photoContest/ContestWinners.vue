<template>
  <div class="page-container">
    <div class="page-title mb-4">获奖管理</div>

    <a-row :gutter="16">
      <!-- 左侧：候选作品 -->
      <a-col :span="14">
        <a-card title="候选作品 (通过审核)" size="small">
          <template #extra>
            <a-select v-model:value="contestId" placeholder="选择评选项目" style="width:200px" @change="fetchData">
              <a-select-option v-for="c in contests" :key="c.id" :value="c.id">{{ c.title }}</a-select-option>
            </a-select>
          </template>
          <a-table :dataSource="candidates" :columns="candidateColumns" :loading="loading" rowKey="id" size="small" :pagination="false">
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'image'">
                <a-image :src="record.imageUrl" :width="50" :height="40" style="object-fit:cover;border-radius:4px" />
              </template>
              <template v-else-if="column.dataIndex === 'action'">
                <a-button size="small" type="primary" ghost @click="openSetWinner(record)">设为获奖者</a-button>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>

      <!-- 右侧：获奖名单 -->
      <a-col :span="10">
        <a-card title="当前获奖名单" size="small">
          <template #extra>
            <a-tag v-if="!contestId" color="default">请先选择评选</a-tag>
            <a-tag v-else color="blue">{{ winners.length }} 位获奖者</a-tag>
          </template>
          <div v-if="winners.length">
            <a-list :dataSource="winners" size="small">
              <template #renderItem="{ item }">
                <a-list-item>
                  <a-list-item-meta>
                    <template #avatar>
                      <a-badge :count="item.winnerRank" :number-style="{ backgroundColor: item.winnerRank === 1 ? '#faad14' : item.winnerRank === 2 ? '#999' : item.winnerRank === 3 ? '#cd7f32' : '#1677ff' }">
                        <a-image :src="item.entry?.imageUrl" :width="40" :height="40" style="object-fit:cover;border-radius:4px" />
                      </a-badge>
                    </template>
                    <template #title>
                      {{ item.entry?.title || '无标题' }} ({{ item.entry?.voteCount || 0 }}票)
                    </template>
                    <template #description>
                      <a-space size="small">
                        <span>{{ item.prizeName || '无奖品名' }}</span>
                        <a-tag :color="item.rewardStatus === 'issued' ? 'success' : item.rewardStatus === 'failed' ? 'error' : 'default'" style="font-size:11px">
                          {{ rewardStatusMap[item.rewardStatus] || item.rewardStatus }}
                        </a-tag>
                      </a-space>
                    </template>
                  </a-list-item-meta>
                  <template #actions>
                    <a @click="openEditWinner(item)">编辑</a>
                    <a-popconfirm title="确定删除该获奖记录？" @confirm="handleDeleteWinner(item.id)">
                      <a class="text-danger">删除</a>
                    </a-popconfirm>
                  </template>
                </a-list-item>
              </template>
            </a-list>
          </div>
          <a-empty v-else description="暂无获奖者" />
        </a-card>
      </a-col>
    </a-row>

    <!-- 设置/编辑获奖者弹窗 -->
    <a-modal v-model:open="winnerVisible" :title="editingWinnerId ? '编辑获奖信息' : '设置获奖者'" @ok="handleSaveWinner" :confirmLoading="saving" width="500px">
      <a-form :model="winnerForm" :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="排名" required>
          <a-input-number v-model:value="winnerForm.winnerRank" :min="1" style="width:100%" />
        </a-form-item>
        <a-form-item label="奖品名称">
          <a-input v-model:value="winnerForm.prizeName" placeholder="如：一等奖、精美礼品" />
        </a-form-item>
        <a-form-item label="奖品描述">
          <a-textarea v-model:value="winnerForm.prizeDescription" :rows="2" placeholder="奖品详细描述" />
        </a-form-item>
        <a-form-item label="奖品价值">
          <a-input v-model:value="winnerForm.prizeValue" placeholder="如：¥500" />
        </a-form-item>
        <a-form-item v-if="editingWinnerId" label="发放状态">
          <a-select v-model:value="winnerForm.rewardStatus">
            <a-select-option value="pending">待发放</a-select-option>
            <a-select-option value="issued">已发放</a-select-option>
            <a-select-option value="failed">发放失败</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="winnerForm.remark" :rows="2" placeholder="管理员备注" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { photoContestApi } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const winnerVisible = ref(false)
const editingWinnerId = ref('')
const contestId = ref<string | undefined>(route.query.contestId as string || undefined)
const contests = ref<any[]>([])
const candidates = ref<any[]>([])
const winners = ref<any[]>([])

const rewardStatusMap: Record<string, string> = { pending: '待发放', issued: '已发放', failed: '发放失败' }

const candidateColumns = [
  { title: '照片', dataIndex: 'image', width: 60 },
  { title: '标题', dataIndex: 'title', ellipsis: true },
  { title: '用户', dataIndex: 'user', width: 100 },
  { title: '票数', dataIndex: 'voteCount', width: 60 },
  { title: '操作', dataIndex: 'action', width: 100 },
]

const winnerForm = reactive({
  entryId: '', competitionId: '', userId: '',
  winnerRank: 1, prizeName: '', prizeDescription: '', prizeValue: '',
  rewardStatus: 'pending', remark: '',
})

const fetchContests = async () => {
  const res = await photoContestApi.getContests({ page: 1, pageSize: 100, regionId: userStore.regionId })
  contests.value = res.data.list
}

const fetchData = async () => {
  if (!contestId.value) return
  loading.value = true
  try {
    const [statsRes, winnersRes] = await Promise.all([
      photoContestApi.getVoteStats(contestId.value),
      photoContestApi.getWinners(contestId.value),
    ])
    candidates.value = (statsRes.data.entries || []) as any[]
    winners.value = (winnersRes.data as unknown as any[]) || []
  } finally { loading.value = false }
}

const openSetWinner = (record: any) => {
  editingWinnerId.value = ''
  winnerForm.entryId = record.id
  winnerForm.competitionId = contestId.value!
  winnerForm.userId = record.user?.id || ''
  winnerForm.winnerRank = winners.value.length + 1
  winnerForm.prizeName = ''
  winnerForm.prizeDescription = ''
  winnerForm.prizeValue = ''
  winnerForm.rewardStatus = 'pending'
  winnerForm.remark = ''
  winnerVisible.value = true
}

const openEditWinner = (record: any) => {
  editingWinnerId.value = record.id
  winnerForm.entryId = record.entryId
  winnerForm.competitionId = record.competitionId
  winnerForm.userId = record.userId || ''
  winnerForm.winnerRank = record.winnerRank
  winnerForm.prizeName = record.prizeName || ''
  winnerForm.prizeDescription = record.prizeDescription || ''
  winnerForm.prizeValue = record.prizeValue || ''
  winnerForm.rewardStatus = record.rewardStatus
  winnerForm.remark = record.remark || ''
  winnerVisible.value = true
}

const handleSaveWinner = async () => {
  saving.value = true
  try {
    const data = {
      entryId: winnerForm.entryId,
      competitionId: winnerForm.competitionId,
      userId: winnerForm.userId,
      winnerRank: winnerForm.winnerRank,
      prizeName: winnerForm.prizeName || undefined,
      prizeDescription: winnerForm.prizeDescription || undefined,
      prizeValue: winnerForm.prizeValue || undefined,
      remark: winnerForm.remark || undefined,
    }
    if (editingWinnerId.value) {
      await photoContestApi.updateWinner(editingWinnerId.value, {
        prizeName: data.prizeName,
        prizeDescription: data.prizeDescription,
        prizeValue: data.prizeValue,
        rewardStatus: winnerForm.rewardStatus,
        remark: data.remark,
      })
    } else {
      await photoContestApi.createWinner(data)
    }
    message.success('保存成功')
    winnerVisible.value = false
    fetchData()
  } finally { saving.value = false }
}

const handleDeleteWinner = async (id: string) => {
  try { await photoContestApi.deleteWinner(id); message.success('已删除'); fetchData() } catch {}
}

onMounted(() => { fetchContests(); if (contestId.value) fetchData() })
</script>
