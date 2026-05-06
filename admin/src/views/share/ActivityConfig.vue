<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">分享活动设置</span>
      </div>

      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #isEnabled="{ record }">
          <a-tag :color="record.isEnabled ? 'green' : 'default'">{{ record.isEnabled ? '开启' : '关闭' }}</a-tag>
        </template>
        <template #userLimit="{ record }">
          <a-tag :color="record.userLimit === 'NEW_USERS' ? 'orange' : 'blue'">
            {{ record.userLimit === 'NEW_USERS' ? '仅新用户' : '所有用户' }}
          </a-tag>
        </template>
        <template #action="{ record }">
          <a @click="onEdit(record)">配置</a>
          <a-divider type="vertical" />
          <a-popconfirm title="确定删除该区域设置吗？" @confirm="onDelete(record)">
            <a style="color:#ff4d4f">删除</a>
          </a-popconfirm>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="modalVisible" title="编辑分享活动" :width="640" :confirm-loading="submitting" @ok="onSubmit">
      <a-form layout="vertical">
        <a-card title="基础设置" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="活动开关">
                <a-switch v-model:checked="form.isEnabled" checked-children="开" un-checked-children="关" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="用户限制">
                <a-select v-model:value="form.userLimit" :options="[
                  { label: '所有用户', value: 'ALL_USERS' },
                  { label: '仅新用户', value: 'NEW_USERS' },
                ]" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="活动标题">
            <a-input v-model:value="form.activityTitle" placeholder="分享活动标题" />
          </a-form-item>
          <a-form-item label="活动图片">
            <a-input v-model:value="form.activityImage" placeholder="活动图片URL" />
          </a-form-item>
          <a-form-item label="活动规则">
            <a-textarea v-model:value="form.activityRules" placeholder="活动规则说明" :rows="3" />
          </a-form-item>
        </a-card>

        <a-card title="奖励设置" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="邀请人奖励(元)">
                <a-input-number v-model:value="form.inviterReward" :min="0" :max="9999" :precision="2" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="被邀请人奖励(元)">
                <a-input-number v-model:value="form.inviteeReward" :min="0" :max="9999" :precision="2" style="width:100%" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>

        <a-card title="限制设置" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="每日邀请上限">
                <a-input-number v-model:value="form.dailyInviteLimit" :min="0" :max="999" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="总邀请上限(空=不限)">
                <a-input-number v-model:value="form.totalInviteLimit" :min="1" :max="99999" style="width:100%" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>

        <a-card title="活动时间" size="small">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="开始时间">
                <a-date-picker v-model:value="form.startTime" show-time format="YYYY-MM-DD HH:mm:ss" value-format="YYYY-MM-DD HH:mm:ss" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="结束时间">
                <a-date-picker v-model:value="form.endTime" show-time format="YYYY-MM-DD HH:mm:ss" value-format="YYYY-MM-DD HH:mm:ss" style="width:100%" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { marketingApi } from '@/api/marketing'
import DataTable from '@/components/common/DataTable.vue'
import dayjs from 'dayjs'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)

const cols = [
  { title: '区域ID', dataIndex: 'regionId', width: 200, ellipsis: true },
  { title: '活动标题', dataIndex: 'activityTitle', width: 160, ellipsis: true },
  { title: '邀请人奖励', dataIndex: 'inviterReward', width: 90 },
  { title: '被邀人奖励', dataIndex: 'inviteeReward', width: 90 },
  { title: '用户限制', dataIndex: 'userLimit', width: 90, slot: 'userLimit' },
  { title: '每日上限', dataIndex: 'dailyInviteLimit', width: 80 },
  { title: '开关', dataIndex: 'isEnabled', width: 70, slot: 'isEnabled' },
  { title: '更新时间', dataIndex: 'updatedAt', width: 170 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action' },
]

async function fetchData() {
  ld.value = true
  try {
    const res = await marketingApi.getShareSettingsList({ page: p.value, pageSize: ps.value })
    list.value = res.data.data?.list || []
    t.value = res.data.data?.total || 0
  } catch { /* handled */ }
  finally { ld.value = false }
}

const modalVisible = ref(false), editingRegionId = ref(''), submitting = ref(false)
const form = reactive({
  isEnabled: true, activityTitle: '', activityImage: '', activityRules: '',
  inviterReward: 0, inviteeReward: 0,
  userLimit: 'ALL_USERS' as string,
  dailyInviteLimit: 100, totalInviteLimit: undefined as number | undefined,
  startTime: '', endTime: '',
})

function onEdit(r: any) {
  editingRegionId.value = r.regionId
  Object.assign(form, {
    isEnabled: r.isEnabled, activityTitle: r.activityTitle || '', activityImage: r.activityImage || '',
    activityRules: r.activityRules || '',
    inviterReward: Number(r.inviterReward) || 0, inviteeReward: Number(r.inviteeReward) || 0,
    userLimit: r.userLimit || 'ALL_USERS',
    dailyInviteLimit: r.dailyInviteLimit ?? 100, totalInviteLimit: r.totalInviteLimit,
    startTime: r.startTime || '', endTime: r.endTime || '',
  })
  modalVisible.value = true
}

async function onSubmit() {
  submitting.value = true
  try {
    await marketingApi.saveShareSettings(editingRegionId.value, {
      ...form,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
    } as any)
    message.success('配置已保存')
    modalVisible.value = false
    fetchData()
  } catch { /* handled */ }
  finally { submitting.value = false }
}

async function onDelete(r: any) {
  await marketingApi.deleteShareSettings(r.regionId)
  message.success('已删除')
  fetchData()
}

fetchData()
</script>
