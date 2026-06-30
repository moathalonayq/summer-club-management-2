/* =========================================================
   tests/unit/models/sessionModel.test.js
   اختبارات وحدة لكل دوال models/sessionModel.js
   إدارة جلسات النادي الثابتة (9 جلسات: 3 أسابيع × 3 أيام)

   ملاحظة مهمة: جدول sessions بنية أساسية ثابتة (لا تُحذف بين الاختبارات
   عبر resetAndSeed، راجع تعليق التوضيح في seedFixtures.js)، لذلك هذه
   الاختبارات تتحقق من قيمها الصحيحة دون أي حذف أو تعديل قد يؤثر على
   ملفات اختبار أخرى تعمل على نفس قاعدة البيانات
   ========================================================= */

const pool = require("../../../config/db");
const sessionModel = require("../../../models/sessionModel");
const { resetAndSeed } = require("../../fixtures/seedFixtures");

beforeEach(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await pool.end();
});

describe("sessionModel.getAllSessions", () => {
  test("يرجع 9 جلسات بالضبط (3 أسابيع × 3 أيام)", async () => {
    const sessions = await sessionModel.getAllSessions();
    expect(sessions).toHaveLength(9);
  });

  test("الجلسات مرتبة زمنياً تصاعدياً حسب التاريخ", async () => {
    const sessions = await sessionModel.getAllSessions();
    const dates = sessions.map((s) => s.session_date);
    const sortedDates = [...dates].sort();
    expect(dates).toEqual(sortedDates);
  });

  test("أول جلسة بالضبط هي 2026-07-13 (الاثنين) من الأسبوع 1", async () => {
    const sessions = await sessionModel.getAllSessions();
    expect(sessions[0].session_date).toBe("2026-07-13");
    expect(sessions[0].day_name).toBe("الاثنين");
    expect(sessions[0].week_number).toBe(1);
  });

  test("آخر جلسة بالضبط هي 2026-07-29 (الأربعاء) من الأسبوع 3", async () => {
    const sessions = await sessionModel.getAllSessions();
    const last = sessions[sessions.length - 1];
    expect(last.session_date).toBe("2026-07-29");
    expect(last.day_name).toBe("الأربعاء");
    expect(last.week_number).toBe(3);
  });

  test("كل أسبوع يحتوي بالضبط 3 جلسات (الاثنين، الثلاثاء، الأربعاء)", async () => {
    const sessions = await sessionModel.getAllSessions();
    [1, 2, 3].forEach((weekNum) => {
      const weekSessions = sessions.filter((s) => s.week_number === weekNum);
      expect(weekSessions).toHaveLength(3);
      expect(weekSessions.map((s) => s.day_name)).toEqual(["الاثنين", "الثلاثاء", "الأربعاء"]);
    });
  });
});

describe("sessionModel.getSessionById", () => {
  test("يرجع تفاصيل جلسة موجودة بكل حقولها", async () => {
    const allSessions = await sessionModel.getAllSessions();
    const firstId = allSessions[0].id;

    const session = await sessionModel.getSessionById(firstId);
    expect(session).not.toBeNull();
    expect(session.session_date).toBe("2026-07-13");
    expect(session.day_name).toBe("الاثنين");
    expect(session.week_number).toBe(1);
  });

  test("يرجع null لمعرّف جلسة غير موجود", async () => {
    const session = await sessionModel.getSessionById(999999);
    expect(session).toBeNull();
  });
});

describe("sessionModel.getCurrentOrNextSession", () => {
  test("يرجع جلسة واحدة دائماً (لا تكون null) طالما توجد جلسات معرَّفة", async () => {
    const session = await sessionModel.getCurrentOrNextSession();
    expect(session).not.toBeNull();
    expect(session).toHaveProperty("id");
    expect(session).toHaveProperty("session_date");
    expect(session).toHaveProperty("day_name");
    expect(session).toHaveProperty("week_number");
  });

  test("الجلسة المُرجَعة هي إحدى الجلسات التسع الفعلية دائماً", async () => {
    const allSessions = await sessionModel.getAllSessions();
    const allIds = allSessions.map((s) => s.id);

    const result = await sessionModel.getCurrentOrNextSession();
    expect(allIds).toContain(result.id);
  });

  test("الجلسة المُرجَعة تطابق منطق: أقرب جلسة قادمة لم تُعقد بعد، أو جلسة اليوم إن طابقته، أو آخر جلسة إن انتهى الموسم", async () => {
    // نتحقق من المنطق يدوياً بنفس خطوات الدالة، بدل افتراض تاريخ تشغيل ثابت،
    // لضمان صحة الاختبار في أي وقت يُشغَّل فيه (وليس فقط أثناء كتابته)
    const today = new Date().toISOString().slice(0, 10);
    const allSessions = await sessionModel.getAllSessions();

    const exactMatch = allSessions.find((s) => s.session_date === today);
    const upcoming = allSessions
      .filter((s) => s.session_date > today)
      .sort((a, b) => (a.session_date > b.session_date ? 1 : -1))[0];
    const lastSession = allSessions[allSessions.length - 1];

    const expected = exactMatch || upcoming || lastSession;
    const result = await sessionModel.getCurrentOrNextSession();

    expect(result.id).toBe(expected.id);
  });
});
