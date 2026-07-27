<template>
  <div class="page-shell website-manager">
    <GlassPageHeader title="官网管理" subtitle="维护官网品牌、下载入口、页面素材、合作咨询和底部信息">
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button @click="openWebsite">预览官网</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存官网配置</el-button>
      </template>
    </GlassPageHeader>

    <div class="website-layout" v-loading="loading">
      <section class="glass-card panel">
        <div class="panel-title">
          <strong>品牌基础</strong>
          <span>官网对外展示的名称、标识和备案信息。</span>
        </div>
        <div class="form-grid two">
          <el-form-item label="官网名称">
            <el-input v-model="form.siteName" placeholder="灵萌" />
          </el-form-item>
          <el-form-item label="官网简称">
            <el-input v-model="form.siteShortName" placeholder="灵萌" />
          </el-form-item>
          <el-form-item label="官网 Logo">
            <ImageUploadBox
              v-model="form.siteLogo"
              scene="config"
              shape="square"
              placeholder="上传官网 Logo"
              tip="建议方形 PNG/JPG，官网左上角使用"
              :max-size="2"
            />
          </el-form-item>
          <el-form-item label="网站图标 favicon">
            <ImageUploadBox
              v-model="form.favicon"
              scene="config"
              shape="square"
              placeholder="上传 favicon"
              tip="建议 64x64 或 128x128"
              :max-size="1"
            />
          </el-form-item>
          <el-form-item label="版权信息">
            <el-input v-model="form.copyright" placeholder="© 2026 Lingmeng" />
          </el-form-item>
          <el-form-item label="ICP备案号">
            <el-input v-model="form.icpNumber" placeholder="请输入备案号" />
          </el-form-item>
          <el-form-item label="公安备案号">
            <el-input v-model="form.policeNumber" placeholder="可选" />
          </el-form-item>
          <el-form-item label="公安备案链接">
            <el-input v-model="form.policeLink" placeholder="https://..." />
          </el-form-item>
        </div>
      </section>

      <section class="glass-card panel">
        <div class="panel-title">
          <strong>首屏与下载入口</strong>
          <span>对应官网第一屏，下载按钮会显示 iOS、Android 和微信小程序。</span>
        </div>
        <div class="form-grid two">
          <el-form-item label="首屏标题">
            <el-input v-model="form.heroTitle" placeholder="把校园装进口袋" />
          </el-form-item>
          <el-form-item label="首屏副标题">
            <el-input v-model="form.heroSubtitle" placeholder="从今天的校园开始" />
          </el-form-item>
          <el-form-item label="官网标语">
            <el-input v-model="form.siteSlogan" placeholder="把校园装进口袋" />
          </el-form-item>
          <el-form-item label="官网简介">
            <el-input v-model="form.siteDescription" placeholder="一句话说明灵萌官网" />
          </el-form-item>
          <el-form-item label="首屏背景图">
            <ImageUploadBox
              v-model="form.heroPosterUrl"
              scene="config"
              shape="wide"
              placeholder="上传校园背景图"
              tip="建议 1920x1080，作为官网首屏背景"
              :max-size="5"
            />
          </el-form-item>
          <el-form-item label="吉祥物">
            <ImageUploadBox
              v-model="form.mascotUrl"
              scene="config"
              shape="square"
              placeholder="上传灵萌吉祥物"
              tip="建议透明 PNG 或干净背景图"
              :max-size="2"
            />
          </el-form-item>
          <el-form-item label="iOS / App Store 链接">
            <el-input v-model="form.iosDownloadUrl" placeholder="https://apps.apple.com/..." />
          </el-form-item>
          <el-form-item label="Android 下载链接">
            <el-input v-model="form.androidDownloadUrl" placeholder="https://..." />
          </el-form-item>
          <el-form-item label="微信小程序入口链接">
            <el-input v-model="form.miniappUrl" placeholder="可选，按钮点击跳转链接" />
          </el-form-item>
          <el-form-item label="小程序二维码">
            <ImageUploadBox
              v-model="form.miniappQrUrl"
              scene="config"
              shape="square"
              placeholder="上传小程序二维码"
              tip="鼠标移到微信小程序按钮时展示"
              :max-size="2"
            />
          </el-form-item>
        </div>
      </section>

      <section class="glass-card panel">
        <div class="panel-title">
          <strong>页面素材</strong>
          <span>用于第二屏、第三屏、第四屏的校园图片与产品预览。</span>
        </div>
        <div class="form-grid two">
          <el-form-item label="小程序预览图">
            <ImageUploadBox
              v-model="form.previewImageUrl"
              scene="config"
              shape="wide"
              placeholder="上传小程序预览图"
              tip="可用真实小程序截图或校园内容截图"
              :max-size="4"
            />
          </el-form-item>
          <el-form-item label="合作页图片">
            <ImageUploadBox
              v-model="form.cooperationImageUrl"
              scene="config"
              shape="wide"
              placeholder="上传合作页图片"
              tip="校园环境、门店或生活场景"
              :max-size="4"
            />
          </el-form-item>
          <el-form-item label="第二屏图片一">
            <ImageUploadBox v-model="form.storyImageOneUrl" scene="config" shape="wide" placeholder="上传校园图片" :max-size="4" />
          </el-form-item>
          <el-form-item label="第二屏图片二">
            <ImageUploadBox v-model="form.storyImageTwoUrl" scene="config" shape="wide" placeholder="上传校园图片" :max-size="4" />
          </el-form-item>
          <el-form-item label="第二屏图片三">
            <ImageUploadBox v-model="form.storyImageThreeUrl" scene="config" shape="wide" placeholder="上传校园图片" :max-size="4" />
          </el-form-item>
        </div>
      </section>

      <section class="glass-card panel">
        <div class="panel-title">
          <strong>合作咨询与联系</strong>
          <span>官网第四屏和底部展示，不包含任何后台入口。</span>
        </div>
        <div class="form-grid two">
          <el-form-item label="合作标题">
            <el-input v-model="form.cooperationTitle" placeholder="一起把校园连接起来" />
          </el-form-item>
          <el-form-item label="合作副标题">
            <el-input v-model="form.cooperationSubtitle" placeholder="欢迎学校、区域伙伴与校园商家了解灵萌。" />
          </el-form-item>
          <el-form-item label="联系邮箱">
            <el-input v-model="form.contactEmail" placeholder="support@example.com" />
          </el-form-item>
          <el-form-item label="联系电话">
            <el-input v-model="form.contactPhone" placeholder="请输入联系电话" />
          </el-form-item>
          <el-form-item label="客服微信">
            <el-input v-model="form.contactWechat" placeholder="可选" />
          </el-form-item>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { fetchAdminWebsiteInfo, saveAdminWebsiteInfo, type WebsiteInfo } from '@/api/admin'

