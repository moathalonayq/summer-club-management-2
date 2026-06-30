/* =========================================================
   tests/integration/routes/app.smoke.test.js
   اختبارات دخان (smoke tests) على مستوى التطبيق ككل:
   تقديم الملفات الثابتة، تفسير JSON، تفسير form-urlencoded،
   ووجود كوكي الجلسة بعد تسجيل الدخول
   ========================================================= */

const request = require("supertest");
const app = require("../../../app");
const pool = require("../../../config/db");
const { resetAndSeed } = require("../../fixtures/seedFixtures");

beforeEach(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await pool.end();
});

describe("الملفات الثابتة (public/)", () => {
  test("يقدّم ملف CSS الرئيسي بنجاح", async () => {
    const res = await request(app).get("/css/style.css");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/css/);
  });

  test("يقدّم ملف guardian.js بنجاح", async () => {
    const res = await request(app).get("/js/guardian.js");
    expect(res.status).toBe(200);
  });

  test("يقدّم ملف supervisor.js بنجاح", async () => {
    const res = await request(app).get("/js/supervisor.js");
    expect(res.status).toBe(200);
  });

  test("يقدّم شعار النادي (logo.png) بنجاح", async () => {
    const res = await request(app).get("/img/logo.png");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image/);
  });

  test("يقدّم أيقونة الموقع (favicon.png) بنجاح", async () => {
    const res = await request(app).get("/img/favicon.png");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image/);
  });

  test("ملف ثابت غير موجود يرجع 404", async () => {
    const res = await request(app).get("/css/does-not-exist.css");
    expect(res.status).toBe(404);
  });
});

describe("تفسير محتوى الطلبات (body parsing)", () => {
  test("يقبل بيانات JSON في الطلبات (Content-Type: application/json)", async () => {
    const res = await request(app)
      .post("/supervisor/login")
      .set("Content-Type", "application/json")
      .send({ accessCode: "991" });

    // حتى مع JSON بدل form-urlencoded، يجب أن يُفسَّر body بشكل صحيح
    expect(res.status).toBe(302);
  });

  test("يقبل بيانات form-urlencoded التقليدية", async () => {
    const res = await request(app)
      .post("/supervisor/login")
      .type("form")
      .send("accessCode=991");

    expect(res.status).toBe(302);
  });
});

describe("كوكي الجلسة (session cookie)", () => {
  test("لا توجد كوكي جلسة لزائر لم يسجّل دخول (saveUninitialized: false)", async () => {
    const res = await request(app).get("/");
    // بما أن saveUninitialized=false، لا يجب إنشاء جلسة لمجرد تصفح صفحة عامة
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  test("تُنشأ كوكي جلسة فقط بعد تسجيل دخول ناجح كمشرف", async () => {
    const res = await request(app).post("/supervisor/login").send({ accessCode: "991" });
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.headers["set-cookie"][0]).toMatch(/connect\.sid/);
  });
});

describe("متغيرات res.locals المشتركة بين كل الصفحات", () => {
  test("currentYear يظهر في تذييل الصفحة", async () => {
    const res = await request(app).get("/");
    const currentYear = new Date().getFullYear().toString();
    expect(res.text).toContain(currentYear);
  });
});
