-- =========================================================
-- schema.sql
-- هيكل قاعدة بيانات نادي القيروان (MySQL)
-- =========================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS weekly_points_archive;
DROP TABLE IF EXISTS initiatives;
DROP TABLE IF EXISTS knowledge_tasks;
DROP TABLE IF EXISTS home_tasks;
DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS `groups`;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS supervisors;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- جدول المجموعات
-- ("groups" كلمة محجوزة في MySQL لذلك نحيطها بـ backticks دائماً)
-- category: تقسيم المجموعات الست لقسمين (الأولوية / الفئة العليا)
-- =========================================================
CREATE TABLE `groups` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category ENUM('الأولوية', 'الفئة العليا') NOT NULL DEFAULT 'الأولوية'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- جدول الطلاب
-- =========================================================
CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  barcode VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  name_normalized VARCHAR(150) NULL,
  group_id INT NOT NULL,
  knowledge_points INT NOT NULL DEFAULT 0,
  sports_points INT NOT NULL DEFAULT 0,
  cultural_points INT NOT NULL DEFAULT 0,
  attendance_points INT NOT NULL DEFAULT 0,
  home_tasks_points INT NOT NULL DEFAULT 0,
  guardian_phone VARCHAR(20),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_students_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  INDEX idx_students_group (group_id),
  INDEX idx_students_barcode (barcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- جدول متطلبات البرنامج المعرفي لكل طالب
-- =========================================================
CREATE TABLE knowledge_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  points INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_tasks_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_tasks_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- جدول التكاليف المنزلية — نفس القائمة لكل الطلاب بلا استثناء
-- (بخلاف متطلبات البرنامج المعرفي التي تختلف حسب المرحلة)
-- =========================================================
CREATE TABLE home_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(300) NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  points INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_home_tasks_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_home_tasks_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- جدول المبادرات والأعمال المميزة
-- =========================================================
CREATE TABLE initiatives (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_initiatives_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_initiatives_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- جدول أرشيف النقاط الأسبوعي — لقطة (snapshot) لنقاط كل طالب
-- في نهاية أسبوع معين قبل تصفيرها للأسبوع التالي، للاستذكار لاحقاً
-- (المبادرات لا تُصفَّر أبداً ولا تُؤرشف هنا لأنها تبقى كما هي)
-- =========================================================
CREATE TABLE weekly_points_archive (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  week_number INT NOT NULL,
  knowledge_points INT NOT NULL DEFAULT 0,
  sports_points INT NOT NULL DEFAULT 0,
  cultural_points INT NOT NULL DEFAULT 0,
  total_points INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_archive_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY uq_student_week (student_id, week_number),
  INDEX idx_archive_week (week_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- جدول جلسات النادي (9 جلسات ثابتة بتواريخ محددة مسبقاً)
-- 3 أسابيع × 3 أيام (الاثنين/الثلاثاء/الأربعاء) ابتداءً من 13 يوليو
-- week_number و day_name لتسهيل العرض المنظَّم في الواجهة
-- =========================================================
CREATE TABLE sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_date DATE NOT NULL UNIQUE,
  day_name VARCHAR(20) NOT NULL,
  week_number INT NOT NULL,
  INDEX idx_sessions_date (session_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13/14/15 يوليو (الأسبوع 1) ، 20/21/22 يوليو (الأسبوع 2) ، 26/27/28 يوليو (الأسبوع 3: أحد/اثنين/ثلاثاء)
INSERT INTO sessions (session_date, day_name, week_number) VALUES
  ('2026-07-13', 'الاثنين', 1),
  ('2026-07-14', 'الثلاثاء', 1),
  ('2026-07-15', 'الأربعاء', 1),
  ('2026-07-20', 'الاثنين', 2),
  ('2026-07-21', 'الثلاثاء', 2),
  ('2026-07-22', 'الأربعاء', 2),
  ('2026-07-26', 'الأحد', 3),
  ('2026-07-27', 'الاثنين', 3),
  ('2026-07-28', 'الثلاثاء', 3);

-- =========================================================
-- جدول الحضور — كل سجل مرتبط بجلسة محددة من جدول sessions
-- (وليس بتاريخ حر كما كان سابقاً) لضمان تسجيل الحضور فقط
-- ضمن أيام النادي التسعة الفعلية
-- =========================================================
CREATE TABLE attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  session_id INT NOT NULL,
  status ENUM('حاضر', 'متأخر', 'غايب') NOT NULL,
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_student_session (student_id, session_id),
  INDEX idx_attendance_student (student_id),
  INDEX idx_attendance_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- جدول سجل عمليات المشرفين (Activity Log)
-- =========================================================
CREATE TABLE activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- جدول إعدادات النادي العامة
-- =========================================================
CREATE TABLE settings (
  `key` VARCHAR(50) PRIMARY KEY,
  value VARCHAR(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO settings (`key`, value) VALUES
  ('total_weeks', '3'),
  ('days_per_week', '3'),
  ('season_name', 'الموسم 2026'),
  ('season_start_date', '2026-07-13'),
  ('scores_visible', 'true');

-- =========================================================
-- جدول المشرفين (دعم رمز دخول ثابت + إمكانية تعدد المشرفين لاحقاً)
-- =========================================================
CREATE TABLE supervisors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  access_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL DEFAULT 'المشرف'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO supervisors (access_code, name) VALUES ('991', 'مشرف عام');
