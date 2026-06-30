/* =========================================================
   config/testSessionDate.js
   أداة اختبار: تنقل تاريخ جلسة محددة إلى اليوم مؤقتاً حتى يلتقطها
   الماسح الضوئي (getCurrentOrNextSession) عند تجربة الباركود الفعلي،
   كما تنقل كل الجلسات السابقة لها (حسب ترتيبها الزمني الأصلي) إلى
   تواريخ ماضية متتالية قبل اليوم، حتى يعمل منطق "الجلسات الماضية"
   (فلترة الحضور + التغييب التلقائي) بشكل متّسق أثناء الاختبار.
   ثم تعيد كل التواريخ المعدَّلة لأصلها بعد الانتهاء.

   الاستخدام:
     node config/testSessionDate.js set <week_number> <day_name>
     node config/testSessionDate.js restore

   مثال: اختبار جلسة الأربعاء من الأسبوع 2
     node config/testSessionDate.js set 2 الأربعاء
     ... امسح الباركود الآن من لوحة المشرف ...
     node config/testSessionDate.js restore
   ========================================================= */
const pool = require("./db");

/* ينشئ عمود النسخ الاحتياطي للتاريخ الأصلي إن لم يكن موجوداً بعد (أول استخدام للسكربت) */
async function ensureBackupColumn() {
  const [cols] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'original_date_backup'`
  );
  if (cols[0].cnt === 0) {
    await pool.query("ALTER TABLE sessions ADD COLUMN original_date_backup DATE NULL");
  }
}

async function main() {
  const [action, weekArg, dayArg] = process.argv.slice(2);

  if (action === "set") {
    const weekNumber = Number(weekArg);
    const dayName = dayArg;
    if (!weekNumber || !dayName) {
      console.error("الاستخدام: node config/testSessionDate.js set <week_number> <day_name>");
      process.exit(1);
    }

    await ensureBackupColumn();

    // كل الجلسات بترتيبها الزمني الأصلي (نعتمد original_date_backup إن كانت
    // الجلسة معدَّلة بالفعل من تشغيل سابق، حتى لا يختل الترتيب بين التشغيلات)
    const [allSessions] = await pool.query(
      "SELECT id, week_number, day_name, COALESCE(original_date_backup, session_date) AS true_date FROM sessions ORDER BY true_date ASC"
    );

    const targetIndex = allSessions.findIndex(
      (s) => s.week_number === weekNumber && s.day_name === dayName
    );
    if (targetIndex === -1) {
      console.error("لم يتم العثور على جلسة بهذا الأسبوع/اليوم");
      process.exit(1);
    }

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    for (let i = 0; i <= targetIndex; i++) {
      const session = allSessions[i];
      const offsetDays = targetIndex - i; // الجلسة الهدف = اليوم، وما قبلها أيام ماضية متتالية
      const d = new Date(today);
      d.setDate(d.getDate() - offsetDays);
      const dateStr = d.toISOString().slice(0, 10);

      await pool.query(
        "UPDATE sessions SET original_date_backup = COALESCE(original_date_backup, session_date), session_date = ? WHERE id = ?",
        [dateStr, session.id]
      );
    }

    console.log(`تم نقل جلسة (الأسبوع ${weekNumber} - ${dayName}) إلى اليوم (${todayStr})،`);
    console.log(`ونقل ${targetIndex} جلسة/جلسات سابقة لها إلى تواريخ ماضية متتالية قبلها.`);
    console.log("اذهب الآن لمسح الباركود من لوحة المشرف، ثم نفّذ: node config/testSessionDate.js restore");
  } else if (action === "restore") {
    const [rows] = await pool.query(
      "SELECT id, original_date_backup FROM sessions WHERE original_date_backup IS NOT NULL"
    );
    if (!rows.length) {
      console.log("لا توجد جلسات معدَّلة لاستعادتها.");
    } else {
      for (const row of rows) {
        await pool.query(
          "UPDATE sessions SET session_date = ?, original_date_backup = NULL WHERE id = ?",
          [row.original_date_backup, row.id]
        );
      }
      console.log(`تمت استعادة تاريخ ${rows.length} جلسة/جلسات إلى أصلها.`);
    }
  } else {
    console.log("الاستخدام:");
    console.log("  node config/testSessionDate.js set <week_number> <day_name>");
    console.log("  node config/testSessionDate.js restore");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
