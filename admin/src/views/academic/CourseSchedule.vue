<template>
  <main class="academic-page">
    <header class="page-heading">
      <div>
        <h1>课表管理</h1>
        <p>录入一次上课规律，安排整个学期。</p>
      </div>
      <div class="toolbar">
        <el-select
          v-model="regionId"
          aria-label="学校区域"
          placeholder="选择学校区域"
          @change="changeRegion"
          ><el-option
            v-for="r in regions"
            :key="r.id"
            :value="r.id"
            :label="r.name" /></el-select
        ><el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </header>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />
    <el-empty v-if="!regionId && !loading" description="请先选择学校区域" />
    <template v-else>
      <div class="term-bar">
        <el-select
          v-model="termId"
          placeholder="先创建学期"
          aria-label="当前学期"
          @change="load"
          ><el-option
            v-for="t in data.terms"
            :key="t.id"
            :value="t.id"
            :label="t.name" /></el-select
        ><span v-if="data.term"
          >{{ data.term.startDate }} 至 {{ data.term.endDate }} · 第 1 周从
          {{ data.term.monday }} 开始</span
        >
      </div>
      <el-tabs v-model="tab" class="workspace">
        <el-tab-pane label="课程安排" name="rules">
          <div class="section-heading">
            <div>
              <h2>上课规律</h2>
              <p>修改先保存为草稿，预览并发布后才对学生生效。</p>
            </div>
            <el-button
              v-if="canEdit"
              type="primary"
              :disabled="
                !data.term || !data.classes.length || !data.teachers.length
              "
              @click="editRule()"
              >新增课程</el-button
            >
          </div>
          <el-alert
            v-if="!data.term || !data.classes.length || !data.teachers.length"
            title="先到“基础设置”创建学期、班级和老师，再录入课程。"
            type="info"
            :closable="false"
          />
          <el-table
            :data="data.rules"
            v-loading="loading"
            empty-text="还没有课程，点击“新增课程”开始安排"
          >
            <el-table-column label="课程 / 班级" min-width="210"
              ><template #default="{ row }"
                ><strong>{{ row.draft.courseName }}</strong>
                <p class="secondary">
                  {{ classNames(row.draft.classIds) }}
                </p></template
              ></el-table-column
            >
            <el-table-column label="时间与周次" min-width="220"
              ><template #default="{ row }"
                >每周{{ weekdays[row.draft.weekday - 1] }}
                {{ row.draft.startTime }}—{{ row.draft.endTime }}
                <p class="secondary">
                  第 {{ row.draft.weeks.join("、") }} 周
                </p></template
              ></el-table-column
            >
            <el-table-column label="老师 / 地点" min-width="150"
              ><template #default="{ row }"
                >{{ teacherName(row.draft.teacherId) }}
                <p class="secondary">{{ row.draft.location }}</p></template
              ></el-table-column
            >
            <el-table-column label="状态" width="120"
              ><template #default="{ row }"
                ><el-tag
                  :type="
                    row.publishedVersion === row.version ? 'success' : 'warning'
                  "
                  >{{
                    row.publishedVersion === row.version
                      ? "已发布"
                      : row.publishedVersion
                        ? "有待发布修改"
                        : "草稿"
                  }}</el-tag
                ></template
              ></el-table-column
            >
            <el-table-column label="操作" width="170"
              ><template #default="{ row }"
                ><el-button
                  v-if="canEdit"
                  link
                  type="primary"
                  @click="editRule(row)"
                  >编辑</el-button
                ><el-button link type="primary" @click="preview(row)"
                  >预览{{ canEdit ? "与发布" : "" }}</el-button
                ></template
              ></el-table-column
            >
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="实际课次" name="sessions">
          <div class="section-heading">
            <div>
              <h2>已经发布的课表</h2>
              <p>单次调课、停课或换教室，只影响选中的这一次。</p>
            </div>
            <el-button
              v-if="canEdit"
              type="primary"
              :disabled="
                !data.term || !data.classes.length || !data.teachers.length
              "
              @click="editSession()"
              >新增补课</el-button
            >
          </div>
          <div class="toolbar session-filters">
            <el-date-picker
              v-model="filterDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="筛选日期"
              clearable
            /><el-select v-model="filterClass" placeholder="全部班级" clearable
              ><el-option
                v-for="c in data.classes"
                :key="c.id"
                :value="c.id"
                :label="classLabel(c)" /></el-select
            ><span class="secondary">共 {{ filteredSessions.length }} 次</span>
          </div>
          <el-table :data="pagedSessions" empty-text="没有符合条件的课次">
            <el-table-column label="日期 / 时间" min-width="155"
              ><template #default="{ row }"
                >{{ row.date }}
                <p class="secondary">
                  {{ row.startTime }}—{{ row.endTime }}
                </p></template
              ></el-table-column
            >
            <el-table-column label="课程 / 班级" min-width="210"
              ><template #default="{ row }"
                ><strong>{{ row.courseName }}</strong>
                <p class="secondary">
                  {{ classNames(row.classIds) }}
                </p></template
              ></el-table-column
            >
            <el-table-column label="老师 / 地点" min-width="155"
              ><template #default="{ row }"
                >{{ teacherName(row.teacherId) }}
                <p class="secondary">{{ row.location }}</p></template
              ></el-table-column
            >
            <el-table-column label="安排" min-width="170"
              ><template #default="{ row }"
                ><el-tag
                  :type="
                    row.status === 'cancelled'
                      ? 'danger'
                      : row.exception
                        ? 'warning'
                        : 'success'
                  "
                  >{{
                    row.status === "cancelled"
                      ? "停课"
                      : row.exception
                        ? "单次安排"
                        : "正常上课"
                  }}</el-tag
                >
                <p class="secondary">{{ row.reason }}</p></template
              ></el-table-column
            >
            <el-table-column v-if="canEdit" label="操作" width="110"
              ><template #default="{ row }"
                ><el-button
                  link
                  type="primary"
                  :disabled="Date.parse(row.startAt) <= Date.now()"
                  @click="editSession(row)"
                  >调整课次</el-button
                ></template
              ></el-table-column
            > </el-table
          ><el-pagination
            v-model:current-page="sessionPage"
            :page-size="30"
            :total="filteredSessions.length"
            layout="total, prev, pager, next"
          />
        </el-tab-pane>
        <el-tab-pane label="基础设置" name="basics">
          <div class="section-heading">
            <div>
              <h2>学期与作息</h2>
              <p>第 1 教学周的周一用于计算周次，实际开课日可以不同。</p>
            </div>
            <el-button v-if="canEdit" @click="editTerm()">新建学期</el-button>
          </div>
          <el-table :data="data.terms" empty-text="请先创建学期"
            ><el-table-column prop="name" label="学期" /><el-table-column
              prop="monday"
              label="第 1 周周一"
            /><el-table-column
              prop="startDate"
              label="实际开课日"
            /><el-table-column
              prop="endDate"
              label="学期结束"
            /><el-table-column v-if="canEdit" label="操作" width="100"
              ><template #default="{ row }"
                ><el-button link type="primary" @click="editTerm(row)"
                  >设置</el-button
                ></template
              ></el-table-column
            ></el-table
          >
          <div class="section-heading separated">
            <div>
              <h2>专业与班级</h2>
              <p>学生自行选择班级，不作为学籍认证依据。</p>
            </div>
            <el-button v-if="canEdit" @click="editBasic('class')"
              >新增班级</el-button
            >
          </div>
          <el-table :data="data.classes" empty-text="还没有班级"
            ><el-table-column prop="major" label="专业" /><el-table-column
              prop="grade"
              label="入学年级"
            /><el-table-column prop="name" label="班级" /><el-table-column
              label="状态"
              ><template #default="{ row }">{{
                row.active ? "启用" : "停用"
              }}</template></el-table-column
            ><el-table-column v-if="canEdit" label="操作" width="100"
              ><template #default="{ row }"
                ><el-button link type="primary" @click="editBasic('class', row)"
                  >编辑</el-button
                ></template
              ></el-table-column
            ></el-table
          >
          <div class="section-heading separated">
            <div>
              <h2>任课老师</h2>
              <p>同名老师使用不同工号或区分编号。</p>
            </div>
            <el-button v-if="canEdit" @click="editBasic('teacher')"
              >新增老师</el-button
            >
          </div>
          <el-table :data="data.teachers" empty-text="还没有老师"
            ><el-table-column prop="name" label="姓名" /><el-table-column
              prop="code"
              label="工号 / 区分编号"
            /><el-table-column v-if="canEdit" label="操作" width="100"
              ><template #default="{ row }"
                ><el-button
                  link
                  type="primary"
                  @click="editBasic('teacher', row)"
                  >编辑</el-button
                ></template
              ></el-table-column
            ></el-table
          >
        </el-tab-pane>
        <el-tab-pane label="上课提醒" name="reminders">
          <div class="section-heading">
            <div>
              <h2>服务号上课提醒</h2>
              <p>学生需主动开启提醒，并绑定、关注服务号。</p>
            </div>
          </div>
          <el-form
            label-position="top"
            class="notification-form"
            :disabled="!canConfig || saving"
          >
            <div class="form-grid">
              <el-form-item label="学校提醒开关"
                ><el-switch
                  v-model="settingsForm.enabled"
                  active-text="开启"
                  inactive-text="关闭" /></el-form-item
              ><el-form-item label="提前几分钟提醒"
                ><el-input-number
                  v-model="settingsForm.leadMinutes"
                  :min="1"
                  :max="120"
              /></el-form-item>
            </div>
            <el-form-item label="微信公众平台中的课程提醒模板 ID"
              ><el-input
                v-model="settingsForm.templateId"
                placeholder="从已认证服务号的模板库获取"
                maxlength="128"
            /></el-form-item>
            <p class="secondary">
              按实际模板填写字段名称，例如
              thing1、time2；将其对应到右侧课程信息。至少包含课程名称和上课时间。
            </p>
            <div v-for="(m, i) in mappings" :key="i" class="mapping-row">
              <el-input
                v-model="m.key"
                :aria-label="`模板字段 ${i + 1}`"
                placeholder="模板字段名称"
              /><el-select
                v-model="m.value"
                :aria-label="`字段 ${i + 1} 对应内容`"
                ><el-option
                  v-for="f in fields"
                  :key="f.value"
                  :value="f.value"
                  :label="f.label" /></el-select
              ><el-button @click="mappings.splice(i, 1)">移除</el-button>
            </div>
            <el-button
              :disabled="mappings.length >= 5"
              @click="mappings.push({ key: '', value: 'location' })"
              >添加字段</el-button
            >
            <p class="secondary">
              首次启用前请核实该模板适用于实际课程服务。接口已接受代表微信接收了请求，送达结果需查看服务号消息记录。
            </p>
            <el-button
              v-if="canConfig"
              type="primary"
              :loading="saving"
              @click="saveSettings"
              >保存提醒设置</el-button
            >
          </el-form>
          <div class="section-heading separated">
            <div>
              <h2>最近发送记录</h2>
              <p>显示最近 100 条。结果待核实的消息不自动重发。</p>
            </div>
          </div>
          <el-table :data="data.reminders" empty-text="还没有课程提醒记录"
            ><el-table-column label="课程"
              ><template #default="{ row }"
                >{{ row.session.courseName }}
                <p class="secondary">
                  {{ row.session.date }} {{ row.session.startTime }}
                </p></template
              ></el-table-column
            ><el-table-column label="状态"
              ><template #default="{ row }">{{
                reminderLabels[row.status] || row.status
              }}</template></el-table-column
            ><el-table-column
              prop="attempts"
              label="发送尝试"
              width="100" /><el-table-column
              prop="error"
              label="说明"
              min-width="230"
          /></el-table>
        </el-tab-pane>
      </el-tabs>
    </template>

    <el-dialog
      v-model="editorOpen"
      :title="editorTitle"
      width="min(760px, 96vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="!saving"
      :show-close="!saving"
    >
      <el-alert
        v-if="formError"
        :title="formError"
        type="error"
        :closable="false"
      />
      <el-form
        label-position="top"
        :disabled="saving"
        @submit.prevent="saveEditor"
      >
        <template v-if="editor === 'term'">
          <el-form-item label="学期名称"
            ><el-input
              v-model="form.name"
              placeholder="例如：2026—2027 学年第一学期"
              maxlength="80"
          /></el-form-item>
          <div class="form-grid">
            <el-form-item label="第 1 教学周周一"
              ><el-date-picker
                v-model="form.monday"
                type="date"
                value-format="YYYY-MM-DD" /></el-form-item
            ><el-form-item label="实际开课日期"
              ><el-date-picker
                v-model="form.startDate"
                type="date"
                value-format="YYYY-MM-DD" /></el-form-item
            ><el-form-item label="学期结束日期"
              ><el-date-picker
                v-model="form.endDate"
                type="date"
                value-format="YYYY-MM-DD"
            /></el-form-item>
          </div>
          <h3>作息时间</h3>
          <p class="secondary">
            先配置节次，录入课程时可直接选择连续节次，也可手填时间。
          </p>
          <div v-for="(s, i) in form.slots" :key="i" class="slot-row">
            <el-input
              v-model="s.name"
              placeholder="第 1 节"
              :aria-label="`节次 ${i + 1} 名称`"
            /><el-time-picker
              v-model="s.startTime"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="开始"
            /><el-time-picker
              v-model="s.endTime"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="结束"
            /><el-button @click="form.slots.splice(i, 1)">移除</el-button>
          </div>
          <el-button
            :disabled="form.slots.length >= 24"
            @click="
              form.slots.push({
                name: `第 ${form.slots.length + 1} 节`,
                startTime: '',
                endTime: '',
              })
            "
            >添加节次</el-button
          >
        </template>
        <template v-else-if="editor === 'class'">
          <el-form-item label="专业"
            ><el-input v-model="form.major" maxlength="80"
          /></el-form-item>
          <div class="form-grid">
            <el-form-item label="入学年级"
              ><el-input-number
                v-model="form.grade"
                :min="2000"
                :max="2099" /></el-form-item
            ><el-form-item label="班级名称"
              ><el-input
                v-model="form.name"
                placeholder="例如：1班"
                maxlength="80"
            /></el-form-item>
          </div>
          <el-switch v-model="form.active" active-text="启用班级" />
          <p class="secondary">
            停用后不可新选该班级，也不再向该班级发送提醒。
          </p>
        </template>
        <template v-else-if="editor === 'teacher'"
          ><el-form-item label="老师姓名"
            ><el-input v-model="form.name" maxlength="80" /></el-form-item
          ><el-form-item label="工号或自定义区分编号"
            ><el-input
              v-model="form.code"
              maxlength="40"
              placeholder="用于区分同名老师" /></el-form-item
        ></template>
        <template v-else>
          <template v-if="editor === 'rule' || !form.id"
            ><el-form-item label="课程名称"
              ><el-input
                v-model="form.courseName"
                maxlength="80" /></el-form-item
            ><el-form-item label="上课班级（可多选合班）"
              ><el-select
                v-model="form.classIds"
                multiple
                filterable
                placeholder="选择上课班级"
                ><el-option
                  v-for="c in data.classes.filter((c: any) => c.active)"
                  :key="c.id"
                  :value="c.id"
                  :label="classLabel(c)" /></el-select></el-form-item
          ></template>
          <div class="form-grid">
            <el-form-item label="任课老师"
              ><el-select
                v-model="form.teacherId"
                filterable
                placeholder="选择任课老师"
                ><el-option
                  v-for="t in data.teachers"
                  :key="t.id"
                  :value="t.id"
                  :label="`${t.name} · ${t.code}`" /></el-select></el-form-item
            ><el-form-item label="上课地点"
              ><el-input
                v-model="form.location"
                maxlength="160"
                placeholder="例如：教学楼 A203"
            /></el-form-item>
          </div>
          <el-form-item v-if="editor === 'rule'" label="每周几上课"
            ><el-radio-group v-model="form.weekday"
              ><el-radio-button
                v-for="(w, i) in weekdays"
                :key="i"
                :value="i + 1"
                >周{{ w }}</el-radio-button
              ></el-radio-group
            ></el-form-item
          >
          <el-form-item v-else label="实际上课日期"
            ><el-date-picker
              v-model="form.date"
              type="date"
              value-format="YYYY-MM-DD"
          /></el-form-item>
          <el-form-item
            v-if="data.term?.slots?.length"
            label="按作息选择连续节次"
            ><el-select
              v-model="selectedSlots"
              multiple
              placeholder="选择节次，或直接填写下面的时间"
              @change="applySlots"
              ><el-option
                v-for="(s, i) in data.term.slots"
                :key="i"
                :value="i"
                :label="`${s.name} ${s.startTime}—${s.endTime}`" /></el-select
          ></el-form-item>
          <div class="form-grid">
            <el-form-item label="开始时间"
              ><el-time-picker
                v-model="form.startTime"
                format="HH:mm"
                value-format="HH:mm" /></el-form-item
            ><el-form-item label="结束时间"
              ><el-time-picker
                v-model="form.endTime"
                format="HH:mm"
                value-format="HH:mm"
            /></el-form-item>
          </div>
          <template v-if="editor === 'rule'"
            ><div class="week-actions">
              <h3>上课周次</h3>
              <el-button size="small" @click="selectWeeks('all')"
                >全部</el-button
              ><el-button size="small" @click="selectWeeks('odd')"
                >单周</el-button
              ><el-button size="small" @click="selectWeeks('even')"
                >双周</el-button
              ><el-button size="small" @click="form.weeks = []">清空</el-button>
            </div>
            <el-checkbox-group v-model="form.weeks" class="week-grid"
              ><el-checkbox v-for="w in totalWeeks" :key="w" :value="w"
                >第 {{ w }} 周</el-checkbox
              ></el-checkbox-group
            ></template
          >
          <template v-else
            ><el-form-item v-if="form.id" label="课程状态"
              ><el-radio-group v-model="form.status"
                ><el-radio value="scheduled">正常上课</el-radio
                ><el-radio value="cancelled">停课</el-radio></el-radio-group
              ></el-form-item
            ><el-form-item label="调整 / 补课说明"
              ><el-input
                v-model="form.reason"
                type="textarea"
                maxlength="200"
                show-word-limit /></el-form-item
          ></template>
        </template>
      </el-form>
      <template #footer
        ><el-button :disabled="saving" @click="editorOpen = false"
          >取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveEditor">{{
          editor === "rule" ? "保存草稿" : "保存"
        }}</el-button></template
      >
    </el-dialog>
    <el-dialog
      v-model="previewOpen"
      title="发布前预览"
      width="min(820px, 96vw)"
      :close-on-click-modal="false"
    >
      <el-alert
        v-for="issue in previewData.issues"
        :key="issue"
        :title="issue"
        type="error"
        :closable="false"
      />
      <p>
        本次生成或更新 {{ previewData.rows.length }} 次，取消
        {{ previewData.cancelled.length }} 次。保留
        {{ previewData.preserved.length }} 次历史或单次调整。
      </p>
      <el-table
        :data="previewData.rows"
        max-height="420"
        empty-text="没有待生成的未来课次"
        ><el-table-column
          prop="sourceWeek"
          label="来源周次"
          width="90" /><el-table-column
          prop="date"
          label="日期" /><el-table-column
          prop="startTime"
          label="开始" /><el-table-column
          prop="endTime"
          label="结束" /><el-table-column prop="location" label="地点"
      /></el-table>
      <div v-if="previewData.cancelled.length" class="secondary">
        <h3>将取消的课次</h3>
        <p v-for="s in previewData.cancelled" :key="s.id">
          {{ s.date }} {{ s.startTime }} {{ s.courseName }}
        </p>
      </div>
      <el-alert
        v-if="formError"
        :title="formError"
        type="error"
        :closable="false"
      />
      <template #footer
        ><el-button @click="previewOpen = false">返回</el-button
        ><el-button
          v-if="canEdit"
          type="primary"
          :loading="saving"
          :disabled="previewData.issues.length > 0"
          @click="publish"
          >确认发布</el-button
        ></template
      >
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { request } from "@/api/request";
import { useAuthStore } from "@/stores/auth";
import { isSuperRole } from "@/router/access";
const auth = useAuthStore();
const canEdit = computed(
  () =>
    isSuperRole(auth.user.role) || auth.permissions.includes("academic:edit"),
);
const canConfig = computed(
  () =>
    isSuperRole(auth.user.role) || auth.permissions.includes("academic:config"),
);
const base = "/admin/academic";
const regions = ref<any[]>([]),
  regionId = ref(""),
  termId = ref(""),
  tab = ref("rules"),
  loading = ref(false),
  saving = ref(false),
  error = ref(""),
  formError = ref("");
