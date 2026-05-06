<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">区域打卡配置</span>
      </div>

      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #isEnabled="{ record }">
          <a-tag :color="record.isEnabled ? 'green' : 'default'">{{ record.isEnabled ? '开启' : '关闭' }}</a-tag>
        </template>
        <template #action="{ record }">
          <a @click="onEdit(record)">配置</a>
        </template>
      </DataTable>
    </div>

    <a-drawer v-model:open="drawerVisible" title="编辑区域配置" :width="600" @ok="onSubmit">
      <a-form layout="vertical">
        <a-card title="基础设置" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="打卡开关">
                <a-switch v-model:checked="form.isEnabled" checked-children="开" un-checked-children="关" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="排行榜">
                <a-switch v-model:checked="form.enableRanking" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="排行榜周期" v-if="form.enableRanking">
            <a-radio-group v-model:value="form.rankingCycle">
              <a-radio value="DAILY">日榜</a-radio>
              <a-radio value="WEEKLY">周榜</a-radio>
              <a-radio value="MONTHLY">月榜</a-radio>
            </a-radio-group>
          </a-form-item>
        </a-card>

        <a-card title="打卡限制" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="每日最大打卡次数">
                <a-input-number v-model:value="form.maxDailyCheckins" :min="1" :max="100" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="同地点上限">
                <a-input-number v-model:value="form.maxLocationCheckins" :min="1" :max="20" style="width:100%" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="最小打卡间隔(秒)">
                <a-input-number v-model:value="form.minCheckinInterval" :min="0" :max="86400" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="允许同地重复">
                <a-switch v-model:checked="form.allowDuplicateLocation" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>

        <a-card title="位置验证" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="需要位置验证">
                <a-switch v-model:checked="form.requireLocationVerify" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="验证半径(米)">
                <a-input-number v-model:value="form.locationVerifyRadius" :min="10" :max="5000" style="width:100%" :disabled="!form.requireLocationVerify" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>

        <a-card title="内容设置" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="允许图片">
                <a-switch v-model:checked="form.allowImageUpload" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="最大图片数">
                <a-input-number v-model:value="form.maxImageCount" :min="0" :max="20" style="width:100%" :disabled="!form.allowImageUpload" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="允许视频">
                <a-switch v-model:checked="form.allowVideoUpload" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="必须填写内容">
                <a-switch v-model:checked="form.requireContent" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="最大内容长度">
            <a-input-number v-model:value="form.maxContentLength" :min="10" :max="2000" style="width:100%" />
          </a-form-item>
        </a-card>

        <a-card title="评论设置" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="允许评论">
                <a-switch v-model:checked="form.allowComment" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="允许回复">
                <a-switch v-model:checked="form.allowReply" :disabled="!form.allowComment" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="最大评论长度">
            <a-input-number v-model:value="form.maxCommentLength" :min="10" :max="1000" style="width:100%" :disabled="!form.allowComment" />
          </a-form-item>
        </a-card>

        <a-card title="时间设置" size="small" style="margin-bottom:16px">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="工作日开始">
                <a-input v-model:value="form.workingHoursStart" placeholder="HH:mm:ss" style="width:100%" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="工作日结束">
                <a-input v-model:value="form.workingHoursEnd" placeholder="HH:mm:ss" style="width:100%" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="周末允许">
                <a-switch v-model:checked="form.weekendEnabled" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="节假日允许">
                <a-switch v-model:checked="form.holidayEnabled" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>

        <a-card title="其他" size="small">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="共享地点">
                <a-switch v-model:checked="form.enableSharedLocations" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="用户建议">
                <a-switch v-model:checked="form.enableUserSuggest" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-card>
      </a-form>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { punchInApi } from '@/api/punchIn'
import DataTable from '@/components/common/DataTable.vue'
import dayjs from 'dayjs'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)

const cols = [
  { title: '区域ID', dataIndex: 'regionId', width: 200, ellipsis: true },
  { title: '打卡开关', dataIndex: 'isEnabled', width: 80, slot: 'isEnabled' },
  { title: '每日上限', dataIndex: 'maxDailyCheckins', width: 80 },
  { title: '位置验证', dataIndex: 'requireLocationVerify', width: 80 },
  { title: '评论', dataIndex: 'allowComment', width: 60 },
  { title: '排行榜', dataIndex: 'enableRanking', width: 70 },
  { title: '周期', dataIndex: 'rankingCycle', width: 80 },
  { title: '更新时间', dataIndex: 'updatedAt', width: 170 },
  { title: '操作', dataIndex: 'action', width: 70, slot: 'action' },
]

async function fetchData() {
  ld.value = true
  try {
    const res = await punchInApi.getConfigList({ page: p.value, pageSize: ps.value })
    list.value = res.data.data?.list || []
    t.value = res.data.data?.total || 0
  } catch { /* handled */ }
  finally { ld.value = false }
}

const drawerVisible = ref(false), currentRegionId = ref('')
const form = reactive({
  isEnabled: true, maxDailyCheckins: 10, maxLocationCheckins: 3, minCheckinInterval: 300,
  allowDuplicateLocation: true, requireLocationVerify: false, locationVerifyRadius: 100,
  allowImageUpload: true, maxImageCount: 9, allowVideoUpload: true,
  maxContentLength: 500, requireContent: false,
  allowComment: true, allowReply: true, maxCommentLength: 300,
  enableRanking: true, rankingCycle: 'WEEKLY' as string,
  enableSharedLocations: true, enableUserSuggest: true,
  workingHoursStart: '00:00:00', workingHoursEnd: '23:59:59',
  weekendEnabled: true, holidayEnabled: true,
})

async function onEdit(r: any) {
  currentRegionId.value = r.regionId
  try {
    const res = await punchInApi.getConfig(r.regionId)
    const data = res.data.data!
    Object.assign(form, {
      isEnabled: data.isEnabled, maxDailyCheckins: data.maxDailyCheckins,
      maxLocationCheckins: data.maxLocationCheckins, minCheckinInterval: data.minCheckinInterval,
      allowDuplicateLocation: data.allowDuplicateLocation,
      requireLocationVerify: data.requireLocationVerify, locationVerifyRadius: data.locationVerifyRadius,
      allowImageUpload: data.allowImageUpload, maxImageCount: data.maxImageCount,
      allowVideoUpload: data.allowVideoUpload,
      maxContentLength: data.maxContentLength, requireContent: data.requireContent,
      allowComment: data.allowComment, allowReply: data.allowReply, maxCommentLength: data.maxCommentLength,
      enableRanking: data.enableRanking, rankingCycle: data.rankingCycle,
      enableSharedLocations: data.enableSharedLocations, enableUserSuggest: data.enableUserSuggest,
      workingHoursStart: data.workingHoursStart, workingHoursEnd: data.workingHoursEnd,
      weekendEnabled: data.weekendEnabled, holidayEnabled: data.holidayEnabled,
    })
  } catch { /* use default */ }
  drawerVisible.value = true
}

async function onSubmit() {
  await punchInApi.updateConfig(currentRegionId.value, { ...form } as any)
  message.success('配置已保存')
  drawerVisible.value = false
  fetchData()
}

fetchData()
</script>
