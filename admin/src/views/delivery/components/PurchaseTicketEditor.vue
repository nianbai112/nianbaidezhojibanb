<template>
  <div class="ticket-editor">
    <div class="editor-side">
      <div class="toolbar-row">
        <el-dropdown trigger="click" @command="applyTemplate">
          <el-button size="small" type="primary" plain>套用样式 / 复制</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="p in presets || []" :key="`p:${p.key}`" :command="p.template">
                <div class="menu-item">
                  <strong>{{ p.name }}</strong><span>{{ p.description }}</span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item
                v-for="(src, n) in sources || []"
                :key="`s:${n}`"
                :command="src.template"
                :divided="n === 0 && !!presets?.length"
                >{{ src.label }}</el-dropdown-item
              >
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <span class="hint inline">按住 ⋮⋮ 拖动调整顺序；点右侧预览里的某一行可定位到对应模块。</span>
      </div>
      <div class="global-row">
        <span class="field-label">纸宽</span>
        <el-radio-group v-model="tpl.paperWidth" size="small">
          <el-radio-button :value="58">58mm</el-radio-button>
          <el-radio-button :value="80">80mm</el-radio-button>
        </el-radio-group>
        <span class="field-label">联数</span>
        <el-input-number v-model="tpl.copies" :min="1" :max="3" size="small" controls-position="right" style="width: 86px" />
        <el-checkbox v-model="tpl.voice">来单语音</el-checkbox>
        <el-checkbox v-model="tpl.cut">自动切纸</el-checkbox>
      </div>
      <p class="hint">联数和语音只有飞鹅云（联数还有芯烨云）支持；切纸只对带切刀的机型有效。</p>

      <div
        v-for="(b, i) in tpl.blocks"
        :key="keyOf(b)"
        :ref="(el: any) => setRow(b, el)"
        class="block-row"
        :class="{
          off: !b.enabled,
          active: activeKey === keyOf(b),
          hl: hoverKey === keyOf(b),
          dragging: dragFrom === i,
          'drop-before': dragFrom !== null && dropAt === i,
          'drop-after': dragFrom !== null && dropAt === tpl.blocks.length && i === tpl.blocks.length - 1,
        }"
        :draggable="armed === keyOf(b)"
        @dragstart="onDragStart(i, $event)"
        @dragover.prevent="onDragOver(i, $event)"
        @drop.prevent="onDrop"
        @dragend="onDragEnd"
        @mouseenter="hoverKey = keyOf(b)"
        @mouseleave="hoverKey = 0"
        @click="activeKey = keyOf(b)"
      >
        <div class="block-head">
          <span
            class="drag-handle"
            title="按住拖动排序"
            @mousedown="armed = keyOf(b)"
            @mouseup="armed = 0"
            >⋮⋮</span
          >
          <el-checkbox v-model="b.enabled" />
          <strong>{{ blockName(b.type) }}</strong>
          <span class="grow" />
          <el-button link size="small" :disabled="i === 0" @click="move(i, -1)">上移</el-button>
          <el-button link size="small" :disabled="i === tpl.blocks.length - 1" @click="move(i, 1)">下移</el-button>
          <el-button link size="small" type="danger" @click="remove(i)">删除</el-button>
        </div>
        <div v-if="b.enabled && hasBody(b.type)" class="block-body">
          <el-input
            v-if="isField(b.type)"
            v-model="b.label"
            size="small"
            maxlength="20"
            :placeholder="`前缀，如「${fieldName(b.type)}：」，可留空`"
          />
          <template v-if="b.type === 'text' || b.type === 'stops'">
            <el-input
              :ref="(el: any) => setInput(b, el)"
              v-model="b.text"
              type="textarea"
              :rows="2"
              maxlength="200"
              show-word-limit
              :placeholder="b.type === 'stops' ? '只在多店合单时打印' : '任意文字，可换行'"
            />
            <div class="vars">
              <span>插入：</span>
              <el-tag
                v-for="v in variables"
                :key="v"
                size="small"
                effect="plain"
                class="var-tag"
                @click="insert(b, v)"
                >{{ v }}</el-tag
              >
            </div>
          </template>
          <el-input
            v-if="b.type === 'qrcode'"
            v-model="b.text"
            size="small"
            maxlength="120"
            show-word-limit
            placeholder="二维码内容，如店铺网址，可用 {订单号} 等变量"
          />
          <div v-if="b.type === 'items'" class="style-row">
            <el-checkbox v-model="b.showSpec">显示规格</el-checkbox>
            <el-checkbox v-model="b.showPrice">显示价格</el-checkbox>
            <el-checkbox v-model="b.bigQuantity">数量放大</el-checkbox>
          </div>
          <div class="style-row">
            <template v-if="b.type !== 'qrcode'">
              <span class="field-label">{{ b.type === 'items' ? '商品名' : '字号' }}</span>
              <el-select v-model="b.size" size="small" style="width: 96px">
                <el-option v-for="s in sizes" :key="s.value" :label="s.label" :value="s.value" />
              </el-select>
            </template>
            <el-radio-group v-model="b.align" size="small">
              <el-radio-button value="left">居左</el-radio-button>
              <el-radio-button value="center">居中</el-radio-button>
              <el-radio-button value="right">居右</el-radio-button>
            </el-radio-group>
            <el-checkbox v-if="b.type !== 'qrcode'" v-model="b.bold">加粗</el-checkbox>
          </div>
        </div>
      </div>

      <el-dropdown trigger="click" @command="add">
        <el-button size="small" class="add-btn">＋ 添加模块</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="t in addable" :key="t" :command="t">{{ blockName(t) }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div class="preview-side">
      <div class="preview-title">预览 · {{ tpl.paperWidth }}mm</div>
      <div class="paper" :class="`w${tpl.paperWidth}`">
        <!-- eslint-disable vue/no-v-html -- built from escaped text only -->
        <div
          v-for="(part, n) in previewParts"
          :key="n"
          class="part"
          :class="{
            link: part.index !== null,
            active: part.index !== null && keyAt(part.index) === activeKey,
            hl: part.index !== null && keyAt(part.index) === hoverKey,
          }"
          @click="part.index !== null && select(part.index)"
          @mouseenter="hoverKey = part.index !== null ? keyAt(part.index) : 0"
          @mouseleave="hoverKey = 0"
          v-html="part.html"
        />
        <!-- eslint-enable vue/no-v-html -->
      </div>
      <p v-if="previewError" class="preview-error">{{ previewError }}</p>
      <p class="hint">用示例订单预览，字号和对齐为近似效果，以「打印测试页」为准。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, reactive, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import QRCode from "qrcode";
