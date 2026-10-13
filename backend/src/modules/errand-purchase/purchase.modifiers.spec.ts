import {
  modifierKey,
  modifierLineKey,
  normalizeBindings,
  normalizeModifierGroup,
  resolveModifierGroups,
  selectModifiers,
  specText,
} from "./purchase.modifiers";

const option = (id: string, name: string, extra: any = {}) => ({
  id,
  name,
  priceCents: 0,
  maxQuantity: 1,
  isDefault: false,
  soldOut: false,
  enabled: true,
  sortOrder: 0,
  ...extra,
});
const library = (): any[] => [
  {
    id: "temp",
    sortOrder: 1,
    name: "温度",
    type: "attribute",
    required: true,
    maxSelect: 1,
    maxTotalQuantity: 1,
    enabled: true,
    options: [
      option("ice", "标准冰", { isDefault: true, sortOrder: 1 }),
      option("less", "少冰", { sortOrder: 2 }),
      option("hot", "热", { sortOrder: 3 }),
    ],
  },
  {
    id: "sugar",
    sortOrder: 2,
    name: "糖度",
    type: "attribute",
    required: true,
    maxSelect: 1,
    maxTotalQuantity: 1,
    enabled: true,
    options: [
      option("s7", "七分糖", { isDefault: true }),
      option("s3", "三分糖"),
    ],
  },
  {
    id: "milk",
    sortOrder: 3,
    name: "奶底",
    type: "attribute",
    required: false,
    maxSelect: 1,
    maxTotalQuantity: 1,
    enabled: true,
    options: [option("oat", "燕麦奶", { priceCents: 300 })],
  },
  {
    id: "top",
    sortOrder: 4,
    name: "加料",
    type: "extra",
    required: false,
    maxSelect: 1,
    maxTotalQuantity: 3,
    enabled: true,
    options: [
      option("pearl", "珍珠", { priceCents: 100, maxQuantity: 2, sortOrder: 1 }),
      option("pudding", "布丁", { priceCents: 200, sortOrder: 2 }),
      option("taro", "芋圆", { priceCents: 200, soldOut: true, sortOrder: 3 }),
      option("gone", "旧小料", { enabled: false }),
    ],
  },
  {
    id: "off",
    sortOrder: 5,
    name: "停用组",
    type: "attribute",
    required: true,
    maxSelect: 1,
    maxTotalQuantity: 1,
    enabled: false,
    options: [option("x", "不会出现")],
  },
];
const bindings = [
  { groupId: "temp" },
  { groupId: "sugar" },
  { groupId: "milk" },
  { groupId: "top" },
  { groupId: "off" },
];
const groups = () => resolveModifierGroups(bindings, library());

describe("代买规格库解析", () => {
  test("按规格库展示顺序排列启用的组和选项，停用组、停用和隐藏的选项不出现", () => {
    const shop = library();
    shop[0].sortOrder = 2;
    shop[3].sortOrder = 1;
    const resolved = resolveModifierGroups(
      [{ groupId: "temp", hiddenOptionIds: ["hot"] }, { groupId: "top" }, { groupId: "off" }, { groupId: "missing" }],
      shop,
    );
    expect(resolved.map((g) => g.id)).toEqual(["top", "temp"]);
    expect(resolved[0].options.map((o) => o.id)).toEqual(["pearl", "pudding", "taro"]);
    expect(resolved[1].options.map((o) => o.id)).toEqual(["ice", "less"]);
  });
  test("商品可以覆盖默认值，加料组没有默认值", () => {
    const resolved = resolveModifierGroups(
      [{ groupId: "temp", defaultOptionId: "hot" }, { groupId: "top" }],
      library(),
    );
    expect(resolved[0].options.filter((o) => o.isDefault).map((o) => o.id)).toEqual(["hot"]);
    expect(resolved[1].options.some((o) => o.isDefault)).toBe(false);
    expect(resolved[1].maxTotalQuantity).toBe(3);
  });
  test("没有挂载或格式错误的绑定得到空列表", () => {
    expect(resolveModifierGroups(null, library())).toEqual([]);
    expect(resolveModifierGroups("bad", library())).toEqual([]);
  });
});