const data = reactive<any>({
  terms: [],
  term: null,
  classes: [],
  teachers: [],
  rules: [],
  sessions: [],
  reminders: [],
  setting: {},
});
const filterDate = ref(""),
  filterClass = ref(""),
  sessionPage = ref(1);
const filteredSessions = computed(() =>
  data.sessions.filter(
    (s: any) =>
      (!filterDate.value || s.date === filterDate.value) &&
      (!filterClass.value || s.classIds.includes(filterClass.value)),
  ),
);
const pagedSessions = computed(() =>
  filteredSessions.value.slice(
    (sessionPage.value - 1) * 30,
    sessionPage.value * 30,
  ),
);
watch([filterDate, filterClass], () => {
  sessionPage.value = 1;
});
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const totalWeeks = computed(() =>
  data.term
    ? Math.floor(
        (Date.parse(data.term.endDate) - Date.parse(data.term.monday)) /
          86400000 /
          7,
      ) + 1
    : 0,
);
const settingsForm = reactive({
  enabled: false,
  leadMinutes: 20,
  templateId: "",
});
const mappings = ref<{ key: string; value: string }[]>([]);
const fields = [
  { value: "courseName", label: "课程名称" },
  { value: "teacherName", label: "任课老师" },
  { value: "startTime", label: "上课日期与时间" },
  { value: "location", label: "上课地点" },
  { value: "className", label: "班级" },
];
const reminderLabels: Record<string, string> = {
  pending: "待发送",
  processing: "发送中",
  accepted: "接口已接受",
  cancelled: "已取消",
  failed: "发送失败",
  unknown: "结果待核实",
  retry: "等待重试",
};
const editor = ref(""),
  editorOpen = ref(false),
  form = ref<any>({}),
  selectedSlots = ref<number[]>([]);
