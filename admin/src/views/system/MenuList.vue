<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <span class="page-title">菜单权限</span>
        <a-button type="primary" @click="onCreate"><PlusOutlined /> 添加菜单</a-button>
      </div>
      <a-table :columns="columns" :data-source="flatMenus" row-key="id" size="middle" :pagination="false" :expand-icon-column-index="1">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'icon'">
            <span style="color:#9ca3af">{{ record.icon }}</span>
          </template>
          <template v-if="column.key === 'type'">
            <a-tag :color="record.type === 'menu' ? 'blue' : 'default'">{{ record.type || 'menu' }}</a-tag>
          </template>
          <template v-if="column.key === 'action'">
            <a-space>
              <a @click="onEdit(record)">编辑</a>
              <a-popconfirm title="确定删除?" @confirm="onDel(record.id)">
                <a style="color:#ef4444">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <a-modal v-model:open="modalVisible" :title="modalTitle" @ok="onSubmit" :confirm-loading="submitting">
      <a-form :model="form" :label-col="{ span: 4 }" :wrapper-col="{ span: 18 }">
        <a-form-item label="上级菜单">
          <a-tree-select
            v-model:value="form.parentId"
            :tree-data="treeData"
            :field-names="{ children: 'children', label: 'name', value: 'id' }"
            allow-clear
            placeholder="不选则为顶级菜单"
          />
        </a-form-item>
        <a-form-item label="菜单名称" required>
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="路径">
          <a-input v-model:value="form.path" placeholder="如 /area/list" />
        </a-form-item>
        <a-form-item label="图标">
          <a-input v-model:value="form.icon" placeholder="如 EnvironmentOutlined" />
        </a-form-item>
        <a-form-item label="权限码">
          <a-input v-model:value="form.permission" placeholder="如 region:view" />
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model:value="form.sortOrder" :min="0" style="width: 120px" />
        </a-form-item>
        <a-form-item label="隐藏">
          <a-switch v-model:checked="form.isHidden" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { systemApi } from '@/api/system'
import request from '@/utils/request'

const tree = ref<any[]>([])
const flatMenus = ref<any[]>([])
const modalVisible = ref(false)
const submitting = ref(false)
const form = ref<any>({ name: '', path: '', icon: '', permission: '', sortOrder: 0, isHidden: false, parentId: null })

const modalTitle = computed(() => form.value.id ? '编辑菜单' : '添加菜单')

const columns = [
  { title: '名称', dataIndex: 'name', width: 180 },
  { title: '路径', dataIndex: 'path' },
  { title: '图标', key: 'icon', width: 160 },
  { title: '权限码', dataIndex: 'permission', width: 140 },
  { title: '排序', dataIndex: 'sortOrder', width: 80 },
  { title: '类型', key: 'type', width: 100 },
  { title: '操作', key: 'action', width: 120 },
]

const treeData = computed(() => tree.value)

onMounted(fetchMenus)

async function fetchMenus() {
  try {
    const res = await systemApi.getMenuTree()
    const data = (res.data as any)?.data || res.data || []
    tree.value = Array.isArray(data) ? data : []
    flatMenus.value = flattenTree(tree.value)
  } catch (err: any) {
    message.error(err?.message || '获取菜单失败')
  }
}

function flattenTree(nodes: any[], level = 0): any[] {
  const result: any[] = []
  for (const node of nodes) {
    result.push({ ...node, name: '　'.repeat(level) + node.name, level })
    if (node.children?.length) {
      result.push(...flattenTree(node.children, level + 1))
    }
  }
  return result
}

function onCreate() {
  form.value = { name: '', path: '', icon: '', permission: '', sortOrder: 0, isHidden: false, parentId: null }
  modalVisible.value = true
}

function onEdit(record: any) {
  form.value = { ...record }
  modalVisible.value = true
}

async function onSubmit() {
  if (!form.value.name.trim()) {
    message.warning('请填写菜单名称')
    return
  }
  submitting.value = true
  try {
    const payload = {
      name: form.value.name,
      path: form.value.path,
      icon: form.value.icon,
      permission: form.value.permission,
      sortOrder: form.value.sortOrder,
      isHidden: form.value.isHidden,
      parentId: form.value.parentId || null,
    }
    if (form.value.id) {
      await systemApi.updateMenu(form.value.id, payload)
    } else {
      await systemApi.saveMenu(payload)
    }
    message.success('保存成功')
    modalVisible.value = false
    await fetchMenus()
  } catch (err: any) {
    message.error(err?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function onDel(id: string) {
  try {
    await systemApi.deleteMenu(id as any)
    message.success('删除成功')
    await fetchMenus()
  } catch (err: any) {
    message.error(err?.message || '删除失败')
  }
}
</script>
