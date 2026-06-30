/* =========================================================
   tests/helpers/setupTestDb.js
   سكربت مستقل لإعادة إنشاء قاعدة بيانات الاختبار يدوياً
   مفيد للتشغيل المباشر أثناء تطوير الاختبارات نفسها، بدون Jest
   التشغيل:  npm run test:db:setup
   ========================================================= */

require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env.test") });

const path = require("path");
const fs = require("fs");
const mysql = require("mysql2/promise");

async function main() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes("_test")) {
    throw new Error(
      "❌ رفض التشغيل: تأكد أن DATABASE_URL في .env.test يشير لقاعدة بيانات تجريبية (تحتوي '_test')."
    );
  }

  const connection = await mysql.createConnection(
    process.env.DATABASE_URL + "?multipleStatements=true"
  );

  try {
    const schemaPath = path.join(__dirname, "..", "..", "config", "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    await connection.query(schemaSql);
    console.log("✅ تم إعادة إنشاء جداول قاعدة بيانات الاختبار بنجاح");
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("❌ فشل إعداد قاعدة بيانات الاختبار:", err);
  process.exitCode = 1;
});
