<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="f.keyword" placeholder="商品标题" allow-clear style="width:180px" />
      <a-select v-model:value="f.regionId" placeholder="区域" allow-clear style="width:150px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-input v-model:value="f.category" placeholder="分类" allow-clear style="width:120px" />
      <a-select v-model:value="f.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="ON_SALE">在售</a-select-option>
        <a-select-option value="SOLD">已售</a-select-option>
        <a-select-option value="OFFLINE">下架</a-select-option>
      </a-select>
    </FilterBar>
    <div class="page-card">
      <DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps">
        <template #cover="{ record }">
          <a-image :src="record.images?.[0]" :width="50" :height="50" style="object-fit:cover;border-radius:4px" />
        </template>
        <template #price="{ record }">{{ (Number(record.price)).toFixed(2) }}</template>
        <template #user="{ record }">
          <a-space><a-avatar :src="record.user?.avatar" size="small" /><span>{{ record.user?.nickname || '-' }}</span></a-space>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'ON_SALE' ? 'green' : record.status === 'SOLD' ? 'blue' : 'default'">
            {{ record.status === 'ON_SALE' ? '在售' : record.status === 'SOLD' ? '已售' : '下架' }}
          </a-tag>
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="$router.push(`/second-hand/product/${record.id}`)">详情</a>
            <a @click="onToggle(record)" v-permission="'secondhand:audit'">{{ record.status === 'ON_SALE' ? '下架' : '上架' }}</a>
            <a-popconfirm title="确定删除该商品？" @confirm="onDelete(record)" v-permission="'secondhand:audit'">
              <a style="color:#ff4d4f">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { secondHandApi } from '@/api/secondHand'
import { areaApi } from '@/api/area'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const ld = ref(false), list = ref<any[]>([]), t = ref(0), p = ref(1), ps = ref(20)
const regionOpts = ref<any[]>([])
const f = reactive({ keyword: '', regionId: undefined as string | undefined, category: '', status: undefined as string | undefined })

const cols = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '封面', dataIndex: 'images', width: 70, slot: 'cover' },
  { title: '标题', dataIndex: 'title', width: 200 },
  { title: '分类', dataIndex: 'category', width: 100 },
  { title: '价格', dataIndex: 'price', width: 90, slot: 'price' },
  { title: '发布人', dataIndex: 'user', width: 130, slot: 'user' },
  { title: '浏览量', dataIndex: 'viewCount', width: 80 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 160, slot: 'action' },
]

async function fetchRegions() {
  try {
    const res = await areaApi.getList({ page: 1, pageSize: 200 })
    regionOpts.value = (res.data as any).list || []
  } catch { /* ignore */ }
}

async function fetchList() {
  ld.value = true
  try {
    const r = await secondHandApi.getProductList({
      page: p.value, pageSize: ps.value,
      keyword: f.keyword || undefined,
      regionId: f.regionId,
      category: f.category || undefined,
      status: f.status,
    })
    const data = r.data as any
    list.value = data.list || data.data?.list || []
    t.value = data.total || data.data?.total || 0
  } catch { /* ignore */ }
  finally { ld.value = false }
}

function onSearch() { p.value = 1; fetchList() }
function onReset() { f.keyword = ''; f.regionId = undefined; f.category = ''; f.status = undefined; onSearch() }

async function onToggle(r: any) {
  const ns = r.status === 'ON_SALE' ? 'OFFLINE' : 'ON_SALE'
  await secondHandApi.updateStatus(r.id, ns)
  message.success('已更新')
  fetchList()
}

async function onDelete(r: any) {
  await secondHandApi.deleteProduct(r.id)
  message.success('已删除')
  fetchList()
}

onMounted(() => { fetchRegions(); fetchList() })
</script>
