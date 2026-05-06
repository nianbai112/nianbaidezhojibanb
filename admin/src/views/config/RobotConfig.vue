<template>
  <a-card title="机器人运营配置" :bordered="false">
    <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 14 }">
      <a-form-item label="每日发帖上限">
        <a-input-number v-model:value="form.postDailyLimit" :min="0" :max="9999" style="width: 180px" />
        <span class="form-hint">所有机器人每日总共最多发帖数量，0为不限</span>
      </a-form-item>
      <a-form-item label="每日评论上限">
        <a-input-number v-model:value="form.commentDailyLimit" :min="0" :max="9999" style="width: 180px" />
        <span class="form-hint">所有机器人每日总共最多评论数量，0为不限</span>
      </a-form-item>
      <a-form-item label="默认间隔(秒)">
        <a-input-number v-model:value="form.defaultInterval" :min="1" :max="3600" style="width: 180px" />
        <span class="form-hint">机器人连续操作之间的默认间隔时间</span>
      </a-form-item>
      <a-form-item label="自动审核">
        <a-switch v-model:checked="form.autoAudit" />
        <span class="form-hint">开启后机器人发布的内容自动通过审核</span>
      </a-form-item>
      <a-form-item label="启用区域">
        <a-select
          v-model:value="form.enabledRegions"
          mode="multiple"
          placeholder="请选择启用机器人的区域"
          style="width: 360px"
        >
          <a-select-option :value="1">北京</a-select-option>
          <a-select-option :value="2">上海</a-select-option>
          <a-select-option :value="3">广州</a-select-option>
          <a-select-option :value="4">深圳</a-select-option>
          <a-select-option :value="5">杭州</a-select-option>
          <a-select-option :value="6">成都</a-select-option>
          <a-select-option :value="7">武汉</a-select-option>
          <a-select-option :value="8">南京</a-select-option>
        </a-select>
        <span class="form-hint">仅在选中的区域启用机器人功能</span>
      </a-form-item>
      <a-form-item :wrapper-col="{ offset: 5, span: 14 }">
        <a-space>
          <a-button type="primary" :loading="saving" @click="onSave">保存配置</a-button>
          <a-popconfirm title="确定重置为默认值？" ok-text="确定" cancel-text="取消" @confirm="onReset">
            <a-button :loading="resetting">恢复默认</a-button>
          </a-popconfirm>
        </a-space>
      </a-form-item>
    </a-form>
  </a-card>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { configApi } from '@/api/config'
import type { RobotConfig } from '@/types/robot'

const form = reactive<RobotConfig>({
  postDailyLimit: 100,
  commentDailyLimit: 500,
  defaultInterval: 30,
  autoAudit: true,
  enabledRegions: [],
})

const saving = ref(false)
const resetting = ref(false)

async function loadConfig() {
  try {
    const res = await configApi.getRobotConfig()
    const data = (res.data?.data || res.data) as RobotConfig
    if (data) {
      form.postDailyLimit = data.postDailyLimit ?? 100
      form.commentDailyLimit = data.commentDailyLimit ?? 500
      form.defaultInterval = data.defaultInterval ?? 30
      form.autoAudit = data.autoAudit ?? true
      form.enabledRegions = data.enabledRegions ?? []
    }
  } catch {
    /* loaded defaults */
  }
}

loadConfig()

async function onSave() {
  saving.value = true
  try {
    await configApi.saveRobotConfig({
      postDailyLimit: form.postDailyLimit,
      commentDailyLimit: form.commentDailyLimit,
      defaultInterval: form.defaultInterval,
      autoAudit: form.autoAudit,
      enabledRegions: form.enabledRegions,
    })
    message.success('保存成功')
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function onReset() {
  resetting.value = true
  try {
    await configApi.reset('robot')
    await loadConfig()
    message.success('已重置为默认值')
  } catch {
    message.error('重置失败')
  } finally {
    resetting.value = false
  }
}
</script>

<style lang="less" scoped>
.form-hint {
  margin-left: 12px;
  font-size: 13px;
  color: #9ca3af;
}
</style>
