/* =========================================================
   tests/integration/routes/supervisor.attendance.test.js
   اختبار تكامل لـ POST /api/supervisor/attendance
   (تسجيل الحضور اليدوي من قبل المشرف لجلسة محددة من الجلسات التسع الثابتة)
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

describe("POST /api/supervisor/attendance - الحماية", () => {
  test("يُرفض بدون تسجيل دخول كمشرف (401)", async () => {
    const res = await request(app)
      .post("/api/supervisor/attendance")
      .send({ studentId: fixtures.studentA1Id, status: "حاضر", sessionId: fixtures.sessions[2].id });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/supervisor/attendance - التسجيل الناجح", () => {
  test("تسجيل حضور لجلسة محددة ينجح ويرجع السجل كاملاً (مع تفاصيل الجلسة) وبيانات الطالب", async () => {
    const agent = await loginAsSupervisor(app);
    const targetSession = fixtures.sessions[3];

    const res = await agent.post("/api/supervisor/attendance").send({
      studentId: fixtures.studentA2Id,
      status: "حاضر",
      sessionId: targetSession.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.record.status).toBe("حاضر");
    expect(res.body.record.session_id).toBe(targetSession.id);
    expect(res.body.record.day_name).toBe(targetSession.day_name);
    expect(res.body.record.week_number).toBe(targetSession.week_number);
    expect(res.body.student.id).toBe(fixtures.studentA2Id);
  });

  test("يدعم الحالات الثلاث: حاضر، متأخر، غايب لجلسات مختلفة", async () => {
    const agent = await loginAsSupervisor(app);
    const sessionsToUse = [fixtures.sessions[4], fixtures.sessions[5], fixtures.sessions[6]];
    const statuses = ["حاضر", "متأخر", "غايب"];

    for (let i = 0; i < statuses.length; i++) {
      const res = await agent.post("/api/supervisor/attendance").send({
        studentId: fixtures.studentA3Id,
        status: statuses[i],
        sessionId: sessionsToUse[i].id,
      });
      expect(res.body.record.status).toBe(statuses[i]);
    }
  });

  test("تسجيل الحضور مرتين لنفس الجلسة يحدِّث الحالة بدل تكرار السجل (ON DUPLICATE KEY)", async () => {
    const agent = await loginAsSupervisor(app);
    const targetSession = fixtures.sessions[7];

    await agent.post("/api/supervisor/attendance").send({
      studentId: fixtures.studentA2Id, status: "متأخر", sessionId: targetSession.id,
    });
    const secondRes = await agent.post("/api/supervisor/attendance").send({
      studentId: fixtures.studentA2Id, status: "حاضر", sessionId: targetSession.id,
    });

    expect(secondRes.body.record.status).toBe("حاضر");

    const [rows] = await pool.query(
      "SELECT COUNT(*) AS c FROM attendance WHERE student_id = ? AND session_id = ?",
      [fixtures.studentA2Id, targetSession.id]
    );
    expect(rows[0].c).toBe(1);
  });

  test("تحديث حالة جلسة مسجَّلة مسبقاً (الفكسشر يسجّل الجلسة الأولى لطالب A1 كـ 'حاضر') يستبدل القيمة", async () => {
    const agent = await loginAsSupervisor(app);

    const res = await agent.post("/api/supervisor/attendance").send({
      studentId: fixtures.studentA1Id, status: "غايب", sessionId: fixtures.firstSessionId,
    });

    expect(res.body.record.status).toBe("غايب");
  });
});

describe("POST /api/supervisor/attendance - تحقّق من المدخلات", () => {
  test("studentId مفقود يرجع 400", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/attendance").send({
      status: "حاضر", sessionId: fixtures.sessions[0].id,
    });
    expect(res.status).toBe(400);
  });

  test("status مفقودة يرجع 400", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/attendance").send({
      studentId: fixtures.studentA1Id, sessionId: fixtures.sessions[0].id,
    });
    expect(res.status).toBe(400);
  });

  test("sessionId مفقود يرجع 400 (لا يُسمح بتسجيل حضور بدون تحديد الجلسة)", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/attendance").send({
      studentId: fixtures.studentA1Id, status: "حاضر",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("status غير صالحة (لا تطابق ENUM) ترجع خطأ خادم (500) لا تُقبل بصمت", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/attendance").send({
      studentId: fixtures.studentA1Id, status: "قيمة-غريبة", sessionId: fixtures.sessions[0].id,
    });

    // لا يوجد تحقّق صريح من القيم المسموحة في الكنترولر، فيعتمد على رفض ENUM من
    // طبقة قاعدة البيانات نفسها. هذا الاختبار يوثّق ذلك السلوك الحالي
    expect(res.status).toBe(500);
  });

  test("sessionId غير موجود في جدول sessions يرجع خطأ خادم (500) بسبب قيد المفتاح الأجنبي", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/attendance").send({
      studentId: fixtures.studentA1Id, status: "حاضر", sessionId: 999999,
    });

    expect(res.status).toBe(500);
  });

  test("studentId غير موجود في قاعدة البيانات يرجع خطأ خادم (500) بسبب قيد المفتاح الأجنبي", async () => {
    // ملاحظة: عمود student_id في جدول attendance له FOREIGN KEY حقيقي،
    // لذلك إدراج سجل بمعرّف طالب غير موجود يفشل بقيد قاعدة البيانات (وليس بنجاح صامت)
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/attendance").send({
      studentId: 999999, status: "حاضر", sessionId: fixtures.sessions[0].id,
    });

    expect(res.status).toBe(500);
  });
});
