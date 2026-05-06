<template><div class="page-container"><div class="page-card"><DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps"><template #a="{r}"><a-space><a @click="onHandle(r,'blocked')" style="color:#ef4444">封禁</a><a @click="onHandle(r,'ignored')" style="color:#9ca3af">忽略</a></a-space></template></DataTable></div></div></template>
<script setup lang="ts">import {ref} from 'vue';import {message} from 'ant-design-vue';import {messageApi} from '@/api/message';import DataTable from '@/components/common/DataTable.vue'
const ld=ref(false),list=ref<any[]>([]),t=ref(0),p=ref(1),ps=ref(20);const cols=[{title:'发送者',dataIndex:'senderNickname',width:100},{title:'内容',dataIndex:'content',width:300},{title:'举报',dataIndex:'reportCount',width:60},{title:'状态',dataIndex:'handledStatus',width:80},{title:'时间',dataIndex:'createdAt',width:160},{title:'操作',dataIndex:'action',width:120,slot:'a'}]
async function ft(){ld.value=true;try{const r=await messageApi.getViolationList({page:p.value,pageSize:ps.value});list.value=r.data.data.list;t.value=r.data.data.total}catch{}finally{ld.value=false}}
async function onHandle(r:any,status:string){await messageApi.handleViolation(r.id,status,'');message.success('已处理');ft()}
ft();
</script>
