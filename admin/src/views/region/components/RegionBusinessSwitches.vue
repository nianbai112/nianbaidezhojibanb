<template>
  <div class="section-card glass-card">
    <div class="section-head">
      <div class="card-title">功能开关与显示控制</div>
    </div>
    <div class="switch-grid">
      <div class="switch-item">
        <div>
          <b>显示热门榜单</b>
          <p>首页是否展示热门内容榜单</p>
        </div>
        <el-switch v-model="showHotList" />
      </div>
      <div class="switch-item">
        <div>
          <b>开启私信</b>
          <p>用户之间是否可以私信</p>
        </div>
        <el-switch v-model="privateMessageEnabled" />
      </div>
      <div class="switch-item">
        <div>
          <b>通讯录需学生认证</b>
          <p>查看通讯录前需完成学生认证</p>
        </div>
        <el-switch v-model="contactsRequireStudentAuth" />
      </div>
      <div class="switch-item">
        <div>
          <b>仅认证用户可访问</b>
          <p>未认证学生无法进入此区域</p>
        </div>
        <el-switch v-model="onlyStudentAuthUsers" />
      </div>
      <div class="switch-item">
        <div>
          <b>开启群聊</b>
          <p>是否允许用户创建群聊</p>
        </div>
        <el-switch v-model="groupChatEnabled" />
      </div>
      <div class="switch-item">
        <div>
          <b>二维码过滤</b>
          <p>扫描二维码需验证区域归属</p>
        </div>
        <el-switch v-model="enableQrcodeFilter" />
      </div>
    </div>
    <el-divider />
    <el-form label-position="top">
      <div class="form-grid two relaxed">
        <el-form-item label="热门精选显示模式">
          <el-select v-model="hotFeaturedDisplay" style="width:100%">
            <el-option label="不显示" value="none" />
            <el-option label="仅热门" value="hot" />
            <el-option label="仅精选" value="featured" />
            <el-option label="混合显示" value="mixed" />
          </el-select>
        </el-form-item>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  showHotList?: boolean
  privateMessageEnabled?: boolean
  contactsRequireStudentAuth?: boolean
  onlyStudentAuthUsers?: boolean
  groupChatEnabled?: boolean
  enableQrcodeFilter?: boolean
  hotFeaturedDisplay?: string
}

const props = withDefaults(defineProps<Props>(), {
  showHotList: false,
  privateMessageEnabled: true,
  contactsRequireStudentAuth: false,
  onlyStudentAuthUsers: false,
  groupChatEnabled: false,
  enableQrcodeFilter: false,
  hotFeaturedDisplay: 'none'
})

const emit = defineEmits<{
  'update:showHotList': [value: boolean]
  'update:privateMessageEnabled': [value: boolean]
  'update:contactsRequireStudentAuth': [value: boolean]
  'update:onlyStudentAuthUsers': [value: boolean]
  'update:groupChatEnabled': [value: boolean]
  'update:enableQrcodeFilter': [value: boolean]
  'update:hotFeaturedDisplay': [value: string]
}>()

const showHotList = computed({
  get: () => props.showHotList,
  set: (val) => emit('update:showHotList', val)
})

const privateMessageEnabled = computed({
  get: () => props.privateMessageEnabled,
  set: (val) => emit('update:privateMessageEnabled', val)
})

const contactsRequireStudentAuth = computed({
  get: () => props.contactsRequireStudentAuth,
  set: (val) => emit('update:contactsRequireStudentAuth', val)
})

const onlyStudentAuthUsers = computed({
  get: () => props.onlyStudentAuthUsers,
  set: (val) => emit('update:onlyStudentAuthUsers', val)
})

const groupChatEnabled = computed({
  get: () => props.groupChatEnabled,
  set: (val) => emit('update:groupChatEnabled', val)
})

const enableQrcodeFilter = computed({
  get: () => props.enableQrcodeFilter,
  set: (val) => emit('update:enableQrcodeFilter', val)
})

const hotFeaturedDisplay = computed({
  get: () => props.hotFeaturedDisplay,
  set: (val) => emit('update:hotFeaturedDisplay', val)
})
</script>

<style scoped lang="scss">
.section-card {
  padding: 0;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 4px;
}

.switch-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  padding: 16px 24px 24px;
}

.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid color-mix(in srgb, var(--mx-border) 60%, transparent);
}

.switch-item b {
  font-size: 14px;
}

.switch-item p {
  margin: 4px 0 0;
  color: var(--mx-muted);
  font-size: 12px;
}

.section-card :deep(.el-form) {
  padding: 16px 24px 24px;
}

.relaxed {
  gap: 16px 24px;
}

@media (max-width: 768px) {
  .switch-grid {
    grid-template-columns: 1fr;
  }
}
</style>
