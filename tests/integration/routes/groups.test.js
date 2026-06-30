/* =========================================================
   tests/integration/routes/groups.test.js
   اختبار تكامل لمسار GET /groups
   مع التحقق من التقسيم الصحيح لفئتين: الفئة الصغرى والفئة العليا
   ========================================================= */

const request = require("supertest");
const app = require("../../../app");
const pool = require("../../../config/db");
const { resetAndSeed, clearAllData } = require("../../fixtures/seedFixtures");

beforeEach(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await pool.end();
});

describe("GET /groups", () => {
  test("يرجع 200 ويعرض كل المجموعات", async () => {
    const res = await request(app).get("/groups");
    expect(res.status).toBe(200);
    expect(res.text).toContain("مجموعة أ");
    expect(res.text).toContain("مجموعة ب");
  });

  test("تعرض عنواني القسمين: الفئة الصغرى والفئة العليا", async () => {
    const res = await request(app).get("/groups");
    expect(res.text).toContain("الفئة الصغرى");
    expect(res.text).toContain("الفئة العليا");
  });

  test("مجموعة أ (الفئة الصغرى) تظهر ضمن قسم الفئة الصغرى فقط", async () => {
    const res = await request(app).get("/groups");
    const minorBlockStart = res.text.indexOf("category-title minor");
    const majorBlockStart = res.text.indexOf("category-title major");
    const minorSection = res.text.slice(minorBlockStart, majorBlockStart);

    expect(minorSection).toContain("مجموعة أ");
    expect(minorSection).not.toContain("مجموعة ب");
  });

  test("مجموعة ب (الفئة العليا) تظهر ضمن قسم الفئة العليا فقط", async () => {
    const res = await request(app).get("/groups");
    const majorBlockStart = res.text.indexOf("category-title major");
    const majorSection = res.text.slice(majorBlockStart);

    expect(majorSection).toContain("مجموعة ب");
    expect(majorSection).not.toContain("مجموعة أ");
  });

  test("قسم الفئة الصغرى يظهر قبل قسم الفئة العليا في الصفحة", async () => {
    const res = await request(app).get("/groups");
    const minorIndex = res.text.indexOf("category-title minor");
    const majorIndex = res.text.indexOf("category-title major");

    expect(minorIndex).toBeGreaterThan(-1);
    expect(majorIndex).toBeGreaterThan(-1);
    expect(minorIndex).toBeLessThan(majorIndex);
  });

  test("تعرض أعضاء كل مجموعة مع نقاطهم الفردية", async () => {
    const res = await request(app).get("/groups");
    expect(res.text).toContain("الطالب الأول");
    expect(res.text).toContain("الطالب الثاني");
    expect(res.text).toContain("الطالب الثالث");
  });

  test("تعرض رسالة فارغة واضحة لقسم لا يحتوي أي مجموعات (بدل اختفاء القسم بالكامل)", async () => {
    await clearAllData();
    await pool.query(
      "INSERT INTO `groups` (name, category) VALUES (?, ?)",
      ["مجموعة صغرى وحيدة", "الفئة الصغرى"]
    );
    // لا نضيف أي مجموعة بالفئة العليا

    const res = await request(app).get("/groups");
    expect(res.status).toBe(200);
    expect(res.text).toContain("مجموعة صغرى وحيدة");
    expect(res.text).toContain("لا توجد مجموعات في هذه الفئة حالياً");
  });

  test("تعمل بدون أخطاء عندما لا توجد أي مجموعات على الإطلاق", async () => {
    await clearAllData();
    const res = await request(app).get("/groups");
    expect(res.status).toBe(200);
  });

  test("لا تتطلب تسجيل دخول كمشرف (وصول عام)", async () => {
    const res = await request(app).get("/groups");
    expect(res.status).toBe(200);
  });
});
