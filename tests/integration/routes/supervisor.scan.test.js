/* =========================================================
   tests/integration/routes/supervisor.scan.test.js
   اختبار تكامل لـ POST /api/supervisor/scan
   (تسجيل حضور تلقائي عبر مسح باركود الطالب بالكاميرا)

   ملاحظة مهمة حول التوقيت: الخادم يحدد الجلسة المناسبة تلقائياً عبر
   sessionModel.getCurrentOrNextSession():
   - لو تاريخ اليوم يطابق إحدى الجلسات التسع بالضبط -> تلك الجلسة
   - غير ذلك -> أقرب جلسة قادمة لم تُعقد بعد
   - لو انتهى كل الموسم -> آخر جلسة
   بما أن الموسم الفعلي يبدأ 2026-07-13 وتواريخ تشغيل الاختبارات الآلية
   غالباً قبل ذلك، فالسلوك المتوقع هنا هو دائماً "أقرب جلسة قادمة" = أول
   جلسة في fixtures.sessions، وهذا ما تتحقق منه الاختبارات أدناه
   مباشرة عبر استدعاء نفس الدالة بدل افتراض تاريخ معيّن
   ========================================================= */

const request = require("supertest");
const app = require("../../../app");
const pool = require("../../../config/db");
const { resetAndSeed } = require("../../fixtures/seedFixtures");
const { loginAsSupervisor } = require("../../helpers/authHelper");
const sessionModel = require("../../../models/sessionModel");

let fixtures;
let expectedSession;

beforeEach(async () => {
  fixtures = await resetAndSeed();
  // نحدّد الجلسة المتوقَّعة فعلياً بنفس منطق الخادم، بدل افتراض تاريخ معيّن،
  // حتى يبقى الاختبار صحيحاً بغض النظر عن تاريخ تشغيله الفعلي
  expectedSession = await sessionModel.getCurrentOrNextSession();
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/supervisor/scan - الحماية", () => {
  test("يُرفض بدون تسجيل دخول كمشرف (401)", async () => {
    const res = await request(app).post("/api/supervisor/scan").send({ barcode: "TEST0001" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/supervisor/scan - المسح الناجح", () => {
  test("مسح باركود صحيح يسجّل الطالب 'حاضر' تلقائياً للجلسة المناسبة ويرجع alreadyMarked:false", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/scan").send({ barcode: "TEST0002" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.alreadyMarked).toBe(false);
    expect(res.body.record.status).toBe("حاضر");
    expect(res.body.student.id).toBe(fixtures.studentA2Id);
    expect(res.body.student.barcode).toBe("TEST0002");
  });

  test("يحدِّد نفس الجلسة التي تُرجعها sessionModel.getCurrentOrNextSession", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/scan").send({ barcode: "TEST0002" });

    expect(res.body.session.id).toBe(expectedSession.id);
    expect(res.body.session.day_name).toBe(expectedSession.day_name);
    expect(res.body.session.week_number).toBe(expectedSession.week_number);
  });

  test("الرد يحتوي فقط على الحقول الأساسية للطالب (id, name, group_name, barcode) دون كل التفاصيل", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/scan").send({ barcode: "TEST0002" });

    expect(Object.keys(res.body.student).sort()).toEqual(
      ["barcode", "group_name", "id", "name"].sort()
    );
  });

  test("مسح نفس الباركود مرتين يرجع alreadyMarked:true في المرة الثانية (نفس الجلسة المستهدَفة)", async () => {
    const agent = await loginAsSupervisor(app);

    const first = await agent.post("/api/supervisor/scan").send({ barcode: "TEST0003" });
    expect(first.body.alreadyMarked).toBe(false);

    const second = await agent.post("/api/supervisor/scan").send({ barcode: "TEST0003" });
    expect(second.body.alreadyMarked).toBe(true);
    expect(second.body.success).toBe(true);
  });

  test("يقبل باركود به مسافات زائدة (trim تلقائي)", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/scan").send({ barcode: "  TEST0001  " });

    expect(res.status).toBe(200);
    expect(res.body.student.id).toBe(fixtures.studentA1Id);
  });

  test("يسجّل العملية في activity_log باسم الطالب واسم الجلسة", async () => {
    const agent = await loginAsSupervisor(app);
    await agent.post("/api/supervisor/scan").send({ barcode: "TEST0004" });

    const [rows] = await pool.query("SELECT action FROM activity_log ORDER BY id DESC LIMIT 1");
    expect(rows[0].action).toContain("طالب المجموعة الثانية");
    expect(rows[0].action).toContain(expectedSession.day_name);
  });

  test("الحضور المُسجَّل عبر المسح يظهر فعلياً في سجل حضور الطالب بنفس الجلسة المحدَّدة", async () => {
    const agent = await loginAsSupervisor(app);
    await agent.post("/api/supervisor/scan").send({ barcode: "TEST0002" });

    const detailsRes = await agent.get(`/api/students/${fixtures.studentA2Id}`);
    const sessionRecord = detailsRes.body.student.attendance.find(
      (a) => a.session_id === expectedSession.id
    );

    expect(sessionRecord).toBeDefined();
    expect(sessionRecord.status).toBe("حاضر");
  });
});

describe("POST /api/supervisor/scan - حالات حدّية وتحقّق من المدخلات", () => {
  test("باركود مفقود يرجع 400", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/scan").send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("باركود غير موجود في قاعدة البيانات يرجع 404 برسالة عربية واضحة", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/scan").send({ barcode: "NOT-A-REAL-BARCODE" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "لا يوجد طالب بهذا الباركود" });
  });

  test("باركود فاضي (نص فاضي) يرجع 400 لا 404", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.post("/api/supervisor/scan").send({ barcode: "" });

    expect(res.status).toBe(400);
  });
});
