<template>
  <el-drawer
    :model-value="true"
    title="企业微信群"
    size="min(960px, 96vw)"
    :close-on-click-modal="false"
    @close="emit('close')"
  >
    <div class="wecom-panel">
      <el-alert
        title="客户群用于个人微信用户入群。先完成企业微信配置，再导入官方群，最后在活动中选择允许的群。"
        type="info"
        :closable="false"
      />
      <el-tabs v-model="tab">
        <el-tab-pane label="官方群管理" name="groups">
          <el-alert
            v-if="!configured"
            title="企业微信尚未启用。可先保存活动草稿，配置完成并选好官方群后再发布。"
            type="warning"
            :closable="false"
          />
          <section v-if="canConfigure" class="import-box">
            <h3>导入本企业客户群</h3>
            <el-form label-position="top">
              <el-form-item label="所属校区（导入后固定）">
                <el-select
                  v-model="regionId"
                  placeholder="选择校区"
                  style="width: 100%"
                >
                  <el-option
                    v-if="options.canGlobal"
                    label="全平台活动可用"
                    value=""
                  />
                  <el-option
                    v-for="region in options.regions"
                    :key="region.id"
                    :label="region.name"
                    :value="region.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item
                v-if="manualImportVisible"
                id="wecom-manual-import"
                label="手动填写群编号（每行一个，单次最多20个）"
              >
                <el-input
                  v-model="chatIds"
                  type="textarea"
                  :rows="3"
                  placeholder="仅在无法从列表选择时填写企业微信提供的群编号"
                />
              </el-form-item>
            </el-form>
            <div class="actions">
              <el-button
                :loading="discovering"
                :disabled="!configured || importing"
                @click="discover(false)"
                >读取客户群列表</el-button
              >
              <el-button
                type="primary"
                :loading="importing"
                :disabled="!configured || !chatIds.trim() || discovering"
                @click="register"
                >导入所选群{{
                  importCount ? `（${importCount}个）` : ""
                }}</el-button
              >
              <el-button
                link
                :aria-expanded="manualImportVisible"
                aria-controls="wecom-manual-import"
                @click="manualImportVisible = !manualImportVisible"
                >{{
                  manualImportVisible ? "收起手动填写" : "手动填写群编号"
                }}</el-button
              >
            </div>
            <div v-if="candidates.length" class="candidates">
              <p class="hint">
                按群名称选择需要导入的官方群，单次最多20个。导入后将归属上方选定的校区。
              </p>
              <el-input
                v-model="candidateSearch"
                placeholder="搜索群名称"
                aria-label="搜索群名称"
                clearable
              />
              <el-checkbox-group
                v-model="selected"
                :max="20"
                @change="selectCandidates"
              >
                <el-checkbox
                  v-for="group in filteredCandidates"
                  :key="group.chatId"
                  :value="group.chatId"
                  :disabled="!!group.error || importedChatIds.has(group.chatId)"
                  ><span class="candidate-summary">
                    <span class="candidate-name">{{
                      group.name || "群名称暂未读取"
                    }}</span>
                    <span class="candidate-meta">
                      <span v-if="!group.error"
                        >{{ group.memberCount }} 人</span
                      >
                      <el-tag
                        v-if="importedChatIds.has(group.chatId)"
                        size="small"
                        type="info"
                        >已导入</el-tag
                      >
                      <span v-if="group.error" class="error">{{
                        group.error
                      }}</span>
                    </span>
                  </span></el-checkbox
                >
              </el-checkbox-group>
              <p v-if="!filteredCandidates.length" class="hint" role="status">
                没有匹配的群名称，请换个关键词。
              </p>
              <el-button
                v-if="cursor"
                link
                type="primary"
                :loading="discovering"
                @click="discover(true)"
                >读取下一页</el-button
              >
            </div>
            <p
              v-else-if="discovered && !discovering"
              class="hint"
              role="status"
            >
              暂未找到可读取的客户群，请确认已创建企业客户群，且群主在应用可见范围内。
            </p>
          </section>
          <div class="section-heading">
            <h3>已导入 {{ groups.length }} 个官方群</h3>
            <el-button :loading="loading" @click="loadGroups">刷新</el-button>
          </div>
          <el-table
            :data="groups"
            v-loading="loading"
            empty-text="暂无官方群。请让超级管理员完成配置并导入客户群。"
          >
            <el-table-column label="客户群" min-width="190"
              ><template #default="{ row }"
                ><b>{{ row.name || "未命名客户群" }}</b>
                <p class="hint">{{ regionName(row.regionId) }}</p>
                <el-tooltip :content="'群编号：' + row.chatId" placement="top">
                  <el-button link size="small">查看群编号</el-button>
                </el-tooltip></template
              ></el-table-column
            >
            <el-table-column label="群成员" width="135"
              ><template #default="{ row }"
                >{{ row.memberCount }} 人
                <p class="hint">
                  可核验 {{ row.identifiableCount }} 人
                </p></template
              ></el-table-column
            >
            <el-table-column label="同步状态" min-width="180"
              ><template #default="{ row }"
                ><el-tag
                  :type="
                    row.isDismissed
                      ? 'info'
                      : row.syncError
                        ? 'danger'
                        : row.needsSync
                          ? 'warning'
                          : 'success'
                  "
                  >{{
                    row.isDismissed
                      ? "已解散"
                      : row.syncError
                        ? "同步失败"
                        : !row.syncedAt || row.needsSync
                          ? "等待同步"
                          : "已同步"
                  }}</el-tag
                >
                <p class="hint">{{ time(row.syncedAt) }}</p>
                <p v-if="row.syncError" class="error">
                  {{ row.syncError }}
                </p></template
              ></el-table-column
            >
            <el-table-column label="操作" width="150"
              ><template #default="{ row }"
                ><el-button link type="primary" @click="openMembers(row.id)"
                  >成员明细</el-button
                >
                <el-button
                  v-if="canEdit"
                  link
                  type="primary"
                  :loading="syncing === row.id"
                  @click="sync(row.id)"
                  >同步成员</el-button
                ></template
              ></el-table-column
            >
          </el-table>
          <p class="hint">
            只认活动选定的官方群。活码自动新建的群需要导入并追加到活动；原有官方群继续有效。成员核验仅保存身份摘要。
          </p>
          <el-alert
            v-if="error"
            :title="error"
            type="error"
            :closable="false"
          />
        </el-tab-pane>
        <el-tab-pane label="群成员明细" name="members">
          <WelfareWecomMembers
            v-if="tab === 'members'"
            :groups="groups"
            :initial-group-id="memberGroupId"
            :can-edit="canEdit"
            @changed="loadGroups"
          />
        </el-tab-pane>
        <el-tab-pane v-if="canConfigure" label="接入配置" name="config">
          <el-alert
            title="企业微信和小程序须绑定同一个微信开放平台账号，才能用 UnionID 识别同一个人。应用需要客户联系及客户群读取权限，且可见范围包含这些群的群主。"
            type="info"
            :closable="false"
          />
          <el-form
            v-loading="configLoading"
            label-position="top"
            class="config-form"
            :disabled="configLoading || saving"
          >
            <el-form-item label="启用自动群成员核验"
              ><el-switch v-model="config.enabled"
            /></el-form-item>
            <el-form-item label="企业 ID（CorpID）"
              ><el-input
                v-model="config.corpId"
                autocomplete="off"
                maxlength="256"
            /></el-form-item>
            <el-form-item label="应用 Secret（具备客户联系权限）"
              ><el-input
                v-model="config.appSecret"
                type="password"
                show-password
                autocomplete="new-password"
                maxlength="256"
            /></el-form-item>
            <el-form-item label="微信开放平台账号标识"
              ><el-input
                v-model="config.unionScope"
                autocomplete="off"
                maxlength="256"
              />
              <p class="hint">
                填写服务端 WX_OPEN_PLATFORM_ACCOUNT_ID
                使用的账号标识。标识用于区分不同开放平台账号，请保持一致。
              </p></el-form-item
            >
            <el-form-item label="客户群变更回调 URL"
              ><el-input :model-value="callbackUrl" readonly />
              <p class="hint">
                在企业微信自建应用的“设置API接收”中配置此地址。正式接入请使用后端公网
                HTTPS 地址；Token 与 EncodingAESKey 须与本页保存的值一致。
              </p></el-form-item
            >
            <el-form-item label="回调 Token"
              ><el-input
                v-model="config.callbackToken"
                type="password"
                show-password
                autocomplete="new-password"
                maxlength="256"
            /></el-form-item>
            <el-form-item label="EncodingAESKey（43位）"
              ><el-input
                v-model="config.encodingAESKey"
                type="password"
                show-password
                autocomplete="new-password"
                maxlength="43"
            /></el-form-item>
            <p class="hint">
              已保存的密钥显示为 ******；保持原样会保留密钥。回调 Token 与
              EncodingAESKey 需一起填写。回调用于及时同步，系统也会定期补查。
            </p>
            <el-button
              type="primary"
              :loading="saving"
              :disabled="configLoading"
              @click="saveConfig"
              >保存配置</el-button
            >
          </el-form>
          <el-alert
            v-if="configError"
            :title="configError"
            type="error"
            :closable="false"
          />
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import WelfareWecomMembers from "./WelfareWecomMembers.vue";
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { request } from "@/api/request";
const props = defineProps<{
  canConfigure: boolean;
  canEdit: boolean;
  options: any;
}>();
const emit = defineEmits(["close", "changed"]);
const tab = ref("groups"),
  groups = ref<any[]>([]),
  configured = ref(false),
  loading = ref(false),
  error = ref("");