const loading = ref(false)
const saving = ref(false)

const form = reactive<WebsiteInfo>({
  siteName: '灵萌',
  siteShortName: '灵萌',
  siteLogo: '',
  favicon: '',
  siteSlogan: '把校园装进口袋',
  siteDescription: '灵萌把校园里的内容、连接和服务收进一个更轻快的入口。',
  heroTitle: '把校园装进口袋',
  heroSubtitle: '从今天的校园开始',
  heroPosterUrl: '',
  mascotUrl: '',
  previewImageUrl: '',
  storyImageOneUrl: '',
  storyImageTwoUrl: '',
  storyImageThreeUrl: '',
  cooperationImageUrl: '',
  miniappQrUrl: '',
  miniappUrl: '',
  androidDownloadUrl: '',
  iosDownloadUrl: '',
  contactEmail: '',
  contactPhone: '',
  contactWechat: '',
  cooperationTitle: '一起把校园连接起来',
  cooperationSubtitle: '欢迎学校、区域伙伴与校园商家了解灵萌。',
  copyright: '© 2026 Lingmeng',
  icpNumber: '',
  policeNumber: '',
  policeLink: '',
})

async function load() {
  loading.value = true
  try {
    const data = await fetchAdminWebsiteInfo()
    if (data && typeof data === 'object') Object.assign(form, data)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载官网配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const payload: WebsiteInfo = {
      ...form,
      logo: form.siteLogo,
      heroImageUrl: form.heroPosterUrl || form.heroImageUrl,
      appStoreUrl: form.iosDownloadUrl,
      apkUrl: form.androidDownloadUrl,
    }
    await saveAdminWebsiteInfo(payload)
    ElMessage.success('官网配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存官网配置失败')
  } finally {
    saving.value = false
  }
}

function openWebsite() {
  window.open('/', '_blank')
}

onMounted(load)
</script>

<style scoped>
.website-manager {
  display: grid;
  gap: 18px;
}

.website-layout {
  display: grid;
  gap: 18px;
}

.panel {
  padding: 0;
  overflow: hidden;
}

.panel-title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, .88);
}

.panel-title strong {
  font-size: 17px;
  color: #0f172a;
}

.panel-title span {
  color: #64748b;
  font-size: 13px;
}

.form-grid {
  display: grid;
  gap: 18px;
  padding: 20px 22px 22px;
}

.form-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 980px) {
  .form-grid.two {
    grid-template-columns: 1fr;
  }

  .panel-title {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
