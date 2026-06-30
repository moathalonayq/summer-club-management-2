/* =========================================================
   tests/integration/routes/supervisor.auth.test.js
   اختبار تكامل لتسجيل دخول/خروج المشرف وحماية صفحاته
   ========================================================= */

const request = require("supertest");
const app = require("../../../app");
const pool = require("../../../config/db");
const { resetAndSeed } = require("../../fixtures/seedFixtures");
const { loginAsSupervisor } = require("../../helpers/authHelper");

beforeEach(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await pool.end();
});

describe("GET /supervisor/login", () => {
  test("يرجع 200 وصفحة فيها نموذج إدخال رمز الدخول", async () => {
    const res = await request(app).get("/supervisor/login");
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="accessCode"');
  });

  test("لا تعرض أي رسالة خطأ عند الزيارة الأولى", async () => {
    const res = await request(app).get("/supervisor/login");
    expect(res.text).not.toContain("رمز الدخول غير صحيح");
  });

  test("مشرف مسجَّل دخوله مسبقاً يُعاد توجيهه مباشرة للوحة التحكم", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.get("/supervisor/login");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/supervisor/panel");
  });
});

describe("POST /supervisor/login", () => {
  test("رمز الدخول الصحيح (991 الافتراضي) يسجّل الدخول ويوجّه للوحة التحكم", async () => {
    const res = await request(app)
      .post("/supervisor/login")
      .send({ accessCode: process.env.SUPERVISOR_ACCESS_CODE || "991" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/supervisor/panel");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  test("رمز دخول خاطئ يعيد عرض صفحة الدخول مع رسالة خطأ عربية واضحة", async () => {
    const res = await request(app).post("/supervisor/login").send({ accessCode: "000000" });

    expect(res.status).toBe(200);
    expect(res.text).toContain("رمز الدخول غير صحيح");
  });

  test("عدم إرسال accessCode أصلاً يُعامَل كرمز خاطئ ولا يكسر الخادم", async () => {
    const res = await request(app).post("/supervisor/login").send({});
    expect(res.status).toBe(200);
    expect(res.text).toContain("رمز الدخول غير صحيح");
  });

  test("رمز الدخول حسّاس لحالة الأحرف/الصيغة (المقارنة === الصارمة)", async () => {
    const res = await request(app).post("/supervisor/login").send({ accessCode: " 991 " });
    expect(res.text).toContain("رمز الدخول غير صحيح");
  });
});

describe("POST /supervisor/logout", () => {
  test("يسجّل الخروج ويوجّه لصفحة الدخول", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/supervisor/logout");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/supervisor/login");
  });

  test("بعد تسجيل الخروج، الوصول للوحة التحكم يُرفض ويُعاد التوجيه لتسجيل الدخول", async () => {
    const agent = await loginAsSupervisor(app);
    await agent.post("/supervisor/logout");

    const res = await agent.get("/supervisor/panel");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/supervisor/login");
  });
});

describe("GET /supervisor/panel (محمية)", () => {
  test("زائر غير مسجَّل دخوله يُعاد توجيهه لصفحة تسجيل الدخول", async () => {
    const res = await request(app).get("/supervisor/panel");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/supervisor/login");
  });

  test("مشرف مسجَّل دخوله يصل للوحة التحكم بنجاح ويرى الطلاب وباركود كل واحد", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.get("/supervisor/panel");

    expect(res.status).toBe(200);
    expect(res.text).toContain("لوحة المشرفين");
    expect(res.text).toContain("btn-show-barcode");
    expect(res.text).toContain("TEST0001"); // باركود الطالب الأول
  });

  test("اللوحة تعرض كل الطلاب الأربعة في الفكسشر", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.get("/supervisor/panel");

    expect(res.text).toContain("الطالب الأول");
    expect(res.text).toContain("الطالب الثاني");
    expect(res.text).toContain("الطالب الثالث");
    expect(res.text).toContain("طالب المجموعة الثانية");
  });
});
