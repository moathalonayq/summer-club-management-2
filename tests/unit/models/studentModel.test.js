/* =========================================================
   tests/unit/models/studentModel.test.js
   اختبارات وحدة لكل دوال models/studentModel.js
   تعمل على قاعدة بيانات اختبار حقيقية (وليست محاكاة/mock) لأن الصحة
   الفعلية لجمل SQL (JOIN، GREATEST، ON DUPLICATE KEY، الأقواس الخلفية
   لكلمة groups المحجوزة) هي بالضبط ما نريد ضبطه عبر هذا النوع من الاختبار

   ملاحظة: نظام الحضور يعتمد الآن على جلسات ثابتة (9 جلسات معرَّفة
   مسبقاً في sessions عبر schema.sql) بدل تواريخ حرة، فكل اختبارات
   الحضور هنا تستخدم sessionId حقيقياً من fixtures.sessions
   ========================================================= */

const pool = require("../../../config/db");
const studentModel = require("../../../models/studentModel");
const { resetAndSeed } = require("../../fixtures/seedFixtures");

let fixtures;

beforeEach(async () => {
  fixtures = await resetAndSeed();
});

afterAll(async () => {
  await pool.end();
});

describe("studentModel.getAllStudents", () => {
  test("يرجع كل الطلاب مرتبين تنازلياً حسب إجمالي النقاط", async () => {
    const students = await studentModel.getAllStudents();

    expect(students).toHaveLength(4);
    // studentB1 (120) > studentA1 (110) > studentA2 (60) > studentA3 (15)
    expect(students[0].id).toBe(fixtures.studentB1Id);
    expect(students[1].id).toBe(fixtures.studentA1Id);
    expect(students[2].id).toBe(fixtures.studentA2Id);
    expect(students[3].id).toBe(fixtures.studentA3Id);
  });

  test("يحسب total_points بشمول نقاط المبادرات", async () => {
    const students = await studentModel.getAllStudents();
    const a1 = students.find((s) => s.id === fixtures.studentA1Id);

    expect(Number(a1.total_points)).toBe(fixtures.totals.studentA1);
    expect(Number(a1.initiatives_points)).toBe(10);
  });

  test("يرجع مصفوفة فاضية إذا لم يوجد أي طلاب", async () => {
    const { clearAllData } = require("../../fixtures/seedFixtures");
    await clearAllData();

    const students = await studentModel.getAllStudents();
    expect(students).toEqual([]);
  });

  test("كل طالب يحتوي على اسم مجموعته الصحيح", async () => {
    const students = await studentModel.getAllStudents();
    const b1 = students.find((s) => s.id === fixtures.studentB1Id);

    expect(b1.group_name).toBe("مجموعة ب");
  });
});