const config = ref<any>({
  enabled: false,
  corpId: "",
  appSecret: "",
  unionScope: "",
  callbackToken: "",
  encodingAESKey: "",
});
const configLoading = ref(false),
  configError = ref(""),
  saving = ref(false),
  regionId = ref(
    props.options.canGlobal ? "" : props.options.regions[0]?.id || "",
  );
const chatIds = ref(""),
  candidates = ref<any[]>([]),
  selected = ref<string[]>([]),
  cursor = ref(""),
  discovering = ref(false),
  importing = ref(false),
  syncing = ref("");
const manualImportVisible = ref(false),
  candidateSearch = ref(""),
  discovered = ref(false);
const importCount = computed(
  () => new Set(chatIds.value.split(/[\s,，]+/).filter(Boolean)).size,
);
const importedChatIds = computed(
  () => new Set(groups.value.map((group) => group.chatId)),
);
const filteredCandidates = computed(() => {
  const keyword = candidateSearch.value.trim().toLocaleLowerCase();
  return candidates.value.filter(
    (group) =>
      !keyword ||
      String(group.name || "")
        .toLocaleLowerCase()
        .includes(keyword),
  );
});
const memberGroupId = ref("");
function openMembers(id: string) {
  memberGroupId.value = id;
  tab.value = "members";
}
const base = "/admin/welfare/wecom";
const callbackUrl = computed(
  () =>
    new URL(
      request.getUri({ url: "/wechat/wecom/callback" }),
      window.location.href,
    ).href,
);
const message = (e: any) => {
  const value = e?.response?.data?.message || e?.message;
  return Array.isArray(value) ? value.join("；") : value || "操作失败，请重试";
};
const time = (value: any) =>
  value
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "尚未同步";
const regionName = (id: string) =>
  props.options.regions.find((r: any) => r.id === id)?.name || "全平台";
