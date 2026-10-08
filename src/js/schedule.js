/**
 * Schedule & Timetable Manager
 * Handles student timetable, study week calculation (чётная/нечётная), bells, and active class detection.
 * Supports multi-group catalogue and live API from my-api.nntu.ru
 * Created by kosterik for NNSTU (НГТУ им. Р.Е. Алексеева)
 */

class ScheduleManager {
  constructor(mapViewerInstance) {
    this.mapViewer = mapViewerInstance;
    this.groupsCatalog = null;
    this.scheduleData = null;
    this.bellsData = null;
    this.currentWeekType = "numerator";
    this.currentDay = "1";
    const savedSub = localStorage.getItem("nntu_current_subgroup");
    const subMap = this.getSubjectSubgroups();
    const hasConfigured = Object.keys(subMap).length > 0;
    // Default to "profile" if custom subject subgroups exist in profile
    if (savedSub === "profile" || !savedSub || hasConfigured) {
      this.currentSubgroup = "profile";
      localStorage.setItem("nntu_current_subgroup", "profile");
    } else {
      this.currentSubgroup = savedSub;
    }
    this.availableGroups = [];

    // DOM References
    this.container = document.getElementById("timetable-list-container");
    this.daysBar = document.getElementById("schedule-days-bar");
    this.weekToggleGroup = document.getElementById("schedule-week-toggle-container");
    this.subgroupToggleGroup = document.getElementById("schedule-subgroup-toggle-container");
    this.groupLabel = document.getElementById("schedule-group-label");
    this.quickInput = document.getElementById("schedule-quick-group-input");
    this.quickDropdown = document.getElementById("schedule-quick-group-dropdown");

    this.init();
  }

  async init() {
    await this.loadData();
    this.detectCurrentTimeState();
    this.bindEvents();
    this.render();
  }

  getStudyWeekInfo() {
    const now = new Date();
    const year = now.getFullYear();
    // Fall semester starts Sep 1. Spring semester starts ~Feb 9.
    let start = new Date(year, 8, 1);
    if (now.getMonth() < 7) {
      start = new Date(year, 1, 9);
    }

    // Monday of starting week
    const startDay = (start.getDay() + 6) % 7;
    const startMonday = new Date(start);
    startMonday.setDate(start.getDate() - startDay);
    startMonday.setHours(0, 0, 0, 0);

    const diffMs = now.getTime() - startMonday.getTime();
    const weekNum = Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1);

    const isCurrentEven = (weekNum % 2 === 0);
    const currentParity = isCurrentEven ? "Чётная" : "Нечётная";
    const nextParity = isCurrentEven ? "Нечётная" : "Чётная";

