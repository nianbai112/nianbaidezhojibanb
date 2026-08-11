<template>
  <div class="panel-container">
    <div class="glass-card">
      <div class="card-header">
        <div>
          <div class="card-title">小程序登录页视觉</div>
          <div class="card-desc">登录背景支持图片或视频；视频会静音循环播放，封面用于首次加载。</div>
        </div>
      </div>
      <div class="card-body">
        <el-form label-position="top">
          <el-form-item label="背景类型">
            <el-radio-group v-model="form.heroMode">
              <el-radio-button label="image">图片背景</el-radio-button>
              <el-radio-button label="video">视频背景</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item v-if="form.heroMode === 'image'" label="登录背景图">
            <ImageUploadBox
              v-model="form.heroImageUrl"
              scene="config"
              shape="wide"
              accept="image/jpeg,image/png,image/webp"
              :max-size="5"
              :min-width="1000"
              :min-height="800"
              placeholder="上传登录背景图"
              tip="推荐 1500×1200（5:4）；最低 1000×800；JPG/PNG/WebP，最大 5MB"
            />
          </el-form-item>

          <template v-else>
            <el-form-item label="登录背景视频" required>
              <div class="video-upload">
                <video v-if="form.heroVideoUrl" :src="form.heroVideoUrl" :poster="form.heroImageUrl" muted loop controls></video>
                <div v-else class="video-empty">MP4（H.264）· 推荐 1500×1200 · 6–12 秒 · 最大 10MB</div>
                <div class="video-actions">
                  <el-button type="primary" :loading="uploadingVideo" @click="videoInput?.click()">上传视频</el-button>
                  <el-button v-if="form.heroVideoUrl" @click="form.heroVideoUrl = ''">删除视频</el-button>
                </div>
                <input ref="videoInput" type="file" accept="video/mp4" hidden @change="onVideoChange" />
              </div>
            </el-form-item>
            <el-form-item label="视频封面图">
              <ImageUploadBox
                v-model="form.heroImageUrl"
                scene="config"
                shape="wide"
                accept="image/jpeg,image/png,image/webp"
                :max-size="5"
                :min-width="1000"
                :min-height="800"
                placeholder="上传视频封面图"
                tip="推荐和视频相同的 5:4 构图；视频首次加载或播放失败时展示"
              />
            </el-form-item>
          </template>
          <el-form-item label="底部功能文案">
            <el-input v-model="featureText" type="textarea" :rows="3" maxlength="80" show-word-limit placeholder="校园社区 · 代取快递 · 二手闲置 · 互助帮忙" />
            <div class="field-tip">用“·”、逗号或换行分隔；最多展示 8 项。</div>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <div class="glass-card preview-card">
      <div class="card-header"><div class="card-title">预览裁切</div></div>
      <div class="login-preview">
        <video v-if="form.heroMode === 'video' && form.heroVideoUrl" :src="form.heroVideoUrl" :poster="form.heroImageUrl" muted loop autoplay></video>
        <img v-else-if="form.heroImageUrl" :src="form.heroImageUrl" alt="登录背景预览" />
        <div v-else class="preview-empty">校园生活</div>
      </div>
      <p>展示比例约为 5:4，系统会以铺满方式裁切边缘。</p>
    </div>

    <div class="panel-actions">
      <el-button @click="load" :loading="loading">刷新</el-button>
      <el-button type="primary" @click="save" :loading="saving">保存并发布</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import { uploadVideo } from '@/api/admin'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

const loading = ref(false)
const saving = ref(false)
const uploadingVideo = ref(false)
const videoInput = ref<HTMLInputElement>()
const featureText = ref('')
const form = reactive({ heroMode: 'image', heroImageUrl: '', heroVideoUrl: '', featureTextList: [] as string[] })

const unwrap = (value: any) => value?.data || value || {}

async function load() {
  loading.value = true
  try {
    Object.assign(form, unwrap(await request.get('/admin/config/login-page')))
    featureText.value = Array.isArray(form.featureTextList) ? form.featureTextList.join(' · ') : ''
  } catch (e: any) {
    ElMessage.error(e?.message || '加载登录页配置失败')
  } finally {
    loading.value = false
  }
}

async function readVideoMeta(file: File) {
  return new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
    }
    video.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('无法读取视频信息')) }
    video.src = objectUrl
  })
}

async function onVideoChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.type !== 'video/mp4') return ElMessage.warning('请上传 MP4（H.264）视频')
  if (file.size > 10 * 1024 * 1024) return ElMessage.warning('视频大小不能超过 10MB')
  try {
    const meta = await readVideoMeta(file)
    if (meta.width < 1000 || meta.height < 800) return ElMessage.warning(`视频至少需要 1000×800px，当前为 ${meta.width}×${meta.height}px`)
    if (meta.duration < 3 || meta.duration > 15) return ElMessage.warning(`视频建议 3–15 秒，当前为 ${meta.duration.toFixed(1)} 秒`)
    if (Math.abs(meta.width / meta.height - 1.25) > 0.12) ElMessage.warning('当前比例会被裁切，推荐使用 5:4（如 1500×1200）')
    uploadingVideo.value = true
    const result: any = await uploadVideo(file)
    form.heroVideoUrl = unwrap(result).url || unwrap(result).data?.url || ''
    if (!form.heroVideoUrl) ElMessage.error('上传失败：未获取到视频地址')
    else ElMessage.success('视频上传成功')
  } catch (e: any) {
    ElMessage.error(e?.message || '视频上传失败')
  } finally {
    uploadingVideo.value = false
  }
}

async function save() {
  if (form.heroMode === 'video' && !form.heroVideoUrl) return ElMessage.warning('请先上传登录背景视频')
  saving.value = true
  try {
    const featureTextList = featureText.value.split(/[·,，、|\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 8)
    Object.assign(form, unwrap(await request.put('/admin/config/login-page', { ...form, featureTextList })))
    featureText.value = Array.isArray(form.featureTextList) ? form.featureTextList.join(' · ') : featureText.value
    ElMessage.success('登录页视觉已发布')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.panel-container { display: grid; gap: 24px; }
.card-header { display: flex; justify-content: space-between; gap: 16px; }
.card-title { font-weight: 800; font-size: 16px; }
.card-desc, .preview-card p { margin: 6px 0 0; color: #64748b; font-size: 13px; line-height: 1.6; }
.video-upload { width: 100%; padding: 16px; border: 1px dashed #cbd5e1; border-radius: 14px; box-sizing: border-box; }
.video-upload video { width: min(100%, 460px); aspect-ratio: 5 / 4; object-fit: cover; border-radius: 10px; background: #0f172a; }
.video-empty, .preview-empty { display: grid; place-items: center; min-height: 180px; border-radius: 10px; color: #64748b; background: #f8fafc; text-align: center; padding: 20px; box-sizing: border-box; }
.video-actions { display: flex; gap: 10px; margin-top: 12px; }
.preview-card { padding: 20px; }
.login-preview { width: min(100%, 420px); aspect-ratio: 5 / 4; margin-top: 14px; overflow: hidden; border: 6px solid #fff; border-radius: 28px; box-shadow: 0 14px 32px rgba(15, 23, 42, .12); background: #eff6f1; }
.login-preview video, .login-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.login-preview .preview-empty { height: 100%; background: linear-gradient(180deg, #dff3ff, #f4f9d7); }
.panel-actions { display: flex; justify-content: flex-end; gap: 12px; }
.field-tip { margin-top: 6px; color: #64748b; font-size: 12px; line-height: 1.5; }
</style>
