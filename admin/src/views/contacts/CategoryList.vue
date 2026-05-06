<template><div class="page-container"><div class="page-card"><div class="page-header"><span class="page-title">通讯录分类</span><a-button type="primary" @click="onCreate">新建分类</a-button></div><DataTable :columns="cols" :data-source="list" :loading="ld" :total="t" v-model:page="p" v-model:page-size="ps"><template #a="{r}"><a-space><a @click="onEdit(r)">编辑</a><a @click="onDelete(r)" style="color:#ff4d4f">删除</a></a-space></template></DataTable></div><a-modal v-model:open="modalVisible" :title="editingId?'编辑分类':'新建分类'" @ok="onSubmit"><a-form layout="vertical"><a-form-item label="名称" required><a-input v-model:value="form.name"/></a-form-item><a-form-item label="图标"><a-input v-model:value="form.icon"/></a-form-item><a-form-item label="排序"><a-input-number v-model:value="form.sortOrder"/></a-form-item></a-form></a-modal></div></template>
<script setup lang="ts">import {ref,reactive} from 'vue';import {message,Modal} from 'ant-design-vue';import {contactsApi} from '@/api/contacts';import DataTable from '@/components/common/DataTable.vue'
const ld=ref(false),list=ref<any[]>([]),t=ref(0),p=ref(1),ps=ref(20)
const cols=[{title:'ID',dataIndex:'id',width:80},{title:'名称',dataIndex:'name',width:150},{title:'图标',dataIndex:'icon',width:100},{title:'排序',dataIndex:'sortOrder',width:70},{title:'时间',dataIndex:'createdAt',width:160},{title:'操作',dataIndex:'action',width:120,slot:'a'}]
async function ft(){ld.value=true;try{const r=await contactsApi.getCategoryList({page:p.value,pageSize:ps.value});list.value=r.data.data?.list||r.data?.list||[];t.value=r.data.data?.total||r.data?.total||0}catch{}finally{ld.value=false}}
const modalVisible=ref(false),editingId=ref(''),form=reactive({name:'',icon:'',sortOrder:0})
function onCreate(){editingId.value='';form.name='';form.icon='';form.sortOrder=0;modalVisible.value=true}
function onEdit(r:any){editingId.value=r.id;form.name=r.name;form.icon=r.icon||'';form.sortOrder=r.sortOrder;modalVisible.value=true}
async function onSubmit(){const data={...form};if(editingId.value){await contactsApi.updateCategory(editingId.value,data)}else{await contactsApi.createCategory(data)}message.success('保存成功');modalVisible.value=false;ft()}
async function onDelete(r:any){Modal.confirm({title:'确认删除',content:`确定删除「${r.name}」吗？`,onOk:async()=>{await contactsApi.deleteCategory(r.id);message.success('已删除');ft()}})}
ft();
</script>