    return {
      currentWeekNum: weekNum,
      currentParity: currentParity,
      nextWeekNum: weekNum + 1,
      nextParity: nextParity,
      isCurrentEven: isCurrentEven,
      startMonday: startMonday
    };
  }

  getDayDateString(weekNumber, dayIndex) {
    const weekInfo = this.getStudyWeekInfo();
    const startMonday = weekInfo.startMonday;
    const weekMonday = new Date(startMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
    const dayDate = new Date(weekMonday.getTime() + (dayIndex - 1) * 24 * 60 * 60 * 1000);

    const monthNames = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    return `${dayDate.getDate()} ${monthNames[dayDate.getMonth()]}`;
  }

  async loadData() {
    // Invalidate stale cached schedules that had inverted week mapping
    const cacheVer = localStorage.getItem("nntu_schedule_cache_ver");
    if (cacheVer !== "2026_v5") {
      localStorage.removeItem("nntu_student_schedule");
      const savedGroup = localStorage.getItem("nntu_current_group");
      if (savedGroup) localStorage.removeItem(`nntu_schedule_${savedGroup}`);
      localStorage.setItem("nntu_schedule_cache_ver", "2026_v5");
    }

    // 1. Load available groups from server API
    await this.loadAvailableGroups();

    // 2. Load schedule for current group (default to user group 26-ИВТ-4-1)
    const savedGroup = localStorage.getItem("nntu_current_group");
    const initialGroup = savedGroup || "26-ИВТ-4-1";
    await this.fetchGroupSchedule(initialGroup);

    // 3. Bells data
    try {
      const bResp = await fetch("/src/data/bells.json");
      this.bellsData = await bResp.json();
    } catch (e) {
      try {
        const bResp2 = await fetch("data/bells.json");
        this.bellsData = await bResp2.json();
      } catch (err) {}
    }
  }

  async loadAvailableGroups() {
    this.availableGroups = [];

    // 1. Try local server proxy
    try {
      const resp = await fetch("/api/schedule/groups");
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          this.availableGroups = data;
        }
      }
    } catch (e) {
      console.warn("Could not fetch groups from /api/schedule/groups", e);
    }

    // 2. Try direct NNTU API (supported via CORS)
    if (!this.availableGroups.length) {
      try {
        const resp2 = await fetch("https://my-api.nntu.ru/lesson-schedule/public/groups");
        if (resp2.ok) {
          const data2 = await resp2.json();
          if (Array.isArray(data2) && data2.length > 0) {
            this.availableGroups = data2;
          }
        }
      } catch (e) {
        console.warn("Direct NNTU API groups fetch failed", e);
      }
    }

    // 3. Bundled offline groups list (all 658+ groups)
    if (!this.availableGroups.length) {
      try {
        let gResp = await fetch("/src/data/groups.json").catch(() => null);
        if (!gResp || !gResp.ok) {
          gResp = await fetch("data/groups.json").catch(() => null);
        }
        if (gResp && gResp.ok) {
          const list = await gResp.json();
          if (Array.isArray(list) && list.length > 0) {
            this.availableGroups = list;
          }
        }
      } catch (err) {}
    }

    // 4. Bundled groups catalog fallback
    if (!this.availableGroups.length) {
      try {
        let gResp = await fetch("/src/data/groups_catalog.json").catch(() => null);
        if (!gResp || !gResp.ok) {
          gResp = await fetch("data/groups_catalog.json").catch(() => null);
        }
        if (gResp && gResp.ok) {
          const cat = await gResp.json();
          this.availableGroups = Array.isArray(cat) ? cat : Object.keys(cat);
        }
      } catch (err) {}
    }

    // Clean and purge any empty or obsolete placeholder entries (like 26-02010)
    this.availableGroups = (this.availableGroups || [])
      .filter(g => typeof g === "string" && g.trim().length > 0 && g.trim() !== "26-02010");
  }

  convertNntuRawSchedule(rawData, groupName) {
    if (!rawData || (!rawData.currentWeek && !rawData.nextWeek)) return null;

    const daysMap = {
      "понедельник": "1", "пн": "1",
      "вторник": "2", "вт": "2",
      "среда": "3", "ср": "3",
      "четверг": "4", "чт": "4",
      "пятница": "5", "пт": "5",
      "суббота": "6", "сб": "6"
    };

    const typeMap = {
      "лекции": "Лекция",
      "лекция": "Лекция",
      "практические занятия": "Практика",
      "практика": "Практика",
      "лабораторные работы": "Лабораторная",
      "лабораторная": "Лабораторная",
      "консультация": "Консультация",
      "зачет": "Зачёт",
      "экзамен": "Экзамен"
    };

    const times = rawData.times || [
      "",
      "08:00 - 09:35",
      "09:45 - 11:20",
      "11:35 - 13:10",
      "13:40 - 15:15",
      "15:25 - 17:00",
      "17:10 - 18:45",
      "18:55 - 20:30",
      "20:40 - 22:15"
    ];

    function parseRoomBuilding(roomStr) {
      if (!roomStr) return { room: "Ауд.", building: "1" };
      const clean = roomStr.trim();
      const mB = clean.match(/корп(?:ус|\.)?\s*№?\s*(\d+)/i);
      let bNum = mB ? mB[1] : null;

      const mR = clean.match(/\b(\d{3,4}[а-яА-Я]?)\b/);
      let rNum = mR ? mR[1] : clean;

      if (!bNum) {
        if (/^[1-6]\d{3}/.test(rNum)) {
          bNum = rNum[0];
        } else {
          bNum = "1";
        }
      }
      return { room: rNum, building: bNum };
    }

    function processWeek(weekDays, label) {
      const daysDict = {
        "1": { name: "Понедельник", date: "", lessons: [] },
        "2": { name: "Вторник", date: "", lessons: [] },
        "3": { name: "Среда", date: "", lessons: [] },
        "4": { name: "Четверг", date: "", lessons: [] },
        "5": { name: "Пятница", date: "", lessons: [] },
        "6": { name: "Суббота", date: "", lessons: [] }
      };

      for (const item of (weekDays || [])) {
        const rawTitle = (item.dayOfTheWeek || "").trim();
        const dayTitle = rawTitle.toLowerCase();
        let dayKey = null;
        for (const [ruDay, k] of Object.entries(daysMap)) {
          if (dayTitle.includes(ruDay)) {
            dayKey = k;
            break;
          }
        }
        if (!dayKey || !daysDict[dayKey]) continue;

        if (rawTitle.includes(",")) {
          daysDict[dayKey].date = rawTitle.split(",")[1].trim();
        }

        for (const el of (item.lessonElements || [])) {
          const subj = (el.subject || "").trim();
          if (!subj) continue;
          const tIdx = el.timeIndex || 1;
          let tStr = (tIdx < times.length) ? times[tIdx] : "09:45 - 11:20";
          tStr = tStr.replace("—", " - ");
          const stypeRaw = (el.studyType || "").trim().toLowerCase();
          const stype = typeMap[stypeRaw] || el.studyType || "Занятие";

          const roomRaw = el.room || "";
          const { room: rNum, building: bNum } = parseRoomBuilding(roomRaw);
          const teacher = (el.teacher || "").trim();

          daysDict[dayKey].lessons.push({
            pair: tIdx,
            time: tStr,
            subject: subj,
            type: stype,
            room: rNum,
            building: bNum,
            teacher: teacher,
            rawRoom: roomRaw
          });
        }
      }
      return { name: label, days: daysDict };
    }

    const now = new Date();
    const weekInfo = this.getStudyWeekInfo();
    const isCurrentEven = weekInfo.isCurrentEven;
    const weekNum = weekInfo.currentWeekNum;

    const currRaw = rawData.currentWeek || [];
    const nextRaw = rawData.nextWeek || [];

    const evenRaw = isCurrentEven ? currRaw : nextRaw;
    const oddRaw = isCurrentEven ? nextRaw : currRaw;

    const evenWeekData = processWeek(evenRaw, `${isCurrentEven ? weekNum : weekNum + 1} неделя (Чётная)`);
    const oddWeekData = processWeek(oddRaw, `${!isCurrentEven ? weekNum : weekNum + 1} неделя (Нечётная)`);

    return {
      group: groupName,
      faculty: "НГТУ им. Р.Е. Алексеева",
      semester: `Учебный семестр ${now.getFullYear()}/${now.getFullYear() + 1}`,
      lastSync: new Date().toLocaleString("ru-RU"),
      currentWeekNum: weekNum,
      isCurrentEven: isCurrentEven,
      weeks: {
        numerator: oddWeekData,
        denominator: evenWeekData,
        even: evenWeekData,
        odd: oddWeekData,
        current: isCurrentEven ? evenWeekData : oddWeekData,
        next: isCurrentEven ? oddWeekData : evenWeekData
      }
    };
  }

  async fetchGroupSchedule(groupName) {
    if (!groupName) return false;
    const cleanGroup = groupName.trim();
    localStorage.setItem("nntu_current_group", cleanGroup);

    // 1. Try local proxy API
    try {
      const resp = await fetch(`/api/schedule/group?name=${encodeURIComponent(cleanGroup)}`);
      if (resp.ok) {
        const res = await resp.json();
        if (res.success && res.schedule) {
          this.scheduleData = res.schedule;
          localStorage.setItem("nntu_student_schedule", JSON.stringify(res.schedule));
          localStorage.setItem(`nntu_schedule_${cleanGroup}`, JSON.stringify(res.schedule));
          return true;
        }
      }
    } catch (e) {
      console.warn("API schedule fetch failed", e);
    }

    // 2. Try direct NNTU public API
    try {
      const directUrl = `https://my-api.nntu.ru/lesson-schedule/public/group-schedule?groupName=${encodeURIComponent(cleanGroup)}`;
      const respDirect = await fetch(directUrl);
      if (respDirect.ok) {
        const rawJson = await respDirect.json();
        const converted = this.convertNntuRawSchedule(rawJson, cleanGroup);
        if (converted) {
          this.scheduleData = converted;
          localStorage.setItem("nntu_student_schedule", JSON.stringify(converted));
          localStorage.setItem(`nntu_schedule_${cleanGroup}`, JSON.stringify(converted));
          return true;
        }
      }
    } catch (e) {
      console.warn("Direct NNTU API schedule fetch failed", e);
    }

    // 3. Fallback: check cached schedule
    const cached = localStorage.getItem(`nntu_schedule_${cleanGroup}`) || localStorage.getItem("nntu_student_schedule");
    if (cached) {
      try {
        this.scheduleData = JSON.parse(cached);
        return true;
      } catch (e) {}
    }

    // 4. Fallback: default schedule
    try {
      let resp = await fetch("/src/data/default_schedule.json").catch(() => null);
      if (!resp || !resp.ok) {
        resp = await fetch("data/default_schedule.json");
      }
      this.scheduleData = await resp.json();
      this.scheduleData.group = cleanGroup;
    } catch (err) {}

    return false;
  }

  detectCurrentTimeState() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    this.currentDay = (dayOfWeek >= 1 && dayOfWeek <= 6) ? dayOfWeek.toString() : "1";

    const weekInfo = this.getStudyWeekInfo();
    // Числитель = нечётная, Знаменатель = чётная
    this.currentWeekType = weekInfo.isCurrentEven ? "denominator" : "numerator";
  }

  async switchGroup(groupName) {
    if (!groupName) return;
    const cleanGroup = groupName.trim();
    if (this.groupLabel) {
      this.groupLabel.textContent = `Загрузка (${cleanGroup})...`;
    }
    localStorage.setItem("nntu_current_group", cleanGroup);
    await this.fetchGroupSchedule(cleanGroup);
    this.render();
  }

  bindEvents() {
    const numBtn = document.getElementById("btn-week-numerator");
    const denBtn = document.getElementById("btn-week-denominator");

    const weekInfo = this.getStudyWeekInfo();
    // Update button text to clear study weeks (e.g. "6 неделя (Чётная)" / "7 неделя (Нечётная)")
    if (numBtn && denBtn) {
      if (weekInfo.isCurrentEven) {
        // Current week is even (denominator)
        numBtn.textContent = `${weekInfo.currentWeekNum} неделя (${weekInfo.currentParity})`;
        numBtn.setAttribute("data-week-type", "denominator");

        denBtn.textContent = `${weekInfo.nextWeekNum} неделя (${weekInfo.nextParity})`;
        denBtn.setAttribute("data-week-type", "numerator");
      } else {
        // Current week is odd (numerator)
        numBtn.textContent = `${weekInfo.currentWeekNum} неделя (${weekInfo.currentParity})`;
        numBtn.setAttribute("data-week-type", "numerator");

        denBtn.textContent = `${weekInfo.nextWeekNum} неделя (${weekInfo.nextParity})`;
        denBtn.setAttribute("data-week-type", "denominator");
      }
    }

    numBtn?.addEventListener("click", () => {
      this.currentWeekType = numBtn.getAttribute("data-week-type") || "numerator";
      numBtn.classList.add("active");
      denBtn?.classList.remove("active");
      this.render();
    });

    denBtn?.addEventListener("click", () => {
      this.currentWeekType = denBtn.getAttribute("data-week-type") || "denominator";
      denBtn.classList.add("active");
      numBtn?.classList.remove("active");
      this.render();
    });

    // Subgroup buttons
    document.querySelectorAll(".subgroup-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const sub = btn.getAttribute("data-subgroup") || "all";
        this.switchSubgroup(sub);
      });
    });

    // Day Chips
    document.querySelectorAll(".day-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".day-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        this.currentDay = chip.getAttribute("data-day");
        this.render();
      });
    });

    // Quick Group Search Input
    if (this.quickInput && this.quickDropdown) {
      this.quickInput.addEventListener("input", (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (!val) {
          this.quickDropdown.style.display = "none";
          this.quickDropdown.innerHTML = "";
          return;
        }

        const matches = (this.availableGroups || [])
          .filter(g => g.toLowerCase().includes(val))
          .slice(0, 15);

        if (matches.length === 0) {
          this.quickDropdown.innerHTML = `
            <div style="padding: 8px 12px; font-size: 12px; color: var(--color-fg-muted);">
              Группа не найдена
            </div>
          `;
        } else {
          this.quickDropdown.innerHTML = matches.map(g => `
            <div class="autocomplete-item" data-group="${g}" style="padding: 7px 12px; font-size: 12px; cursor: pointer;">
              <span>${g}</span>
              <span style="font-size: 10px; color: var(--color-accent-fg);">Выбрать</span>
            </div>
          `).join("");

          this.quickDropdown.querySelectorAll(".autocomplete-item").forEach(item => {
            item.addEventListener("click", () => {
              const selected = item.getAttribute("data-group");
              if (selected) {
                this.quickInput.value = "";
                this.quickDropdown.style.display = "none";
                this.switchGroup(selected);
              }
            });
          });
        }
        this.quickDropdown.style.display = "block";
      });

      this.quickInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const first = this.quickDropdown.querySelector(".autocomplete-item");
          if (first) {
            const selected = first.getAttribute("data-group");
            if (selected) {
              this.quickInput.value = "";
              this.quickDropdown.style.display = "none";
              this.switchGroup(selected);
              return;
            }
          }
          if (this.quickInput.value.trim()) {
            const typed = this.quickInput.value.trim();
            this.quickInput.value = "";
            this.quickDropdown.style.display = "none";
            this.switchGroup(typed);
          }
        } else if (e.key === "Escape") {
          this.quickDropdown.style.display = "none";
        }
      });

      document.addEventListener("click", (e) => {
        if (!this.quickInput.contains(e.target) && !this.quickDropdown.contains(e.target)) {
          this.quickDropdown.style.display = "none";
        }
      });
    }
  }

  render() {
    if (this.groupLabel) {
      this.groupLabel.textContent = this.scheduleData?.group || "26-ИВТ-4-1";
    }

    // Update active week button
    const numBtn = document.getElementById("btn-week-numerator");
    const denBtn = document.getElementById("btn-week-denominator");
    if (numBtn && denBtn) {
      const numType = numBtn.getAttribute("data-week-type") || "numerator";
      numBtn.classList.toggle("active", this.currentWeekType === numType);
      denBtn.classList.toggle("active", this.currentWeekType !== numType);
    }

    let weekObj = this.scheduleData?.weeks?.[this.currentWeekType];
    if (!weekObj && this.scheduleData?.weeks) {
      if (this.currentWeekType === "denominator" || this.currentWeekType === "even") {
        weekObj = this.scheduleData.weeks["even"] || this.scheduleData.weeks["denominator"];
      } else {
        weekObj = this.scheduleData.weeks["odd"] || this.scheduleData.weeks["numerator"];
      }
    }

    const weekInfo = this.getStudyWeekInfo();
    const isShowingCurrentWeek = (this.currentWeekType === "denominator" || this.currentWeekType === "even");
    const activeWeekNum = isShowingCurrentWeek ? weekInfo.currentWeekNum : weekInfo.nextWeekNum;
    const today = new Date().getDay().toString();

    // Update active day chips and dates under day names
    for (let d = 1; d <= 6; d++) {
      const dStr = d.toString();
      const chip = document.getElementById(`day-chip-${d}`);
      const dateEl = document.getElementById(`day-chip-date-${d}`);
      if (!chip) continue;

      chip.classList.toggle("active", dStr === this.currentDay);
      // "• Сегодня" only applies if this day is today AND the active week is the current study week
      chip.classList.toggle("today", isShowingCurrentWeek && dStr === today);

      const dayData = weekObj?.days?.[dStr];
      const dateStr = (dayData && dayData.date) ? dayData.date : this.getDayDateString(activeWeekNum, d);
      if (dateEl) {
        dateEl.textContent = dateStr;
      }
    }

    // Update subgroup buttons active state
    document.querySelectorAll(".subgroup-btn").forEach(btn => {
      const sub = btn.getAttribute("data-subgroup") || "all";
      btn.classList.toggle("active", sub === this.currentSubgroup);
    });

    const dayObj = weekObj?.days?.[this.currentDay];
    const rawLessons = dayObj?.lessons || [];

    // Filter by selected subgroup: if user subgroup does not match lesson subgroup, remove it!
    const lessons = rawLessons.filter(lesson => this.matchesSubgroup(lesson, this.currentSubgroup));

    if (!this.container) return;

    if (lessons.length === 0) {
      let emptyMsg = `В этот день для группы <strong>${this.scheduleData?.group || ""}</strong> занятий не запланировано.`;
      if (this.currentSubgroup !== "all" && rawLessons.length > 0) {
        if (this.currentSubgroup === "profile") {
          emptyMsg = `Для ваших подгрупп из профиля в этот день занятий нет (пары других подгрупп скрыты).`;
        } else {
          emptyMsg = `Для <strong>${this.currentSubgroup}-й подгруппы</strong> в этот день занятий нет (пары других подгрупп скрыты).`;
        }
      }
      this.container.innerHTML = `
        <div class="gh-box" style="text-align: center; padding: 48px 20px; border-style: dashed; width: 100%;">
          <div style="font-size: 36px; margin-bottom: 12px;">🎉</div>
          <h3 style="font-size: 16px; margin-bottom: 6px;">Пар нет!</h3>
          <p style="color: var(--color-fg-muted); font-size: 13px;">${emptyMsg}</p>
        </div>
      `;
      return;
    }

    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const isToday = new Date().getDay().toString() === this.currentDay;

    this.container.innerHTML = lessons.map(lesson => {
      let isNow = false;
      if (isToday && lesson.time) {
        try {
          const parts = lesson.time.split(" - ");
          if (parts.length === 2) {
            const [startH, startM] = parts[0].split(":").map(Number);
            const [endH, endM] = parts[1].split(":").map(Number);
            const startMin = startH * 60 + startM;
            const endMin = endH * 60 + endM;
            if (nowMinutes >= startMin && nowMinutes <= endMin) {
              isNow = true;
            }
          }
        } catch (e) {}
      }

      let typeClass = "type-lecture";
      const t = (lesson.type || "").toLowerCase();
      if (t.includes("практ")) typeClass = "type-practice";
      if (t.includes("лаб")) typeClass = "type-lab";

      const bld = lesson.building || "1";
      const rm = lesson.room || "Аудитория";

      // Detect subgroup for badge display
      const lessonSub = this.extractSubgroup(lesson);
      const subBadge = lessonSub ? `
        <span class="lesson-badge" style="background: rgba(88,166,255,0.15); color: #58a6ff; border: 1px solid rgba(88,166,255,0.3); font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 600;">
          👥 ${lessonSub} подгруппа
        </span>
      ` : "";

      return `
        <div class="lesson-card timetable-card ${isNow ? 'active-now active-lesson' : ''}">
          <div class="lesson-time-col lesson-meta-col">
            <span class="pair-number lesson-num">${lesson.pair} ПАРА ${isNow ? '• СЕЙЧАС' : ''}</span>
            <span class="pair-time lesson-time">${lesson.time}</span>
          </div>
          <div class="lesson-info-col lesson-details-col">
            <h3 class="lesson-title">${lesson.subject}</h3>
            <div class="lesson-meta lesson-subtext">
              <span class="lesson-type-badge lesson-badge ${typeClass}">${lesson.type}</span>
              ${subBadge}
              ${lesson.teacher ? `<span>• ${lesson.teacher}</span>` : ''}
            </div>
          </div>
          <div class="lesson-action-col lesson-room-col">
            <button type="button" class="room-navigation-link room-pill-btn" onclick="window.appNavigateToRoom('${rm}', '${bld}')" title="Показать аудиторию ${rm} на схеме корпуса ${bld}">
              <span>📍</span>
              <span class="room-tag-text">${rm} (к.${bld})</span>
              <span>→</span>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  switchSubgroup(subgroup) {
    this.currentSubgroup = subgroup || "profile";
    localStorage.setItem("nntu_current_subgroup", this.currentSubgroup);

    // Sync profile default dropdown if present and numeric
    const defSelect = document.getElementById("profile-default-subgroup-select");
    if (defSelect && /^\d+$/.test(this.currentSubgroup)) {
      defSelect.value = this.currentSubgroup;
      localStorage.setItem("nntu_default_subgroup", this.currentSubgroup);
    }

    this.render();
  }

  cleanSubjectName(subject) {
    if (!subject) return "";
    return subject
      .replace(/\s*\((?:подгрупп[аые]?|подгр\.?|п\/?г\.?)\s*\d+\)/gi, "")
      .replace(/\s*\(\d+\s*(?:подгрупп[аые]?|подгр\.?|п\/?г\.?)\)/gi, "")
      .replace(/[,;\-\s]*(?:подгрупп[аые]?|подгр\.?|п\/?г\.?)\s*\d+/gi, "")
      .replace(/[,;\-\s]*\d+\s*(?:-?[яе]?\s*)?(?:подгрупп[аые]?|подгр\.?|п\/?г\.?)\)?/gi, "")
      .replace(/[\u00A0\s]+/g, " ")
      .replace(/[,;\-\s]+$/, "")
      .trim();
  }

  getSubjectSubgroups() {
    try {
      const raw = localStorage.getItem("nntu_subject_subgroups");
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  setSubjectSubgroup(subjectName, subgroup) {
    if (!subjectName) return;
    const clean = this.cleanSubjectName(subjectName);
    const map = this.getSubjectSubgroups();
    if (!subgroup || subgroup === "all" || subgroup === "default") {
      delete map[clean];
    } else {
      map[clean] = String(subgroup);
    }
    localStorage.setItem("nntu_subject_subgroups", JSON.stringify(map));
    this.render();
  }

  getDefaultSubgroup() {
    return localStorage.getItem("nntu_default_subgroup") || "all";
  }

  setDefaultSubgroup(subgroup) {
    const val = subgroup || "all";
    localStorage.setItem("nntu_default_subgroup", val);
    this.render();
  }

  getScheduleSubjectsWithSubgroups() {
    const subjectsSet = new Set();
    if (!this.scheduleData || !this.scheduleData.weeks) return [];

    Object.values(this.scheduleData.weeks).forEach(week => {
      if (!week.days) return;
      Object.values(week.days).forEach(day => {
        if (!day.lessons) return;
        day.lessons.forEach(lesson => {
          if (this.extractSubgroup(lesson)) {
            const clean = this.cleanSubjectName(lesson.subject);
            if (clean) subjectsSet.add(clean);
          }
        });
      });
    });
    return Array.from(subjectsSet).sort();
  }

  extractSubgroup(lesson) {
    if (!lesson) return null;

    if (lesson.subgroup != null && lesson.subgroup !== "") {
      const m = String(lesson.subgroup).match(/\d+/);
      if (m) return m[0];
    }
    if (lesson.subGroup != null && lesson.subGroup !== "") {
      const m = String(lesson.subGroup).match(/\d+/);
      if (m) return m[0];
    }

    const text = `${lesson.subject || ""} ${lesson.type || ""} ${lesson.notes || ""}`.toLowerCase();
    
    // (подгруппа 1..10), подгруппа 1..10, п/г 1..10, подгр. 1..10
    const m1 = text.match(/(?:подгрупп[аые]?|подгр\.?|п\/?г\.?)\s*(\d+)/i);
    if (m1) return m1[1];

    // (1..10 подгруппа), 1..10 п/г, 1..10-я подгруппа
    const m2 = text.match(/(\d+)(?:-?[яе]?|\s*)\s*(?:подгрупп[аые]?|подгр\.?|п\/?г\.?)/i);
    if (m2) return m2[1];

    return null;
  }

  matchesSubgroup(lesson, selectedMode = null) {
    const mode = selectedMode || this.currentSubgroup || "profile";
    const lessonSub = this.extractSubgroup(lesson);

    // Lessons with no specific subgroup are general lectures attended by all students
    if (!lessonSub) return true;

    // Mode "all" -> show every subgroup
    if (mode === "all") return true;

    // Explicit numeric override from top bar ("1", "2", "3", ... up to "10")
    if (/^\d+$/.test(mode)) {
      return String(lessonSub) === String(mode);
    }

    // Default "profile" mode -> match by subject
    const cleanSubject = this.cleanSubjectName(lesson.subject);
    const subjectMap = this.getSubjectSubgroups();

    let targetSub = null;
    if (subjectMap) {
      if (subjectMap[cleanSubject]) {
        targetSub = subjectMap[cleanSubject];
      } else {
        const lower = cleanSubject.toLowerCase().trim();
        for (const [key, val] of Object.entries(subjectMap)) {
          const lk = this.cleanSubjectName(key).toLowerCase().trim();
          if (lk === lower || lower.includes(lk) || lk.includes(lower)) {
            targetSub = val;
            break;
          }
        }
      }
    }

    if (targetSub && targetSub !== "all" && targetSub !== "default") {
      return String(lessonSub) === String(targetSub);
    }

    // Fallback to default subgroup from profile
    const defaultSub = this.getDefaultSubgroup();
    if (defaultSub && defaultSub !== "all" && defaultSub !== "default") {
      return String(lessonSub) === String(defaultSub);
    }

    return true;
  }

  getLessonsForDay(dayNumber, weekType = null) {
    if (!this.scheduleData || !this.scheduleData.weeks) return [];
    const wt = weekType || this.currentWeekType;
    const week = this.scheduleData.weeks[wt];
    if (!week || !week.days) return [];
    const day = week.days[dayNumber.toString()];
    const raw = day ? day.lessons || [] : [];
    return raw.filter(lesson => this.matchesSubgroup(lesson, this.currentSubgroup));
  }

  updateScheduleData(newData) {
    if (!newData) return;
    this.scheduleData = newData;
    localStorage.setItem("nntu_student_schedule", JSON.stringify(newData));
    if (newData.group) {
      localStorage.setItem("nntu_current_group", newData.group);
      localStorage.setItem(`nntu_schedule_${newData.group}`, JSON.stringify(newData));
    }
    this.render();
  }
}

window.ScheduleManager = ScheduleManager;