import { postAction } from "@/api/request";

const props = defineProps<{
  modelValue: any;
  regionId: string;
  shopId?: string;
  /** Ready-made layouts from the server. */
  presets?: { key: string; name: string; description: string; template: any }[];
  /** Other templates that can be copied in, e.g. another shop's. */
  sources?: { label: string; template: any }[];
}>();
const emit = defineEmits<{ (e: "update:modelValue", value: any): void }>();

const names: Record<string, string> = {
  pickupCode: "取餐码",
  shopName: "店名",
  orderNo: "订单号",
  acceptTime: "接单时间",
  rider: "骑手",
  remark: "备注",
  stops: "多店提示",
  items: "商品列表",
  text: "自定义文字",
  divider: "分隔线",
  blank: "空行",
  qrcode: "二维码",
};
const fields = ["pickupCode", "shopName", "orderNo", "acceptTime", "rider", "remark"];
const variables = ["取餐码", "店名", "订单号", "接单时间", "骑手", "备注", "件数", "货款", "第几家", "店铺数"];
const sizes = [
  { value: "normal", label: "标准" },
  { value: "tall", label: "加高" },
  { value: "wide", label: "加宽" },
  { value: "double", label: "放大" },
];
const addable = ["text", "divider", "blank", "qrcode", ...fields, "stops", "items"];
const blockName = (type: string) => names[type] || type;
const fieldName = (type: string) => names[type] || "";
const isField = (type: string) => fields.includes(type);
const hasBody = (type: string) => !["divider", "blank"].includes(type);

const clone = (value: any) => JSON.parse(JSON.stringify(value));
const tpl = reactive<any>(clone(props.modelValue));
// The parent replaces the template on load / reset; local edits flow back up.
// Our own echo is ignored so block objects (and input focus) survive typing.
let lastEmitted = JSON.stringify(tpl);
watch(
  () => props.modelValue,
  (value) => {
    if (JSON.stringify(value) === lastEmitted) return;
    lastEmitted = JSON.stringify(value);
    Object.assign(tpl, clone(value));
  },
);
watch(
  tpl,
  () => {
    const json = JSON.stringify(tpl);
    if (json !== lastEmitted) {
      lastEmitted = json;
      emit("update:modelValue", JSON.parse(json));
    }
    schedulePreview();
  },
  { deep: true },
);

// Stable row keys so inputs keep focus when blocks move.
const keys = new WeakMap<object, number>();
let nextKey = 1;
const keyOf = (b: object) => {
  if (!keys.has(b)) keys.set(b, nextKey++);
  return keys.get(b)!;
};
function move(i: number, step: number) {
  const [b] = tpl.blocks.splice(i, 1);
  tpl.blocks.splice(i + step, 0, b);
}
function remove(i: number) {
  tpl.blocks.splice(i, 1);
}