describe("代买口味与加料计价", () => {
  test("按选项计价，键与提交顺序无关", () => {
    const a = selectModifiers(groups(), [
      { optionId: "pearl", quantity: 2 },
      { optionId: "less" },
      { optionId: "s3" },
      { optionId: "oat" },
    ]);
    const b = selectModifiers(groups(), [
      { optionId: "oat" },
      { optionId: "s3" },
      { optionId: "less" },
      { optionId: "pearl", quantity: 2 },
    ]);
    expect(a.modifierCents).toBe(500);
    expect(a.key).toBe(b.key);
    expect(a.modifiers.map((m) => m.optionId)).toEqual(["less", "s3", "oat", "pearl"]);
    expect(modifierLineKey("sku", a.modifiers)).toBe(`sku|${a.key}`);
  });
  test("必选组缺少选择时拒绝", () => {
    expect(() => selectModifiers(groups(), [{ optionId: "ice" }])).toThrow("请选择糖度");
  });
  test("旧版小程序不传口味时使用默认值；必选组没有默认值则提示更新", () => {
    const legacy = selectModifiers(groups(), undefined, { useDefaults: true });
    expect(legacy.modifiers.map((m) => m.optionId)).toEqual(["ice", "s7"]);
    const noDefault = library();
    noDefault[1].options.forEach((o: any) => (o.isDefault = false));
    expect(() =>
      selectModifiers(resolveModifierGroups(bindings, noDefault), undefined, { useDefaults: true }),
    ).toThrow("请更新小程序");
  });
  test("售罄加料拒绝下单，骑手在店采购时可以保留", () => {
    const pick = [{ optionId: "ice" }, { optionId: "s7" }, { optionId: "taro" }];
    expect(() => selectModifiers(groups(), pick)).toThrow("芋圆已售罄");
    expect(selectModifiers(groups(), pick, { allowSoldOut: true }).modifierCents).toBe(200);
  });
  test("加料每种和整杯份数都有上限", () => {
    const base = [{ optionId: "ice" }, { optionId: "s7" }];
    expect(() => selectModifiers(groups(), [...base, { optionId: "pearl", quantity: 3 }])).toThrow("每杯最多加2份");
    expect(() =>
      selectModifiers(groups(), [...base, { optionId: "pearl", quantity: 2 }, { optionId: "pudding" }, { optionId: "taro" }], {
        allowSoldOut: true,
      }),
    ).toThrow("加料每杯最多加3份");
  });
  test("单选组只能选一项，属性不能多份", () => {
    expect(() => selectModifiers(groups(), [{ optionId: "ice" }, { optionId: "less" }, { optionId: "s7" }])).toThrow(
      "温度最多选1项",
    );
    expect(() => selectModifiers(groups(), [{ optionId: "ice", quantity: 2 }, { optionId: "s7" }])).toThrow(
      "不能选多份",
    );
  });
  test.each([
    [[{ optionId: "nope" }], "已下架"],
    [[{ optionId: "ice" }, { optionId: "ice" }], "重复选择"],
    [[{ optionId: "pearl", quantity: 1.5 }], "份数无效"],
    [[{ optionId: "" }], "格式错误"],
    ["pearl", "格式错误"],
  ])("拒绝无效输入 %p", (input, message) => {
    expect(() => selectModifiers(groups(), input)).toThrow(message);
  });
  test("规格描述省略默认规格名，加料带份数", () => {
    const { modifiers } = selectModifiers(groups(), [
      { optionId: "less" },
      { optionId: "s3" },
      { optionId: "pearl", quantity: 2 },
    ]);
    expect(specText("大杯", modifiers)).toBe("大杯 / 少冰 / 三分糖 / 加珍珠×2");
    expect(specText("标准规格", modifiers)).toBe("少冰 / 三分糖 / 加珍珠×2");
    expect(specText("标准规格", [])).toBe("标准规格");
    expect(modifierKey([])).toBe("");
  });
});

