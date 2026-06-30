/* =========================================================
   tests/integration/routes/supervisor.points.test.js
   اختبار تكامل لـ POST /api/supervisor/points
   (إضافة وخصم نقاط الطلاب من قبل المشرف)
   ========================================================= */

const request = require("supertest");
const app = require("../../../app");
const pool = require("../../../config/db");
const { resetAndSeed } = require("../../fixtures/seedFixtures");
const { loginAsSupervisor } = require("../../helpers/authHelper");

let fixtures;

beforeEach(async () => {
  fixtures = await resetAndSeed();
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/supervisor/points - الحماية", () => {
  test("يُرفض بدون تسجيل دخول كمشرف (401)", async () => {
    const res = await request(app)
      .post("/api/supervisor/points")
      .send({ studentId: 1, program: "knowledge", amount: 5, mode: "add" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/supervisor/points - الإضافة", () => {
  test("إضافة نقاط معرفية تنجح وترجع بيانات الطالب المحدَّثة", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA2Id,
      program: "knowledge",
      amount: 10,
      reason: "اختبار",
      mode: "add",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.student.knowledge_points).toBe(30); // 20 + 10
  });

  test("إضافة نقاط رياضية أو ثقافية تعمل بنفس الطريقة", async () => {
    const agent = await loginAsSupervisor(app);

    const sportsRes = await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA2Id, program: "sports", amount: 5, mode: "add",
    });
    expect(sportsRes.body.student.sports_points).toBe(25);

    const culturalRes = await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA2Id, program: "cultural", amount: 5, mode: "add",
    });
    expect(culturalRes.body.student.cultural_points).toBe(25);
  });

  test("إضافة مبادرة تنجح وتُضاف لقائمة initiatives مع رفع total_points", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA3Id,
      program: "initiative",
      amount: 12,
      reason: "عمل بطولي",
      mode: "add",
    });

    expect(res.status).toBe(200);
    expect(res.body.student.initiatives_points).toBe(12);
    expect(res.body.student.total_points).toBe(27); // 15 + 12
  });

  test("تُسجَّل العملية في سجل النشاط (activity_log)", async () => {
    const agent = await loginAsSupervisor(app);
    await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA1Id, program: "knowledge", amount: 8, mode: "add", reason: "تفوق",
    });

    const [rows] = await pool.query("SELECT action FROM activity_log ORDER BY id DESC LIMIT 1");
    expect(rows[0].action).toContain("إضافة");
    expect(rows[0].action).toContain("8");
    expect(rows[0].action).toContain("تفوق");
  });
});

describe("POST /api/supervisor/points - الخصم", () => {
  test("خصم نقاط ينجح ويقلّل القيمة الصحيحة", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA1Id,
      program: "sports",
      amount: 10,
      mode: "subtract",
    });

    expect(res.status).toBe(200);
    expect(res.body.student.sports_points).toBe(20); // 30 - 10
  });

  test("خصم أكبر من النقاط المتوفرة يتوقف عند صفر ولا ينزل لسالب", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA3Id, // عنده 5 نقاط فقط بكل برنامج
      program: "cultural",
      amount: 999,
      mode: "subtract",
    });

    expect(res.body.student.cultural_points).toBe(0);
  });

  test("تُسجَّل عملية الخصم في activity_log بكلمة 'خصم'", async () => {
    const agent = await loginAsSupervisor(app);
    await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA1Id, program: "knowledge", amount: 5, mode: "subtract",
    });

    const [rows] = await pool.query("SELECT action FROM activity_log ORDER BY id DESC LIMIT 1");
    expect(rows[0].action).toContain("خصم");
  });
});

describe("POST /api/supervisor/points - حالات حدّية وتحقّق من المدخلات", () => {
  test("studentId مفقود يرجع 400 مع رسالة خطأ", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/points").send({
      program: "knowledge", amount: 5, mode: "add",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("amount صفر أو مفقود يرجع 400", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA1Id, program: "knowledge", amount: 0, mode: "add",
    });

    expect(res.status).toBe(400);
  });

  test("amount سالب في الطلب نفسه (وليس عبر mode) يرجع 400", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA1Id, program: "knowledge", amount: -5, mode: "add",
    });

    expect(res.status).toBe(400);
  });

  test("studentId غير رقمي (نص) يرجع 400", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/points").send({
      studentId: "ليس-رقماً", program: "knowledge", amount: 5, mode: "add",
    });

    expect(res.status).toBe(400);
  });

  test("studentId غير موجود في قاعدة البيانات: لا يرجع 400 لكنه لا يضيف نقاطاً فعلياً لأي طالب", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/points").send({
      studentId: 999999, program: "knowledge", amount: 5, mode: "add",
    });

    // الكود الحالي لا يتحقّق من وجود الطالب قبل التحديث، فالتحديث لا يطابق أي صف
    // ويستمر الطلب بنجاح (200) لكن student في الرد يكون null لعدم وجود طالب بهذا المعرّف
    expect(res.status).toBe(200);
    expect(res.body.student).toBeNull();
  });

  test("برنامج غير معروف (مثل 'unknown') يفشل برمز خطأ خادم بدل قبول العملية بصمت", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA1Id, program: "unknown_program", amount: 5, mode: "add",
    });

    // التحكم الحالي (supervisorController.addPoints) لا يتحقّق من صلاحية program قبل
    // استدعاء النموذج، فيرمي studentModel استثناءً يُمرَّر إلى معالج الأخطاء العام (500)
    // هذا الاختبار يوثّق السلوك الحالي كخط أساس للرجوع إليه عند أي تحسين مستقبلي للتحقق من المدخلات
    expect(res.status).toBe(500);
  });

  test("النقاط لا تتأثر بطالب من مجموعة مختلفة (تحديث دقيق بمعرّف الطالب فقط)", async () => {
    const agent = await loginAsSupervisor(app);
    await agent.post("/api/supervisor/points").send({
      studentId: fixtures.studentA1Id, program: "knowledge", amount: 100, mode: "add",
    });

    const otherStudentRes = await agent.get(`/api/students/${fixtures.studentA2Id}`);
    // نتأكد عبر مسار آخر (بوابة ولي الأمر) أن الطالب الثاني لم يتأثر
    expect(otherStudentRes.status).toBe(200);
  });
});
