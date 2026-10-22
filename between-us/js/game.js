(() => {
    'use strict';
    const app = document.getElementById('app');
    const $ = (s, root = document) => root.querySelector(s); const $$ = (s, root = document) => [...root.querySelectorAll(s)];

    const rootFirebaseConfig = window.FIREBASE_CONFIG;
    const legacyFirebaseConfig = window.BETWEEN_US_FIREBASE;
    const config = legacyFirebaseConfig || (rootFirebaseConfig ? { enabled: true, config: rootFirebaseConfig } : { enabled: false });
    const state = { screen: 'home', mode: null, roomCode: null, playerId: null, playerSlot: null, roomRef: null, roomData: null, roomUnsub: null, auth: null, db: null, online: false, sound: true, cinemaQueue: [], cinemaResolve: null, localRoom: null, chapterIndex: 0, sceneId: '', sceneHistory: [], storyPages: [], storyPageIndex: 0, storyChoices: {}, personal: { trust: 0, affection: 0, understanding: 0, compatibility: 0, clues: [] }, transcript: [], loggedScenes: {}, journalExpanded: false, foundEvidence: [], answerSubmitted: false, leavingRoom: false, disconnectHandler: null, replayWaiting: false, replayResetting: false };
    const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const code = () => { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let out = ''; for (let i = 0; i < 6; i++)out += chars[Math.floor(Math.random() * chars.length)]; return out };
    const SAVE_VERSION = 1;

    let firestoreDb = null;
    let auth = null;
    let rtdb = null;
    let baseRef = null;
    let pendingCode = null;
    let passResolve = null;
    let gateEl = null;
    let gateDismiss = null;
    let gateState = null;
    let exitModalEl = null;

    const GENERIC_ERR = "Something went wrong. Please try again.";
    const GOOGLE_G = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.18v3.14C3.17 21.36 7.23 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.62H1.18C.43 8.14 0 9.87 0 11.76s.43 3.62 1.18 5.14l4.09-3.14z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.23 0 3.17 2.64 1.18 6.62l4.09 3.14c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>`;
    const DEFAULTS = { theme: "space", notifyOn: false, notifyEvents: true, notifyTodos: true, notifyFlight: true, sound: true, notifSound: true, volume: .6, lite: false, pinD: null, pinP: null };

    function dbg(...args) { console.log("[Auth]", ...args); }
    function gate(state, o = {}) {
        if (!gateEl) {
            gateEl = document.createElement("div"); gateEl.className = "authgate hide"; document.body.appendChild(gateEl);
            gateEl.addEventListener("mousedown", e => { if (e.target === gateEl && gateDismiss) gateDismiss(); });
            document.addEventListener("keydown", e => { if (e.key === "Escape" && gateDismiss && gateEl && !gateEl.classList.contains("hide")) gateDismiss(); });
        }
        gateEl.classList.remove("hide"); gateState = state; gateDismiss = o.dismiss || null;
        const head = `<h1>Between <em>Us</em></h1>`, err = o.error ? `<div class="gate-err">${safe(o.error)}</div>` : "";
        const x = gateDismiss ? `<button class="gate-x ghost iconbtn" id="gClose" aria-label="Close">✕</button>` : "";
        
        if (state === "loading") gateEl.innerHTML = `<div class="gate-card"><div class="ll"><img class="base" src="assets/between_us.png" alt=""><img class="fill" src="assets/between_us.png" alt=""></div>${head}<p style="margin:0">${safe(o.text || "Loading…")}</p></div>`;
        else if (state === "signin") gateEl.innerHTML = `<div class="gate-card">${head}<p>${safe(o.text || "Sign in with Google to continue. Your game sessions and progress are saved to your account.")}</p><button class="gbtn" id="gSign">${GOOGLE_G}Continue with Google</button>${err}<p class="gate-alt">New here? <a href="#" id="gNew">Create an account</a></p></div>`;
        else if (state === "create") gateEl.innerHTML = `<div class="gate-card">${head}<p>Creating an account needs the access password. If you don't have it, ask the person who invited you.</p><label for="gPass" style="text-align:left;display:block;font-weight:600;font-size:.85rem;margin-bottom:.2rem;color:#b7a9e3">Access password</label><input type="password" id="gPass" class="gate-input" autocomplete="off" placeholder="Enter the password"><button class="gbtn" id="gGo" style="margin-top:.9rem">${GOOGLE_G}Continue with Google</button>${err}<p class="gate-alt"><a href="#" id="gBack">Back</a></p></div>`;
        else if (state === "password") gateEl.innerHTML = `<div class="gate-card">${head}<p>Welcome! To finish creating your account, enter the access password.</p><input type="password" id="gPass" class="gate-input" autocomplete="off" placeholder="Access password">${err}<div class="button-row" style="justify-content:center;margin-top:1rem"><button class="secondary-button" id="gCancel">Cancel</button><button class="primary-button" id="gOk">Create account</button></div></div>`;
        else gateEl.innerHTML = `<div class="gate-card">${head}<div class="gate-err" style="text-align:center">${safe(o.error || GENERIC_ERR)}</div><p style="margin-top:1rem"><button class="primary-button" id="gClose2">Close</button></p></div>`;

        const q = id => gateEl.querySelector("#" + id), on = (id, fn) => { const e = q(id); if (e) e.onclick = fn; };
        on("gClose", () => gateDismiss && gateDismiss()); on("gClose2", () => cancelAuth());
        on("gSign", () => startGoogle(null));
        on("gNew", e => { e.preventDefault(); gate("create", { dismiss: cancelAuth }); });
        on("gBack", e => { e.preventDefault(); gate("signin", { dismiss: cancelAuth }); });
        const pass = q("gPass");
        if (pass) { setTimeout(() => pass.focus(), 50); pass.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); (q("gGo") || q("gOk"))?.click(); } }); }
        on("gGo", () => { const v = pass.value; if (!v) { pass.focus(); return; } startGoogle(v); });
        on("gOk", () => { const v = pass.value; if (!v) { pass.focus(); return; } if (passResolve) passResolve(v); });
        on("gCancel", () => { if (passResolve) passResolve(null); });
    }

    function hideGate() { if (gateEl) gateEl.classList.add("hide"); }
    function cancelAuth() { hideGate(); if (auth && !auth.currentUser) { try { auth.signOut(); } catch {} } }

    async function askPassword(err) {
        return new Promise(resolve => {
            passResolve = resolve;
            gate("password", { error: err });
        });
    }

    async function startGoogle(code) {
        if (!auth) { gate("error", { dismiss: cancelAuth }); return; }
        pendingCode = code || null;
        if (code) sessionStorage.setItem('pendingCode', code);

        const prov = new firebase.auth.GoogleAuthProvider(); 
        prov.setCustomParameters({ prompt: "select_account" });
        gate("loading", { text: "Opening Google…" });
        
        const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
        try {
            if (standalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) { 
                await auth.signInWithRedirect(prov); 
                return; 
            }
            await auth.signInWithPopup(prov);
        } catch (e) {
            dbg("sign-in", e);
            if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(e.code)) { 
                try { 
                    await auth.signInWithRedirect(prov); 
                    return; 
                } catch (e2) { 
                    e = e2; 
                    dbg(e2); 
                } 
            }
            const back = code ? "create" : "signin";
            if (["auth/popup-closed-by-user"].includes(e.code)) gate(back, { dismiss: cancelAuth });
            else if (e.code === "auth/network-request-failed") gate(back, { dismiss: cancelAuth, error: "We couldn't reach Google. Check your connection and try again." });
            else gate(back, { dismiss: cancelAuth, error: GENERIC_ERR });
        }
    }

    async function createAccount(user, base) {
        const prof = {
            uid: user.uid,
            email: user.email || "",
            photoURL: user.photoURL || "",
            username: user.displayName || (user.email || "traveller").split("@")[0],
            createdAt: base.lastLoginAt,
            settings: { ...DEFAULTS },
            ...base
        };
        
        let code = pendingCode || sessionStorage.getItem('pendingCode');
        sessionStorage.removeItem('pendingCode');
        let err = "", tries = 0; 
        pendingCode = null;

        for (;;) {
            if (code == null) { 
                code = await askPassword(err); 
                if (code === null) throw { code: "cancelled" }; 
            }
            gate("loading", { text: "Creating your account…" });
            try { 
                await baseRef.set({ ...prof, inviteCode: code }); 
                break; 
            } catch (e) {
                if (e && e.code === "permission-denied") {
                    if (++tries >= 5) { toast("Too many attempts. Please try again later."); throw { code: "cancelled" }; }
                    err = "That password isn't right. Please try again."; 
                    code = null; 
                    continue;
                }
                throw e;
            }
        }
        baseRef.update({ inviteCode: firebase.firestore.FieldValue.delete() }).catch(() => {});
        return prof;
    }

    async function initFirebase() {
        if (state.db && auth) return true;
        const rawConfig = config.config || rootFirebaseConfig;
        if (!rawConfig || !rawConfig.apiKey || String(rawConfig.apiKey).includes('YOUR_API_KEY')) return false;
        if (!window.firebase) { toast('Firebase SDK could not load. Check your internet connection.'); return false; }
        try {
            const options = { ...rawConfig };
            if (!options.databaseURL && options.projectId) options.databaseURL = `https://${options.projectId}-default-rtdb.firebaseio.com`;
            if (!firebase.apps.length) firebase.initializeApp(options);
            
            auth = firebase.auth();
            await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            rtdb = firebase.database();
            firestoreDb = firebase.firestore();
            state.auth = auth;
            state.db = rtdb;
            
            try {
                await auth.getRedirectResult();
            } catch (err) {
                dbg("Redirect result error:", err);
            }

            await new Promise(resolve => {
                const unsubscribe = auth.onAuthStateChanged(user => {
                    unsubscribe();
                    if (user) {
                        baseRef = firestoreDb.collection("users").doc(user.uid);
                        state.online = true;
                        setConnection(true, 'Connected');
                    }
                    updateGlobalTopbarVisibility();
                    resolve();
                });
            });

            return true;
        } catch (e) { 
            console.error('Between Us Firebase init failed:', e); 
            state.db = null; 
            setConnection(false, 'Preview'); 
            return false; 
        }
    }

    function requireAuthModal() {
        return new Promise(async resolve => {
            if (!auth) await initFirebase();
            if (auth.currentUser) {
                baseRef = firestoreDb.collection("users").doc(auth.currentUser.uid);
                try {
                    await baseRef.update({ lastLoginAt: firebase.firestore.FieldValue.serverTimestamp() });
                } catch {}
                resolve(true);
                return;
            }
            gate("signin", { dismiss: () => { hideGate(); resolve(false); } });
            
            const unsubscribe = auth.onAuthStateChanged(async user => {
                if (user) {
                    unsubscribe();
                    baseRef = firestoreDb.collection("users").doc(user.uid);
                    try {
                        const snap = await baseRef.get();
                        if (!snap.exists) {
                            await createAccount(user, { lastLoginAt: firebase.firestore.FieldValue.serverTimestamp() });
                        } else {
                            await baseRef.update({ lastLoginAt: firebase.firestore.FieldValue.serverTimestamp() });
                        }
                        hideGate();
                        state.online = true;
                        setConnection(true, 'Connected');
                        updateGlobalTopbarVisibility();
                        resolve(true);
                    } catch (err) {
                        if (err && err.code !== "cancelled") {
                            gate("error", { error: GENERIC_ERR, dismiss: cancelAuth });
                        } else {
                            cancelAuth();
                        }
                        resolve(false);
                    }
                }
            });
        });
    }

    let saveTimeout;
    function getProgressKey() {
        if (!state.roomCode || !state.playerSlot) return null;
        return `betweenUs:progress:${state.roomCode}:${state.playerSlot}`;
    }
    function saveLocalProgress() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const key = getProgressKey();
            if (!key) return;

            const progress = {
                version: SAVE_VERSION,
                roomCode: state.roomCode,
                playerSlot: state.playerSlot,
                screen: state.screen || 'story',
                sceneId: state.sceneId || 'sep1_homeroom',
                storyPageIndex: state.storyPageIndex || 0,
                chapterIndex: state.chapterIndex || 0,
                storyPages: state.storyPages?.length ? state.storyPages : [{ sceneId: state.sceneId || 'sep1_homeroom', lineIndex: 0 }],
                storyChoices: state.storyChoices || {},
                updatedAt: Date.now()
            };

            try {
                localStorage.setItem(key, JSON.stringify(progress));
                localStorage.setItem('betweenUs:lastRoom', JSON.stringify({ roomCode: state.roomCode, playerSlot: state.playerSlot }));
            } catch (error) {
                console.error("Unable to save game progress:", error);
            }
        }, 150);
    }
    function loadLocalProgress() {
        const key = getProgressKey();
        if (!key) return null;

        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const progress = JSON.parse(raw);

            if (
                progress.version !== SAVE_VERSION ||
                progress.roomCode !== state.roomCode ||
                progress.playerSlot !== state.playerSlot
            ) {
                return null;
            }

            return progress;
        } catch (error) {
            console.error("Unable to load game progress:", error);
            return null;
        }
    }
    function clearLocalProgress() {
        const key = getProgressKey();
        if (key) localStorage.removeItem(key);
        localStorage.removeItem('betweenUs:lastRoom');
    }

    let floatingBadgeEl = null;
    function ensureFloatingBadge() {
        if (floatingBadgeEl) return;
        floatingBadgeEl = document.createElement('div');
        floatingBadgeEl.className = 'floating-user-badge hide';
        floatingBadgeEl.innerHTML = `
            <div class="connection-badge">
                <span class="connection-dot" id="connectionDot"></span>
                <span id="connectionLabel">Preview</span>
            </div>
            <button class="avatar" id="profileBtn" title="Account and settings" aria-label="Account and settings"><span>·</span></button>
        `;
        document.body.appendChild(floatingBadgeEl);

        const profileBtn = floatingBadgeEl.querySelector('#profileBtn');
        if (profileBtn) {
            profileBtn.onclick = openProfileModal;
        }
    }
    function updateGlobalTopbarVisibility() {
        ensureFloatingBadge();
        const user = auth?.currentUser;
        if (user) {
            floatingBadgeEl.classList.remove('hide');
            updateProfileAvatar();
        } else {
            floatingBadgeEl.classList.add('hide');
        }
    }
    function updateProfileAvatar() {
        ensureFloatingBadge();
        const btn = floatingBadgeEl?.querySelector('#profileBtn');
        if (!btn) return;
        const user = auth?.currentUser;
        if (user && user.photoURL) {
            btn.innerHTML = `<img src="${safe(user.photoURL)}" alt="" referrerpolicy="no-referrer">`;
        } else {
            const name = user?.displayName || user?.email || 'Traveller';
            const initial = name.trim().charAt(0).toUpperCase();
            btn.innerHTML = `<span>${safe(initial)}</span>`;
        }
    }
    function setConnection(online, label) { 
        ensureFloatingBadge();
        const dot = floatingBadgeEl?.querySelector('#connectionDot');
        const lbl = floatingBadgeEl?.querySelector('#connectionLabel');
        if (dot) dot.classList.toggle('online', !!online); 
        if (lbl) lbl.textContent = label; 
    }

    let profileModalEl = null;
    async function openProfileModal() {
        if (!auth || !auth.currentUser) {
            const authed = await requireAuthModal();
            if (!authed) return;
        }
        const user = auth.currentUser;
        if (!baseRef && user) {
            baseRef = firestoreDb.collection("users").doc(user.uid);
        }
        
        let currentUsername = user.displayName || (user.email || "traveller").split("@")[0];
        if (baseRef) {
            try {
                const snap = await baseRef.get();
                if (snap.exists && snap.data().username) {
                    currentUsername = snap.data().username;
                }
            } catch {}
        }

        if (!profileModalEl) {
            profileModalEl = document.createElement("div");
            profileModalEl.className = "authgate hide";
            document.body.appendChild(profileModalEl);
            profileModalEl.addEventListener("mousedown", e => {
                if (e.target === profileModalEl) closeProfileModal();
            });
            document.addEventListener("keydown", e => {
                if (e.key === "Escape" && profileModalEl && !profileModalEl.classList.contains("hide")) closeProfileModal();
            });
        }

        const volumeSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
        const currentVolume = Math.round((state.volume ?? 0.6) * 100);

        profileModalEl.classList.remove("hide");
        profileModalEl.innerHTML = `
        <div class="gate-card settings-card">
            <button class="gate-x ghost iconbtn" id="pClose" aria-label="Close">✕</button>
            <h2>Settings</h2>
            
            <div class="sec">
                <h3>Account</h3>
                <div class="acct">
                    <div class="avatar">
                        ${user.photoURL ? `<img src="${safe(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span>${safe(currentUsername.charAt(0).toUpperCase())}</span>`}
                    </div>
                    <div class="who">
                        <label for="modalUsername">Username</label>
                        <div class="row">
                            <input id="modalUsername" class="text-input grow" maxlength="30" value="${safe(currentUsername)}">
                            <button class="secondary-button" id="saveUsername">Save</button>
                        </div>
                    </div>
                </div>
                <div class="setrow">
                    <div>
                        <b>User ID</b>
                        <div class="copy">${safe(user.uid)}</div>
                    </div>
                    <button class="secondary-button" id="copyUserId">Copy</button>
                </div>
                <div class="setrow">
                    <div>
                        <b>Signed in with Google</b>
                        <div class="muted">${safe(user.email || '')}</div>
                    </div>
                    <button class="secondary-button danger" id="modalSignOut">Sign out</button>
                </div>
            </div>

            <div class="sec">
                <h3>Audio & Music</h3>
                <div class="volrow">
                    ${volumeSvg}
                    <input type="range" id="volRange" min="0" max="100" step="5" value="${currentVolume}" aria-label="Volume">
                    <output id="volOut">${currentVolume}%</output>
                </div>
                <div class="setrow">
                    <div>
                        <b>Sound Effects</b>
                        <div class="muted">Toggle game audio feedback</div>
                    </div>
                    <button class="secondary-button" id="modalSoundToggle" style="display:inline-flex;align-items:center;gap:6px;">${volumeSvg} <span>${state.sound ? 'Sound: On' : 'Sound: Off'}</span></button>
                </div>
            </div>
        </div>
        `;

        const q = id => profileModalEl.querySelector("#" + id);
        const pClose = q("pClose"); if (pClose) pClose.onclick = closeProfileModal;
        
        const saveUsername = q("saveUsername");
        if (saveUsername) {
            saveUsername.onclick = async () => {
                const newName = q("modalUsername").value.trim();
                if (!newName) return;
                try {
                    if (baseRef) await baseRef.set({ username: newName }, { merge: true });
                    if (auth.currentUser) await auth.currentUser.updateProfile({ displayName: newName });
                    updateProfileAvatar();
                    toast('Username updated successfully.');
                } catch (e) {
                    console.error(e);
                    toast('Could not update username.');
                }
            };
        }

        const copyUserId = q("copyUserId");
        if (copyUserId) {
            copyUserId.onclick = () => {
                if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(user.uid).then(() => toast('User ID copied.')).catch(() => toast('User ID: ' + user.uid));
                } else {
                    toast('User ID: ' + user.uid);
                }
            };
        }

        const modalSignOut = q("modalSignOut");
        if (modalSignOut) {
            modalSignOut.onclick = async () => {
                closeProfileModal();
                try { await auth.signOut(); } catch {}
                location.reload();
            };
        }

        const modalSoundToggle = q("modalSoundToggle");
        if (modalSoundToggle) {
            modalSoundToggle.onclick = () => {
                state.sound = !state.sound;
                modalSoundToggle.innerHTML = `${volumeSvg} ${state.sound ? 'Sound: On' : 'Sound: Off'}`;
                toast(state.sound ? 'Sound effects enabled.' : 'Sound muted.');
            };
        }

        const volRange = q("volRange");
        const volOut = q("volOut");
        if (volRange && volOut) {
            volRange.oninput = () => {
                state.volume = volRange.value / 100;
                volOut.textContent = volRange.value + "%";
            };
        }
    }

    function closeProfileModal() {
        if (profileModalEl) profileModalEl.classList.add("hide");
    }

    let toastTimer;
    function toast(message) {
        const el = $('#toast');
        el.innerHTML = `<span class="toast-icon">✦</span><span>${safe(message)}</span><div class="toast-progress"></div>`;
        el.classList.remove('show');
        void el.offsetWidth;

        el.classList.add('show');
        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            el.classList.remove('show');
        }, 3200);
    }
    function setConnection(online, label) { $('#connectionDot').classList.toggle('online', !!online); $('#connectionLabel').textContent = label }

    function setScreen(screen) {
        const isScreenChanged = state.screen !== screen;
        state.screen = screen;
        const isGame = ['starting', 'storyIntro', 'story', 'ending', 'detective', 'detectiveEnding'].includes(screen);
        document.body.classList.toggle('home-screen', screen === 'home');
        document.body.classList.toggle('lobby-screen', screen === 'lobby');
        document.body.classList.toggle('waiting-screen', screen === 'waiting');
        document.body.classList.toggle('game-screen', isGame);
        if (isScreenChanged) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function footer() { return '<div class="footer-note">BETWEEN US · PROJECT 23 · DEV BUILD v0.1</div>' }
    
    function assetPath(kind, key) {
        if (kind === 'character') {
            const name = String(key || '').replace(/(^|[-_ ])([a-z])/g, (_, sep, ch) => ch.toUpperCase()).replace(/\s+/g, '');
            return `assets/Characters/${name}.png`;
        }
        return `assets/Backgrounds/${key}.png`;
    }

    function preloadStoryAssets() {
        const chapters = window.BU_STORY?.mainChapters || [];
        const assetsToPreload = new Set();
        assetsToPreload.add(assetPath('background', 'game-screen'));

        chapters.forEach((_, index) => { assetsToPreload.add(`assets/Backgrounds/chapter-${index + 1}.png`); });
        chapters.forEach(chapter => { chapter.scenes.forEach(scene => { assetsToPreload.add(assetPath('background', scene.id)); }); });

        ['Ren', 'Yui', 'Kai', 'Hana', 'Mei', 'Narrator', 'Detective-Female'].forEach(char => { assetsToPreload.add(assetPath('character', char)); });

        assetsToPreload.forEach(src => {
            const img = new Image();
            img.loading = 'eager';
            img.fetchPriority = 'high';
            img.src = src;
        });
    }

    function wireSceneAssets(scene, speakerKey) {
        const stage = $('.vn-stage');
        if (!stage) return;

        const bgSrc = assetPath('background', scene.id);
        const characterKey = speakerKey === 'narrator' ? 'Narrator' : String(speakerKey || '').charAt(0).toUpperCase() + String(speakerKey || '').slice(1);
        const spriteSrc = assetPath('character', characterKey);

        let bg = stage.querySelector('.vn-background-image');
        if (!bg || bg.dataset.src !== bgSrc) {
            if (bg) bg.remove();
            bg = document.createElement('img');
            bg.className = 'vn-background-image';
            bg.alt = '';
            bg.setAttribute('aria-hidden', 'true');
            bg.loading = 'eager';
            bg.fetchPriority = 'high';
            bg.dataset.src = bgSrc;
            bg.onload = () => {
                stage.classList.add('background-asset-ready');
                stage.classList.remove('background-fallback');
            };
            bg.onerror = () => {
                bg.remove();
                if (scene.id !== 'fallback-screen') {
                    const alt = document.createElement('img');
                    alt.className = 'vn-background-image';
                    alt.alt = '';
                    alt.setAttribute('aria-hidden', 'true');
                    alt.loading = 'eager';
                    alt.onload = () => stage.classList.add('background-asset-ready');
                    alt.onerror = () => { alt.remove(); stage.classList.add('background-fallback'); };
                    alt.src = assetPath('background', 'fallback-screen');
                    stage.prepend(alt);
                } else {
                    stage.classList.add('background-fallback');
                }
            };
            bg.src = bgSrc;
            if (bg.complete && bg.naturalWidth) {
                stage.classList.add('background-asset-ready');
            }
            stage.prepend(bg);
        } else {
            stage.classList.add('background-asset-ready');
        }

        const characterContainer = stage.querySelector('.vn-character');
        if (characterContainer) {
            let sprite = characterContainer.querySelector('.vn-character-image');
            if (!sprite || sprite.dataset.src !== spriteSrc) {
                if (sprite) sprite.remove();
                sprite = document.createElement('img');
                sprite.className = 'vn-character-image';
                sprite.alt = '';
                sprite.setAttribute('aria-hidden', 'true');
                sprite.loading = 'eager';
                sprite.fetchPriority = 'high';
                sprite.dataset.src = spriteSrc;
                sprite.onload = () => {
                    stage.classList.add('character-asset-ready');
                };
                sprite.onerror = () => {
                    sprite.remove();
                };
                sprite.src = spriteSrc;
                if (sprite.complete && sprite.naturalWidth) {
                    stage.classList.add('character-asset-ready');
                }
                characterContainer.appendChild(sprite);
            } else {
                stage.classList.add('character-asset-ready');
            }
        }
    }

    function hydrateAssets(root = document) {
        root.querySelectorAll('img[data-asset-kind]').forEach(img => {
            if (img.dataset.assetHydrated) return;
            img.dataset.assetHydrated = '1';
            const kind = img.dataset.assetKind;
            const key = kind === 'title' ? 'title-screen' : img.dataset.assetKey;
            img.loading = 'eager';
            img.fetchPriority = 'high';
            img.addEventListener('load', () => img.classList.add('asset-loaded'));
            img.addEventListener('error', () => {
                img.classList.add('asset-unavailable');
            }, { once: true });
            img.src = assetPath(kind === 'title' ? 'background' : kind, key);
            if (img.complete && img.naturalWidth) {
                img.classList.add('asset-loaded');
            }
        });
    }

    function home() {
        setScreen('home'); app.innerHTML = `
        <section class="title-screen slide-in">
            <a href="../../index.html" class="home-corner-button" aria-label="Back to main website">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                   <line x1="19" y1="12" x2="5" y2="12"></line>
                   <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span>Website</span>
            </a>
            <div class="title-screen-art" aria-hidden="true"><img class="title-art-image" data-asset-kind="title" data-asset-key="title" alt=""><div class="title-art-fallback"><div class="title-sun"></div><div class="title-skyline"></div><div class="title-campus"></div><div class="title-silhouette title-ren"><span></span></div><div class="title-silhouette title-yui"><span></span></div></div><div class="title-art-vignette"></div></div>
            <div class="title-screen-content"><div class="title-kicker"><span></span> A TWO-PLAYER ROMANCE <span></span></div><h1 class="game-logo">Between <em>Us</em></h1><p class="game-description">Two players. Two perspectives. One connected story.</p>
                <div class="mode-select-title">CHOOSE YOUR STORY</div>
               <div class="title-mode-grid">
                   <button class="title-mode-card mode-first-person" data-mode="main"><span class="mode-art"><img data-asset-kind="character" data-asset-key="ren" alt=""><span class="mode-art-fallback mode-ren"><i></i></span><span class="mode-art-caption">01 / FIRST PERSON</span></span><span class="mode-card-copy"><span class="mode-card-eyebrow">LIVE THE STORY</span><strong>Main Characters</strong><span class="mode-card-description">Experience the romance yourself. Choose your words, build trust, and decide how the semester unfolds.</span><span class="mode-card-enter">Begin <b><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg></b></span></span></button>
                   <button class="title-mode-card mode-third-person" data-mode="detective" disabled aria-disabled="true"><span class="mode-art"><img data-asset-kind="character" data-asset-key="Detective-Female" alt=""><span class="mode-art-fallback mode-detective"><i></i><i></i></span><span class="mode-art-caption">02 / THIRD PERSON</span></span><span class="mode-card-copy"><span class="mode-card-eyebrow">PLAY CUPID</span><strong>Detectives</strong><span class="mode-card-description">Solve romantic puzzles, connect the clues, and help two hearts find each other.</span><span class="mode-card-enter">Coming soon <b>✦</b></span></span></button>
               </div>
               <div class="title-footer"><span>HOSHINOMIYA ACADEMY</span><span>SEPTEMBER — DECEMBER</span></div>
            </div>
        </section>`;
        hydrateAssets(app);
        $$('[data-mode]').forEach(b => b.onclick = async () => {
            const authed = await requireAuthModal();
            if (!authed) return;
            chooseMode(b.dataset.mode);
        });
    }

    function howToPlay() { app.innerHTML = `<div class="page-head slide-in"><div><span class="eyebrow">QUICK START</span><h1 class="page-title">How to play</h1><p class="page-subtitle">Between Us is designed for two people on two devices. Create a room, invite your friend, choose a mode, and work together. The game intentionally keeps some clues separate so you have to talk.</p></div><button class="secondary-button" id="backHome">← Back home</button></div><div class="feature-strip"><div class="feature"><span class="feature-icon">01</span><strong>Create or join a room</strong><p>One player creates a room and shares the code. The second player joins with that code.</p></div><div class="feature"><span class="feature-icon">02</span><strong>Keep your screens different</strong><p>Read your own clues and decisions carefully. Don't assume your partner sees the same information.</p></div><div class="feature"><span class="feature-icon">03</span><strong>Communicate outside the game</strong><p>Use a call, in-person conversation, or your preferred messaging app to exchange clues.</p></div></div><div class="panel" style="margin-top:16px"><h3>Demo and online mode</h3><p>Without Firebase configuration, this page runs as a local demo in one browser. For two separate devices, configure Firebase Authentication and Realtime Database using the included setup guide and security rules.</p><button class="primary-button" id="goLobby">Set up a room <span>→</span></button></div>${footer()}`; $('#backHome').onclick = home; $('#goLobby').onclick = () => chooseMode(); }
    function chooseMode(preselected) { setScreen('mode'); app.innerHTML = `<div class="page-head slide-in"><div><span class="eyebrow">STEP 01 / YOUR STORY</span><h1 class="page-title">Choose a mode.</h1><p class="page-subtitle">Your room will stay in this mode for the session. You can create a new room to try the other story.</p></div><button class="secondary-button" id="backHome">← Back home</button></div><div class="mode-grid"><button class="mode-card" data-mode="main"><div class="mode-top"><span class="mode-icon">♡</span><span class="mode-number">ROMANCE · BRANCHING STORY</span></div><h3>Main Characters</h3><p>Become one of the leads, navigate a new semester, and decide which relationships you want to build.</p><div class="mode-foot"><span>Select this mode</span><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"> <line x1="7" y1="17" x2="17" y2="7"></line> <polyline points="7 7 17 7 17 17"></polyline> </svg></span></div></button><button class="mode-card detective" disabled aria-disabled="true"><div class="mode-top"><span class="mode-icon">♡</span><span class="mode-number">COMING LATER</span></div><h3>Detectives</h3><p>A separate romantic puzzle mode where players piece together clues about Ren and Yui’s growing relationship.</p><div class="mode-foot"><span>In development</span><span>◌</span></div></button></div>${footer()}`; $('#backHome').onclick = home; $$('[data-mode]').forEach(b => b.onclick = () => lobby(b.dataset.mode)); if (preselected) lobby(preselected) }
    function lobby(mode) {
        state.mode = mode; setScreen('lobby'); const modeName = mode === 'main' ? 'Main Characters' : 'Detectives'; app.innerHTML = `<div class="meet-page slide-in"><div class="meet-heading"><span class="eyebrow">A LITTLE SPACE FOR TWO</span><h1>Meet me <em>here.</em></h1><p>Make a room for your story, or join someone who’s already waiting.</p><button class="secondary-button meet-back" id="backModes">Change Mode</button></div><div class="meet-layout"><section class="meet-card create-card"><div class="meet-card-icon">✦</div><span class="eyebrow">START SOMETHING</span><h2>Create a room</h2><p>You’ll be <b>Player One</b>, the host. Create a room to begin.</p><div class="meet-role"><span class="role-orbit">01</span><span><strong>Player One</strong><small>Room host</small></span><span class="role-status">YOU</span></div><button class="primary-button meet-action" id="createRoom">Create room <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"> <line x1="7" y1="17" x2="17" y2="7"></line> <polyline points="7 7 17 7 17 17"></polyline> </svg></span></button></section><section class="meet-card join-card"><div class="meet-card-icon">⌁</div><span class="eyebrow">CONTINUE TOGETHER</span><h2>Join a room</h2><p>You’ll be <b>Player Two</b>. Enter the six-character code from your host.</p><div class="meet-role"><span class="role-orbit guest">02</span><span><strong>Player Two</strong><small>Guest player</small></span><span class="role-status muted-status">INVITED</span></div><label class="field-label" style="margin-left:8px;" for="joinCode">Room code</label><div class="field-row"><input class="text-input" id="joinCode" maxlength="6" placeholder="ABC123" autocomplete="off" aria-label="Six-character room code"><button class="primary-button" id="joinRoom">Join <span>→</span></button></div></section></div><div class="meet-bottom"><span>BETWEEN US · TWO PERSPECTIVES, ONE STORY</span><button class="preview-link" id="soloDemo">Test Local Preview <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"> <line x1="7" y1="17" x2="17" y2="7"></line> <polyline points="7 7 17 7 17 17"></polyline> </svg></span></button></div></div>`;
        $('#backModes').onclick = home; $('#createRoom').onclick = createRoom; $('#joinRoom').onclick = joinRoom; $('#soloDemo').onclick = () => startLocalDemo(); $('#joinCode').addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
    }

    function attachRoomListener(ref) {
        if (state.roomRef && state.roomUnsub) state.roomUnsub();
        state.roomRef = ref;
        const handler = snap => {
            if (!snap.exists()) {
                if (state.online && state.roomCode && !state.leavingRoom) handleRoomRemoved();
                return;
            }
            const next = snap.val();
            if (!next?.public) return;
            const previous = state.roomData?.public?.status;
            state.roomData = next;
            if (state.screen === 'waiting') {
                if (next.public.status === 'playing' && previous !== 'playing') launchFromRoom();
                else renderWaiting();
            } else if (state.screen === 'story') renderStory();
            else if (state.screen === 'ending') { const votes = next.public.replayVotes || {}; const done = next.public.completed || {}; if (state.replayWaiting && !votes.host && !votes.guest && done.host !== true && done.guest !== true && !state.replayResetting) { state.replayWaiting = false; startStory() } else if (votes.host === true && votes.guest === true && state.playerSlot === 'host' && !state.replayResetting) { resetReplaySession() } else renderEnding(); }
            else if (state.screen === 'detective') renderDetective();
        };
        state.disconnectHandler = handler;
        ref.on('value', handler, error => { console.error('Room listener failed:', error); toast('Lost access to this room. Check the Firebase rules.') });
        state.roomUnsub = () => ref.off('value', handler);
    }

    async function createRoom() {
        const button = $('#createRoom');
        if (button) { button.disabled = true; button.innerHTML = 'Signing in…'; }

        const authed = await requireAuthModal();
        if (!authed) {
            if (button) { button.disabled = false; button.innerHTML = 'Create room <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"> <line x1="7" y1="17" x2="17" y2="7"></line> <polyline points="7 7 17 7 17 17"></polyline> </svg></span>'; }
            return;
        }

        if (button) { button.innerHTML = 'Creating room…'; }
        const uid = state.auth.currentUser.uid;

        const name = 'Player One';
        let roomCode = '', roomRef = null, created = false;
        try {
            for (let attempt = 0; attempt < 5 && !created; attempt++) {
                roomCode = code(); roomRef = state.db.ref('rooms/' + roomCode);
                const room = { public: { code: roomCode, mode: state.mode, status: 'waiting', hostUid: uid, guestUid: '', hostName: name, guestName: '', createdAt: Date.now(), chapter: 0, sceneId: '', choices: {}, ready: { host: true, guest: false }, shared: {}, updatedAt: Date.now() } };
                const result = await roomRef.transaction(current => current === null ? room : undefined);
                created = !!result.committed;
            }
            if (!created) throw new Error('Could not allocate a unique room code. Please retry.');
            state.roomCode = roomCode; state.playerId = uid; state.playerSlot = 'host'; state.mode = state.mode || state.roomData?.public?.mode;
            saveLocalProgress();
            attachRoomListener(roomRef);
            state.roomData = (await roomRef.once('value')).val(); state.screen = 'waiting'; renderWaiting();
        } catch (e) { console.error('Create room failed:', e); if (button) { button.disabled = false; button.innerHTML = 'Create room <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"> <line x1="7" y1="17" x2="17" y2="7"></line> <polyline points="7 7 17 7 17 17"></polyline> </svg></span>'; } toast(e.message?.includes('permission') ? 'Firebase denied room creation. Update the Realtime Database rules.' : 'Could not create room.') }
    }

    async function joinRoom() {
        const button = $('#joinRoom');
        const roomCode = ($('#joinCode')?.value || '').trim().toUpperCase();
        const name = 'Player Two';
        
        if (roomCode.length !== 6) { if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; } toast('Enter the six-character room code.'); return; }

        if (button) { button.disabled = true; button.innerHTML = 'Signing in…'; }

        const authed = await requireAuthModal();
        if (!authed) {
            if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; }
            return;
        }

        if (button) { button.innerHTML = 'Joining…'; }
        const uid = state.auth.currentUser.uid;
        const ref = state.db.ref('rooms/' + roomCode);

        try {
            const snap = await ref.child('public').once('value');
            if (!snap.exists()) { if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; } toast('Room not found. Check the code with your friend.'); return; }
            const initial = snap.val();
            if (initial.hostUid === uid) { if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; } toast('You are already the host of this room.'); return; }
            if (initial.guestUid && initial.guestUid !== uid) { if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; } toast('This room already has a second player.'); return; }
            if (initial.status !== 'waiting' && initial.guestUid !== uid) { if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; } toast('This room has already started.'); return; }
            const claim = await ref.child('public/guestUid').transaction(current => {
                if (current === uid) return current;
                if (current === null || current === '') return uid;
                return undefined;
            });
            if (!claim.committed || claim.snapshot.val() !== uid) {
                if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; }
                toast('This room was claimed by another player just now.'); return;
            }
            await ref.child('public').update({ guestName: name, 'ready/guest': true, updatedAt: firebase.database.ServerValue.TIMESTAMP });
            state.mode = initial.mode; state.roomCode = roomCode; state.playerId = uid; state.playerSlot = 'guest';
            saveLocalProgress();
            attachRoomListener(ref);
            state.roomData = (await ref.once('value')).val(); state.screen = 'waiting'; renderWaiting();
        } catch (e) {
            console.error('Join room failed:', e);
            if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; }
            toast('Could not join this room.');
        }
    }

    function renderWaiting() { 
        setScreen('waiting'); 
        const r = state.roomData?.public || {};
        app.innerHTML = `<div class="waiting-page slide-in"><div class="waiting-heading"><span class="eyebrow">YOUR PRIVATE LITTLE WORLD</span><h1>Waiting for<br><em>your person.</em></h1><p>One more person, and your story can begin.</p></div><section class="waiting-card"><div class="waiting-card-top"><div><span class="eyebrow">ROOM CODE</span><div class="room-code">${safe(state.roomCode)}</div><p class="waiting-hint">Send this code to your Player Two.</p></div><div class="waiting-tools"><button class="icon-button" id="copyCode" title="Copy room code" aria-label="Copy room code">⧉</button><button class="icon-button" id="refreshRoom" title="Refresh status" aria-label="Refresh room status">↻</button></div></div><div class="waiting-divider"></div><div class="waiting-players"><div class="waiting-person"><div class="waiting-avatar host-avatar"><span>01</span><i></i></div><div><small>HOST</small><strong>Player One</strong><span class="status-pill ready">● Connected</span></div></div><div class="waiting-connector"><span>♡</span><i></i></div><div class="waiting-person"><div class="waiting-avatar guest-avatar"><span>02</span><i class="${r.guestUid ? 'online' : ''}"></i></div><div><small>GUEST</small><strong>Player Two</strong><span class="status-pill ${r.guestUid ? 'ready' : ''}">${r.guestUid ? '● Connected' : '○ Waiting to join'}</span></div></div></div><div class="waiting-note ${r.guestUid ? 'both-ready' : ''}"><span class="waiting-note-icon">${r.guestUid ? '♡' : '◌'}</span><p>${r.guestUid ? 'You’re both here. Get comfortable, then start the story together.' : 'Your room is ready. As soon as Player Two joins, the next chapter is yours.'}</p></div><div class="waiting-actions"><button class="primary-button" id="startSession" ${r.guestUid ? '' : 'disabled'}>${r.guestUid ? 'Begin together' : 'Waiting for Player Two…'} <span>→</span></button><button class="secondary-button" id="leaveRoom">Leave room</button></div></section></div>`;
        $('#copyCode').onclick = () => {
            if (navigator.clipboard?.writeText)
                navigator.clipboard.writeText(state.roomCode).then(() => toast('Room code copied.')).catch(() => toast('Your room code is ' + state.roomCode));
            else
                toast('Your room code is ' + state.roomCode) };
            
        $('#refreshRoom').onclick = async () => {
            if (state.roomRef) {
                state.roomData = (await state.roomRef.once('value')).val();
                renderWaiting() 
            }
        };
        $('#leaveRoom').onclick = leaveRoom;
        $('#startSession').onclick = startOnlineGame;
    }

    async function leaveRoom() {
        const ref = state.roomRef, wasOnline = state.online;
        clearLocalProgress();
        state.leavingRoom = true;
        try {
            if (ref && wasOnline) {
                try { await ref.onDisconnect().cancel() } catch (e) { }
                await ref.remove();
            }
        } catch (e) { console.error('Leave room cleanup failed:', e); } finally {
            if (state.roomUnsub) state.roomUnsub();
            state.roomRef = null; state.roomData = null; state.roomCode = null; state.playerSlot = null; state.playerId = null; state.roomUnsub = null; state.disconnectHandler = null; state.leavingRoom = false;
            home();
        }
    }

    function handleRoomRemoved() {
        if (state.roomUnsub) state.roomUnsub();
        state.roomRef = null; state.roomData = null; state.roomCode = null; state.playerSlot = null; state.playerId = null; state.roomUnsub = null; state.disconnectHandler = null;
        state.online = false; setConnection(false, 'Preview');
        clearLocalProgress();
        toast('The other player left and this room was closed.');
        home();
    }

    function startLocalDemo() { state.online = false; state.roomCode = 'LOCAL'; state.playerId = 'local-player'; state.playerSlot = 'host'; state.roomData = { public: { mode: state.mode || 'main', hostName: 'You', guestName: 'Demo Partner', guestUid: 'demo', status: 'playing', chapter: 0, sceneId: '', choices: {}, shared: {}, ready: { host: true, guest: true } } }; setConnection(false, 'Preview'); preloadStoryAssets(); if (state.mode === 'detective') startDetective(); else startStory() }
    async function startOnlineGame() { if (!state.roomRef) { toast('Room connection is missing.'); return } state.screen = 'starting'; try { await state.roomRef.child('public/status').set('playing'); launchFromRoom() } catch (e) { state.screen = 'waiting'; toast('Could not start the session. Check database rules.') } }
    function launchFromRoom() { preloadStoryAssets(); if (state.mode === 'detective') startDetective(); else startStory() }

    async function updatePublic(path, value) { if (state.online && state.roomRef) { try { await state.roomRef.child('public/' + path).set(value) } catch (e) { console.error(e); toast('Could not sync that action. Check database rules.') } } else if (state.roomData) { const keys = path.split('/'); let target = state.roomData.public; for (let i = 0; i < keys.length - 1; i++)target = target[keys[i]] || (target[keys[i]] = {}); target[keys[keys.length - 1]] = value } }
    async function updateShared(path, value) { if (state.online && state.roomRef) { try { await state.roomRef.child('public/shared/' + path).set(value) } catch (e) { console.error(e); toast('Could not sync progress.') } } else { state.roomData.public.shared = state.roomData.public.shared || {}; const keys = path.split('/'); let target = state.roomData.public.shared; for (let i = 0; i < keys.length - 1; i++)target = target[keys[i]] || (target[keys[i]] = {}); target[keys[keys.length - 1]] = value } }

    function findSceneInfo(id) {
        for (let i = 0; i < window.BU_STORY.mainChapters.length; i++) {
            const chapter = window.BU_STORY.mainChapters[i];
            const scene = chapter.scenes.find(item => item.id === id);
            if (scene) return { chapter, scene, chapterIndex: i };
        }
        return null;
    }

    function sceneById(id) { return findSceneInfo(id)?.scene || null }
    function getProjectDecision() { return state.roomData?.public?.projectDecision || {} }

    function projectOutcomeText() {
        const d = getProjectDecision();
        if (d.result === 'ren-yui') {
            const approach = d.hostChoice?.approach;
            const tone = approach === 'direct' ? 'You tell Yui honestly that you would like to get to know her better.' : approach === 'playful' ? 'You hide a little of your nerves behind a joke, and Yui answers with a smile.' : 'You ask Yui casually, trying to make it feel like a simple question even though you care about the answer.';
            return state.playerSlot === 'guest' ? 'Ren asks you to work with him. You decide to accept. The decision is small on paper—one project partner—but it gives you a reason to spend time together, notice each other’s habits, and discover what might be there beyond the classroom.' : `${tone} She agrees to work with you. It is only a project, you tell yourself, but you are already wondering what it will be like to spend more time with her.`;
        }
        if (d.result === 'yui-asked-ren-accepted') {
            const approach = d.guestChoice?.approach;
            const tone = approach === 'direct' ? 'You tell Ren directly that you would like to work with him.' : approach === 'playful' ? 'You make a joke to soften the question, then wait for his answer.' : 'You ask Ren casually, giving him room to say no without making the moment too heavy.';
            return state.playerSlot === 'guest' ? `${tone} Ren agrees, and the relief you feel is warmer than you expected. Hana gives you an exaggerated thumbs-up from across the room.` : 'Yui asks whether you would reconsider. You decide to work with her after all. Kai pretends not to be disappointed; Mei simply tells you to make sure the choice is one you can stand behind.';
        }
        if (d.result === 'ren-invited-yui-declined') return state.playerSlot === 'guest' ? 'You decide to work with Hana. Ren’s invitation was kind, but you are not ready to take that step—or you simply feel this project is a better fit with your friend. You can still get to know Ren at your own pace.' : 'You asked Yui, but she chose to work with Hana. The disappointment is small but real. You decide to respect her choice and make the best of the project with someone else.';
        if (d.result === 'separate') return state.playerSlot === 'guest' ? 'You and Ren choose different partners. It is not a rejection of a friendship that has barely begun; it is simply the choice that feels right today. There will be other chances to talk.' : 'You and Yui choose different partners. You have no way of knowing what might have happened otherwise, and that is all right. The semester is long, and one decision does not define every connection.';
        return 'The project groups begin to form. A small decision has been made, and the semester carries on.';
    }

    function projectDecisionMarkup() {
        const d = getProjectDecision();
        let optionIndex = 0; const btn = (key, label, detail = '') => `<button class="choice-button" data-project-choice="${safe(key)}"><span class="choice-letter">${String.fromCharCode(65 + optionIndex++)}</span><span>${safe(label)}${detail ? `<small class="project-choice-detail">${safe(detail)}</small>` : ''}</span><span class="vn-choice-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"> <line x1="7" y1="17" x2="17" y2="7"></line> <polyline points="7 7 17 7 17 17"></polyline> </svg></span></button>`;
        let heading = 'MAJOR DECISION · PROJECT PARTNER', intro = 'Choose who you will work with. This changes the time and conversations available, but it does not decide the final ending by itself.', options = '';
        if (state.playerSlot === 'host') {
            if (!d.hostChoice) {
                intro = 'Kai and Mei have both asked you. You can accept either invitation, or approach Yui yourself.';
                options = btn('host:kai', 'Accept Kai’s invitation', 'Familiar, relaxed, and easy to work with.') + btn('host:mei', 'Accept Mei’s invitation', 'A practical partnership with clear plans.') + btn('host:yui:casual', 'Ask Yui casually', 'Keep it light: “Want to work together?”') + btn('host:yui:direct', 'Ask Yui directly', 'Be honest that you would like to get to know her better.') + btn('host:yui:playful', 'Ask Yui with a joke', 'Use humor to make the question less intimidating.');
            } else if (d.hostChoice.partner === 'yui' && !d.guestChoice) { heading = 'WAITING FOR YUI'; intro = 'You have asked Yui to work with you. She gets to make her own decision.'; options = '<div class="notice project-waiting">Your invitation has been sent. You cannot choose her answer for her.</div>' }
            else if (d.hostChoice.partner !== 'yui' && d.guestChoice?.partner === 'ren' && !d.hostFinal) { heading = 'YUI HAS ASKED YOU'; intro = 'You already accepted another invitation. Do you want to keep that plan, or reconsider?'; options = btn('hostfinal:yui', 'Accept Yui’s request', 'Change your project partner and take the chance.') + btn('hostfinal:stay', 'Stay with ' + (d.hostChoice.partner === 'kai' ? 'Kai' : 'Mei'), 'Keep the commitment you already made.'); }
            else if (!d.result) { heading = 'WAITING FOR YUI'; intro = 'Your choice is in. The project groups will settle once Yui has made her decision.'; options = '<div class="notice project-waiting">Waiting for the other perspective to make a choice.</div>' }
            else { heading = 'DECISION MADE'; intro = 'Your project group has been settled.'; options = '<div class="notice">Your choice has been recorded. Continue to see how the first project meeting feels.</div>' }
        } else {
            if (!d.hostChoice) { heading = 'A MOMENT TO DECIDE'; intro = 'Ren has not made his choice yet. Hana is waiting for your answer, and you still have time to decide whether to ask Ren.'; options = '<div class="notice project-waiting">Waiting for the classroom to settle. You will see the available choices once Ren has made his decision.</div>' }
            else if (d.hostChoice.partner === 'yui' && !d.guestChoice) { heading = 'REN HAS ASKED YOU'; intro = 'You can accept his invitation or choose to work with Hana. Neither answer is owed to anyone.'; options = btn('guest:accept', 'Accept Ren’s invitation', 'You are curious about what spending time together might be like.') + btn('guest:hana', 'Choose Hana', 'Stay with the friend you know and trust.'); }
            else if (d.hostChoice.partner !== 'yui' && !d.guestChoice) { heading = 'YOUR TURN'; intro = 'Ren has chosen another direction for now. You can ask him yourself, or make a plan with Hana.'; options = btn('guest:ren:casual', 'Ask Ren casually', 'Make it sound like a simple project question.') + btn('guest:ren:direct', 'Ask Ren directly', 'Tell him you would like to work together.') + btn('guest:ren:playful', 'Ask Ren with a joke', 'Use a little humor to make the risk easier.') + btn('guest:hana', 'Choose Hana', 'Keep the project comfortable and familiar.'); }
            else if (!d.result) { heading = 'WAITING FOR REN'; intro = 'Your choice is in. Ren has to decide whether to accept your request or keep his original plan.'; options = '<div class="notice project-waiting">You have made your decision. The next step is his.</div>' }
            else { heading = 'DECISION MADE'; intro = 'Your project group has been settled.'; options = '<div class="notice">Your choice has been recorded. Continue to see how the first project meeting feels.</div>' }
        }
        return `<div class="vn-choice-reveal"><div class="vn-choice-heading"><span class="eyebrow">${safe(heading)}</span><p>${safe(intro)}</p></div><div class="choice-list">${options}</div></div>`;
    }

    async function submitProjectChoice(key) {
        const d = { ...getProjectDecision() };
        if (key.startsWith('host:')) {
            if (d.hostChoice) return;
            const bits = key.split(':');
            d.hostChoice = bits[1] === 'yui' ? { partner: 'yui', approach: bits[2] } : { partner: bits[1], approach: 'accepted-invitation' };
            if (!state.online) {
                d.guestChoice = d.hostChoice.partner === 'yui' ? { partner: 'ren', approach: 'accepted-invitation' } : { partner: 'hana', approach: 'accepted-hana' };
            }
        } else if (key.startsWith('guest:')) {
            if (d.guestChoice) return;
            const bits = key.split(':');
            if (bits[1] === 'accept') d.guestChoice = { partner: 'ren', approach: 'accepted-invitation' };
            else if (bits[1] === 'hana') d.guestChoice = { partner: 'hana', approach: 'accepted-hana' };
            else d.guestChoice = { partner: 'ren', approach: bits[2] };
        } else if (key.startsWith('hostfinal:')) {
            if (d.hostFinal) return;
            d.hostFinal = key.endsWith(':yui') ? 'yui' : d.hostChoice.partner;
        }
        if (d.hostChoice && d.guestChoice) {
            if (d.hostChoice.partner === 'yui') d.result = d.guestChoice.partner === 'ren' ? 'ren-yui' : 'ren-invited-yui-declined';
            else if (d.guestChoice.partner === 'hana') d.result = 'separate';
            else if (d.guestChoice.partner === 'ren' && d.hostFinal) d.result = d.hostFinal === 'yui' ? 'yui-asked-ren-accepted' : 'separate';
        }

        if (state.roomData?.public) state.roomData.public.projectDecision = d;
        renderStory();
        updatePublic('projectDecision', d);
    }

    function startStory() {
        setScreen('storyIntro');
        state.replayWaiting = false; state.mode = 'main'; state.chapterIndex = 0; state.sceneId = 'sep1_homeroom'; state.sceneHistory = []; state.storyPages = []; state.storyPageIndex = 0; state.storyChoices = {}; state.transcript = []; state.loggedScenes = {}; state.journalExpanded = false; state.personal = { trust: 0, affection: 0, understanding: 0, compatibility: 0, clues: [] }; state.screen = 'storyIntro';
        saveLocalProgress();
        renderStoryIntro();
    }

    function renderStoryIntro() {
        setScreen('storyIntro');
        const ch = window.BU_STORY.mainChapters[state.chapterIndex] || window.BU_STORY.mainChapters[0];
        const chapterNum = state.chapterIndex + 1;
        const guest = state.playerSlot === 'guest';
        const role = guest ? 'Yui’s perspective' : 'Ren’s perspective';
        const roleCopy = guest
            ? 'You will experience the semester through Yui: her friendships, her decisions, and the small details she notices. Your partner experiences another life on the same campus.'
            : 'You will experience the semester through Ren: his friendships, his decisions, and the things he finds difficult to say. Your partner experiences another life on the same campus.';

        app.innerHTML = `
        <section class="vn-intro slide-in">
            <div class="vn-intro-art vn-intro-autumn">
                <img class="vn-intro-asset" src="assets/Backgrounds/chapter-${chapterNum}.png" alt="${safe(ch.title)}">
                <div class="vn-intro-caption"><span>HOSHINOMIYA ACADEMY</span><strong>${safe(ch.title)}</strong><small>CHAPTER 0${chapterNum} · ${safe(ch.month || 'SEMESTER')}</small></div>
            </div>
            <div class="vn-intro-copy">
                <span class="eyebrow">YOUR STORY CONTINUES</span>
                <div class="vn-role-card">
                <span class="vn-role-icon">${guest ? 'B' : 'A'}</span>
                <div><span class="eyebrow">YOUR ROLE</span><h2>${safe(role)}</h2><p>${safe(roleCopy)}</p></div>
                </div>
                <div class="vn-objective"><span class="eyebrow">OBJECTIVE</span><p>${safe(ch.objective || 'Continue your journey through the semester.')}</p></div>
                <div class="vn-how"><span class="eyebrow">CHAPTER INFO</span><p>Entering Chapter ${chapterNum}. Coordinate with your partner, review your choices, and make your decisions carefully.</p></div>
                <div class="button-row">
                <button class="primary-button" id="beginChapter">Begin Chapter ${chapterNum} <span>→</span></button>
                <button class="secondary-button" id="introExit">Exit</button>
                </div>
            </div>
        </section>
        ${footer()}`;

        const introAsset = $('.vn-intro-asset');
        if (introAsset) {
            introAsset.loading = 'eager';
            introAsset.fetchPriority = 'high';
            introAsset.onload = () => introAsset.classList.add('asset-loaded');
            introAsset.onerror = () => { introAsset.src = 'assets/Backgrounds/chapter-1.png'; };
            if (introAsset.complete && introAsset.naturalWidth) introAsset.classList.add('asset-loaded');
        }

        $('#beginChapter').onclick = () => {
            const btn = $('#beginChapter');
            if (btn) { btn.disabled = true; btn.innerHTML = 'Loading chapter…'; }
            setScreen('story');
            state.screen = 'story';
            const firstSceneId = ch.scenes[0]?.id || state.sceneId;
            state.sceneId = firstSceneId;
            state.storyPages = [{ sceneId: firstSceneId, lineIndex: 0 }];
            state.storyPageIndex = 0;
            saveLocalProgress();
            renderStory();
            if (state.online) updatePublic('chapter', state.chapterIndex);
        };
        $('#introExit').onclick = () => confirmExit();
    }

    function getSceneChoices(scene, slot = state.playerSlot === 'guest' ? 'guest' : 'host') {
        if (!scene) return [];
        const projectResult = getProjectDecision().result;
        const renIsSick = projectResult === 'ren-yui' || projectResult === 'yui-asked-ren-accepted';
        if (scene.id === 'nov9_sick_day') {
            if (renIsSick) {
                if (slot === 'host') return scene.choicesBySlot?.host || scene.choices || [];
                return getChoiceIndex('host', 'nov9_sick_day') === 0 ? [
                    { label: 'Offer to bring Ren class notes and something warm.', next: 'nov9_response', romance: 2, care: 2, friendship: -1 },
                    { label: 'Send a supportive message and let him rest.', next: 'nov9_response', romance: 1, trust: 1, friendship: 1 }
                ] : [
                    { label: 'Message Ren to check whether he is okay.', next: 'nov9_response', trust: 1, care: 1, romance: 1 },
                    { label: 'Give him space and keep your plans with Hana.', next: 'nov9_response', friendship: 2, understanding: 1 }
                ];
            }
            if (slot === 'guest') return scene.choicesBySlot?.guest || scene.choices || [];
            return getChoiceIndex('guest', 'nov9_sick_day') === 0 ? [
                { label: 'Offer to bring Yui notes and something warm.', next: 'nov9_response', romance: 2, care: 2, friendship: -1 },
                { label: 'Send a supportive message and let her rest.', next: 'nov9_response', romance: 1, trust: 1, friendship: 1 }
            ] : [
                { label: 'Message Yui to check whether she is okay.', next: 'nov9_response', trust: 1, care: 1, romance: 1 },
                { label: 'Give her space and keep your plans with Kai.', next: 'nov9_response', friendship: 2, understanding: 1 }
            ];
        }
        if (scene.id === 'nov9_response') {
            if (renIsSick && slot === 'guest') return [
                { label: 'Check in with Ren tomorrow and offer to share class notes.', next: 'nov9_friendship_advice', care: 1, trust: 1, friendship: 1 },
                { label: 'Let Ren rest and keep the conversation short tonight.', next: 'nov9_friendship_advice', understanding: 1, friendship: 1 }
            ];
            if (!renIsSick && slot === 'host') return [
                { label: 'Check in with Yui tomorrow and offer to share class notes.', next: 'nov9_friendship_advice', care: 1, trust: 1, friendship: 1 },
                { label: 'Let Yui rest and keep the conversation short tonight.', next: 'nov9_friendship_advice', understanding: 1, friendship: 1 }
            ];
            if (renIsSick && slot === 'host' && getChoiceIndex('host', 'nov9_sick_day') === 1) return [
                { label: 'Tell Yui after all that you are not feeling well.', next: 'nov9_friendship_advice', trust: 1, romance: 1, flag: 'ren_told_yui_late' },
                { label: 'Keep the illness private and thank her for checking in.', next: 'nov9_friendship_advice', understanding: 1, trust: -1 }
            ];
            if (!renIsSick && slot === 'guest' && getChoiceIndex('guest', 'nov9_sick_day') === 1) return [
                { label: 'Tell Ren after all that you have been sick.', next: 'nov9_friendship_advice', trust: 1, romance: 1, flag: 'yui_told_ren_late' },
                { label: 'Keep it private and tell him you are resting.', next: 'nov9_friendship_advice', understanding: 1, trust: -1 }
            ];
        }
        if (scene.id === 'dec11_first_visit' && slot === 'guest') {
            const hostChoice = getChoiceIndex('host', 'dec11_first_visit');
            if (hostChoice === null) return [];
            return hostChoice === 0 ? [
                { label: 'Accept the invitation to Ren’s apartment.', next: 'dec11_second_visit', romance: 2, trust: 2, flag: 'yui_accepted_home_1' },
                { label: 'Suggest the library instead.', next: 'dec11_second_visit', romance: 1, understanding: 1, flag: 'yui_chose_library_1' }
            ] : [
                { label: 'Agree to meet at the library.', next: 'dec11_second_visit', romance: 1, trust: 1, flag: 'yui_accepted_library_1' },
                { label: 'Suggest a quieter corner of the library instead.', next: 'dec11_second_visit', friendship: 1, understanding: 1 }
            ];
        }
        if (scene.id === 'dec11_second_visit' || scene.id === 'dec11_third_visit') {
            const homeVisit = getChoiceIndex('host', 'dec11_first_visit') === 0 && getChoiceIndex('guest', 'dec11_first_visit') === 0;
            if (!homeVisit) {
                if (scene.id === 'dec11_second_visit') return slot === 'host' ? [{ label: 'Share a film recommendation and ask what Yui likes.', next: 'dec11_third_visit', romance: 1, trust: 1 }, { label: 'Keep the meeting focused on the project.', next: 'dec11_third_visit', friendship: 1, understanding: 1 }] : [{ label: 'Trade film and drama recommendations with Ren.', next: 'dec11_third_visit', romance: 1, trust: 1 }, { label: 'Keep the meeting focused on the project.', next: 'dec11_third_visit', friendship: 1, understanding: 1 }];
                return slot === 'host' ? [{ label: 'Suggest watching the same drama separately and comparing notes tomorrow.', next: 'dec12_christmas_eve', romance: 1, trust: 1 }, { label: 'Finish the project and say goodbye for tonight.', next: 'dec12_christmas_eve', friendship: 1, understanding: 1 }] : [{ label: 'Agree to watch the same drama on your own and compare notes later.', next: 'dec12_christmas_eve', romance: 1, trust: 1 }, { label: 'Finish the project and head home.', next: 'dec12_christmas_eve', friendship: 1, understanding: 1 }];
            }
        }
        return scene.choicesBySlot?.[slot] || scene.choices || [];
    }

    function getChoiceIndex(slot, sceneId) {
        if (slot === (state.playerSlot === 'guest' ? 'guest' : 'host') && Object.prototype.hasOwnProperty.call(state.storyChoices, sceneId)) return state.storyChoices[sceneId];
        const record = state.roomData?.public?.choices?.[slot]?.[sceneId];
        return Number.isInteger(record?.index) ? record.index : null;
    }

    function sceneChoice(slot, sceneId) {
        const found = sceneById(sceneId); const index = getChoiceIndex(slot, sceneId);
        return found && index !== null ? getSceneChoices(found, slot)[index] || null : null;
    }

    function friendshipNeglectCount(slot) {
        const records = state.roomData?.public?.choices?.[slot] || {}; let count = 0;
        for (const [sceneId, record] of Object.entries(records)) { const selected = sceneChoice(slot, sceneId); if (!selected) continue; if (Number(selected.friendship || 0) < 0 || /^neglected_/.test(selected.flag || '') || /^chose_(yui|ren)_over_(kai|hana)$/.test(selected.flag || '')) count++ }
        return count;
    }

    function sceneDialogue(scene) {
        const slot = state.playerSlot === 'guest' ? 'guest' : 'host';
        let dialogue = scene.dialogueBySlot?.[slot] || scene.dialogue || [{ speaker: scene.speaker || 'narrator', text: scene.text || '' }];
        if (/^(oct4_(first_visit|courtyard|library|project_notes)|oct5_(work_session|disagreement|end))$/.test(scene.id)) {
            const d = getProjectDecision();
            let partner = 'hana';
            if (slot === 'host') {
                partner = (d.result === 'ren-yui' || d.result === 'yui-asked-ren-accepted') ? 'yui' : (d.hostChoice?.partner === 'mei' ? 'mei' : 'kai');
                if (d.result === 'ren-invited-yui-declined' && d.hostChoice?.partner === 'yui') partner = 'kai';
                const partnerName = window.BU_STORY.cast[partner]?.name?.split(' ')[0] || 'Kai';
                dialogue = dialogue.map(line => {
                    if (line.speaker !== 'kai' && line.speaker !== 'mei') return line;
                    let text = line.text.replace(/\bKai\b/g, partnerName).replace(/\bMei\b/g, partnerName);
                    return { ...line, speaker: partner, text };
                });
            } else if (d.result === 'ren-yui' || d.result === 'yui-asked-ren-accepted') {
                partner = 'ren';
                dialogue = dialogue.map(line => {
                    if (line.speaker !== 'hana') return line;
                    return { ...line, speaker: 'ren', text: line.text.replace(/\bHana\b/g, 'Ren').replace(/\bhana\b/g, 'Ren') };
                });
            }
        }
        if (scene.id === 'nov7_remembered_detail') {
            const renShared = getChoiceIndex('host', 'sep3_first_talk') === 0;
            if (slot === 'guest') {
                dialogue = dialogue.map((line, i) => i === 0 ? { ...line, text: renShared ? 'You bring up the quiet riverside path Ren mentioned weeks ago. You remember because he seemed surprised you listened.' : 'You ask Ren whether he has a favourite place to unwind after a crowded day. You want to know more, but you do not want to invent closeness that is not there yet.' } : line);
            } else {
                dialogue = dialogue.map((line, i) => i === 0 ? { ...line, text: renShared ? 'Yui mentions the quiet riverside path you told her about weeks ago. She remembers the detail without making a show of it.' : 'You ask whether Yui has a favourite place to unwind after a crowded day. You realise you have not given her much to remember yet.' } : line);
            }
        }
        if (scene.id === 'nov9_sick_day') {
            const result = getProjectDecision().result; const renIsSick = result === 'ren-yui' || result === 'yui-asked-ren-accepted';
            if (renIsSick && slot === 'guest') {
                const disclosed = getChoiceIndex('host', 'nov9_sick_day') === 0;
                dialogue = dialogue.map((line, i) => i === 0 ? { ...line, text: disclosed ? 'Ren sends you a message saying he has a fever and will stay home. He sounds apologetic for telling you, as if being sick is an inconvenience he should manage alone.' : 'Ren is absent from school and unusually quiet in the class group. He has not said what is wrong, but you wonder whether to check in or give him space.' } : i === 1 ? { ...line, text: disclosed ? 'You can offer practical help or send a supportive message and let him rest.' : 'You can send a gentle check-in or leave him alone for now. You do not know he is sick; you only know he has gone quiet.' } : line);
            }
            if (!renIsSick && slot === 'host') {
                const disclosed = getChoiceIndex('guest', 'nov9_sick_day') === 0;
                dialogue = dialogue.map((line, i) => i === 0 ? { ...line, text: disclosed ? 'Yui messages you to say she has a fever and will stay home. She adds that she does not want to make a fuss, but you can hear how tired she is in the short message.' : 'Yui is absent from school and has not replied to the class group. You do not know she is sick, but you can decide whether to check in or give her space.' } : i === 1 ? { ...line, text: disclosed ? 'You can offer to bring notes and something warm, or send a supportive message and let her rest.' : 'You can send a gentle check-in or leave her alone for now. You do not know she is sick; you only know she has gone quiet.' } : line);
            }
        }
        if (scene.id === 'nov9_response') {
            const result = getProjectDecision().result; const renIsSick = result === 'ren-yui' || result === 'yui-asked-ren-accepted';
            const renDisclosure = getChoiceIndex('host', 'nov9_sick_day'); const yuiDisclosure = getChoiceIndex('guest', 'nov9_sick_day');
            if (renIsSick && slot === 'host') dialogue = dialogue.map((line, i) => i === 0 ? { ...line, text: renDisclosure === 0 ? (getChoiceIndex('guest', 'nov9_sick_day') === 0 ? 'Yui offers to bring your class notes and something warm. You are touched by the practical care, though part of you worries about being a burden.' : 'Yui sends a kind message and gives you room to rest. You read it twice before replying.') : 'You did not tell Yui you were sick. If she checked in, you can answer honestly now; if she gave you space, you can decide whether to keep the secret.' } : line);
            if (renIsSick && slot === 'guest') dialogue = dialogue.map((line, i) => i === 0 ? { ...line, text: renDisclosure === 0 ? (getChoiceIndex('guest', 'nov9_sick_day') === 0 ? 'You offer to bring Ren his class notes and something warm. You do not want to make him feel helpless; you simply want him to know he does not have to manage every difficult day alone.' : 'You send Ren a supportive message and let him rest, hoping he knows you are there if he needs anything.') : 'Ren has not told you he is sick. You only know he has gone quiet, so you decide whether to check in gently or give him room.' } : line);
            if (!renIsSick && slot === 'guest') dialogue = dialogue.map((line, i) => i === 0 ? { ...line, text: yuiDisclosure === 0 ? (getChoiceIndex('host', 'nov9_sick_day') === 0 ? 'Ren offers to bring you class notes and something warm. You are relieved he took your message seriously.' : 'Ren sends a supportive message and lets you rest. You are glad he did not make you explain more than you wanted to.') : 'You did not tell Ren you were sick. If he checked in, you can be honest now; if he gave you space, you can decide whether to keep the secret.' } : line);
            if (!renIsSick && slot === 'host') dialogue = dialogue.map((line, i) => i === 0 ? { ...line, text: yuiDisclosure === 0 ? (getChoiceIndex('host', 'nov9_sick_day') === 0 ? 'You offer to bring Yui notes and something warm. She sounds relieved that you took her message seriously.' : 'You send Yui a supportive message and let her rest, hoping she knows you are there if he needs anything.') : 'Yui has not told you she is sick. You only know she has gone quiet, so you decide whether to check in gently or give her room.' } : line);
        }
        if (scene.id === 'nov7_kai_advice' && slot === 'host') {
            const toldKai = getChoiceIndex('host', 'nov7_remembered_detail') === 0;
            dialogue = dialogue.map((line, i) => i === 0 ? { ...line, text: toldKai ? '“Ren, people do not usually remember tiny things by accident when they care about someone. And you have been looking for Yui before you even know you’re doing it.”' : 'Kai notices you have gone quiet. “You know, you can take your time figuring out how you feel. Just do not pretend the question is not there.”' } : line);
        }
        const neglect = friendshipNeglectCount(slot);
        if (scene.id === 'nov8_small_gesture' && neglect >= 1) {
            dialogue = dialogue.map(line => slot === 'host' && line.speaker === 'kai' ? { ...line, speaker: 'narrator', text: 'Kai sends you a photo from the club event rather than waiting for you after school. You reply with a quick reaction, then turn your attention back to Yui’s message. You tell yourself you will catch up with him later.' } : slot === 'guest' && line.speaker === 'hana' ? { ...line, speaker: 'narrator', text: 'Hana sends you a photo from the weekend rather than waiting to show it to you in person. You reply quickly, then turn back to your conversation with Ren. You tell yourself you will make time for Hana later.' } : line);
        }
        if (scene.id === 'nov9_friendship_advice' && neglect >= 2) {
            dialogue = dialogue.map(line => slot === 'host' && line.speaker === 'kai' ? { ...line, speaker: 'narrator', text: 'A message from Kai arrives late that evening. He admits he likes Hana but has no idea whether she sees him as more than a friend. You have not spoken properly in days, and his message feels like an attempt to reach you anyway.' } : slot === 'guest' && line.speaker === 'hana' ? { ...line, speaker: 'narrator', text: 'Hana sends you a message that evening. She admits Kai has been making her laugh more than usual, but she is not sure whether he is serious. You have been busy with Ren, and her message reminds you that she has been waiting to talk.' } : line);
        }
        if (scene.id === 'dec10_friendship_conflict' && neglect >= 2) {
            dialogue = dialogue.map(line => slot === 'host' && line.speaker === 'kai' ? { ...line, speaker: 'narrator', text: 'Kai sends you a short message asking for help preparing a surprise for Hana. He does not insist when you take time to answer. You realise the distance between you has grown through several small postponements.' } : slot === 'guest' && line.speaker === 'hana' ? { ...line, speaker: 'narrator', text: 'Hana messages you about the photo display for the winter gathering. She says it is fine if you are busy with Ren, but the careful wording makes you realise how often you have postponed your plans with her.' } : line);
        }
        if (/^dec11_(first|second|third)_visit$/.test(scene.id)) {
            const hostInvite = getChoiceIndex('host', 'dec11_first_visit') === 0;
            const guestAccept = getChoiceIndex('guest', 'dec11_first_visit') === 0;
            const homeVisit = hostInvite && guestAccept;
            const hostSupport = getChoiceIndex('host', 'dec11_second_visit') === 0;
            const guestSupport = getChoiceIndex('guest', 'dec11_second_visit') === 0;
            if (scene.id === 'dec11_first_visit') {
                if (slot === 'guest') dialogue = dialogue.map((line, i) => i === 0 ? { ...line, text: hostInvite ? 'Ren invites you to his apartment to work on the project. You are curious about his life outside school, but you do not want to push him into sharing anything before he is ready.' : 'Ren suggests meeting at the library to work on the project. It feels comfortable and familiar, and you can still learn more about him at your own pace.' } : line);
            }
            if (scene.id === 'dec11_second_visit') {
                if (homeVisit) {
                    dialogue = dialogue.map((line, i) => { if (slot === 'host' && i === 3) return { ...line, text: 'You do not explain everything, but Yui does not rush you to fill the silence. For once, the apartment feels less like a place you manage alone and more like somewhere you have chosen to let another person see.' }; if (slot === 'guest' && i === 4) return { ...line, text: 'You do not try to solve Ren’s life for him. You simply stay beside him, letting him know that he can be capable and still accept company.' }; return line; });
                } else {
                    const libraryHost = [
                        'You meet Yui at the library again. You work through the project notes, then talk about favourite films, winter snacks, and which dramas have the most predictable endings.',
                        'The conversation stays light. You are glad for the easy company, even if you have not told her much about the quiet apartment you return to each night.',
                        'Yui recommends a film with a ridiculous plot twist. You disagree about whether it sounds terrible or brilliant.',
                        'You pack your notes. You have not shared your family story, but the ordinary conversation has made the library feel a little less quiet.'
                    ];
                    const libraryGuest = [
                        'You meet Ren at the library. The two of you work through the project and trade film recommendations, winter snacks, and opinions about dramas with predictable endings.',
                        'You do not learn his family story today, but you notice that he relaxes when the conversation does not ask him to explain himself.',
                        'You recommend a film with a ridiculous plot twist. Ren is not convinced, which makes you want to defend it even more.',
                        'You pack your notes feeling that you have learned something small about him, even if the conversation stayed on the surface.',
                        'You leave the library together and keep debating the film all the way to the gate.'
                    ];
                    const lines = slot === 'host' ? libraryHost : libraryGuest;
                    dialogue = dialogue.map((line, i) => ({ ...line, text: lines[i] || line.text }));
                }
            }
            if (scene.id === 'dec11_third_visit') {
                dialogue = dialogue.map((line, i) => {
                    if (slot === 'host' && i === 0) return { ...line, text: homeVisit ? 'For the third project session, Yui comes to your apartment again. You finish the work, then suggest watching a film or drama together. The room feels less empty with someone else in it.' : 'For the third project session, you meet Yui at the library. You finish the work and exchange film recommendations, promising to watch the same drama on your own time.' };
                    if (slot === 'guest' && i === 0) return { ...line, text: homeVisit ? 'For the third project session, you visit Ren’s apartment. After the project work is done, he suggests watching a film or drama together. The invitation feels like a small sign that he is comfortable around you.' : 'For the third project session, you meet Ren at the library. You finish the work and exchange film recommendations, promising to watch the same drama separately.' };
                    if (slot === 'host' && i === 1 && !homeVisit) return { ...line, text: 'You trade recommendations and talk about the kind of stories you both like. You are not sharing a living room tonight, but the conversation still gives you another piece of Yui to remember.' };
                    if (slot === 'guest' && i === 1 && !homeVisit) return { ...line, text: 'You trade recommendations and talk about the kind of stories you both like. You are not sharing a living room tonight, but you still learn another small thing about Ren.' };
                    if (i === 2 && homeVisit && hostSupport && guestSupport) return { ...line, text: slot === 'host' ? 'Yui has been gentle about what you shared, and you have allowed yourself to accept that support. The film continues in the background while the conversation becomes more honest.' : 'You told Ren you can listen without trying to fix everything, and he let the words stay between you. The film continues in the background while the conversation becomes more honest.' };
                    return line;
                });
            }
        }
        return dialogue;
    }

    function characterFor(speaker) {
        const key = String(speaker || 'narrator').toLowerCase();
        return window.BU_STORY.cast[key] || { name: speaker || 'Narrator', role: 'Hoshinomiya Academy', initial: String(speaker || '✦')[0] };
    }

    function logSceneConversation(scene, lineIndex) {
        const key = scene.id + ':' + lineIndex;
        if (state.loggedScenes[key]) return;
        const line = sceneDialogue(scene)[lineIndex]; if (!line) return;
        const who = characterFor(line.speaker);
        state.transcript.push({ sceneId: scene.id, sceneTitle: scene.role || 'Conversation', speaker: who.name, text: line.text });
        state.loggedScenes[key] = true;
    }

    function currentStoryPage() { return state.storyPages[state.storyPageIndex] || { sceneId: state.sceneId, lineIndex: 0 } }
    function pushStoryPage(page) { state.storyPages = state.storyPages.slice(0, state.storyPageIndex + 1); state.storyPages.push(page); state.storyPageIndex = state.storyPages.length - 1; state.sceneId = page.sceneId; saveLocalProgress(); }
    function moveStoryPage(delta) { const next = state.storyPageIndex + delta; if (next < 0 || next >= state.storyPages.length) return; state.storyPageIndex = next; const page = currentStoryPage(); state.sceneId = page.sceneId; saveLocalProgress(); renderStory(); }

    function renderStory() {
        if (state.screen !== 'story') return;
        setScreen('story');
        let page = currentStoryPage(); state.sceneId = page.sceneId;
        let info = findSceneInfo(page.sceneId); if (!info) { console.error('Missing story scene:', page.sceneId); renderEnding(); return }
        if (state.online && info.scene.id === 'dec11_second_visit' && (getChoiceIndex('host', 'dec11_first_visit') === null || getChoiceIndex('guest', 'dec11_first_visit') === null)) {
            app.innerHTML = `<div class="end-card slide-in"><div class="end-heart">♡</div><span class="eyebrow">CHAPTER 11 · A PLACE TO COME HOME TO</span><h2>One invitation, two answers.</h2><p>Your next conversation depends on whether both players agreed on where to work. The story will continue as soon as your partner has made their choice.</p><div class="clue-card ending-note"><strong>Waiting for your person</strong><p>You can leave this page open. Your partner's choice list remains private.</p></div></div>${footer()}`; return;
        }
        if (state.online && info.scene.id === 'dec11_third_visit' && (getChoiceIndex('host', 'dec11_second_visit') === null || getChoiceIndex('guest', 'dec11_second_visit') === null)) {
            app.innerHTML = `<div class="end-card slide-in"><div class="end-heart">♡</div><span class="eyebrow">CHAPTER 11 · A PLACE TO COME HOME TO</span><h2>Give the moment a little time.</h2><p>This next scene reflects how both of you responded to the previous conversation. It will continue when your partner is ready.</p><div class="clue-card ending-note"><strong>Waiting for your person</strong><p>Your private choices are not displayed to the other player.</p></div></div>${footer()}`; return;
        }
        const sicknessProjectResult = getProjectDecision().result; const renIsSickScenario = sicknessProjectResult === 'ren-yui' || sicknessProjectResult === 'yui-asked-ren-accepted';
        if (state.online && info.scene.id === 'nov9_sick_day' && ((renIsSickScenario && state.playerSlot === 'guest' && getChoiceIndex('host', 'nov9_sick_day') === null) || (!renIsSickScenario && state.playerSlot === 'host' && getChoiceIndex('guest', 'nov9_sick_day') === null))) {
            app.innerHTML = `<div class="end-card slide-in"><div class="end-heart">♡</div><span class="eyebrow">CHAPTER 09 · WHEN SOMEONE NEEDS YOU</span><h2>Wait for the message.</h2><p>The character who is sick needs to decide whether to tell the other person first. Once they choose, you will see the response options that fit the situation.</p><div class="clue-card ending-note"><strong>Waiting for your person</strong><p>Your private choices remain hidden.</p></div></div>${footer()}`; return;
        }
        if (state.online && info.scene.id === 'nov9_response' && (getChoiceIndex('host', 'nov9_sick_day') === null || getChoiceIndex('guest', 'nov9_sick_day') === null)) {
            app.innerHTML = `<div class="end-card slide-in"><div class="end-heart">♡</div><span class="eyebrow">CHAPTER 09 · WHEN SOMEONE NEEDS YOU</span><h2>Wait for the other message.</h2><p>The next conversation depends on whether the sick character shared what was happening and how the other person responded. It will continue once both choices are made.</p><div class="clue-card ending-note"><strong>Waiting for your person</strong><p>Your private choice remains hidden.</p></div></div>${footer()}`; return;
        }
        const project = getProjectDecision();
        if (info.scene.projectDecision && project.result && page.lineIndex >= sceneDialogue(info.scene).length - 1) { page.sceneId = 'oct3_project_result'; page.lineIndex = 0; state.sceneId = page.sceneId; info = findSceneInfo(page.sceneId) }
        const ch = info.chapter, scene = info.scene; state.chapterIndex = info.chapterIndex;
        const dialogue = sceneDialogue(scene); const lineIndex = Math.max(0, Math.min(page.lineIndex, dialogue.length - 1));
        let line = dialogue[lineIndex];
        if (scene.id === 'oct3_project_result' && lineIndex === dialogue.length - 1) line = { ...line, text: projectOutcomeText() };
        logSceneConversation(scene, lineIndex);
        const who = characterFor(line.speaker); const speakerKey = String(line.speaker || 'narrator').toLowerCase();
        const isLast = lineIndex === dialogue.length - 1; const canBack = state.storyPageIndex > 0; const canForward = state.storyPageIndex < state.storyPages.length - 1;
        const allChapters = window.BU_STORY.mainChapters; const allScenes = allChapters.flatMap(c => c.scenes); const overallSceneIndex = Math.max(0, allScenes.findIndex(s => s.id === scene.id)); const progress = Math.min(100, Math.round(((overallSceneIndex + ((lineIndex + 1) / Math.max(dialogue.length, 1))) / Math.max(allScenes.length, 1)) * 100));
        const availableChoices = getSceneChoices(scene);
        const waitingForRen = scene.id === 'dec11_first_visit' && state.playerSlot === 'guest' && getChoiceIndex('host', 'dec11_first_visit') === null;
        const waitingForSickInfo = scene.id === 'nov9_sick_day' && ((renIsSickScenario && state.playerSlot === 'guest' && getChoiceIndex('host', 'nov9_sick_day') === null) || (!renIsSickScenario && state.playerSlot === 'host' && getChoiceIndex('guest', 'nov9_sick_day') === null));
        const hasChoices = isLast && (scene.projectDecision || (availableChoices.length > 0) || waitingForRen || waitingForSickInfo);
        const choicesPage = page.type === 'choices' && hasChoices;
        const waitingMarkup = waitingForRen ? '<div class="vn-choice-reveal"><div class="vn-choice-heading"><span class="eyebrow">WAITING FOR REN</span><p>Ren needs to choose where to work before you can respond. Your answer will stay private from the other player.</p></div><div class="project-waiting">Waiting for Ren to make the invitation.</div></div>' : waitingForSickInfo ? '<div class="vn-choice-reveal"><div class="vn-choice-heading"><span class="eyebrow">WAITING FOR A MESSAGE</span><p>The sick character needs to decide whether to share what is happening first.</p></div><div class="project-waiting">Waiting for the other player.</div></div>' : '';
        const choicesMarkup = choicesPage ? (scene.projectDecision ? projectDecisionMarkup() : (waitingForRen || waitingForSickInfo) ? waitingMarkup : `<div class="vn-choice-reveal"><div class="vn-choice-heading"><span class="eyebrow">${scene.decisionType === 'major' ? 'MAJOR DECISION' : 'YOUR DECISION'}</span><h2 class="vn-choice-page-title" style="margin: 6px 0 10px 0;">What will you choose?</h2><p>${scene.decisionType === 'major' ? 'This choice will echo through later chapters.' : 'What do you do?'}</p></div><div class="choice-list">${availableChoices.map((c, i) => `<button class="choice-button" data-choice="${i}"><span class="choice-letter">${String.fromCharCode(65 + i)}</span><span>${safe(c.label)}</span><span class="vn-choice-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"> <line x1="7" y1="17" x2="17" y2="7"></line> <polyline points="7 7 17 7 17 17"></polyline> </svg></span></button>`).join('')}</div></div>`) : '';

        app.innerHTML = `
        <section class="vn-player slide-in">
            <div class="vn-player-top"><div><span class="eyebrow">${safe(ch.number)} · ${safe(ch.month)} · ${safe(state.playerSlot === 'guest' ? 'Yui Tachibana' : 'Ren Akiyama')}</span><div class="vn-chapter-heading"><div class="vn-chapter-title">${safe(ch.title)}</div><div class="vn-chapter-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><i style="width:${progress}%"></i></div></div><div class="vn-location">${safe(ch.location)} <span>·</span> ${safe(scene.role || 'A moment between classes')}</div></div><div class="vn-top-actions"><span class="vn-page-count">SCENE ${overallSceneIndex + 1} / ${allScenes.length}</span><button class="secondary-button" id="storyHome">Exit story</button></div></div>
            <div class="vn-stage vn-scene-${safe(scene.id)} ${scene.weather ? 'vn-weather-' + safe(scene.weather) : ''}"><div class="vn-sky-glow"></div><div class="vn-distant-buildings"></div><div class="vn-rain-lines"></div><img class="vn-background-image" alt="" aria-hidden="true"><div class="vn-stage-caption"><span>HOSHINOMIYA ACADEMY</span><strong>${safe(scene.role || ch.title)}</strong></div><div class="vn-character" aria-label="${safe(who.name)} speaking"></div><div class="vn-character-label"><span class="vn-speaking-dot"></span><div><strong>${safe(who.name)}</strong><small>${safe(who.role)}</small></div></div>
                ${choicesPage ? `<div class="vn-dialogue-panel vn-choice-page-panel">${choicesMarkup}<div class="vn-controls"><button class="secondary-button" id="storyBack">← Back to conversation</button><span class="vn-end-label">YOUR STORY, YOUR CHOICE</span></div></div>` : `<div class="vn-dialogue-panel"><div class="vn-dialogue-meta"><span>${safe(who.name)}</span><span>${lineIndex + 1} /${dialogue.length}</span></div><p class="vn-dialogue-text" aria-live="polite">${safe(line.text)}</p>${isLast && hasChoices ? '<div class="vn-next-hint">The conversation ends here. Continue to make your choice on the next page.</div>' : (!isLast ? '<div class="vn-next-hint">Continue the conversation to see what happens next.</div>' : '')}<div class="vn-controls"><button class="secondary-button" id="storyBack" ${canBack ? '' : 'disabled'}>← Back</button><div class="vn-progress"><i style="width:${Math.max(6, Math.round((lineIndex + 1) / dialogue.length * 100))}\%"></i></div>${canForward ? '<button class="primary-button" id="storyNext">Forward →</button>' : (isLast && hasChoices ? '<button class="primary-button" id="storyNext">Choices →</button>' : isLast ? '<span class="vn-end-label">SCENE COMPLETE</span>' : '<button class="primary-button" id="storyNext">Next →</button>')}</div></div>`}
            </div>
        </section>
        ${footer()}`;

        wireSceneAssets(scene, speakerKey);
        $('#storyHome').onclick = () => confirmExit();
        $('#storyBack').onclick = () => moveStoryPage(-1);
        const nextButton = $('#storyNext');
        if (nextButton) nextButton.onclick = () => {
            if (canForward) { moveStoryPage(1); return; }
            if (choicesPage) return;
            if (!isLast) { pushStoryPage({ sceneId: scene.id, lineIndex: lineIndex + 1 }); renderStory(); }
            else if (hasChoices) { pushStoryPage({ sceneId: scene.id, lineIndex: lineIndex, type: 'choices' }); renderStory(); }
        };
        $$('[data-choice]').forEach(b => b.onclick = () => chooseStoryChoice(Number(b.dataset.choice), scene));
        $$('[data-project-choice]').forEach(b => b.onclick = () => submitProjectChoice(b.dataset.projectChoice));
    }

    function metricLabel(n) { if (n >= 4) return 'Growing'; if (n >= 2) return 'Warming'; if (n >= 1) return 'Noticed'; return 'Unknown' }

    async function chooseStoryChoice(index, scene) {
        const choices = getSceneChoices(scene); const choice = choices[index]; if (!choice) return;
        $$('[data-choice]').forEach(b => b.disabled = true);
        const visitedBefore = new Set(state.storyPages.slice(0, state.storyPageIndex + 1).map(p => p.sceneId));
        state.storyChoices = Object.fromEntries(Object.entries(state.storyChoices).filter(([id]) => visitedBefore.has(id) && id !== scene.id));
        state.storyChoices[scene.id] = index;
        state.personal = { trust: 0, affection: 0, understanding: 0, compatibility: 0, clues: [] };
        const chapters = window.BU_STORY.mainChapters;
        Object.entries(state.storyChoices).forEach(([sceneId, choiceIndex]) => {
            for (const chapter of chapters) {
                const found = chapter.scenes.find(s => s.id === sceneId);
                if (found && getSceneChoices(found, state.playerSlot === 'guest' ? 'guest' : 'host')[choiceIndex]) {
                    const picked = getSceneChoices(found, state.playerSlot === 'guest' ? 'guest' : 'host')[choiceIndex];
                    state.personal.trust += picked.trust || 0;
                    state.personal.affection += picked.affection || 0;
                    state.personal.understanding += picked.understanding || 0;
                    state.personal.compatibility += picked.compatibility || 0;
                    break;
                }
            }
        });
        state.sceneHistory = [...new Set(state.storyPages.slice(0, state.storyPageIndex + 1).map(p => p.sceneId))].filter(id => id !== scene.id);

        if (choice.next === 'finish') { renderEnding(); return; }
        const nextInfo = findSceneInfo(choice.next);
        if (!nextInfo) { console.error('Missing story scene:', choice.next); toast('This scene is missing. Please replay the chapter.'); return; }

        if (nextInfo.chapterIndex > state.chapterIndex) {
            state.chapterIndex = nextInfo.chapterIndex;
            state.sceneId = nextInfo.scene.id;
            state.screen = 'storyIntro';
            state.storyPages = [{ sceneId: nextInfo.scene.id, lineIndex: 0 }];
            state.storyPageIndex = 0;
            saveLocalProgress();
            renderStoryIntro();
            if (state.online) updatePublic('chapter', state.chapterIndex);
            return;
        }

        state.chapterIndex = nextInfo.chapterIndex;
        state.sceneId = nextInfo.scene.id;
        pushStoryPage({ sceneId: nextInfo.scene.id, lineIndex: 0 });
        renderStory();
        saveLocalProgress();

        const who = state.playerSlot === 'guest' ? 'guest' : 'host';
        const prior = state.roomData?.public?.choices?.[who] || {};
        const kept = Object.fromEntries(Object.entries(prior).filter(([id]) => visitedBefore.has(id)));
        kept[scene.id] = { index, label: choice.label, at: Date.now() };

        updatePublic(`choices/${who}`, kept);
        if (state.online) {
            updatePublic('sceneId', choice.next === 'finish' ? 'finish' : choice.next);
        }
    }

    function calculateEnding() {
        const chapters = window.BU_STORY.mainChapters;
        const scores = { host: { romance: 0, friendship: 0, trust: 0, understanding: 0, care: 0, advice: 0, sideRomance: 0, confession: 0, courage: 0, honesty: 0 }, guest: { romance: 0, friendship: 0, trust: 0, understanding: 0, care: 0, advice: 0, sideRomance: 0, confession: 0, courage: 0, honesty: 0 } };
        const records = state.roomData?.public?.choices || {};
        for (const slot of ['host', 'guest']) {
            const chosen = records[slot] || {};
            for (const [sceneId, record] of Object.entries(chosen)) {
                let found = null; for (const chapter of chapters) { found = chapter.scenes.find(s => s.id === sceneId); if (found) break } if (!found) continue;
                const choice = getSceneChoices(found, slot)[Number(record.index)]; if (!choice) continue;
                for (const key of Object.keys(scores[slot])) scores[slot][key] += Number(choice[key] || 0); scores[slot].romance += Number(choice.affection || 0) + Number(choice.compatibility || 0);
            }
        }
        if (!state.online) { const mine = state.playerSlot === 'guest' ? 'guest' : 'host'; const other = mine === 'host' ? 'guest' : 'host'; for (const key of Object.keys(scores[other])) scores[other][key] = scores[mine][key] }
        const project = state.roomData?.public?.projectDecision || {};
        if (project.result === 'ren-yui' || project.result === 'yui-asked-ren-accepted') { scores.host.romance += 1; scores.guest.romance += 1; scores.host.trust += 1; scores.guest.trust += 1 }
        const host = scores.host, guest = scores.guest;
        const mainRomance = host.romance >= 8 && guest.romance >= 8 && host.trust >= 3 && guest.trust >= 3 && host.confession >= 2 && guest.confession >= 2;
        const friendsMaintained = host.friendship >= 4 && guest.friendship >= 4;
        const sideCouple = host.sideRomance >= 2 && guest.sideRomance >= 2 && friendsMaintained;
        if (mainRomance && sideCouple) return { key: 'A', title: 'A Christmas Together', copy: 'Ren and Yui finally say what they have been showing each other all semester. With the help of thoughtful advice and time made for their best friends, Kai and Hana find the courage to begin their own relationship too. Four people share their first Christmas gathering as something new begins.', host, guest };
        if (mainRomance) return { key: 'B', title: 'Just the Two of Us', copy: 'Ren and Yui become a couple, but the choices that brought them closer also left Kai and Hana waiting on the edges. Their relationship is real; so is the distance that grew when friendship kept being postponed. Christmas is happy, but not as full as it could have been.', host, guest };
        if (sideCouple && !mainRomance) return { key: 'C', title: 'The Friends Who Found Each Other', copy: 'Ren and Yui never quite found the courage or trust to turn their feelings into a relationship. Their care was not wasted, though: they helped Kai and Hana recognise what had been growing between them. The four remain friends, and two of them begin a new chapter together.', host, guest };
        return { key: 'D', title: 'The Things We Never Said', copy: 'The semester ends with affection that never became a promise. Ren and Yui missed chances to understand each other, and Kai and Hana never received the honesty and encouragement they needed. Nothing was ruined by one choice; it was the accumulation of small silences, missed chances, and advice left unspoken.', host, guest };
    }

    async function resetReplaySession() {
        if (state.replayResetting) return; state.replayResetting = true; state.replayWaiting = true;
        try { await updatePublic('projectDecision', {}); await updatePublic('choices', {}); await updatePublic('completed', { host: false, guest: false }); await updatePublic('replayVotes', {}); } finally { state.replayResetting = false; state.replayWaiting = false; startStory(); }
    }

    async function requestReplay() {
        if (!state.online) { startStory(); return }
        const slot = state.playerSlot === 'guest' ? 'guest' : 'host'; state.replayWaiting = true;
        await updatePublic(`replayVotes/${slot}`, true); renderEnding();
    }

    function renderEnding() {
        setScreen('ending');
        const completed = state.roomData?.public?.completed || {};
        const slot = state.playerSlot === 'guest' ? 'guest' : 'host';
        const replayVotes = state.roomData?.public?.replayVotes || {};
        if (state.online && state.replayWaiting) {
            app.innerHTML = `<div class="end-card slide-in"><div class="end-heart">↻</div><span class="eyebrow">REPLAY REQUESTED</span><h2>Start a new semester together?</h2><p>Your replay request is recorded. The story will reset for both players once your partner also chooses Replay.</p><div class="clue-card ending-note"><strong>Waiting for your partner</strong><p>The current ending and choices remain intact until both players agree to replay.</p></div><div class="end-actions"><button class="secondary-button" id="backHomeEnd">Back to menu</button></div></div>${footer()}`; $('#backHomeEnd').onclick = leaveRoom; return;
        }
        if (state.online && completed[slot] !== true) { updatePublic(`completed/${slot}`, true) }
        if (state.online && !(completed.host === true && completed.guest === true)) {
            app.innerHTML = `<div class="end-card slide-in"><div class="end-heart">♡</div><span class="eyebrow">CHAPTERS 01–12 · SEPTEMBER—DECEMBER</span><h2>Your semester is complete.</h2><p>Your choices are recorded. The final ending uses both perspectives, including the small decisions made throughout the semester—not only the project-partner decision.</p><div class="clue-card ending-note"><strong>Waiting for your partner</strong><p>The shared ending will appear here when both players reach the end of the story.</p></div><div class="end-actions"><button class="secondary-button" id="backHomeEnd">Back to menu</button></div></div>${footer()}`;
            $('#backHomeEnd').onclick = leaveRoom; return;
        }
        const outcome = calculateEnding();
        const localNote = state.online ? 'The result reflects the choices recorded from both players.' : 'Local preview mirrors your score for the absent partner, so this is only a rough ending preview. Online play evaluates both real choice histories.';
        app.innerHTML = `<div class="end-card slide-in"><div class="end-heart">${outcome.key === 'A' ? '♡' : outcome.key === 'B' ? '♥' : outcome.key === 'C' ? '✧' : '…'}</div><span class="eyebrow">ENDING ${outcome.key} · CHAPTERS 01–12</span><h2>${safe(outcome.title)}</h2><p>${safe(outcome.copy)}</p><div class="divider"></div><div class="feature-strip"><div class="feature"><strong>${state.sceneHistory.length + 1}</strong><p>Scenes visited</p></div><div class="feature"><strong>${state.transcript.length}</strong><p>Dialogue lines read</p></div><div class="feature"><strong>${outcome.host.romance + outcome.guest.romance}</strong><p>Shared romance score</p></div></div><div class="clue-card ending-note"><strong>How this ending was reached</strong><p>${safe(localNote)} Project partners influence available time together, but the final outcome is based on accumulated romance, trust, courage, friendship, and advice choices.</p></div><div class="end-actions"><button class="primary-button" id="replayStory">Replay story <span>↻</span></button><button class="secondary-button" id="backHomeEnd">Back to menu</button></div><p class="small" style="margin-top:22px">Four acts · Twelve chapters · September to Christmas.</p></div>${footer()}`;
        $('#replayStory').onclick = requestReplay; $('#backHomeEnd').onclick = leaveRoom;
    }

    function confirmExit() {
        if (!exitModalEl) {
            exitModalEl = document.createElement("div");
            exitModalEl.className = "authgate hide";
            document.body.appendChild(exitModalEl);
            exitModalEl.addEventListener("mousedown", e => {
                if (e.target === exitModalEl) closeExitModal();
            });
            document.addEventListener("keydown", e => {
                if (e.key === "Escape" && exitModalEl && !exitModalEl.classList.contains("hide")) closeExitModal();
            });
        }

        exitModalEl.classList.remove("hide");
        exitModalEl.innerHTML = `
        <div class="gate-card">
            <h1><em>Leave Story?</em></h1>
            <p>Leaving this story will close the current room and delete all related data.</p>
            <div class="button-row" style="justify-content:center;margin-top:1.5rem">
                <button class="secondary-button" id="exitCancel">Stay in Story</button>
                <button class="primary-button" id="exitConfirm">Leave Room</button>
            </div>
        </div>
    `;

        const q = id => exitModalEl.querySelector("#" + id);
        q("exitCancel").onclick = closeExitModal;
        q("exitConfirm").onclick = () => {
            closeExitModal();
            leaveRoom();
        };
    }

    function closeExitModal() {
        if (exitModalEl) exitModalEl.classList.add("hide");
    }

    function startDetective() { setScreen('detective'); state.mode = 'detective'; state.screen = 'detective'; state.foundEvidence = []; state.answerSubmitted = false; showCinematic([{ kicker: 'CASE FILE 001', title: 'The Blue Moon Letters', text: 'Three anonymous notes. A borrowed poetry book. A meeting at 5:17 PM. Someone at Hoshinomiya Academy is trying to say something — and someone else is trying to hide it.' }, { kicker: 'INVESTIGATION BEGINS', title: 'Two investigators, one truth.', text: 'Your evidence is not the same as your partner’s. Examine your own case file, share details out loud, and connect the evidence before making your final deduction.' }]).then(renderDetective) }

    function myEvidence() { const all = window.BU_STORY.detectiveCase.evidence; return state.playerSlot === 'guest' ? all.filter((e, i) => i % 2 === 1) : all.filter((e, i) => i % 2 === 0) }

    function renderDetective() {
        if (state.screen !== 'detective') return;
        const c = window.BU_STORY.detectiveCase; const mine = myEvidence(); const found = state.foundEvidence; const r = state.roomData?.public || {}; const shared = r.shared || {}; const partnerFound = shared.foundEvidence?.[state.playerSlot === 'guest' ? 'host' : 'guest'] || []; app.innerHTML = `<div class="page-head slide-in"><div><span class="eyebrow">${safe(c.subtitle)} · ${safe(state.playerSlot === 'guest' ? 'INVESTIGATOR B' : 'INVESTIGATOR A')}</span><h1 class="page-title">${safe(c.title)}</h1><p class="page-subtitle">${safe(c.intro)}</p></div><button class="secondary-button" id="exitCase">Exit case</button></div><div class="detective-layout"><section class="panel"><span class="eyebrow">PRIVATE INTERVIEWS</span><h3>Conversation file A${state.playerSlot === 'guest' ? '2' : '1'}</h3><p>Each file is an interview or recovered conversation. Read the whole exchange; the game will not identify the important sentence for you.</p><div class="evidence-grid">${mine.map(e => `<button class="evidence-card ${found.includes(e.id) ? 'found' : ''}" data-evidence="${e.id}"><span class="evidence-symbol">${e.symbol}</span><strong>${safe(e.title)}</strong><p>${safe(found.includes(e.id) ? e.detail : e.desc)}</p></button>`).join('')}</div><div class="divider"></div><div class="notice">No in-game chat is provided by design. Compare exact wording, dates, and omissions with your partner. Neither screen contains the whole story.</div></section><section class="panel"><span class="eyebrow">SHARED DEDUCTION</span><h3>Connect the dots.</h3><p>Once you and your partner have compared notes, select the two people you think are connected by the letters. You can submit your theory together.</p><div class="board"><div class="board-grid"><div><label class="field-label" for="matchOne">Person one</label><select class="match-select" id="matchOne"><option value="">Choose a person</option>${c.people.map(p => `<option value="${p.id}">${safe(p.name)}</option>`).join('')}</select></div><div><label class="field-label" for="matchTwo">Person two</label><select class="match-select" id="matchTwo"><option value="">Choose a person</option>${c.people.map(p => `<option value="${p.id}">${safe(p.name)}</option>`).join('')}</select></div></div><div class="button-row"><button class="primary-button" id="submitDeduction">Submit deduction <span>→</span></button></div><div id="deductionFeedback"></div></div><div class="divider"></div><h4 class="eyebrow">INTERVIEW EXCHANGE</h4><div class="clue-card"><strong>Your evidence reviewed</strong><p>${found.length} of ${mine.length} items opened. ${mine.length - found.length ? `Open ${mine.length - found.length} more to make sure you haven't missed a detail.` : 'You have reviewed your entire folder.'}</p></div><div class="clue-card"><strong>Partner's evidence</strong><p>${state.online ? `${partnerFound.length} item(s) marked reviewed on your partner’s screen. Ask them what they found.` : 'In local preview, imagine your partner has the other half of the file. Online mode syncs the review count.'}</p></div><div class="case-status"><span>CASE STATUS</span><strong>${state.answerSubmitted ? 'DEDUCTION SUBMITTED' : 'INVESTIGATION ACTIVE'}</strong></div></section></div>${footer()}`; $('#exitCase').onclick = () => confirmExit(); $$('[data-evidence]').forEach(b => b.onclick = () => openEvidence(b.dataset.evidence)); $('#submitDeduction').onclick = submitDeduction;
    }

    async function openEvidence(id) { const evidence = window.BU_STORY.detectiveCase.evidence.find(e => e.id === id); if (!evidence) return; if (!state.foundEvidence.includes(id)) state.foundEvidence.push(id); if (state.online) { const who = state.playerSlot; await updateShared(`foundEvidence/${who}`, state.foundEvidence) } renderDetective(); toast('Conversation reviewed. Decide for yourself what it means.') }

    async function submitDeduction() { const a = $('#matchOne').value, b = $('#matchTwo').value; const feedback = $('#deductionFeedback'); if (!a || !b || a === b) { feedback.innerHTML = '<p style="color:var(--gold)">Choose two different people before submitting.</p>'; return } const solution = window.BU_STORY.detectiveCase.solution; const correct = (a === solution.first && b === solution.second) || (a === solution.second && b === solution.first); state.answerSubmitted = true; if (state.online) { await updateShared(`deductions/${state.playerSlot}`, { first: a, second: b, correct, at: Date.now() }) } if (correct) { await showCinematic([{ kicker: 'CASE FILE 001 · SOLVED', title: 'The clues line up.', text: window.BU_STORY.detectiveCase.answerText }, { kicker: 'INVESTIGATION COMPLETE', title: 'Some secrets are kind.', text: 'The truth was not a grand confession. It was a collection of tiny gestures that only made sense when someone took the time to connect them.' }]); renderDetectiveEnding() } else { feedback.innerHTML = '<p style="color:var(--danger)">That theory conflicts with something in the conversations. Re-read the interviews and compare the exact wording with your partner before trying again.</p>'; state.answerSubmitted = false } }

    function renderDetectiveEnding() { setScreen('detectiveEnding'); app.innerHTML = `<div class="end-card slide-in"><div class="end-heart">⌕</div><span class="eyebrow">CASE FILE 001 · SOLVED</span><h2>A mystery, gently solved.</h2><p>${safe(window.BU_STORY.detectiveCase.answerText)}</p><div class="end-actions"><button class="primary-button" id="replayCase">Replay case <span>↻</span></button><button class="secondary-button" id="homeCase">Back to menu</button></div></div>${footer()}`; $('#replayCase').onclick = startDetective; $('#homeCase').onclick = home }

    const cinema = document.getElementById('cinematic');
    function showCinematic(scenes) { return new Promise(resolve => { state.cinemaQueue = [...scenes]; state.cinemaResolve = resolve; cinema.classList.remove('hidden'); renderCinematicScene() }) }
    function renderCinematicScene() { const scene = state.cinemaQueue[0]; if (!scene) { cinema.classList.add('hidden'); if (state.cinemaResolve) state.cinemaResolve(); state.cinemaResolve = null; return } $('#cinemaKicker').textContent = scene.kicker || 'BETWEEN US'; $('#cinemaTitle').textContent = scene.title || ''; $('#cinemaText').textContent = scene.text || ''; $('#cinemaProgress').style.width = '100% '; const el = $('#cinemaScene'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'cinemaIn .7s ease both' }
    function nextCinematic() { state.cinemaQueue.shift(); renderCinematicScene() }

    const continueCinemaBtn = $('#continueCinema');
    if (continueCinemaBtn) continueCinemaBtn.onclick = nextCinematic;

    const skipCinemaBtn = $('#skipCinema');
    if (skipCinemaBtn) skipCinemaBtn.onclick = () => { state.cinemaQueue = []; renderCinematicScene(); };

    const homeLinkEl = $('#homeLink');
    if (homeLinkEl) {
        homeLinkEl.onclick = e => { 
            e.preventDefault(); 
            if (state.roomRef && state.screen !== 'home') { 
                if (confirm('Leave the current session? The room will be closed.')) leaveRoom(); 
            } else {
                home(); 
            }
        };
    }

    async function tryRestoreSession() {
        try {
            const lastRoomRaw = localStorage.getItem('betweenUs:lastRoom');
            if (!lastRoomRaw) return false;
            const { roomCode, playerSlot } = JSON.parse(lastRoomRaw);
            if (!roomCode || !playerSlot) return false;

            if (state.db) {
                const ref = state.db.ref('rooms/' + roomCode);
                const snap = await ref.child('public').once('value');
                if (!snap.exists()) {
                    clearLocalProgress();
                    localStorage.removeItem('betweenUs:lastRoom');
                    return false;
                }
                state.roomCode = roomCode;
                state.playerSlot = playerSlot;
                state.roomData = { public: snap.val() };
                state.mode = state.roomData.public.mode || 'main';
                attachRoomListener(ref);

                const progress = loadLocalProgress();
                if (progress) {
                    state.screen = progress.screen || 'story';
                    state.sceneId = progress.sceneId || 'sep1_homeroom';
                    state.chapterIndex = progress.chapterIndex || 0;
                    state.storyPageIndex = progress.storyPageIndex || 0;
                    state.storyPages = progress.storyPages || [{ sceneId: state.sceneId, lineIndex: 0 }];
                    state.storyChoices = progress.storyChoices || {};
                } else {
                    state.storyPages = [{ sceneId: state.sceneId || 'sep1_homeroom', lineIndex: 0 }];
                    state.storyPageIndex = 0;
                }

                preloadStoryAssets();
                if (state.roomData.public.status === 'playing') {
                    if (state.screen === 'storyIntro') {
                        setScreen('storyIntro');
                        renderStoryIntro();
                    } else {
                        setScreen('story');
                        renderStory();
                    }
                } else {
                    setScreen('waiting');
                    renderWaiting();
                }
                return true;
            }
        } catch (e) {
            console.error('Session restoration failed:', e);
        }
        return false;
    }

    ensureFloatingBadge();
    if (config.enabled) {
        setConnection(false, 'Connecting…');
        initFirebase().then(async ok => {
            if (!ok) {
                setConnection(false, 'Preview');
                home();
                return;
            }
            const restored = await tryRestoreSession();
            if (!restored) {
                home();
            }
        });
    } else {
        setConnection(false, 'Preview');
        home();
    }
})();