describe("代买规格库后台校验", () => {
  test("商品只能挂载本店规格组；已删除或不属于该组的选项被忽略", () => {
    const shop = library();
    expect(normalizeBindings([{ groupId: "temp", hiddenOptionIds: ["hot"], defaultOptionId: "less" }], shop)).toEqual([
      { groupId: "temp", hiddenOptionIds: ["hot"], defaultOptionId: "less" },
    ]);
    expect(() => normalizeBindings([{ groupId: "other-shop" }], shop)).toThrow("不属于当前店铺");
    expect(() => normalizeBindings([{ groupId: "temp" }, { groupId: "temp" }], shop)).toThrow("重复挂载");
    expect(normalizeBindings([{ groupId: "temp", hiddenOptionIds: ["s7", "deleted"], defaultOptionId: "deleted" }], shop)).toEqual([
      { groupId: "temp", hiddenOptionIds: [], defaultOptionId: null },
    ]);
    expect(normalizeBindings([{ groupId: "top", defaultOptionId: "pearl" }], shop)[0].defaultOptionId).toBeNull();
    expect(normalizeBindings([{ groupId: "temp", hiddenOptionIds: ["hot"], defaultOptionId: "hot" }], shop)[0].defaultOptionId).toBeNull();
    expect(normalizeBindings(undefined, shop)).toEqual([]);
  });
  const body = (extra: any = {}) => ({
    name: "加料",
    type: "extra",
    required: false,
    maxTotalQuantity: 3,
    enabled: true,
    options: [
      { name: "珍珠", priceCents: 100, maxQuantity: 2, soldOut: false, enabled: true },
      { name: "布丁", priceCents: 200, soldOut: false, enabled: true },
    ],
    ...extra,
  });
  test("加料组保留每种份数，属性组固定 1 份且默认值不超过可选项数", () => {
    const extra = normalizeModifierGroup(body());
    expect(extra.group.maxTotalQuantity).toBe(3);
    expect(extra.options.map((o: any) => o.maxQuantity)).toEqual([2, 1]);
    const attribute = normalizeModifierGroup(
      body({
        name: "温度",
        type: "attribute",
        required: true,
        maxSelect: 1,
        options: [
          { name: "标准冰", priceCents: 0, isDefault: true, maxQuantity: 5, soldOut: false, enabled: true },
          { name: "热", priceCents: 0, isDefault: false, soldOut: false, enabled: true },
        ],
      }),
    );
    expect(attribute.options.map((o: any) => o.maxQuantity)).toEqual([1, 1]);
    expect(() =>
      normalizeModifierGroup(
        body({
          type: "attribute",
          maxSelect: 1,
          options: [
            { name: "a", priceCents: 0, isDefault: true, soldOut: false, enabled: true },
            { name: "b", priceCents: 0, isDefault: true, soldOut: false, enabled: true },
          ],
        }),
      ),
    ).toThrow("默认选项不能超过1个");
  });
  test.each([
    [{ type: "size" }, "类型"],
    [{ options: [] }, "选项"],
    [{ options: [{ name: "珍珠", priceCents: 100, soldOut: false, enabled: true }, { name: "珍珠", priceCents: 100, soldOut: false, enabled: true }] }, "不能重复"],
    [{ required: true, options: [{ name: "珍珠", priceCents: 100, soldOut: false, enabled: false }] }, "至少需要一个启用"],
    [{ options: [{ name: "珍珠", priceCents: -1, soldOut: false, enabled: true }] }, "加价"],
    [{ required: "yes" }, "必选"],
  ])("拒绝无效规格组 %p", (patch, message) => {
    expect(() => normalizeModifierGroup(body(patch))).toThrow(message);
  });
});
