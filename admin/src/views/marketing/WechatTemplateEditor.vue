<template>
  <el-dialog v-model="visible" :title="`${sceneName} · ${platform === 'official' ? '服务号' : '小程序'}模板配置`" width="760px" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @closed="resetRequest">
    <el-alert title="保存模板后，还需在「场景开关」中开启对应通知。保存不会发送测试消息。" type="info" show-icon :closable="false" />
    <el-form label-position="top" class="template-editor-form">
      <el-form-item label="配置范围">
        <el-select v-model="selectedId" :disabled="saving" @change="selectRecord" style="width:100%">
          <el-option v-if="!records.some(item => !item.regionId)" label="新建全局模板（所有校区默认使用）" value="new-global" />
          <el-option v-for="item in records" :key="item.id" :value="item.id" :label="item.regionId ? `校区专用 · ${item.title || item.regionId}` : '全局模板（所有校区默认使用）'" />
        </el-select>
        <div class="field-help">校区专用配置优先于全局配置；保存只修改当前选中的这一条。</div>
      </el-form-item>
      <el-form-item label="微信模板 ID" required>
        <el-input v-model="form.templateId" :disabled="saving" placeholder="粘贴微信「我的模板」中添加后生成的完整模板 ID" maxlength="128" />
        <div class="template-import" v-if="platform === 'official'">
          <el-button :loading="reading" :disabled="saving || !form.templateId.trim()" @click="readWechatFields">读取微信字段</el-button>
          <span class="field-help">从当前服务号读取已添加的模板，自动匹配字段内容。</span>
        </div>
      </el-form-item>
      <el-form-item label="微信模板字段" required>
        <div class="mapping-list">
          <div class="mapping-heading"><span>微信字段编号</span><span>对应内容</span></div>
          <div v-for="(field, index) in form.fields" :key="index" class="mapping-row">
            <el-input v-model="field.variable" :disabled="saving" :aria-label="`微信字段编号 ${index + 1}`" placeholder="例如 character_string1，支持粘贴 {{…DATA}}" />
            <el-select v-model="field.business" :disabled="saving" :aria-label="`对应内容 ${index + 1}`" placeholder="选择这行填写的内容" filterable>
              <el-option v-for="option in fieldOptions(field.business)" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
            <el-button :disabled="saving" text type="danger" @click="form.fields.splice(index, 1)" :aria-label="`移除字段 ${index + 1}`">移除</el-button>
          </div>
          <el-button :disabled="saving || form.fields.length >= 20" @click="form.fields.push({ variable: '', business: '' })">添加字段</el-button>
          <div class="field-help">字段编号以微信模板详情为准；同名模板的字段编号也可能不同。</div>
          <div v-if="sceneKey === 'new_errand_order'" class="field-help">骑手新单提醒只包含订单编号、订单金额、服务名称、下单时间和所属校区。</div>
        </div>
      </el-form-item>
      <el-form-item label="模板状态"><el-switch v-model="form.enabled" :disabled="saving" active-text="启用模板" inactive-text="停用模板" /></el-form-item>
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" />
    </el-form>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存模板</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createWechatTemplate, updateWechatTemplate, fetchOfficialAccountTemplates } from '@/api/admin'
import { businessFields, newOrderFields, editFields, parseWechatTemplate, buildTemplatePayload } from './wechatTemplateEditor.mjs'
const emit = defineEmits<{ saved: [] }>()
const visible = ref(false), saving = ref(false), reading = ref(false), errorMessage = ref('')
const sceneKey = ref(''), sceneName = ref(''), platform = ref('official'), records = ref<any[]>([]), selectedId = ref('new-global')
const form = ref({ templateId: '', enabled: true, fields: [] as Array<{ variable: string; business: string }> })
let requestVersion = 0
function resetRequest() { requestVersion++; reading.value = false }
function selectRecord() {
  resetRequest(); errorMessage.value = ''
  const record = records.value.find(item => item.id === selectedId.value)
  form.value = { templateId: record?.templateId || '', enabled: record ? record.enabled === true : true, fields: editFields(record?.fieldMapping, sceneKey.value) }
}
function open(scene: any, channel: string, savedRecords: any[]) {
  sceneKey.value = scene.key; sceneName.value = scene.scene; platform.value = channel
  records.value = savedRecords.filter(item => item.templateType === scene.key)
  selectedId.value = records.value.find(item => !item.regionId)?.id || 'new-global'
  selectRecord(); visible.value = true
}
function fieldOptions(current: string) {
  const options = sceneKey.value === 'new_errand_order' ? businessFields.filter(item => newOrderFields.includes(item.value)) : businessFields
  return current && !options.some(item => item.value === current) ? [...options, { value: current, label: `已有字段：${current}` }] : options
}
async function readWechatFields() {
  const version = ++requestVersion, templateId = form.value.templateId.trim()
  reading.value = true; errorMessage.value = ''
  try {
    const response: any = await fetchOfficialAccountTemplates()
    if (!visible.value || version !== requestVersion || form.value.templateId.trim() !== templateId) return
    const list = response?.data || response || []
    const template = list.find((item: any) => item.templateId === templateId)
    if (!template) throw new Error('当前服务号中找不到这个模板 ID，请确认已在同一个服务号添加模板')
    const fields = parseWechatTemplate(template.content)
    if (!fields.length) throw new Error('未识别到字段，请从微信模板详情手动填写')
    form.value.fields = fields
    ElMessage.success(fields.some((item: any) => !item.business) ? '已读取字段，请为未匹配的行选择对应内容' : '已读取并匹配字段，请核对后保存')
  } catch (error: any) {
    if (version === requestVersion) errorMessage.value = error?.response?.data?.message || error.message || '读取失败，请重试'
  } finally { if (version === requestVersion) reading.value = false }
}
async function save() {
  if (saving.value) return
  errorMessage.value = ''
  try {
    const data = buildTemplatePayload(form.value, sceneKey.value, platform.value)
    resetRequest(); saving.value = true
    if (selectedId.value === 'new-global') await createWechatTemplate({ ...data, platformType: platform.value, templateType: sceneKey.value, title: sceneName.value })
    else await updateWechatTemplate(selectedId.value, data)
    ElMessage.success('模板已保存；通知是否发送由场景开关控制')
    visible.value = false; emit('saved')
  } catch (error: any) { errorMessage.value = error?.response?.data?.message || error.message || '保存失败，请重试' }
  finally { saving.value = false }
}
defineExpose({ open })
</script>

<style scoped>
.template-editor-form { margin-top: 20px; }
.mapping-list { width: 100%; display: flex; flex-direction: column; gap: 12px; }
.mapping-row, .mapping-heading { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(160px, 1fr) 56px; gap: 12px; align-items: center; }
.mapping-heading { color: var(--el-text-color-secondary); font-size: 13px; }
.field-help { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.7; margin-top: 6px; }
.template-import { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 10px; }
@media (max-width: 600px) { .mapping-row { grid-template-columns: 1fr; gap: 8px; } .mapping-heading { display: none; } }
</style>