const editorTitle = computed(
  () =>
    ({
      term: "学期与作息设置",
      class: "班级设置",
      teacher: "老师信息",
      rule: "编辑课程规律",
      session: form.value.id ? "调整这一次课" : "新增补课",
    })[editor.value] || "编辑",
);
const previewOpen = ref(false),
  previewData = reactive<any>({
    rows: [],
    cancelled: [],
    preserved: [],
    issues: [],
  });
const classLabel = (c: any) => `${c.major} · ${c.grade}级 · ${c.name}`;
const classNames = (ids: string[]) =>
  ids
    .map((id) => {
      const c = data.classes.find((c: any) => c.id === id);
      return c ? classLabel(c) : "班级信息待更新";
    })
    .join("、");
const teacherName = (id: string) =>
  data.teachers.find((t: any) => t.id === id)?.name || "老师信息待更新";
const message = (e: any) =>
  Array.isArray(e?.response?.data?.message)
    ? e.response.data.message.join("；")
    : e?.response?.data?.message || e?.message || "操作失败，请重试";
async function api(path: string, method = "GET", body?: any): Promise<any> {
  return request({
    url: base + path,
    method,
    ...(method === "GET"
      ? { params: body, skipGetDeduplication: true }
      : { data: body }),
  });
}
let loadVersion = 0;
async function load() {
  if (!regionId.value) return;
  const version = ++loadVersion;
  loading.value = true;
  error.value = "";
  try {
    const result = await api("/workspace", "GET", {
      regionId: regionId.value,
      termId: termId.value || undefined,
    });
    if (version !== loadVersion) return;
    Object.assign(data, result);
    termId.value = result.term?.id || "";
    Object.assign(settingsForm, {
      enabled: !!result.setting.enabled,
      leadMinutes: result.setting.leadMinutes,
      templateId: result.template?.templateId || "",
    });
    mappings.value = Object.entries(result.template?.fieldMapping || {}).map(
      ([key, value]) => ({ key, value: String(value) }),
    );
    sessionPage.value = 1;
  } catch (e) {
    if (version === loadVersion) error.value = message(e);
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}
function changeRegion() {
  termId.value = "";
  filterClass.value = "";
  filterDate.value = "";
  Object.assign(data, {
    terms: [],
    term: null,
    classes: [],
    teachers: [],
    rules: [],
    sessions: [],
    reminders: [],
  });
  load();
}
function open(kind: string, value: any) {
  editor.value = kind;
  form.value = JSON.parse(JSON.stringify(value));
  formError.value = "";
  selectedSlots.value = [];
  editorOpen.value = true;
}
function editTerm(row?: any) {
  open(
    "term",
    row || { name: "", monday: "", startDate: "", endDate: "", slots: [] },
  );
}
function editBasic(kind: string, row?: any) {
  open(
    kind,
    row ||
      (kind === "class"
        ? { name: "", major: "", grade: new Date().getFullYear(), active: true }
        : { name: "", code: "" }),
  );
}
function editRule(row?: any) {
  open(
    "rule",
    row
      ? { ...row.draft, id: row.id, version: row.version }
      : {
          courseName: "",
          teacherId: "",
          location: "",
          weekday: 1,
          weeks: [],
          classIds: [],
          startTime: "",
          endTime: "",
        },
  );
}
function editSession(row?: any) {
  open(
    "session",
    row || {
      courseName: "",
      classIds: [],
      teacherId: "",
      location: "",
      date: "",
      startTime: "",
      endTime: "",
      status: "scheduled",
      reason: "",
    },
  );
}
function selectWeeks(type: string) {
  form.value.weeks = Array.from(
    { length: totalWeeks.value },
    (_, i) => i + 1,
  ).filter(
    (w) => type === "all" || (type === "odd" ? w % 2 === 1 : w % 2 === 0),
  );
}
function applySlots() {
  const selected = [...selectedSlots.value].sort((a, b) => a - b);
  if (!selected.length) return;
  if (selected.some((n, i) => i && n !== selected[i - 1] + 1)) {
    formError.value = "请选择连续节次；不连续的课程请分别录入。";
    selectedSlots.value = [];
    return;
  }
  formError.value = "";
  const slots = data.term.slots;
  form.value.startTime = slots[selected[0]].startTime;
  form.value.endTime = slots[selected[selected.length - 1]].endTime;
}
async function saveEditor() {
  if (saving.value) return;
  saving.value = true;
  formError.value = "";
  const paths: Record<string, string> = {
    term: "/terms",
    class: "/classes",
    teacher: "/teachers",
    rule: "/rules",
    session: "/sessions",
  };
  try {
    const path =
      paths[editor.value] +
      (editor.value === "session" && form.value.id ? "/" + form.value.id : "");
    const result = await api(
      path,
      editor.value === "session" && form.value.id ? "PUT" : "POST",
      { ...form.value, regionId: regionId.value, termId: termId.value },
    );
    if (editor.value === "term") termId.value = result.id;
    editorOpen.value = false;
    ElMessage.success(
      editor.value === "rule" ? "草稿已保存，请预览后发布" : "已保存",
    );
    await load();
  } catch (e) {
    formError.value = message(e);
  } finally {
    saving.value = false;
  }
}
async function preview(row: any) {
  formError.value = "";
  try {
    Object.assign(previewData, await api(`/rules/${row.id}/preview`));
    previewOpen.value = true;
  } catch (e) {
    error.value = message(e);
  }
}
async function publish() {
  if (saving.value) return;
  saving.value = true;
  formError.value = "";
  try {
    await api(`/rules/${previewData.ruleId}/publish`, "POST", {
      version: previewData.version,
    });
    previewOpen.value = false;
    ElMessage.success("课表已发布");
    await load();
  } catch (e) {
    formError.value = message(e);
  } finally {
    saving.value = false;
  }
}
async function saveSettings() {
  if (saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    if (
      new Set(mappings.value.map((m) => m.key.trim())).size !==
      mappings.value.length
    )
      throw Error("模板字段不能重复");
    await api("/settings", "PUT", {
      regionId: regionId.value,
      ...settingsForm,
      fieldMapping: Object.fromEntries(
        mappings.value.map((m) => [m.key.trim(), m.value]),
      ),
    });
    ElMessage.success("提醒设置已保存");
    await load();
  } catch (e) {
    error.value = message(e);
  } finally {
    saving.value = false;
  }
}
onMounted(async () => {
  try {
    regions.value = (await api("/options")).regions;
    regionId.value = regions.value[0]?.id || "";
    await load();
  } catch (e) {
    error.value = message(e);
  }
});
</script>

<style scoped>
.academic-page {
  --ink: #183c36;
  --muted: #526761;
  --line: #dfe9e5;
  color: var(--ink);
  max-width: 1460px;
  margin: 0 auto;
  padding: 24px;
}
.academic-page h1 {
  font-size: 28px;
  line-height: 1.3;
  margin: 0 0 8px;
  font-weight: 650;
}
.academic-page h2 {
  font-size: 19px;
  margin: 0 0 6px;
}
.academic-page h3 {
  font-size: 15px;
  margin: 16px 0 10px;
}
.academic-page p {
  margin: 6px 0;
  line-height: 1.65;
}
.page-heading,
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}
.page-heading {
  margin-bottom: 26px;
}
.page-heading p,
.section-heading p,
.secondary {
  color: var(--muted);
  font-size: 13px;
}
.toolbar,
.term-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.toolbar .el-select {
  width: 210px;
}
.term-bar {
  padding: 18px 0;
  border-top: 1px solid var(--line);
  font-size: 13px;
  color: var(--muted);
}
.term-bar .el-select {
  width: 280px;
}
.workspace {
  background: white;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px 24px 28px;
}
.section-heading {
  margin: 14px 0 22px;
}
.separated {
  margin-top: 38px;
  padding-top: 28px;
  border-top: 1px solid var(--line);
}
.session-filters {
  margin-bottom: 20px;
}
.el-pagination {
  margin-top: 20px;
  justify-content: flex-end;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 20px;
}
.el-form-item :deep(.el-select),
.el-form-item :deep(.el-date-editor) {
  width: 100%;
}
.week-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.week-actions h3 {
  margin-right: auto;
}
.week-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
}
.week-grid .el-checkbox {
  margin: 0;
}
.slot-row {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1.2fr auto;
  gap: 8px;
  margin: 10px 0;
}
.slot-row :deep(.el-date-editor) {
  width: 100%;
}
.notification-form {
  max-width: 680px;
}
.mapping-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 10px;
  margin: 10px 0;
}
.academic-page :deep(.el-table__cell) {
  padding: 14px 0;
}
.academic-page :deep(.el-button:focus-visible) {
  outline: 2px solid #0d6230;
  outline-offset: 3px;
}
.academic-page ::selection {
  background: #cceedd;
  color: #183c36;
}
@media (max-width: 760px) {
  .academic-page {
    padding: 12px;
  }
  .page-heading,
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }
  .workspace {
    padding: 8px 12px 20px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .week-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .slot-row {
    grid-template-columns: 1fr 1fr;
  }
  .term-bar .el-select,
  .toolbar .el-select {
    width: 100%;
  }
  .toolbar {
    width: 100%;
  }
}
</style>
