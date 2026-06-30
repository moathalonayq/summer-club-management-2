/* =========================================================
   tests/integration/routes/home.test.js
   اختبار تكامل لمسار الصفحة الرئيسية GET /
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

describe("GET /", () => {
  test("يرجع 200 ونوع المحتوى HTML", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
  });

  test("تحتوي الصفحة على نبذة تعريفية بالنادي", async () => {
    const res = await request(app).get("/");
    expect(res.text).toContain("عن نادي القيروان");
  });

  test("تعرض إحصائيات صحيحة: عدد الطلاب وعدد المجموعات", async () => {
    const res = await request(app).get("/");
    expect(res.text).toContain(">4<"); // عدد الطلاب = 4
    expect(res.text).toContain(">2<"); // عدد المجموعات = 2
  });

  test("تعرض إعدادات النادي (3 أسابيع، 3 أيام، اسم الموسم)", async () => {
    const res = await request(app).get("/");
    expect(res.text).toContain("أسابيع الموسم");
    expect(res.text).toContain("أيام النادي أسبوعياً");
    expect(res.text).toContain("الموسم 2026");
  });

  test("تعرض أيام النادي الثلاثة الثابتة (الاثنين، الثلاثاء، الأربعاء) كل واحد بشارة مستقلة", async () => {
    const res = await request(app).get("/");
    expect(res.text).toContain('<span class="club-day-chip">الاثنين</span>');
    expect(res.text).toContain('<span class="club-day-chip">الثلاثاء</span>');
    expect(res.text).toContain('<span class="club-day-chip">الأربعاء</span>');
  });

  test("تعرض ملاحظة بداية الموسم من 13 يوليو لمدة 3 أسابيع", async () => {
    const res = await request(app).get("/");
    expect(res.text).toContain("13 يوليو");
    expect(res.text).toContain("3 أسابيع");
  });

  test("تعرض أعلى 10 طلاب مرتبين، والطالب الأعلى نقاطاً يظهر أولاً", async () => {
    const res = await request(app).get("/");
    // طالب المجموعة الثانية له أعلى نقاط (120) ويجب أن يظهر اسمه في الصفحة
    expect(res.text).toContain("طالب المجموعة الثانية");
    expect(res.text).toContain("rank-gold-row");
  });

  test("لا تحتوي الصفحة على رابط/قسم 'ملف الطالب' (محذوف بحسب المتطلبات)", async () => {
    const res = await request(app).get("/");
    expect(res.text).not.toContain("ملف الطالب");
  });

  test("تعمل الصفحة دون أخطاء حتى مع قاعدة بيانات فاضية تماماً", async () => {
    await clearAllData();
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain(">0<"); // عدد الطلاب = صفر
  });

  test("القائمة العلوية تحتوي روابط الرئيسية وولي الأمر والمجموعات والمشرفين", async () => {
    const res = await request(app).get("/");
    expect(res.text).toContain('href="/"');
    expect(res.text).toContain('href="/guardian"');
    expect(res.text).toContain('href="/groups"');
    expect(res.text).toContain('href="/supervisor/login"');
  });
});

describe("GET /random-page-that-does-not-exist", () => {
  test("يرجع 404 وصفحة عربية واضحة لغير الموجود", async () => {
    const res = await request(app).get("/random-page-that-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.text).toContain("الصفحة غير موجودة");
  });
});
