/* =========================================================
   tests/integration/routes/guardian.test.js
   اختبار تكامل لبوابة ولي الأمر:
   - GET /guardian (الصفحة)
   - GET /api/students/search (بحث)
   - GET /api/students/:id (تفاصيل + ترتيب داخل المجموعة)
   ========================================================= */

const request = require("supertest");
const app = require("../../../app");
const pool = require("../../../config/db");
const { resetAndSeed } = require("../../fixtures/seedFixtures");

let fixtures;

beforeEach(async () => {
  fixtures = await resetAndSeed();
});

afterAll(async () => {
  await pool.end();
});

describe("GET /guardian", () => {
  test("يرجع 200 وصفحة تحتوي مربع بحث", async () => {
    const res = await request(app).get("/guardian");
    expect(res.status).toBe(200);
    expect(res.text).toContain("بوابة ولي الأمر");
    expect(res.text).toContain('id="guardianSearchInput"');
  });

  test("لا تتطلب الصفحة تسجيل دخول كمشرف (وصول عام)", async () => {
    const res = await request(app).get("/guardian");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/students/search", () => {
  test("يرجع success:true ونتائج مطابقة عند إرسال استعلام صحيح", async () => {
    const res = await request(app).get("/api/students/search").query({ q: "الأول" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.some((s) => s.id === fixtures.studentA1Id)).toBe(true);
  });

  test("يرجع مصفوفة فاضية وليس خطأ عند عدم إرسال أي استعلام", async () => {
    const res = await request(app).get("/api/students/search");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, results: [] });
  });

  test("يرجع مصفوفة فاضية عند إرسال سلسلة فاضية فقط من المسافات", async () => {
    const res = await request(app).get("/api/students/search").query({ q: "   " });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  test("يرجع مصفوفة فاضية عند عدم وجود أي تطابق", async () => {
    const res = await request(app).get("/api/students/search").query({ q: "غير-موجود-أبداً-XYZ" });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  test("نوع المحتوى المرجَع هو JSON", async () => {
    const res = await request(app).get("/api/students/search").query({ q: "أ" });
    expect(res.headers["content-type"]).toMatch(/json/);
  });
});

describe("GET /api/students/:id", () => {
  test("يرجع تفاصيل الطالب الكاملة مع ترتيبه داخل مجموعته (groupRank, groupSize)", async () => {
    const res = await request(app).get(`/api/students/${fixtures.studentA1Id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.student.id).toBe(fixtures.studentA1Id);
    expect(res.body.groupRank).toBe(1);
    expect(res.body.groupSize).toBe(3);
  });

  test("الترتيب المرجَع هو ضمن المجموعة لا ضمن النادي كله", async () => {
    // studentA2 (60 نقطة) هو ثاني أعلى في مجموعته من 3
    const res = await request(app).get(`/api/students/${fixtures.studentA2Id}`);
    expect(res.body.groupRank).toBe(2);
    expect(res.body.groupSize).toBe(3);
  });

  test("يرجع 404 مع رسالة عربية لمعرّف طالب غير موجود", async () => {
    const res = await request(app).get("/api/students/999999");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "الطالب غير موجود" });
  });

  test("معرّف غير رقمي (مثل نص) يُعامَل كغير موجود بدل كسر الخادم", async () => {
    const res = await request(app).get("/api/students/abc");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test("يحتوي الرد على المهام المعرفية والمبادرات وسجل الحضور الكامل (9 جلسات ثابتة دائماً)", async () => {
    const res = await request(app).get(`/api/students/${fixtures.studentA1Id}`);

    expect(res.body.student.knowledge_tasks).toHaveLength(3);
    expect(res.body.student.initiatives).toHaveLength(1);
    // سجل الحضور يحتوي دائماً 9 صفوف (واحد لكل جلسة من جلسات الموسم الثابتة)
    // حتى لو لم تُسجَّل حالة فعلية لبعضها (تظهر بـ status: null)
    expect(res.body.student.attendance).toHaveLength(9);
  });

  test("الجلسات المسجَّلة فعلياً تظهر بحالتها الصحيحة، والباقي بـ status: null", async () => {
    const res = await request(app).get(`/api/students/${fixtures.studentA1Id}`);
    const recorded = res.body.student.attendance.filter((a) => a.status !== null);
    const notRecorded = res.body.student.attendance.filter((a) => a.status === null);

    expect(recorded).toHaveLength(2); // الفكسشر يسجّل جلستين فقط
    expect(notRecorded).toHaveLength(7);
  });

  test("لا يستخدم مسار /api/students/:id خطأً عند طلب /api/students/search", async () => {
    // هذا اختبار يضمن ترتيب تسجيل المسارات في guardianRoutes.js لا ينقلب بالخطأ مستقبلاً
    const res = await request(app).get("/api/students/search").query({ q: "test" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("results");
    expect(res.body).not.toHaveProperty("student");
  });
});
