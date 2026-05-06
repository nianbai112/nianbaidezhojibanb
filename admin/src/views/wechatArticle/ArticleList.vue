<template><div class="page-container"><FilterBar @search="onSearch" @reset="onReset"><a-input v-model:value="f.keyword" placeholder="标题/URL" allow-clear style="width:200px"/></FilterBar><div class="page-card"><DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps"><template #title="{r}"><a :href="r.url" target="_blank">{{r.title||r.url}}</a></template><template #a="{r}"><a-space><a @click="onDelete(r)" style="color:#ff4d4f">删除</a></a-space></template></DataTable></div></div></template>
<script setup lang="ts">import {ref,reactive} from 'vue';import {message,Modal} from 'ant-design-vue';import {wechatArticleApi} from '@/api/wechatArticle';import FilterBar from '@/components/common/FilterBar.vue';import DataTable from '@/components/common/DataTable.vue'
const ld=ref(false),list=ref<any[]>([]),t=ref(0),p=ref(1),ps=ref(20);const f=reactive({keyword:''})
const cols=[{title:'ID',dataIndex:'id',width:80},{title:'标题',dataIndex:'title',width:250,slot:'title'},{title:'内容',dataIndex:'content',width:200,format:(v:any)=>(v||'').slice(0,30)},{title:'时间',dataIndex:'createdAt',width:160},{title:'操作',dataIndex:'action',width:80,slot:'a'}]
async function ft(){ld.value=true;try{const r=await wechatArticleApi.getList({page:p.value,pageSize:ps.value,...f});list.value=r.data.data?.list||r.data?.list||[];t.value=r.data.data?.total||r.data?.total||0}catch{}finally{ld.value=false}}
function onSearch(){p.value=1;ft()};function onReset(){f.keyword='';onSearch()}
async function onDelete(r:any){Modal.confirm({title:'确认删除',content:'确定删除该文章吗？',onOk:async()=>{await wechatArticleApi.delete(r.id);message.success('已删除');ft()}})}
ft();
</script>
