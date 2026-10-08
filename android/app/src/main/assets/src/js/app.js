/**
 * Main Application Orchestrator
 * NNTU Map & Schedule
 * Standard registration, cloud authentication, pinned groups, dynamic author card sync
 * Created by kosterik for NNSTU (НГТУ им. Р.Е. Алексеева)
 */

document.addEventListener("DOMContentLoaded", () => {
  // Initialize Subsystems
  const mapViewer = new MapViewer();
  window.appMapViewer = mapViewer;
  const scheduleManager = new ScheduleManager(mapViewer);
  window.appScheduleManager = scheduleManager;
  const widgetsEngine = new WidgetsEngine(scheduleManager);
  const notificationService = new NotificationService(scheduleManager);
  window.notificationInstance = notificationService;
  const newsLoader = new NewsLoader();
  const firebaseService = new FirebaseService();
  window.appFirebaseService = firebaseService;

  // Global helper for classroom clicks from schedule cards
  window.appNavigateToRoom = (room, building) => {
    const mapTab = document.querySelector('.nav-tab[data-tab="map"]');
    if (mapTab) mapTab.click();
    setTimeout(() => {
      mapViewer.navigateToRoom(room, building);
    }, 80);
  };

  // Tab Navigation Handling
  const tabs = document.querySelectorAll(".nav-tab");
  const panes = document.querySelectorAll(".tab-pane");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      
      tabs.forEach(t => t.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active"));

      tab.classList.add("active");
      const activePane = document.getElementById(`tab-${target}`);
      if (activePane) {
        activePane.classList.add("active");
      }

      if (target === "map") {
        setTimeout(() => mapViewer.applyTransform(), 60);
      }
      if (target === "schedule") {
        scheduleManager.render();
      }
      if (target === "widgets") {
        widgetsEngine.init();
      }
    });
  });

  // App Profile Elements
  const guestCard = document.getElementById("profile-guest-card");
  const userCard = document.getElementById("profile-user-card");
  const usernameTitle = document.getElementById("profile-card-username-title");
  const appNicknameInput = document.getElementById("profile-nickname-input");
  const avatarPreview = document.getElementById("profile-avatar-preview");
  const miniAvatar = document.getElementById("header-mini-avatar");
  const avatarFileInput = document.getElementById("avatar-file-input");
  const btnUploadAvatar = document.getElementById("btn-upload-avatar");
  const btnResetAvatar = document.getElementById("btn-reset-avatar");
  const accountLoginDisplay = document.getElementById("account-login-display");
  const profilePinnedGroupInput = document.getElementById("profile-pinned-group-input");
  const profileSubgroupSelect = document.getElementById("profile-subgroup-select");
  const profileDefaultSubgroupSelect = document.getElementById("profile-default-subgroup-select");
  const profileSubjectSubgroupsList = document.getElementById("profile-subject-subgroups-list");
  const configuredSubgroupsCount = document.getElementById("configured-subgroups-count");
  const btnDetectSubjects = document.getElementById("btn-detect-subjects");
  const btnAddSubjectRow = document.getElementById("btn-add-subject-row");
  const addSubjectInlineBox = document.getElementById("add-subject-inline-box");
  const newSubjectNameInput = document.getElementById("new-subject-name-input");
  const newSubjectSubgroupSelect = document.getElementById("new-subject-subgroup-select");
  const btnConfirmAddSubject = document.getElementById("btn-confirm-add-subject");
  const btnCancelAddSubject = document.getElementById("btn-cancel-add-subject");
  const btnSaveProfileAll = document.getElementById("btn-save-profile-all");
  const btnSavePinnedGroup = document.getElementById("btn-save-pinned-group");
  const btnAccountLogout = document.getElementById("btn-account-logout");
  const btnForceCloudSync = document.getElementById("btn-force-cloud-sync");

  // Author Tab Dynamic Elements (Permanently bound to users/kosterik in Firestore)
  const authorAvatar = document.getElementById("author-avatar-display");
  const authorNickname = document.getElementById("author-nickname-display");
  const authorBadge = document.getElementById("author-badge-label");
  const authorGroup = document.getElementById("author-group-display");
  const headerAuthorName = document.getElementById("header-author-name");

  function renderAuthorProfile(data) {
    if (!data) return;
    // Strict guard: NEVER allow any account other than kosterik to overwrite developer card!
    const l = (data.login || data.nickname || "").toLowerCase();
    if (l && l !== "kosterik") return;

    const nick = "kosterik";
    const group = data.group || "26-ИВТ-4-1";
    const avatar = data.avatar || null;

    if (authorNickname) authorNickname.textContent = nick;
    if (authorBadge) authorBadge.textContent = nick;
    if (headerAuthorName) headerAuthorName.textContent = nick;
    if (authorGroup) authorGroup.textContent = `Группа ${group}`;

    if (authorAvatar) {
      if (avatar) {
        authorAvatar.style.backgroundImage = `url(${avatar})`;
        authorAvatar.style.backgroundSize = "cover";
        authorAvatar.style.backgroundPosition = "center";
        authorAvatar.textContent = "";
      } else {
        authorAvatar.style.backgroundImage = "none";
        authorAvatar.style.background = "linear-gradient(135deg, #1f6feb, #238636)";
        authorAvatar.textContent = "K";
      }
    }
  }

  // 1. Purge any invalid author cache from previous sessions
  try {
    const rawAuthor = localStorage.getItem("nntu_author_data");
    if (rawAuthor) {
      const p = JSON.parse(rawAuthor);
      const l = (p.login || p.nickname || "").toLowerCase();
      if (l && l !== "kosterik") {
        localStorage.removeItem("nntu_author_data");
      }
    }
  } catch (_) {
    localStorage.removeItem("nntu_author_data");
  }

  // 2. Load bundled developer_profile.json baseline immediately (ensures avatar works offline)
  const loadDevProfile = async () => {
    try {
      let r = await fetch("/src/data/developer_profile.json").catch(() => null);
      if (!r || !r.ok) {
        r = await fetch("data/developer_profile.json").catch(() => null);
      }
      if (r && r.ok) {
        const devData = await r.json();
        renderAuthorProfile(devData);
        localStorage.setItem("nntu_author_data", JSON.stringify(devData));
      }
    } catch (_) {}
  };
  loadDevProfile();

  // 3. Bind author profile exclusively to users/kosterik in Firestore
  firebaseService.initDeveloperSync((data) => {
    if (data) renderAuthorProfile(data);
  });

  function setAvatarDisplay(dataUrl, fallbackLetter, customPreset = null) {
    const char = (fallbackLetter || "👤").toUpperCase();
    const targets = [avatarPreview, miniAvatar];

    targets.forEach(el => {
      if (!el) return;
      if (dataUrl) {
        el.style.backgroundImage = `url(${dataUrl})`;
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
        el.textContent = "";
      } else if (customPreset) {
        el.style.backgroundImage = "none";
        el.style.background = customPreset.color;
        el.textContent = customPreset.icon || char;
      } else {
        el.style.backgroundImage = "none";
        el.style.background = "linear-gradient(135deg, #1f6feb, #238636)";
        el.textContent = char;
      }
    });
  }

  function loadAppProfile() {
    let authLogin = localStorage.getItem("nntu_auth_login");
    const authTime = localStorage.getItem("nntu_auth_timestamp");
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    // Auto-logout after 7 days (раз в неделю максимум)
    if (authLogin && authTime) {
      if (Date.now() - parseInt(authTime, 10) > ONE_WEEK_MS) {
        authLogin = null;
        localStorage.removeItem("nntu_auth_login");
        localStorage.removeItem("nntu_auth_timestamp");
        localStorage.removeItem("nntu_app_nickname");
        localStorage.removeItem("nntu_user_avatar");
        localStorage.removeItem("nntu_avatar_preset");
      }
    } else if (authLogin && !authTime) {
      localStorage.setItem("nntu_auth_timestamp", Date.now().toString());
    }

    if (!authLogin) {
      localStorage.removeItem("nntu_auth_login");
      localStorage.removeItem("nntu_app_nickname");
      localStorage.removeItem("nntu_user_avatar");
      localStorage.removeItem("nntu_avatar_preset");
    }
    const savedNick = localStorage.getItem("nntu_app_nickname") || authLogin || "";
    const savedGroup = localStorage.getItem("nntu_current_group") || "";
    const savedAvatar = localStorage.getItem("nntu_user_avatar");
    const savedPreset = localStorage.getItem("nntu_avatar_preset");

    if (authLogin) {
      // User is authenticated! Show Profile, Hide Guest Auth Card
      if (guestCard) guestCard.style.display = "none";
      if (userCard) userCard.style.display = "block";
      if (usernameTitle) usernameTitle.textContent = authLogin;
      if (accountLoginDisplay) accountLoginDisplay.textContent = authLogin;

      if (appNicknameInput) appNicknameInput.value = savedNick || authLogin;
      if (profilePinnedGroupInput) profilePinnedGroupInput.value = savedGroup;
      if (profileSubgroupSelect) {
        profileSubgroupSelect.value = localStorage.getItem("nntu_current_subgroup") || "profile";
      }
      if (profileDefaultSubgroupSelect) {
        profileDefaultSubgroupSelect.value = scheduleManager.getDefaultSubgroup();
      }
      renderProfileSubjectSubgroups();

      if (savedPreset) {
        try {
          setAvatarDisplay(null, (savedNick || authLogin).charAt(0), JSON.parse(savedPreset));
        } catch (e) {
          setAvatarDisplay(savedAvatar, (savedNick || authLogin).charAt(0));
        }
      } else {
        setAvatarDisplay(savedAvatar, (savedNick || authLogin).charAt(0));
      }
    } else {
      // User is NOT authenticated! NO dummy preview profile!
      // Show ONLY registration / login card
      if (guestCard) guestCard.style.display = "block";
      if (userCard) userCard.style.display = "none";

      if (appNicknameInput) appNicknameInput.value = "";
      if (profilePinnedGroupInput) profilePinnedGroupInput.value = "";
      if (profileSubgroupSelect) profileSubgroupSelect.value = "all";

      if (miniAvatar) {
        miniAvatar.style.backgroundImage = "none";
        miniAvatar.style.background = "var(--color-canvas-inset)";
        miniAvatar.textContent = "👤";
      }
      if (avatarPreview) {
        avatarPreview.style.backgroundImage = "none";
        avatarPreview.style.background = "var(--color-canvas-inset)";
        avatarPreview.textContent = "👤";
      }
    }
  }

  // Auto-sync debouncer for profile settings (quiet background sync)
  let syncTimeout = null;
  function triggerCloudSync() {
    if (!firebaseService.isLoggedIn()) return;
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      const nick = appNicknameInput ? appNicknameInput.value.trim() : "";
      const grp = profilePinnedGroupInput ? profilePinnedGroupInput.value.trim() : (localStorage.getItem("nntu_current_group") || "");
      const sub = localStorage.getItem("nntu_current_subgroup") || "profile";
      const av = localStorage.getItem("nntu_user_avatar");
      firebaseService.saveProfile({
        nickname: nick,
        group: grp,
        subgroup: sub,
        avatar: av,
        subjectSubgroups: scheduleManager.getSubjectSubgroups(),
        dismissedSubjectSubgroups: scheduleManager.getDismissedSubjectSubgroups(),
        defaultSubgroup: scheduleManager.getDefaultSubgroup()
      });
    }, 1500);
  }

  function updateSubjectRowBadge(rowEl, val, defaultText) {
    const badgeEl = rowEl.querySelector(".subgroup-row-badge");
    if (!badgeEl) return;
    if (val && val !== "default" && val !== "all") {
      badgeEl.style.background = "rgba(35, 134, 54, 0.2)";
      badgeEl.style.color = "var(--color-success-fg)";
      badgeEl.style.fontWeight = "600";
      badgeEl.textContent = `👥 ${val} п/г`;
    } else if (val === "all") {
      badgeEl.style.background = "var(--color-canvas-inset)";
      badgeEl.style.color = "var(--color-fg-muted)";
      badgeEl.style.fontWeight = "normal";
      badgeEl.textContent = `(Все)`;
    } else {
      badgeEl.style.background = "var(--color-canvas-inset)";
      badgeEl.style.color = "var(--color-fg-muted)";
      badgeEl.style.fontWeight = "normal";
      badgeEl.textContent = `(по умолч.: ${defaultText})`;
    }
  }

  function updateConfiguredCount() {
    const configuredMap = scheduleManager.getSubjectSubgroups();
    const activeCount = Object.keys(configuredMap).filter(k => configuredMap[k] && configuredMap[k] !== "default" && configuredMap[k] !== "all").length;
    if (configuredSubgroupsCount) {
      configuredSubgroupsCount.textContent = activeCount;
    }
  }

  function renderProfileSubjectSubgroups() {
    if (!profileSubjectSubgroupsList) return;

    const configuredMap = scheduleManager.getSubjectSubgroups();
    const detectedList = scheduleManager.getScheduleSubjectsWithSubgroups();
    const allSubjectsSet = new Set([...Object.keys(configuredMap), ...detectedList]);
    const allSubjects = Array.from(allSubjectsSet).sort();

    updateConfiguredCount();

    const defaultSub = scheduleManager.getDefaultSubgroup();
    const defaultText = defaultSub === "all" ? "Все" : `${defaultSub} п/г`;

    if (allSubjects.length === 0) {
      profileSubjectSubgroupsList.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--color-fg-muted); font-size: 12px; border: 1px dashed var(--color-border-default); border-radius: 6px;">
          <span>Предметы с подгруппами пока не добавлены.</span><br>
          <span style="font-size: 11px; color: var(--color-fg-subtle); margin-top: 4px; display: inline-block;">
            Нажмите <strong>«🔍 Найти из расписания»</strong> или <strong>«➕ Добавить предмет»</strong>, чтобы настроить индивидуальные подгруппы (1–10).
          </span>
        </div>
      `;
      return;
    }

    profileSubjectSubgroupsList.innerHTML = allSubjects.map(subName => {
      const chosen = configuredMap[subName] || "default";
      const hasSpecific = chosen && chosen !== "default" && chosen !== "all";
      let badgeStyle = "background: var(--color-canvas-inset); color: var(--color-fg-muted);";
      let badgeText = `(по умолч.: ${defaultText})`;
      if (hasSpecific) {
        badgeStyle = "background: rgba(35, 134, 54, 0.2); color: var(--color-success-fg); font-weight: 600;";
        badgeText = `👥 ${chosen} п/г`;
      } else if (chosen === "all") {
        badgeText = `(Все)`;
      }

      let optionsHtml = `
        <option value="default" ${chosen === "default" ? "selected" : ""}>По умолч. (${defaultText})</option>
        <option value="all" ${chosen === "all" ? "selected" : ""}>Все подгруппы</option>
      `;
      for (let i = 1; i <= 10; i++) {
        optionsHtml += `<option value="${i}" ${chosen === String(i) ? "selected" : ""}>${i} подгруппа</option>`;
      }

      const encoded = encodeURIComponent(subName);
      return `
        <div class="subject-subgroup-row" data-subject="${encoded}" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 10px 12px; background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px;">
          <div style="flex: 1; min-width: 170px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 13px; font-weight: 600; color: var(--color-fg-default);">${subName}</span>
            <span class="subgroup-row-badge" style="${badgeStyle} font-size: 11px; padding: 2px 7px; border-radius: 10px;">${badgeText}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <select class="gh-input subject-subgroup-select" data-subject="${encoded}" style="width: 140px; height: 32px; font-size: 12px; padding: 2px 8px;">
              ${optionsHtml}
            </select>
            <button type="button" class="btn-gh btn-remove-subject-item" data-subject="${encoded}" title="Удалить предмет из настроек" style="height: 32px; padding: 0 8px; font-size: 12px; color: var(--color-danger-fg);">
              ✕
            </button>
          </div>
        </div>
      `;
    }).join("");

    // Bind row listeners (IN-PLACE, WITHOUT DESTROYING DOM ON CHANGE!)
    profileSubjectSubgroupsList.querySelectorAll(".subject-subgroup-row").forEach(rowEl => {
      const sel = rowEl.querySelector(".subject-subgroup-select");
      const btnRemove = rowEl.querySelector(".btn-remove-subject-item");
      const subName = decodeURIComponent(sel.getAttribute("data-subject"));

      sel.addEventListener("change", (e) => {
        const val = e.target.value;
        // 1. Update scheduleManager and localStorage
        scheduleManager.setSubjectSubgroup(subName, val);
        scheduleManager.switchSubgroup("profile");
        // 2. Update badge in-place WITHOUT re-rendering the whole DOM!
        const currentDef = scheduleManager.getDefaultSubgroup();
        const currentDefText = currentDef === "all" ? "Все" : `${currentDef} п/г`;
        updateSubjectRowBadge(rowEl, val, currentDefText);
        // 3. Update counter in-place
        updateConfiguredCount();
        // 4. Quiet cloud sync (debounced, no spam toasts)
        triggerCloudSync();
      });

      btnRemove.addEventListener("click", () => {
        scheduleManager.dismissSubjectSubgroup(subName);
        rowEl.remove();
        updateConfiguredCount();
        triggerCloudSync();
        notificationService.showToast(`🗑️ ${subName} удален из настроек`);
      });
    });
  }

  // Subgroup Profile Event Listeners
  btnDetectSubjects?.addEventListener("click", () => {
    localStorage.removeItem("nntu_dismissed_subject_subgroups");
    const detected = scheduleManager.getScheduleSubjectsWithSubgroups(true);
    if (detected.length === 0) {
      notificationService.showToast("ℹ️ В текущем расписании не найдено занятий с делением на подгруппы");
    } else {
      renderProfileSubjectSubgroups();
      triggerCloudSync();
      notificationService.showToast(`🔍 Найдено предметов с подгруппами: ${detected.length}`);
    }
  });

  btnAddSubjectRow?.addEventListener("click", () => {
    if (addSubjectInlineBox) {
      const isHidden = addSubjectInlineBox.style.display === "none";
      addSubjectInlineBox.style.display = isHidden ? "block" : "none";
      if (isHidden && newSubjectNameInput) {
        newSubjectNameInput.value = "";
        setTimeout(() => newSubjectNameInput.focus(), 60);
      }
    }
  });

  btnCancelAddSubject?.addEventListener("click", () => {
    if (addSubjectInlineBox) addSubjectInlineBox.style.display = "none";
  });

  btnConfirmAddSubject?.addEventListener("click", () => {
    const name = newSubjectNameInput ? newSubjectNameInput.value.trim() : "";
    const subVal = newSubjectSubgroupSelect ? newSubjectSubgroupSelect.value : "1";
    if (!name) {
      notificationService.showToast("⚠️ Введите название предмета!");
      return;
    }
    scheduleManager.undismissSubjectSubgroup(name);
    scheduleManager.setSubjectSubgroup(name, subVal);
    if (addSubjectInlineBox) addSubjectInlineBox.style.display = "none";
    if (newSubjectNameInput) newSubjectNameInput.value = "";
    renderProfileSubjectSubgroups();
    triggerCloudSync();
    notificationService.showToast(`✅ Предмет "${name}" добавлен (${subVal} подгруппа)!`);
  });

  newSubjectNameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnConfirmAddSubject?.click();
    }
  });

  profileDefaultSubgroupSelect?.addEventListener("change", (e) => {
    const val = e.target.value;
    scheduleManager.setDefaultSubgroup(val);
    scheduleManager.switchSubgroup("profile");
    // Update all rows with "default" in place
    const defaultText = val === "all" ? "Все" : `${val} п/г`;
    if (profileSubjectSubgroupsList) {
      profileSubjectSubgroupsList.querySelectorAll(".subject-subgroup-row").forEach(rowEl => {
        const sel = rowEl.querySelector(".subject-subgroup-select");
        if (sel && sel.value === "default") {
          updateSubjectRowBadge(rowEl, "default", defaultText);
        }
      });
    }
    triggerCloudSync();
  });

  profileSubgroupSelect?.addEventListener("change", (e) => {
    const val = e.target.value;
    scheduleManager.switchSubgroup(val);
    triggerCloudSync();
  });

  // Dedicated Save Profile & Subgroups Button (All-in-One Save)
  btnSaveProfileAll?.addEventListener("click", async () => {
    const nick = appNicknameInput ? appNicknameInput.value.trim() : "";
    const grp = profilePinnedGroupInput ? profilePinnedGroupInput.value.trim() : (localStorage.getItem("nntu_current_group") || "");
    const defSub = profileDefaultSubgroupSelect ? profileDefaultSubgroupSelect.value : scheduleManager.getDefaultSubgroup();
    const subMap = scheduleManager.getSubjectSubgroups();

    // Actively force "profile" subgroup mode so schedule immediately filters
    scheduleManager.switchSubgroup("profile");
    localStorage.setItem("nntu_current_subgroup", "profile");

    if (grp) {
      localStorage.setItem("nntu_current_group", grp);
      scheduleManager.switchGroup(grp);
    }
    if (defSub) {
      scheduleManager.setDefaultSubgroup(defSub);
    }
    if (nick) {
      localStorage.setItem("nntu_app_nickname", nick);
    }

    if (btnSaveProfileAll) btnSaveProfileAll.disabled = true;
    notificationService.showToast("⏳ Сохранение профиля в базу данных...");

    const res = await firebaseService.saveProfile({
      nickname: nick,
      group: grp,
      subgroup: "profile",
      avatar: localStorage.getItem("nntu_user_avatar"),
      subjectSubgroups: subMap,
      dismissedSubjectSubgroups: scheduleManager.getDismissedSubjectSubgroups(),
      defaultSubgroup: defSub
    });

    if (btnSaveProfileAll) btnSaveProfileAll.disabled = false;

    // Re-enforce profile subgroup mode and re-render schedule
    scheduleManager.switchSubgroup("profile");
    scheduleManager.render();

    if (res.cloud) {
      notificationService.showToast("✅ Профиль и подгруппы сохранены! Расписание отфильтровано");
    } else {
      notificationService.showToast("💾 Профиль сохранён локально! Расписание отфильтровано");
    }
  });

  appNicknameInput?.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (val) localStorage.setItem("nntu_app_nickname", val);
    const savedAvatar = localStorage.getItem("nntu_user_avatar");
    const savedPreset = localStorage.getItem("nntu_avatar_preset");
    if (!savedAvatar && !savedPreset && val) {
      setAvatarDisplay(null, val.charAt(0));
    }
    triggerCloudSync();
  });

  btnUploadAvatar?.addEventListener("click", () => {
    avatarFileInput?.click();
  });

  avatarFileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawBase64 = event.target.result;
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          localStorage.removeItem("nntu_avatar_preset");
          localStorage.setItem("nntu_user_avatar", compressed);
          setAvatarDisplay(compressed);
          triggerCloudSync();
          notificationService.showToast("☁️ Аватарка сохранена в профиль!");
        } catch (err) {
          localStorage.removeItem("nntu_avatar_preset");
          try {
            localStorage.setItem("nntu_user_avatar", rawBase64);
            setAvatarDisplay(rawBase64);
            triggerCloudSync();
            notificationService.showToast("☁️ Аватарка сохранена в профиль!");
          } catch (storageErr) {
            notificationService.showToast("⚠️ Изображение слишком большое. Выберите фото меньшего размера.");
          }
        }
      };
      img.onerror = () => {
        notificationService.showToast("⚠️ Не удалось загрузить выбранное изображение.");
      };
      img.src = rawBase64;
    };
    reader.readAsDataURL(file);
  });

  btnResetAvatar?.addEventListener("click", () => {
    localStorage.removeItem("nntu_user_avatar");
    localStorage.removeItem("nntu_avatar_preset");
    const authLogin = localStorage.getItem("nntu_auth_login") || "👤";
    setAvatarDisplay(null, authLogin.charAt(0));
    triggerCloudSync();
    notificationService.showToast("🔄 Аватарка сброшена");
  });

  // Preset avatar styles (Cyber, Flame, Uni)
  document.querySelectorAll(".preset-avatar-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const bg = chip.getAttribute("data-color");
      const icon = chip.getAttribute("data-icon") || "🎓";
      localStorage.removeItem("nntu_user_avatar");
      localStorage.setItem("nntu_avatar_preset", JSON.stringify({ color: bg, icon: icon }));
      setAvatarDisplay(null, null, { color: bg, icon: icon });
      triggerCloudSync();
      notificationService.showToast(`🎨 Выбран стиль: ${icon}`);
    });
  });

  // Pinned Group Save Button
  btnSavePinnedGroup?.addEventListener("click", () => {
    const val = profilePinnedGroupInput ? profilePinnedGroupInput.value.trim() : "";
    if (!val) {
      notificationService.showToast("⚠️ Введите название группы!");
      return;
    }
    localStorage.setItem("nntu_current_group", val);
    firebaseService.saveProfile({ group: val });
    scheduleManager.switchGroup(val);
    notificationService.showToast(`📌 Группа ${val} закреплена за вашим профилем!`);
  });

  btnForceCloudSync?.addEventListener("click", async () => {
    if (!firebaseService.isLoggedIn()) {
      notificationService.showToast("⚠️ Сначала войдите в аккаунт");
      return;
    }
    notificationService.showToast("⏳ Синхронизация с Firestore...");
    const res = await firebaseService.saveProfile({
      nickname: appNicknameInput ? appNicknameInput.value.trim() : "",
      group: localStorage.getItem("nntu_current_group") || "",
      avatar: localStorage.getItem("nntu_user_avatar"),
      subjectSubgroups: scheduleManager.getSubjectSubgroups(),
      dismissedSubjectSubgroups: scheduleManager.getDismissedSubjectSubgroups(),
      defaultSubgroup: scheduleManager.getDefaultSubgroup(),
      subgroup: localStorage.getItem("nntu_current_subgroup") || "profile"
    });
    if (res.cloud) {
      notificationService.showToast("✅ Профиль успешно сохранён в Firebase Firestore!");
    } else {
      notificationService.showToast("💾 Профиль сохранён локально (офлайн)");
    }
  });

  // Real-time Firestore sync (passive background sync for other devices)
  firebaseService.onProfileChange((remoteData) => {
    if (remoteData.nickname && !appNicknameInput?.matches(':focus')) {
      if (appNicknameInput) appNicknameInput.value = remoteData.nickname;
    }
    if (remoteData.avatar) {
      setAvatarDisplay(remoteData.avatar);
    }
    // NEVER force switchGroup or reload DOM on snapshot updates during an active session!
  });

  // ================= Password Visibility Toggles =================
  document.querySelectorAll(".btn-toggle-password").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === "password") {
        input.type = "text";
        btn.textContent = "🙈";
        btn.title = "Скрыть пароль";
      } else {
        input.type = "password";
        btn.textContent = "👁️";
        btn.title = "Показать пароль";
      }
    });
  });

  // ================= Change Password in Profile =================
  const btnChangePass = document.getElementById("btn-change-password");
  const inputOldPass = document.getElementById("profile-current-pass");
  const inputNewPass = document.getElementById("profile-new-pass");
  const changePassStatus = document.getElementById("change-pass-status");

  btnChangePass?.addEventListener("click", async () => {
    const oldPass = inputOldPass ? inputOldPass.value.trim() : "";
    const newPass = inputNewPass ? inputNewPass.value.trim() : "";

    if (!oldPass) {
      if (changePassStatus) {
        changePassStatus.style.display = "inline";
        changePassStatus.style.color = "var(--color-danger-fg)";
        changePassStatus.textContent = "Введите текущий пароль";
      }
      notificationService.showToast("⚠️ Введите текущий пароль!");
      return;
    }
    if (!newPass || newPass.length < 4) {
      if (changePassStatus) {
        changePassStatus.style.display = "inline";
        changePassStatus.style.color = "var(--color-danger-fg)";
        changePassStatus.textContent = "Новый пароль: минимум 4 символа";
      }
      notificationService.showToast("⚠️ Новый пароль должен быть от 4 символов!");
      return;
    }

    if (btnChangePass) btnChangePass.disabled = true;
    if (changePassStatus) {
      changePassStatus.style.display = "inline";
      changePassStatus.style.color = "var(--color-fg-muted)";
      changePassStatus.textContent = "Обновление пароля...";
    }

    const res = await firebaseService.changePassword(oldPass, newPass);
    if (btnChangePass) btnChangePass.disabled = false;

    if (!res.success) {
      if (changePassStatus) {
        changePassStatus.style.color = "var(--color-danger-fg)";
        changePassStatus.textContent = res.error || "Ошибка смены пароля";
      }
      notificationService.showToast(`❌ ${res.error || "Ошибка смены пароля"}`);
      return;
    }

    if (changePassStatus) {
      changePassStatus.style.color = "var(--color-success-fg)";
      changePassStatus.textContent = "Пароль успешно изменен! ✓";
      setTimeout(() => {
        if (changePassStatus) changePassStatus.style.display = "none";
      }, 3500);
    }
    if (inputOldPass) inputOldPass.value = "";
    if (inputNewPass) inputNewPass.value = "";
    notificationService.showToast("🔑 Пароль успешно изменен и сохранен!");
  });

  // ================= Inline Tab 5 Auth Card Handlers =================
  const inlineTabLogin = document.getElementById("inline-tab-login");
  const inlineTabRegister = document.getElementById("inline-tab-register");
  const inlineFormLogin = document.getElementById("inline-form-login");
  const inlineFormRegister = document.getElementById("inline-form-register");
  const btnInlineToReg = document.getElementById("btn-inline-to-register");
  const btnInlineToLog = document.getElementById("btn-inline-to-login");
  const inlineAlert = document.getElementById("inline-auth-alert");

  function showInlineAlert(msg, type = "error") {
    if (!inlineAlert) return;
    inlineAlert.style.display = "block";
    if (type === "error") {
      inlineAlert.style.background = "rgba(248,81,73,0.15)";
      inlineAlert.style.border = "1px solid var(--color-danger-emphasis)";
      inlineAlert.style.color = "var(--color-danger-fg)";
    } else {
      inlineAlert.style.background = "rgba(46,160,67,0.15)";
      inlineAlert.style.border = "1px solid var(--color-success-emphasis)";
      inlineAlert.style.color = "var(--color-success-fg)";
    }
    inlineAlert.textContent = msg;
  }

  function hideInlineAlert() {
    if (inlineAlert) inlineAlert.style.display = "none";
  }

  function switchInlineToLogin() {
    hideInlineAlert();
    inlineTabLogin?.classList.add("active");
    inlineTabRegister?.classList.remove("active");
    if (inlineFormLogin) inlineFormLogin.style.display = "block";
    if (inlineFormRegister) inlineFormRegister.style.display = "none";
  }

  function switchInlineToRegister() {
    hideInlineAlert();
    inlineTabRegister?.classList.add("active");
    inlineTabLogin?.classList.remove("active");
    if (inlineFormRegister) inlineFormRegister.style.display = "block";
    if (inlineFormLogin) inlineFormLogin.style.display = "none";
    renderInlineRegGroups(inlineRegGroupInput?.value || "");
  }

  inlineTabLogin?.addEventListener("click", switchInlineToLogin);
  inlineTabRegister?.addEventListener("click", switchInlineToRegister);
  btnInlineToReg?.addEventListener("click", switchInlineToRegister);
  btnInlineToLog?.addEventListener("click", switchInlineToLogin);

  // Group selector in registration (matching Screenshot 2)
  const inlineRegGroupInput = document.getElementById("inline-reg-group");
  const inlineRegGroupList = document.getElementById("inline-reg-group-list");
  const btnInlineRegOpenModal = document.getElementById("btn-inline-reg-open-modal");

  function renderInlineRegGroups(query = "") {
    if (!inlineRegGroupList) return;
    const sourceGroups = (scheduleManager.availableGroups && scheduleManager.availableGroups.length > 0)
      ? scheduleManager.availableGroups
      : [];

    const q = query.trim().toLowerCase();
    const filtered = sourceGroups.filter(g => !q || g.toLowerCase().includes(q));

    if (filtered.length === 0) {
      inlineRegGroupList.innerHTML = `
        <div style="font-size:12px; color:var(--color-fg-muted); padding:8px; text-align:center;">
          Группы по запросу "${query}" не найдены в базе НГТУ
        </div>
      `;
      return;
    }

    const currentVal = inlineRegGroupInput?.value.trim() || "";
    // При открытии без запроса выводим максимум 60 штук, а при поиске — ВСЕ найденные
    const toRender = !q ? filtered.slice(0, 60) : filtered;

    let hintHtml = "";
    if (!q && filtered.length > 60) {
      hintHtml = `
        <div style="font-size:11px; color:var(--color-fg-muted); padding:4px 8px; margin-bottom:4px; text-align:center;">
          Показано 60 из ${filtered.length} групп. Введите номер (например, 26-), чтобы найти свою группу.
        </div>
      `;
    } else if (q) {
      hintHtml = `
        <div style="font-size:11px; color:var(--color-fg-muted); padding:4px 8px; margin-bottom:4px; text-align:center;">
          Найдено групп: ${filtered.length}
        </div>
      `;
    }

    inlineRegGroupList.innerHTML = hintHtml + toRender.map(g => {
      const isSelected = g.toLowerCase() === currentVal.toLowerCase();
      return `
        <button type="button" class="btn-gh inline-reg-group-item" data-group="${g}" style="text-align:left; display:flex; justify-content:space-between; align-items:center; padding:6px 10px; font-size:13px; font-weight:${isSelected ? '600' : 'normal'}; background:${isSelected ? 'var(--color-accent-subtle)' : 'transparent'};">
          <span>${g}</span>
          ${isSelected ? '<span style="font-size:11px; color:var(--color-accent-fg);">Выбрано ✓</span>' : '<span style="font-size:11px; color:var(--color-fg-muted);">Выбрать →</span>'}
        </button>
      `;
    }).join("");

    inlineRegGroupList.querySelectorAll(".inline-reg-group-item").forEach(item => {
      item.addEventListener("click", () => {
        const g = item.getAttribute("data-group");
        if (g && inlineRegGroupInput) {
          inlineRegGroupInput.value = g;
          renderInlineRegGroups(g);
        }
      });
    });
  }

  inlineRegGroupInput?.addEventListener("input", (e) => {
    renderInlineRegGroups(e.target.value);
  });

  document.querySelectorAll(".inline-reg-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const g = chip.getAttribute("data-group");
      if (g && inlineRegGroupInput) {
        inlineRegGroupInput.value = g;
        renderInlineRegGroups(g);
      }
    });
  });

  btnInlineRegOpenModal?.addEventListener("click", () => {
    const groupModal = document.getElementById("group-select-modal");
    if (groupModal) {
      groupModal.style.display = "flex";
      renderGroupSearchResults("");
    }
  });

  inlineFormLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = document.getElementById("inline-login-username")?.value.trim();
    const pass = document.getElementById("inline-login-password")?.value.trim();
    if (!login || !pass) return;

    showInlineAlert("⏳ Проверка аккаунта...", "info");
    const res = await firebaseService.login(login, pass);

    if (!res.success) {
      showInlineAlert(res.error || "Неверный логин или пароль", "error");
      return;
    }

    hideInlineAlert();
    loadAppProfile();

    if (res.user && res.user.group) {
      scheduleManager.switchGroup(res.user.group);
      if (profilePinnedGroupInput) profilePinnedGroupInput.value = res.user.group;
    }
    if (res.user && res.user.subgroup) {
      scheduleManager.switchSubgroup(res.user.subgroup);
    }
    notificationService.showToast(`✅ Вы успешно вошли как ${login}!`);
    widgetsEngine.init();
  });

  inlineFormRegister?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = document.getElementById("inline-reg-username")?.value.trim();
    const pass = document.getElementById("inline-reg-password")?.value.trim();
    const group = document.getElementById("inline-reg-group")?.value.trim() || "";

    if (!login || !pass) return;
    if (pass.length < 4) {
      showInlineAlert("Пароль должен содержать минимум 4 символа", "error");
      return;
    }

    const privacyCheck = document.getElementById("inline-reg-privacy-checkbox");
    if (privacyCheck && !privacyCheck.checked) {
      showInlineAlert("Необходимо принять Политику конфиденциальности для регистрации!", "error");
      privacyCheck.focus();
      return;
    }

    showInlineAlert("⏳ Создание профиля...", "info");
    const res = await firebaseService.register(login, pass, group);

    if (!res.success) {
      showInlineAlert(res.error || "Ошибка регистрации", "error");
      return;
    }

    localStorage.setItem("nntu_privacy_accepted", "true");

    hideInlineAlert();
    loadAppProfile();
    if (group) {
      scheduleManager.switchGroup(group);
      if (profilePinnedGroupInput) profilePinnedGroupInput.value = group;
    }
    const msg = res.cloud 
      ? `🎉 Аккаунт ${login} успешно создан в облаке Firebase!` 
      : `🎉 Аккаунт ${login} успешно создан и сохранен!`;
    notificationService.showToast(msg);
    widgetsEngine.init();
  });

  // Logout
  btnAccountLogout?.addEventListener("click", () => {
    firebaseService.logout();
    loadAppProfile();
    notificationService.showToast("🚪 Вы вышли из аккаунта");
  });

  // Modal Auth Support (if triggered from header)
  const authModal = document.getElementById("auth-modal");
  const btnCloseAuth = document.getElementById("btn-close-auth-modal");
  const authTabLogin = document.getElementById("auth-tab-btn-login");
  const authTabRegister = document.getElementById("auth-tab-btn-register");
  const formLogin = document.getElementById("form-auth-login");
  const formRegister = document.getElementById("form-auth-register");
  const btnSwitchToReg = document.getElementById("btn-switch-to-register");
  const btnSwitchToLog = document.getElementById("btn-switch-to-login");
  const authAlert = document.getElementById("auth-status-alert");

  function showAuthAlert(msg, type = "error") {
    if (!authAlert) return;
    authAlert.style.display = "block";
    if (type === "error") {
      authAlert.style.background = "rgba(248,81,73,0.15)";
      authAlert.style.border = "1px solid var(--color-danger-emphasis)";
      authAlert.style.color = "var(--color-danger-fg)";
    } else {
      authAlert.style.background = "rgba(46,160,67,0.15)";
      authAlert.style.border = "1px solid var(--color-success-emphasis)";
      authAlert.style.color = "var(--color-success-fg)";
    }
    authAlert.textContent = msg;
  }

  btnCloseAuth?.addEventListener("click", () => {
    if (authModal) authModal.style.display = "none";
  });

  authTabLogin?.addEventListener("click", () => {
    if (authAlert) authAlert.style.display = "none";
    authTabLogin?.classList.add("active");
    authTabRegister?.classList.remove("active");
    if (formLogin) formLogin.style.display = "block";
    if (formRegister) formRegister.style.display = "none";
  });

  authTabRegister?.addEventListener("click", () => {
    if (authAlert) authAlert.style.display = "none";
    authTabRegister?.classList.add("active");
    authTabLogin?.classList.remove("active");
    if (formRegister) formRegister.style.display = "block";
    if (formLogin) formLogin.style.display = "none";
  });

  btnSwitchToReg?.addEventListener("click", () => authTabRegister?.click());
  btnSwitchToLog?.addEventListener("click", () => authTabLogin?.click());

  formLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = document.getElementById("auth-login-username")?.value.trim();
    const pass = document.getElementById("auth-login-password")?.value.trim();
    if (!login || !pass) return;

    showAuthAlert("⏳ Проверка аккаунта...", "info");
    const res = await firebaseService.login(login, pass);
    if (!res.success) {
      showAuthAlert(res.error || "Неверный логин или пароль", "error");
      return;
    }
    if (authModal) authModal.style.display = "none";
    loadAppProfile();
    if (res.user?.group) {
      scheduleManager.switchGroup(res.user.group);
      if (profilePinnedGroupInput) profilePinnedGroupInput.value = res.user.group;
    }
    if (res.user?.subgroup) {
      scheduleManager.switchSubgroup(res.user.subgroup);
    }
    notificationService.showToast(`✅ Добро пожаловать, ${login}!`);
    widgetsEngine.init();
  });

  formRegister?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = document.getElementById("auth-reg-username")?.value.trim();
    const pass = document.getElementById("auth-reg-password")?.value.trim();
    const group = document.getElementById("auth-reg-group")?.value.trim() || "";

    if (!login || !pass) return;
    if (pass.length < 4) {
      showAuthAlert("Пароль должен содержать минимум 4 символа", "error");
      return;
    }

    const privacyCheck = document.getElementById("auth-reg-privacy-checkbox");
    if (privacyCheck && !privacyCheck.checked) {
      showAuthAlert("Необходимо согласиться с Политикой конфиденциальности!", "error");
      privacyCheck.focus();
      return;
    }

    showAuthAlert("⏳ Создание аккаунта...", "info");
    const res = await firebaseService.register(login, pass, group);
    if (!res.success) {
      showAuthAlert(res.error || "Ошибка регистрации", "error");
      return;
    }
    localStorage.setItem("nntu_privacy_accepted", "true");
    if (authModal) authModal.style.display = "none";
    loadAppProfile();
    if (group) {
      scheduleManager.switchGroup(group);
      if (profilePinnedGroupInput) profilePinnedGroupInput.value = group;
    }
    notificationService.showToast(`🎉 Аккаунт ${login} создан!`);
    widgetsEngine.init();
  });

  // ================= Privacy Policy Modal Handlers =================
  const privacyModal = document.getElementById("privacy-policy-modal");
  const btnClosePrivacy = document.getElementById("btn-close-privacy-modal");
  const btnCancelPrivacy = document.getElementById("btn-privacy-modal-cancel");
  const btnAcceptPrivacy = document.getElementById("btn-privacy-modal-accept");

  function openPrivacyModal() {
    if (privacyModal) {
      privacyModal.style.display = "flex";
    }
  }

  function closePrivacyModal() {
    if (privacyModal) {
      privacyModal.style.display = "none";
    }
  }

  document.querySelectorAll(".link-open-privacy-policy").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openPrivacyModal();
    });
  });

  btnClosePrivacy?.addEventListener("click", closePrivacyModal);
  btnCancelPrivacy?.addEventListener("click", closePrivacyModal);

  btnAcceptPrivacy?.addEventListener("click", () => {
    localStorage.setItem("nntu_privacy_accepted", "true");
    const cb1 = document.getElementById("inline-reg-privacy-checkbox");
    const cb2 = document.getElementById("auth-reg-privacy-checkbox");
    if (cb1) cb1.checked = true;
    if (cb2) cb2.checked = true;
    closePrivacyModal();
    notificationService.showToast("🛡️ Вы приняли условия Политики конфиденциальности");
  });

  privacyModal?.addEventListener("click", (e) => {
    if (e.target === privacyModal) {
      closePrivacyModal();
    }
  });

  // Initialize profile display
  loadAppProfile();

  // ================= Group Switcher Modal Handlers =================
  const groupModal = document.getElementById("group-select-modal");
  const btnOpenGroup = document.getElementById("btn-open-group-modal");
  const btnCloseGroup = document.getElementById("btn-close-group-modal");
  const groupSearchInput = document.getElementById("group-search-input");
  const groupResultsContainer = document.getElementById("group-search-results");

  function renderGroupSearchResults(query = "") {
    if (!groupResultsContainer) return;
    const allGroups = (scheduleManager.availableGroups && scheduleManager.availableGroups.length > 0)
      ? scheduleManager.availableGroups
      : [];
    const q = query.trim().toLowerCase();
    const filtered = allGroups.filter(g => !q || g.toLowerCase().includes(q));

    if (filtered.length === 0) {
      groupResultsContainer.innerHTML = `
        <div style="font-size:12px; color:var(--color-fg-muted); padding:8px; text-align:center;">
          Группы по запросу "${query}" не найдены в базе НГТУ
        </div>
      `;
      return;
    }

    const currentGroup = localStorage.getItem("nntu_current_group") || "";
    // При открытии без запроса выводим максимум 60 штук, а при вводе запроса (например "26-") выводим ВСЕ найденные группы!
    const toRender = !q ? filtered.slice(0, 60) : filtered;

    let hintHtml = "";
    if (!q && filtered.length > 60) {
      hintHtml = `
        <div style="font-size:11px; color:var(--color-fg-muted); padding:4px 8px; margin-bottom:6px; background:var(--color-canvas-subtle); border-radius:6px; text-align:center;">
          Показано 60 из ${filtered.length} групп. Введите номер (например, 26-), чтобы найти свою группу.
        </div>
      `;
    } else if (q) {
      hintHtml = `
        <div style="font-size:11px; color:var(--color-fg-muted); padding:4px 8px; margin-bottom:6px; background:var(--color-canvas-subtle); border-radius:6px; text-align:center;">
          Найдено групп: ${filtered.length}
        </div>
      `;
    }

    groupResultsContainer.innerHTML = hintHtml + toRender.map(g => {
      const isCurrent = g === currentGroup;
      return `
        <button type="button" class="btn-gh group-result-item" data-group="${g}" style="text-align:left; display:flex; justify-content:space-between; align-items:center; padding:6px 12px; font-size:13px; font-weight:${isCurrent ? '600' : 'normal'}; background:${isCurrent ? 'var(--color-accent-subtle)' : 'transparent'};">
          <span>${g}</span>
          ${isCurrent ? '<span style="font-size:11px; color:var(--color-accent-fg);">Текущая ✓</span>' : '<span style="font-size:11px; color:var(--color-fg-muted);">Выбрать →</span>'}
        </button>
      `;
    }).join("");

    groupResultsContainer.querySelectorAll(".group-result-item").forEach(item => {
      item.addEventListener("click", () => {
        const g = item.getAttribute("data-group");
        if (g) {
          scheduleManager.switchGroup(g);
          if (profilePinnedGroupInput) profilePinnedGroupInput.value = g;
          if (inlineRegGroupInput) {
            inlineRegGroupInput.value = g;
            renderInlineRegGroups(g);
          }
          if (groupModal) groupModal.style.display = "none";
          notificationService.showToast(`👥 Выбрана группа: ${g}`);
          widgetsEngine.init();
        }
      });
    });
  }

  btnOpenGroup?.addEventListener("click", () => {
    if (groupModal) {
      if (groupSearchInput) {
        groupSearchInput.value = "";
      }
      renderGroupSearchResults("");
      groupModal.style.display = "flex";
      setTimeout(() => groupSearchInput?.focus(), 60);
    }
  });

  btnCloseGroup?.addEventListener("click", () => {
    if (groupModal) groupModal.style.display = "none";
  });

  groupSearchInput?.addEventListener("input", (e) => {
    renderGroupSearchResults(e.target.value);
  });

  document.querySelectorAll(".group-quick-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const g = chip.getAttribute("data-group");
      if (g) {
        scheduleManager.switchGroup(g);
        if (profilePinnedGroupInput) profilePinnedGroupInput.value = g;
        if (inlineRegGroupInput) {
          inlineRegGroupInput.value = g;
          renderInlineRegGroups(g);
        }
        if (groupModal) groupModal.style.display = "none";
        notificationService.showToast(`👥 Выбрана группа: ${g}`);
        widgetsEngine.init();
      }
    });
  });

  // Floating Desktop Mini-Widget Launcher
  document.getElementById("btn-launch-desktop-widget")?.addEventListener("click", () => {
    window.open("/src/widget_popup.html", "NNTU_Mini_Widget", "width=390,height=540,menubar=no,toolbar=no,location=no,status=no,resizable=yes");
  });
  
  // Auto Updates
  document.getElementById("btn-check-updates")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-check-updates");
    const originalText = btn ? btn.textContent : "🔄 Проверить обновления";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⏳ Проверка...";
    }
    
    try {
      const currentVersion = "v2.1.3"; // current installed version
      let latestVersion = null;
      let downloadUrl = "";
      let releaseNotes = "";
      let releaseName = "";
      let htmlUrl = "https://github.com/kosterik/NNTU-Map/releases";
      
      // Strategy 1: Fetch raw version.json from GitHub main (Direct CDN, NO 60 req/hr rate limits!)
      try {
        const rawRes = await fetch(`https://raw.githubusercontent.com/kosterik/NNTU-Map/main/version.json?t=${Date.now()}`, {
          cache: "no-store"
        });
        if (rawRes.ok) {
          const rawData = await rawRes.json();
          if (rawData && rawData.version) {
            latestVersion = rawData.version;
            releaseName = rawData.name || rawData.version;
            releaseNotes = rawData.notes || "";
            downloadUrl = !!window.AndroidWidget ? rawData.apkUrl : rawData.exeUrl;
            if (rawData.releaseUrl) htmlUrl = rawData.releaseUrl;
          }
        }
      } catch (err) {
        console.warn("[Updates] Raw version.json check failed, trying API:", err);
      }

      // Strategy 2: Fallback to GitHub Releases API if strategy 1 was unavailable
      if (!latestVersion) {
        try {
          const apiRes = await fetch(`https://api.github.com/repos/kosterik/NNTU-Map/releases/latest?t=${Date.now()}`, {
            cache: "no-store",
            headers: { "Accept": "application/vnd.github.v3+json" }
          });
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            if (apiData && apiData.tag_name) {
              latestVersion = apiData.tag_name;
              releaseName = apiData.name || apiData.tag_name;
              releaseNotes = apiData.body || "";
              if (apiData.html_url) htmlUrl = apiData.html_url;
              const isAndroid = !!window.AndroidWidget;
              const asset = (apiData.assets || []).find(a => isAndroid ? a.name.endsWith(".apk") : a.name.endsWith(".exe"));
              if (asset) downloadUrl = asset.browser_download_url;
            }
          }
        } catch (apiErr) {
          console.warn("[Updates] GitHub API check failed:", apiErr);
        }
      }

      // Version comparison helper: compares semantic versions e.g. "v2.1.2" vs "v2.1.1"
      function isNewerVersion(remote, local) {
        if (!remote) return false;
        const cleanRemote = remote.replace(/^v/, "").trim();
        const cleanLocal = local.replace(/^v/, "").trim();
        if (cleanRemote === cleanLocal) return false;
        
        const rParts = cleanRemote.split(".").map(n => parseInt(n, 10) || 0);
        const lParts = cleanLocal.split(".").map(n => parseInt(n, 10) || 0);
        const maxLen = Math.max(rParts.length, lParts.length);
        for (let i = 0; i < maxLen; i++) {
          const r = rParts[i] || 0;
          const l = lParts[i] || 0;
          if (r > l) return true;
          if (r < l) return false;
        }
        return false;
      }

      if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
        const confirmMsg = `🚀 Доступна новая версия: ${latestVersion}!\n\n${releaseName}` +
          (releaseNotes ? `\n\nЧто нового:\n${releaseNotes}` : "") +
          `\n\nНажмите ОК, чтобы скачать обновление.`;
        
        if (confirm(confirmMsg)) {
          const targetUrl = downloadUrl || htmlUrl;
          if (window.AndroidWidget && typeof window.AndroidWidget.openBrowser === "function") {
            window.AndroidWidget.openBrowser(targetUrl);
          } else {
            window.location.href = targetUrl;
          }
        }
      } else if (latestVersion) {
        alert(`🎉 У вас установлена самая актуальная версия приложения (${currentVersion})!`);
      } else {
        if (confirm("Не удалось автоматически связаться с сервером обновлений.\n\nОткрыть страницу релизов на GitHub в браузере?")) {
          const targetUrl = htmlUrl;
          if (window.AndroidWidget && typeof window.AndroidWidget.openBrowser === "function") {
            window.AndroidWidget.openBrowser(targetUrl);
          } else {
            window.location.href = targetUrl;
          }
        }
      }
    } catch (e) {
      console.error("[Updates] Error:", e);
      alert("Ошибка при проверке обновлений. Проверьте интернет-соединение.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  });
});
