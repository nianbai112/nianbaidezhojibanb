<template>
  <div class="panel-container">

    <!-- 总开关横幅 -->
    <div class="glass-card review-banner" :class="{ active: form.enabled }">
      <div class="banner-left">
        <el-icon class="banner-icon"><DocumentChecked /></el-icon>
        <div>
          <div class="banner-title">小程序审核模式</div>
          <div class="banner-desc">
            开启后，小程序端会按下方配置隐藏或替换敏感功能，通过审核后关闭即可恢复。
            <strong>后台管理功能不受影响。</strong>
          </div>
        </div>
      </div>
      <el-switch
        v-model="form.enabled"
        size="large"
        active-text="审核模式已开启"
        inactive-text="正常运营模式"
        :active-color="'var(--el-color-warning)'"
      />
    </div>

    <!-- 提示 -->
    <el-alert
      v-if="form.enabled"
      title="审核模式已开启 — 小程序用户将看到下方配置的隐藏效果，请确认保存后再提交审核。"
      type="warning"
      show-icon
      :closable="false"
    />

    <!-- 功能模块隐藏 -->
    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">功能模块隐藏</div>
        <div class="card-subtitle">以下模块在审核期间易触发拒审，建议全部隐藏</div>
      </div>
      <div class="card-body">
        <div class="switch-grid">
          <div v-for="item in moduleItems" :key="item.key" class="switch-item">
            <div>
              <div class="switch-label">
                {{ item.label }}
                <el-tag v-if="item.risk === 'high'" type="danger" size="small" effect="light" class="risk-tag">高风险</el-tag>
                <el-tag v-else-if="item.risk === 'mid'" type="warning" size="small" effect="light" class="risk-tag">中风险</el-tag>
              </div>
              <div class="switch-desc">{{ item.desc }}</div>
            </div>
            <el-switch v-model="form[item.key]" :disabled="!form.enabled" />
          </div>
        </div>
      </div>
    </div>

    <!-- 占位文案 -->
    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">隐藏功能占位文案</div>
        <div class="card-subtitle">被隐藏的功能入口将显示此文案</div>
      </div>
      <div class="card-body">
        <el-input
          v-model="form.placeholderText"
          placeholder="如：该功能即将上线"
          :disabled="!form.enabled"
          maxlength="30"
          show-word-limit
          style="max-width: 360px"
        />
        <div class="form-tip">留空则直接隐藏入口，不显示占位提示</div>
      </div>
    </div>

    <!-- 操作说明 -->
    <div class="glass-card tips-card">
      <div class="card-header"><div class="card-title">使用说明</div></div>
      <div class="card-body tips-body">
        <div class="tip-item">
          <span class="tip-num">1</span>
          <span>提交审核前，在此开启审核模式并保存。</span>
        </div>
        <div class="tip-item">
          <span class="tip-num">2</span>
          <span>审核通过后，回到此处关闭并保存，小程序下次启动或回到前台时恢复完整功能。</span>
        </div>
        <div class="tip-item">
          <span class="tip-num">3</span>
          <span>配置通过公开接口下发，无需重新打包或发版；已打开的小程序回到前台后会自动刷新。</span>
        </div>
        <div class="tip-item">
          <span class="tip-num">4</span>
          <span>后台管理员的所有操作不受审核模式影响，数据正常读写。</span>
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
import { DocumentChecked } from '@element-plus/icons-vue'
import { request } from '@/api/request'

const loading = ref(false)
const saving = ref(false)

const form = reactive({
  enabled: false,
  hideDelivery: true,
  hideMall: false,
  hideErrand: true,
  hideWallet: true,
  hideTopup: true,
  hideVirtualGoods: true,
  hideShareInvite: false,
  hideDating: true,
  placeholderText: '该功能即将上线',
})

const moduleItems = [
  { key: 'hideDelivery', label: '外卖板块', risk: 'high', desc: '隐藏首页外卖入口、商家列表、商品下单等全部外卖功能' },
  { key: 'hideErrand', label: '跑腿板块', risk: 'high', desc: '隐藏跑腿下单入口，骑手接单功能不受影响' },
  { key: 'hideWallet', label: '钱包余额', risk: 'high', desc: '隐藏用户钱包余额展示，防止被认定为虚拟货币' },
  { key: 'hideTopup', label: '余额充值', risk: 'high', desc: '隐藏充值入口，避免被认定为支付功能合规问题' },
  { key: 'hideVirtualGoods', label: '虚拟商品/积分/会员', risk: 'high', desc: '隐藏积分商城、会员购买、付费内容等虚拟商品入口' },
  { key: 'hideMall', label: '商城板块', risk: 'mid', desc: '隐藏商城首页及商品列表（外卖和商城共用时谨慎开启）' },
  { key: 'hideShareInvite', label: '分享有礼/邀请奖励', risk: 'mid', desc: '隐藏分享奖励、邀请返利等营销功能' },
  { key: 'hideDating', label: '对象匹配/交友功能', risk: 'high', desc: '隐藏交友、匹配类功能入口' },
]

async function load() {
  loading.value = true
  try {
    const res: any = await request.get('/admin/config/app-review-mode')
    const data = res?.data || res
    ;(Object.keys(form) as Array<keyof typeof form>).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) form[key] = data[key] as never
    })
  } catch (e: any) {
    ElMessage.error(e?.message || '加载审核模式配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await request.put('/admin/config/app-review-mode', { ...form })
    ElMessage.success(form.enabled ? '审核模式已开启并保存，小程序下次启动或回到前台时生效' : '审核模式已关闭，保存成功')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.panel-container { display: grid; gap: 24px; }

/* 总开关横幅 */
.review-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 24px;
  border: 2px solid var(--el-border-color-light);
  transition: border-color 0.2s, background 0.2s;
}
.review-banner.active {
  border-color: var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
}
.banner-left { display: flex; align-items: center; gap: 16px; }
.banner-icon { font-size: 32px; color: var(--el-color-warning); flex-shrink: 0; }
.banner-title { font-size: 16px; font-weight: 700; color: var(--el-text-color-primary); margin-bottom: 4px; }
.banner-desc { font-size: 13px; color: var(--el-text-color-regular); line-height: 1.6; }

/* 开关列表 */
.switch-grid { display: grid; gap: 12px; }
.switch-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.switch-label { font-weight: 600; font-size: 14px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
.switch-desc { color: var(--el-text-color-placeholder); font-size: 12px; }
.risk-tag { pointer-events: none; }

.form-tip { color: var(--el-text-color-placeholder); font-size: 12px; margin-top: 8px; }

/* 说明 */
.tips-card { background: var(--el-fill-color-lighter); }
.tips-body { display: flex; flex-direction: column; gap: 12px; }
.tip-item { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--el-text-color-regular); line-height: 1.6; }
.tip-num {
  flex-shrink: 0;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--el-color-primary-light-7);
  color: var(--el-color-primary);
  font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}

.panel-actions { display: flex; justify-content: flex-end; gap: 12px; padding-top: 8px; }
</style>
