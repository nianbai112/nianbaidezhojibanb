<template>
  <section class="section-card glass-card">
    <div class="section-head"><div><div class="card-title">我的侧边栏菜单</div><div class="form-tip">只允许选择已有页面，保存后按区域生效。</div></div></div>
    <div v-for="(group, groupIndex) in model.groups" :key="group.id" class="drawer-group">
      <el-input v-model="group.title" placeholder="分组标题" />
      <div v-for="(item, itemIndex) in group.items" :key="item.id" class="drawer-item">
        <el-input v-model="item.title" placeholder="入口名称" />
        <el-select v-model="item.icon" placeholder="选择图标">
          <el-option v-for="icon in icons" :key="icon.value" :label="icon.label" :value="icon.value">
            <span class="icon-option"><i :class="['txtIcon', icon.value]"></i>{{ icon.label }}</span>
          </el-option>
        </el-select>
        <el-select v-model="item.path" placeholder="选择页面"><el-option v-for="page in pages" :key="page.path" :label="page.label" :value="page.path" /></el-select>
        <el-select v-model="item.permission"><el-option label="所有用户" value="all" /><el-option label="商家" value="merchant" /><el-option label="骑手" value="rider" /><el-option label="区域管理员" value="manager" /></el-select>
        <el-switch v-model="item.enabled" active-text="显示" inactive-text="隐藏" />
        <el-button size="small" :disabled="itemIndex === 0" @click="moveItem(groupIndex, itemIndex, -1)">上移</el-button><el-button size="small" :disabled="itemIndex === group.items.length - 1" @click="moveItem(groupIndex, itemIndex, 1)">下移</el-button>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ modelValue: any }>()
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()
const pages = [{ label: '我的钱包', path: '/pagesA/wallet/wallet' }, { label: '浏览记录', path: '/pages/auth/BrowsingHistory/BrowsingHistory' }, { label: '活动中心', path: '/pagesA/selection/list/list?tabIndex=0' }, { label: '我的报名', path: '/pagesA/selection/list/list?tabIndex=1' }, { label: '我的票券', path: '/pagesA/ticket-wallet/ticket-wallet' }, { label: '我的买入', path: '/pagesC/SecondHand/MySecondHand/MySecondHand?tab=orders&role=buyer' }, { label: '我的卖出', path: '/pagesC/SecondHand/MySecondHand/MySecondHand?tab=orders&role=seller' }, { label: '收货地址', path: '/pages/address/address' }, { label: '我的认证', path: '/pages/auth/StudentCertification/StudentCertification' }, { label: '我的会员', path: '/pagesA/MemberCenter/MemberCenter' }]
const icons = [{ label: '钱包', value: 'icon-qianbao' }, { label: '浏览记录', value: 'icon-clock-o' }, { label: '活动', value: 'icon-flag-o' }, { label: '报名', value: 'icon-description' }, { label: '票券', value: 'icon-bill' }, { label: '买入', value: 'icon-goods-collect-o' }, { label: '卖出', value: 'icon-shop-o' }, { label: '收货地址', value: 'icon-location-o' }, { label: '账号认证', value: 'icon-user-o' }, { label: '会员', value: 'icon-vip' }]
const model = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
function moveItem(groupIndex: number, itemIndex: number, direction: number) { const items = model.value.groups[groupIndex].items; const target = itemIndex + direction; if (target < 0 || target >= items.length) return; [items[itemIndex], items[target]] = [items[target], items[itemIndex]]; emit('update:modelValue', { ...model.value, groups: [...model.value.groups] }) }
</script>
<style scoped>.section-card{padding:24px}.card-title{font-size:18px;font-weight:800}.form-tip{color:var(--mx-muted);font-size:12px;margin-top:5px}.drawer-group{padding:16px;border:1px solid #e5ecd9;border-radius: 14px;margin-top:14px}.drawer-item{display:grid;grid-template-columns:1fr 1fr 1.5fr 110px auto auto auto;gap:8px;align-items:center;margin-top:10px}.icon-option{display:flex;align-items:center;gap:8px}.icon-option .txtIcon{width:18px;text-align:center}</style>