// Drag only starts from the handle, so selecting text in inputs still works.
const armed = ref(0);
const dragFrom = ref<number | null>(null);
const dropAt = ref<number | null>(null);
function onDragStart(i: number, e: DragEvent) {
  dragFrom.value = i;
  e.dataTransfer?.setData("text/plain", String(i));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function onDragOver(i: number, e: DragEvent) {
  if (dragFrom.value === null) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  dropAt.value = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
}
function onDrop() {
  const from = dragFrom.value;
  const to = dropAt.value;
  if (from !== null && to !== null && to !== from && to !== from + 1) {
    const [b] = tpl.blocks.splice(from, 1);
    tpl.blocks.splice(to > from ? to - 1 : to, 0, b);
    activeKey.value = keyOf(b);
  }
  onDragEnd();
}
function onDragEnd() {
  dragFrom.value = null;
  dropAt.value = null;
  armed.value = 0;
}

// Preview ↔ block linking.
const activeKey = ref(0);
const hoverKey = ref(0);
const rows = new WeakMap<object, HTMLElement>();
const setRow = (b: object, el: any) => el && rows.set(b, el);
const keyAt = (index: number) => (tpl.blocks[index] ? keyOf(tpl.blocks[index]) : -1);
function select(index: number) {
  const b = tpl.blocks[index];
  if (!b) return;
  activeKey.value = keyOf(b);
  nextTick(() => rows.get(b)?.scrollIntoView({ behavior: "smooth", block: "center" }));
}

async function applyTemplate(template: any) {
  try {
    await ElMessageBox.confirm("会替换当前正在编辑的小票，保存前都还能再改。", "套用样式", {
      confirmButtonText: "套用",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  Object.assign(tpl, clone(template));
  activeKey.value = 0;
}
function add(type: string) {
  tpl.blocks.push({
    type,
    enabled: true,
    size: "normal",
    align: type === "qrcode" ? "center" : "left",
    bold: false,
    label: isField(type) ? `${names[type]}：` : "",
    text: type === "stops" ? "本单共{店铺数}家店，这是第{第几家}家" : "",
    showSpec: true,
    showPrice: true,
    bigQuantity: true,
  });
}
// Insert a variable at the caret of that block's textarea.
const inputs = new WeakMap<object, any>();
const setInput = (b: object, el: any) => el && inputs.set(b, el);
function insert(b: any, name: string) {
  const token = `{${name}}`;
  const area: HTMLTextAreaElement | undefined = inputs.get(b)?.textarea;
  const at = area?.selectionStart ?? b.text.length;
  b.text = `${b.text.slice(0, at)}${token}${b.text.slice(area?.selectionEnd ?? at)}`;
}

// ==================== 预览 ====================
const previewParts = ref<{ index: number | null; html: string }[]>([]);
const previewError = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;
let version = 0;
function schedulePreview() {
  clearTimeout(timer);
  timer = setTimeout(loadPreview, 300);
}
async function loadPreview() {
  const current = ++version;
  try {
    const result: any = await postAction("/admin/errand/purchase/ticket-template/preview", {
      regionId: props.regionId,
      shopId: props.shopId,
      template: tpl,
    });
    const data = result?.data || result;
    if (current !== version) return;
    previewError.value = data?.error || "";
    if (data?.parts?.length) {
      const parts = await Promise.all(
        data.parts.map(async (part: any) => ({ index: part.index, html: await toHtml(part.markup) })),
      );
      if (current === version) previewParts.value = parts;
    }
  } catch {
    // The request layer already shows the error.
  }
}
watch(() => [props.regionId, props.shopId], schedulePreview, { immediate: true });
onUnmounted(() => clearTimeout(timer));

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const voices: Record<string, string> = {
  "AUDIO-COMMON": "语音：你有新的订单",
  "AUDIO-CANCEL": "语音：有用户申请取消订单了",
};

/** Feie markup → approximate HTML. Text from the server is already free of printer tags. */
async function toHtml(markup: string) {
  const qr = new Map<string, string>();
  for (const [, code] of markup.matchAll(/<QR>([\s\S]*?)<\/QR>/g))
    if (!qr.has(code)) qr.set(code, await QRCode.toDataURL(code, { margin: 1, width: 116 }).catch(() => ""));
  const lines = markup.split("<BR>");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines
    .map((line) => {
      let align = "left";
      if (/^<CB>|^<C>/.test(line)) align = "center";
      else if (/^<RIGHT>/.test(line)) align = "right";
      let html = "";
      let size = "";
      let bold = false;
      let inQr = false;
      const re = /<(\/?)(CB|C|RIGHT|B|L|W|BOLD|QR)>|<(AUDIO-[A-Z]+|CUT)>/g;
      let last = 0;
      const text = (value: string) => {
        if (!value || inQr) return;
        const cls = [size && `s-${size}`, bold && "b"].filter(Boolean).join(" ");
        // Printers give ASCII half the width of a Chinese character; mimic that.
        const body = value
          .split(/([\x20-\x7e]+)/)
          .map((run, i) => (i % 2 ? `<span class="a">${escape(run)}</span>` : escape(run)))
          .join("");
        html += cls ? `<span class="${cls}">${body}</span>` : body;
      };
      for (const m of line.matchAll(re)) {
        text(line.slice(last, m.index));
        last = m.index! + m[0].length;
        const [, close, tag, single] = m;
        if (single === "CUT") html += `<div class="cut">✂ 切纸</div>`;
        else if (single) html += `<div class="voice">🔊 ${voices[single] || single}</div>`;
        else if (tag === "BOLD") bold = !close;
        else if (tag === "B" || tag === "CB") size = close ? "" : "double";
        else if (tag === "L") size = close ? "" : "tall";
        else if (tag === "W") size = close ? "" : "wide";
        else if (tag === "QR") {
          if (!close) inQr = true;
          else {
            inQr = false;
            const code = line.slice(line.lastIndexOf("<QR>", m.index) + 4, m.index);
            html += qr.get(code) ? `<img class="qr" src="${qr.get(code)}" alt="二维码">` : "";
          }
        }
      }
      text(line.slice(last));
      return `<div class="ln" style="text-align:${align}">${html || "&nbsp;"}</div>`;
    })
    .join("");
}
</script>

<style scoped>
.ticket-editor {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}
.editor-side {
  flex: 1;
  min-width: 0;
}
.global-row,
.style-row,
.block-head,
.vars {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.field-label {
  color: #606266;
  font-size: 13px;
}
.hint {
  color: #909399;
  font-size: 12px;
  margin: 6px 0 12px;
}
.block-row {
  border: 1px solid #eef0f3;
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: #fff;
}
.block-row.off {
  background: #f7f8fa;
  color: #a8abb2;
}
.block-row.hl {
  border-color: #a0cfff;
}
.block-row.active {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}
.block-row.dragging {
  opacity: 0.4;
}
.block-row.drop-before {
  box-shadow: 0 -3px 0 #409eff;
}
.block-row.drop-after {
  box-shadow: 0 3px 0 #409eff;
}
.drag-handle {
  cursor: grab;
  color: #a8abb2;
  user-select: none;
  letter-spacing: -2px;
  padding: 0 4px 0 0;
  font-weight: 700;
}
.toolbar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.hint.inline {
  margin: 0;
}
.menu-item {
  display: flex;
  flex-direction: column;
  line-height: 1.5;
  padding: 2px 0;
}
.menu-item span {
  color: #909399;
  font-size: 12px;
}
.block-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.grow {
  flex: 1;
}
.var-tag {
  cursor: pointer;
}
.add-btn {
  margin-top: 4px;
}
.preview-side {
  width: 360px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
}
.preview-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.paper {
  background: #fffdf7;
  border: 1px solid #e4e0d4;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  padding: 14px 12px;
  box-sizing: content-box;
  font-family: "Songti SC", "SimSun", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #222;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: hidden;
}
/* 58mm prints 16 Chinese characters (32 ASCII) per line, 80mm prints 24 (48). */
.paper.w58 {
  width: 16em;
}
.paper.w80 {
  width: 24em;
}
.paper :deep(.a) {
  font-family: Menlo, "Courier New", monospace;
  font-size: 0.83em;
}
.paper :deep(.ln) {
  min-height: 1.6em;
}
.part.link {
  cursor: pointer;
  border-radius: 3px;
}
.part.link:hover,
.part.hl {
  background: rgba(64, 158, 255, 0.08);
}
.part.active {
  background: rgba(64, 158, 255, 0.16);
  outline: 1px solid rgba(64, 158, 255, 0.5);
}
.paper :deep(.b) {
  font-weight: 700;
}
.paper :deep(.s-double) {
  font-size: 2em;
  line-height: 1.25;
}
.paper :deep(.s-tall) {
  display: inline-block;
  transform: scaleY(2);
  transform-origin: center top;
  margin-bottom: 1.4em;
}
.paper :deep(.s-wide) {
  display: inline-block;
  font-size: 2em;
  line-height: 1;
  transform: scaleY(0.5);
}
.paper :deep(.qr) {
  width: 96px;
  height: 96px;
  image-rendering: pixelated;
}
.paper :deep(.voice),
.paper :deep(.cut) {
  font-family: system-ui, sans-serif;
  font-size: 11px;
  color: #909399;
  border-top: 1px dashed #dcdfe6;
  margin-top: 6px;
  padding-top: 4px;
}
.preview-error {
  color: #f56c6c;
  font-size: 13px;
  margin-top: 8px;
}
@media (max-width: 1100px) {
  .ticket-editor {
    flex-direction: column;
  }
  .preview-side {
    width: 100%;
    position: static;
  }
}
</style>
