<template><div class="page-container"><div class="page-card"><DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps"><template #type="{r}"><a-tag :color="r.type==='group'?'blue':'green'">{{r.type==='group'?'群聊':'私聊'}}</a-tag></template><template #a="{r}"><a-space><a @click="onView(r)">查看</a><a @click="onBlock(r)" :style="{color:r.status===1?'#ef4444':'#10b981'}">{{r.status===1?'封禁':'解封'}}</a></a-space></template></DataTable></div></div></template>
<script setup lang="ts">import {ref} from 'vue';import {message} from 'ant-design-vue';import {messageApi} from '@/api/message';import DataTable from '@/components/common/DataTable.vue'
const ld=ref(false),list=ref<any[]>([]),t=ref(0),p=ref(1),ps=ref(20);const cols=[{title:'会话',dataIndex:'name',width:180},{title:'类型',slot:'type',width:70},{title:'最后消息',dataIndex:'lastMessage',width:300},{title:'未读',dataIndex:'unreadCount',width:60},{title:'时间',dataIndex:'lastMessageTime',width:160},{title:'操作',dataIndex:'action',width:100,slot:'a'}]
async function ft(){ld.value=true;try{const r=await messageApi.getConversationList({page:p.value,pageSize:ps.value});list.value=r.data.data.list;t.value=r.data.data.total}catch{}finally{ld.value=false}}
function onView(_r:any){message.info('查看消息')};function onBlock(_r:any){message.info('操作')}
ft();
</script>
