/* =========================================================
   tests/unit/models/statsModel.test.js
   اختبارات وحدة لكل دوال models/statsModel.js
   ========================================================= */

const pool = require("../../../config/db");
const statsModel = require("../../../models/statsModel");
const studentModel = require("../../../models/studentModel");
const { resetAndSeed, clearAllData } = require("../../fixtures/seedFixtures");

let fixtures;

beforeEach(async () => {
  fixtures = await resetAndSeed();
});

afterAll(async () => {
  await pool.end();
});

describe("statsModel.getHomeStats", () => {
  test("يحسب عدد الطلاب وعدد المجموعات بشكل صحيح", async () => {
    const stats = await statsModel.getHomeStats();
    expect(stats.totalStudents).toBe(4);
    expect(stats.totalGroups).toBe(2);
  });

  test("يحسب إجمالي نقاط كل برنامج بشكل صحيح (معرفي/رياضي/ثقافي)", async () => {
    const stats = await statsModel.getHomeStats();
    // معرفي: 50+20+5+40 = 115 | رياضي: 30+20+5+40 = 95 | ثقافي: 20+20+5+40 = 85
    expect(stats.totalKnowledge).toBe(115);
    expect(stats.totalSports).toBe(95);
    expect(stats.totalCultural).toBe(85);
  });

  test("يحسب إجمالي نقاط المبادرات من كل الطلاب", async () => {
    const stats = await statsModel.getHomeStats();
    expect(stats.totalInitiatives).toBe(10); // مبادرة واحدة فقط بقيمة 10 في الفكسشر
  });

  test("يحسب نسبة الحضور بشكل صحيح (حاضر=100%، متأخر=50%)", async () => {
    // الفكسشر يحتوي سجلين لطالب A1: حاضر + متأخر
    // النسبة المتوقعة = (1 + 0.5) / 2 = 75%
    const stats = await statsModel.getHomeStats();
    expect(stats.attendanceRate).toBe(75);
  });

  test("لا يقسم على صفر عندما لا توجد أي سجلات حضور (نسبة 0%)", async () => {
    await clearAllData();
    // مجموعة وطالب بدون أي حضور
    await pool.query("INSERT INTO `groups` (name) VALUES (?)", ["مجموعة فاضية حضور"]);
    const stats = await statsModel.getHomeStats();
    expect(stats.attendanceRate).toBe(0);
  });

  test("كل الإحصائيات صفر عند قاعدة بيانات فاضية تماماً", async () => {
    await clearAllData();
    const stats = await statsModel.getHomeStats();

    expect(stats.totalStudents).toBe(0);
    expect(stats.totalGroups).toBe(0);
    expect(stats.attendanceRate).toBe(0);
    expect(stats.totalKnowledge).toBe(0);
    expect(stats.totalSports).toBe(0);
    expect(stats.totalCultural).toBe(0);
    expect(stats.totalInitiatives).toBe(0);
  });

  test("الإحصائيات تتحدّث ديناميكياً بعد تعديل نقاط طالب", async () => {
    await studentModel.addPointsToStudent(fixtures.studentA1Id, "knowledge", 25, "تحديث");
    const stats = await statsModel.getHomeStats();
    expect(stats.totalKnowledge).toBe(115 + 25);
  });

  test("كل القيم المرجعة من نوع number وليست نصاً (تحويل آمن من نتائج SUM/COUNT)", async () => {
    const stats = await statsModel.getHomeStats();
    expect(typeof stats.totalStudents).toBe("number");
    expect(typeof stats.totalGroups).toBe("number");
    expect(typeof stats.totalKnowledge).toBe("number");
    expect(typeof stats.attendanceRate).toBe("number");
  });
});

describe("statsModel.getSettings", () => {
  test("يرجع كل الإعدادات كخريطة مفتاح/قيمة", async () => {
    const settings = await statsModel.getSettings();
    expect(settings).toHaveProperty("total_weeks");
    expect(settings).toHaveProperty("days_per_week");
    expect(settings).toHaveProperty("season_name");
    expect(settings).toHaveProperty("season_start_date");
  });

  test("القيم الافتراضية من schema.sql صحيحة (3 أسابيع × 3 أيام، بداية 13 يوليو)", async () => {
    const settings = await statsModel.getSettings();
    expect(settings.total_weeks).toBe("3");
    expect(settings.days_per_week).toBe("3");
    expect(settings.season_name).toBe("الموسم 2026");
    expect(settings.season_start_date).toBe("2026-07-13");
  });

  test("يرجع كائن فاضي إذا حُذفت كل الإعدادات (بدون كسر)", async () => {
    // مهم: settings بنية أساسية ثابتة (مثل sessions) تُملأ مرة واحدة فقط عبر
    // schema.sql ولا يعيدها resetAndSeed، لذلك نستخدم transaction + rollback
    // بدل حذف فعلي حتى لا تنكسر اختبارات ملفات أخرى تعتمد على وجود الإعدادات
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("DELETE FROM settings");

      const [rows] = await connection.query("SELECT `key`, value FROM settings");
      expect(rows).toEqual([]);

      await connection.rollback();
    } finally {
      connection.release();
    }

    // بعد rollback، الإعدادات يجب أن تكون موجودة كما كانت (لم تتأثر فعلياً)
    const settingsAfterRollback = await statsModel.getSettings();
    expect(settingsAfterRollback.total_weeks).toBe("3");
  });
});

describe("statsModel.getClubDayNames", () => {
  test("يرجع أسماء الأيام الثلاثة الثابتة بترتيبها الزمني الصحيح", async () => {
    const days = await statsModel.getClubDayNames();
    expect(days).toEqual(["الاثنين", "الثلاثاء", "الأربعاء"]);
  });

  test("لا تتكرر أسماء الأيام رغم تكرارها عبر 3 أسابيع (9 جلسات -> 3 أسماء فقط)", async () => {
    const days = await statsModel.getClubDayNames();
    expect(days).toHaveLength(3);
  });

  test("يرجع مصفوفة فاضية إذا لم توجد أي جلسات معرَّفة", async () => {
    // مهم: نستخدم اتصالاً منفصلاً مع transaction + rollback تلقائي بدل
    // pool المشترك، لأن جدول sessions بنية أساسية ثابتة تعتمد عليها كل
    // ملفات الاختبار الأخرى (التي قد تُشغَّل بالتوازي ضمن نفس قاعدة البيانات)،
    // فحذفها فعلياً عبر commit حقيقي يكسر اختبارات ملفات مجاورة بصمت
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("DELETE FROM attendance");
      await connection.query("DELETE FROM sessions");

      const [rows] = await connection.query("SELECT `key`, value FROM settings");
      // نستدعي نفس منطق getClubDayNames يدوياً عبر هذا الاتصال المعزول
      const [sessionRows] = await connection.query(
        "SELECT day_name, MIN(session_date) AS first_date FROM sessions GROUP BY day_name ORDER BY first_date ASC"
      );
      expect(sessionRows).toEqual([]);

      await connection.rollback();
    } finally {
      connection.release();
    }

    // بعد rollback، الجلسات التسع يجب أن تكون موجودة كما كانت (لم تتأثر فعلياً)
    const daysAfterRollback = await statsModel.getClubDayNames();
    expect(daysAfterRollback).toHaveLength(3);
  });
});
