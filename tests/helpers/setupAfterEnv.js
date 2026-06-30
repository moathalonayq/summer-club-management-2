/* =========================================================
   tests/helpers/setupAfterEnv.js
   يُشغَّل قبل كل ملف اختبار (وليس قبل كل اختبار فردي فقط)
   Jest يُشغّل globalSetup في عملية منفصلة عن ملفات الاختبار نفسها،
   لذلك نحتاج لتحميل .env.test هنا أيضاً ليتوفر process.env
   داخل كل ملف اختبار وداخل config/db.js عندما يُستدعى
   ========================================================= */

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.join(__dirname, "..", "..", ".env.test"),
  override: true,
});

// نطيل المهلة الافتراضية لكل اختبار لأن بعض العمليات تمر عبر قاعدة بيانات حقيقية
jest.setTimeout(15000);