describe("studentModel.getStudentById", () => {
  test("يرجع null إذا لم يوجد الطالب", async () => {
    const result = await studentModel.getStudentById(999999);
    expect(result).toBeNull();
  });

  test("يرجع كل تفاصيل الطالب (مهام، مبادرات، حضور)", async () => {
    const student = await studentModel.getStudentById(fixtures.studentA1Id);

    expect(student).not.toBeNull();
    expect(student.name).toBe("الطالب الأول");
    expect(student.knowledge_tasks).toHaveLength(3);
    expect(student.initiatives).toHaveLength(1);
  });

  test("يرجع دائماً 9 صفوف حضور (واحد لكل جلسة ثابتة) بغض النظر عن عدد السجلات الفعلية", async () => {
    // الفكسشر يسجّل حالة فعلية لجلستين فقط من أصل 9، لكن LEFT JOIN من sessions
    // يضمن ظهور كل الجلسات التسع دائماً (الباقي بـ status=null)
    const student = await studentModel.getStudentById(fixtures.studentA1Id);
    expect(student.attendance).toHaveLength(9);
  });

  test("الجلسات غير المسجَّلة تظهر بـ status=null بدل اختفائها من القائمة", async () => {
    const student = await studentModel.getStudentById(fixtures.studentA1Id);
    const withStatus = student.attendance.filter((a) => a.status !== null);
    const withoutStatus = student.attendance.filter((a) => a.status === null);

    expect(withStatus).toHaveLength(2); // الجلستان المسجَّلتان بالفكسشر
    expect(withoutStatus).toHaveLength(7); // باقي الجلسات التسع لم تُسجَّل بعد
  });

  test("سجل الحضور المُرجَع يحتوي تفاصيل الجلسة كاملة (التاريخ، اليوم، رقم الأسبوع)", async () => {
    const student = await studentModel.getStudentById(fixtures.studentA1Id);
    const firstSession = student.attendance.find(
      (a) => a.session_id === fixtures.firstSessionId
    );

    expect(firstSession).toBeDefined();
    expect(firstSession.status).toBe("حاضر");
    expect(firstSession.day_name).toBe("الاثنين");
    expect(firstSession.week_number).toBe(1);
    expect(firstSession.session_date).toBe("2026-07-13");
  });

  test("سجل الحضور مرتب زمنياً حسب تاريخ الجلسة تصاعدياً", async () => {
    const student = await studentModel.getStudentById(fixtures.studentA1Id);
    const dates = student.attendance.map((a) => a.session_date);
    const sortedDates = [...dates].sort();
    expect(dates).toEqual(sortedDates);
  });

  test("يحوّل قيمة done في المهام المعرفية إلى boolean صريح (لا 0/1)", async () => {
    const student = await studentModel.getStudentById(fixtures.studentA1Id);

    const doneFlags = student.knowledge_tasks.map((t) => t.done);
    expect(doneFlags.filter((d) => d === true)).toHaveLength(2);
    expect(doneFlags.filter((d) => d === false)).toHaveLength(1);
    doneFlags.forEach((d) => expect(typeof d).toBe("boolean"));
  });

  test("يحسب total_points الصحيح شاملاً المبادرات", async () => {
    const student = await studentModel.getStudentById(fixtures.studentA1Id);
    expect(student.total_points).toBe(fixtures.totals.studentA1);
    expect(student.initiatives_points).toBe(10);
  });

  test("طالب بدون مبادرات أو مهام يرجع مصفوفات فاضية لا أخطاء (لكن 9 جلسات دائماً)", async () => {
    const student = await studentModel.getStudentById(fixtures.studentA2Id);
    expect(student.initiatives).toEqual([]);
    expect(student.knowledge_tasks).toEqual([]);
    expect(student.attendance).toHaveLength(9);
    expect(student.attendance.every((a) => a.status === null)).toBe(true);
    expect(student.total_points).toBe(fixtures.totals.studentA2);
  });

  test("تمرير NaN كمعرّف يرفض الطلب (mysql2 يرسلها كعمود غير صالح في WHERE وليس كقيمة)", async () => {
    // هذا يوثّق سلوكاً فعلياً غير بديهي: mysql2 لا يحوّل NaN إلى NULL أو رقم،
    // بل يحاول إدراجها حرفياً في جملة SQL فيفشل الاستعلام بخطأ من قاعدة البيانات.
    // المتحكمات (controllers) التي تستدعي هذه الدالة يجب أن تتحقق من صحة الرقم
    // قبل تمريره (وهذا ما تفعله guardianController.getStudentDetails فعلياً عبر
    // معالجة الخطأ والرد بـ 404 — راجع اختبارات guardian.test.js)
    await expect(studentModel.getStudentById(NaN)).rejects.toThrow();
  });
});

