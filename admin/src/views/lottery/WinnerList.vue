<template><div class="page-container"><div class="page-card"><div class="page-header"><span class="page-title">中奖记录</span></div><DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps"><template #a="{r}"><a-space><a>详情</a></a-space></template></DataTable></div></div></template>
<script setup lang="ts">import {ref} from 'vue';import {lotteryApi} from '@/api/lottery';import {useRoute} from 'vue-router';import DataTable from '@/components/common/DataTable.vue'
const route=useRoute(),lotteryId=route.params.id as string
const ld=ref(false),list=ref<any[]>([]),t=ref(0),p=ref(1),ps=ref(20)
const cols=[{title:'ID',dataIndex:'id',width:80},{title:'用户',dataIndex:'user',width:120,format:(v:any)=>v?.nickname||'-'},{title:'奖品ID',dataIndex:'prizeId',width:120},{title:'时间',dataIndex:'createdAt',width:160}]
async function ft(){ld.value=true;try{const r=await lotteryApi.getWinnerList(lotteryId,{page:p.value,pageSize:ps.value});list.value=r.data.data?.list||r.data?.list||[];t.value=r.data.data?.total||r.data?.total||0}catch{}finally{ld.value=false}}
ft();
</script>
