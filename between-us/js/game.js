(() => {
    'use strict';
    const app = document.getElementById('app');
    const $ = (s, root = document) => root.querySelector(s); const $$ = (s, root = document) => [...root.querySelectorAll(s)];

    const rootFirebaseConfig = window.FIREBASE_CONFIG;
    const legacyFirebaseConfig = window.BETWEEN_US_FIREBASE;
    const config = legacyFirebaseConfig || (rootFirebaseConfig ? { enabled: true, config: rootFirebaseConfig } : { enabled: false });
    const state = { screen: 'home', mode: null, roomCode: null, playerId: null, playerSlot: null, roomRef: null, roomData: null, roomUnsub: null, language: 'en', auth: null, db: null, online: false, sound: true, cinemaQueue: [], cinemaResolve: null, localRoom: null, chapterIndex: 0, sceneId: '', sceneHistory: [], storyPages: [], storyPageIndex: 0, storyChoices: {}, personal: { trust: 0, affection: 0, understanding: 0, compatibility: 0, clues: [] }, transcript: [], loggedScenes: {}, journalExpanded: false, foundEvidence: [], answerSubmitted: false, leavingRoom: false, disconnectHandler: null, replayWaiting: false, replayResetting: false };
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

    const TRANSLATIONS = {
        en: {
            title: {
                website: "Website",
                kicker: "A TWO-PLAYER ROMANCE",
                description: "Two players. Two perspectives. One connected story.",
                choose_mode: "CHOOSE YOUR STORY",
                main_caption: "01 / FIRST PERSON",
                main_eyebrow: "LIVE THE STORY",
                main_title: "Main Characters",
                main_desc: "Experience the romance yourself. Choose your words, build trust, and decide how the semester unfolds.",
                begin: "Begin",
                detective_caption: "02 / THIRD PERSON",
                detective_eyebrow: "PLAY CUPID",
                detective_title: "Detectives",
                detective_desc: "Solve romantic puzzles, connect the clues, and help two hearts find each other.",
                coming_soon: "Coming soon",
                academy: "HOSHINOMIYA ACADEMY",
                semester: "SEPTEMBER — DECEMBER"
            },
            settings: {
                title: "Settings",
                account: "Account",
                username: "Username",
                user_id: "User ID",
                google_signin: "Signed in with Google",
                sign_out: "Sign out",
                language: "Language",
                display_language: "Display Language",
                language_desc: "Choose your preferred language",
                audio: "Audio & Music",
                volume: "Volume",
                sound_fx: "Sound Effects",
                sound_fx_desc: "Toggle game audio feedback",
                sound_on: "Sound: On",
                sound_off: "Sound: Off"
            },
            player_ui: {
                default_scene_role: "A moment between classes",
                exit_story: "Exit story",
                scene_counter: "SCENE {current} / {total}",
                back_to_conversation: "← Back to conversation",
                choice_kicker: "YOUR STORY, YOUR CHOICE",
                hint_choices_next: "The conversation ends here. Continue to make your choice on the next page.",
                hint_continue: "Continue the conversation to see what happens next.",
                btn_back: "← Back",
                btn_forward: "Forward →",
                btn_choices: "Choices →",
                btn_next: "Next →",
                scene_complete: "SCENE COMPLETE"
            },
            waiting: {
                eyebrow: "YOUR PRIVATE LITTLE WORLD",
                heading_html: "Waiting for<br><em>your person.</em>",
                subtitle: "One more person, and your story can begin.",
                room_code_eyebrow: "ROOM CODE",
                room_hint: "Send this code to your Player Two.",
                copy_title: "Copy room code",
                refresh_title: "Refresh room status",
                host_label: "HOST",
                host_name: "Player One",
                guest_label: "GUEST",
                guest_name: "Player Two",
                connected: "Connected",
                waiting_to_join: "Waiting to join",
                note_ready: "You’re both here. Get comfortable, then start the story together.",
                note_waiting: "Your room is ready. As soon as Player Two joins, the next chapter is yours.",
                begin_together: "Begin together",
                waiting_player_two: "Waiting for Player Two…",
                leave_room: "Leave room"
            },
            lobby: {
                eyebrow: "A LITTLE SPACE FOR TWO",
                heading: "Meet me <em>here.</em>",
                subtitle: "Make a room for your story, or join someone who’s already waiting.",
                back_modes: "Change Mode",
                create_eyebrow: "START SOMETHING",
                create_title: "Create a room",
                create_desc: "You’ll be <b>Player One</b>, the host. Create a room to begin.",
                player_one: "Player One",
                room_host: "Room host",
                you: "YOU",
                create_btn: "Create room",
                join_eyebrow: "CONTINUE TOGETHER",
                join_title: "Join a room",
                join_desc: "You’ll be <b>Player Two</b>. Enter the six-character code from your host.",
                player_two: "Player Two",
                guest_player: "Guest player",
                invited: "INVITED",
                room_code_label: "Room code",
                join_btn: "Join",
                footer_brand: "BETWEEN US · TWO PERSPECTIVES, ONE STORY",
                local_preview: "Test Local Preview"
            },
            story_intro: {
                kicker: "YOUR STORY CONTINUES",
                role_label: "YOUR ROLE",
                ren_title: "Ren’s perspective",
                ren_copy: "You will experience the semester through Ren: his friendships, his decisions, and the things he finds difficult to say. Your partner experiences another life on the same campus.",
                yui_title: "Yui’s perspective",
                yui_copy: "You will experience the semester through Yui: her friendships, her decisions, and the small details she notices. Your partner experiences another life on the same campus.",
                objective_label: "OBJECTIVE",
                default_objective: "Continue your journey through the semester.",
                info_label: "CHAPTER INFO",
                info_copy: "Entering Chapter {num}. Coordinate with your partner, review your choices, and make your decisions carefully.",
                begin_btn: "Begin Chapter {num} →",
                loading_chapter: "Loading chapter…",
                exit_btn: "Exit"
            },
            scene_choices: {
                waiting_ren_heading: "WAITING FOR REN",
                waiting_ren_p: "Ren needs to choose where to work before you can respond. Your answer will stay private from the other player.",
                waiting_ren_notice: "Waiting for Ren to make the invitation.",
                waiting_msg_heading: "WAITING FOR A MESSAGE",
                waiting_msg_p: "The sick character needs to decide whether to share what is happening first.",
                waiting_msg_notice: "Waiting for the other player.",
                major_decision: "MAJOR DECISION",
                your_decision: "YOUR DECISION",
                page_title: "What will you choose?",
                major_desc: "This choice will echo through later chapters.",
                standard_desc: "What do you do?"
            },
            project_decision: {
                outcomes: {
                    ren_yui_guest: "Ren asks you to work with him. You decide to accept. The decision is small on paper—one project partner—but it gives you a reason to spend time together, notice each other’s habits, and discover what might be there beyond the classroom.",
                    ren_yui_host_direct: "You tell Yui honestly that you would like to get to know her better.",
                    ren_yui_host_playful: "You hide a little of your nerves behind a joke, and Yui answers with a smile.",
                    ren_yui_host_casual: "You ask Yui casually, trying to make it feel like a simple question even though you care about the answer.",
                    ren_yui_host_end: "She agrees to work with you. It is only a project, you tell yourself, but you are already wondering what it will be like to spend more time with her.",
                    yui_asked_guest_direct: "You tell Ren directly that you would like to work with him.",
                    yui_asked_guest_playful: "You make a joke to soften the question, then wait for his answer.",
                    yui_asked_guest_casual: "You ask Ren casually, giving him room to say no without making the moment too heavy.",
                    yui_asked_guest_end: "Ren agrees, and the relief you feel is warmer than you expected. Hana gives you an exaggerated thumbs-up from across the room.",
                    yui_asked_host: "Yui asks whether you would reconsider. You decide to work with her after all. Kai pretends not to be disappointed; Mei simply tells you to make sure the choice is one you can stand behind.",
                    declined_guest: "You decide to work with Hana. Ren’s invitation was kind, but you are not ready to take that step—or you simply feel this project is a better fit with your friend. You can still get to know Ren at your own pace.",
                    declined_host: "You asked Yui, but she chose to work with Hana. The disappointment is small but real. You decide to respect her choice and make the best of the project with someone else.",
                    separate_guest: "You and Ren choose different partners. It is not a rejection of a friendship that has barely begun; it is simply the choice that feels right today. There will be other chances to talk.",
                    separate_host: "You and Yui choose different partners. You have no way of knowing what might have happened otherwise, and that is all right. The semester is long, and one decision does not define every connection.",
                    default_outcome: "The project groups begin to form. A small decision has been made, and the semester carries on."
                },
                headings: {
                    major_decision: "MAJOR DECISION · PROJECT PARTNER",
                    waiting_yui: "WAITING FOR YUI",
                    yui_asked: "YUI HAS ASKED YOU",
                    decision_made: "DECISION MADE",
                    a_moment: "A MOMENT TO DECIDE",
                    ren_asked: "REN HAS ASKED YOU",
                    your_turn: "YOUR TURN",
                    waiting_ren: "WAITING FOR REN"
                },
                intros: {
                    default: "Choose who you will work with. This changes the time and conversations available, but it does not decide the final ending by itself.",
                    host_initial: "Kai and Mei have both asked you. You can accept either invitation, or approach Yui yourself.",
                    host_waiting_yui: "You have asked Yui to work with you. She gets to make her own decision.",
                    host_reconsider: "You already accepted another invitation. Do you want to keep that plan, or reconsider?",
                    host_waiting_other: "Your choice is in. The project groups will settle once Yui has made her decision.",
                    settled: "Your project group has been settled.",
                    guest_initial: "Ren has not made his choice yet. Hana is waiting for your answer, and you still have time to decide whether to ask Ren.",
                    guest_ren_asked: "You can accept his invitation or choose to work with Hana. Neither answer is owed to anyone.",
                    guest_turn: "Ren has chosen another direction for now. You can ask him yourself, or make a plan with Hana.",
                    guest_waiting_ren: "Your choice is in. Ren has to decide whether to accept your request or keep his original plan."
                },
                notices: {
                    invitation_sent: "Your invitation has been sent. You cannot choose her answer for her.",
                    waiting_perspective: "Waiting for the other perspective to make a choice.",
                    recorded: "Your choice has been recorded. Continue to see how the first project meeting feels.",
                    waiting_classroom: "Waiting for the classroom to settle. You will see the available choices once Ren has made his decision.",
                    next_step_his: "You have made your decision. The next step is his."
                },
                buttons: {
                    kai_invite: "Accept Kai’s invitation",
                    kai_detail: "Familiar, relaxed, and easy to work with.",
                    mei_invite: "Accept Mei’s invitation",
                    mei_detail: "A practical partnership with clear plans.",
                    ask_yui_casual: "Ask Yui casually",
                    ask_yui_casual_detail: "Keep it light: “Want to work together?”",
                    ask_yui_direct: "Ask Yui directly",
                    ask_yui_direct_detail: "Be honest that you would like to get to know her better.",
                    ask_yui_playful: "Ask Yui with a joke",
                    ask_yui_playful_detail: "Use humor to make the question less intimidating.",
                    accept_yui_request: "Accept Yui’s request",
                    accept_yui_detail: "Change your project partner and take the chance.",
                    stay_with_partner: "Stay with {partner}",
                    stay_with_detail: "Keep the commitment you already made.",
                    accept_ren_invite: "Accept Ren’s invitation",
                    accept_ren_detail: "You are curious about what spending time together might be like.",
                    choose_hana: "Choose Hana",
                    choose_hana_detail_ren: "Stay with the friend you know and trust.",
                    choose_hana_detail_guest: "Keep the project comfortable and familiar.",
                    ask_ren_casual: "Ask Ren casually",
                    ask_ren_casual_detail: "Make it sound like a simple project question.",
                    ask_ren_direct: "Ask Ren directly",
                    ask_ren_direct_detail: "Tell him you would like to work together.",
                    ask_ren_playful: "Ask Ren with a joke",
                    ask_ren_playful_detail: "Use a little humor to make the risk easier."
                }
            },
            toast: {
                username_updated: "Username updated successfully.",
                username_error: "Could not update username.",
                lang_updated: "Language updated.",
                uid_copied: "User ID copied.",
                uid_prefix: "User ID: ",
                sound_enabled: "Sound effects enabled.",
                sound_muted: "Sound muted.",
                room_closed: "The other player left and this room was closed.",
                too_many_attempts: "Too many attempts. Please try again later.",
                firebase_sdk_error: "Firebase SDK could not load. Check your internet connection.",
                room_not_found: "Room not found. Check the code with your friend.",
                already_host: "You are already the host of this room.",
                room_full: "This room already has a second player.",
                room_started: "This room has already started.",
                room_claimed: "This room was claimed by another player just now.",
                join_failed: "Could not join this room.",
                lost_room_access: "Lost access to this room. Check the Firebase rules.",
                room_connection_missing: "Room connection is missing.",
                start_session_failed: "Could not start the session. Check database rules.",
                sync_action_failed: "Could not sync that action. Check database rules.",
                sync_progress_failed: "Could not sync progress."
            },
            common: { close: "Close", save: "Save", copy: "Copy" }
        },
        'zh-TW': {
            title: {
                website: "網站",
                kicker: "雙人戀愛故事",
                description: "兩位玩家。兩種視角。一個相連的故事。",
                choose_mode: "選擇你的故事",
                main_caption: "01 / 第一人稱",
                main_eyebrow: "親歷故事",
                main_title: "主角",
                main_desc: "親自體驗這段戀情。選擇你的言語，建立信任，決定學期如何展開。",
                begin: "開始",
                detective_caption: "02 / 第三人稱",
                detective_eyebrow: "扮演紅娘",
                detective_title: "偵探",
                detective_desc: "解開浪漫謎題，串聯線索，幫助兩顆心走向彼此。",
                coming_soon: "即將推出",
                academy: "星之宮學院",
                semester: "九月 至 十二月"
            },
            settings: {
                title: "設定",
                account: "帳號",
                username: "使用者名稱",
                user_id: "使用者 ID",
                google_signin: "已使用 Google 登入",
                sign_out: "登出",
                language: "語言",
                display_language: "顯示語言",
                language_desc: "選擇你偏好的語言",
                audio: "音效與音樂",
                volume: "音量",
                sound_fx: "音效",
                sound_fx_desc: "切換遊戲語音回饋",
                sound_on: "音效：開啟",
                sound_off: "音效：關閉"
            },
            player_ui: {
                default_scene_role: "課間的一刻",
                exit_story: "退出故事",
                scene_counter: "場景 {current} / {total}",
                back_to_conversation: "← 返回對話",
                choice_kicker: "你的故事，你的選擇",
                hint_choices_next: "對話至此結束。繼續前往下一頁做出你的選擇。",
                hint_continue: "繼續對話以看看接下來會發生什麼。",
                btn_back: "← 上一步",
                btn_forward: "前進 →",
                btn_choices: "選擇選項 →",
                btn_next: "下一步 →",
                scene_complete: "場景結束"
            },
            waiting: {
                eyebrow: "你們的小小私密世界",
                heading_html: "等待著<br><em>你的另一半</em>",
                subtitle: "還差一個人，你們的故事就能開始了。",
                room_code_eyebrow: "房間代碼",
                room_hint: "將此代碼發送給你的第二位玩家。",
                copy_title: "複製房間代碼",
                refresh_title: "重新整理房間狀態",
                host_label: "房主",
                host_name: "玩家一",
                guest_label: "訪客",
                guest_name: "玩家二",
                connected: "已連線",
                waiting_to_join: "等待加入",
                note_ready: "你們都到了。準備好後，一起開始故事吧。",
                note_waiting: "房間已準備就緒。只要第二位玩家加入，下一章就屬於你們。",
                begin_together: "一起開始",
                waiting_player_two: "等待第二位玩家…",
                leave_room: "離開房間"
            },
            lobby: {
                eyebrow: "屬於兩人的小空間",
                heading: "在這裡 <em>相遇。</em>",
                subtitle: "為你的故事建立一個房間，或加入已經在等待的人。",
                back_modes: "更改模式",
                create_eyebrow: "開啟新局",
                create_title: "建立房間",
                create_desc: "你將成為 <b>第一玩家</b>（房主）。建立房間即可開始。",
                player_one: "第一玩家",
                room_host: "房主",
                you: "你",
                create_btn: "建立房間",
                join_eyebrow: "攜手同行",
                join_title: "加入房間",
                join_desc: "你將成為 <b>第二玩家</b>。請輸入房主提供的六位數代碼。",
                player_two: "第二玩家",
                guest_player: "訪客玩家",
                invited: "已受邀",
                room_code_label: "房間代碼",
                join_btn: "加入",
                footer_brand: "雙人戀愛故事 · 兩種視角，一個故事",
                local_preview: "測試本地預覽"
            },
            story_intro: {
                kicker: "你的故事將繼續",
                role_label: "你的角色",
                ren_title: "蓮的視角",
                ren_copy: "你將透過蓮體驗這個學期：他的友誼、他的決定，以及那些他難以言說的心思。你的夥伴正在同一個校園裡經歷另一種生活。",
                yui_title: "唯的視角",
                yui_copy: "你將透過唯體驗這個學期：她的友誼、她的決定，以及她所注意到的小細節。你的夥伴正在同一個校園裡經歷另一種生活。",
                objective_label: "目標",
                default_objective: "繼續你的學期旅程。",
                info_label: "章節資訊",
                info_copy: "即將進入第 {num} 章。與你的夥伴協調、審視你的選擇，並審慎做出決定。",
                begin_btn: "開始第 {num} 章 →",
                loading_chapter: "正在載入章節…",
                exit_btn: "退出"
            },
            scene_choices: {
                waiting_ren_heading: "等待蓮的選擇",
                waiting_ren_p: "蓮需要先選擇在哪裡合作，你才能做出回應。你的回答對另一位玩家保密。",
                waiting_ren_notice: "正在等待蓮發出邀請。",
                waiting_msg_heading: "等待訊息",
                waiting_msg_p: "生病的角色需要先決定是否分享發生的事。",
                waiting_msg_notice: "正在等待另一位玩家。",
                major_decision: "重大決定",
                your_decision: "你的決定",
                page_title: "你會如何選擇？",
                major_desc: "這個選擇將在後續章節中產生迴響。",
                standard_desc: "你要怎麼做？"
            },
            project_decision: {
                outcomes: {
                    ren_yui_guest: "蓮邀請你與他同組。你決定接受。這個決定在紙面上很小——只是一個分組夥伴——但它給了你們在一起度過時光、了解彼此習慣的理由，並探索教室之外的可能。",
                    ren_yui_host_direct: "你坦白告訴唯，你想更深入地了解她。",
                    ren_yui_host_playful: "你用一個玩笑掩飾些許緊張，而唯笑著回答了你。",
                    ren_yui_host_casual: "你隨口詢問唯，試圖讓這聽起來像個簡單的問題，即使你很在意答案。",
                    ren_yui_host_end: "她同意與你同組。你告訴自己這只是一個分組，但你已經在期待與她度過更多時光會是什麼樣子。",
                    yui_asked_guest_direct: "你直接告訴蓮你想與他同組。",
                    yui_asked_guest_playful: "你開了個玩笑來緩和氣氛，然後等待他的回答。",
                    yui_asked_guest_casual: "你隨口問蓮，給他拒絕的空間，而不讓這一刻顯得過於沉重。",
                    yui_asked_guest_end: "蓮同意了，你感受到的鬆了一口氣比想像中更溫暖。花從教室另一頭給了你一個誇張的大拇指。",
                    yui_asked_host: "唯問你是否會重新考慮。你決定還是與她同組。阿凱裝作不失望；芽衣則只是要你確保這個選擇是你能夠承擔的。",
                    declined_guest: "你決定與花同组。蓮的邀請很親切，但你還沒準備好跨出那一步——或者你只是覺得這個分組與朋友最合適。你依然可以按自己的步調去認識蓮。",
                    declined_host: "你邀請了唯，但她選擇了與花同組。失望很微小但很真實。你決定尊重她的選擇，並與其他人一起做好這個課題。",
                    separate_guest: "你和蓮選擇了不同的夥伴。這並不是拒絕一段剛開始的友誼；這只是今天感覺最合適的選擇。以後還有其他交談的機會。",
                    separate_host: "你和唯選擇了不同的夥伴。你無法得知如果做別的選擇會發生什麼，那也無妨。學期還很長，一個決定並不代表一切連結。",
                    default_outcome: "課題小組開始形成。一個微小的決定已經做出了，學期繼續前行。"
                },
                headings: {
                    major_decision: "重大決定 · 課題夥伴",
                    waiting_yui: "等待唯的選擇",
                    yui_asked: "唯邀請了你",
                    decision_made: "決定已做出",
                    a_moment: "抉擇的時刻",
                    ren_asked: "蓮邀請了你",
                    your_turn: "輪到你了",
                    waiting_ren: "等待蓮的選擇"
                },
                intros: {
                    default: "選擇你要合作的人。這會改變可用的時間與對話，但它本身不會決定最終的結局。",
                    host_initial: "阿凱和芽衣都邀請了你。你可以接受任何一方的邀請，或者自己去找唯。",
                    host_waiting_yui: "你已經邀請了唯與你同組。她可以做出她自己的決定。",
                    host_reconsider: "你已經接受了另一個邀請。你想保持原計畫，還是重新考慮？",
                    host_waiting_other: "你的選擇已提交。一旦唯做出決定，分組就會定下來。",
                    settled: "你的課題小組已經確定。",
                    guest_initial: "蓮還沒做出選擇。花在等待你的答案，你依然有時間決定是否要邀請蓮。",
                    guest_ren_asked: "你可以接受他的邀請，或是選擇與花同組。你不欠任何人任何答案。",
                    guest_turn: "蓮暫時選擇了別的方向。你可以自己邀請他，或是與花一起計畫。",
                    guest_waiting_ren: "你的選擇已提交。蓮需要決定是接受你的請求還是保持原計畫。"
                },
                notices: {
                    invitation_sent: "你的邀請已發送。你無法替她做出決定。",
                    waiting_perspective: "正在等待另一位的選擇。",
                    recorded: "你的選擇已記錄。繼續進行，看看第一次小組討論的感覺。",
                    waiting_classroom: "等待教室安靜下來。一旦蓮做出決定，你就會看到可用的選項。",
                    next_step_his: "你已經做出了決定。下一步輪到他了。"
                },
                buttons: {
                    kai_invite: "接受阿凱的邀請",
                    kai_detail: "熟悉、輕鬆且容易合作。",
                    mei_invite: "接受芽衣的邀請",
                    mei_detail: "目標明確且務實的合作夥伴關係。",
                    ask_yui_casual: "隨口問問唯",
                    ask_yui_casual_detail: "輕鬆一點：「要一起組隊嗎？」",
                    ask_yui_direct: "直接邀請唯",
                    ask_yui_direct_detail: "坦白表達你想更認識她。",
                    ask_yui_playful: "開玩笑地邀請唯",
                    ask_yui_playful_detail: "用幽默感減輕問題的壓迫感。",
                    accept_yui_request: "接受唯的請求",
                    accept_yui_detail: "改變你的夥伴並把握機會。",
                    stay_with_partner: "保持與 {partner} 同組",
                    stay_with_detail: "遵守你已經做出的承諾。",
                    accept_ren_invite: "接受蓮的邀請",
                    accept_ren_detail: "你對一起度過時光會是什麼樣子感到好奇。",
                    choose_hana: "選擇花",
                    choose_hana_detail_ren: "留在一起熟悉且信任的朋友身邊。",
                    choose_hana_detail_guest: "讓合作保持舒服與熟悉。",
                    ask_ren_casual: "隨口問問蓮",
                    ask_ren_casual_detail: "讓這聽起來像個簡單的課題問題。",
                    ask_ren_direct: "直接邀請蓮",
                    ask_ren_direct_detail: "告訴他你想一起合作。",
                    ask_ren_playful: "開玩笑地邀請蓮",
                    ask_ren_playful_detail: "用一點幽默讓冒險變得更容易。"
                }
            },
            toast: {
                username_updated: "使用者名稱更新成功。",
                username_error: "無法更新使用者名稱。",
                lang_updated: "語言已更新。",
                uid_copied: "使用者 ID 已複製。",
                uid_prefix: "使用者 ID：",
                sound_enabled: "音效已啟用。",
                sound_muted: "音效已靜音。",
                room_closed: "另一位玩家已離開，此房間已關閉。",
                too_many_attempts: "嘗試次數過多。請稍後再試。",
                firebase_sdk_error: "Firebase SDK 無法載入。請檢查您的網路連線。",
                room_not_found: "找不到房間。請與你的朋友確認房間代碼。",
                already_host: "你已經是這個房間的房主。",
                room_full: "這個房間已經有第二位玩家了。",
                room_started: "這個房間的遊戲已經開始。",
                room_claimed: "剛才已有其他玩家加入了這個房間。",
                join_failed: "無法加入這個房間。",
                lost_room_access: "失去此房間的存取權限。請檢查 Firebase 規則。",
                room_connection_missing: "缺少房間連線。",
                start_session_failed: "無法開始遊戲。請檢查資料庫規則。",
                sync_action_failed: "無法同步該操作。請檢查資料庫規則。",
                sync_progress_failed: "無法同步進度。"
            },
            common: { close: "關閉", save: "儲存", copy: "複製" }
        },
        ja: {
            title: {
                website: "ウェブサイト",
                kicker: "二人で紡ぐ恋愛物語",
                description: "二人のプレイヤー。二つの視点。繋がる一つの物語。",
                choose_mode: "ストーリーを選択",
                main_caption: "01 / 一人称",
                main_eyebrow: "物語を生きる",
                main_title: "メインキャラクター",
                main_desc: "二人の学園生活を体験。言葉を選び、絆を深め、学期の行方を決めよう。",
                begin: "始める",
                detective_caption: "02 / 三人称",
                detective_eyebrow: "キューピッド役",
                detective_title: "探偵モード",
                detective_desc: "手懸かりを繋ぎ合わせ、二人の距離を縮める手助けをしよう。",
                coming_soon: "近日公開",
                academy: "星ノ宮学園",
                semester: "9月 — 12月"
            },
            settings: {
                title: "設定",
                account: "アカウント",
                username: "ユーザー名",
                user_id: "ユーザーID",
                google_signin: "Googleでサインイン中",
                sign_out: "サインアウト",
                language: "言語",
                display_language: "表示言語",
                language_desc: "お好みの言語を選択してください",
                audio: "サウンド＆音楽",
                volume: "音量",
                sound_fx: "効果音",
                sound_fx_desc: "ゲームの音声フィードバックを切り替える",
                sound_on: "効果音: オン",
                sound_off: "効果音: オフ"
            },
            player_ui: {
                default_scene_role: "授業の間のひととき",
                exit_story: "ストーリーを出る",
                scene_counter: "シーン {current} / {total}",
                back_to_conversation: "← 会話に戻る",
                choice_kicker: "あなたの物語、あなたの選択",
                hint_choices_next: "ここで会話は終了します。次のページに進んで選択してください。",
                hint_continue: "会話を続けて、次に何が起きるか確かめましょう。",
                btn_back: "← 戻る",
                btn_forward: "進む →",
                btn_choices: "選択肢へ →",
                btn_next: "次へ →",
                scene_complete: "シーン完了"
            },
            waiting: {
                eyebrow: "二人だけの小さな世界",
                heading_html: "大切な人を<br><em>待っています。</em>",
                subtitle: "もう一人揃えば、物語が始まります。",
                room_code_eyebrow: "ルームコード",
                room_hint: "このコードをプレイヤー2に送信してください。",
                copy_title: "ルームコードをコピー",
                refresh_title: "ステータスを更新",
                host_label: "ホスト",
                host_name: "プレイヤー1",
                guest_label: "ゲスト",
                guest_name: "プレイヤー2",
                connected: "接続済み",
                waiting_to_join: "参加待ち",
                note_ready: "二人が揃いました。準備ができたら、一緒に物語を始めましょう。",
                note_waiting: "ルームの準備ができました。プレイヤー2が参加すると、次の章が始まります。",
                begin_together: "一緒に始める",
                waiting_player_two: "プレイヤー2を待っています…",
                leave_room: "ルームを退出"
            },
            lobby: {
                eyebrow: "二人だけの小さな空間",
                heading: "ここで <em>待ち合わせ。</em>",
                subtitle: "ストーリーのための部屋を作るか、待っているパートナーに参加しよう。",
                back_modes: "モード変更",
                create_eyebrow: "物語を始める",
                create_title: "部屋を作る",
                create_desc: "あなたは<b>プレイヤー1</b>（ホスト）になります。部屋を作って始めましょう。",
                player_one: "プレイヤー1",
                room_host: "ルームホスト",
                you: "あなた",
                create_btn: "部屋を作る",
                join_eyebrow: "共に進む",
                join_title: "部屋に参加",
                join_desc: "あなたは<b>プレイヤー2</b>になります。ホストから受け取った6桁のコードを入力してください。",
                player_two: "プレイヤー2",
                guest_player: "ゲストプレイヤー",
                invited: "招待済み",
                room_code_label: "ルームコード",
                join_btn: "参加",
                footer_brand: "二人で紡ぐ恋愛物語 · 二つの視点、一つの物語",
                local_preview: "ローカルプレビューをテスト"
            },
            story_intro: {
                kicker: "物語は続く",
                role_label: "あなたの役割",
                ren_title: "蓮の視点",
                ren_copy: "蓮の視点を通して学期を体験します：彼の友人関係、決断、そして言葉にするのが難しい思い。パートナーは同じキャンパスで別の人生を歩んでいます。",
                yui_title: "ユイの視点",
                yui_copy: "ユイの視点を通して学期を体験します：彼女の友人関係、決断、そして気づいた些細なディテール。パートナーは同じキャンパスで別の人生を歩んでいます。",
                objective_label: "目標",
                default_objective: "学期の旅を続けましょう。",
                info_label: "チャプター情報",
                info_copy: "第 {num} 章へ。パートナーと連携し、選択肢を見直し、慎重に決断を下してください。",
                begin_btn: "第 {num} 章を始める →",
                loading_chapter: "チャプターを読み込んでいます…",
                exit_btn: "終了"
            },
            scene_choices: {
                waiting_ren_heading: "蓮の選択待ち",
                waiting_ren_p: "あなたが返答する前に、蓮がどこで課題をするか選ぶ必要があります。あなたの回答は相手のプレイヤーには非公開です。",
                waiting_ren_notice: "蓮からの招待を待っています。",
                waiting_msg_heading: "メッセージ待ち",
                waiting_msg_p: "体調を崩したキャラクターが、まず何が起きているかを共有するかどうか決める必要があります。",
                waiting_msg_notice: "相手のプレイヤーを待っています。",
                major_decision: "重大な決断",
                your_decision: "あなたの決断",
                page_title: "どれを選びますか？",
                major_desc: "この選択は後の章まで影響を及ぼします。",
                standard_desc: "どうしますか？"
            },
            project_decision: {
                outcomes: {
                    ren_yui_guest: "蓮がペアになろうと誘ってくれた。あなたは承諾する。紙の上では小さな決断――課題のペアを一人選ぶだけ――だが、一緒に過ごし、お互いの癖に気づき、教室の向こうにある何かを見つける理由になる。",
                    ren_yui_host_direct: "あなたはユイに、もっと彼女のことを知りたいと素直に伝える。",
                    ren_yui_host_playful: "ちょっとした冗談で緊張を隠し、ユイは笑顔で応える。",
                    ren_yui_host_casual: "返事を気にしながらも、ごく自然な質問のようにユイに声をかける。",
                    ren_yui_host_end: "彼女は承諾してくれた。ただの課題だ、と自分に言い聞かせるが、彼女と過ごす時間が増えることをすでに期待している。",
                    yui_asked_guest_direct: "あなたは蓮に、一緒に課題をやりたいとストレートに伝える。",
                    yui_asked_guest_playful: "冗談を交えて質問を和らげ、彼の返事を待つ。",
                    yui_asked_guest_casual: "重くなりすぎないよう、断る余地を残しながら蓮に声をかける。",
                    yui_asked_guest_end: "蓮は同意し、感じた安堵感は想像以上に温かいものだった。部屋の向こうでハナが大げさにサムズアップをしている。",
                    yui_asked_host: "ユイが考え直してくれないかと尋ねてくる。あなたはやはり彼女とペアになることを決める。カイは落胆を見せないようにし、メイは自分が納得できる選択をするようにと言った。",
                    declined_guest: "あなたはハナと組むことに決める。蓮の誘いは嬉しかったが、一歩踏み出す準備ができていないか、友達と組む方が合っていると感じたからだ。自分のペースで蓮を知っていけばいい。",
                    declined_host: "ユイを誘ったが、彼女はハナを選んだ。失望は小さいが確かに存在する。彼女の選択を尊重し、他の誰かと課題に全力で取り組むことにする。",
                    separate_guest: "あなたと蓮は別のパートナーを選ぶ。始まってもいない友情の拒絶ではない。今日しっくりくる選択をしただけだ。話す機会はこれからもいくらでもある。",
                    separate_host: "あなたとユイは別のパートナーを選ぶ。別の選択をしていたらどうなっていたかは分からないし、それでいい。新学期は長く、一つの決断ですべてが決まるわけではない。",
                    default_outcome: "課題グループが形作り始める。小さな決断が下され、学期は続いていく。"
                },
                headings: {
                    major_decision: "重大な決断 · 課題パートナー",
                    waiting_yui: "ユイの返答待ち",
                    yui_asked: "ユイからの誘い",
                    decision_made: "決断完了",
                    a_moment: "決断の瞬間",
                    ren_asked: "蓮からの誘い",
                    your_turn: "あなたの番",
                    waiting_ren: "蓮の返答待ち"
                },
                intros: {
                    default: "誰とペアを組むか選んでください。これにより使える時間や会話が変わりますが、これだけで結末が決まるわけではありません。",
                    host_initial: "カイとメイの両方から誘われました。どちらかの誘いを受けるか、自分でユイに声をかけることができます。",
                    host_waiting_yui: "ユイを課題に誘いました。彼女自身の決断を待ちましょう。",
                    host_reconsider: "すでに別の誘いを受けています。その予定通りにするか、考え直しますか？",
                    host_waiting_other: "選択が完了しました。ユイが決断を下せばグループが確定します。",
                    settled: "課題グループが確定しました。",
                    guest_initial: "蓮はまだ選択をしていません。ハナが返事を待っています。蓮を誘うかどうか決める時間はまだあります。",
                    guest_ren_asked: "彼の誘いを受けるか、ハナと組むかを選べます。誰にも義理を立てる必要はありません。",
                    guest_turn: "蓮は今のところ別の方向を選びました。自分で声をかけるか、ハナと計画を立てることができます。",
                    guest_waiting_ren: "選択が完了しました。蓮があなたの要望を受けるか、元の計画を維持するかを決定します。"
                },
                notices: {
                    invitation_sent: "誘いを送信しました。彼女の答えを代わりに選ぶことはできません。",
                    waiting_perspective: "もう一人の視点が選択するのを待っています。",
                    recorded: "選択が記録されました。最初のミーティングの雰囲気を確認しに進みましょう。",
                    waiting_classroom: "教室が落ち着くのを待っています。蓮が決断を下すと選択肢が表示されます。",
                    next_step_his: "あなたの決断は完了しました。次は彼の番です。"
                },
                buttons: {
                    kai_invite: "カイの誘いを受ける",
                    kai_detail: "気心が知れていて、気楽で組みやすい。",
                    mei_invite: "メイの誘いを受ける",
                    mei_detail: "明確な計画を持った実用的なパートナーシップ。",
                    ask_yui_casual: "カジュアルにユイを誘う",
                    ask_yui_casual_detail: "軽く聞いてみる：「一緒にやる？」",
                    ask_yui_direct: "ストレートにユイを誘う",
                    ask_yui_direct_detail: "もっと彼女を知りたいと素直に伝える。",
                    ask_yui_playful: "冗談交じりにユイを誘う",
                    ask_yui_playful_detail: "ユーモアを使って誘いやすくする。",
                    accept_yui_request: "ユイの願いを受ける",
                    accept_yui_detail: "パートナーを変更してチャンスを掴む。",
                    stay_with_partner: "{partner} と組み続ける",
                    stay_with_detail: "すでにした約束を守る。",
                    accept_ren_invite: "蓮の誘いを受ける",
                    accept_ren_detail: "一緒に時間を過ごすことがどんな感じか興味がある。",
                    choose_hana: "ハナを選ぶ",
                    choose_hana_detail_ren: "信頼できるいつもの友達と一緒にいる。",
                    choose_hana_detail_guest: "気楽で気心が知れたパートナーシップを維持する。",
                    ask_ren_casual: "カジュアルに蓮を誘う",
                    ask_ren_casual_detail: "単純な課題の質問のように見せる。",
                    ask_ren_direct: "ストレートに蓮を誘う",
                    ask_ren_direct_detail: "一緒に課題をやりたいと伝える。",
                    ask_ren_playful: "冗談交じりに蓮を誘う",
                    ask_ren_playful_detail: "少しのユーモアでリスクを減らす。"
                }
            },
            toast: {
                username_updated: "ユーザー名が更新されました。",
                username_error: "ユーザー名を更新できませんでした。",
                lang_updated: "言語が更新されました。",
                uid_copied: "ユーザーIDをコピーしました。",
                uid_prefix: "ユーザーID: ",
                sound_enabled: "効果音が有効になりました。",
                sound_muted: "サウンドがミュートされました。",
                room_closed: "もう一人のプレイヤーが退出したため、このルームは閉じられました。",
                too_many_attempts: "試行回数が多すぎます。しばらくしてからもう一度お試しください。",
                firebase_sdk_error: "Firebase SDKを読み込めませんでした。インターネット接続を確認してください。",
                oom_not_found: "ルームが見つかりません。友達とコードを確認してください。",
                already_host: "あなたはこのルームのホストです。",
                room_full: "このルームにはすでに2人目のプレイヤーがいます。",
                room_started: "このルームはすでに開始されています。",
                room_claimed: "たった今、他のプレイヤーがこのルームに参加しました。",
                join_failed: "ルームに参加できませんでした。",
                lost_room_access: "このルームへのアクセスが失われました。Firebaseルールを確認してください。",
                room_connection_missing: "ルーム接続が見つかりません。",
                start_session_failed: "セッションを開始できませんでした。データベースルールを確認してください。",
                sync_action_failed: "アクションを同期できませんでした。データベースルールを確認してください。",
                sync_progress_failed: "進捗を同期できませんでした。"
            },
            common: { close: "閉じる", save: "保存", copy: "コピー" }
        },
        ko: {
            title: {
                website: "웹사이트",
                kicker: "두 사람을 위한 로맨스",
                description: "두 명의 플레이어. 두 개의 시선. 하나의 연결된 이야기.",
                choose_mode: "이야기 선택",
                main_caption: "01 / 1인칭",
                main_eyebrow: "스토리를 체험",
                main_title: "주인공 모드",
                main_desc: "로맨스를 직접 경험해보세요. 말을 선택하고, 신뢰를 쌓고, 학기의 흐름을 결정하세요.",
                begin: "시작하기",
                detective_caption: "02 / 3인칭",
                detective_eyebrow: "큐피드 역할",
                detective_title: "탐정 모드",
                detective_desc: "단서를 연결하고 두 사람의 마음이 이어지도록 도와주세요.",
                coming_soon: "출시 예정",
                academy: "호시노미야 학원",
                semester: "9월 — 12월"
            },
            settings: {
                title: "설정",
                account: "계정",
                username: "사용자 이름",
                user_id: "사용자 ID",
                google_signin: "Google로 로그인됨",
                sign_out: "로그아웃",
                language: "언어",
                display_language: "표시 언어",
                language_desc: "선호하는 언어를 선택하세요",
                audio: "오디오 및 음악",
                volume: "볼륨",
                sound_fx: "효과음",
                sound_fx_desc: "게임 오디오 피드백 전환",
                sound_on: "효과음: 켜짐",
                sound_off: "효과음: 꺼짐"
            },
            player_ui: {
                default_scene_role: "수업 사이의 한때",
                exit_story: "이야기 나가기",
                scene_counter: "장면 {current} / {total}",
                back_to_conversation: "← 대화로 돌아가기",
                choice_kicker: "당신의 이야기, 당신의 선택",
                hint_choices_next: "대화가 여기서 끝납니다. 다음 페이지로 이동하여 선택하세요.",
                hint_continue: "대화를 계속 진행하여 다음에 무슨 일이 일어나는지 확인하세요.",
                btn_back: "← 뒤로",
                btn_forward: "앞으로 →",
                btn_choices: "선택지 →",
                btn_next: "다음 →",
                scene_complete: "장면 완료"
            },
            waiting: {
                eyebrow: "두 사람만의 작은 세상",
                heading_html: "기다리는 중<br><em>당신의 사람을.</em>",
                subtitle: "한 사람만 더 오면 이야기와 시작될 것입니다.",
                room_code_eyebrow: "방 코드",
                room_hint: "이 코드를 두 번째 플레이어에게 보내주세요.",
                copy_title: "방 코드 복사",
                refresh_title: "상태 새로고침",
                host_label: "호스트",
                host_name: "플레이어 1",
                guest_label: "게스트",
                guest_name: "플레이어 2",
                connected: "연결됨",
                waiting_to_join: "참가 대기 중",
                note_ready: "두 분 모두 모였습니다. 편안하게 준비되시면 이야기를 함께 시작하세요.",
                note_waiting: "방이 준비되었습니다. 두 번째 플레이어가 참가하는 대로 다음 장이 시작됩니다.",
                begin_together: "함께 시작하기",
                waiting_player_two: "플레이어 2를 기다리는 중…",
                leave_room: "방 나가기"
            },
            lobby: {
                eyebrow: "두 사람만을 위한 공간",
                heading: "여기서 <em>만나요.</em>",
                subtitle: "이야기를 위한 방을 만들거나, 기다리고 있는 사람의 방에 참여하세요.",
                back_modes: "모드 변경",
                create_eyebrow: "새로운 시작",
                create_title: "방 만들기",
                create_desc: "당신은 <b>플레이어 1</b>(호스트)이 됩니다. 방을 만들고 시작하세요.",
                player_one: "플레이어 1",
                room_host: "방 호스트",
                you: "나",
                create_btn: "방 만들기",
                join_eyebrow: "함께하기",
                join_title: "방 참여하기",
                join_desc: "당신은 <b>플레이어 2</b>가 됩니다. 호스트에게 받은 6자리 코드를 입력하세요.",
                player_two: "플레이어 2",
                guest_player: "게스트 플레이어",
                invited: "초대됨",
                room_code_label: "방 코드",
                join_btn: "참여",
                footer_brand: "두 사람을 위한 로맨스 · 두 개의 시선, 하나의 이야기",
                local_preview: "로컬 미리보기 테스트"
            },
            story_intro: {
                kicker: "당신의 이야기가 계속됩니다",
                role_label: "당신의 역할",
                ren_title: "렌의 시점",
                ren_copy: "렌의 시점에서 학기를 경험하게 됩니다: 그의 우정, 그의 결정, 그리고 말로 표현하기 어려운 마음들. 파트너는 같은 캠퍼스에서 또 다른 삶을 살아가고 있습니다.",
                yui_title: "유이의 시점",
                yui_copy: "유이의 시점에서 학기를 경험하게 됩니다: 그녀의 우정, 그녀의 결정, 그리고 그녀가 알아차리는 사소한 디테일들. 파트너는 같은 캠퍼스에서 또 다른 삶을 살아가고 있습니다.",
                objective_label: "목표",
                default_objective: "학기를 통한 여정을 계속하세요.",
                info_label: "챕터 정보",
                info_copy: "{num}장에 진입합니다. 파트너와 조율하고, 선택을 검토하며, 신중하게 결정을 내리세요.",
                begin_btn: "{num}장 시작하기 →",
                loading_chapter: "챕터 로딩 중…",
                exit_btn: "나가기"
            },
            scene_choices: {
                waiting_ren_heading: "렌의 결정 대기 중",
                waiting_ren_p: "당신이 응답하기 전에 렌이 어디서 일할지 먼저 선택해야 합니다. 당신의 대답은 상대 플레이어에게 비공개로 유지됩니다.",
                waiting_ren_notice: "렌이 초대를 보내기를 기다리는 중입니다.",
                waiting_msg_heading: "메시지 대기 중",
                waiting_msg_p: "아픈 캐릭터가 무슨 일이 일어나고 있는지 먼저 공유할지 결정해야 합니다.",
                waiting_msg_notice: "상대 플레이어를 기다리는 중입니다.",
                major_decision: "중요한 결정",
                your_decision: "당신의 결정",
                page_title: "무엇을 선택하시겠습니까?",
                major_desc: "이 선택은 이후 챕터까지 울려 퍼질 것입니다.",
                standard_desc: "어떻게 하시겠습니까?"
            },
            project_decision: {
                outcomes: {
                    ren_yui_guest: "렌이 함께 조를 짜자고 요청합니다. 당신은 수락하기로 합니다. 종이 위에서의 결정은 작지만—단 한 명의 과제 파트너—함께 시간을 보내고, 서로의 습관을 알아가며, 교실 너머에 무엇이 있는지 발견할 구실이 되어줍니다.",
                    ren_yui_host_direct: "당신은 유이에게 더 알아가고 싶다고 솔직하게 말합니다.",
                    ren_yui_host_playful: "장난 뒤로 긴장감을 조금 숨기자, 유이가 미소로 답합니다.",
                    ren_yui_host_casual: "답이 신경 쓰이면서도 가벼운 질문인 척 유이에게 입을 뗍니다.",
                    ren_yui_host_end: "그녀는 함께하기로 응합니다. 그냥 과제일 뿐이라고 스스로 다짐하지만, 그녀와 더 많은 시간을 보내는 것이 어떨지 벌써 기대됩니다.",
                    yui_asked_guest_direct: "당신은 렌에게 함께 과제를 하고 싶다고 직접 말합니다.",
                    yui_asked_guest_playful: "질문을 부드럽게 만들기 위해 장난을 친 후 그의 대답을 기다립니다.",
                    yui_asked_guest_casual: "순간이 너무 무거워지지 않도록 거절할 여지를 주며 렌에게 무심하게 물어봅니다.",
                    yui_asked_guest_end: "렌이 동의하고, 당신이 느끼는 안도감은 생각보다 따뜻합니다. 하나가 저편에서 과장되게 엄지를 들어 올려 보입니다.",
                    yui_asked_host: "유이가 다시 생각해 줄 수 있는지 물어봅니다. 당신은 결국 그녀와 함께하기로 합니다. 카이는 실망하지 않은 척하고, 메이는 그저 자신이 책임질 수 있는 선택을 하라고 말해줍니다.",
                    declined_guest: "당신은 하나와 함께하기로 결정합니다. 렌의 제안은 친절했지만, 당신은 아직 그 단계를 밟을 준비가 되지 않았거나 친구와 함께하는 것이 더 편하다고 느꼈습니다. 렌은 자신만의 속도로 알아가면 됩니다.",
                    declined_host: "유이에게 물어보았지만 그녀는 하나와 일하는 것을 선택했습니다. 실망감은 작지만 분명합니다. 그녀의 선택을 존중하고 다른 사람과 최선을 다하기로 합니다.",
                    separate_guest: "당신과 렌은 서로 다른 파트너를 선택합니다. 겨우 시작된 우정을 거절하는 것이 아니라, 그저 오늘 자신에게 가장 맞는 선택을 한 것입니다. 이야기할 기회는 앞으로도 있습니다.",
                    separate_host: "당신과 유이는 서로 다른 파트너를 선택합니다. 다른 선택을 했다면 어땠을지 알 길은 없으며, 그것으로 충분합니다. 학기는 길고, 하나의 결정이 모든 인연을 결정짓지 않습니다.",
                    default_outcome: "과제 조가 형성되기 시작합니다. 작은 결정이 내려졌고, 학기는 계속됩니다."
                },
                headings: {
                    major_decision: "중요한 결정 · 과제 파트너",
                    waiting_yui: "유이의 결정 대기 중",
                    yui_asked: "유이가 당신에게 부탁했습니다",
                    decision_made: "결정 완료",
                    a_moment: "결정의 순간",
                    ren_asked: "렌이 당신에게 부탁했습니다",
                    your_turn: "당신의 차례",
                    waiting_ren: "렌의 결정 대기 중"
                },
                intros: {
                    default: "함께 일할 사람을 선택하세요. 이것은 이용 가능한 시간과 대화를 바꾸지만, 결정 자체가 최종 엔딩을 정하지는 않습니다.",
                    host_initial: "카이와 메이 모두 당신에게 부탁했습니다. 둘 중 하나의 제안을 수락하거나, 유이에게 직접 다가갈 수 있습니다.",
                    host_waiting_yui: "유이에게 함께 하자고 요청했습니다. 그녀는 자신만의 결정을 내리게 됩니다.",
                    host_reconsider: "이미 다른 제안을 수락했습니다. 그 계획을 유지할지, 다시 생각할지 결정하시겠습니까?",
                    host_waiting_other: "선택이 완료되었습니다. 유이가 결정을 내리면 조가 확정됩니다.",
                    settled: "과제 조가 확정되었습니다.",
                    guest_initial: "렌은 아직 선택을 내리지 않았습니다. 하나가 당신의 대답을 기다리고 있으며, 렌에게 물어볼지 결정할 시간이 있습니다.",
                    guest_ren_asked: "그의 제안을 수락하거나 하나와 함께하기로 선택할 수 있습니다. 누구에게도 답을 빚진 것은 없습니다.",
                    guest_turn: "렌은 지금으로서는 다른 방향을 선택했습니다. 직접 물어보거나 하나와 계획을 세울 수 있습니다.",
                    guest_waiting_ren: "선택이 완료되었습니다. 렌이 당신의 요청을 수락할지, 원래 계획을 유지할지 결정해야 합니다."
                },
                notices: {
                    invitation_sent: "초대가 전송되었습니다. 그녀의 대답을 대신 선택할 수는 없습니다.",
                    waiting_perspective: "다른 시점이 선택하기를 기다리는 중입니다.",
                    recorded: "선택이 기록되었습니다. 계속 진행하여 첫 과제 모임이 어떤지 확인하세요.",
                    waiting_classroom: "교실이 정돈되기를 기다리는 중입니다. 렌이 결정을 내리면 선택 항목이 표시됩니다.",
                    next_step_his: "결정을 내렸습니다. 다음 단계는 그의 차례입니다."
                },
                buttons: {
                    kai_invite: "카이의 제안 수락",
                    kai_detail: "익숙하고 편안하며 함께 일하기 쉽습니다.",
                    mei_invite: "메이의 제안 수락",
                    mei_detail: "명확한 계획이 있는 실용적인 파트너십.",
                    ask_yui_casual: "유이에게 무심하게 물어보기",
                    ask_yui_casual_detail: "가볍게: “같이 조 할래?”",
                    ask_yui_direct: "유이에게 솔직하게 물어보기",
                    ask_yui_direct_detail: "그녀를 더 알아가고 싶다고 솔직하게 말합니다.",
                    ask_yui_playful: "유이에게 농담처럼 물어보기",
                    ask_yui_playful_detail: "유머를 사용하여 질문의 부담을 줄입니다.",
                    accept_yui_request: "유이의 요청 수락",
                    accept_yui_detail: "파트너를 변경하고 기회를 잡으세요.",
                    stay_with_partner: "{partner}와(과) 함께하기",
                    stay_with_detail: "이미 한 약속을 지킵니다.",
                    accept_ren_invite: "렌의 제안 수락",
                    accept_ren_detail: "함께 시간을 보내는 것이 어떨지 궁금합니다.",
                    choose_hana: "하나 선택하기",
                    choose_hana_detail_ren: "알고 있고 신뢰하는 친구 곁에 남습니다.",
                    choose_hana_detail_guest: "과제를 편안하고 익숙하게 유지하세요.",
                    ask_ren_casual: "렌에게 무심하게 물어보기",
                    ask_ren_casual_detail: "단순한 과제 질문처럼 보이게 만듭니다.",
                    ask_ren_direct: "렌에게 솔직하게 물어보기",
                    ask_ren_direct_detail: "함께 일하고 싶다고 말합니다.",
                    ask_ren_playful: "렌에게 농담처럼 물어보기",
                    ask_ren_playful_detail: "약간의 유머를 사용하여 위험을 완화합니다."
                }
            },
            toast: {
                username_updated: "사용자 이름이 성공적으로 업데이트되었습니다.",
                username_error: "사용자 이름을 업데이트할 수 없습니다.",
                lang_updated: "언어가 업데이트되었습니다.",
                uid_copied: "사용자 ID가 복사되었습니다.",
                uid_prefix: "사용자 ID: ",
                sound_enabled: "효과음이 켜졌습니다.",
                sound_muted: "사운드가 음소거되었습니다.",
                room_closed: "다른 플레이어가 나가서 방이 닫혔습니다.",
                too_many_attempts: "시도 횟수가 너무 많습니다. 나중에 다시 시도해 주세요.",
                firebase_sdk_error: "Firebase SDK를 로드할 수 없습니다. 인터넷 연결을 확인하세요.",
                room_not_found: "방을 찾을 수 없습니다. 친구와 코드를 확인해 보세요.",
                already_host: "당신은 이미 이 방의 방장입니다.",
                room_full: "이 방에는 이미 두 번째 플레이어가 있습니다.",
                room_started: "이 방은 이미 시작되었습니다.",
                room_claimed: "방금 다른 플레이어가 이 방에 입장했습니다.",
                join_failed: "이 방에 입장할 수 없습니다.",
                lost_room_access: "이 방에 대한 접근 권한을 잃었습니다. Firebase 규칙을 확인하세요.",
                room_connection_missing: "방 연결이 누락되었습니다.",
                start_session_failed: "세션을 시작할 수 없습니다. 데이터베이스 규칙을 확인하세요.",
                sync_action_failed: "해당 작업을 동기화할 수 없습니다. 데이터베이스 규칙을 확인하세요.",
                sync_progress_failed: "진행 상황을 동기화할 수 없습니다."
            },
            common: { close: "닫기", save: "저장", copy: "복사" }
        }
    };
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
                    if (++tries >= 5) {
                        toast(t('toast.too_many_attempts'));
                        throw { code: "cancelled" };
                    }
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
        if (!window.firebase) { toast(t('toast.firebase_sdk_error')); return false; }
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
                const unsubscribe = auth.onAuthStateChanged(async user => {
                    unsubscribe();
                    if (user) {
                        baseRef = firestoreDb.collection("users").doc(user.uid);
                        state.online = true;
                        setConnection(true, 'Connected');

                        try {
                            const snap = await baseRef.get();
                            if (snap.exists && snap.data()?.settings?.language) {
                                state.language = snap.data().settings.language;
                                if (state.screen === 'home') home();
                            }
                        } catch (err) {
                            console.error("Could not load user language settings:", err);
                        }
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
                            if (snap.data()?.settings?.language) {
                                state.language = snap.data().settings.language;
                            }
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

    function getText(value) {
        if (!value) return '';
        if (typeof value === 'string') return value;
        const lang = state.language || 'en';
        return value[lang] || value['en'] || Object.values(value)[0] || '';
    }
    function t(path, params = {}) {
        const lang = state.language || 'en';
        const keys = path.split('.');
        let current = TRANSLATIONS[lang] || TRANSLATIONS['en'];

        for (const key of keys) {
            if (current && current[key] !== undefined) {
                current = current[key];
            } else {
                let fallback = TRANSLATIONS['en'];
                for (const fk of keys) {
                    if (fallback && fallback[fk] !== undefined) fallback = fallback[fk];
                    else return path;
                }
                current = fallback;
                break;
            }
        }

        if (typeof current === 'string') {
            return current.replace(/\{(\w+)\}/g, (_, k) => params[k] !== undefined ? params[k] : `{${k}}`);
        }
        return current;
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
                if (snap.exists) {
                    if (snap.data().username) {
                        currentUsername = snap.data().username;
                    }
                    if (snap.data()?.settings?.language) {
                        state.language = snap.data().settings.language;
                    }
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
        const currentLang = state.language || 'en';

        const languages = [
            { code: 'en', label: 'English' },
            { code: 'zh-TW', label: '繁體中文' },
            { code: 'ja', label: '日本語' },
            { code: 'ko', label: '한국어' }
        ];

        const activeLangLabel = languages.find(l => l.code === currentLang)?.label || 'English';

        profileModalEl.classList.remove("hide");
        profileModalEl.innerHTML = `
        <div class="gate-card settings-card">
            <button class="gate-x ghost iconbtn" id="pClose" aria-label="${safe(t('common.close', 'Close'))}">✕</button>
            <h2>${safe(t('settings.title', 'Settings'))}</h2>
            
            <div class="sec">
                <h3>${safe(t('settings.account', 'Account'))}</h3>
                <div class="acct">
                    <div class="avatar">
                        ${user.photoURL ? `<img src="${safe(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span>${safe(currentUsername.charAt(0).toUpperCase())}</span>`}
                    </div>
                    <div class="who">
                        <label for="modalUsername">${safe(t('settings.username', 'Username'))}</label>
                        <div class="row">
                            <input id="modalUsername" class="text-input grow" maxlength="30" value="${safe(currentUsername)}">
                            <button class="secondary-button" id="saveUsername">${safe(t('common.save', 'Save'))}</button>
                        </div>
                    </div>
                </div>
                <div class="setrow">
                    <div>
                        <b>${safe(t('settings.user_id', 'User ID'))}</b>
                        <div class="copy">${safe(user.uid)}</div>
                    </div>
                    <button class="secondary-button" id="copyUserId">${safe(t('common.copy', 'Copy'))}</button>
                </div>
                <div class="setrow">
                    <div>
                        <b>${safe(t('settings.google_signin', 'Signed in with Google'))}</b>
                        <div class="muted">${safe(user.email || '')}</div>
                    </div>
                    <button class="secondary-button danger" id="modalSignOut">${safe(t('settings.sign_out', 'Sign out'))}</button>
                </div>
            </div>

            <div class="sec">
                <h3>${safe(t('settings.language', 'Language'))}</h3>
                <div class="setrow">
                    <div>
                        <b>${safe(t('settings.display_language', 'Display Language'))}</b>
                        <div class="muted">${safe(t('settings.language_desc', 'Choose your preferred language'))}</div>
                    </div>
                    
                    <!-- Custom Language Dropdown -->
                    <div class="custom-dropdown" id="customLangDropdown">
                        <button class="custom-dropdown-trigger" id="langTrigger" type="button" aria-expanded="false">
                            <span id="activeLangLabel">${safe(activeLangLabel)}</span>
                            <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                        <div class="custom-dropdown-menu hide" id="langMenu">
                            ${languages.map(l => `
                                <button class="custom-dropdown-item ${l.code === currentLang ? 'active' : ''}" data-lang="${l.code}" type="button">
                                    <span>${safe(l.label)}</span>${l.code === currentLang ? '<span class="item-check">✓</span>' : ''}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>

            <div class="sec">
                <h3>${safe(t('settings.audio', 'Audio & Music'))}</h3>
                <div class="volrow">
                    ${volumeSvg}
                    <input type="range" id="volRange" min="0" max="100" step="5" value="${currentVolume}" aria-label="${safe(t('settings.volume', 'Volume'))}">
                    <output id="volOut">${currentVolume}%</output>
                </div>
                <div class="setrow">
                    <div>
                        <b>${safe(t('settings.sound_fx', 'Sound Effects'))}</b>
                        <div class="muted">${safe(t('settings.sound_fx_desc', 'Toggle game audio feedback'))}</div>
                    </div>
                    <button class="secondary-button" id="modalSoundToggle" style="display:inline-flex;align-items:center;gap:6px;">${volumeSvg} <span>${state.sound ? safe(t('settings.sound_on', 'Sound: On')) : safe(t('settings.sound_off', 'Sound: Off'))}</span></button>
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
                    toast(t('toast.username_updated', 'Username updated successfully.'));
                } catch (e) {
                    console.error(e);
                    toast(t('toast.username_error', 'Could not update username.'));
                }
            };
        }

        const dropdown = q("customLangDropdown");
        const trigger = q("langTrigger");
        const menu = q("langMenu");

        if (trigger && menu) {
            trigger.onclick = (e) => {
                e.stopPropagation();
                const isOpen = !menu.classList.contains("hide");
                menu.classList.toggle("hide", isOpen);
                trigger.setAttribute("aria-expanded", !isOpen);
                trigger.classList.toggle("active", !isOpen);
            };

            const items = menu.querySelectorAll(".custom-dropdown-item");
            items.forEach(item => {
                item.onclick = async (e) => {
                    e.stopPropagation();
                    const selectedCode = item.dataset.lang;
                    state.language = selectedCode;

                    items.forEach(i => {
                        const isMatch = i.dataset.lang === selectedCode;
                        i.classList.toggle("active", isMatch);
                        const check = i.querySelector(".item-check");
                        if (isMatch && !check) {
                            i.insertAdjacentHTML('beforeend', '<span class="item-check">✓</span>');
                        } else if (!isMatch && check) {
                            check.remove();
                        }
                    });

                    const selectedLangObj = languages.find(l => l.code === selectedCode);
                    if (selectedLangObj) {
                        q("activeLangLabel").textContent = selectedLangObj.label;
                    }

                    menu.classList.add("hide");
                    trigger.setAttribute("aria-expanded", "false");
                    trigger.classList.remove("active");

                    try {
                        if (baseRef) await baseRef.set({ settings: { language: state.language } }, { merge: true });
                    } catch {}
                    toast(t('toast.lang_updated', 'Language updated.'));

                    switch (state.screen) {
                        case 'home': home(); break;
                        case 'mode': chooseMode(state.mode); break;
                        case 'lobby': lobby(state.mode); break;
                        case 'waiting': renderWaiting(); break;
                        case 'storyIntro': renderStoryIntro(); break;
                        case 'story': renderStory(); break;
                        case 'ending': renderEnding(); break;
                        case 'detective': renderDetective(); break;
                        case 'detectiveEnding': renderDetectiveEnding(); break;
                        default: home(); break;
                    }

                    openProfileModal();
                };
            });

            const closeMenuOnClickOutside = (e) => {
                if (dropdown && !dropdown.contains(e.target)) {
                    menu.classList.add("hide");
                    trigger.setAttribute("aria-expanded", "false");
                    trigger.classList.remove("active");
                }
            };
            document.addEventListener("mousedown", closeMenuOnClickOutside, { once: true });
        }

        const copyUserId = q("copyUserId");
        if (copyUserId) {
            copyUserId.onclick = () => {
                if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(user.uid).then(() => toast(t('toast.uid_copied', 'User ID copied.'))).catch(() => toast(t('toast.uid_prefix', 'User ID: ') + user.uid));
                } else {
                    toast(t('toast.uid_prefix', 'User ID: ') + user.uid);
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
                modalSoundToggle.innerHTML = `${volumeSvg} <span>${state.sound ? safe(t('settings.sound_on', 'Sound: On')) : safe(t('settings.sound_off', 'Sound: Off'))}</span>`;
                toast(state.sound ? t('toast.sound_enabled', 'Sound effects enabled.') : t('toast.sound_muted', 'Sound muted.'));
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
            <a href="../../index.html" class="home-corner-button" aria-label="${safe(t('title.website'))}">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                   <line x1="19" y1="12" x2="5" y2="12"></line>
                   <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span>${safe(t('title.website'))}</span>
            </a>
            <div class="title-screen-art" aria-hidden="true"><img class="title-art-image" data-asset-kind="title" data-asset-key="title" alt=""><div class="title-art-fallback"><div class="title-sun"></div><div class="title-skyline"></div><div class="title-campus"></div><div class="title-silhouette title-ren"><span></span></div><div class="title-silhouette title-yui"><span></span></div></div><div class="title-art-vignette"></div></div>
            <div class="title-screen-content">
                <div class="title-kicker"><span></span> ${safe(t('title.kicker'))} <span></span></div>
                <h1 class="game-logo">Between<em>Us</em></h1>
                <p class="game-description">${safe(t('title.description'))}</p>
                <div class="mode-select-title">${safe(t('title.choose_mode'))}</div>
                <div class="title-mode-grid">
                   <button class="title-mode-card mode-first-person" data-mode="main">
                       <span class="mode-art">
                           <img data-asset-kind="character" data-asset-key="ren" alt="">
                           <span class="mode-art-fallback mode-ren"><i></i></span>
                           <span class="mode-art-caption">${safe(t('title.main_caption'))}</span>
                       </span>
                       <span class="mode-card-copy">
                           <span class="mode-card-eyebrow">${safe(t('title.main_eyebrow'))}</span>
                           <strong>${safe(t('title.main_title'))}</strong>
                           <span class="mode-card-description">${safe(t('title.main_desc'))}</span>
                           <span class="mode-card-enter">${safe(t('title.begin'))} <b><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg></b></span>
                       </span>
                   </button>
                   <button class="title-mode-card mode-third-person" data-mode="detective" disabled aria-disabled="true">
                       <span class="mode-art">
                           <img data-asset-kind="character" data-asset-key="Detective-Female" alt="">
                           <span class="mode-art-fallback mode-detective"><i></i><i></i></span>
                           <span class="mode-art-caption">${safe(t('title.detective_caption'))}</span>
                       </span>
                       <span class="mode-card-copy">
                           <span class="mode-card-eyebrow">${safe(t('title.detective_eyebrow'))}</span>
                           <strong>${safe(t('title.detective_title'))}</strong>
                           <span class="mode-card-description">${safe(t('title.detective_desc'))}</span>
                           <span class="mode-card-enter">${safe(t('title.coming_soon'))} <b>✦</b></span>
                       </span>
                   </button>
               </div>
               <div class="title-footer"><span>${safe(t('title.academy'))}</span><span>${safe(t('title.semester'))}</span></div>
            </div>
        </section>`;
        hydrateAssets(app);
        $$('[data-mode]').forEach(b => b.onclick = async () => {
            const authed = await requireAuthModal();
            if (!authed) return;
            chooseMode(b.dataset.mode);
        });
    }

    function chooseMode(preselected) { setScreen('mode'); app.innerHTML = `<div class="page-head slide-in"><div><span class="eyebrow">STEP 01 / YOUR STORY</span><h1 class="page-title">Choose a mode.</h1><p class="page-subtitle">Your room will stay in this mode for the session. You can create a new room to try the other story.</p></div><button class="secondary-button" id="backHome">← Back home</button></div><div class="mode-grid"><button class="mode-card" data-mode="main"><div class="mode-top"><span class="mode-icon">♡</span><span class="mode-number">ROMANCE · BRANCHING STORY</span></div><h3>Main Characters</h3><p>Become one of the leads, navigate a new semester, and decide which relationships you want to build.</p><div class="mode-foot"><span>Select this mode</span><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"> <line x1="7" y1="17" x2="17" y2="7"></line> <polyline points="7 7 17 7 17 17"></polyline> </svg></span></div></button><button class="mode-card detective" disabled aria-disabled="true"><div class="mode-top"><span class="mode-icon">♡</span><span class="mode-number">COMING LATER</span></div><h3>Detectives</h3><p>A separate romantic puzzle mode where players piece together clues about Ren and Yui’s growing relationship.</p><div class="mode-foot"><span>In development</span><span>◌</span></div></button></div>${footer()}`; $('#backHome').onclick = home; $$('[data-mode]').forEach(b => b.onclick = () => lobby(b.dataset.mode)); if (preselected) lobby(preselected) }
    function lobby(mode) {
        state.mode = mode; 
        setScreen('lobby'); 
        
        app.innerHTML = `
        <div class="meet-page slide-in">
            <div class="meet-heading">
                <span class="eyebrow">${t('lobby.eyebrow')}</span>
                <h1>${t('lobby.heading')}</h1>
                <p>${t('lobby.subtitle')}</p>
                <button class="secondary-button meet-back" id="backModes">${t('lobby.back_modes')}</button>
            </div>
            
            <div class="meet-layout">
                <section class="meet-card create-card">
                    <div class="meet-card-icon">✦</div>
                    <span class="eyebrow">${t('lobby.create_eyebrow')}</span>
                    <h2>${t('lobby.create_title')}</h2>
                    <p>${t('lobby.create_desc')}</p>
                    <div class="meet-role">
                        <span class="role-orbit">01</span>
                        <span><strong>${t('lobby.player_one')}</strong><small>${t('lobby.room_host')}</small></span>
                        <span class="role-status">${t('lobby.you')}</span>
                    </div>
                    <button class="primary-button meet-action" id="createRoom">
                        ${t('lobby.create_btn')} 
                        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg></span>
                    </button>
                </section>
                
                <section class="meet-card join-card">
                    <div class="meet-card-icon">⌁</div>
                    <span class="eyebrow">${t('lobby.join_eyebrow')}</span>
                    <h2>${t('lobby.join_title')}</h2>
                    <p>${t('lobby.join_desc')}</p>
                    <div class="meet-role">
                        <span class="role-orbit guest">02</span>
                        <span><strong>${t('lobby.player_two')}</strong><small>${t('lobby.guest_player')}</small></span>
                        <span class="role-status muted-status">${t('lobby.invited')}</span>
                    </div>
                    <label class="field-label" style="margin-left:8px;" for="joinCode">${t('lobby.room_code_label')}</label>
                    <div class="field-row">
                        <input class="text-input" id="joinCode" maxlength="6" placeholder="ABC123" autocomplete="off" aria-label="Six-character room code">
                        <button class="primary-button" id="joinRoom">${t('lobby.join_btn')} <span>→</span></button>
                    </div>
                </section>
            </div>
            
            <div class="meet-bottom">
                <span>${t('lobby.footer_brand')}</span>
                <button class="preview-link" id="soloDemo">
                    ${t('lobby.local_preview')} 
                    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg></span>
                </button>
            </div>
        </div>`;

        $('#backModes').onclick = home; 
        $('#createRoom').onclick = createRoom; 
        $('#joinRoom').onclick = joinRoom; 
        $('#soloDemo').onclick = () => startLocalDemo(); 
        $('#joinCode').addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
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
            if (!snap.exists()) { 
                if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; } 
                toast(t('toast.room_not_found', 'Room not found. Check the code with your friend.')); 
                return; 
            }
            
            const initial = snap.val();
            if (initial.hostUid === uid) { 
                if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; } 
                toast(t('toast.already_host', 'You are already the host of this room.')); 
                return; 
            }
            if (initial.guestUid && initial.guestUid !== uid) { 
                if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; } 
                toast(t('toast.room_full', 'This room already has a second player.')); 
                return; 
            }
            if (initial.status !== 'waiting' && initial.guestUid !== uid) { 
                if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; } 
                toast(t('toast.room_started', 'This room has already started.')); 
                return; 
            }
            
            const claim = await ref.child('public/guestUid').transaction(current => {
                if (current === uid) return current;
                if (current === null || current === '') return uid;
                return undefined;
            });
            
            if (!claim.committed || claim.snapshot.val() !== uid) {
                if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; }
                toast(t('toast.room_claimed', 'This room was claimed by another player just now.')); 
                return;
            }
            
            await ref.child('public').update({ guestName: name, 'ready/guest': true, updatedAt: firebase.database.ServerValue.TIMESTAMP });
            state.mode = initial.mode; state.roomCode = roomCode; state.playerId = uid; state.playerSlot = 'guest';
            saveLocalProgress();
            attachRoomListener(ref);
            state.roomData = (await ref.once('value')).val(); state.screen = 'waiting'; renderWaiting();
        } catch (e) {
            console.error('Join room failed:', e);
            if (button) { button.disabled = false; button.innerHTML = 'Join <span>→</span>'; }
            toast(t('toast.join_failed', 'Could not join this room.'));
        }
    }

    function renderWaiting() { 
        setScreen('waiting'); 
        const r = state.roomData?.public || {};
        app.innerHTML = `
        <div class="waiting-page slide-in">
            <div class="waiting-heading">
                <span class="eyebrow">${safe(t('waiting.eyebrow'))}</span>
                <h1>${t('waiting.heading_html')}</h1>
                <p>${safe(t('waiting.subtitle'))}</p>
            </div>
            <section class="waiting-card">
                <div class="waiting-card-top">
                    <div>
                        <span class="eyebrow">${safe(t('waiting.room_code_eyebrow'))}</span>
                        <div class="room-code">${safe(state.roomCode)}</div>
                        <p class="waiting-hint">${safe(t('waiting.room_hint'))}</p>
                    </div>
                    <div class="waiting-tools">
                        <button class="icon-button" id="copyCode" title="${safe(t('waiting.copy_title'))}" aria-label="${safe(t('waiting.copy_title'))}">⧉</button>
                        <button class="icon-button" id="refreshRoom" title="${safe(t('waiting.refresh_title'))}" aria-label="${safe(t('waiting.refresh_title'))}">↻</button>
                    </div>
                </div>
                <div class="waiting-divider"></div>
                <div class="waiting-players">
                    <div class="waiting-person">
                        <div class="waiting-avatar host-avatar"><span>01</span><i></i></div>
                        <div><small>${safe(t('waiting.host_label'))}</small><strong>${safe(t('waiting.host_name'))}</strong><span class="status-pill ready">● ${safe(t('waiting.connected'))}</span></div>
                    </div>
                    <div class="waiting-connector"><span>♡</span><i></i></div>
                    <div class="waiting-person">
                        <div class="waiting-avatar guest-avatar"><span>02</span><i class="${r.guestUid ? 'online' : ''}"></i></div>
                        <div><small>${safe(t('waiting.guest_label'))}</small><strong>${safe(t('waiting.guest_name'))}</strong><span class="status-pill ${r.guestUid ? 'ready' : ''}">${r.guestUid ? '● ' + safe(t('waiting.connected')) : '○ ' + safe(t('waiting.waiting_to_join'))}</span></div>
                    </div>
                </div>
                <div class="waiting-note ${r.guestUid ? 'both-ready' : ''}">
                    <span class="waiting-note-icon">${r.guestUid ? '♡' : '◌'}</span>
                    <p>${safe(r.guestUid ? t('waiting.note_ready') : t('waiting.note_waiting'))}</p>
                </div>
                <div class="waiting-actions">
                    <button class="primary-button" id="startSession" ${r.guestUid ? '' : 'disabled'}>${r.guestUid ? safe(t('waiting.begin_together')) : safe(t('waiting.waiting_player_two'))} <span>→</span></button>
                    <button class="secondary-button" id="leaveRoom">${safe(t('waiting.leave_room'))}</button>
                </div>
            </section>
        </div>`;

        $('#copyCode').onclick = () => {
            if (navigator.clipboard?.writeText)
                navigator.clipboard.writeText(state.roomCode).then(() => toast(t('toast.code_copied'))).catch(() => toast(t('toast.code_prefix') + state.roomCode));
            else
                toast(t('toast.code_prefix') + state.roomCode);
        };
            
        $('#refreshRoom').onclick = async () => {
            if (state.roomRef) {
                state.roomData = (await state.roomRef.once('value')).val();
                renderWaiting();
            }
        };
        $('#leaveRoom').onclick = leaveRoom;
        $('#startSession').onclick = startOnlineGame;
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

            if (next.public.status === 'closed' || next.public.status === 'ended') {
                if (state.online && state.roomCode && !state.leavingRoom) handleRoomRemoved();
                return;
            }

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
        ref.on('value', handler, error => { console.error('Room listener failed:', error); toast(t('toast.lost_room_access', 'Lost access to this room. Check the Firebase rules.')); });
        state.roomUnsub = () => ref.off('value', handler);
    }

    async function leaveRoom() {
        const ref = state.roomRef, wasOnline = state.online;
        clearLocalProgress();
        state.leavingRoom = true;
        try {
            if (ref && wasOnline) {
                try { await ref.onDisconnect().cancel() } catch (e) { }
                
                try {
                    await ref.child('public').update({
                        status: 'closed',
                        updatedAt: firebase.database.ServerValue.TIMESTAMP
                    });
                } catch (err) {
                    console.warn("Could not update room status:", err);
                }

                try {
                    await ref.remove();
                } catch (err) {
                    console.warn("Room removal restricted by database rules, cleaning up locally:", err);
                }
            }
        } catch (e) { 
            console.error('Leave room cleanup failed:', e); 
        } finally {
            if (state.roomUnsub) state.roomUnsub();
            state.roomRef = null; 
            state.roomData = null; 
            state.roomCode = null; 
            state.playerSlot = null; 
            state.playerId = null; 
            state.roomUnsub = null; 
            state.disconnectHandler = null; 
            state.leavingRoom = false;
            home();
        }
    }

    function handleRoomRemoved() {
        if (state.roomUnsub) state.roomUnsub();
        state.roomRef = null; state.roomData = null; state.roomCode = null; state.playerSlot = null; state.playerId = null; state.roomUnsub = null; state.disconnectHandler = null;
        setConnection(true, 'Connected'); 
        
        clearLocalProgress();
        toast(t('toast.room_closed'));
        home();
    }

    function startLocalDemo() { state.online = false; state.roomCode = 'LOCAL'; state.playerId = 'local-player'; state.playerSlot = 'host'; state.roomData = { public: { mode: state.mode || 'main', hostName: 'You', guestName: 'Demo Partner', guestUid: 'demo', status: 'playing', chapter: 0, sceneId: '', choices: {}, shared: {}, ready: { host: true, guest: true } } }; setConnection(false, 'Preview'); preloadStoryAssets(); if (state.mode === 'detective') startDetective(); else startStory() }
    async function startOnlineGame() { if (!state.roomRef) { toast(t('toast.room_connection_missing', 'Room connection is missing.')); return; } state.screen = 'starting'; try { await state.roomRef.child('public/status').set('playing'); launchFromRoom(); } catch (e) { state.screen = 'waiting'; toast(t('toast.start_session_failed', 'Could not start the session. Check database rules.')); } }
    function launchFromRoom() { preloadStoryAssets(); if (state.mode === 'detective') startDetective(); else startStory() }

    async function updatePublic(path, value) { if (state.online && state.roomRef) { try { await state.roomRef.child('public/' + path).set(value); } catch (e) { console.error(e); toast(t('toast.sync_action_failed', 'Could not sync that action. Check database rules.')); } } else if (state.roomData) { const keys = path.split('/'); let target = state.roomData.public; for (let i = 0; i < keys.length - 1; i++) target = target[keys[i]] || (target[keys[i]] = {}); target[keys[keys.length - 1]] = value; } }
    async function updateShared(path, value) { if (state.online && state.roomRef) { try { await state.roomRef.child('public/shared/' + path).set(value); } catch (e) { console.error(e); toast(t('toast.sync_progress_failed', 'Could not sync progress.')); } } else { state.roomData.public.shared = state.roomData.public.shared || {}; const keys = path.split('/'); let target = state.roomData.public.shared; for (let i = 0; i < keys.length - 1; i++) target = target[keys[i]] || (target[keys[i]] = {}); target[keys[keys.length - 1]] = value; } }

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
            const toneKey = approach === 'direct' 
                ? 'project_decision.outcomes.ren_yui_host_direct' 
                : approach === 'playful' 
                ? 'project_decision.outcomes.ren_yui_host_playful' 
                : 'project_decision.outcomes.ren_yui_host_casual';
            const tone = t(toneKey);
            return state.playerSlot === 'guest' 
                ? t('project_decision.outcomes.ren_yui_guest') 
                : `${tone} ${t('project_decision.outcomes.ren_yui_host_end')}`;
        }
        if (d.result === 'yui-asked-ren-accepted') {
            const approach = d.guestChoice?.approach;
            const toneKey = approach === 'direct' 
                ? 'project_decision.outcomes.yui_asked_guest_direct' 
                : approach === 'playful' 
                ? 'project_decision.outcomes.yui_asked_guest_playful' 
                : 'project_decision.outcomes.yui_asked_guest_casual';
            const tone = t(toneKey);
            return state.playerSlot === 'guest' 
                ? `${tone} ${t('project_decision.outcomes.yui_asked_guest_end')}` 
                : t('project_decision.outcomes.yui_asked_host');
        }
        if (d.result === 'ren-invited-yui-declined') {
            return state.playerSlot === 'guest' 
                ? t('project_decision.outcomes.declined_guest') 
                : t('project_decision.outcomes.declined_host');
        }
        if (d.result === 'separate') {
            return state.playerSlot === 'guest' 
                ? t('project_decision.outcomes.separate_guest') 
                : t('project_decision.outcomes.separate_host');
        }
        return t('project_decision.outcomes.default_outcome');
    }

    function projectDecisionMarkup() {
        const d = getProjectDecision();
        let optionIndex = 0; 
        const btn = (key, label, detail = '') => `<button class="choice-button" data-project-choice="${safe(key)}"><span class="choice-letter">${String.fromCharCode(65 + optionIndex++)}</span><span>${safe(label)}${detail ? `<small class="project-choice-detail">${safe(detail)}</small>` : ''}</span><span class="vn-choice-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"> <line x1="7" y1="17" x2="17" y2="7"></line> <polyline points="7 7 17 7 17 17"></polyline> </svg></span></button>`;
        
        let heading = t('project_decision.headings.major_decision'); 
        let intro = t('project_decision.intros.default'); 
        let options = '';

        if (state.playerSlot === 'host') {
            if (!d.hostChoice) {
                intro = t('project_decision.intros.host_initial');
                options = btn('host:kai', t('project_decision.buttons.kai_invite'), t('project_decision.buttons.kai_detail')) 
                        + btn('host:mei', t('project_decision.buttons.mei_invite'), t('project_decision.buttons.mei_detail')) 
                        + btn('host:yui:casual', t('project_decision.buttons.ask_yui_casual'), t('project_decision.buttons.ask_yui_casual_detail')) 
                        + btn('host:yui:direct', t('project_decision.buttons.ask_yui_direct'), t('project_decision.buttons.ask_yui_direct_detail')) 
                        + btn('host:yui:playful', t('project_decision.buttons.ask_yui_playful'), t('project_decision.buttons.ask_yui_playful_detail'));
            } else if (d.hostChoice.partner === 'yui' && !d.guestChoice) { 
                heading = t('project_decision.headings.waiting_yui'); 
                intro = t('project_decision.intros.host_waiting_yui'); 
                options = `<div class="notice project-waiting">${safe(t('project_decision.notices.invitation_sent'))}</div>`; 
            } else if (d.hostChoice.partner !== 'yui' && d.guestChoice?.partner === 'ren' && !d.hostFinal) { 
                heading = t('project_decision.headings.yui_asked'); 
                intro = t('project_decision.intros.host_reconsider'); 
                const partnerName = d.hostChoice.partner === 'kai' ? 'Kai' : 'Mei';
                options = btn('hostfinal:yui', t('project_decision.buttons.accept_yui_request'), t('project_decision.buttons.accept_yui_detail')) 
                        + btn('hostfinal:stay', t('project_decision.buttons.stay_with_partner', { partner: partnerName }), t('project_decision.buttons.stay_with_detail')); 
            } else if (!d.result) { 
                heading = t('project_decision.headings.waiting_yui'); 
                intro = t('project_decision.intros.host_waiting_other'); 
                options = `<div class="notice project-waiting">${safe(t('project_decision.notices.waiting_perspective'))}</div>`; 
            } else { 
                heading = t('project_decision.headings.decision_made'); 
                intro = t('project_decision.intros.settled'); 
                options = `<div class="notice">${safe(t('project_decision.notices.recorded'))}</div>`; 
            }
        } else {
            if (!d.hostChoice) { 
                heading = t('project_decision.headings.a_moment'); 
                intro = t('project_decision.intros.guest_initial'); 
                options = `<div class="notice project-waiting">${safe(t('project_decision.notices.waiting_classroom'))}</div>`; 
            } else if (d.hostChoice.partner === 'yui' && !d.guestChoice) { 
                heading = t('project_decision.headings.ren_asked'); 
                intro = t('project_decision.intros.guest_ren_asked'); 
                options = btn('guest:accept', t('project_decision.buttons.accept_ren_invite'), t('project_decision.buttons.accept_ren_detail')) 
                        + btn('guest:hana', t('project_decision.buttons.choose_hana'), t('project_decision.buttons.choose_hana_detail_ren')); 
            } else if (d.hostChoice.partner !== 'yui' && !d.guestChoice) { 
                heading = t('project_decision.headings.your_turn'); 
                intro = t('project_decision.intros.guest_turn'); 
                options = btn('guest:ren:casual', t('project_decision.buttons.ask_ren_casual'), t('project_decision.buttons.ask_ren_casual_detail')) 
                        + btn('guest:ren:direct', t('project_decision.buttons.ask_ren_direct'), t('project_decision.buttons.ask_ren_direct_detail')) 
                        + btn('guest:ren:playful', t('project_decision.buttons.ask_ren_playful'), t('project_decision.buttons.ask_ren_playful_detail')) 
                        + btn('guest:hana', t('project_decision.buttons.choose_hana'), t('project_decision.buttons.choose_hana_detail_guest')); 
            } else if (!d.result) { 
                heading = t('project_decision.headings.waiting_ren'); 
                intro = t('project_decision.intros.guest_waiting_ren'); 
                options = `<div class="notice project-waiting">${safe(t('project_decision.notices.next_step_his'))}</div>`; 
            } else { 
                heading = t('project_decision.headings.decision_made'); 
                intro = t('project_decision.intros.settled'); 
                options = `<div class="notice">${safe(t('project_decision.notices.recorded'))}</div>`; 
            }
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
        
        const titleText = getText(ch.title);
        const monthText = getText(ch.month) || 'SEMESTER';
        const objectiveText = getText(ch.objective) || t('story_intro.default_objective');

        const roleTitle = guest ? t('story_intro.yui_title') : t('story_intro.ren_title');
        const roleCopy = guest ? t('story_intro.yui_copy') : t('story_intro.ren_copy');

        app.innerHTML = `
        <section class="vn-intro slide-in">
            <div class="vn-intro-art vn-intro-autumn">
                <img class="vn-intro-asset" src="assets/Backgrounds/chapter-${chapterNum}.png" alt="${safe(titleText)}">
                <div class="vn-intro-caption"><span>HOSHINOMIYA ACADEMY</span><strong>${safe(titleText)}</strong><small>CHAPTER 0${chapterNum} · ${safe(monthText)}</small></div>
            </div>
            <div class="vn-intro-copy">
                <span class="eyebrow">${safe(t('story_intro.kicker'))}</span>
                <div class="vn-role-card">
                <span class="vn-role-icon">${guest ? 'B' : 'A'}</span>
                <div><span class="eyebrow">${safe(t('story_intro.role_label'))}</span><h2>${safe(roleTitle)}</h2><p>${safe(roleCopy)}</p></div>
                </div>
                <div class="vn-objective"><span class="eyebrow">${safe(t('story_intro.objective_label'))}</span><p>${safe(objectiveText)}</p></div>
                <div class="vn-how"><span class="eyebrow">${safe(t('story_intro.info_label'))}</span><p>${safe(t('story_intro.info_copy', { num: chapterNum }))}</p></div>
                <div class="button-row">
                <button class="primary-button" id="beginChapter">${safe(t('story_intro.begin_btn', { num: chapterNum }))}</button>
                <button class="secondary-button" id="introExit">${safe(t('story_intro.exit_btn'))}</button>
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
            if (btn) { btn.disabled = true; btn.innerHTML = t('story_intro.loading_chapter'); }
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
        if (!scene) return [{ speaker: 'narrator', text: '' }];
        const lang = state.language || 'en';
        const slot = state.playerSlot === 'guest' ? 'guest' : 'host';

        let rawDialogue = scene.dialogueBySlot?.[slot] || scene.dialogue;
        if (rawDialogue && typeof rawDialogue === 'object' && !Array.isArray(rawDialogue)) {
            rawDialogue = rawDialogue[lang] || rawDialogue['en'] || Object.values(rawDialogue)[0] || [];
        }

        let dialogue = Array.isArray(rawDialogue) ? [...rawDialogue] : [{ speaker: scene.speaker || 'narrator', text: scene.text || '' }];

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
        return dialogue.length > 0 ? dialogue : [{ speaker: 'narrator', text: '' }];
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
        const dialogue = sceneDialogue(scene) || [{ speaker: 'narrator', text: '' }];
        const lineIndex = Math.max(0, Math.min(page.lineIndex, dialogue.length - 1));
        let line = dialogue[lineIndex] || { speaker: 'narrator', text: '' };
        if (scene.id === 'oct3_project_result' && lineIndex === dialogue.length - 1) line = { ...line, text: projectOutcomeText() };
        logSceneConversation(scene, lineIndex);
        const speakerName = line.speaker || 'narrator';
        const speakerKey = String(speakerName).toLowerCase();
        const who = characterFor(line.speaker);
        const isLast = lineIndex === dialogue.length - 1; const canBack = state.storyPageIndex > 0; const canForward = state.storyPageIndex < state.storyPages.length - 1;
        const allChapters = window.BU_STORY.mainChapters; const allScenes = allChapters.flatMap(c => c.scenes); const overallSceneIndex = Math.max(0, allScenes.findIndex(s => s.id === scene.id)); const progress = Math.min(100, Math.round(((overallSceneIndex + ((lineIndex + 1) / Math.max(dialogue.length, 1))) / Math.max(allScenes.length, 1)) * 100));
        const availableChoices = getSceneChoices(scene);
        const waitingForRen = scene.id === 'dec11_first_visit' && state.playerSlot === 'guest' && getChoiceIndex('host', 'dec11_first_visit') === null;
        const waitingForSickInfo = scene.id === 'nov9_sick_day' && ((renIsSickScenario && state.playerSlot === 'guest' && getChoiceIndex('host', 'nov9_sick_day') === null) || (!renIsSickScenario && state.playerSlot === 'host' && getChoiceIndex('guest', 'nov9_sick_day') === null));
        const hasChoices = isLast && (scene.projectDecision || (availableChoices.length > 0) || waitingForRen || waitingForSickInfo);
        const choicesPage = page.type === 'choices' && hasChoices;
        const waitingMarkup = waitingForRen ? `<div class="vn-choice-reveal"><div class="vn-choice-heading"><span class="eyebrow">${safe(t('scene_choices.waiting_ren_heading'))}</span><p>${safe(t('scene_choices.waiting_ren_p'))}</p></div><div class="project-waiting">${safe(t('scene_choices.waiting_ren_notice'))}</div></div>` : waitingForSickInfo ? `<div class="vn-choice-reveal"><div class="vn-choice-heading"><span class="eyebrow">${safe(t('scene_choices.waiting_msg_heading'))}</span><p>${safe(t('scene_choices.waiting_msg_p'))}</p></div><div class="project-waiting">${safe(t('scene_choices.waiting_msg_notice'))}</div></div>` : '';
        const choicesMarkup = choicesPage ? (scene.projectDecision ? projectDecisionMarkup() : (waitingForRen || waitingForSickInfo) ? waitingMarkup : `<div class="vn-choice-reveal"><div class="vn-choice-heading"><span class="eyebrow">${safe(scene.decisionType === 'major' ? t('scene_choices.major_decision') : t('scene_choices.your_decision'))}</span><h2 class="vn-choice-page-title" style="margin: 6px 0 10px 0;">${safe(t('scene_choices.page_title'))}</h2><p>${safe(scene.decisionType === 'major' ? t('scene_choices.major_desc') : t('scene_choices.standard_desc'))}</p></div><div class="choice-list">${availableChoices.map((c, i) => `<button class="choice-button" data-choice="${i}"><span class="choice-letter">${String.fromCharCode(65 + i)}</span><span>${safe(getText(c.label))}</span><span class="vn-choice-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px;"> <line x1="7" y1="17" x2="17" y2="7"></line> <polyline points="7 7 17 7 17 17"></polyline> </svg></span></button>`).join('')}</div></div>`) : '';

        const defaultRole = t('player_ui.default_scene_role');
        const sceneRoleText = getText(scene.role) || defaultRole;
        const sceneTitleText = getText(scene.role) || getText(ch.title);
        
        app.innerHTML = `
        <section class="vn-player slide-in">
            <div class="vn-player-top"> <div> <span class="eyebrow">${safe(getText(ch.number))} · ${safe(getText(ch.month))} · ${safe(state.playerSlot === 'guest' ? 'Yui Tachibana' : 'Ren Akiyama')}</span> <div class="vn-chapter-heading"> <div class="vn-chapter-title">${safe(getText(ch.title))}</div> <div class="vn-chapter-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><i style="width:${progress}%"></i></div> </div> <div class="vn-location">${safe(getText(ch.location))} <span>·</span> ${safe(sceneRoleText)}</div> </div> <div class="vn-top-actions"> <span class="vn-page-count">${safe(t('player_ui.scene_counter', { current: overallSceneIndex + 1, total: allScenes.length }))}</span> <button class="secondary-button" id="storyHome">${safe(t('player_ui.exit_story'))}</button> </div> </div>
            <div class="vn-stage vn-scene-${safe(scene.id)} ${scene.weather ? 'vn-weather-' + safe(scene.weather) : ''}">
                <div class="vn-sky-glow"></div> <div class="vn-distant-buildings"></div> <div class="vn-rain-lines"></div> <img class="vn-background-image" alt="" aria-hidden="true"> <div class="vn-stage-caption"> <span>HOSHINOMIYA ACADEMY</span> <strong>${safe(sceneTitleText)}</strong> </div> <div class="vn-character" aria-label="${safe(who.name)} speaking"></div> <div class="vn-character-label"> <span class="vn-speaking-dot"></span> <div> <strong>${safe(who.name)}</strong> <small>${safe(who.role)}</small> </div> </div>
                ${choicesPage ? ` <div class="vn-dialogue-panel vn-choice-page-panel"> ${choicesMarkup} <div class="vn-controls"> <button class="secondary-button" id="storyBack">${safe(t('player_ui.back_to_conversation'))}</button> <span class="vn-end-label">${safe(t('player_ui.choice_kicker'))}</span> </div> </div> ` : ` <div class="vn-dialogue-panel"> <div class="vn-dialogue-meta"> <span>${safe(who.name)}</span> <span>${lineIndex + 1} / ${dialogue.length}</span> </div> <p class="vn-dialogue-text" aria-live="polite">${safe(getText(line.text))}</p> ${isLast && hasChoices ? ` <div class="vn-next-hint">${safe(t('player_ui.hint_choices_next'))}</div> ` : (!isLast ? ` <div class="vn-next-hint">${safe(t('player_ui.hint_continue'))}</div> ` : '')} <div class="vn-controls"> <button class="secondary-button" id="storyBack" ${canBack ? '' : 'disabled'}>${safe(t('player_ui.btn_back'))}</button> <div class="vn-progress"> <i style="width:${Math.max(6, Math.round(((lineIndex + 1) / dialogue.length) * 100))}%"></i> </div> ${canForward ? ` <button class="primary-button" id="storyNext">${safe(t('player_ui.btn_forward'))}</button> ` : (isLast && hasChoices ? ` <button class="primary-button" id="storyNext">${safe(t('player_ui.btn_choices'))}</button> ` : (isLast ? ` <span class="vn-end-label">${safe(t('player_ui.scene_complete'))}</span> ` : ` <button class="primary-button" id="storyNext">${safe(t('player_ui.btn_next'))}</button> `))} </div> </div> `}
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