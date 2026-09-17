<template>
  <div class="panel-container">

    <!-- 业务能力总开关 -->
    <div class="glass-card review-banner" :class="{ active: form.enabled }">
      <div class="banner-left">
        <el-icon class="banner-icon"><DocumentChecked /></el-icon>
        <div>
          <div class="banner-title">小程序业务能力开关</div>
          <div class="banner-desc">
            用于决定全部真实用户可以看到和进入哪些业务。开启总控后，下方选中的业务将保持关闭，
            <strong>配置必须与实际运营状态、服务资质和已发布版本一致。</strong>
          </div>
        </div>
      </div>
      <el-switch
        v-model="form.enabled"
        size="large"
        active-text="能力管控已开启"
        inactive-text="全部业务开放"
        :active-color="'var(--el-color-warning)'"
      />
    </div>

    <!-- 提示 -->
    <el-alert
      v-if="form.enabled"
      title="业务能力管控已开启 — 下方配置对全部小程序用户持续生效，请按真实运营状态保存。"
      type="warning"
      show-icon
      :closable="false"
    />

    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">首页登录方式</div>
        <div class="card-subtitle">控制未登录用户进入小程序时的浏览入口</div>
      </div>
      <div class="card-body">
        <div class="switch-item">
          <div>
            <div class="switch-label">允许游客浏览首页</div>
            <div class="switch-desc">开启后，用户可先浏览公开内容，再自行登录；此设置独立于业务总控，正式运营期间同样生效。</div>
            <div class="form-tip">学生认证、私人消息和交易权限仍按原规则校验。需要发布支持此配置的小程序版本后生效。</div>
          </div>
          <el-switch v-model="form.allowGuestBrowsing" aria-label="允许游客浏览首页" />
        </div>
      </div>
    </div>

    <!-- 受控业务模块 -->
    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">受控业务模块</div>
        <div class="card-subtitle">仅关闭当前确实未运营、未具备条件或正在维护的业务</div>
      </div>
      <div class="card-body">
        <div class="switch-grid">
          <div v-for="item in moduleItems" :key="item.key" class="switch-item">
            <div>
              <div class="switch-label">
                {{ item.label }}
                <el-tag v-if="item.impact === 'high'" type="danger" size="small" effect="light" class="risk-tag">影响大</el-tag>
                <el-tag v-else-if="item.impact === 'mid'" type="warning" size="small" effect="light" class="risk-tag">影响中</el-tag>
              </div>
              <div class="switch-desc">{{ item.desc }}</div>
            </div>
            <el-switch v-model="form[item.key]" :disabled="!form.enabled" />
          </div>
        </div>
      </div>
    </div>

    <!-- 停用提示文案 -->
    <div class="glass-card">
      <div class="card-header">
        <div class="card-title">停用功能提示文案</div>
        <div class="card-subtitle">用户尝试通过历史链接进入已停用业务时显示</div>
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
          <span>总控开启后，选中的业务会从全部用户入口和导航中移除，并阻止历史链接继续进入。</span>
        </div>
        <div class="tip-item">
          <span class="tip-num">2</span>
          <span>提审前、审核期间和审核通过后必须保持同一真实运营配置，禁止为不同人群临时切换。</span>
        </div>
        <div class="tip-item">
          <span class="tip-num">3</span>
          <span>支持动态刷新的客户端发布后，切换配置无需重新打包：启动、返回前台时立即请求，停留前台时每 30 秒检查一次。网络正常且请求成功后生效；旧客户端需先升级，变更前请完成业务验收。</span>
        </div>
        <div class="tip-item">
          <span class="tip-num">4</span>
          <span>关闭用户入口不会删除数据；存量订单、退款和履约仍由后台及对应工作端继续处理。</span>
        </div>
        <div class="tip-item">
          <span class="tip-num">5</span>
          <span>此处控制小程序入口与页面路由，不替代服务端停机策略；如需彻底禁止新订单，必须同步关闭对应后端业务策略。</span>
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
  enabled: true,
  allowGuestBrowsing: true,
  hideDelivery: true,
  hideMall: true,
  hideErrand: true,
  hideWallet: true,
  hideTopup: true,
  hideVirtualGoods: true,
  hideShareInvite: true,
  hideDating: true,
  placeholderText: '该功能即将上线',
})

const moduleItems = [
  { key: 'hideDelivery', label: '外卖板块', impact: 'high', desc: '关闭小程序首页外卖、商家列表和新订单入口，存量订单继续履约' },
  { key: 'hideErrand', label: '跑腿板块', impact: 'high', desc: '关闭小程序跑腿下单和发布入口，存量订单及骑手履约不受影响' },
  { key: 'hideWallet', label: '钱包余额', impact: 'high', desc: '关闭用户钱包入口和余额展示' },
  { key: 'hideTopup', label: '余额充值', impact: 'high', desc: '关闭用户余额充值入口' },
  { key: 'hideVirtualGoods', label: '虚拟商品/积分/会员', impact: 'high', desc: '关闭积分、会员、礼包、成长值和虚拟商品入口' },
  { key: 'hideMall', label: '商城板块', impact: 'mid', desc: '关闭小程序商城浏览和新订单入口，存量订单、退款及经营端继续可用' },
  { key: 'hideShareInvite', label: '分享有礼/邀请奖励', impact: 'mid', desc: '关闭分享奖励和邀请返利入口' },
]

async function load() {
  loading.value = true
  try {
    const res: any = await request.get('/admin/config/app-capabilities')
    const data = res?.data || res
    form.allowGuestBrowsing = typeof data?.allowGuestBrowsing === 'boolean' ? data.allowGuestBrowsing : true
    ;(Object.keys(form) as Array<keyof typeof form>).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) form[key] = data[key] as never
    })
  } catch (e: any) {
    ElMessage.error(e?.message || '加载业务能力配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  const submitted = { ...form }
  try {
    const res: any = await request.put('/admin/config/app-capabilities', submitted)
    const saved = res?.data || res
    if (saved?.allowGuestBrowsing !== submitted.allowGuestBrowsing) {
      ElMessage.warning('后端尚未确认游客浏览配置，请部署支持此配置的后端后重新保存')
      return
    }
    ElMessage.success(submitted.enabled ? '业务能力配置已保存，将对全部小程序用户生效' : '业务能力总控已关闭，全部业务入口恢复开放')
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
