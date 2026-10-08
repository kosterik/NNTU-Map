/**
 * Firebase Cloud Sync & Authentication Service
 * Standard user registration, login, profile persistence, and pinned group management in Firestore
 * Project: kosterik-app
 * Created by kosterik for NNSTU (НГТУ им. Р.Е. Алексеева)
 */

const firebaseConfig = {
  apiKey: "AIzaSyDK1x0cz5ZXHmB2l7Vr_62g8uOq9e_qHL0",
  authDomain: "kosterik-app.firebaseapp.com",
  projectId: "kosterik-app",
  storageBucket: "kosterik-app.firebasestorage.app",
  messagingSenderId: "359090985720",
  appId: "1:359090985720:web:b206ca0a5ec019f01a790d",
  measurementId: "G-KB2H8934KB"
};

class FirebaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.status = "offline"; // 'online', 'syncing', 'offline', 'error'
    this.statusBadge = null;
    this.listeners = [];
    this.unsubscribeSnapshot = null;

    this.init();
  }

  init() {
    this.statusBadge = document.getElementById("cloud-status-badge");

    try {
      if (typeof firebase !== "undefined") {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        this.db = firebase.firestore();
        this.isInitialized = true;
        this.updateStatus("online");

        // If user already logged in, init realtime listener
        if (this.isLoggedIn()) {
          this.initRealtimeSync();
        }
      } else {
        console.warn("Firebase SDK not loaded, operating in local offline cache mode");
        this.updateStatus("offline");
      }
    } catch (err) {
      console.warn("Firebase init error:", err);
      this.updateStatus("error");
    }
  }

  isLoggedIn() {
    const login = localStorage.getItem("nntu_auth_login");
    if (!login) return false;
    const authTime = localStorage.getItem("nntu_auth_timestamp");
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    if (authTime) {
      if (Date.now() - parseInt(authTime, 10) > ONE_WEEK_MS) {
        this.logout();
        return false;
      }
    } else {
      localStorage.setItem("nntu_auth_timestamp", Date.now().toString());
    }
    return true;
  }

  getLogin() {
    return localStorage.getItem("nntu_auth_login") || "";
  }

  async register(login, password, group, avatar = null) {
    if (!login || !login.trim()) {
      return { success: false, error: "Пожалуйста, введите логин" };
    }
    if (!password || password.length < 4) {
      return { success: false, error: "Пароль должен содержать не менее 4 символов" };
    }

    const cleanLogin = login.trim().toLowerCase();
    const cleanNick = login.trim();
    const cleanGroup = group ? group.trim() : (localStorage.getItem("nntu_current_group") || "26-ИВТ-4-1");
    const chosenAvatar = avatar || localStorage.getItem("nntu_user_avatar") || null;

    const userData = {
      login: cleanLogin,
      nickname: cleanNick,
      password: password,
      group: cleanGroup,
      avatar: chosenAvatar,
      device: "Windows Desktop",
      updatedAt: new Date().toISOString()
    };

    // Helper to persist locally
    const saveLocally = () => {
      localStorage.setItem("nntu_auth_login", cleanLogin);
      localStorage.setItem("nntu_auth_timestamp", Date.now().toString());
      localStorage.setItem("nntu_app_nickname", cleanNick);
      localStorage.setItem("nntu_current_group", cleanGroup);
      localStorage.setItem(`nntu_user_pass_${cleanLogin}`, password);
      if (chosenAvatar) {
        localStorage.setItem("nntu_user_avatar", chosenAvatar);
      }
      try {
        const usersList = JSON.parse(localStorage.getItem("nntu_registered_users_list") || "[]");
        if (!usersList.includes(cleanLogin)) {
          usersList.push(cleanLogin);
          localStorage.setItem("nntu_registered_users_list", JSON.stringify(usersList));
        }
      } catch (_) {}
    };

    if (!this.db || !this.isInitialized) {
      saveLocally();
      this.updateStatus("offline", "<span>☁️ Локальный профиль 🟢</span>");
      return { success: true, user: userData, offline: true };
    }

    this.updateStatus("syncing");
    try {
      const userRef = this.db.collection("users").doc(cleanLogin);
      
      // Attempt read from Firestore
      let docExists = false;
      try {
        const doc = await userRef.get();
        docExists = doc.exists;
      } catch (readErr) {
        console.warn("Firestore read failed (likely security rules), proceeding with local registration:", readErr);
      }

      if (docExists) {
        this.updateStatus("online");
        return { success: false, error: "Пользователь с таким логином уже существует в облаке! Попробуйте войти." };
      }

      // Attempt write to Firestore
      let cloudSynced = false;
      try {
        const cloudData = {
          ...userData,
          createdAt: (typeof firebase !== "undefined" && firebase.firestore?.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString(),
          updatedAt: (typeof firebase !== "undefined" && firebase.firestore?.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
        };
        await userRef.set(cloudData);
        cloudSynced = true;
      } catch (writeErr) {
        console.warn("Firestore write failed (rules or network), saving locally:", writeErr);
      }

      saveLocally();

      if (cloudSynced) {
        this.updateStatus("online", "<span>☁️ Firebase: В сети 🟢</span>");
        this.initRealtimeSync();
      } else {
        this.updateStatus("online", "<span>☁️ Профиль сохранен локально 🟢</span>");
      }

      return { success: true, user: userData, cloud: cloudSynced };
    } catch (err) {
      console.warn("General registration error, falling back locally:", err);
      saveLocally();
      this.updateStatus("online", "<span>☁️ Профиль сохранен локально 🟢</span>");
      return { success: true, user: userData, cloud: false };
    }
  }

  async login(login, password) {
    if (!login || !login.trim()) {
      return { success: false, error: "Введите логин" };
    }
    if (!password) {
      return { success: false, error: "Введите пароль" };
    }

    const cleanLogin = login.trim().toLowerCase();

    // 1. Check Cloud if available
    if (this.db && this.isInitialized) {
      this.updateStatus("syncing");
      try {
        const userRef = this.db.collection("users").doc(cleanLogin);
        const doc = await userRef.get();

        if (doc.exists) {
          const data = doc.data();
          if (data.password && data.password !== password) {
            this.updateStatus("online");
            return { success: false, error: "Неверный пароль!" };
          }

          // Successful cloud login
          localStorage.setItem("nntu_auth_login", cleanLogin);
          localStorage.setItem("nntu_auth_timestamp", Date.now().toString());
          localStorage.setItem("nntu_app_nickname", data.nickname || cleanLogin);
          localStorage.setItem(`nntu_user_pass_${cleanLogin}`, password);
          if (data.group) {
            localStorage.setItem("nntu_current_group", data.group);
          }
          if (data.avatar) {
            localStorage.setItem("nntu_user_avatar", data.avatar);
          } else {
            localStorage.removeItem("nntu_user_avatar");
          }
          if (data.subjectSubgroups && typeof data.subjectSubgroups === "object") {
            const clean = {};
            for (const [k, v] of Object.entries(data.subjectSubgroups)) {
              if (v && v !== "default" && v !== "") {
                clean[k] = String(v);
              }
            }
            localStorage.setItem("nntu_subject_subgroups", JSON.stringify(clean));
          } else {
            localStorage.setItem("nntu_subject_subgroups", JSON.stringify({}));
          }
          if (Array.isArray(data.dismissedSubjectSubgroups)) {
            localStorage.setItem("nntu_dismissed_subject_subgroups", JSON.stringify(data.dismissedSubjectSubgroups));
          }
          if (data.defaultSubgroup) {
            localStorage.setItem("nntu_default_subgroup", data.defaultSubgroup);
          }
          if (data.subgroup) {
            const hasSubs = (data.subjectSubgroups && Object.keys(data.subjectSubgroups).length > 0);
            const sub = (hasSubs && (data.subgroup === "all" || !data.subgroup)) ? "profile" : data.subgroup;
            localStorage.setItem("nntu_current_subgroup", sub);
          }

          try {
            await userRef.update({
              lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          } catch (_) {}

          this.updateStatus("online", "<span>☁️ Firebase: В сети 🟢</span>");
          this.initRealtimeSync();
          return { success: true, user: data, cloud: true };
        }
      } catch (err) {
        console.warn("Firebase login fetch failed, checking local storage:", err);
      }
    }

    // 2. Check Local Storage credentials
    const savedPass = localStorage.getItem(`nntu_user_pass_${cleanLogin}`);
    const currentLocalUser = localStorage.getItem("nntu_auth_login");

    if (savedPass !== null) {
      if (savedPass !== password) {
        return { success: false, error: "Неверный пароль!" };
      }
      localStorage.setItem("nntu_auth_login", cleanLogin);
      localStorage.setItem("nntu_auth_timestamp", Date.now().toString());
      const nick = localStorage.getItem("nntu_app_nickname") || cleanLogin;
      const group = localStorage.getItem("nntu_current_group") || "26-ИВТ-4-1";
      this.updateStatus("online", "<span>☁️ Локальный профиль 🟢</span>");
      return { 
        success: true, 
        user: { login: cleanLogin, nickname: nick, group: group, avatar: localStorage.getItem("nntu_user_avatar") }, 
        cloud: false 
      };
    } else if (currentLocalUser === cleanLogin) {
      localStorage.setItem(`nntu_user_pass_${cleanLogin}`, password);
      localStorage.setItem("nntu_auth_login", cleanLogin);
      localStorage.setItem("nntu_auth_timestamp", Date.now().toString());
      const nick = localStorage.getItem("nntu_app_nickname") || cleanLogin;
      const group = localStorage.getItem("nntu_current_group") || "26-ИВТ-4-1";
      this.updateStatus("online", "<span>☁️ Локальный профиль 🟢</span>");
      return { 
        success: true, 
        user: { login: cleanLogin, nickname: nick, group: group, avatar: localStorage.getItem("nntu_user_avatar") }, 
        cloud: false 
      };
    } else {
      return { 
        success: false, 
        error: "Пользователь не найден. Пожалуйста, перейдите на вкладку 'Регистрация' и создайте аккаунт!" 
      };
    }
  }

  logout() {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
    localStorage.removeItem("nntu_auth_login");
    localStorage.removeItem("nntu_auth_timestamp");
    localStorage.removeItem("nntu_app_nickname");
    localStorage.removeItem("nntu_user_avatar");
    localStorage.removeItem("nntu_avatar_preset");
    this.updateStatus("offline");
  }

  updateStatus(status, text = null) {
    this.status = status;
    if (!this.statusBadge) {
      this.statusBadge = document.getElementById("cloud-status-badge");
    }
    if (!this.statusBadge) return;

    this.statusBadge.className = `cloud-sync-status-badge ${status}`;
    const login = this.getLogin();
    if (status === "online") {
      this.statusBadge.innerHTML = text || `<span>☁️ Firebase: В сети 🟢</span>`;
      this.statusBadge.title = `Подключено к Firestore (проект: kosterik-app, аккаунт: ${login})`;
    } else if (status === "syncing") {
      this.statusBadge.innerHTML = text || `<span>☁️ Синхронизация... 🟡</span>`;
    } else if (status === "offline") {
      this.statusBadge.innerHTML = text || `<span>☁️ Офлайн-режим ⚪</span>`;
      this.statusBadge.title = "Данные сохраняются локально";
    } else {
      this.statusBadge.innerHTML = text || `<span>☁️ Ошибка связи 🔴</span>`;
    }
  }

  initRealtimeSync() {
    if (!this.db || !this.isInitialized) return;
    const login = (localStorage.getItem("nntu_auth_login") || "").toLowerCase();
    if (!login) return;

    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }

    try {
      this.unsubscribeSnapshot = this.db.collection("users").doc(login).onSnapshot(
        (doc) => {
          // Ignore local pending writes echo to prevent fighting active user inputs!
          if (doc.metadata && doc.metadata.hasPendingWrites) {
            return;
          }
          if (doc.exists) {
            const data = doc.data();
            this.handleRemoteUpdate(data);
            this.updateStatus("online");
          }
        },
        (err) => {
          console.warn("Firestore onSnapshot error:", err);
          this.updateStatus("offline");
        }
      );
    } catch (e) {
      console.warn("Could not attach Firestore snapshot listener", e);
    }
  }

  // Realtime Developer Profile Sync (tied exclusively to users/kosterik in Firestore)
  initDeveloperSync(callback) {
    const handleData = (data) => {
      if (data) {
        const l = (data.login || data.nickname || "").toLowerCase();
        if (l && l !== "kosterik") return; // never accept other users
        localStorage.setItem("nntu_author_data", JSON.stringify(data));
        if (typeof callback === "function") callback(data);
      }
    };

    // Load local cache immediately if valid
    const cached = localStorage.getItem("nntu_author_data");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        handleData(parsed);
      } catch (_) {}
    }

    if (!this.db || !this.isInitialized) return;

    try {
      this.db.collection("users").doc("kosterik").onSnapshot(
        (doc) => {
          if (doc.exists) {
            handleData(doc.data());
          }
        },
        (err) => {
          console.warn("Firestore developer profile sync error:", err);
        }
      );
    } catch (e) {
      console.warn("Could not attach developer profile listener:", e);
    }
  }

  async getDeveloperProfile() {
    if (this.db && this.isInitialized) {
      try {
        const doc = await this.db.collection("users").doc("kosterik").get();
        if (doc.exists) {
          const data = doc.data();
          localStorage.setItem("nntu_author_data", JSON.stringify(data));
          return data;
        }
      } catch (e) {
        console.warn("Could not fetch developer profile:", e);
      }
    }
    const cached = localStorage.getItem("nntu_author_data");
    if (cached) {
      try { return JSON.parse(cached); } catch (_) {}
    }
    return null;
  }

  handleRemoteUpdate(remoteData) {
    if (!remoteData) return;

    let hasChanges = false;
    if (remoteData.nickname && remoteData.nickname !== localStorage.getItem("nntu_app_nickname")) {
      localStorage.setItem("nntu_app_nickname", remoteData.nickname);
      hasChanges = true;
    }
    if (remoteData.avatar !== undefined && remoteData.avatar !== localStorage.getItem("nntu_user_avatar")) {
      if (remoteData.avatar) {
        localStorage.setItem("nntu_user_avatar", remoteData.avatar);
      } else {
        localStorage.removeItem("nntu_user_avatar");
      }
      hasChanges = true;
    }
    // Only update group if user does NOT currently have an active group selected locally
    if (remoteData.group && !localStorage.getItem("nntu_current_group")) {
      localStorage.setItem("nntu_current_group", remoteData.group);
      hasChanges = true;
    }
    if (remoteData.subjectSubgroups !== undefined) {
      const currentSubMap = localStorage.getItem("nntu_subject_subgroups");
      const cleanRemote = {};
      if (remoteData.subjectSubgroups && typeof remoteData.subjectSubgroups === "object") {
        for (const [k, v] of Object.entries(remoteData.subjectSubgroups)) {
          if (v && v !== "default" && v !== "") {
            cleanRemote[k] = String(v);
          }
        }
      }
      const remoteSubMapStr = JSON.stringify(cleanRemote);
      if (currentSubMap !== remoteSubMapStr) {
        localStorage.setItem("nntu_subject_subgroups", remoteSubMapStr);
        hasChanges = true;
      }
    }
    if (remoteData.dismissedSubjectSubgroups !== undefined && Array.isArray(remoteData.dismissedSubjectSubgroups)) {
      const currentDismissed = localStorage.getItem("nntu_dismissed_subject_subgroups");
      const remoteDismissedStr = JSON.stringify(remoteData.dismissedSubjectSubgroups);
      if (currentDismissed !== remoteDismissedStr) {
        localStorage.setItem("nntu_dismissed_subject_subgroups", remoteDismissedStr);
        hasChanges = true;
      }
    }
    if (remoteData.defaultSubgroup !== undefined && remoteData.defaultSubgroup !== localStorage.getItem("nntu_default_subgroup")) {
      localStorage.setItem("nntu_default_subgroup", remoteData.defaultSubgroup);
      hasChanges = true;
    }
    if (remoteData.subgroup !== undefined) {
      const subs = remoteData.subjectSubgroups || (localStorage.getItem("nntu_subject_subgroups") ? JSON.parse(localStorage.getItem("nntu_subject_subgroups")) : {});
      const hasSubs = Object.keys(subs).length > 0;
      const sub = (hasSubs && (remoteData.subgroup === "all" || !remoteData.subgroup)) ? "profile" : remoteData.subgroup;
      if (sub !== localStorage.getItem("nntu_current_subgroup")) {
        localStorage.setItem("nntu_current_subgroup", sub);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.notifyListeners(remoteData);
    }
  }

  onProfileChange(callback) {
    if (typeof callback === "function") {
      this.listeners.push(callback);
    }
  }

  notifyListeners(data) {
    for (const cb of this.listeners) {
      try {
        cb(data);
      } catch (e) {
        console.error(e);
      }
    }
  }

  async saveProfile(profileData) {
    // 1. Immediately cache locally
    if (profileData.nickname) {
      localStorage.setItem("nntu_app_nickname", profileData.nickname);
    }
    if (profileData.avatar !== undefined) {
      if (profileData.avatar) {
        localStorage.setItem("nntu_user_avatar", profileData.avatar);
      } else {
        localStorage.removeItem("nntu_user_avatar");
      }
    }
    if (profileData.group) {
      localStorage.setItem("nntu_current_group", profileData.group);
    }

    let cleanSubMap = null;
    if (profileData.subjectSubgroups !== undefined) {
      cleanSubMap = {};
      if (profileData.subjectSubgroups && typeof profileData.subjectSubgroups === "object") {
        for (const [k, v] of Object.entries(profileData.subjectSubgroups)) {
          if (v && v !== "default" && v !== "") {
            cleanSubMap[k] = String(v);
          }
        }
      }
      localStorage.setItem("nntu_subject_subgroups", JSON.stringify(cleanSubMap));
    }
    if (profileData.dismissedSubjectSubgroups !== undefined) {
      localStorage.setItem("nntu_dismissed_subject_subgroups", JSON.stringify(profileData.dismissedSubjectSubgroups || []));
    }
    if (profileData.defaultSubgroup !== undefined) {
      localStorage.setItem("nntu_default_subgroup", profileData.defaultSubgroup);
    }
    if (profileData.subgroup !== undefined) {
      localStorage.setItem("nntu_current_subgroup", profileData.subgroup);
    }

    // 2. Sync to Firestore in cloud
    if (!this.db || !this.isInitialized) {
      this.updateStatus("offline");
      return { success: true, cloud: false };
    }

    const login = (localStorage.getItem("nntu_auth_login") || "").toLowerCase();
    if (!login) {
      return { success: true, cloud: false };
    }

    this.updateStatus("syncing");
    const payload = {
      nickname: profileData.nickname || localStorage.getItem("nntu_app_nickname") || login,
      group: profileData.group || localStorage.getItem("nntu_current_group") || "",
      device: (typeof window !== "undefined" && !!window.AndroidWidget) ? "Android Mobile" : "Windows Desktop",
      updatedAt: (typeof firebase !== "undefined" && firebase.firestore?.FieldValue) 
        ? firebase.firestore.FieldValue.serverTimestamp() 
        : new Date().toISOString()
    };

    if (profileData.avatar !== undefined) {
      payload.avatar = profileData.avatar || null;
    }
    if (profileData.defaultSubgroup !== undefined) {
      payload.defaultSubgroup = profileData.defaultSubgroup;
    }
    if (profileData.subgroup !== undefined) {
      payload.subgroup = profileData.subgroup;
    }
    if (profileData.dismissedSubjectSubgroups !== undefined) {
      payload.dismissedSubjectSubgroups = profileData.dismissedSubjectSubgroups;
    } else {
      try {
        const rawDis = localStorage.getItem("nntu_dismissed_subject_subgroups");
        if (rawDis) payload.dismissedSubjectSubgroups = JSON.parse(rawDis);
      } catch (_) {}
    }

    try {
      const userRef = this.db.collection("users").doc(login);
      
      // Step A: Save scalar profile fields with merge: true (preserves passwordHash, createdAt, etc.)
      await userRef.set(payload, { merge: true });

      // Step B: IMPORTANT! In Firestore, set(payload, { merge: true }) merges nested maps recursively
      // and will NEVER delete removed keys from a map!
      // Therefore, we use userRef.update({ subjectSubgroups: cleanSubMap }) to completely OVERWRITE
      // the map and purge deleted / "default" keys directly in Firestore.
      if (cleanSubMap !== null) {
        await userRef.update({
          subjectSubgroups: cleanSubMap
        });
      }

      this.updateStatus("online");
      return { success: true, cloud: true };
    } catch (err) {
      console.warn("Firestore save error:", err);
      this.updateStatus("offline");
      return { success: true, cloud: false, error: err.message };
    }
  }

  async changePassword(oldPassword, newPassword) {
    const login = (localStorage.getItem("nntu_auth_login") || "").toLowerCase();
    if (!login) {
      return { success: false, error: "Вы не авторизованы" };
    }
    if (!oldPassword) {
      return { success: false, error: "Пожалуйста, введите текущий пароль" };
    }
    if (!newPassword || newPassword.length < 4) {
      return { success: false, error: "Новый пароль должен содержать не менее 4 символов" };
    }
    if (oldPassword === newPassword) {
      return { success: false, error: "Новый пароль совпадает со старым" };
    }

    const savedPass = localStorage.getItem(`nntu_user_pass_${login}`);

    // Verify against local pass if known
    if (savedPass !== null && savedPass !== oldPassword) {
      return { success: false, error: "Неверный текущий пароль!" };
    }

    // Check and update in Firestore
    let cloudSynced = false;
    if (this.db && this.isInitialized) {
      try {
        const userRef = this.db.collection("users").doc(login);
        const doc = await userRef.get();
        if (doc.exists) {
          const data = doc.data();
          if (data.password && data.password !== oldPassword) {
            return { success: false, error: "Неверный текущий пароль!" };
          }
          await userRef.set({
            password: newPassword,
            updatedAt: (typeof firebase !== "undefined" && firebase.firestore?.FieldValue)
              ? firebase.firestore.FieldValue.serverTimestamp()
              : new Date().toISOString()
          }, { merge: true });
          cloudSynced = true;
        }
      } catch (err) {
        console.warn("Firestore password update notice (saved locally):", err);
      }
    }

    // Save locally
    localStorage.setItem(`nntu_user_pass_${login}`, newPassword);
    return { success: true, cloud: cloudSynced };
  }
}

window.FirebaseService = FirebaseService;
