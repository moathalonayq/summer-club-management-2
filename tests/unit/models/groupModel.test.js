/* =========================================================
   tests/unit/models/groupModel.test.js
   اختبارات وحدة لكل دوال models/groupModel.js
   ========================================================= */

const pool = require("../../../config/db");
const groupModel = require("../../../models/groupModel");
const { resetAndSeed, clearAllData } = require("../../fixtures/seedFixtures");

let fixtures;

beforeEach(async () => {
  fixtures = await resetAndSeed();
});

afterAll(async () => {
  await pool.end();
});

describe("groupModel.getRankedGroups", () => {
  test("يرجع المجموعات مرتبة تنازلياً حسب إجمالي نقاطها", async () => {
    const groups = await groupModel.getRankedGroups();

    expect(groups).toHaveLength(2);
    // مجموعة أ: 110+60+15 = 185 | مجموعة ب: 120
    // مجموعة أ أعلى إجمالياً رغم أن طالب مجموعة ب الفردي له أعلى نقاط شخصية
    expect(groups[0].id).toBe(fixtures.groupAId);
    expect(groups[0].total_points).toBe(185);
    expect(groups[1].id).toBe(fixtures.groupBId);
    expect(groups[1].total_points).toBe(120);
  });

  test("يحسب member_count الصحيح لكل مجموعة", async () => {
    const groups = await groupModel.getRankedGroups();
    const groupA = groups.find((g) => g.id === fixtures.groupAId);
    const groupB = groups.find((g) => g.id === fixtures.groupBId);

    expect(groupA.member_count).toBe(3);
    expect(groupB.member_count).toBe(1);
  });

  test("يحسب avg_points بالتقريب الصحيح", async () => {
    const groups = await groupModel.getRankedGroups();
    const groupA = groups.find((g) => g.id === fixtures.groupAId);

    // 185 / 3 = 61.666... -> يقرَّب إلى 62
    expect(groupA.avg_points).toBe(62);
  });

  test("مجموعة بدون أي أعضاء (LEFT JOIN) تظهر بنقاط صفر وأعضاء صفر بدل أن تختفي", async () => {
    await pool.query(
      "INSERT INTO `groups` (name, category) VALUES (?, ?)",
      ["مجموعة فاضية", "الفئة الصغرى"]
    );

    const groups = await groupModel.getRankedGroups();
    const emptyGroup = groups.find((g) => g.name === "مجموعة فاضية");

    expect(emptyGroup).toBeDefined();
    expect(emptyGroup.member_count).toBe(0);
    expect(emptyGroup.total_points).toBe(0);
    expect(emptyGroup.avg_points).toBe(0); // لا قسمة على صفر
  });

  test("يرجع مصفوفة فاضية إذا لم توجد أي مجموعات على الإطلاق", async () => {
    await clearAllData();
    const groups = await groupModel.getRankedGroups();
    expect(groups).toEqual([]);
  });

  test("كل مجموعة تحتوي على category صحيحة (الفئة الصغرى أو العليا)", async () => {
    const groups = await groupModel.getRankedGroups();
    const groupA = groups.find((g) => g.id === fixtures.groupAId);
    const groupB = groups.find((g) => g.id === fixtures.groupBId);

    expect(groupA.category).toBe("الفئة الصغرى");
    expect(groupB.category).toBe("الفئة العليا");
  });
});

describe("groupModel.getRankedGroupsByCategory", () => {
  test("يقسّم المجموعات إلى كائن مفاتيحه أسماء الفئتين", async () => {
    const byCategory = await groupModel.getRankedGroupsByCategory();

    expect(Object.keys(byCategory).sort()).toEqual(["الفئة الصغرى", "الفئة العليا"].sort());
  });

  test("كل فئة تحتوي فقط على المجموعات التابعة لها", async () => {
    const byCategory = await groupModel.getRankedGroupsByCategory();

    expect(byCategory["الفئة الصغرى"]).toHaveLength(1);
    expect(byCategory["الفئة الصغرى"][0].id).toBe(fixtures.groupAId);

    expect(byCategory["الفئة العليا"]).toHaveLength(1);
    expect(byCategory["الفئة العليا"][0].id).toBe(fixtures.groupBId);
  });

  test("لا تظهر فئة في الكائن المُرجَع إذا لم يكن لها أي مجموعات", async () => {
    const { clearAllData } = require("../../fixtures/seedFixtures");
    await clearAllData();
    await pool.query(
      "INSERT INTO `groups` (name, category) VALUES (?, ?)",
      ["مجموعة وحيدة", "الفئة الصغرى"]
    );

    const byCategory = await groupModel.getRankedGroupsByCategory();
    expect(byCategory["الفئة الصغرى"]).toHaveLength(1);
    expect(byCategory["الفئة العليا"]).toBeUndefined();
  });
});

describe("groupModel.getGroupMembers", () => {
  test("يرجع أعضاء المجموعة مرتبين تنازلياً حسب النقاط", async () => {
    const members = await groupModel.getGroupMembers(fixtures.groupAId);

    expect(members).toHaveLength(3);
    expect(members[0].id).toBe(fixtures.studentA1Id);
    expect(members[1].id).toBe(fixtures.studentA2Id);
    expect(members[2].id).toBe(fixtures.studentA3Id);
  });

  test("يحسب total_points شاملاً نقاط المبادرات لكل عضو", async () => {
    const members = await groupModel.getGroupMembers(fixtures.groupAId);
    const a1 = members.find((m) => m.id === fixtures.studentA1Id);
    // ملاحظة: groupModel (خلافاً لـ studentModel) لا يحوّل total_points صراحة
    // إلى Number، و MySQL يرجعها كنص بسبب التعبير الحسابي المعقد (subquery)
    // داخل الاستعلام، لذلك نقارن بعد التحويل الرقمي بدل القيمة الخام مباشرة
    expect(Number(a1.total_points)).toBe(110);
  });

  test("مجموعة غير موجودة (معرّف خاطئ) ترجع مصفوفة فاضية بدل خطأ", async () => {
    const members = await groupModel.getGroupMembers(999999);
    expect(members).toEqual([]);
  });
});

describe("groupModel.getAllGroupsSimple", () => {
  test("يرجع كل المجموعات مرتبة أبجدياً بالاسم", async () => {
    const groups = await groupModel.getAllGroupsSimple();
    const names = groups.map((g) => g.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "ar"));
    expect(names).toEqual(sorted);
  });

  test("كل عنصر يحتوي فقط على id و name (بدون إحصائيات إضافية)", async () => {
    const groups = await groupModel.getAllGroupsSimple();
    groups.forEach((g) => {
      expect(Object.keys(g).sort()).toEqual(["id", "name"]);
    });
  });
});
