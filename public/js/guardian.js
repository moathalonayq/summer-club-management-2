/* =========================================================
   public/js/guardian.js
   منطق بوابة ولي الأمر: بحث AJAX + عرض تفاصيل الطالب
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const input      = document.getElementById("guardianSearchInput");
  const resultsBox = document.getElementById("guardianSearchResults");
  const detailsBox = document.getElementById("guardianDetails");
  const clearBtn   = document.getElementById("guardianSearchClear");
  const hint       = document.getElementById("guardianSearchHint");

  let debounceTimer  = null;
  let activeIndex    = -1;   // للتنقل بالكيبورد

  /* -------------------------------------------------------
     من رابط طالب مباشر (من صفحة المجموعات)
  ------------------------------------------------------- */
  const presetStudentId = new URLSearchParams(window.location.search).get("student");
  if (presetStudentId) {
    if (hint) hint.style.display = "none";
    loadStudentProfile(presetStudentId);
  }

  /* -------------------------------------------------------
     أحداث حقل البحث
  ------------------------------------------------------- */
  input.addEventListener("input", () => {
    const query = input.value.trim();
    detailsBox.innerHTML = "";
    activeIndex = -1;

    clearBtn.style.display = query ? "flex" : "none";
    if (hint) hint.style.display = query ? "none" : "block";

    clearTimeout(debounceTimer);
    if (!query) {
      closeResults();
      return;
    }
    showLoading();
    debounceTimer = setTimeout(() => searchStudents(query), 280);
  });

  /* زر المسح × */
  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.style.display = "none";
    if (hint) hint.style.display = "block";
    detailsBox.innerHTML = "";
    closeResults();
    input.focus();
  });

  /* التنقل بالكيبورد ↑↓ Enter Escape */
  input.addEventListener("keydown", (e) => {
    const items = resultsBox.querySelectorAll(".search-item");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      highlightItem(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlightItem(items);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      items[activeIndex].click();
    } else if (e.key === "Escape") {
      closeResults();
      input.blur();
    }
  });

  /* إغلاق النتائج عند الضغط خارجها */
  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !resultsBox.contains(e.target)) {
      closeResults();
    }
  });

  /* -------------------------------------------------------
     دوال البحث
  ------------------------------------------------------- */
  function showLoading() {
    resultsBox.innerHTML = `<div class="search-loading"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>`;
    resultsBox.classList.add("visible");
  }

  function closeResults() {
    resultsBox.innerHTML = "";
    resultsBox.classList.remove("visible");
    activeIndex = -1;
  }

  function highlightItem(items) {
    items.forEach((el, i) => el.classList.toggle("search-item-active", i === activeIndex));
    if (items[activeIndex]) items[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function highlightText(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
  }

  async function searchStudents(query) {
    try {
      const res  = await fetch(`/api/students/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!data.success || !data.results.length) {
        resultsBox.innerHTML = `<div class="search-empty">😔 لا يوجد طالب بهذا الاسم</div>`;
        resultsBox.classList.add("visible");
        return;
      }

      resultsBox.innerHTML = data.results.map(s => `
        <div class="search-item" data-id="${s.id}" data-name="${s.name}">
          <div class="search-item-name">${highlightText(s.name, query)}</div>
          <span class="search-item-group">${s.group_name}</span>
        </div>
      `).join("");
      resultsBox.classList.add("visible");
      activeIndex = -1;

      resultsBox.querySelectorAll(".search-item").forEach(item => {
        item.addEventListener("click", () => {
          input.value = item.dataset.name;
          clearBtn.style.display = "flex";
          if (hint) hint.style.display = "none";
          loadStudentProfile(item.dataset.id);
          closeResults();
        });
      });
    } catch (err) {
      resultsBox.innerHTML = `<div class="search-empty">⚠️ حدث خطأ في البحث، حاول مرة أخرى</div>`;
      resultsBox.classList.add("visible");
    }
  }

  /* -------------------------------------------------------
     تحميل ملف الطالب
  ------------------------------------------------------- */
  async function loadStudentProfile(id) {
    detailsBox.innerHTML = `<div class="profile-loading">⏳ جارٍ التحميل...</div>`;
    try {
      const res  = await fetch(`/api/students/${id}`);
      const data = await res.json();

      if (!data.success) {
        detailsBox.innerHTML = `<p class="empty-note">تعذر عرض بيانات الطالب</p>`;
        return;
      }

      renderStudentProfile(
        data.student, data.groupRank, data.groupSize,
        data.overallRank, data.totalStudents, detailsBox
      );
      detailsBox.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      detailsBox.innerHTML = `<p class="empty-note">حدث خطأ أثناء جلب بيانات الطالب</p>`;
    }
  }

  /* -------------------------------------------------------
     أدوات مساعدة
  ------------------------------------------------------- */
  function formatDateArabic(dateStr) {
    return new Date(dateStr).toLocaleDateString("ar-SA", {
      year: "numeric", month: "long", day: "numeric"
    });
  }

  function getAttendanceRate(attendance) {
    const recorded = (attendance || []).filter(a => a.status !== null);
    if (!recorded.length) return { rate: 0, present: 0, late: 0, absent: 0 };
    const present = recorded.filter(a => a.status === "حاضر").length;
    const late    = recorded.filter(a => a.status === "متأخر").length;
    const absent  = recorded.filter(a => a.status === "غايب").length;
    const rate    = Math.round(((present + late * 0.5) / recorded.length) * 100);
    return { rate, present, late, absent };
  }

  function rankMedal(rank) {
    return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
  }

  function progressBar(value, max, colorClass) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return `
      <div class="progress-bar-wrap">
        <div class="progress-bar-track">
          <div class="progress-bar-fill ${colorClass}" style="width:${pct}%"></div>
        </div>
        <span class="progress-bar-label">${value}/${max}</span>
      </div>`;
  }

  /* -------------------------------------------------------
     رسم ملف الطالب
  ------------------------------------------------------- */
  function renderStudentProfile(student, groupRank, groupSize, overallRank, totalStudents, container) {
    const att        = getAttendanceRate(student.attendance);
    const doneTasks  = student.knowledge_tasks.filter(t => t.done).length;
    const totalTasks = student.knowledge_tasks.length;

    const recordedSessions = student.attendance.filter(a => a.status !== null);
    const lastStatus = recordedSessions.length
      ? recordedSessions[recordedSessions.length - 1].status
      : null;

    const statusClass = lastStatus === "حاضر" ? "badge-success"
      : lastStatus === "متأخر" ? "badge-warning"
      : lastStatus === "غايب" ? "badge-danger" : "badge-muted";

    const attBarColor = att.rate >= 75 ? "bar-success" : att.rate >= 50 ? "bar-warning" : "bar-danger";

    container.innerHTML = `
      <div class="profile-card">

        <!-- رأس البطاقة -->
        <div class="profile-header">
          <div class="profile-header-info">
            <h3>${student.name}</h3>
            <p class="profile-sub">${student.group_name}</p>
            <p class="profile-barcode-hint">رمز: ${student.barcode}</p>
          </div>
          <div class="profile-ranks">
            <div class="rank-badge-item">
              <span class="rank-medal">${rankMedal(groupRank)}</span>
              <span class="rank-desc">في مجموعته<br><small>من ${groupSize}</small></span>
            </div>
            <div class="rank-badge-item">
              <span class="rank-medal rank-medal-overall">${rankMedal(overallRank)}</span>
              <span class="rank-desc">عام<br><small>من ${totalStudents}</small></span>
            </div>
          </div>
        </div>

        <!-- بطاقات ملخص النقاط -->
        <div class="profile-summary-cards">
          <div class="summary-card summary-total">
            <div class="summary-value">${student.total_points}</div>
            <div class="summary-label">إجمالي النقاط</div>
          </div>
          <div class="summary-card summary-att">
            <div class="summary-value ${att.rate >= 75 ? 'text-success' : att.rate >= 50 ? 'text-warning' : 'text-danger'}">${att.rate}%</div>
            <div class="summary-label">نسبة الحضور</div>
          </div>
          <div class="summary-card summary-tasks">
            <div class="summary-value">${doneTasks}/${totalTasks}</div>
            <div class="summary-label">متطلبات منجزة</div>
          </div>
        </div>

        <!-- تفاصيل النقاط مع أشرطة تقدم -->
        <div class="section-block">
          <h4>📊 تفاصيل النقاط</h4>
          <div class="points-detail-list">
            <div class="points-detail-row">
              <span class="pd-label">📘 البرنامج المعرفي</span>
              <span class="pd-value knowledge-color">${student.knowledge_points}</span>
            </div>
            <div class="points-detail-row">
              <span class="pd-label">⚽ البرنامج الرياضي</span>
              <span class="pd-value sports-color">${student.sports_points}</span>
            </div>
            <div class="points-detail-row">
              <span class="pd-label">🎭 البرنامج الترفيهي</span>
              <span class="pd-value cultural-color">${student.cultural_points}</span>
            </div>
          </div>
        </div>

        <!-- الحضور مع شريط تقدم -->
        <div class="section-block">
          <h4>📅 سجل الحضور</h4>
          <div class="att-summary-row">
            <span class="badge ${statusClass}">${lastStatus || "لم تبدأ الجلسات"}</span>
            <span class="att-detail-text">${att.present} حاضر • ${att.late} متأخر • ${att.absent} غايب</span>
          </div>
          ${progressBar(att.present + att.late, recordedSessions.length, attBarColor)}
          <div class="attendance-weeks" style="margin-top:14px;">
            ${(() => {
              const today = new Date().toISOString().slice(0, 10);
              const pastOrToday = student.attendance.filter(a => a.session_date <= today);
              if (!pastOrToday.length) return `<p class="empty-note">لم تبدأ أي جلسة بعد</p>`;
              return [1, 2, 3].map(weekNum => {
                const weekSessions = pastOrToday.filter(a => a.week_number === weekNum);
                if (!weekSessions.length) return "";
                return `
                  <div class="attendance-week">
                    <div class="attendance-week-title">الأسبوع ${weekNum}</div>
                    <div class="attendance-grid">
                      ${weekSessions.map(a => {
                        const cls = a.status === "حاضر" ? "att-present"
                          : a.status === "متأخر" ? "att-late"
                          : a.status === "غايب" ? "att-absent" : "att-pending";
                        return `
                          <div class="att-chip ${cls}" title="${a.session_date}">
                            <span class="att-chip-day">${a.day_name}</span>
                            <span class="att-chip-status">${a.status || "—"}</span>
                          </div>`;
                      }).join("")}
                    </div>
                  </div>`;
              }).join("");
            })()}
          </div>
        </div>

        <!-- متطلبات البرنامج المعرفي مع شريط تقدم -->
        <div class="section-block">
          <h4>📘 متطلبات البرنامج المعرفي</h4>
          ${progressBar(doneTasks, totalTasks, "bar-knowledge")}
          <ul class="task-list" style="margin-top:10px;">
            ${student.knowledge_tasks.map(t => `
              <li class="${t.done ? "task-done" : "task-pending"}">
                <span class="task-icon">${t.done ? "✅" : "⭕"}</span>
                <span>${t.title}</span>
                ${t.done && t.points ? `<span class="task-pts-badge">+${t.points}</span>` : ""}
              </li>
            `).join("")}
          </ul>
        </div>

        <!-- المبادرات -->
        <div class="section-block">
          <h4>🌟 المبادرات والأعمال المميزة</h4>
          ${student.initiatives.length ? `
            <ul class="initiative-list">
              ${student.initiatives.map(i => `
                <li>
                  <span>${i.title}</span>
                  <span class="initiative-points">${i.points >= 0 ? "+" : ""}${i.points} نقطة</span>
                  <span class="initiative-date">${formatDateArabic(i.created_at)}</span>
                </li>
              `).join("")}
            </ul>
          ` : `<p class="empty-note">لا توجد مبادرات مسجلة حتى الآن</p>`}
        </div>

        <!-- زر الطباعة -->
        <div class="profile-actions">
          <button onclick="window.print()" class="btn btn-outline btn-small print-btn">🖨️ طباعة الملف</button>
        </div>
      </div>
    `;
  }
});