async function loadGroups() {
  loading.value = true;
  error.value = "";
  try {
    const data = await request.get<any, any>(base + "/groups", {
      skipGetDeduplication: true,
    });
    groups.value = data.list;
    configured.value = data.configured;
    emit("changed");
  } catch (e) {
    error.value = message(e);
  } finally {
    loading.value = false;
  }
}
async function loadConfig() {
  configLoading.value = true;
  configError.value = "";
  try {
    config.value = await request.get<any, any>(base + "/config", {
      skipGetDeduplication: true,
    });
  } catch (e) {
    configError.value = message(e);
  } finally {
    configLoading.value = false;
  }
}
async function saveConfig() {
  if (saving.value || configLoading.value) return;
  saving.value = true;
  configError.value = "";
  try {
    config.value = await request.put<any, any>(base + "/config", config.value);
    ElMessage.success("企业微信配置已保存");
    await loadGroups();
  } catch (e) {
    configError.value = message(e);
  } finally {
    saving.value = false;
  }
}
async function discover(next: boolean) {
  if (discovering.value) return;
  discovering.value = true;
  error.value = "";
  try {
    const data = await request.get<any, any>(base + "/discover", {
      params: { cursor: next ? cursor.value : "" },
      timeout: 60000,
      skipGetDeduplication: true,
    });
    candidates.value = next ? [...candidates.value, ...data.list] : data.list;
    cursor.value = data.cursor;
    discovered.value = true;
    if (!next) {
      selected.value = [];
      chatIds.value = "";
      candidateSearch.value = "";
    }
  } catch (e) {
    error.value = message(e);
  } finally {
    discovering.value = false;
  }
}
function selectCandidates() {
  chatIds.value = selected.value.join("\n");
}
async function register() {
  if (importing.value) return;
  const ids = [...new Set(chatIds.value.split(/[\s,，]+/).filter(Boolean))];
  if (!ids.length || ids.length > 20) {
    error.value = "每次请选择1至20个客户群";
    return;
  }
  importing.value = true;
  error.value = "";
  try {
    await request.post(
      base + "/groups",
      { chatIds: ids, regionId: regionId.value || null },
      { timeout: 180000 },
    );
    chatIds.value = "";
    selected.value = [];
    ElMessage.success("官方群已导入");
    await loadGroups();
  } catch (e) {
    await loadGroups();
    error.value = message(e);
  } finally {
    importing.value = false;
  }
}
async function sync(id: string) {
  if (syncing.value) return;
  syncing.value = id;
  error.value = "";
  try {
    await request.post(
      base + "/groups/" + id + "/sync",
      {},
      { timeout: 30000 },
    );
    ElMessage.success("群成员已同步");
    await loadGroups();
  } catch (e) {
    error.value = message(e);
  } finally {
    syncing.value = "";
  }
}
watch(
  () => props.canConfigure,
  (allowed) => {
    if (allowed) loadConfig();
  },
  { immediate: true },
);
onMounted(loadGroups);
</script>

