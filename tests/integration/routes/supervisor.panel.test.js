/* =========================================================
   tests/integration/routes/supervisor.panel.test.js
   اختبار تكامل لمحتوى GET /supervisor/panel
   يركّز على العناصر الجديدة: البحث السريع، قائمة الجلسات التسع،
   وربط كل صف بالجدول باسم الطالب (data-student-name) الذي يعتمد
   عليه منطق الفلترة الفورية في public/js/supervisor.js
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

describe("GET /supervisor/panel - البحث السريع", () => {
  test("تحتوي الصفحة على حقل البحث السريع بمعرّفه الصحيح", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.get("/supervisor/panel");

    expect(res.text).toContain('id="supervisorQuickSearch"');
    expect(res.text).toContain('id="supervisorSearchCount"');
  });

  test("كل صف بجدول الطلاب يحمل data-student-name مطابقاً لاسم الطالب الفعلي", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.get("/supervisor/panel");

    expect(res.text).toContain('data-student-name="الطالب الأول"');
    expect(res.text).toContain('data-student-name="الطالب الثاني"');
    expect(res.text).toContain('data-student-name="الطالب الثالث"');
    expect(res.text).toContain('data-student-name="طالب المجموعة الثانية"');
  });

  test("كل صف بالجدول يحمل أيضاً data-student-id لربطه بتحديثات النقاط الفورية", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.get("/supervisor/panel");

    expect(res.text).toContain(`data-student-id="${fixtures.studentA1Id}"`);
  });
});

describe("GET /supervisor/panel - قائمة الجلسات التسع", () => {
  test("نموذج الحضور اليدوي يحتوي قائمة منسدلة بكل الجلسات التسع", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.get("/supervisor/panel");

    expect(res.text).toContain('id="attendanceSessionSelect"');
    fixtures.sessions.forEach((session) => {
      expect(res.text).toContain(`value="${session.id}"`);
    });
  });

  test("كل خيار جلسة يعرض رقم الأسبوع واسم اليوم والتاريخ", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.get("/supervisor/panel");

    const firstSession = fixtures.sessions[0];
    expect(res.text).toContain(`الأسبوع ${firstSession.week_number}`);
    expect(res.text).toContain(firstSession.day_name);
    expect(res.text).toContain(firstSession.session_date);
  });
});

describe("GET /supervisor/panel - جدول الطلاب والباركود", () => {
  test("يعرض كل الطلاب الأربعة في الفكسشر مع زر باركود لكل واحد", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.get("/supervisor/panel");

    expect(res.text).toContain('data-barcode="TEST0001"');
    expect(res.text).toContain('data-barcode="TEST0002"');
    expect(res.text).toContain('data-barcode="TEST0003"');
    expect(res.text).toContain('data-barcode="TEST0004"');
  });

  test("نموذج النقاط يحتوي خيارات البرامج الأربعة (معرفي/رياضي/ثقافي/مبادرة)", async () => {
    const agent = await loginAsSupervisor(app);
    const res = await agent.get("/supervisor/panel");

    expect(res.text).toContain('value="knowledge"');
    expect(res.text).toContain('value="sports"');
    expect(res.text).toContain('value="cultural"');
    expect(res.text).toContain('value="initiative"');
  });
});
