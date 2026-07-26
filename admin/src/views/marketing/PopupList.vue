<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 弹窗广告</p>
        <h2>弹窗广告</h2>
        <p>广告弹窗真实写入广告位表，支持图片上传、时间控制和跳转配置。</p>
      </div>
      <el-button type="primary" @click="openCreate">创建弹窗</el-button>
    </div>

    <div class="filter-card">
      <el-select v-model="filters.status" clearable placeholder="状态">
        <el-option label="启用" :value="1" />
        <el-option label="禁用" :value="0" />
      </el-select>
      <el-button type="primary" @click="loadPopups">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="data-card">
      <el-table :data="popups" v-loading="loading" empty-text="暂无真实弹窗广告数据">
        <el-table-column label="广告" min-width="260">
          <template #default="{ row }">
            <div class="media-cell">
              <el-image v-if="row.image" :src="row.image" fit="cover" class="thumb" />
              <div v-else class="thumb placeholder">广</div>
              <div>
                <strong>{{ row.name || row.title }}</strong>
                <p>{{ row.linkType || 'none' }} · {{ row.linkValue || row.link || '无跳转' }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="优先级" prop="priority" width="90" />
        <el-table-column label="曝光/点击" width="120">
          <template #default="{ row }">{{ row.viewCount || 0 }} / {{ row.clickCount || 0 }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="Number(row.status) === 1 ? 'success' : 'info'" size="small">
              {{ Number(row.status) === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="有效期" min-width="240">
          <template #default="{ row }">{{ formatTime(row.startTime || row.startAt) }} 至 {{ formatTime(row.endTime || row.endAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editPopup(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deletePopup(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadPopups"
          @size-change="loadPopups"
        />
      </div>
    </div>

    <el-dialog v-model="showDialog" :title="editingPopup ? '编辑弹窗' : '创建弹窗'" width="760px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="标题" required>
          <el-input v-model="form.name" placeholder="弹窗标题" />
        </el-form-item>
        <el-form-item label="图片" required>
          <ImageUploadBox v-model="form.image" scene="marketing-popup" shape="wide" placeholder="上传弹窗图片" tip="建议 750x350px，可替换和删除" :max-size="5" />
        </el-form-item>
        <div class="dialog-grid">
          <el-form-item label="跳转类型">
            <el-select v-model="form.linkType" style="width: 100%">
              <el-option label="无跳转" value="none" />
              <el-option label="小程序页面" value="page" />
              <el-option label="H5 页面" value="webview" />
              <el-option label="帖子" value="post" />
              <el-option label="商品/团购" value="product" />
            </el-select>
          </el-form-item>
          <el-form-item label="优先级">
            <el-input-number v-model="form.priority" :min="0" />
          </el-form-item>
          <el-form-item label="状态">
            <el-switch v-model="form.enabled" active-text="启用" inactive-text="禁用" />
          </el-form-item>
          <el-form-item label="跳转值">
            <el-input v-model="form.linkValue" placeholder="页面路径、URL 或资源 ID" />
          </el-form-item>
        </div>
        <el-form-item label="有效期">
          <el-date-picker
            v-model="form.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submitPopup" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { request } from '@/api/request'
import { cleanPayload, errorMessage, formatTime, unwrapPage } from './utils'

const loading = ref(false)
const submitting = ref(false)
const showDialog = ref(false)
const editingPopup = ref<any>(null)
const popups = ref<any[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const filters = reactive<{ status: number | '' }>({ status: '' })

const form = reactive({
  name: '',
  image: '',
  linkType: 'none',
  linkValue: '',
  priority: 0,
  enabled: true,
  dateRange: null as any,
})

function resetForm() {
  Object.assign(form, {
    name: '',
    image: '',
    linkType: 'none',
    linkValue: '',
    priority: 0,
    enabled: true,
    dateRange: null,
  })
}

function openCreate() {
  editingPopup.value = null
  resetForm()
  showDialog.value = true
}

async function loadPopups() {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/popups', {
      params: { page: pagination.page, pageSize: pagination.pageSize, status: filters.status },
    })
    const page = unwrapPage(res)
    popups.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载弹窗失败'))
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.status = ''
  pagination.page = 1
  loadPopups()
}

function editPopup(popup: any) {
  editingPopup.value = popup
  const start = popup.startTime || popup.startAt
  const end = popup.endTime || popup.endAt
  Object.assign(form, {
    name: popup.name || popup.title || '',
    image: popup.image || '',
    linkType: popup.linkType || 'none',
    linkValue: popup.linkValue || popup.link || '',
    priority: Number(popup.priority || 0),
    enabled: Number(popup.status) === 1,
    dateRange: start && end ? [new Date(start), new Date(end)] : null,
  })
  showDialog.value = true
}

async function submitPopup() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写弹窗标题')
    return
  }
  if (!form.image) {
    ElMessage.warning('请上传弹窗图片')
    return
  }
  submitting.value = true
  try {
    const payload = cleanPayload({
      name: form.name.trim(),
      image: form.image,
      linkType: form.linkType,
      linkValue: form.linkValue,
      priority: form.priority,
      status: form.enabled ? 1 : 0,
      startAt: form.dateRange?.[0]?.toISOString(),
      endAt: form.dateRange?.[1]?.toISOString(),
    })
    if (editingPopup.value) {
      await request.put(`/admin/marketing/popups/${editingPopup.value.id}`, payload)
      ElMessage.success('弹窗已更新')
    } else {
      await request.post('/admin/marketing/popups', payload)
      ElMessage.success('弹窗已创建')
    }
    showDialog.value = false
    await loadPopups()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '保存弹窗失败'))
  } finally {
    submitting.value = false
  }
}

async function deletePopup(popup: any) {
  try {
    await ElMessageBox.confirm(`确定删除「${popup.name || popup.title}」吗？`, '确认删除', { type: 'warning' })
    await request.delete(`/admin/marketing/popups/${popup.id}`)
    ElMessage.success('弹窗已删除')
    await loadPopups()
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(errorMessage(error, '删除失败'))
  }
}

onMounted(loadPopups)
</script>

<style scoped>
.marketing-page { padding: 24px; }
.marketing-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.filter-card,
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 16px; box-shadow: 0 14px 36px rgba(37,99,235,.08); }
.filter-card { display: grid; grid-template-columns: 180px auto auto; gap: 12px; padding: 16px; margin-bottom: 18px; }
.data-card { padding: 18px; }
.media-cell { display: flex; align-items: center; gap: 12px; }
.media-cell strong { color: #0f172a; }
.media-cell p { margin: 4px 0 0; color: #64748b; }
.thumb { width: 60px; height: 46px; border-radius: 12px; object-fit: cover; background: #eff6ff; flex: none; }
.placeholder { display: grid; place-items: center; color: #2563eb; font-weight: 900; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
@media (max-width: 900px) {
  .filter-card { grid-template-columns: 1fr; }
  .dialog-grid { grid-template-columns: 1fr; }
}
</style>