describe("studentModel.getStudentByBarcode", () => {
  test("يجد الطالب بالباركود الصحيح ويرجع تفاصيله الكاملة", async () => {
    const student = await studentModel.getStudentByBarcode("TEST0001");
    expect(student).not.toBeNull();
    expect(student.id).toBe(fixtures.studentA1Id);
  });

  test("يرجع null لباركود غير موجود", async () => {
    const student = await studentModel.getStudentByBarcode("DOES-NOT-EXIST");
    expect(student).toBeNull();
  });

  test("يتجاهل المسافات الزائدة حول الباركود (trim)", async () => {
    const student = await studentModel.getStudentByBarcode("   TEST0001   ");
    expect(student).not.toBeNull();
    expect(student.id).toBe(fixtures.studentA1Id);
  });
});

describe("studentModel.searchStudentsByName", () => {
  test("يجد الطلاب بمطابقة جزئية للاسم", async () => {
    const results = await studentModel.searchStudentsByName("الأول");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((s) => s.id === fixtures.studentA1Id)).toBe(true);
  });

  test("البحث بكلمة مشتركة بين عدة طلاب يرجع كل المطابقين", async () => {
    const results = await studentModel.searchStudentsByName("الطالب");
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  test("يرجع مصفوفة فاضية إذا لم يوجد تطابق", async () => {
    const results = await studentModel.searchStudentsByName("اسم-غير-موجود-أبداً");
    expect(results).toEqual([]);
  });

  test("نتائج البحث مرتبة أبجدياً بالاسم وليس بالنقاط", async () => {
    const results = await studentModel.searchStudentsByName("الطالب");
    const names = results.map((s) => s.name);
    const sortedNames = [...names].sort((a, b) => a.localeCompare(b, "ar"));
    expect(names).toEqual(sortedNames);
  });

  test("لا ينكسر مع أحرف خاصة بصيغة LIKE مثل % و _", async () => {
    await expect(studentModel.searchStudentsByName("%_test_%")).resolves.toEqual([]);
  });

  test("نتائج البحث محدودة بحد أقصى 15 (LIMIT)", async () => {
    const pool2 = require("../../../config/db");
    for (let i = 0; i < 20; i++) {
      await pool2.query(
        `INSERT INTO students (barcode, name, group_id, knowledge_points, sports_points, cultural_points)
         VALUES (?, ?, ?, 0, 0, 0)`,
        [`BULK${i}`, `طالب مكرر ${i}`, fixtures.groupAId]
      );
    }
    const results = await studentModel.searchStudentsByName("طالب مكرر");
    expect(results.length).toBeLessThanOrEqual(15);
  });
});

describe("studentModel.getTopStudents", () => {
  test("يرجع الطلاب الأعلى نقاطاً مرتبين تنازلياً بالعدد المطلوب", async () => {
    const top2 = await studentModel.getTopStudents(2);
    expect(top2).toHaveLength(2);
    expect(top2[0].id).toBe(fixtures.studentB1Id);
    expect(top2[1].id).toBe(fixtures.studentA1Id);
  });

  test("الافتراضي هو أعلى 10 طلاب عند عدم تمرير حد", async () => {
    const top = await studentModel.getTopStudents();
    expect(top.length).toBeLessThanOrEqual(10);
    expect(top).toHaveLength(4);
  });

  test("طلب أكثر من العدد الموجود فعلياً لا يكسر الاستعلام", async () => {
    const top = await studentModel.getTopStudents(100);
    expect(top).toHaveLength(4);
  });
});

describe("studentModel.getStudentRankInGroup", () => {
  test("يحسب ترتيب الطالب الأول في مجموعته بشكل صحيح (الأعلى نقاطاً = 1)", async () => {
    const { rank, groupSize } = await studentModel.getStudentRankInGroup(
      fixtures.studentA1Id,
      fixtures.groupAId
    );
    expect(rank).toBe(1);
    expect(groupSize).toBe(3);
  });

  test("يحسب ترتيب الطالب الأخير في مجموعته بشكل صحيح", async () => {
    const { rank, groupSize } = await studentModel.getStudentRankInGroup(
      fixtures.studentA3Id,
      fixtures.groupAId
    );
    expect(rank).toBe(3);
    expect(groupSize).toBe(3);
  });

  test("مجموعة بعضو واحد فقط: الترتيب 1 من 1", async () => {
    const { rank, groupSize } = await studentModel.getStudentRankInGroup(
      fixtures.studentB1Id,
      fixtures.groupBId
    );
    expect(rank).toBe(1);
    expect(groupSize).toBe(1);
  });

  test("الترتيب محسوب على مستوى المجموعة فقط وليس النادي كله", async () => {
    const groupAResult = await studentModel.getStudentRankInGroup(
      fixtures.studentA2Id,
      fixtures.groupAId
    );
    expect(groupAResult.rank).toBe(2);
  });

  test("معرّف طالب غير موجود ضمن المجموعة يرجع rank = 0", async () => {
    const { rank } = await studentModel.getStudentRankInGroup(999999, fixtures.groupAId);
    expect(rank).toBe(0);
  });
});

describe("studentModel.addPointsToStudent", () => {
  test("إضافة نقاط معرفية تزيد knowledge_points بالقيمة الصحيحة", async () => {
    await studentModel.addPointsToStudent(fixtures.studentA2Id, "knowledge", 15, "اختبار");
    const student = await studentModel.getStudentById(fixtures.studentA2Id);
    expect(student.knowledge_points).toBe(35);
  });

  test("خصم نقاط رياضية يقلّل sports_points بالقيمة الصحيحة", async () => {
    await studentModel.addPointsToStudent(fixtures.studentA2Id, "sports", -5, "خصم اختبار");
    const student = await studentModel.getStudentById(fixtures.studentA2Id);
    expect(student.sports_points).toBe(15);
  });

  test("لا تنزل النقاط تحت الصفر مهما كان الخصم كبيراً (GREATEST)", async () => {
    await studentModel.addPointsToStudent(fixtures.studentA3Id, "cultural", -9999, "خصم ضخم");
    const student = await studentModel.getStudentById(fixtures.studentA3Id);
    expect(student.cultural_points).toBe(0);
  });

  test("إضافة مبادرة تُسجَّل كسطر مستقل في جدول initiatives ولا تعدّل أعمدة الطالب", async () => {
    await studentModel.addPointsToStudent(fixtures.studentA3Id, "initiative", 7, "مبادرة جديدة");
    const student = await studentModel.getStudentById(fixtures.studentA3Id);

    expect(student.initiatives).toHaveLength(1);
    expect(student.initiatives[0].points).toBe(7);
    expect(student.initiatives[0].title).toBe("مبادرة جديدة");
    expect(student.knowledge_points).toBe(5);
  });

  test("خصم نقاط عبر مبادرة (قيمة سالبة) يُسجَّل كرقم سالب في initiatives", async () => {
    await studentModel.addPointsToStudent(fixtures.studentA1Id, "initiative", -3, "خصم مبادرة");
    const student = await studentModel.getStudentById(fixtures.studentA1Id);
    expect(student.initiatives_points).toBe(7); // (+10) + (-3)
  });

  test("مبادرة بدون سبب (reason) تستخدم نصاً افتراضياً ولا تفشل", async () => {
    await studentModel.addPointsToStudent(fixtures.studentA2Id, "initiative", 4, undefined);
    const student = await studentModel.getStudentById(fixtures.studentA2Id);
    expect(student.initiatives[0].title).toBe("مبادرة / تعديل نقاط");
  });

  test("برنامج غير معروف يرفض العملية برسالة خطأ واضحة", async () => {
    await expect(
      studentModel.addPointsToStudent(fixtures.studentA1Id, "invalid_program", 5, "")
    ).rejects.toThrow("برنامج غير معروف");
  });
});

describe("studentModel.markAttendance (نظام الجلسات الثابتة)", () => {
  test("يضيف سجل حضور جديد لجلسة لم تُسجَّل من قبل لهذا الطالب", async () => {
    const targetSession = fixtures.sessions[3]; // جلسة لم تُسجَّل بالفكسشر لطالب A2
    const record = await studentModel.markAttendance(
      fixtures.studentA2Id,
      "حاضر",
      targetSession.id
    );

    expect(record.status).toBe("حاضر");
    expect(record.session_id).toBe(targetSession.id);
    expect(record.day_name).toBe(targetSession.day_name);
    expect(record.week_number).toBe(targetSession.week_number);
  });

  test("تسجيل نفس الطالب لنفس الجلسة مرتين يُحدِّث الحالة لا يكرر السجل (ON DUPLICATE KEY)", async () => {
    const targetSession = fixtures.sessions[4];

    await studentModel.markAttendance(fixtures.studentA2Id, "متأخر", targetSession.id);
    const updated = await studentModel.markAttendance(fixtures.studentA2Id, "حاضر", targetSession.id);

    expect(updated.status).toBe("حاضر");

    const student = await studentModel.getStudentById(fixtures.studentA2Id);
    const sameSession = student.attendance.filter((a) => a.session_id === targetSession.id);
    expect(sameSession).toHaveLength(1);
    expect(sameSession[0].status).toBe("حاضر");
  });

  test("تحديث حالة جلسة مسجَّلة مسبقاً بالفكسشر (الجلسة الأولى لطالب A1) يستبدل القيمة القديمة", async () => {
    // الفكسشر يسجّل حالة "حاضر" للجلسة الأولى لطالب A1، نحدّثها إلى "غايب"
    await studentModel.markAttendance(fixtures.studentA1Id, "غايب", fixtures.firstSessionId);

    const student = await studentModel.getStudentById(fixtures.studentA1Id);
    const firstSessionRecord = student.attendance.find(
      (a) => a.session_id === fixtures.firstSessionId
    );
    expect(firstSessionRecord.status).toBe("غايب");
  });

  test("يدعم الحالات الثلاث المسموحة: حاضر، متأخر، غايب", async () => {
    const sessionsToUse = [fixtures.sessions[5], fixtures.sessions[6], fixtures.sessions[7]];
    const statuses = ["حاضر", "متأخر", "غايب"];

    for (let i = 0; i < statuses.length; i++) {
      const record = await studentModel.markAttendance(
        fixtures.studentA3Id,
        statuses[i],
        sessionsToUse[i].id
      );
      expect(record.status).toBe(statuses[i]);
    }
  });

  test("يرفض حالة حضور غير صالحة لا تطابق ENUM المسموح", async () => {
    await expect(
      studentModel.markAttendance(fixtures.studentA1Id, "حالة-غريبة", fixtures.sessions[8].id)
    ).rejects.toThrow();
  });

  test("يرفض session_id غير موجود في جدول sessions (قيد المفتاح الأجنبي)", async () => {
    await expect(
      studentModel.markAttendance(fixtures.studentA1Id, "حاضر", 999999)
    ).rejects.toThrow();
  });
});

describe("studentModel.getAttendanceForSession", () => {
  test("يرجع null إذا لم يُسجَّل حضور لهذه الجلسة بعد", async () => {
    const result = await studentModel.getAttendanceForSession(
      fixtures.studentA3Id,
      fixtures.sessions[2].id
    );
    expect(result).toBeNull();
  });

  test("يرجع الحالة المسجَّلة للجلسة المحدَّدة إن وُجدت", async () => {
    const result = await studentModel.getAttendanceForSession(
      fixtures.studentA1Id,
      fixtures.firstSessionId
    );
    expect(result).not.toBeNull();
    expect(result.status).toBe("حاضر");
  });

  test("لا يتأثر بسجلات حضور من جلسات أخرى لنفس الطالب (الفلترة بمعرّف الجلسة فقط)", async () => {
    // الطالب A1 له حضور بالجلستين الأولى والثانية فقط، نتأكد أن الجلسة الثالثة فاضية
    const result = await studentModel.getAttendanceForSession(
      fixtures.studentA1Id,
      fixtures.sessions[2].id
    );
    expect(result).toBeNull();
  });
});
