<template><div class="page-container"><div class="page-card"><div class="page-header"><span class="page-title">兑换码管理</span><a-button type="primary" @click="onGenerate">批量生成</a-button></div><DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps"><template #status="{r}"><a-tag :color="r.isUsed?'green':'blue'">{{r.isUsed?'已使用':'未使用'}}</a-tag></template><template #a="{r}"><a-space><a>详情</a></a-space></template></DataTable></div><a-modal v-model:open="modalVisible" title="批量生成兑换码" @ok="onSubmit"><a-form layout="vertical"><a-form-item label="生成数量" required><a-input-number v-model:value="genCount" :min="1" :max="100"/></a-form-item></a-form></a-modal></div></template>
<script setup lang="ts">import {ref} from 'vue';import {message} from 'ant-design-vue';import {userTitleApi} from '@/api/userTitle';import {useRoute} from 'vue-router';import DataTable from '@/components/common/DataTable.vue'
const route=useRoute(),titleId=route.params.id as string
const ld=ref(false),list=ref<any[]>([]),t=ref(0),p=ref(1),ps=ref(20)
const cols=[{title:'ID',dataIndex:'id',width:80},{title:'兑换码',dataIndex:'code',width:150},{title:'状态',dataIndex:'isUsed',width:90,slot:'status'},{title:'使用者',dataIndex:'usedBy',width:120},{title:'使用时间',dataIndex:'usedAt',width:160},{title:'过期时间',dataIndex:'expireAt',width:160},{title:'时间',dataIndex:'createdAt',width:160}]
async function ft(){ld.value=true;try{const r=await userTitleApi.getRedeemCodeList(titleId,{page:p.value,pageSize:ps.value});list.value=r.data.data?.list||r.data?.list||[];t.value=r.data.data?.total||r.data?.total||0}catch{}finally{ld.value=false}}
const modalVisible=ref(false),genCount=ref(10)
function onGenerate(){genCount.value=10;modalVisible.value=true}
async function onSubmit(){await userTitleApi.generateRedeemCodes(titleId,genCount.value);message.success('生成成功');modalVisible.value=false;ft()}
ft();
</script>
