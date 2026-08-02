<template>
  <!-- 真机商家卡复刻：DOM/class 对齐 components/MerchantCard.wxml -->
  <div class="native-merchant">
    <div class="merchant-card">
      <div class="merchant-header">
        <img class="merchant-logo" :src="m.logo" alt="" />
        <div class="merchant-info">
          <div class="name-rating">
            <div class="merchant-name">{{ m.name }}</div>
            <div class="delivery-tag">{{ m.deliveryTag }}</div>
          </div>
          <div class="merchant-basic-info">
            <div class="basic-left">
              <span>{{ m.sales }}</span>
              <span class="separator">|</span>
              <span>起送¥{{ m.minOrder }}</span>
              <span class="separator">|</span>
              <span>{{ m.distance }}</span>
            </div>
            <div class="basic-right">
              <span>{{ m.eta }}分钟</span>
            </div>
          </div>
          <div class="merchant-rating">
            <span class="rating-score">{{ m.score }}分</span>
            <div class="merchant-tags">
              <div v-for="t in m.tags" :key="t" class="merchant-tag">
                <span>{{ t }}</span>
              </div>
            </div>
          </div>
          <div class="merchant-activities">
            <div class="activity-tag avg-cost">
              <span class="txtIcon icon-money" />
              <span>人均 ¥{{ m.avgCost }}</span>
            </div>
            <div class="activity-tag coupon-tag">
              <span class="txtIcon icon-gold-coin" />
              <span>红包{{ m.couponOff }}元</span>
            </div>
            <div class="activity-tag">满70减5</div>
            <div class="activity-tag">新客立减</div>
          </div>
        </div>
      </div>
      <div class="promotion-section">
        <div class="coupon-section">
          <div class="big-coupon">
            <div class="coupon-content">
              <div class="coupon-label">外卖红包</div>
              <div class="coupon-value">
                <span class="symbol">¥</span>
                <span class="amount">{{ m.coupon }}</span>
              </div>
              <div class="coupon-desc">满{{ m.couponThreshold }}可用</div>
            </div>
            <div class="use-btn">去使用 <span class="txtIcon icon-arrow" /></div>
          </div>
        </div>
        <div class="products-scroll">
          <div v-for="(p, i) in m.products" :key="i" class="product-item">
            <div v-if="i === 0" class="product-tag">超值推荐</div>
            <img class="product-image" :src="p.image" :style="{ objectPosition: p.position }" alt="" />
            <div class="product-name">{{ p.name }}</div>
            <div class="product-price">
              <div class="price-info">
                <span class="sale-price">¥{{ p.price }}</span>
                <span v-if="p.originPrice" class="original-price">¥{{ p.originPrice }}</span>
              </div>
              <div class="add-btn">
                <span class="txtIcon icon-plus" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="native-note">{{ source === 'real' ? '真实商家数据 · 与线上一致' : '演示数据 · 线上为真实内容' }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { request } from '@/api/request'
import { ensureCanvasTheme, injectRealWxss, realImage } from './realWxss'
import { ensureIconfont } from './iconfont'

const props = withDefaults(defineProps<{ regionId?: string }>(), { regionId: 'global' })

const source = ref<'real' | 'demo'>('demo')

interface ProductVM { name: string; price: number | string; originPrice: number | string; image: string; position: string }
interface MerchantVM {
  name: string; logo: string; deliveryTag: string; sales: string; minOrder: number | string
  distance: string; eta: number | string; score: number | string; tags: string[]
  avgCost: number | string; couponOff: number; coupon: number; couponThreshold: number
  products: ProductVM[]
}

/** 兜底演示商家（图片位使用 uploads 真实照片错位裁剪） */
function demoMerchant(): MerchantVM {
  return {
    name: '蜜雪冰城（东门店）',
    logo: realImage(1).url,
    deliveryTag: '校园专送',
    sales: '月售3000+',
    minOrder: 15,
    distance: '800m',
    eta: 25,
    score: 4.8,
    tags: ['放心吃', '准时达'],
    avgCost: 12,
    couponOff: 3,
    coupon: 5,
    couponThreshold: 25,
    products: [
      { name: '冰鲜柠檬水', price: 4, originPrice: 5, image: realImage(0).url, position: 'top' },
      { name: '珍珠奶茶（大杯）', price: 8, originPrice: 10, image: realImage(1).url, position: 'center' },
      { name: '满杯百香果', price: 9, originPrice: 0, image: realImage(2).url, position: 'bottom' },
      { name: '雪王大圣代', price: 6, originPrice: 7, image: realImage(0).url, position: 'center' },
    ],
  }
}

const m = ref<MerchantVM>(demoMerchant())

/** 真实商家 → 卡片视图模型（防御式映射 shop.service getByRegion 字段） */
function mapMerchant(x: any): MerchantVM {
  const base = demoMerchant()
  const products = (Array.isArray(x.products) ? x.products : Array.isArray(x.hotProducts) ? x.hotProducts : [])
    .slice(0, 4)
    .map((p: any, i: number) => ({
      name: p.name || p.title || '商品',
      price: p.price ?? p.salePrice ?? 0,
      originPrice: p.originPrice ?? p.originalPrice ?? 0,
      image: p.image || p.cover || p.logo || realImage(i).url,
      position: 'center',
    }))
  return {
    ...base,
    name: x.name || x.merchantName || base.name,
    logo: x.logo || x.avatar || x.cover || base.logo,
    deliveryTag: x.deliveryTag || x.delivery_tag || base.deliveryTag,
    sales: x.sales || x.monthlySales ? `月售${x.sales || x.monthlySales}` : base.sales,
    minOrder: x.minOrder ?? x.min_order ?? base.minOrder,
    distance: x.distance || x.distanceText || base.distance,
    eta: x.eta ?? x.deliveryTime ?? base.eta,
    score: x.score ?? x.rating ?? base.score,
    avgCost: x.avgCost ?? x.avg_cost ?? x.perCapita ?? base.avgCost,
    products: products.length ? products : base.products,
  }
}

async function loadRealMerchant() {
  try {
    const res: any = await request.get(`/merchants/region/${props.regionId || 'global'}`, {
      params: { page: 1, pageSize: 1 },
    })
    const list = res?.merchants || res?.list || res?.data || []
    if (Array.isArray(list) && list.length) {
      m.value = mapMerchant(list[0])
      source.value = 'real'
      return
    }
    console.warn(`[native-merchant] 区域 ${props.regionId || 'global'} 暂无真实商家，回退演示数据`)
  } catch (e) {
    console.warn('[native-merchant] 真实商家拉取失败，回退演示数据', e)
  }
}

onMounted(() => {
  injectRealWxss('native-merchant-wxss', [
    { path: 'components/MerchantCard.wxss', scope: '.native-merchant' },
  ])
  ensureCanvasTheme()
  ensureIconfont()
  loadRealMerchant()
})
</script>

<style scoped>
.native-merchant {
  pointer-events: none;
  padding: 8px 12px;
  box-sizing: border-box;
}
/* scroll-view scroll-x → 横向滚动 */
.products-scroll {
  overflow-x: auto;
  scrollbar-width: none;
}
.products-scroll::-webkit-scrollbar {
  display: none;
}
.merchant-logo,
.product-image {
  object-fit: cover;
  display: block;
}
/* 图标微调（字形来自真机 iconfont） */
.add-btn .txtIcon {
  color: #fff;
  font-size: 12px;
  line-height: 1;
}
.coupon-tag .txtIcon,
.avg-cost .txtIcon {
  font-size: 10px;
}
.native-note {
  padding: 0 0 6px;
  text-align: center;
  font-size: 10px;
  color: var(--text-tertiary, #8a9384);
}
</style>