<style scoped>
.wecom-panel {
  color: var(--mx-text);
}
.wecom-panel :deep(.el-alert) {
  margin-bottom: 18px;
}
.import-box {
  border: 1px solid var(--mx-border);
  border-radius: 12px;
  padding: 20px;
  margin: 16px 0 24px;
}
h3 {
  font-size: 16px;
  margin: 0 0 16px;
}
.actions,
.section-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.section-heading {
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-heading h3 {
  margin: 0;
}
.hint {
  font-size: 13px;
  line-height: 1.65;
  color: var(--mx-sub);
  margin: 8px 0;
  white-space: normal;
}
.error {
  color: var(--el-color-danger);
  font-size: 13px;
  line-height: 1.6;
}
.candidates {
  margin-top: 16px;
}
.candidates :deep(.el-checkbox) {
  display: flex;
  height: auto;
  align-items: flex-start;
  margin: 0;
  padding: 14px 0;
  border-bottom: 1px solid var(--mx-border);
}
.candidates :deep(.el-checkbox__input) {
  margin-top: 3px;
}
.candidates :deep(.el-checkbox__label) {
  flex: 1;
  min-width: 0;
  white-space: normal;
}
.candidate-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.candidate-name {
  color: var(--mx-text);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.candidate-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--mx-sub);
  font-size: 13px;
  line-height: 1.6;
}
.config-form {
  max-width: 680px;
  margin-top: 22px;
}
.config-form :deep(.el-form-item__content) {
  display: block;
}
</style>
