<template><div class="page-container"><div class="page-card"><div class="page-header"><span class="page-title">库存预警</span><a-tag color="red">低于预警线</a-tag></div><DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps"/></div></div></template>
<script setup lang="ts">import {ref} from 'vue';import {shopApi} from '@/api/shop';import DataTable from '@/components/common/DataTable.vue'
const ld=ref(false),list=ref<any[]>([]),t=ref(0),p=ref(1),ps=ref(20);const cols=[{title:'商品',dataIndex:'name',width:200},{title:'商家',dataIndex:'merchantName',width:120},{title:'总库存',dataIndex:'totalStock',width:80},{title:'预警线',dataIndex:'alertStock',width:80}]
async function ft(){ld.value=true;try{const r=await shopApi.getStockAlerts({page:p.value,pageSize:ps.value});list.value=r.data.data.list;t.value=r.data.data.total}catch{}finally{ld.value=false}}
ft();
</script>
