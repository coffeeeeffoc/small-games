(function() {
	//#region ../../platforms/competition/client.js
	globalThis.__installCompetition = (options, nativeSdk) => {
		const root = globalThis;
		if (root.__competition) return;
		const config = options || root.__COMPETITION_CONFIG__ || {};
		const nativePlatforms = {
			wechat: "wx",
			bilibili: "bl",
			douyin: "tt",
			kuaishou: "ks",
			taptap: "tap"
		};
		const native = Object.hasOwn(nativePlatforms, config.platform);
		const sdk = nativeSdk || (native ? root[nativePlatforms[config.platform]] : null);
		if (native && !sdk) throw new Error(`缺少 ${config.platform} 原生 SDK，无法启动好友挑战。`);
		const base = (config.apiUrl || "/api/competition/v1").replace(/\/$/, "");
		const teamRules = {
			"cops-robbers": {
				version: "roles-initiative-duel-v2",
				modes: ["escape", "survival"]
			},
			"cops-robbers-realtime": {
				version: "street-roles-initiative-v2",
				modes: ["classic", "escape"]
			}
		};
		const verifiedGames = /* @__PURE__ */ new Set();
		function verifyRules(game, data, board = false) {
			const expected = teamRules[game];
			if (!expected) return;
			if (data.version !== expected.version || !Array.isArray(data.roles) || !["pursuer", "runner"].every((role) => data.roles.includes(role)) || board && !expected.modes.every((mode) => data.modes?.some((item) => item.id === mode))) {
				verifiedGames.delete(game);
				const error = /* @__PURE__ */ new Error("好友服务正在更新，请稍后重试，单机仍可玩。");
				error.code = "RULE_VERSION_CHANGED";
				throw error;
			}
			if (board) verifiedGames.add(game);
		}
		const storageKey = `competition-session-v1:${sdk ? `${config.platform}:${config.appId}` : "h5"}`;
		let credential, loggingIn;
		try {
			credential = JSON.parse(sdk ? sdk.getStorageSync(storageKey) || "null" : localStorage.getItem(storageKey) || "null");
		} catch {}
		const errors = {
			SESSION_EXPIRED: "登录已过期，请重新进入；当前对局不会冒用新身份。",
			PLATFORM_NOT_CONFIGURED: "此游戏的平台登录尚未配置。",
			PLATFORM_LOGIN_FAILED: "平台登录失败，请重新进入。",
			PLATFORM_LOGIN_UNAVAILABLE: "此平台的好友挑战暂不可用，请稍后再试。",
			ROOM_FULL: "房间已满。",
			INVITATION_EXPIRED: "邀请已过期或比赛已开始。",
			INVITATION_NOT_FOUND: "找不到这个邀请，请核对房间码。",
			NOT_A_MEMBER: "你不是此房间的参赛者。",
			MATCH_CLOSED: "本局已结束。",
			ILLEGAL_ACTION: "此操作不符合当前规则，请刷新局面。",
			SEQUENCE_CONFLICT: "操作顺序已变化，请重试。",
			WRONG_GAME: "这个房间属于另一款游戏，尚未加入。",
			INVALID_ROLE: "请选择本游戏支持的角色。",
			INVALID_MODE: "请选择本游戏支持的对战模式。",
			RULE_VERSION_CHANGED: "游戏规则已更新，请退出旧房间后重新开局。",
			HOST_ONLY: "开局顺序由房主设置，双方确认后准备。",
			INVALID_INPUT: "请检查输入；昵称为 2–16 个中英文字、数字、空格或 · _ -。",
			RATE_LIMITED: "操作过于频繁，请稍后重试。",
			SERVICE_UNAVAILABLE: "全站服务暂不可用，当前结果尚未确认。"
		};
		async function send(path, init = {}) {
			const headers = {
				"content-type": "application/json",
				...init.headers || {}
			};
			if (credential?.token) headers.authorization = `Bearer ${credential.token}`;
			const method = init.method || (init.body ? "POST" : "GET");
			let status, data;
			try {
				if (sdk) {
					const response = await new Promise((resolve, reject) => sdk.request({
						url: base + path,
						method,
						header: headers,
						data: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
						timeout: 8e3,
						success: resolve,
						fail: reject
					}));
					status = response.statusCode;
					data = response.data;
				} else {
					const response = await fetch(base + path, {
						...init,
						method,
						headers,
						credentials: "omit",
						redirect: "error",
						signal: AbortSignal.timeout(8e3)
					});
					status = response.status;
					data = await response.json();
				}
			} catch {
				const error = /* @__PURE__ */ new Error("网络不可用，请重试；成绩尚未得到服务端确认。");
				error.code = "SERVICE_UNAVAILABLE";
				throw error;
			}
			if (status < 200 || status >= 300) {
				const error = new Error(errors[data?.error] || `服务未接受请求 (${status})`);
				error.code = data?.error;
				throw error;
			}
			return data;
		}
		async function session() {
			if (credential?.expiresAt > Date.now() + 6e4) return credential;
			if (loggingIn) return loggingIn;
			loggingIn = (async () => {
				if (sdk) {
					if (!config.appId || !config.platform) throw new Error("缺少本游戏 AppID，无法使用平台排位。");
					const login = await new Promise((resolve, reject) => sdk.login({
						success: resolve,
						fail: reject
					}));
					if (typeof login?.code !== "string" || !login.code) {
						const error = new Error(errors.PLATFORM_LOGIN_FAILED);
						error.code = "PLATFORM_LOGIN_FAILED";
						throw error;
					}
					credential = await send("/sessions/platform", { body: JSON.stringify({
						platform: config.platform,
						appId: config.appId,
						code: login.code
					}) });
				} else credential = await send("/sessions/guest", { body: "{}" });
				try {
					if (sdk) sdk.setStorageSync(storageKey, JSON.stringify(credential));
					else localStorage.setItem(storageKey, JSON.stringify(credential));
				} catch {}
				return credential;
			})().finally(() => {
				loggingIn = null;
			});
			return loggingIn;
		}
		root.__competition = {
			session,
			async request(path, init) {
				await session();
				const roomRequest = path.startsWith("/rooms") && !path.endsWith("/leave");
				const game = config.game || (init?.body ? JSON.parse(init.body).game : void 0);
				if (roomRequest && teamRules[game] && !verifiedGames.has(game)) verifyRules(game, await send("/boards/" + game), true);
				const data = await send(path, init).catch((error) => {
					if (path.endsWith("/leave") && error.code === "RULE_VERSION_CHANGED") return { obsolete: true };
					throw error;
				});
				if (path.startsWith("/boards/")) verifyRules(path.slice(8), data, true);
				if (roomRequest) verifyRules(data.game, data);
				return data;
			},
			config
		};
	};
	//#endregion
	//#region ../../platforms/competition/h5.css?inline
	var h5_default = "[data-competition-launch] {\n  position: fixed;\n  right: 16px;\n  bottom: max(16px, env(safe-area-inset-bottom));\n  z-index: 1000;\n  min-height: 48px;\n  padding: 12px 20px;\n  border: 1px solid #28594f;\n  border-radius: 999px;\n  background: #173e38;\n  color: #fff8e7;\n  font:\n    600 14px 'PingFang SC',\n    'Microsoft YaHei',\n    sans-serif;\n  box-shadow: 0 4px 18px #12372a26;\n  cursor: pointer;\n}\nbody:is(.is-playing, .focus-play, .play-focus, .game-page) > [data-competition-launch] {\n  display: none;\n}\n.competition-dialog {\n  --pk-ink: #203b35;\n  --pk-muted: #60736b;\n  --pk-line: #d7dfd5;\n  --pk-accent: #e8ba54;\n  position: fixed;\n  inset: 0;\n  margin: auto;\n  padding: 0;\n  border: 1px solid #ffffff80;\n  border-radius: 24px;\n  width: min(880px, calc(100% - 32px));\n  max-width: none;\n  height: min(790px, calc(100dvh - 32px));\n  max-height: none;\n  background: #f3f5ed;\n  color: var(--pk-ink);\n  font:\n    15px/1.6 'PingFang SC',\n    'Microsoft YaHei',\n    sans-serif;\n  box-sizing: border-box;\n  box-shadow: 0 28px 90px #06271e45;\n  overflow: hidden;\n  text-align: left;\n}\n.competition-dialog::backdrop {\n  background: #0b2924b8;\n  backdrop-filter: blur(7px);\n}\n.competition-dialog * {\n  box-sizing: border-box;\n}\n.competition-dialog [hidden] {\n  display: none !important;\n}\n.competition-dialog h2,\n.competition-dialog h3,\n.competition-dialog p {\n  margin: 0;\n  color: inherit;\n  font-family: inherit;\n}\n.competition-dialog button {\n  min-height: 44px;\n  padding: 10px 16px;\n  border: 1px solid var(--pk-line);\n  border-radius: 12px;\n  color: var(--pk-ink);\n  background: #fffdf8;\n  font-family: inherit;\n  font-size: 14px;\n  cursor: pointer;\n  touch-action: manipulation;\n  box-shadow: none;\n  transition:\n    background 0.15s,\n    transform 0.15s;\n  letter-spacing: 0;\n}\n.competition-dialog button:hover {\n  background: #e7eee3;\n}\n.competition-dialog button:active {\n  transform: translateY(1px);\n}\n.competition-dialog button:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n.competition-dialog button:focus-visible,\n.competition-dialog input:focus-visible {\n  outline: 3px solid #42997c;\n  outline-offset: 3px;\n}\n.competition-dialog button.pk-primary {\n  background: var(--pk-accent);\n  border-color: #cba347;\n  color: #293a27;\n}\n.competition-dialog button.pk-primary:hover {\n  background: #f0ca76;\n}\n.competition-dialog button.pk-quiet {\n  background: transparent;\n  border-color: transparent;\n  color: var(--pk-muted);\n}\n.pk-shell {\n  height: 100%;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  padding: 18px 24px max(18px, env(safe-area-inset-bottom));\n}\n.pk-header {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  flex: none;\n  padding-bottom: 12px;\n  border-bottom: 1px solid var(--pk-line);\n}\n.pk-brand {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n}\n.pk-brand-mark {\n  width: 38px;\n  height: 38px;\n  border-radius: 12px;\n  display: grid;\n  place-items: center;\n  background: #234c41;\n  color: #f1c66a;\n  font:\n    bold 15px Georgia,\n    serif;\n  flex: none;\n}\n.pk-brand strong {\n  font-size: 17px;\n  display: block;\n  line-height: 1.4;\n}\n.pk-brand small {\n  color: var(--pk-muted);\n  font-size: 11px;\n  letter-spacing: 1.5px;\n  display: block;\n}\n.pk-tools {\n  display: flex;\n  gap: 4px;\n  align-items: center;\n}\n.pk-status {\n  flex: none;\n  min-height: 25px;\n  margin: 10px 0 !important;\n  font-size: 12px;\n  color: var(--pk-muted) !important;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.pk-status::before {\n  content: '';\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: #468b6c;\n  flex: none;\n}\n.pk-status[data-error] {\n  color: #974c35 !important;\n}\n.pk-status[data-error]::before {\n  background: #be6547;\n}\n.pk-content {\n  flex: 1;\n  min-height: 0;\n  overflow: auto;\n  overscroll-behavior: contain;\n}\n.pk-hero {\n  padding: 16px 0 20px;\n}\n.pk-eyebrow {\n  display: block;\n  font-size: 11px;\n  font-weight: 700;\n  letter-spacing: 2px;\n  color: #75806b;\n  margin-bottom: 8px;\n}\n.pk-hero h2 {\n  font-size: clamp(24px, 4vw, 34px);\n  font-weight: 800;\n  line-height: 1.35;\n  letter-spacing: -1px;\n}\n.pk-hero p {\n  margin-top: 10px;\n  max-width: 440px;\n  color: var(--pk-muted);\n  font-size: 14px;\n}\n.pk-profile {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 14px 16px;\n  background: #e7ede2;\n  border-radius: 16px;\n  margin-bottom: 18px;\n}\n.pk-avatar {\n  width: 42px;\n  height: 42px;\n  border-radius: 50%;\n  display: grid;\n  place-items: center;\n  flex: none;\n  background: #c9dace;\n  color: #28543f;\n  font-weight: 700;\n  font-size: 18px;\n}\n.pk-profile-copy {\n  flex: 1;\n  min-width: 0;\n}\n.pk-profile-copy strong {\n  display: block;\n  overflow-wrap: anywhere;\n}\n.pk-profile-copy small {\n  display: block;\n  color: var(--pk-muted);\n  font-size: 11px;\n}\n.pk-options {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 14px;\n}\n.pk-option {\n  padding: 22px;\n  border: 1px solid var(--pk-line);\n  border-radius: 18px;\n  background: #fffef9;\n}\n.pk-option h3 {\n  font-size: 19px;\n  margin-bottom: 5px;\n}\n.pk-option p {\n  font-size: 13px;\n  color: var(--pk-muted);\n  margin-bottom: 18px;\n  min-height: 40px;\n}\n.pk-option > button {\n  width: 100%;\n}\n.pk-join {\n  display: flex;\n  gap: 8px;\n  align-items: flex-end;\n}\n.pk-join label {\n  flex: 1;\n  min-width: 0;\n  font-size: 12px;\n}\n.pk-join input {\n  margin-top: 5px;\n  width: 100%;\n  font-family: Consolas, monospace;\n  letter-spacing: 1px;\n  text-transform: uppercase;\n}\n.competition-dialog input {\n  min-height: 46px;\n  padding: 10px 12px;\n  border: 1px solid #bacabd;\n  border-radius: 10px;\n  background: white;\n  color: #203b35;\n  font-size: 16px;\n  max-width: 100%;\n  box-shadow: none;\n}\n.pk-footer {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  margin-top: 18px;\n  padding: 10px 0;\n}\n.pk-footer p {\n  max-width: 310px;\n  color: var(--pk-muted);\n  font-size: 12px;\n}\n.pk-footer button {\n  white-space: nowrap;\n}\n.pk-room-intro {\n  text-align: center;\n  padding: 16px 0;\n}\n.pk-room-intro h2 {\n  font-size: 24px;\n}\n.pk-room-intro p {\n  font-size: 13px;\n  color: var(--pk-muted);\n  margin-top: 6px;\n}\n.pk-room-code {\n  display: block;\n  margin: 8px 0;\n  font:\n    600 18px/1.5 Consolas,\n    monospace;\n  letter-spacing: 3px;\n  color: #42604c;\n}\n.pk-matchup {\n  display: grid;\n  grid-template-columns: 1fr 42px 1fr;\n  align-items: center;\n  gap: 8px;\n  margin: 16px 0;\n}\n.pk-versus {\n  text-align: center;\n  color: #9c977a;\n  font:\n    bold italic 21px Georgia,\n    serif;\n}\n.pk-player {\n  border: 1px solid var(--pk-line);\n  border-radius: 18px;\n  background: #fffef9;\n  text-align: center;\n  padding: 22px 12px;\n  min-width: 0;\n}\n.pk-player .pk-avatar {\n  margin: 0 auto 12px;\n  width: 54px;\n  height: 54px;\n}\n.pk-player strong {\n  display: block;\n  overflow-wrap: anywhere;\n  font-size: 15px;\n}\n.pk-player small {\n  display: block;\n  color: var(--pk-muted);\n  font-size: 12px;\n  margin-top: 4px;\n}\n.pk-player[data-ready] {\n  border-color: #78a287;\n  background: #edf5e9;\n}\n.pk-player[data-empty] {\n  border-style: dashed;\n  background: transparent;\n}\n.pk-room-actions {\n  display: flex;\n  gap: 12px;\n  justify-content: center;\n}\n.pk-room-actions > button {\n  min-width: 130px;\n}\n.pk-room-note {\n  text-align: center;\n  color: var(--pk-muted) !important;\n  font-size: 12px;\n  margin-top: 16px !important;\n}\n.competition-dialog canvas[data-play] {\n  display: block;\n  width: 100%;\n  height: 100%;\n  min-height: 0;\n  touch-action: none;\n  border-radius: 14px;\n  background: #102a32;\n}\n.competition-dialog[data-playing] .pk-content {\n  overflow: hidden;\n}\n.competition-dialog[data-playing] .pk-brand small {\n  display: none;\n}\n.competition-dialog[data-playing] .pk-shell {\n  padding: 10px 14px max(10px, env(safe-area-inset-bottom));\n}\n.competition-dialog[data-playing] .pk-status {\n  margin: 5px 0 !important;\n}\n.competition-dialog[data-playing] .pk-header {\n  padding-bottom: 7px;\n}\n.competition-dialog[data-playing] .pk-brand-mark {\n  width: 30px;\n  height: 30px;\n  border-radius: 9px;\n}\n.pk-overlay {\n  position: absolute;\n  inset: 0;\n  z-index: 5;\n  background: #153d315c;\n  backdrop-filter: blur(5px);\n  padding: 24px;\n  display: grid;\n  place-items: center;\n  overflow: auto;\n}\n.pk-sheet {\n  width: 100%;\n  max-width: 560px;\n  max-height: 100%;\n  overflow: auto;\n  border: 1px solid #dce3d5;\n  border-radius: 22px;\n  background: #fffef8;\n  box-shadow: 0 18px 60px #11291d30;\n  padding: 24px;\n  overscroll-behavior: contain;\n}\n.pk-sheet[data-kind='board'] {\n  max-width: 690px;\n}\n.pk-sheet-head {\n  display: flex;\n  gap: 12px;\n  align-items: center;\n  margin-bottom: 18px;\n}\n.pk-sheet-head > div {\n  flex: 1;\n}\n.pk-sheet-head h2 {\n  font-size: 23px;\n  line-height: 1.3;\n}\n.pk-sheet-head small {\n  color: var(--pk-muted);\n  font-size: 12px;\n}\n.pk-rule-list {\n  list-style: none;\n  padding: 0;\n  margin: 0;\n  counter-reset: rules;\n}\n.pk-rule-list li {\n  counter-increment: rules;\n  display: flex;\n  gap: 14px;\n  margin-top: 18px;\n  line-height: 1.8;\n  font-size: 14px;\n}\n.pk-rule-list li::before {\n  content: counter(rules, decimal-leading-zero);\n  font:\n    600 12px/28px Consolas,\n    monospace;\n  color: #3c7660;\n  flex: none;\n}\n.pk-sheet-note {\n  margin-top: 18px !important;\n  padding-top: 16px;\n  border-top: 1px solid var(--pk-line);\n  color: var(--pk-muted) !important;\n  font-size: 12px;\n}\n.pk-my-record {\n  padding: 16px;\n  border-radius: 16px;\n  background: #234c41;\n  color: #fff8e4;\n  margin-bottom: 18px;\n}\n.pk-my-record small {\n  color: #c3d6c3;\n}\n.pk-my-record strong {\n  display: block;\n  font-size: 22px;\n  line-height: 1.4;\n  margin: 5px 0;\n}\n.pk-my-record p {\n  font-size: 12px;\n  color: #e3eadc;\n}\n.pk-list {\n  display: grid;\n  gap: 2px;\n}\n.pk-rank-row {\n  display: grid;\n  grid-template-columns: 30px minmax(0, 1fr) auto;\n  gap: 10px;\n  align-items: center;\n  padding: 12px 8px;\n  border-bottom: 1px solid #e9ede3;\n  font-size: 13px;\n}\n.pk-rank-row[data-self] {\n  background: #edf2e6;\n  border-radius: 10px;\n}\n.pk-rank-number {\n  font:\n    600 17px Georgia,\n    serif;\n  color: #7b876e;\n}\n.pk-rank-row:nth-child(-n + 3) .pk-rank-number {\n  color: #9a7130;\n}\n.pk-rank-name {\n  font-weight: 600;\n  overflow-wrap: anywhere;\n}\n.pk-rank-name small {\n  display: block;\n  font-weight: 400;\n  color: var(--pk-muted);\n  font-size: 10px;\n}\n.pk-rank-score {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n  max-width: 190px;\n  overflow-wrap: anywhere;\n  font-size: 12px;\n}\n.pk-empty {\n  padding: 32px 16px;\n  text-align: center;\n  color: var(--pk-muted);\n  border: 1px dashed var(--pk-line);\n  border-radius: 14px;\n  font-size: 14px;\n}\n.pk-result {\n  padding: 16px;\n  border-radius: 16px;\n  background: #f0f3e8;\n  margin-bottom: 12px;\n}\n.pk-result h3 {\n  font-size: 14px;\n}\n.pk-result strong {\n  display: block;\n  font-size: 22px;\n  line-height: 1.5;\n  margin: 5px 0;\n}\n.pk-result p {\n  font-size: 12px;\n  color: var(--pk-muted);\n  margin-top: 5px;\n}\n.pk-result-actions {\n  display: flex;\n  gap: 10px;\n  margin-top: 18px;\n  flex-wrap: wrap;\n}\n.pk-result-actions button {\n  flex: 1;\n}\n.pk-profile-form label {\n  font-weight: 600;\n  display: block;\n}\n.pk-profile-form input {\n  width: 100%;\n  margin: 8px 0;\n}\n.pk-profile-form small {\n  color: var(--pk-muted);\n  font-size: 12px;\n}\n.pk-profile-form .pk-form-message {\n  color: #974c35;\n  min-height: 24px;\n  font-size: 12px;\n  margin-top: 8px;\n}\n.pk-profile-form button[type='submit'] {\n  width: 100%;\n  margin-top: 10px;\n}\n.pk-profile-id {\n  margin-top: 20px;\n  border-top: 1px solid var(--pk-line);\n  padding-top: 12px;\n  color: var(--pk-muted);\n  font-size: 12px;\n}\n.pk-profile-id summary {\n  cursor: pointer;\n  min-height: 32px;\n}\n.pk-profile-id code {\n  display: block;\n  font-size: 11px;\n  overflow-wrap: anywhere;\n  margin-top: 8px;\n}\n@media (max-width: 600px) {\n  .competition-dialog {\n    width: 100%;\n    height: 100dvh;\n    border: 0;\n    border-radius: 0;\n  }\n  .pk-shell {\n    padding: 12px 16px max(16px, env(safe-area-inset-bottom));\n  }\n  .pk-header {\n    gap: 4px;\n  }\n  .pk-brand {\n    gap: 8px;\n  }\n  .pk-brand strong {\n    font-size: 15px;\n  }\n  .pk-brand-mark {\n    width: 32px;\n    height: 32px;\n  }\n  .pk-brand small {\n    font-size: 9px;\n    letter-spacing: 0.5px;\n  }\n  .pk-tools {\n    gap: 0;\n  }\n  .competition-dialog .pk-tools button {\n    padding: 8px 9px;\n    font-size: 12px;\n  }\n  .pk-hero {\n    padding: 10px 0 16px;\n  }\n  .pk-hero h2 {\n    font-size: 27px;\n  }\n  .pk-profile {\n    padding: 12px;\n    margin-bottom: 12px;\n  }\n  .pk-options {\n    grid-template-columns: 1fr;\n    gap: 10px;\n  }\n  .pk-option {\n    padding: 16px;\n  }\n  .pk-option h3 {\n    font-size: 17px;\n  }\n  .pk-option p {\n    min-height: 0;\n    margin-bottom: 12px;\n  }\n  .pk-footer {\n    margin-top: 8px;\n    align-items: flex-start;\n  }\n  .pk-footer p {\n    font-size: 11px;\n  }\n  .pk-overlay {\n    padding: 16px;\n  }\n  .pk-sheet {\n    padding: 20px;\n    border-radius: 20px;\n  }\n  .pk-sheet-head h2 {\n    font-size: 21px;\n  }\n  .pk-rank-row {\n    grid-template-columns: 23px minmax(0, 1fr);\n    gap: 5px 8px;\n  }\n  .pk-rank-score {\n    grid-column: 2;\n    text-align: left;\n    max-width: none;\n    font-size: 11px;\n    color: var(--pk-muted);\n  }\n  .pk-rank-name small {\n    display: inline;\n    margin-left: 6px;\n  }\n  .pk-player {\n    padding: 18px 8px;\n  }\n  .competition-dialog[data-playing] .pk-brand strong {\n    font-size: 13px;\n  }\n  .competition-dialog[data-playing] .pk-brand-mark {\n    display: none;\n  }\n}\n@media (max-height: 500px) and (min-width: 601px) {\n  .competition-dialog {\n    width: 100%;\n    height: 100dvh;\n    border: 0;\n    border-radius: 0;\n  }\n  .pk-shell {\n    padding: 8px 20px;\n  }\n  .pk-status {\n    margin: 4px 0 !important;\n  }\n  .pk-hero {\n    padding: 8px 0;\n  }\n  .pk-hero h2 {\n    font-size: 24px;\n  }\n  .pk-hero p {\n    margin-top: 3px;\n  }\n  .pk-profile {\n    padding: 8px 12px;\n    margin-bottom: 10px;\n  }\n  .pk-option {\n    padding: 12px;\n  }\n  .pk-option p {\n    min-height: 0;\n    margin-bottom: 8px;\n  }\n  .pk-overlay {\n    padding: 12px;\n  }\n  .pk-sheet {\n    padding: 16px 22px;\n  }\n  .pk-matchup {\n    margin: 6px 0;\n  }\n  .pk-player {\n    padding: 8px;\n  }\n  .pk-player .pk-avatar {\n    width: 36px;\n    height: 36px;\n    margin-bottom: 4px;\n  }\n  .pk-room-intro {\n    padding: 3px 0;\n  }\n  .pk-room-note {\n    margin-top: 6px !important;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .competition-dialog button {\n    transition: none;\n  }\n}\n.pk-overlay {\n  top: 76px;\n}\n.pk-brand strong {\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.pk-brand > div {\n  min-width: 0;\n}\n.competition-dialog[aria-busy] [data-create],\n.competition-dialog[aria-busy] [data-join] {\n  opacity: 0.6;\n  cursor: progress;\n}\nbody:has(.competition-dialog[open]) {\n  overflow: hidden !important;\n}\n.competition-dialog button {\n  font-weight: 600;\n  line-height: 1.4;\n}\n.competition-dialog .pk-quiet {\n  font-weight: 500;\n}\n.pk-match-options {\n  display: grid;\n  gap: 10px;\n  margin-bottom: 16px;\n}\n.pk-match-options label {\n  display: grid;\n  gap: 4px;\n  font-size: 13px;\n}\n.pk-match-options select {\n  min-height: 44px;\n  border: 1px solid #bacabd;\n  border-radius: 10px;\n  background: #fff;\n  color: #203b35;\n  padding: 8px;\n  font: inherit;\n}\n.pk-match-options small,\n.pk-role-actions small {\n  color: var(--pk-muted);\n  font-size: 12px;\n}\n.pk-role-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  align-items: center;\n  justify-content: center;\n  margin: 12px 0 18px;\n}\n.pk-role-actions small {\n  flex-basis: 100%;\n  text-align: center;\n}\n.pk-role-actions button[aria-pressed='true'] {\n  background: #234c41;\n  color: #fff;\n  opacity: 1;\n}\n.competition-dialog select:focus-visible {\n  outline: 3px solid #42997c;\n  outline-offset: 3px;\n}\n@media (max-width: 420px) {\n  .pk-room-actions {\n    gap: 6px;\n    flex-wrap: wrap;\n  }\n  .pk-room-actions > button {\n    min-width: 110px;\n  }\n}\n.pk-role-actions select {\n  margin-left: 8px;\n  min-height: 44px;\n  background: #fff;\n  color: #203b35;\n  border: 1px solid #bacabd;\n  border-radius: 8px;\n  padding: 8px;\n  font: inherit;\n}\n\n.pk-exit {\n  flex: none;\n  display: flex;\n  justify-content: flex-end;\n  padding-top: 8px;\n}\n.pk-sheet-actions {\n  display: flex;\n  justify-content: flex-end;\n  margin-top: 18px;\n}\n";
	//#endregion
	//#region ../../platforms/competition/format.js
	function playerName(player, peers = []) {
		const name = player.name || "新玩家", id = player.playerId || player.id || "";
		const duplicates = peers.filter((p) => (p.name || "新玩家") === name);
		if (duplicates.length < 2) return name;
		let length = 6;
		while (length < id.length && duplicates.some((p) => (p.playerId || p.id) !== id && (p.playerId || p.id || "").slice(0, length) === id.slice(0, length))) length++;
		return `${name} · #${id.slice(0, length).toUpperCase()}`;
	}
	function scoreText(game, score, secondary = 0) {
		const time = `${(secondary / 1e3).toFixed(2)}秒`;
		if (game === "carding-car") return `${(-score / 1e3).toFixed(2)}秒`;
		if (game === "cops-robbers" || game === "cops-robbers-realtime") return `${score}分`;
		if (game === "letters-words2") return `${Math.floor(score / 1e6)}词 · 正确率${(score % 1e6 / 100).toFixed(2)}% · ${time}`;
		return `${score}分${game === "xiangqi-five" ? "" : " · " + time}`;
	}
	function gapText(game, board) {
		if (!board.me) return "尚无有效成绩";
		if (!board.gap) return Number(board.me.rank) === 1 ? "已并列或独占榜首" : "暂无更高目标";
		const { score, secondary } = board.gap;
		if (score === 0) return `距上一名快 ${(Math.max(0, secondary) / 1e3).toFixed(2)} 秒`;
		if (game === "carding-car") return `距上一名快 ${(score / 1e3).toFixed(2)} 秒`;
		if (game === "letters-words2") {
			const words = Math.floor(board.previous.score / 1e6) - Math.floor(board.me.score / 1e6);
			return words ? `距上一名多完成 ${words} 词` : `距上一名正确率提高 ${(score / 100).toFixed(2)} 个百分点`;
		}
		return `距上一名 ${score} 分`;
	}
	//#endregion
	//#region ../../platforms/competition/street.css?inline
	var street_default = ".street-competition {\n  --sp-ink: #182c55;\n  --sp-muted: #788092;\n  --sp-blue: #0789ff;\n  --sp-coral: #ff934b;\n  position: fixed;\n  inset: 0;\n  z-index: 1200;\n  overflow: hidden;\n  color: var(--sp-ink);\n  background: #f2e7d5;\n  font:\n    15px/1.5 'PingFang SC',\n    'Microsoft YaHei',\n    system-ui,\n    sans-serif;\n  text-align: left;\n  isolation: isolate;\n}\n.street-competition[hidden],\n.street-competition [hidden] {\n  display: none !important;\n}\n.street-competition *,\n.street-competition *::before,\n.street-competition *::after {\n  box-sizing: border-box;\n}\n.street-competition h1,\n.street-competition h2,\n.street-competition h3,\n.street-competition p {\n  margin: 0;\n  font-family: inherit;\n  color: inherit;\n  letter-spacing: 0;\n}\n.street-competition button,\n.street-competition input {\n  font: inherit;\n  color: inherit;\n  letter-spacing: 0;\n}\n.street-competition button {\n  min-height: 46px;\n  border: 0;\n  border-radius: 17px;\n  padding: 10px 16px;\n  background: #fffaf0;\n  color: var(--sp-ink);\n  cursor: pointer;\n  font-weight: 850;\n  touch-action: manipulation;\n  -webkit-tap-highlight-color: transparent;\n  transition:\n    transform 160ms ease,\n    filter 160ms ease,\n    box-shadow 160ms ease;\n}\n.street-competition button:active {\n  transform: translateY(3px) scale(0.98);\n}\n.street-competition button:disabled {\n  opacity: 0.58;\n  cursor: default;\n}\n.street-competition button:focus-visible,\n.street-competition input:focus-visible {\n  outline: 3px solid #ffc849;\n  outline-offset: 3px;\n}\n.street-competition svg {\n  width: 24px;\n  height: 24px;\n  fill: none;\n  stroke: currentColor;\n  stroke-width: 2.6;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n  flex: none;\n}\n.sp-shell {\n  width: min(100%, 520px);\n  height: 100dvh;\n  margin: auto;\n  display: flex;\n  flex-direction: column;\n  background: radial-gradient(ellipse at 50% 18%, #fffef7 0, #fff6e8 66%, #f8ecd9 100%);\n  box-shadow: 0 0 80px #8973531a;\n  padding-top: env(safe-area-inset-top);\n}\n.sp-header {\n  display: grid;\n  grid-template-columns: 46px 1fr 46px;\n  gap: 6px;\n  align-items: center;\n  min-height: 76px;\n  padding: 10px 16px 5px;\n  flex: none;\n  text-align: center;\n}\n.sp-header h1 {\n  font-size: clamp(23px, 7vw, 30px);\n  font-weight: 950;\n  line-height: 1.2;\n}\n.sp-header p {\n  font-size: 11px;\n  color: #65738c;\n  margin-top: 3px;\n}\n.street-competition button.sp-back,\n.street-competition button.sp-help {\n  padding: 0;\n  width: 43px;\n  height: 43px;\n  min-height: 43px;\n  display: grid;\n  place-items: center;\n  border-radius: 50%;\n  background: #fffaf0;\n  border: 1px solid #ead9bd;\n  box-shadow:\n    0 3px 0 #deccb056,\n    inset 0 1px 0 white;\n}\n.street-competition button.sp-help {\n  width: 34px;\n  height: 34px;\n  min-height: 34px;\n  justify-self: end;\n  font-size: 19px;\n  color: #7c8b9c;\n  border-color: transparent;\n  box-shadow: none;\n}\n.sp-status {\n  margin: 0 18px 7px !important;\n  min-height: 25px;\n  flex: none;\n  font-size: 11px;\n  color: #62818a !important;\n  text-align: center;\n  padding: 3px 6px;\n}\n.sp-status[data-error] {\n  background: #ffebe1;\n  border-radius: 10px;\n  color: #aa4730 !important;\n}\n.sp-pages {\n  flex: 1;\n  min-height: 0;\n  overflow: hidden;\n}\n.sp-page {\n  height: 100%;\n  overflow-y: auto;\n  overflow-x: hidden;\n  overscroll-behavior: contain;\n  padding: 0 18px 18px;\n  scrollbar-width: thin;\n}\n.sp-vs-hero {\n  position: relative;\n  height: 230px;\n  display: flex;\n  align-items: flex-end;\n  justify-content: center;\n  overflow: hidden;\n  margin: 0 -8px 16px;\n  background:\n    radial-gradient(ellipse at 30% 90%, #cbe9ff99 0, transparent 55%),\n    radial-gradient(ellipse at 80% 90%, #ffe0c099 0, transparent 55%);\n  border-radius: 28px;\n}\n.sp-figure {\n  display: block;\n  aspect-ratio: 2 / 3;\n  width: 145px;\n  flex: none;\n  background-image: var(--sp-sprites);\n  background-size: 300% 200%;\n  background-repeat: no-repeat;\n  background-position: 0 0;\n}\n.sp-figure[data-figure='runner'] {\n  background-position: 0 100%;\n}\n.sp-vs-hero .sp-figure:first-child {\n  transform: rotate(-5deg);\n}\n.sp-vs-hero .sp-figure:nth-of-type(2) {\n  transform: rotate(5deg);\n}\n.sp-vs {\n  position: absolute;\n  left: 50%;\n  top: 42%;\n  transform: translate(-50%, -50%) rotate(-9deg);\n  font-size: 61px;\n  line-height: 1;\n  font-weight: 1000;\n  font-style: italic;\n  color: #ffd651;\n  -webkit-text-stroke: 2px #ffae39;\n  text-shadow:\n    0 5px 0 #e4792d,\n    0 7px 10px #ae551634;\n  z-index: 1;\n}\n.sp-spark {\n  position: absolute;\n  color: #ffcd47;\n  font-size: 32px;\n  font-style: normal;\n}\n.sp-spark-one {\n  top: 6px;\n  left: 4px;\n  transform: rotate(-20deg);\n}\n.sp-spark-two {\n  top: 14px;\n  right: 8px;\n  transform: rotate(14deg);\n}\n.sp-entry-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 12px;\n}\n.street-competition .sp-entry {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  padding: 17px 10px 15px;\n  min-height: 147px;\n  border: 2px solid #ffffffbb;\n  box-shadow:\n    0 4px 0 #0e73d13b,\n    0 6px 10px #466fa21a,\n    inset 0 2px 0 #ffffff77;\n  border-radius: 22px;\n  color: white;\n}\n.street-competition .sp-entry-blue {\n  background: linear-gradient(150deg, #4fc3ff 0, #078bff 68%, #0870ed);\n}\n.street-competition .sp-entry-coral {\n  background: linear-gradient(150deg, #ffc293 0, #ff8f45 70%, #ff7843);\n  box-shadow:\n    0 4px 0 #e5753345,\n    0 6px 10px #bc80431a,\n    inset 0 2px 0 #ffffff77;\n}\n.sp-entry > svg {\n  width: 40px;\n  height: 40px;\n  stroke-width: 2.8;\n  margin-bottom: 5px;\n  filter: drop-shadow(0 2px 0 #2257a321);\n}\n.sp-entry strong {\n  font-size: clamp(21px, 6vw, 27px);\n  line-height: 1.3;\n  text-shadow: 0 2px 0 #2167b62c;\n}\n.sp-entry small {\n  font-size: 11px;\n  opacity: 0.95;\n  margin-top: 4px;\n}\n.sp-entry-arrow {\n  position: absolute;\n  right: 4px;\n  top: 59%;\n}\n.sp-entry-arrow svg {\n  width: 18px;\n  height: 18px;\n}\n.sp-profile-card,\n.sp-wide-link {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  border: 1px solid #ebd9bf;\n  border-radius: 21px;\n  background: #fffbf3;\n  padding: 11px;\n  margin-top: 14px;\n  box-shadow: 0 3px 0 #e1cda426;\n}\n.sp-profile-card > div {\n  min-width: 0;\n  flex: 1;\n}\n.sp-profile-card strong {\n  display: block;\n  font-size: 15px;\n  overflow-wrap: anywhere;\n}\n.sp-profile-card small {\n  display: block;\n  font-size: 11px;\n  color: #7d8392;\n}\n.street-competition .sp-profile-card button {\n  padding: 6px;\n  min-height: 44px;\n  width: 44px;\n  background: #e9f4ff;\n  color: #168bff;\n}\n.sp-portrait {\n  display: block;\n  width: 52px;\n  height: 52px;\n  border: 2px solid white;\n  border-radius: 50%;\n  background-color: #d9f0ff;\n  background-image: var(--sp-sprites);\n  background-size: 300% 300%;\n  background-repeat: no-repeat;\n  background-position: 0 0;\n  box-shadow: 0 2px 5px #44719821;\n  flex: none;\n}\n.sp-portrait[data-portrait-role='runner'] {\n  background-color: #ffe4cf;\n  background-position-y: 75%;\n}\n.sp-portrait[data-preset='1'] {\n  background-position-x: 50%;\n}\n.sp-portrait[data-preset='2'] {\n  background-position-x: 100%;\n}\n.sp-portrait[data-custom] {\n  background-size: cover;\n  background-position: center;\n}\n.street-competition .sp-wide-link {\n  width: 100%;\n  margin-top: 10px;\n  min-height: 68px;\n  padding: 12px 14px;\n  text-align: left;\n}\n.sp-wide-link > svg:first-child {\n  color: #eea22b;\n  width: 36px;\n  height: 36px;\n}\n.sp-wide-link > span {\n  flex: 1;\n}\n.sp-wide-link strong,\n.sp-wide-link small {\n  display: block;\n}\n.sp-wide-link strong {\n  font-size: 19px;\n}\n.sp-wide-link small {\n  font-size: 11px;\n  color: #94806c;\n  font-weight: 500;\n}\n.sp-note {\n  font-size: 11px;\n  color: #8a8790 !important;\n  margin: 13px 4px 5px !important;\n  text-align: center;\n  line-height: 1.7;\n  overflow-wrap: anywhere;\n}\n.sp-bottom-nav {\n  min-height: 72px;\n  padding: 5px 15px max(8px, env(safe-area-inset-bottom));\n  flex: none;\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 8px;\n  border-top: 1px solid #ecddc3;\n  background: #fff9ee;\n}\n.street-competition .sp-bottom-nav button {\n  display: flex;\n  align-items: center;\n  flex-direction: column;\n  gap: 2px;\n  padding: 5px 8px;\n  color: #979294;\n  font-size: 11px;\n  background: transparent;\n  border-radius: 16px;\n}\n.sp-bottom-nav button svg {\n  width: 26px;\n  height: 26px;\n}\n.street-competition .sp-bottom-nav button[aria-pressed='true'] {\n  background: #e8f3ff;\n  color: #008bff;\n}\n.sp-section-heading {\n  font-size: 15px;\n  line-height: 1.5;\n  font-weight: 900;\n  margin: 16px 0 8px !important;\n  display: flex;\n  align-items: center;\n  gap: 7px;\n}\n.sp-section-heading::before {\n  content: '';\n  width: 4px;\n  height: 15px;\n  background: #088eff;\n  border-radius: 5px;\n}\n.sp-choice-roles {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 11px;\n}\n.street-competition .sp-choice-roles button {\n  padding: 6px 5px 9px;\n  position: relative;\n  overflow: hidden;\n  border: 2px solid #f7d0af;\n  background: linear-gradient(145deg, #ffdfbb, #ffb891);\n  box-shadow: 0 3px 0 #dac4ac33;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n}\n.street-competition .sp-choice-roles button:first-child {\n  border-color: #acdfff;\n  background: linear-gradient(145deg, #d4f5ff, #a5dcff);\n}\n.street-competition .sp-choice-roles button[aria-pressed='true'] {\n  border-color: #058fff;\n  box-shadow:\n    0 0 0 2px #fff,\n    0 3px 0 #2896e840;\n}\n.sp-choice-roles .sp-figure {\n  width: 115px;\n  height: 173px;\n  margin-bottom: -7px;\n}\n.sp-choice-roles strong {\n  font-size: 18px;\n  position: relative;\n  padding-top: 5px;\n  z-index: 1;\n}\n.sp-choice-roles small {\n  font-size: 10px;\n  color: #5c779a;\n  position: relative;\n  z-index: 1;\n  font-weight: 600;\n}\n.sp-choice-roles i {\n  display: none;\n  position: absolute;\n  right: 6px;\n  top: 6px;\n  width: 23px;\n  height: 23px;\n  border: 2px solid white;\n  border-radius: 50%;\n  background: #078aff;\n  color: white;\n}\n.sp-choice-roles i svg {\n  width: 16px;\n  height: 16px;\n}\n.sp-choice-roles [aria-pressed='true'] i {\n  display: grid;\n  place-items: center;\n}\n.sp-mode-grid {\n  display: grid;\n  grid-template-columns: repeat(2, 1fr);\n  gap: 10px;\n}\n.street-competition .sp-mode-card {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  padding: 10px 7px;\n  border: 2px solid #e9d9c3;\n  background: #fffcf5;\n  box-shadow: 0 3px 0 #c8b28d1a;\n  border-radius: 19px;\n}\n.street-competition .sp-mode-card[aria-pressed='true'] {\n  border-color: #098fff;\n  background: #eef8ff;\n}\n.sp-mode-symbol {\n  display: grid;\n  place-items: center;\n  width: 100%;\n  height: 62px;\n  margin-bottom: 4px;\n  font-size: 36px;\n  color: #ffe157;\n  text-shadow: 0 2px 0 #e09b22;\n  border-radius: 11px;\n  background:\n    linear-gradient(#a4d9f578, #61b6ed16),\n    var(--sp-city) center 46% / cover;\n}\n.sp-mode-card strong {\n  font-size: 14px;\n}\n.sp-mode-card small {\n  font-size: 10px;\n  font-weight: 500;\n  color: #708298;\n  margin-top: 3px;\n}\n.sp-segments {\n  display: flex;\n  gap: 5px;\n  padding: 4px;\n  border-radius: 999px;\n  background: #eee8df;\n  box-shadow: inset 0 1px 2px #77645615;\n}\n.street-competition .sp-segments button {\n  flex: 1;\n  min-width: 0;\n  min-height: 44px;\n  padding: 7px 5px;\n  border-radius: 999px;\n  background: transparent;\n  font-size: 12px;\n  color: #6c7181;\n}\n.street-competition .sp-segments button[aria-pressed='true'] {\n  color: white;\n  background: linear-gradient(#37b6ff, #0589ff);\n  box-shadow:\n    inset 0 2px 0 #ffffff6b,\n    0 3px 0 #1b7ee02e;\n}\n.street-competition .sp-segments button[aria-pressed='true']:disabled {\n  opacity: 1;\n}\n.sp-info-pills {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 10px;\n  margin: 14px 0 18px;\n}\n.sp-info-pills > span {\n  display: grid;\n  grid-template-columns: 30px 1fr;\n  align-items: center;\n  padding: 10px;\n  background: #fffbf5;\n  border: 1px solid #ebdcc7;\n  border-radius: 16px;\n}\n.sp-info-pills svg {\n  grid-row: span 2;\n  color: #239dff;\n}\n.sp-info-pills strong {\n  font-size: 12px;\n}\n.sp-info-pills small {\n  font-size: 10px;\n  color: #8e8d98;\n}\n.street-competition .sp-primary,\n.street-competition .sp-secondary,\n.street-competition .sp-invite-link {\n  width: 100%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  margin-top: 12px;\n}\n.street-competition .sp-primary {\n  min-height: 56px;\n  color: white;\n  font-weight: 950;\n  font-size: 21px;\n  border: 2px solid #f8feff;\n  border-radius: 999px;\n  background: linear-gradient(#47c5ff 0, #1097ff 38%, #057dff 100%);\n  box-shadow:\n    0 4px 0 #1c69bc48,\n    inset 0 2px 0 #ffffff61,\n    0 6px 10px #266eac19;\n  text-shadow: 0 2px 0 #206ab633;\n}\n.street-competition .sp-primary svg {\n  width: 25px;\n  height: 25px;\n}\n.street-competition .sp-secondary {\n  min-height: 51px;\n  border: 1px solid #e4d1b5;\n  background: #fff9ed;\n  box-shadow:\n    inset 0 2px 0 #fff,\n    0 3px 0 #cbb18b32;\n  font-size: 16px;\n  border-radius: 999px;\n}\n.sp-card {\n  padding: 19px 16px;\n  border: 1px solid #ead9bf;\n  border-radius: 24px;\n  background: #fffbf3;\n  box-shadow: 0 4px 0 #d9c29d1a;\n}\n.sp-vs-hero-small {\n  height: 200px;\n  margin-top: 7px;\n}\n.sp-vs-hero-small .sp-figure {\n  width: 126px;\n}\n.sp-join-form label {\n  display: block;\n  text-align: center;\n  font-size: 17px;\n  font-weight: 900;\n}\n.street-competition input {\n  width: 100%;\n  min-width: 0;\n  min-height: 48px;\n  padding: 10px 13px;\n  border: 2px solid #e9dcc6;\n  border-radius: 15px;\n  background: #fffaf3;\n  outline-offset: 3px;\n  box-shadow: inset 0 2px 0 #9b7d4b0a;\n}\n.street-competition .sp-join-form input {\n  margin-top: 16px;\n  text-align: center;\n  font-size: clamp(18px, 6vw, 24px);\n  font-weight: 900;\n  letter-spacing: 2px;\n  color: #127bea;\n  text-transform: uppercase;\n}\n.sp-join-form > small {\n  display: block;\n  font-size: 11px;\n  color: #8b8995;\n  text-align: center;\n  margin-top: 10px;\n}\n.sp-room-hero {\n  height: 190px;\n  margin-bottom: 0;\n  background:\n    linear-gradient(#bbdef573, #fff6e700),\n    var(--sp-city) center 55% / cover;\n}\n.sp-room-hero .sp-figure {\n  width: 126px;\n}\n.sp-room-code-card {\n  padding: 10px 10px 8px;\n  text-align: center;\n  margin: -6px 15px 12px;\n  border: 1px solid #e5d5ba;\n  border-radius: 18px;\n  background: #fffdf5;\n  position: relative;\n  box-shadow: 0 4px 0 #c3a17321;\n}\n.sp-room-code-card > small {\n  font-size: 10px;\n  color: #9a8990;\n}\n.street-competition .sp-room-code-card button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 10px;\n  width: 100%;\n  background: transparent;\n  padding: 2px 4px;\n  min-height: 34px;\n}\n.sp-room-code-card strong {\n  font-size: 19px;\n  letter-spacing: 2px;\n  overflow-wrap: anywhere;\n}\n.sp-room-code-card svg {\n  width: 19px;\n  height: 19px;\n  color: #1693ff;\n}\n.sp-players {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 9px;\n}\n.sp-player {\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 10px 7px;\n  border: 2px solid #afdfff;\n  border-radius: 18px;\n  background: #f8fcff;\n}\n.sp-player[data-role='runner'] {\n  background: #fff8f0;\n  border-color: #f7c7a4;\n}\n.sp-player .sp-portrait {\n  width: 43px;\n  height: 43px;\n}\n.sp-player-copy {\n  flex: 1;\n  min-width: 0;\n  white-space: pre-line;\n}\n.sp-player-copy strong {\n  font-size: 11px;\n  display: block;\n  overflow-wrap: anywhere;\n}\n.sp-player-copy small {\n  display: block;\n  font-size: 10px;\n  color: #7b8b9b;\n  margin-top: 3px;\n}\n.sp-player[data-ready] .sp-player-copy small {\n  color: #35a051;\n}\n.sp-player[data-empty] {\n  border-style: dashed;\n  background: #fffaf2;\n  border-color: #e3d4bc;\n  color: #989198;\n  font-size: 10px;\n}\n.sp-wait-avatar {\n  width: 35px;\n  height: 35px;\n  display: grid;\n  place-items: center;\n  background: #f0e8dc;\n  border-radius: 50%;\n  font-size: 24px;\n  flex: none;\n}\n.sp-room-hint {\n  font-size: 11px;\n  color: #738294 !important;\n  text-align: center;\n  margin-top: 10px !important;\n}\n.sp-room-settings .sp-section-heading {\n  margin: 10px 0 6px !important;\n  font-size: 12px;\n}\n.sp-room-settings > small {\n  display: block;\n  font-size: 10px;\n  color: #998c91;\n  text-align: center;\n  margin-top: 7px;\n}\n.street-competition .sp-invite-link {\n  min-height: 44px;\n  font-size: 12px;\n  border: 1px solid #bcdafa;\n  border-radius: 13px;\n  background: #e9f4ff;\n  color: #1384e7;\n}\n.street-competition .sp-text-button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 7px;\n  width: 100%;\n  background: transparent;\n  min-height: 48px;\n  font-size: 13px;\n  color: #827578;\n  margin-top: 6px;\n}\n.sp-play-page {\n  display: flex;\n  flex-direction: column;\n  padding: 0 8px max(7px, env(safe-area-inset-bottom));\n}\n.sp-play-info {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 5px;\n  padding: 3px 8px 8px;\n  flex: none;\n}\n.sp-play-info strong {\n  font-size: 13px;\n  color: #1684ed;\n}\n.sp-play-info span {\n  font-size: 10px;\n  color: #7c8d9e;\n}\n.sp-play-page canvas {\n  width: 100%;\n  height: 100%;\n  flex: 1;\n  min-height: 0;\n  display: block;\n  border-radius: 17px;\n  touch-action: none;\n}\n.sp-play-actions {\n  display: flex;\n  gap: 6px;\n  flex: none;\n  padding-top: 8px;\n}\n.street-competition .sp-play-actions button {\n  flex: 1;\n  padding: 7px 5px;\n  font-size: 11px;\n  background: #eaf4ff;\n  color: #5783a6;\n}\n.street-competition[data-playing] .sp-header {\n  min-height: 50px;\n  padding-top: 3px;\n  padding-bottom: 0;\n}\n.street-competition[data-playing] .sp-header h1 {\n  font-size: 19px;\n}\n.street-competition[data-playing] .sp-header p {\n  display: none;\n}\n.street-competition[data-playing] .sp-status {\n  margin-bottom: 3px !important;\n  min-height: 22px;\n}\n.sp-board-intro,\n.sp-rules-hero,\n.sp-invite-hero {\n  text-align: center;\n  padding: 14px 6px 20px;\n}\n.sp-board-intro > svg,\n.sp-rules-hero > svg,\n.sp-invite-hero > svg {\n  display: block;\n  margin: auto auto 6px;\n  width: 53px;\n  height: 53px;\n  color: #ffbc33;\n  filter: drop-shadow(0 3px 0 #f4a32b22);\n}\n.sp-board-intro h2,\n.sp-rules-hero h2,\n.sp-invite-hero h2 {\n  font-size: 20px;\n  font-weight: 950;\n}\n.sp-board-intro p,\n.sp-rules-hero p,\n.sp-invite-hero p {\n  margin-top: 5px;\n  color: #7d8a99;\n  font-size: 11px;\n}\n.sp-podium {\n  display: flex;\n  align-items: flex-end;\n  justify-content: center;\n  gap: 5px;\n  padding: 9px 3px 0;\n  min-height: 217px;\n  background:\n    linear-gradient(#fffbf500, #e4f2fb99),\n    var(--sp-city) center 65% / cover;\n  border-radius: 24px 24px 0 0;\n}\n.sp-podium-place {\n  flex: 1;\n  min-width: 0;\n  text-align: center;\n  padding: 10px 6px 12px;\n  border: 1px solid #e9d9bf;\n  border-radius: 16px 16px 0 0;\n  background: #fff7e9;\n  position: relative;\n}\n.sp-podium-place[data-rank='1'] {\n  background: linear-gradient(#fff0b4, #ffe1a1);\n  padding-bottom: 30px;\n}\n.sp-podium-place .sp-portrait {\n  margin: -61px auto 11px;\n  width: 65px;\n  height: 65px;\n  background-color: #fff9df;\n  box-shadow: 0 0 0 3px #fff7e980;\n}\n.sp-podium-place[data-rank='1'] .sp-portrait {\n  width: 80px;\n  height: 80px;\n  margin-top: -80px;\n}\n.sp-podium-number {\n  position: absolute;\n  top: -14px;\n  right: 8px;\n  width: 25px;\n  height: 25px;\n  border-radius: 50%;\n  background: #ecc88a;\n  color: #fff;\n  font-weight: 950;\n  display: grid;\n  place-items: center;\n  box-shadow: 0 2px 0 #bd8b452b;\n}\n.sp-podium-place[data-rank='1'] .sp-podium-number {\n  background: #ffc132;\n  color: #a25c15;\n  width: 31px;\n  height: 31px;\n}\n.sp-podium-place strong {\n  display: block;\n  font-size: 11px;\n  overflow-wrap: anywhere;\n  line-height: 1.4;\n}\n.sp-podium-place small {\n  display: block;\n  color: #b68134;\n  font-size: 11px;\n  margin-top: 6px;\n  font-weight: 900;\n}\n.sp-rank-list {\n  list-style: none;\n  padding: 5px 12px;\n  margin: 0;\n  border: 1px solid #ead9bf;\n  border-radius: 0 0 20px 20px;\n  background: #fffaf0;\n}\n.sp-rank-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 59px;\n  border-bottom: 1px solid #ece0ce;\n  font-size: 12px;\n}\n.sp-rank-row:last-child {\n  border: 0;\n}\n.sp-rank-row .sp-portrait {\n  width: 32px;\n  height: 32px;\n}\n.sp-rank-row strong {\n  flex: 1;\n  min-width: 0;\n  overflow-wrap: anywhere;\n  font-size: 11px;\n}\n.sp-rank-row > span:last-child {\n  font-weight: 800;\n  font-size: 11px;\n}\n.sp-rank-number {\n  width: 18px;\n  text-align: center;\n  font-weight: 950;\n}\n.sp-empty {\n  text-align: center;\n  padding: 28px 12px;\n  color: #95879b;\n  font-size: 12px;\n}\n.sp-my-record {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin-top: 13px;\n  padding: 12px;\n  border: 2px solid #0e99ff;\n  border-radius: 20px;\n  background: linear-gradient(120deg, #f0fbff, #dcefff);\n  box-shadow: 0 3px 0 #008dff1a;\n}\n.sp-my-record-copy {\n  flex: 1;\n  min-width: 0;\n}\n.sp-my-record strong,\n.sp-my-record span,\n.sp-my-record small {\n  display: block;\n}\n.sp-my-record strong {\n  font-size: 13px;\n  overflow-wrap: anywhere;\n}\n.sp-my-record-copy > span {\n  font-weight: 900;\n  color: #147bea;\n  font-size: 16px;\n}\n.sp-my-record small {\n  font-size: 10px;\n  color: #6e839a;\n}\n.sp-name-hero {\n  position: relative;\n  display: flex;\n  justify-content: center;\n  padding: 22px 0 24px;\n}\n.sp-name-hero .sp-portrait {\n  width: 135px;\n  height: 135px;\n  border: 5px solid white;\n  box-shadow:\n    0 4px 0 #e3cba533,\n    0 0 0 2px #bee7fd;\n}\n.sp-name-hero i {\n  position: absolute;\n  color: #ffc94e;\n  font-size: 39px;\n  top: 43px;\n  font-style: normal;\n}\n.sp-name-hero i:nth-of-type(1) {\n  left: 18px;\n}\n.sp-name-hero i:nth-of-type(2) {\n  right: 18px;\n  top: 87px;\n  font-size: 23px;\n}\n.sp-name-form > label {\n  display: block;\n  font-size: 13px;\n  font-weight: 850;\n  margin-bottom: 7px;\n}\n.sp-name-input {\n  position: relative;\n}\n.street-competition .sp-name-input input {\n  padding-right: 39px;\n  font-weight: 850;\n}\n.sp-name-input svg {\n  position: absolute;\n  right: 12px;\n  top: 12px;\n  color: #008dff;\n  width: 21px;\n  height: 21px;\n}\n.sp-name-form > small {\n  display: block;\n  font-size: 10px;\n  margin-top: 8px;\n  color: #9b8992;\n  text-align: center;\n}\n.sp-form-message {\n  min-height: 20px;\n  font-size: 11px;\n  text-align: center;\n  color: #ba704c !important;\n  margin-top: 8px !important;\n}\n.sp-player-id {\n  padding: 20px 4px;\n  text-align: center;\n  color: #a7a0a3;\n}\n.sp-player-id small {\n  display: block;\n  font-size: 10px;\n}\n.sp-player-id code {\n  display: block;\n  margin-top: 4px;\n  font-size: 10px;\n  overflow-wrap: anywhere;\n}\n.sp-rule-list {\n  padding-left: 22px;\n  margin: 0;\n  font-size: 13px;\n  color: #607493;\n}\n.sp-rule-list li {\n  padding: 9px 0 9px 5px;\n}\n.sp-rule-list li::marker {\n  color: #168dff;\n  font-weight: 950;\n}\n.sp-result-hero {\n  position: relative;\n  min-height: 264px;\n  display: flex;\n  align-items: flex-end;\n  justify-content: center;\n  padding-bottom: 59px;\n}\n.sp-result-hero .sp-figure {\n  width: 123px;\n}\n.sp-result-trophy {\n  position: absolute;\n  z-index: 1;\n  color: #ffbf32;\n  top: 100px;\n  left: 50%;\n  transform: translateX(-50%) rotate(-8deg);\n  filter: drop-shadow(0 3px 0 #b97d2833);\n}\n.sp-result-trophy svg {\n  width: 80px;\n  height: 80px;\n  fill: #ffeaaa;\n  stroke-width: 2;\n}\n.sp-result-hero h2 {\n  position: absolute;\n  bottom: 32px;\n  left: 0;\n  width: 100%;\n  text-align: center;\n  color: #f3832d;\n  font-size: 24px;\n  font-weight: 950;\n}\n.sp-result-hero > p {\n  position: absolute;\n  bottom: 8px;\n  left: 0;\n  width: 100%;\n  text-align: center;\n  font-size: 11px;\n  color: #8c8493;\n}\n.sp-results {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 9px;\n}\n.sp-result-card {\n  padding: 12px 9px;\n  border: 1px solid #ead4b6;\n  border-radius: 18px;\n  background: #fff9ee;\n  text-align: center;\n  min-width: 0;\n}\n.sp-result-card:first-child {\n  border-color: #8dcfff;\n  background: #ecf8ff;\n}\n.sp-result-player {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 6px;\n}\n.sp-result-player .sp-portrait {\n  width: 48px;\n  height: 48px;\n}\n.sp-result-player h3 {\n  font-size: 11px;\n  overflow-wrap: anywhere;\n}\n.sp-result-score {\n  display: block;\n  font-size: 20px;\n  font-weight: 950;\n  color: #168bff;\n  margin: 9px 0 5px;\n}\n.sp-result-card p {\n  font-size: 10px;\n  color: #8a8190;\n}\n.sp-result-card > small {\n  display: block;\n  font-size: 10px;\n  color: #967e64;\n  margin-top: 7px;\n}\n.sp-invite-hero {\n  padding-top: 26px;\n}\n.sp-invite-hero > svg {\n  color: #1b9dff;\n}\n.sp-invite-card {\n  text-align: center;\n}\n.sp-invite-card > small {\n  display: block;\n  color: #9a8991;\n  font-size: 11px;\n}\n.sp-invite-card > strong {\n  font-size: 24px;\n  letter-spacing: 2px;\n  display: block;\n  margin: 13px 0;\n  user-select: all;\n  overflow-wrap: anywhere;\n}\n.sp-invite-card .sp-primary {\n  font-size: 18px;\n  margin-bottom: 20px;\n}\n.street-competition .sp-invite-card input {\n  min-height: 44px;\n  font-size: 11px;\n  margin-top: 10px;\n  color: #8b8095;\n}\n@media (max-width: 350px) {\n  .sp-page {\n    padding-left: 13px;\n    padding-right: 13px;\n  }\n  .sp-header {\n    padding-left: 12px;\n    padding-right: 12px;\n  }\n  .sp-header h1 {\n    font-size: 24px;\n  }\n  .sp-header p {\n    font-size: 10px;\n  }\n  .sp-vs-hero {\n    height: 198px;\n  }\n  .sp-vs-hero .sp-figure {\n    width: 126px;\n  }\n  .sp-entry-grid {\n    gap: 9px;\n  }\n  .street-competition .sp-entry {\n    min-height: 133px;\n  }\n  .sp-choice-roles .sp-figure {\n    width: 95px;\n    height: 143px;\n  }\n  .sp-choice-roles strong {\n    font-size: 16px;\n  }\n  .sp-choice-roles small {\n    font-size: 9px;\n  }\n  .sp-room-code-card strong {\n    font-size: 16px;\n  }\n  .sp-room-hero {\n    height: 174px;\n  }\n  .sp-room-hero .sp-figure {\n    width: 112px;\n  }\n  .sp-player .sp-portrait {\n    width: 35px;\n    height: 35px;\n  }\n  .sp-player-copy strong {\n    font-size: 10px;\n  }\n  .sp-result-hero .sp-figure {\n    width: 105px;\n  }\n  .sp-result-hero {\n    min-height: 237px;\n  }\n  .sp-result-trophy {\n    top: 82px;\n  }\n  .sp-result-score {\n    font-size: 17px;\n  }\n}\n@media (orientation: landscape) and (max-height: 540px) {\n  .sp-shell {\n    width: min(100%, 760px);\n  }\n  .sp-header {\n    min-height: 55px;\n    padding-top: 5px;\n  }\n  .sp-header h1 {\n    font-size: 22px;\n  }\n  .sp-header p {\n    font-size: 10px;\n  }\n  .sp-status {\n    min-height: 20px;\n    margin-bottom: 3px !important;\n  }\n  .sp-bottom-nav {\n    min-height: 56px;\n  }\n  .street-competition .sp-bottom-nav button {\n    flex-direction: row;\n    justify-content: center;\n    gap: 8px;\n  }\n  .sp-page {\n    padding-left: 24px;\n    padding-right: 24px;\n  }\n  [data-page='lobby'] .sp-vs-hero {\n    float: left;\n    width: 41%;\n    height: 220px;\n    margin: 0 18px 0 0;\n  }\n  [data-page='lobby'] .sp-vs-hero .sp-figure {\n    width: 129px;\n  }\n  [data-page='lobby'] .sp-entry-grid {\n    padding-top: 4px;\n  }\n  .street-competition [data-page='lobby'] .sp-entry {\n    min-height: 118px;\n    padding-top: 9px;\n  }\n  [data-page='lobby'] .sp-entry > svg {\n    width: 29px;\n    height: 29px;\n  }\n  [data-page='lobby'] .sp-entry strong {\n    font-size: 20px;\n  }\n  [data-page='lobby'] .sp-profile-card {\n    margin-top: 8px;\n    padding: 7px 10px;\n  }\n  [data-page='lobby'] .sp-wide-link {\n    margin-top: 8px;\n    min-height: 57px;\n    width: auto;\n  }\n  [data-page='lobby'] .sp-note {\n    clear: both;\n  }\n  .sp-play-page {\n    padding-left: 10px;\n    padding-right: 10px;\n  }\n  .sp-play-actions {\n    padding-top: 4px;\n  }\n  .street-competition .sp-play-actions button {\n    min-height: 44px;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .street-competition button {\n    transition: none;\n  }\n}\n";
	//#endregion
	//#region ../../games/local/cops-robbers-realtime/src/role-appearance.js
	var storageKey = "chase-role-appearance-v1";
	var presets = {
		team: {
			cop: [
				"#1677bf",
				"#d9f3ff",
				"◆"
			],
			robber: [
				"#d65b19",
				"#fff0b8",
				"ϟ"
			]
		},
		animals: {
			cop: [
				"#176cb0",
				"#d9f3ff",
				"🐱"
			],
			robber: [
				"#bc4c17",
				"#ffe3be",
				"🦊"
			]
		},
		cosmic: {
			cop: [
				"#4d51b8",
				"#e4e4ff",
				"✦"
			],
			robber: [
				"#b54920",
				"#ffdfb4",
				"☄"
			]
		}
	};
	var characterSheet = "./src/assets/characters.png";
	var characters = {
		cop: [
			{
				name: "阳光巡警",
				description: "正义、勇敢，守护街区的每一天。",
				crop: [
					104,
					12,
					282
				]
			},
			{
				name: "机灵警花",
				description: "眼疾手快，任何小线索都逃不过她。",
				crop: [
					486,
					18,
					306
				]
			},
			{
				name: "暖心警长",
				description: "经验满满，总能找到最佳围捕路线。",
				crop: [
					904,
					8,
					314
				]
			}
		],
		robber: [
			{
				name: "街头小机灵",
				description: "一顶橘色帽子，藏着满脑子的鬼点子。",
				crop: [
					92,
					637,
					322
				]
			},
			{
				name: "橘子少女",
				description: "轻快又灵巧，转个弯就有新惊喜。",
				crop: [
					507,
					640,
					315
				]
			},
			{
				name: "眼镜智多星",
				description: "观察街区，发现每一条突围小路。",
				crop: [
					967,
					638,
					311
				]
			}
		]
	};
	var images = /* @__PURE__ */ new Map();
	var classicRoles = () => globalThis.__CLASSIC_CHASE_ROLES__ === true;
	var settings;
	var stored;
	var side = (role) => [
		"cop",
		"pursuer",
		"chaser"
	].includes(role) ? "cop" : "robber";
	var validAvatar = (value) => typeof value === "string" && value.length <= 12e4 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
	function read() {
		try {
			const value = (globalThis.__chaseRoleStorage || globalThis.localStorage)?.getItem(storageKey) || "{}";
			if (settings && value === stored) return settings;
			stored = value;
			settings = JSON.parse(value);
		} catch {
			settings = {};
		}
		if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
		return settings;
	}
	function getRoleAppearance(role, selectedPreset) {
		const key = side(role), value = read()[key];
		const style = Object.hasOwn(presets, value?.style) ? value.style : "team";
		const [color, accent, badge] = presets[style][key];
		const preset = Number.isInteger(selectedPreset) && selectedPreset >= 0 && selectedPreset < 3 ? selectedPreset : Number.isInteger(value?.preset) && value.preset >= 0 && value.preset < 3 ? value.preset : 0;
		return {
			label: classicRoles() ? key === "cop" ? "警察" : "小偷" : key === "cop" ? "追逐队" : "突围队",
			style,
			color,
			accent,
			badge,
			preset,
			character: characters[key][preset],
			sprite: characterSheet,
			avatar: selectedPreset === void 0 && validAvatar(value?.avatar) ? value.avatar : ""
		};
	}
	function loadPortraitImage(source) {
		if (!source) return null;
		let img = images.get(source);
		if (!img && (globalThis.__chaseRoleImage || typeof Image !== "undefined")) {
			img = globalThis.__chaseRoleImage ? globalThis.__chaseRoleImage() : new Image();
			img.onload = () => {
				img.roleLoaded = true;
			};
			img.src = source;
			images.set(source, img);
		}
		return img;
	}
	if (classicRoles() && typeof Image !== "undefined" && !globalThis.__chaseRoleImage) loadPortraitImage(characterSheet);
	//#endregion
	//#region ../../platforms/competition/street-pages.js
	var roleNames = {
		pursuer: "警察",
		runner: "小偷",
		random: "随机先行"
	};
	var spriteUrl = new URL("./src/assets/characters.png", document.baseURI).href;
	var cityUrl = new URL("./src/assets/home-city.png", document.baseURI).href;
	var icons = {
		back: "<path d=\"m14 5-7 7 7 7\"/>",
		arrow: "<path d=\"m9 5 7 7-7 7\"/>",
		home: "<path d=\"m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10\"/>",
		friends: "<circle cx=\"8\" cy=\"7\" r=\"3\"/><circle cx=\"17\" cy=\"8\" r=\"3\"/><path d=\"M2 21v-3a6 6 0 0 1 12 0v3M16 15a5 5 0 0 1 6 5\"/>",
		trophy: "<path d=\"M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 15v6M8 21h8\"/>",
		link: "<path d=\"m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0\"/>",
		check: "<path d=\"m5 12 4 4L20 5\"/>",
		play: "<path d=\"m8 4 12 8-12 8Z\"/>",
		shield: "<path d=\"m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z\"/><path d=\"m8 12 3 3 5-6\"/>",
		star: "<path d=\"m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z\"/>",
		refresh: "<path d=\"M20 7v5h-5M4 17v-5h5M19 12a7 7 0 0 0-12-5M5 12a7 7 0 0 0 12 5\"/>",
		pen: "<path d=\"m15 3 6 6-11 11-7 1 1-7ZM12 6l6 6\"/>"
	};
	var icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.star}</svg>`;
	function mountStreetCompetition(game, createRenderer) {
		if (document.querySelector("[data-competition-launch]")) return;
		globalThis.__CLASSIC_CHASE_ROLES__ = true;
		globalThis.__installCompetition();
		const client = globalThis.__competition;
		const renderer = createRenderer({
			createImage: () => new Image(),
			assetBase: new URL("./", location.href).href
		});
		const style = document.createElement("style");
		style.textContent = street_default;
		document.head.append(style);
		const launch = document.createElement("button");
		launch.dataset.competitionLaunch = "";
		launch.className = "street-pk-launch";
		launch.textContent = "好友 PK · 全站榜";
		launch.hidden = !!document.querySelector("[data-competition-entry]");
		const surface = document.createElement("div");
		surface.className = "street-competition";
		surface.dataset.streetCompetition = "";
		surface.hidden = true;
		surface.open = false;
		surface.setAttribute("aria-label", "街区追捕 · 好友 PK");
		surface.style.setProperty("--sp-sprites", `url("${spriteUrl}")`);
		surface.style.setProperty("--sp-city", `url("${cityUrl}")`);
		surface.innerHTML = `<div class="sp-shell">
    <header class="sp-header"><button class="sp-back" data-page-back aria-label="返回">${icon("back")}</button><div><h1 data-page-title>好友 PK</h1><p data-page-subtitle>叫上好友，一起追逐！</p></div><button class="sp-help" data-rules aria-label="查看玩法">?</button></header>
    <p class="sp-status" role="status" aria-live="polite" data-status>邀请一位好友，一起玩一局。</p>
    <main class="sp-pages">
      <section class="sp-page" data-page="lobby" data-lobby>
        <div class="sp-vs-hero"><span class="sp-figure" data-figure="pursuer"></span><strong class="sp-vs">VS</strong><span class="sp-figure" data-figure="runner"></span><i class="sp-spark sp-spark-one">✦</i><i class="sp-spark sp-spark-two">✦</i></div>
        <div class="sp-entry-grid"><button class="sp-entry sp-entry-blue" data-go="create">${icon("home")}<strong>创建房间</strong><small>邀请好友一起玩</small><span class="sp-entry-arrow">${icon("arrow")}</span></button><button class="sp-entry sp-entry-coral" data-go="join">${icon("friends")}<strong>加入房间</strong><small>好友正在等你</small><span class="sp-entry-arrow">${icon("arrow")}</span></button></div>
        <div class="sp-profile-card"><span class="sp-portrait" data-avatar></span><div><strong data-profile-name>街区新伙伴</strong><small>用你的昵称和好友见面</small></div><button data-profile aria-label="设置昵称">${icon("pen")}</button></div>
        <button class="sp-wide-link" data-board>${icon("trophy")}<span><strong>全站榜</strong><small>看看谁是街区追捕高手</small></span>${icon("arrow")}</button>
        <p class="sp-note">游客身份保存在当前浏览器，昵称可以重名。</p>
      </section>
      <section class="sp-page" data-page="create" hidden>
        <h2 class="sp-section-heading">选择你的阵营</h2><div class="sp-choice-roles"><button data-match-role="pursuer" aria-pressed="true"><span class="sp-figure" data-figure="pursuer"></span><strong>我是警察</strong><small>协作包围，抓住小偷！</small><i>${icon("check")}</i></button><button data-match-role="runner" aria-pressed="false"><span class="sp-figure" data-figure="runner"></span><strong>我是小偷</strong><small>灵活躲避，坚持到最后！</small><i>${icon("check")}</i></button></div>
        <h2 class="sp-section-heading">选择对战模式</h2><div class="sp-mode-grid" data-match-modes></div>
        <h2 class="sp-section-heading">谁先行动？</h2><div class="sp-segments" data-match-initiative><button data-initiative="pursuer" aria-pressed="false">警察先行</button><button data-initiative="runner" aria-pressed="false">小偷先行</button><button data-initiative="random" aria-pressed="true">随机</button></div>
        <div class="sp-info-pills"><span>${icon("friends")}<strong>2 人 PK</strong><small>各自操控一方</small></span><span>${icon("shield")}<strong>2 秒先行</strong><small>随后同时行动</small></span></div>
        <button class="sp-primary" data-create>${icon("play")}创建房间</button><p class="sp-note">地图从对应模式的 100 关中抽取。</p>
      </section>
      <section class="sp-page" data-page="join" hidden>
        <div class="sp-vs-hero sp-vs-hero-small"><span class="sp-figure" data-figure="pursuer"></span><strong class="sp-vs">VS</strong><span class="sp-figure" data-figure="runner"></span></div>
        <form class="sp-card sp-join-form" data-join-form><label for="street-room-code">输入好友的房间码</label><input id="street-room-code" data-code minlength="12" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="12 位房间码" required><small>让好友把房间码或邀请链接发给你</small><button class="sp-primary" data-join type="submit">加入房间 ${icon("arrow")}</button></form>
      </section>
      <section class="sp-page" data-page="room" data-room hidden>
        <div class="sp-vs-hero sp-room-hero"><span class="sp-figure" data-figure="pursuer"></span><strong class="sp-vs">VS</strong><span class="sp-figure" data-figure="runner"></span></div>
        <div class="sp-room-code-card"><small>房间码 · 分享给好友</small><button data-share aria-label="查看邀请和复制房间码"><strong data-room-code></strong>${icon("link")}</button></div>
        <div class="sp-players" data-players></div>
        <p class="sp-room-hint" data-room-hint></p>
        <div class="sp-room-settings" data-role-options><h2 class="sp-section-heading">我的阵营</h2><div class="sp-segments"><button data-role="pursuer">警察</button><button data-role="runner">小偷</button></div><h2 class="sp-section-heading">谁先行动？</h2><div class="sp-segments" data-room-initiative><button data-room-lead="pursuer">警察先行</button><button data-room-lead="runner">小偷先行</button><button data-room-lead="random">随机</button></div><small data-initiative-note></small></div>
        <button class="sp-invite-link" data-invite>${icon("link")}邀请好友，一起来玩</button><button class="sp-primary" data-ready>准备好了 ${icon("play")}</button><button class="sp-primary" data-rematch hidden>${icon("refresh")}再来一局</button><button class="sp-secondary" data-result hidden>查看对战结果</button><button class="sp-text-button" data-close>离开房间，回到首页</button>
      </section>
      <section class="sp-page sp-play-page" data-page="play" hidden><div class="sp-play-info"><strong data-play-role></strong><span>点击角色，再点道路移动</span></div><canvas data-play aria-label="好友挑战操作区"></canvas><div class="sp-play-actions"><button data-rules>玩法说明</button><button data-invite>邀请信息</button><button data-close>离开对局</button></div></section>
      <section class="sp-page" data-page="board" hidden><div class="sp-board-intro">${icon("trophy")}<h2>街区高手榜</h2><p data-board-summary>正在读取全站成绩…</p></div><div data-board-content></div><button class="sp-secondary" data-refresh-board>${icon("refresh")}刷新榜单</button></section>
      <section class="sp-page" data-page="nickname" hidden><div class="sp-name-hero"><span class="sp-portrait" data-name-avatar></span><i>✦</i><i>✦</i></div><form class="sp-card sp-name-form" data-name-form><label for="street-nickname">你的昵称</label><div class="sp-name-input"><input id="street-nickname" name="name" maxlength="32" autocomplete="off" spellcheck="false" required aria-label="你的昵称">${icon("pen")}</div><small>2–16 个中英文字、数字、空格或 · _ -</small><p class="sp-form-message" role="status" data-name-message></p><button class="sp-primary" type="submit" data-save-name>${icon("check")}保存昵称</button></form><p class="sp-note">成绩会跟随你的账号，修改昵称后仍然保留。</p><div class="sp-player-id"><small>我的玩家 ID</small><code data-player-id></code></div></section>
      <section class="sp-page" data-page="rules" hidden><div class="sp-rules-hero">${icon("shield")}<h2>街区追捕，开局指南</h2><p>选中角色，点击道路，开始追逐！</p></div><div class="sp-card" data-rules-content></div><button class="sp-primary" data-page-return>知道啦，返回 ${icon("arrow")}</button></section>
      <section class="sp-page" data-page="results" hidden><div class="sp-result-hero"><span class="sp-figure" data-figure="pursuer"></span><span class="sp-result-trophy">${icon("trophy")}</span><span class="sp-figure" data-figure="runner"></span><h2 data-result-title>这局打得漂亮！</h2><p>好友对战 · 本局积分已确认</p></div><div class="sp-results" data-results></div><button class="sp-primary" data-result-rematch>${icon("refresh")}再来一局</button><button class="sp-secondary" data-board>${icon("trophy")}查看全站榜</button><button class="sp-text-button" data-close>${icon("home")}回到首页</button></section>
      <section class="sp-page" data-page="invite" hidden><div class="sp-invite-hero">${icon("friends")}<h2>叫上好友，一起追逐！</h2><p>一人当警察，一人当小偷</p></div><div class="sp-card sp-invite-card"><small>你的房间码</small><strong data-invite-code></strong><button class="sp-primary" data-copy-code>${icon("link")}复制房间码</button><small>或把邀请链接发给好友</small><input data-invite-url readonly aria-label="邀请链接"><button class="sp-secondary" data-copy-link>${icon("link")}复制邀请链接</button><p class="sp-form-message" role="status" data-invite-message></p></div><button class="sp-text-button" data-page-return>返回房间 ${icon("arrow")}</button></section>
    </main>
    <nav class="sp-bottom-nav" aria-label="好友对战导航"><button data-home>${icon("home")}首页</button><button data-go="lobby" aria-pressed="true">${icon("friends")}好友 PK</button><button data-board>${icon("trophy")}全站榜</button></nav>
  </div>`;
		document.body.append(launch, surface);
		const select = (query) => surface.querySelector(query);
		const all = (query) => [...surface.querySelectorAll(query)];
		const status = select("[data-status]");
		const canvas = select("canvas");
		const ctx = canvas.getContext("2d");
		let room = null, profile = null, modes = [], metadata = null;
		let poll = null, frame = 0, lastPoll = 0, busy = false, exiting = false, pending = null, resultShown = null;
		let current = "lobby", trail = [], returnFocus = null;
		let viewSource = null, viewState = null, viewTurned = false;
		let sessionGeneration = 0, busyGeneration = 0;
		let historyDepth = 0, historySession = null;
		const preferences = {
			mode: "classic",
			role: "pursuer",
			initiative: "random"
		};
		const pageTitles = {
			lobby: ["好友 PK", "叫上好友，一起来一场街区追逐！"],
			create: ["创建房间", "选好阵营，等好友一起出发"],
			join: ["加入房间", "好友在等你，快来集合！"],
			room: ["等好友就位", "邀请好友，准备好就出发"],
			play: ["好友追逐中", ""],
			board: ["全站榜", "每一局，都离高手更近一点"],
			nickname: ["设置昵称", "取个有趣的名字，让好友认出你"],
			rules: ["这局怎么玩", ""],
			results: ["对战结果", ""],
			invite: ["邀请好友", "把房间码分享给你的伙伴"]
		};
		function node(tag, value, className = "") {
			const element = document.createElement(tag);
			element.textContent = value;
			if (className) element.className = className;
			return element;
		}
		function feedback(value) {
			status.textContent = value instanceof Error ? value.message : String(value);
			status.toggleAttribute("data-error", value instanceof Error);
		}
		const isCurrent = (generation) => surface.open && generation === sessionGeneration;
		const detachedKey = `competition-detached-rooms:${game}`;
		function detachedRooms() {
			try {
				return JSON.parse(localStorage.getItem(detachedKey) || "[]").filter((code) => /^[A-F0-9]{12}$/.test(code));
			} catch {
				return [];
			}
		}
		function rememberDetached(code) {
			try {
				localStorage.setItem(detachedKey, JSON.stringify([.../* @__PURE__ */ new Set([...detachedRooms(), code])]));
			} catch {}
		}
		function forgetDetached(code) {
			try {
				localStorage.setItem(detachedKey, JSON.stringify(detachedRooms().filter((item) => item !== code)));
			} catch {}
		}
		async function leaveDetached(value) {
			if (!value?.code || !["waiting", "playing"].includes(value.status)) return;
			if (surface.open && room?.code === value.code) return;
			rememberDetached(value.code);
			try {
				await client.request(`/rooms/${value.code}/leave`, { body: "{}" });
				forgetDetached(value.code);
			} catch {}
		}
		async function receiveRoom(value, generation) {
			if (!isCurrent(generation)) {
				await leaveDetached(value);
				return;
			}
			accept(value, generation);
		}
		function portrait(role = "pursuer") {
			const element = node("span", "", "sp-portrait");
			decoratePortrait(element, role);
			return element;
		}
		function decoratePortrait(element, role = "pursuer") {
			const appearance = getRoleAppearance(role);
			element.style.removeProperty("background-image");
			element.dataset.portraitRole = role;
			element.dataset.preset = String(Number(appearance.preset) || 0);
			if (appearance.avatar) {
				element.style.backgroundImage = `url("${appearance.avatar}")`;
				element.dataset.custom = "";
			} else element.removeAttribute("data-custom");
		}
		function updateProfile(value) {
			profile = value;
			select("[data-profile-name]").textContent = value.name;
			select("[data-player-id]").textContent = value.playerId;
			decoratePortrait(select("[data-avatar]"));
			decoratePortrait(select("[data-name-avatar]"));
			for (const figure of all("[data-figure]")) figure.style.backgroundPositionX = `${getRoleAppearance(figure.dataset.figure).preset * 50}%`;
		}
		function navigate(page, { remember = true, animate = true, syncHistory = true } = {}) {
			if (!select(`[data-page="${page}"]`)) return;
			const changed = current !== page;
			if (remember && changed) trail.push(current);
			current = page;
			if (surface.open && syncHistory && historySession) {
				if (remember && changed) {
					historyDepth++;
					history.pushState({
						...history.state,
						streetPage: page,
						streetSession: historySession,
						streetDepth: historyDepth
					}, "", location.href);
				} else history.replaceState({
					...history.state,
					streetPage: page,
					streetSession: historySession,
					streetDepth: historyDepth
				}, "", location.href);
			}
			for (const section of all("[data-page]")) section.hidden = section.dataset.page !== page;
			surface.dataset.page = page;
			surface.toggleAttribute("data-playing", page === "play");
			select("[data-page-title]").textContent = page === "room" && room?.players.length === 2 ? "好友已就位" : pageTitles[page][0];
			select("[data-page-subtitle]").textContent = pageTitles[page][1];
			select(".sp-bottom-nav").hidden = !["lobby", "board"].includes(page);
			for (const button of all(".sp-bottom-nav button")) button.setAttribute("aria-pressed", String(page === "board" ? button.hasAttribute("data-board") : button.dataset.go === "lobby"));
			const target = select(`[data-page="${page}"]`);
			target.scrollTop = 0;
			if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) target.animate([{
				opacity: 0,
				transform: "translateX(26px)"
			}, {
				opacity: 1,
				transform: "translateX(0)"
			}], {
				duration: 230,
				easing: "cubic-bezier(.2,.7,.2,1)"
			});
		}
		function back() {
			if (["room", "play"].includes(current)) {
				close();
				return;
			}
			if (historyDepth > 0) history.back();
			else if (trail.length) navigate(trail.pop(), { remember: false });
			else close();
		}
		async function run(task) {
			const generation = sessionGeneration;
			if (busy && busyGeneration === generation || exiting || !surface.open) return;
			busy = true;
			busyGeneration = generation;
			surface.setAttribute("aria-busy", "true");
			try {
				await task(generation);
			} catch (error) {
				if (isCurrent(generation)) {
					if (error.code && error.code !== "SERVICE_UNAVAILABLE") pending = null;
					feedback(error);
				}
			} finally {
				if (busyGeneration === generation) {
					busy = false;
					surface.removeAttribute("aria-busy");
				}
			}
		}
		function renderModes() {
			const target = select("[data-match-modes]");
			target.replaceChildren();
			if (!modes.length) {
				target.append(node("p", "对战服务暂未连接，请返回后重试。", "sp-empty"));
				select("[data-create]").disabled = true;
				return;
			}
			select("[data-create]").disabled = false;
			if (!modes.some((mode) => mode.id === preferences.mode)) preferences.mode = modes[0].id;
			for (const mode of modes) {
				const button = node("button", "", "sp-mode-card");
				button.dataset.matchMode = mode.id;
				button.setAttribute("aria-pressed", String(mode.id === preferences.mode));
				const symbol = node("span", mode.id === "escape" ? "↗" : "★", "sp-mode-symbol");
				button.append(symbol, node("strong", mode.id === "classic" ? "经典围捕" : mode.id === "escape" ? "出口竞速" : mode.title), node("small", mode.id === "escape" ? "抢先到达出口，突破包围" : "合作追捕，守住整条街区"));
				button.onclick = () => {
					preferences.mode = mode.id;
					for (const item of target.children) item.setAttribute("aria-pressed", String(item === button));
				};
				target.append(button);
			}
		}
		function renderPlayers() {
			const target = select("[data-players]");
			target.replaceChildren();
			for (let seat = 0; seat < 2; seat++) {
				const player = room.players[seat];
				const card = node("div", "", "sp-player");
				if (player) {
					card.dataset.role = player.role || (seat === 0 ? "pursuer" : "runner");
					card.toggleAttribute("data-ready", !!player.ready);
					const copy = node("div", "", "sp-player-copy");
					copy.append(node("strong", playerName(player, room.players) + (seat === room.you ? " · 你" : "")), node("small", `${roleNames[player.role] || "好友"} · ${room.status === "waiting" ? player.ready ? "已准备 ✓" : "等待准备" : room.status === "finished" ? "对局结束" : "对局中断"}`));
					card.append(portrait(player.role), copy);
				} else {
					card.dataset.empty = "";
					card.append(node("span", "＋", "sp-wait-avatar"), node("div", "等一位好友\n分享邀请给 TA", "sp-player-copy"));
				}
				target.append(card);
			}
		}
		function accept(value, generation = sessionGeneration) {
			if (!isCurrent(generation)) return;
			const oldStatus = room?.status;
			if (room?.code !== value.code) pending = null;
			room = value;
			const playing = room.status === "playing";
			const ended = [
				"finished",
				"abandoned",
				"expired"
			].includes(room.status);
			select("[data-room-code]").textContent = room.code;
			select("[data-room-hint]").textContent = ended ? room.status === "finished" ? "本局已结束，再来一局继续较量！" : "这局暂告一段落，可以重新邀请好友。" : `${modes.find((mode) => mode.id === room.mode)?.title || "好友对战"} · 双方准备后自动开始`;
			select("[data-role-options]").hidden = room.status !== "waiting" || !room.roles;
			select("[data-initiative-note]").textContent = room.you === 0 ? "由你设置先行阵营，修改后双方重新准备。" : "由房主设置先行阵营，先行方有 2 秒行动时间。";
			for (const button of all("[data-room-lead]")) {
				button.setAttribute("aria-pressed", String(button.dataset.roomLead === (room.initiative || "random")));
				button.disabled = room.you !== 0;
			}
			for (const button of all("button[data-role]")) {
				const selected = button.dataset.role === room.players[room.you]?.role;
				button.setAttribute("aria-pressed", String(selected));
				button.disabled = selected;
			}
			select("[data-ready]").hidden = room.status !== "waiting";
			select("[data-ready]").disabled = !!room.players[room.you]?.ready;
			select("[data-ready]").textContent = room.players[room.you]?.ready ? "已准备，等好友 ✓" : "准备好了！ ▸";
			select("[data-rematch]").hidden = !ended;
			select("[data-result]").hidden = room.status !== "finished";
			select("[data-invite]").hidden = ended;
			select("[data-play-role]").textContent = `你是${roleNames[room.players[room.you]?.role] || "街区伙伴"}`;
			renderPlayers();
			feedback({
				waiting: room.players.length === 2 ? "好友已就位，双方准备就能开始" : "房间已创建，邀请好友来集合",
				playing: "追逐进行中",
				finished: "对战结束，本局积分已确认",
				abandoned: "玩家已退出，可以再来一局",
				expired: "房间已过期，可以重新邀请好友"
			}[room.status] + (playing ? ` · 剩余 ${Math.max(0, Math.ceil((room.deadline - room.serverNow) / 1e3))} 秒` : ""));
			if (playing && (oldStatus !== "playing" || [
				"lobby",
				"create",
				"join",
				"room",
				"results"
			].includes(current))) {
				trail = [];
				navigate("play", { remember: false });
			} else if (!playing && [
				"lobby",
				"create",
				"join",
				"play"
			].includes(current)) {
				trail = [];
				navigate("room", { remember: false });
			}
			if (room.status === "finished" && resultShown !== room.code) {
				resultShown = room.code;
				showResults();
			}
			try {
				localStorage.setItem(`competition-room:${game}`, room.code);
			} catch {}
		}
		async function refresh() {
			const generation = sessionGeneration;
			if (!room || busy && busyGeneration === generation || exiting || !surface.open || Date.now() - lastPoll < (room.pollMs || 1200)) return;
			lastPoll = Date.now();
			try {
				accept(await client.request(`/rooms/${room.code}`), generation);
			} catch (error) {
				if (isCurrent(generation)) feedback(error);
			}
		}
		function showResults() {
			if (!room) return;
			const target = select("[data-results]");
			target.replaceChildren();
			const me = room.players[room.you];
			const ownResult = room.results?.find((entry) => entry.playerId === me.id);
			const opponent = room.results?.find((entry) => entry.playerId !== me.id);
			select("[data-result-title]").textContent = ownResult?.result.eligible && ownResult.result.score > (opponent?.result.score ?? ownResult.result.score) ? "这局赢得漂亮！" : ownResult?.result.eligible && ownResult.result.score < (opponent?.result.score ?? ownResult.result.score) ? "差一点，再来一局！" : "这局打得漂亮！";
			for (const entry of room.results || []) {
				const player = room.players.find((item) => item.id === entry.playerId) || { playerId: entry.playerId };
				const card = node("section", "", "sp-result-card");
				const head = node("div", "", "sp-result-player");
				head.append(portrait(player.role), node("h3", `${entry.playerId === me.id ? "你 · " : ""}${playerName(player, room.players)}`));
				const record = entry.after.me;
				card.append(head, node("strong", entry.result.eligible ? `${scoreText(game, entry.result.score, entry.result.secondary)} · 本局` : "本局无有效成绩", "sp-result-score"), node("p", record ? `总积分 ${scoreText(game, record.score, record.secondary)} · 全站第 ${record.rank} 名` : "完成有效对战，就能登上全站榜"), node("small", gapText(game, entry.after)));
				if (entry.reason) card.append(node("p", entry.reason));
				target.append(card);
			}
			navigate("results");
		}
		async function showBoard(generation = sessionGeneration, { remember = true } = {}) {
			navigate("board", { remember });
			select("[data-board-summary]").textContent = "正在读取全站成绩…";
			const board = await client.request(`/boards/${game}`);
			if (!isCurrent(generation)) return;
			select("[data-board-summary]").textContent = `${board.eligiblePlayers} 位玩家 · 好友对战累计积分`;
			const target = select("[data-board-content]");
			target.replaceChildren();
			if (board.top.length) {
				const podium = node("div", "", "sp-podium");
				for (const index of [
					1,
					0,
					2
				]) {
					const row = board.top[index];
					if (!row) continue;
					const card = node("div", "", "sp-podium-place");
					card.dataset.rank = String(row.rank);
					card.append(portrait(index === 1 ? "runner" : "pursuer"), node("span", String(row.rank), "sp-podium-number"), node("strong", playerName(row, board.top)), node("small", scoreText(game, row.score, row.secondary)));
					podium.append(card);
				}
				target.append(podium);
			}
			const list = node("ol", "", "sp-rank-list");
			for (const row of board.top.slice(3)) {
				const item = node("li", "", "sp-rank-row");
				item.toggleAttribute("data-self", row.playerId === board.me?.playerId);
				item.append(node("span", String(row.rank), "sp-rank-number"), portrait(row.rank % 2 ? "runner" : "pursuer"), node("strong", playerName(row, board.top)), node("span", scoreText(game, row.score, row.secondary)));
				list.append(item);
			}
			if (!board.top.length) list.append(node("li", "全站榜还空着，邀请好友完成一局，留下你的名字！", "sp-empty"));
			const own = node("section", "", "sp-my-record");
			const ownCopy = node("div", "", "sp-my-record-copy");
			ownCopy.append(node("strong", `${profile?.name || "我"} · ${board.me ? "第 " + board.me.rank + " 名" : "尚未上榜"}`), node("span", board.me ? scoreText(game, board.me.score, board.me.secondary) : "等你完成第一局"), node("small", gapText(game, board)));
			own.append(portrait(), ownCopy);
			target.append(list, own, node("p", "好友对战累计积分，练习成绩不计入全站榜。", "sp-note"));
		}
		async function showProfile(generation = sessionGeneration) {
			navigate("nickname");
			select("[data-save-name]").disabled = false;
			if (!profile) {
				const value = await client.request("/me");
				if (!isCurrent(generation)) return;
				updateProfile(value);
			}
			select("[name=\"name\"]").value = profile.name;
			select("[data-name-message]").textContent = "";
		}
		async function showRules(generation = sessionGeneration) {
			navigate("rules");
			const target = select("[data-rules-content]");
			target.replaceChildren(node("p", "正在读取玩法说明…"));
			const rules = room?.state?.rules || metadata?.description || (await client.request(`/boards/${game}`)).description || "双方准备后开始，点击角色，再点击道路移动。";
			if (!isCurrent(generation)) return;
			const list = node("ol", "", "sp-rule-list");
			for (const part of rules.split(/[；。]+/).map((part) => part.trim()).filter(Boolean)) list.append(node("li", `${part}。`));
			target.replaceChildren(list, node("p", room?.status === "playing" ? "查看说明时对局仍在计时，返回即可继续行动。" : "警察和小偷独立操作，比赛积分由服务端确认。", "sp-note"));
		}
		function showInvite() {
			if (!room) return;
			const url = new URL(location.href);
			url.searchParams.set("pk", room.code);
			select("[data-invite-code]").textContent = room.code;
			select("[data-invite-url]").value = url.href;
			select("[data-invite-message]").textContent = "";
			navigate("invite");
		}
		async function copyInvite(link, generation = sessionGeneration) {
			const value = link ? select("[data-invite-url]").value : room.code;
			try {
				await navigator.clipboard.writeText(value);
				if (!isCurrent(generation)) return;
				select("[data-invite-message]").textContent = link ? "邀请链接已复制，发给好友吧！" : "房间码已复制，发给好友吧！";
			} catch {
				if (!isCurrent(generation)) return;
				select("[data-invite-message]").textContent = "可以长按选择上方内容，再复制给好友。";
			}
		}
		function renderedView(state, width, height) {
			const nodes = state?.map?.nodes || [];
			const extentX = nodes.length ? Math.max(...nodes.map((point) => point.x)) - Math.min(...nodes.map((point) => point.x)) : 0;
			const extentY = nodes.length ? Math.max(...nodes.map((point) => point.y)) - Math.min(...nodes.map((point) => point.y)) : 0;
			const turned = width < height && extentX > extentY;
			if (viewSource === state && viewTurned === turned) return {
				state: viewState,
				turned
			};
			viewSource = state;
			viewTurned = turned;
			if (!turned) viewState = state;
			else {
				const point = (value) => value ? {
					...value,
					x: -value.y,
					y: value.x
				} : value;
				const actor = (value) => ({
					...point(value),
					...value.routePoints ? { routePoints: value.routePoints.map(point) } : {},
					...value.destination ? { destination: point(value.destination) } : {},
					...value.gap ? { gap: {
						...value.gap,
						from: point(value.gap.from),
						to: point(value.gap.to)
					} } : {}
				});
				viewState = {
					...state,
					map: {
						...state.map,
						nodes: nodes.map(point)
					},
					cops: state.cops.map(actor),
					robbers: state.robbers.map(actor),
					exits: state.exits.map(point)
				};
			}
			surface.dataset.mapProjection = turned ? "quarter-turn" : "normal";
			return {
				state: viewState,
				turned
			};
		}
		function draw() {
			if (!surface.open) return;
			if (current === "play" && room?.state) {
				const width = canvas.clientWidth, height = canvas.clientHeight;
				const ratio = Math.min(devicePixelRatio || 1, 2);
				if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
					canvas.width = Math.floor(width * ratio);
					canvas.height = Math.floor(height * ratio);
				}
				ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
				ctx.clearRect(0, 0, width, height);
				renderer.draw(ctx, width, height, renderedView(room.state, width, height).state);
			}
			frame = requestAnimationFrame(draw);
		}
		async function open(entry) {
			if (exiting) return;
			let generation = sessionGeneration;
			const opening = !surface.open;
			if (!surface.open) {
				sessionGeneration++;
				generation = sessionGeneration;
				returnFocus = document.activeElement;
				window.dispatchEvent(new CustomEvent("competition-visibility", { detail: { open: true } }));
				surface.open = true;
				surface.setAttribute("open", "");
				surface.hidden = false;
				historySession = `street-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
				historyDepth = 1;
				history.pushState({
					...history.state,
					streetPage: "lobby",
					streetSession: historySession,
					streetDepth: historyDepth
				}, "", location.href);
				trail = [];
				navigate("lobby", { remember: false });
				draw();
				poll = setInterval(refresh, 250);
				await run(async (generation) => {
					const me = await client.request("/me");
					if (!isCurrent(generation)) return;
					updateProfile(me);
					const board = await client.request(`/boards/${game}`);
					if (!isCurrent(generation)) return;
					metadata = board;
					modes = metadata.modes || [];
					renderModes();
					for (const code of detachedRooms()) {
						if (!isCurrent(generation)) return;
						await leaveDetached({
							code,
							status: "waiting"
						});
					}
					if (!isCurrent(generation)) return;
					const invite = new URL(location.href).searchParams.get("pk");
					let saved;
					try {
						saved = localStorage.getItem(`competition-room:${game}`);
					} catch {}
					if (invite && /^[A-F0-9]{12}$/.test(invite)) {
						select("[data-code]").value = invite;
						navigate("join");
						feedback("邀请已就位，点击加入房间吧！");
					} else if (saved) accept(await client.request(`/rooms/${saved}`), generation);
				});
			}
			if (entry === "board" && isCurrent(generation)) await run((generation) => showBoard(generation, { remember: !opening }));
		}
		async function close({ restoreHistory = true } = {}) {
			if (exiting || !surface.open) return;
			exiting = true;
			launch.disabled = true;
			surface.open = false;
			sessionGeneration++;
			surface.hidden = true;
			surface.removeAttribute("open");
			const depth = historyDepth;
			historyDepth = 0;
			historySession = null;
			clearInterval(poll);
			cancelAnimationFrame(frame);
			if (restoreHistory && depth > 0) await new Promise((resolve) => {
				const done = () => {
					clearTimeout(timeout);
					window.removeEventListener("popstate", done);
					resolve();
				};
				const timeout = setTimeout(done, 500);
				window.addEventListener("popstate", done, { once: true });
				history.go(-depth);
			});
			window.dispatchEvent(new CustomEvent("competition-visibility", { detail: { open: false } }));
			if (returnFocus?.isConnected && !returnFocus.closest("[hidden]")) returnFocus.focus();
			try {
				if (room && ["waiting", "playing"].includes(room.status)) await client.request(`/rooms/${room.code}/leave`, { body: "{}" });
				room = null;
				pending = null;
				resultShown = null;
				try {
					localStorage.removeItem(`competition-room:${game}`);
				} catch {}
				feedback("邀请一位好友，一起玩一局。");
			} catch {
				launch.title = "退出尚未得到确认，重新进入可以恢复房间。";
			} finally {
				exiting = false;
				launch.disabled = false;
			}
		}
		async function rematch(generation = sessionGeneration) {
			const result = await client.request(`/rooms/${room.code}/rematch`, { body: "{}" });
			if (!isCurrent(generation)) {
				await leaveDetached({
					code: result.rematch,
					status: "waiting"
				});
				return;
			}
			resultShown = null;
			trail = [];
			navigate("room", { remember: false });
			await receiveRoom(await client.request("/rooms/join", { body: JSON.stringify({ code: result.rematch }) }), generation);
		}
		launch.onclick = () => void open();
		globalThis.__openStreetCompetition = open;
		globalThis.__openCompetition = open;
		window.addEventListener("competition-navigation", (event) => void open(event.detail?.page || event.detail?.entry));
		all("[data-go]").forEach((button) => {
			button.onclick = () => navigate(button.dataset.go);
		});
		all("[data-home], [data-close]").forEach((button) => {
			button.onclick = () => void close();
		});
		select("[data-page-back]").onclick = back;
		all("[data-page-return]").forEach((button) => {
			button.onclick = back;
		});
		all("[data-board]").forEach((button) => {
			button.onclick = () => void run(showBoard);
		});
		select("[data-refresh-board]").onclick = () => void run(showBoard);
		select("[data-profile]").onclick = () => void run(showProfile);
		all("[data-rules]").forEach((button) => {
			button.onclick = () => void run(showRules);
		});
		all("[data-invite], [data-share]").forEach((button) => {
			button.onclick = showInvite;
		});
		select("[data-copy-code]").onclick = () => void run((generation) => copyInvite(false, generation));
		select("[data-copy-link]").onclick = () => void run((generation) => copyInvite(true, generation));
		all("[data-match-role]").forEach((button) => {
			button.onclick = () => {
				preferences.role = button.dataset.matchRole;
				all("[data-match-role]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
			};
		});
		all("[data-initiative]").forEach((button) => {
			button.onclick = () => {
				preferences.initiative = button.dataset.initiative;
				all("[data-initiative]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
			};
		});
		select("[data-create]").onclick = () => void run(async (generation) => {
			await receiveRoom(await client.request("/rooms", { body: JSON.stringify({
				game,
				...preferences
			}) }), generation);
		});
		select("[data-join-form]").onsubmit = (event) => {
			event.preventDefault();
			run(async (generation) => {
				await receiveRoom(await client.request("/rooms/join", { body: JSON.stringify({
					code: select("[data-code]").value.trim().toUpperCase(),
					game
				}) }), generation);
			});
		};
		select("[data-code]").addEventListener("input", (event) => {
			event.target.value = event.target.value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
		});
		all("button[data-role]").forEach((button) => {
			button.onclick = () => void run(async (generation) => accept(await client.request(`/rooms/${room.code}/role`, { body: JSON.stringify({ role: button.dataset.role }) }), generation));
		});
		all("[data-room-lead]").forEach((button) => {
			button.onclick = () => void run(async (generation) => accept(await client.request(`/rooms/${room.code}/initiative`, { body: JSON.stringify({ initiative: button.dataset.roomLead }) }), generation));
		});
		select("[data-ready]").onclick = () => void run(async (generation) => accept(await client.request(`/rooms/${room.code}/ready`, { body: "{}" }), generation));
		select("[data-rematch]").onclick = () => void run(rematch);
		select("[data-result-rematch]").onclick = () => void run(rematch);
		select("[data-result]").onclick = showResults;
		select("[data-name-form]").onsubmit = (event) => {
			event.preventDefault();
			run(async (generation) => {
				const save = select("[data-save-name]");
				save.disabled = true;
				select("[data-name-message]").textContent = "正在保存昵称…";
				try {
					const value = await client.request("/me", { body: JSON.stringify({ name: select("[name=\"name\"]").value }) });
					if (!isCurrent(generation)) return;
					updateProfile(value);
					if (room) accept(await client.request(`/rooms/${room.code}`), generation);
					if (!isCurrent(generation)) return;
					back();
					feedback("昵称保存好啦，好友会看到你的新名字！");
				} catch (error) {
					if (isCurrent(generation)) select("[data-name-message]").textContent = error.message;
				} finally {
					if (isCurrent(generation)) save.disabled = false;
				}
			});
		};
		canvas.addEventListener("pointerup", (event) => {
			if (!room || room.status !== "playing" || current !== "play") return;
			const rect = canvas.getBoundingClientRect();
			const view = renderedView(room.state, canvas.clientWidth, canvas.clientHeight);
			const tapped = renderer.tap(event.clientX - rect.left, event.clientY - rect.top, view.state);
			const command = view.turned && tapped?.type === "move" ? {
				...tapped,
				x: tapped.y,
				y: -tapped.x
			} : tapped;
			if (!command) return;
			run(async (generation) => {
				pending ??= {
					seq: room.seq + 1,
					action: command
				};
				const next = await client.request(`/rooms/${room.code}/actions`, { body: JSON.stringify(pending) });
				if (!isCurrent(generation)) return;
				pending = null;
				accept(next, generation);
			});
		});
		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && surface.open) {
				event.preventDefault();
				back();
			}
		});
		window.addEventListener("popstate", (event) => {
			if (!surface.open) return;
			if (event.state?.streetSession !== historySession) {
				close({ restoreHistory: false });
				return;
			}
			historyDepth = event.state.streetDepth || 1;
			trail.length = Math.max(0, historyDepth - 1);
			let page = event.state.streetPage || "lobby";
			if (room && ["room", "play"].includes(current) && page === "lobby") {
				close();
				return;
			}
			if (room?.status === "playing" && page === "room") page = "play";
			else if (room && room.status !== "playing" && page === "play") page = "room";
			navigate(page, {
				remember: false,
				syncHistory: false
			});
		});
		document.addEventListener("chase-appearancechange", () => {
			if (profile) updateProfile(profile);
			if (room && surface.open) renderPlayers();
		});
		if (new URL(location.href).searchParams.has("pk")) open();
	}
	//#endregion
	//#region ../../platforms/competition/h5.js
	var titles = {
		"cops-robbers": "围捕小队",
		"cops-robbers-realtime": "街区追捕",
		"letters-words2": "词屿 · 字母叠叠乐",
		"vibeJam-myself-history-guess": "此时·此地",
		"xiangqi-five": "象五子棋"
	};
	var lettersCompetitionStyles = `
[data-letters-competition].competition-dialog {
  --pk-ink:#244e48; --pk-muted:#77877b; --pk-line:#d5dfc7; --pk-accent:#f28d58;
  width:min(430px,100vw); height:100dvh; max-height:none; margin:0 auto;
  border:0; border-radius:0; background:#f6f3e9; box-shadow:none;
  font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;
}
[data-letters-competition]::backdrop { background:#f6f3e9; backdrop-filter:none; }
[data-letters-competition] .pk-shell { padding:max(24px,env(safe-area-inset-top)) 24px max(20px,env(safe-area-inset-bottom)); }
[data-letters-competition] .pk-header { min-height:44px; padding:0; border:0; gap:0; }
[data-letters-competition] .pk-brand { justify-content:center; }
[data-letters-competition] .pk-brand strong { font-size:15px; font-weight:750; letter-spacing:1px; }
[data-letters-competition] .pk-brand-mark,
[data-letters-competition] .pk-brand small,
[data-letters-competition] .pk-profile-copy small,
[data-letters-competition] .pk-profile > .pk-avatar,
[data-letters-competition] .pk-room-note,
[data-letters-competition] .pk-footer > p,
[data-letters-competition] .pk-hero .pk-eyebrow { display:none; }
[data-letters-competition] .pk-tools { width:44px; }
[data-letters-competition] .pk-tools button { width:44px; min-width:44px; padding:0; font-size:12px; }
[data-letters-competition] button { min-height:52px; border:1px solid #c5d1be; border-radius:17px; background:#e4ecd8; font-size:15px; font-weight:750; box-shadow:0 3px #becbb6; }
[data-letters-competition] button:hover { background:#e4ecd8; }
[data-letters-competition] button:active { transform:translateY(3px); box-shadow:none; }
[data-letters-competition] button.pk-primary { min-height:58px; border:0; background:#f28d58; color:#244e48; font-size:18px; box-shadow:0 5px #cd7043; }
[data-letters-competition] button.pk-primary:hover { background:#f28d58; }
[data-letters-competition] button.pk-quiet,
[data-letters-competition] button.pk-back { min-height:44px; border:0; border-radius:14px; background:transparent; box-shadow:none; color:#244e48; }
[data-letters-competition] button.pk-back { width:44px; min-width:44px; padding:0; font-size:28px; }
[data-letters-competition] .pk-status { display:none; }
[data-letters-competition] .pk-status[data-error] { display:block; min-height:24px; margin:6px 0!important; color:#a65d3b!important; }
[data-letters-competition] .pk-status[data-feedback]:not([data-error]) { display:block; min-height:24px; margin:6px 0!important; }
[data-letters-competition] .pk-content { padding-bottom:5px; }
[data-letters-competition] .pk-hero { padding:22px 0 17px; }
[data-letters-competition] .pk-hero h2 { font-size:28px; font-weight:800; letter-spacing:0; line-height:1.4; }
[data-letters-competition] .pk-hero p { margin-top:8px; font-size:13px; line-height:1.7; }
[data-letters-competition] .pk-letter-hero { min-height:150px; border-radius:24px; background:#e8eddc; position:relative; overflow:hidden; margin:0 0 22px; padding:24px; display:flex; align-items:center; }
[data-letters-competition] .pk-letter-hero strong { position:relative; z-index:1; font-size:22px; line-height:1.6; }
[data-letters-competition] .pk-letter-hero img { position:absolute; width:220px; right:-42px; bottom:-2px; }
[data-letters-competition] .pk-options { grid-template-columns:1fr; gap:17px; }
[data-letters-competition] .pk-option { padding:21px; border:1px solid #e2e3d5; border-radius:22px; background:#fffdf7; }
[data-letters-competition] .pk-option h3 { font-size:18px; margin:0 0 8px; font-weight:800; }
[data-letters-competition] .pk-option p { min-height:0; margin:0 0 20px; font-size:12px; line-height:1.6; }
[data-letters-competition] .pk-join { display:grid; gap:14px; }
[data-letters-competition] .pk-join label { font-size:0; }
[data-letters-competition] input { min-height:53px; border:1px solid #d6dfcc; border-radius:15px; background:#fffdf7; color:#244e48; padding:0 15px; }
[data-letters-competition] .pk-join input { margin:0; font:14px system-ui,sans-serif; letter-spacing:1px; }
[data-letters-competition] .pk-footer { flex:none; padding:6px 0 0; margin-top:6px; gap:10px; flex-direction:row; }
[data-letters-competition] .pk-footer > button { width:auto; min-height:44px; border:0; background:transparent; box-shadow:none; color:#77877b; font-size:12px; padding:0 4px; }
[data-letters-competition] .pk-profile { width:auto; flex:1; min-width:0; padding:0; margin:0; border-radius:0; background:transparent; gap:4px; min-height:44px; }
[data-letters-competition] .pk-profile-copy strong { font-size:12px; color:#77877b; }
[data-letters-competition] .pk-profile button { padding:0 6px; font-size:12px; color:#77877b; }
[data-letters-competition] .pk-room-intro { padding:24px 0 14px; }
[data-letters-competition] .pk-room-intro h2 { font-size:27px; font-weight:800; }
[data-letters-competition] .pk-room-intro .pk-eyebrow { display:none; }
[data-letters-competition] .pk-room-code { margin:20px 0 12px; padding:14px 5px; border:1px dashed #bdcbae; border-radius:16px; background:#e8eddc; color:#244e48; font-size:19px; letter-spacing:2px; }
[data-letters-competition] .pk-room-intro p { font-size:13px; line-height:1.7; }
[data-letters-competition] .pk-matchup { grid-template-columns:1fr 28px 1fr; gap:5px; margin:18px 0 26px; }
[data-letters-competition] .pk-player { border:1px solid #d5dfc7; border-radius:22px; background:#fffdf7; padding:22px 7px; }
[data-letters-competition] .pk-player[data-ready] { background:#e8efd9; }
[data-letters-competition] .pk-player[data-empty] { border-style:dashed; background:transparent; }
[data-letters-competition] .pk-avatar { background:#cde4c4; color:#315c4d; border-radius:16px; box-shadow:0 3px #acc49c; }
[data-letters-competition] .pk-room-actions { flex-direction:column; gap:15px; }
[data-letters-competition] .pk-room-actions > button { min-width:0; width:100%; }
[data-letters-competition][data-playing] .pk-shell { padding:max(8px,env(safe-area-inset-top)) 0 max(6px,env(safe-area-inset-bottom)); }
[data-letters-competition][data-playing] .pk-header { margin:0 12px; padding:0; }
[data-letters-competition][data-playing] .pk-brand strong { font-size:13px; }
[data-letters-competition] canvas[data-play] { border-radius:0; background:#f6f3e9; }
[data-letters-competition]:has([data-details]:not([hidden])) .pk-shell { display:none; }
[data-letters-competition] .pk-detail-page { position:absolute; inset:0; display:block; height:100%; padding:max(24px,env(safe-area-inset-top)) 24px max(20px,env(safe-area-inset-bottom)); background:#f6f3e9; backdrop-filter:none; }
[data-letters-competition] .pk-sheet { max-width:none; height:100%; max-height:none; border:0; border-radius:0; background:transparent; box-shadow:none; padding:0; display:flex; flex-direction:column; overflow:hidden; }
[data-letters-competition] .pk-sheet-head { flex:none; margin:0 0 24px; min-height:44px; }
[data-letters-competition] .pk-sheet-head h2 { font-size:26px; font-weight:800; }
[data-letters-competition] .pk-sheet-head small { font-size:12px; }
[data-letters-competition] .pk-sheet-content { flex:1; overflow:auto; min-height:0; padding:0 0 5px; }
[data-letters-competition] .pk-sheet-actions { flex:none; padding-top:14px; margin-top:0; }
[data-letters-competition] .pk-sheet-actions button { width:100%; }
[data-letters-competition] .pk-result { border:1px solid #d5dfc7; border-radius:22px; background:#e8efd9; padding:20px; }
[data-letters-competition] .pk-result strong { font-size:23px; }
[data-letters-competition] .pk-result-actions { flex-direction:column; gap:15px; }
[data-letters-competition] .pk-my-record { background:#244e48; border-radius:22px; }
[data-letters-competition] .pk-rule-list li { padding:16px; margin-top:12px; border:1px solid #e2e3d5; border-radius:18px; background:#fffdf7; line-height:1.7; }
@media (max-height:650px) { [data-letters-competition] .pk-letter-hero { min-height:106px; margin-bottom:16px; padding:18px; } [data-letters-competition] .pk-letter-hero strong { font-size:19px; } [data-letters-competition] .pk-hero { padding-top:14px; } }
@media (orientation:landscape) and (max-height:500px) { [data-letters-competition].competition-dialog { width:100vw; } [data-letters-competition] .pk-shell { padding:8px 18px; } [data-letters-competition] .pk-letter-hero { display:none; } [data-letters-competition] .pk-options { grid-template-columns:1fr 1fr; } [data-letters-competition] .pk-footer { flex-direction:row; gap:18px; } [data-letters-competition] .pk-footer > button { width:auto; } [data-letters-competition] .pk-profile { width:auto; flex:1; } [data-letters-competition] .pk-hero { padding:5px 0 12px; } [data-letters-competition] .pk-room-actions { flex-direction:row; } }
`;
	var xiangqiCompetitionStyles = `
body.competition-active { background:#fff8e8; overflow:hidden; }
body.competition-active [data-screen], body.competition-active > .page, body.competition-active > .app-shell { display:none!important; }
body.competition-active #mode-online { position:static; }
[data-xiangqi-competition][hidden] { display:none!important; }
[data-xiangqi-competition].competition-dialog {
  --pk-ink:#573626; --pk-muted:#94785d; --pk-line:#ddc8a9; --pk-accent:#ef795f;
  position:relative; inset:auto; width:100%; max-width:600px; height:100dvh;
  margin:0 auto; border:0; border-radius:0; background:#fff8e8; box-shadow:none;
  font-family:'PingFang SC','Microsoft YaHei',sans-serif;
}
[data-xiangqi-competition] .pk-shell { padding: max(14px,env(safe-area-inset-top)) 18px max(14px,env(safe-area-inset-bottom)); }
[data-xiangqi-competition] .pk-header { border:0; padding-bottom:8px; }
[data-xiangqi-competition] .pk-back { padding:0; width:44px; min-width:44px; border:0; background:transparent; font-size:28px; }
[data-xiangqi-competition] .pk-brand { justify-content:center; }
[data-xiangqi-competition] .pk-brand strong { font-size:23px; font-weight:900; }
[data-xiangqi-competition] .pk-brand-mark,
[data-xiangqi-competition] .pk-brand small,
[data-xiangqi-competition] .pk-profile-copy small,
[data-xiangqi-competition] .pk-room-note,
[data-xiangqi-competition] .pk-footer p,
[data-xiangqi-competition] .pk-hero .pk-eyebrow,
[data-xiangqi-competition] .pk-hero p { display:none; }
[data-xiangqi-competition] .pk-status { font-size:12px; justify-content:center; min-height:20px; margin:3px 0 12px!important; }
[data-xiangqi-competition] .pk-hero { padding:10px 0 18px; background:none; border:0; }
[data-xiangqi-competition] .pk-hero h2 { font-size:27px; font-weight:900; }
[data-xiangqi-competition] .pk-profile { padding:12px 14px; border:2px solid #d6c29e; border-radius:20px; background:#edf3dc; margin-bottom:18px; }
[data-xiangqi-competition] .pk-avatar { background:#b8d0a9; color:#365f45; border:2px solid #668360; box-shadow:0 3px 0 #7fa578; }
[data-xiangqi-competition] .pk-options { grid-template-columns:1fr; gap:16px; }
[data-xiangqi-competition] .pk-option { padding:18px; border:2px solid #d6b38c; border-radius:24px; background:#fff0da; box-shadow:0 4px 0 #ead5b8; }
[data-xiangqi-competition] .pk-option h3 { font-size:20px; font-weight:900; }
[data-xiangqi-competition] .pk-option p { margin:5px 0 14px!important; font-size:13px; }
[data-xiangqi-competition] button { border:2px solid #ba9b77; border-radius:16px; background:#fff5df; min-height:48px; font-size:15px; font-weight:800; box-shadow:0 3px 0 #dfc7a9; }
[data-xiangqi-competition] button:active { transform:translateY(2px); }
[data-xiangqi-competition] button.pk-primary { border-color:#b25843; background:#ef795f; color:#fffaf0; box-shadow:0 4px 0 #be5c42; }
[data-xiangqi-competition] button.pk-quiet { border-color:transparent; background:transparent; box-shadow:none; padding:8px; min-height:44px; }
[data-xiangqi-competition] input { min-width:0; border:2px solid #d6b38c; border-radius:14px; background:#fffcf2; color:#573626; min-height:48px; }
[data-xiangqi-competition] .pk-join { gap:10px; }
[data-xiangqi-competition] .pk-footer { border:0; padding-top:18px; justify-content:center; }
[data-xiangqi-competition] .pk-footer button { width:100%; background:#dce9cb; }
[data-xiangqi-competition] .pk-room-code { background:#fff0d5; border:2px dashed #d3ad78; color:#715137; border-radius:15px; }
[data-xiangqi-competition] .pk-room-intro { padding:14px 0; }
[data-xiangqi-competition] .pk-player { border-radius:20px; border:2px solid #d6c29e; background:#f0f4df; }
[data-xiangqi-competition] .pk-room-actions { gap:12px; flex-wrap:wrap; }
[data-xiangqi-competition] .pk-room-actions > button { flex:1; min-width:120px; }
[data-xiangqi-competition][data-playing] .pk-shell { padding: max(8px,env(safe-area-inset-top)) 10px max(6px,env(safe-area-inset-bottom)); }
[data-xiangqi-competition][data-playing] .pk-header { min-height:44px; padding:0; }
[data-xiangqi-competition][data-playing] .pk-brand strong { font-size:18px; }
[data-xiangqi-competition][data-playing] .pk-status { display:none; }
[data-xiangqi-competition] canvas[data-play] { background:#fff8e8; border-radius:0; }
[data-xiangqi-competition]:has([data-details]:not([hidden])) .pk-shell { display:none; }
[data-xiangqi-competition] .pk-detail-page {
  position:static; inset:auto; display:block; height:100%; background:#fff8e8;
  backdrop-filter:none; padding:max(20px,env(safe-area-inset-top)) 18px max(20px,env(safe-area-inset-bottom));
}
[data-xiangqi-competition] .pk-sheet { height:100%; max-width:none; border:0; border-radius:0; background:transparent; box-shadow:none; padding:0; display:flex; flex-direction:column; }
[data-xiangqi-competition] .pk-sheet-head { flex:none; }
[data-xiangqi-competition] .pk-sheet-head h2 { font-size:26px; font-weight:900; }
[data-xiangqi-competition] .pk-sheet-content { flex:1; overflow:auto; padding:2px 0 14px; }
[data-xiangqi-competition] .pk-sheet-actions { flex:none; padding-top:14px; }
[data-xiangqi-competition] .pk-sheet-actions button { width:100%; background:#dce9cb; }
[data-xiangqi-competition] .pk-result { border:2px solid #d6c29e; border-radius:22px; background:#edf3dc; }
@media (orientation:landscape) and (max-height:500px) {
  [data-xiangqi-competition].competition-dialog { max-width:none; }
  [data-xiangqi-competition] .pk-options { grid-template-columns:1fr 1fr; }
  [data-xiangqi-competition] .pk-shell { padding:8px 18px; }
  [data-xiangqi-competition][data-playing] .pk-header { min-height:44px; }
}
`;
	function mountCompetition(game, createRenderer) {
		if (game === "cops-robbers-realtime") return mountStreetCompetition(game, createRenderer);
		const street = game === "cops-robbers-realtime";
		const xiangqi = game === "xiangqi-five";
		const letters = game === "letters-words2";
		const roleNames = street ? {
			pursuer: "警察",
			runner: "小偷"
		} : {
			pursuer: "追逐队",
			runner: "突围队"
		};
		if (document.querySelector("[data-competition-launch]")) return;
		globalThis.__installCompetition();
		const client = globalThis.__competition, renderer = createRenderer({
			createImage: () => new Image(),
			assetBase: new URL("./", location.href).href
		});
		const modeEntry = xiangqi ? document.getElementById("mode-online") : letters ? document.getElementById("friend-button") : null;
		const launch = modeEntry || document.createElement("button");
		if (!modeEntry) launch.textContent = "好友 PK · 全站榜";
		if (modeEntry) modeEntry.hidden = false;
		launch.dataset.competitionLaunch = "";
		const style = document.createElement("style");
		style.textContent = xiangqi ? h5_default.replaceAll("[data-competition-launch]", "[data-competition-launch]:not(#mode-online)") + xiangqiCompetitionStyles : letters ? h5_default.replaceAll("[data-competition-launch]", "[data-competition-launch]:not(#friend-button)") + lettersCompetitionStyles : h5_default;
		document.head.append(style);
		const dialog = document.createElement(xiangqi ? "section" : "dialog");
		dialog.className = "competition-dialog";
		if (xiangqi) {
			dialog.dataset.xiangqiCompetition = "";
			dialog.hidden = true;
		}
		dialog.setAttribute("aria-label", `${titles[game]} · 好友对决`);
		dialog.innerHTML = `<div class="pk-shell">
    <header class="pk-header"><div class="pk-brand"><span class="pk-brand-mark" aria-hidden="true">PK</span><div><strong>${titles[game]}</strong><small>好友对决 · 同场较量</small></div></div>
      <nav class="pk-tools" aria-label="游玩工具"><button class="pk-quiet" data-rules>玩法</button></nav></header>
    <p class="pk-status" role="status" data-status>同一规则，和好友认真比一局。</p>
    <main class="pk-content">
      <section data-lobby><div class="pk-hero"><span class="pk-eyebrow">一起玩，更有意思</span><h2>叫上好友，比一局。</h2><p>同样的起点，各自的本事。邀请一位好友，完成挑战，看看谁更胜一筹。</p></div>
        <div class="pk-profile"><span class="pk-avatar" data-avatar aria-hidden="true">你</span><div class="pk-profile-copy"><strong data-profile-name>正在读取昵称…</strong><small>你的名字会出现在房间和排行榜中</small></div><button class="pk-quiet" data-profile>修改昵称</button></div>
        <div class="pk-options"><section class="pk-option"><h3>我来开一局</h3><p>创建房间，把邀请发给好友。双方准备后开始。</p><div class="pk-match-options" data-match-options hidden><label>对战模式<select data-match-mode></select></label><label>我的角色<select data-match-role><option value="pursuer">追逐队</option><option value="runner">突围队</option></select></label><label>开局顺序<select data-match-initiative><option value="random">系统分配先手</option><option value="pursuer">追逐队先手</option><option value="runner">突围队先手</option></select></label><small>双方独立操控不同队伍，胜负取决于操作。地图从本模式 100 关中抽取。</small></div><button class="pk-primary" data-create>创建好友挑战 <span aria-hidden="true">↗</span></button></section>
          <section class="pk-option"><h3>好友在等我</h3><p>收到邀请链接可直接加入，也可以输入房间码。</p><div class="pk-join"><label>房间码<input data-code maxlength="12" autocomplete="off" spellcheck="false" placeholder="12 位房间码"></label><button data-join>加入</button></div></section></div>
      </section>
      <section data-room hidden><div class="pk-room-intro"><span class="pk-eyebrow">好友房间</span><h2 data-room-title>等好友就位</h2><span class="pk-room-code" data-room-code></span><p data-room-hint>把邀请发给好友，双方准备后开始。</p></div><div class="pk-matchup" data-players></div>
        <div class="pk-role-actions" data-role-options hidden><span>我的角色</span><button data-role="pursuer">追逐队</button><button data-role="runner">突围队</button><small>切换后交换双方角色，请两人重新准备。</small><label>开局顺序<select data-room-initiative><option value="random">系统分配先手</option><option value="pursuer">追逐队先手</option><option value="runner">突围队先手</option></select></label><small data-initiative-note></small></div><div class="pk-room-actions"><button data-share>复制邀请</button><button class="pk-primary" data-ready>准备</button><button class="pk-primary" data-rematch hidden>再来一局</button><button data-result hidden>查看结果</button></div><p class="pk-room-note">相同规则 · 独立操作 · 服务端确认结果</p></section>
      <canvas data-play hidden aria-label="好友挑战操作区"></canvas>
    </main>
    <footer class="pk-footer"><p>昵称可以重名，成绩跟随账号。游客身份保存在当前浏览器。</p><button data-board>全站榜 <span aria-hidden="true">↗</span></button></footer>
    <div class="pk-exit"><button data-close aria-label="退出 PK">退出 PK</button></div>
  </div><section class="pk-overlay" data-details hidden aria-label="比赛详情"></section>`;
		if (!modeEntry) document.body.append(launch);
		document.body.append(dialog);
		if (letters) {
			dialog.dataset.lettersCompetition = "";
			const back = dialog.querySelector("[data-close]");
			back.textContent = "←";
			back.setAttribute("aria-label", "返回词屿首页");
			back.className = "pk-back";
			dialog.querySelector(".pk-header").prepend(back);
			dialog.querySelector(".pk-exit").remove();
			dialog.querySelector(".pk-brand strong").textContent = "好友同题";
			dialog.querySelector(".pk-hero h2").textContent = "一起，开一座词岛。";
			dialog.querySelector(".pk-hero p").textContent = "同一组 18 词，和朋友来一场 120 秒拼词。";
			const art = document.createElement("div");
			art.className = "pk-letter-hero";
			art.innerHTML = "<strong>叫上朋友<br>看看谁先点亮</strong><img src=\"./assets/ui/island.svg\" alt=\"\">";
			dialog.querySelector(".pk-options").before(art);
			const options = dialog.querySelectorAll(".pk-option");
			options[0].querySelector("h3").textContent = "创建好友房间";
			options[0].querySelector("p").textContent = "把邀请发给好友，准备好就出发。";
			dialog.querySelector("[data-create]").textContent = "创建房间 →";
			options[1].querySelector("h3").textContent = "加入朋友的房间";
			options[1].querySelector("p").hidden = true;
			dialog.querySelector("[data-code]").placeholder = "输入 12 位房间码";
			dialog.querySelector("[data-code]").setAttribute("aria-label", "12 位房间码");
			dialog.querySelector("[data-join]").textContent = "加入房间 →";
			dialog.querySelector(".pk-footer").prepend(dialog.querySelector(".pk-profile"));
			dialog.querySelector("[data-board]").textContent = "看看全站榜 →";
			dialog.querySelector(".pk-overlay").classList.add("pk-detail-page");
		}
		if (xiangqi) {
			const back = dialog.querySelector("[data-close]");
			back.textContent = "←";
			back.setAttribute("aria-label", "返回玩法选择");
			back.className = "pk-back";
			dialog.querySelector(".pk-header").prepend(back);
			dialog.querySelector(".pk-exit").remove();
			dialog.querySelector(".pk-brand strong").textContent = "好友对弈";
			dialog.querySelector(".pk-brand-mark").textContent = "五";
			dialog.querySelector(".pk-hero h2").textContent = "叫上好友，下一局！";
			dialog.querySelector("[data-create]").textContent = "创建房间";
			dialog.querySelector("[data-board]").textContent = "看看排行榜 →";
			dialog.querySelector(".pk-overlay").classList.add("pk-detail-page");
		}
		if (street) {
			globalThis.__CLASSIC_CHASE_ROLES__ = true;
			dialog.dataset.streetCompetition = "";
			const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
			while (walker.nextNode()) walker.currentNode.textContent = walker.currentNode.textContent.replaceAll("追逐队", "警察").replaceAll("突围队", "小偷");
		}
		const select = (q) => dialog.querySelector(letters && q === "[data-ready]" ? "button[data-ready]" : q), status = select("[data-status]"), canvas = select("canvas"), ctx = canvas.getContext("2d"), details = select("[data-details]");
		let room = null, profile = null, poll = null, busy = false, exiting = false, pending = null, frame = 0, lastPoll = 0, resultShown = null, returnFocus = null, modes = [];
		const isOpen = () => xiangqi ? !dialog.hidden : dialog.open;
		let screenStates = [];
		function closeCompetition() {
			if (!xiangqi) {
				dialog.close();
				return;
			}
			dialog.hidden = true;
			dialog.removeAttribute("open");
			document.body.classList.remove("competition-active");
			for (const [screen, inert] of screenStates) screen.inert = inert;
			screenStates = [];
			if (history.state?.xqOnline) {
				const nextState = { ...history.state };
				delete nextState.xqOnline;
				history.replaceState(nextState, "", location.href);
			}
			dialog.dispatchEvent(new Event("close"));
			window.dispatchEvent(new CustomEvent("xiangqi-online-close", { detail: { open: false } }));
			if (launch.isConnected && !launch.closest("[hidden]")) launch.focus();
		}
		function text(tag, value, className = "") {
			const node = document.createElement(tag);
			node.textContent = value;
			if (className) node.className = className;
			return node;
		}
		function action(label, handler, className = "") {
			const button = text("button", label, className);
			button.type = "button";
			button.onclick = handler;
			return button;
		}
		function dismiss() {
			details.hidden = true;
			select(".pk-content").inert = false;
			select(".pk-footer").inert = false;
			if (!xiangqi && !letters) select(".pk-exit").inert = false;
			if (returnFocus?.isConnected && !returnFocus.closest("[hidden]")) returnFocus.focus();
			else select("[data-rules]").focus();
		}
		function detailPanel(title, subtitle, kind) {
			if (details.hidden) returnFocus = document.activeElement;
			details.hidden = false;
			details.replaceChildren();
			select(".pk-content").inert = true;
			select(".pk-footer").inert = true;
			if (!xiangqi && !letters) select(".pk-exit").inert = true;
			const sheet = text("div", "", "pk-sheet");
			sheet.dataset.kind = kind;
			const head = text("div", "", "pk-sheet-head"), label = document.createElement("div");
			label.append(text("h2", title), text("small", subtitle));
			const close = action("返回游戏", dismiss);
			const actions = text("div", "", "pk-sheet-actions");
			const content = text("div", "", "pk-sheet-content");
			close.dataset.dismiss = "";
			close.setAttribute("aria-label", "返回游戏");
			close.title = "返回游戏";
			head.append(label);
			actions.append(close);
			sheet.append(head, content, actions);
			details.append(sheet);
			close.focus();
			return content;
		}
		function feedback(error) {
			status.textContent = error instanceof Error ? error.message : String(error);
			status.toggleAttribute("data-error", error instanceof Error);
			if (letters) status.toggleAttribute("data-feedback", /复制|发送房间码|已读取邀请|昵称已保存/.test(status.textContent));
		}
		function updateProfile(value) {
			profile = value;
			select("[data-profile-name]").textContent = value.name;
			select("[data-avatar]").textContent = Array.from(value.name)[0] || "你";
		}
		async function showProfile() {
			updateProfile(await client.request("/me"));
			const sheet = detailPanel("让好友认出你", "昵称可修改，成绩和身份不会改变。", "profile");
			const form = document.createElement("form");
			form.className = "pk-profile-form";
			const label = text("label", "你的昵称"), input = document.createElement("input");
			input.name = "name";
			input.value = profile.name;
			input.maxLength = 32;
			input.autocomplete = "off";
			input.spellcheck = false;
			input.required = true;
			input.setAttribute("aria-label", "你的昵称");
			label.append(input);
			form.append(label, text("small", "2–16 个中英文字、数字、空格或 · _ -。允许重名；同名时会显示短编号。"));
			const message = text("p", "", "pk-form-message");
			message.setAttribute("role", "status");
			const save = text("button", "保存昵称", "pk-primary");
			save.type = "submit";
			form.append(message, save);
			sheet.append(form);
			const identity = document.createElement("details");
			identity.className = "pk-profile-id";
			identity.append(text("summary", "查看我的玩家 ID"), text("code", profile.playerId), text("p", "系统自动生成，只用于识别账号。昵称和短编号不能用来登录或找回游客身份。"));
			sheet.append(identity);
			form.onsubmit = async (event) => {
				event.preventDefault();
				if (save.disabled) return;
				save.disabled = true;
				message.textContent = "正在保存…";
				try {
					updateProfile(await client.request("/me", { body: JSON.stringify({ name: input.value }) }));
					if (room) accept(await client.request(`/rooms/${room.code}`));
					dismiss();
					feedback("昵称已保存，房间和全站榜会使用新名字。");
				} catch (error) {
					message.textContent = error.message;
				} finally {
					save.disabled = false;
				}
			};
			input.focus();
			input.select();
		}
		function renderPlayers() {
			const target = select("[data-players]");
			target.replaceChildren();
			for (let seat = 0; seat < 2; seat++) {
				if (seat === 1) target.append(text("span", "VS", "pk-versus"));
				const player = room.players[seat], card = text("div", "", "pk-player");
				if (player) {
					card.toggleAttribute("data-ready", !!player.ready);
					card.append(text("span", Array.from(player.name || "新")[0], "pk-avatar"), text("strong", playerName(player, room.players) + (seat === room.you ? "（你）" : "")), text("small", [roleNames[player.role], room.status === "waiting" ? player.ready ? "已准备" : "还未准备" : room.status === "finished" ? "本局已结束" : "本局已中断"].filter(Boolean).join(" · ")));
				} else {
					card.dataset.empty = "";
					card.append(text("span", "＋", "pk-avatar"), text("strong", "等一位好友"), text("small", "复制邀请，发给 TA"));
				}
				target.append(card);
			}
		}
		function accept(value) {
			if (!isOpen()) return;
			if (room?.code !== value.code) pending = null;
			room = value;
			const playing = room.status === "playing", ended = [
				"finished",
				"abandoned",
				"expired"
			].includes(room.status);
			select("[data-lobby]").hidden = true;
			select("[data-room]").hidden = playing;
			canvas.hidden = !playing;
			select(".pk-footer").hidden = playing;
			select("[data-room-code]").textContent = room.code;
			select("[data-room-title]").textContent = ended ? room.status === "finished" ? "这一局，已分高下" : "这局暂告一段落" : room.players.length === 2 ? "好友已就位" : "等好友就位";
			select("[data-room-hint]").textContent = ended ? "再来一局，继续和好友较量。" : room.roles ? `${modes.find((mode) => mode.id === room.mode)?.title || room.mode} · 选择角色，双方准备后开始。` : "双方准备后自动开始。规则和初始条件完全相同。";
			select("[data-role-options]").hidden = room.status !== "waiting" || !room.roles;
			select("[data-room-initiative]").value = room.initiative || "random";
			select("[data-room-initiative]").disabled = room.you !== 0;
			select("[data-initiative-note]").textContent = (game === "cops-robbers-realtime" ? "先手有 2 秒开局行动时间，随后双方同时行动。" : "先手队伍先走一步，此后交替行动。") + "由房主设置，改动后双方重新准备。";
			for (const button of dialog.querySelectorAll("[data-role]")) {
				const selected = button.dataset.role === room.players[room.you]?.role;
				button.setAttribute("aria-pressed", String(selected));
				button.disabled = selected;
			}
			select("[data-ready]").hidden = room.status !== "waiting";
			select("[data-ready]").disabled = !!room.players[room.you]?.ready;
			select("[data-ready]").textContent = room.players[room.you]?.ready ? "已准备，等好友" : "准备";
			select("[data-share]").hidden = ended;
			select("[data-rematch]").hidden = !ended;
			select("[data-result]").hidden = room.status !== "finished";
			dialog.toggleAttribute("data-playing", playing);
			feedback({
				waiting: "等待双方准备",
				playing: room.players[room.you]?.result?.finished ? "已完成，等待对方" : "比赛中",
				finished: "比赛结束，结果已确认",
				abandoned: "玩家退出，本局中断",
				expired: "邀请已过期，请再来一局"
			}[room.status] + (playing ? ` · 剩余 ${Math.max(0, Math.ceil((room.deadline - room.serverNow) / 1e3))} 秒` : ""));
			if (!playing) renderPlayers();
			if (room.status === "finished" && resultShown !== room.code) {
				resultShown = room.code;
				showResults();
			}
			try {
				localStorage.setItem(`competition-room:${game}`, room.code);
			} catch {}
		}
		async function run(task) {
			if (busy) return;
			busy = true;
			dialog.setAttribute("aria-busy", "true");
			try {
				await task();
			} catch (error) {
				if (error.code && error.code !== "SERVICE_UNAVAILABLE") pending = null;
				feedback(error);
			} finally {
				busy = false;
				dialog.removeAttribute("aria-busy");
			}
		}
		async function refresh() {
			if (!room || busy || !isOpen() || Date.now() - lastPoll < (room.pollMs || 1200)) return;
			lastPoll = Date.now();
			try {
				accept(await client.request(`/rooms/${room.code}`));
			} catch (error) {
				feedback(error);
			}
		}
		function showResults() {
			const sheet = detailPanel(letters ? "这一岛，拾得漂亮！" : "这一局，打得漂亮", letters ? "同题较量，看看这一局的收获。" : "比赛结果已由服务端确认。", "result");
			for (const entry of room.results || []) {
				const me = entry.playerId === room.players[room.you].id, player = room.players.find((p) => p.id === entry.playerId), card = text("section", "", "pk-result");
				card.append(text("h3", (me ? "你 · " : "") + playerName(player || { playerId: entry.playerId }, room.players)), text("strong", entry.result.eligible ? scoreText(game, entry.result.score, entry.result.secondary) : "本局无有效成绩"));
				const rank = entry.after.me?.rank, old = entry.before?.rank, change = rank ? old ? `排名变化 ${old - rank > 0 ? "+" : ""}${old - rank}` : "首次上榜" : "尚无有效成绩";
				card.append(text("p", `${game === "xiangqi-five" || room.roles ? "总积分" : "个人最佳"} ${entry.after.me ? scoreText(game, entry.after.me.score, entry.after.me.secondary) : "暂无"}`), text("p", `全站第 ${rank ?? "—"} 名 / ${entry.after.eligiblePlayers} 人 · ${change}`), text("p", gapText(game, entry.after)));
				if (entry.reason) card.append(text("p", entry.reason));
				sheet.append(card);
			}
			const actions = text("div", "", "pk-result-actions");
			actions.append(action("再次挑战", () => select("[data-rematch]").click(), "pk-primary"), action("查看全站榜", () => void run(showBoard)));
			sheet.append(actions);
		}
		async function showBoard() {
			const board = await client.request(`/boards/${game}`), sheet = detailPanel("全站榜", `${board.eligiblePlayers} 位合格玩家 · ${board.roles || game === "xiangqi-five" ? "好友对战积分" : "每人一条最佳成绩"}`, "board"), own = text("section", "", "pk-my-record");
			own.append(text("small", `${profile?.name || "我的成绩"} · ${board.me ? "全站第 " + board.me.rank + " 名" : "尚未上榜"}`), text("strong", board.me ? scoreText(game, board.me.score, board.me.secondary) : "等你留下第一份成绩"), text("p", gapText(game, board)));
			sheet.append(own);
			const list = text("div", "", "pk-list");
			for (const row of board.top) {
				const item = text("div", "", "pk-rank-row");
				item.toggleAttribute("data-self", row.playerId === board.me?.playerId);
				const label = text("span", row.name || "新玩家", "pk-rank-name");
				if (board.top.some((other) => other.playerId !== row.playerId && other.name === row.name)) label.append(text("small", playerName(row, board.top).split(" · #").slice(1).map((value) => "#" + value).join("")));
				if (row.playerId === board.me?.playerId) label.append(text("small", "你"));
				item.append(text("span", String(row.rank), "pk-rank-number"), label, text("span", scoreText(game, row.score, row.secondary), "pk-rank-score"));
				list.append(item);
			}
			if (!board.top.length) list.append(text("p", "全站榜暂为空。完成一次有效挑战，就能留下你的名字。", "pk-empty"));
			sheet.append(list, text("p", board.description || board.title, "pk-sheet-note"));
		}
		async function showRules() {
			if (!details.hidden && details.firstElementChild?.dataset.kind === "rules") {
				dismiss();
				return;
			}
			const sheet = detailPanel("这局怎么玩", titles[game], "rules"), loading = text("p", "正在读取比赛规则…");
			sheet.append(loading);
			try {
				const rules = room?.state?.rules || (await client.request(`/boards/${game}`)).description || "双方准备后开始，服务端验证操作与计时。";
				if (!sheet.isConnected || sheet.closest("[data-details]") !== details) return;
				loading.remove();
				const list = text("ol", "", "pk-rule-list");
				for (const part of rules.split(/[；。]+/).map((part) => part.trim()).filter(Boolean)) list.append(text("li", part + "。"));
				sheet.append(list, text("p", room?.status === "playing" ? "查看规则时比赛计时继续。准备好后，关闭这张卡片继续。" : "练习和离线成绩不计入全站榜。双方准备后，比赛由服务端开始计时。", "pk-sheet-note"));
			} catch (error) {
				loading.textContent = error.message;
			}
		}
		function draw() {
			if (!isOpen()) return;
			if (!canvas.hidden && (!xiangqi || details.hidden)) {
				const rect = street ? {
					width: canvas.clientWidth,
					height: canvas.clientHeight
				} : canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2), width = Math.floor(rect.width * ratio), height = Math.floor(rect.height * ratio);
				if (canvas.width !== width || canvas.height !== height) {
					canvas.width = width;
					canvas.height = height;
				}
				ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
				ctx.clearRect(0, 0, rect.width, rect.height);
				if (room?.state) renderer.draw(ctx, rect.width, rect.height, room.state);
			}
			frame = requestAnimationFrame(draw);
		}
		async function open() {
			if (isOpen() || exiting) return;
			window.dispatchEvent(new CustomEvent("competition-visibility", { detail: { open: true } }));
			if (xiangqi) {
				history.pushState({
					...history.state,
					xqScreen: document.body.dataset.screen || "modes",
					xqOnline: true
				}, "", location.href);
				window.dispatchEvent(new CustomEvent("xiangqi-online-open", { detail: { open: true } }));
				screenStates = [...document.querySelectorAll("[data-screen]:not(body)")].map((screen) => [screen, screen.inert]);
				for (const [screen] of screenStates) screen.inert = true;
				document.body.classList.add("competition-active");
				dialog.hidden = false;
				dialog.setAttribute("open", "");
				select("[data-close]").focus();
			} else dialog.showModal();
			draw();
			poll = setInterval(refresh, 250);
			const invite = new URL(location.href).searchParams.get("pk");
			let saved;
			try {
				saved = localStorage.getItem(`competition-room:${game}`);
			} catch {}
			await run(async () => {
				updateProfile(await client.request("/me"));
				const metadata = await client.request(`/boards/${game}`);
				modes = metadata.modes || [];
				select("[data-match-options]").hidden = !metadata.roles;
				select("[data-match-mode]").replaceChildren(...modes.map((mode) => {
					const option = text("option", mode.title);
					option.value = mode.id;
					return option;
				}));
				if (invite && /^[A-F0-9]{12}$/.test(invite)) {
					select("[data-code]").value = invite;
					feedback("已读取邀请，请点击加入。");
				} else if (saved) accept(await client.request(`/rooms/${saved}`));
			});
		}
		launch.onclick = () => void open();
		if (street) globalThis.__openStreetCompetition = async (entry) => {
			await open();
			if (entry === "board") await run(showBoard);
		};
		select("[data-create]").onclick = () => void run(async () => accept(await client.request("/rooms", { body: JSON.stringify({
			game,
			...modes.length ? {
				mode: select("[data-match-mode]").value,
				role: select("[data-match-role]").value,
				initiative: select("[data-match-initiative]").value
			} : {}
		}) })));
		for (const button of dialog.querySelectorAll("[data-role]")) button.onclick = () => void run(async () => accept(await client.request(`/rooms/${room.code}/role`, { body: JSON.stringify({ role: button.dataset.role }) })));
		select("[data-room-initiative]").onchange = () => void run(async () => accept(await client.request(`/rooms/${room.code}/initiative`, { body: JSON.stringify({ initiative: select("[data-room-initiative]").value }) })));
		select("[data-join]").onclick = () => void run(async () => accept(await client.request("/rooms/join", { body: JSON.stringify({
			code: select("[data-code]").value.trim().toUpperCase(),
			game
		}) })));
		select("[data-ready]").onclick = () => void run(async () => accept(await client.request(`/rooms/${room.code}/ready`, { body: "{}" })));
		select("[data-rematch]").onclick = () => void run(async () => {
			const result = await client.request(`/rooms/${room.code}/rematch`, { body: "{}" });
			dismiss();
			accept(await client.request("/rooms/join", { body: JSON.stringify({ code: result.rematch }) }));
		});
		select("[data-share]").onclick = () => void run(async () => {
			const url = new URL(location.href);
			if (letters) {
				url.search = "";
				url.hash = "";
			}
			url.searchParams.set("pk", room.code);
			try {
				await navigator.clipboard.writeText(url.href);
				feedback("邀请链接已复制；也可发送房间码 " + room.code);
			} catch {
				feedback("请发送房间码 " + room.code + " 给好友。");
			}
		});
		select("[data-board]").onclick = () => void run(showBoard);
		select("[data-profile]").onclick = () => void run(showProfile);
		select("[data-rules]").onclick = () => void run(showRules);
		select("[data-result]").onclick = showResults;
		select("[data-close]").onclick = async () => {
			if (exiting) return;
			exiting = true;
			launch.disabled = true;
			closeCompetition();
			try {
				if (room && ["waiting", "playing"].includes(room.status)) await client.request(`/rooms/${room.code}/leave`, { body: "{}" });
				room = null;
				pending = null;
				resultShown = null;
				select("[data-lobby]").hidden = false;
				select("[data-room]").hidden = true;
				canvas.hidden = true;
				select(".pk-footer").hidden = false;
				dialog.removeAttribute("data-playing");
				try {
					localStorage.removeItem(`competition-room:${game}`);
				} catch {}
				if (!modeEntry) launch.textContent = "好友 PK · 全站榜";
				launch.removeAttribute("title");
				feedback("同一规则，和好友认真比一局。");
			} catch {
				if (!modeEntry) launch.textContent = "已退出 · 房间待确认";
				launch.title = "网络不可用，服务端尚未确认退出。重连可查看原房间，否则按时限结束。";
			} finally {
				exiting = false;
				launch.disabled = false;
				if (letters && launch.isConnected && launch.getClientRects().length) launch.focus();
			}
		};
		dialog.addEventListener("cancel", (event) => {
			event.preventDefault();
			if (!details.hidden) dismiss();
			else select("[data-close]").click();
		});
		if (xiangqi) {
			document.addEventListener("keydown", (event) => {
				if (event.key !== "Escape" || !isOpen()) return;
				event.preventDefault();
				if (!details.hidden) dismiss();
				else select("[data-close]").click();
			});
			window.addEventListener("xiangqi-online-exit", () => {
				if (isOpen()) select("[data-close]").click();
			});
		}
		details.addEventListener("click", (event) => {
			if (!xiangqi && event.target === details) dismiss();
		});
		dialog.addEventListener("close", () => {
			clearInterval(poll);
			cancelAnimationFrame(frame);
			dismiss();
			window.dispatchEvent(new CustomEvent("competition-visibility", { detail: { open: false } }));
		});
		let lettersPointer = null;
		if (letters) {
			canvas.addEventListener("pointerdown", (event) => {
				if (!room || room.status !== "playing" || !details.hidden) return;
				if (lettersPointer) {
					lettersPointer.cancelled = true;
					return;
				}
				lettersPointer = {
					id: event.pointerId,
					x: event.clientX,
					y: event.clientY,
					cancelled: false
				};
				canvas.setPointerCapture?.(event.pointerId);
			});
			canvas.addEventListener("pointermove", (event) => {
				if (lettersPointer?.id === event.pointerId && Math.hypot(event.clientX - lettersPointer.x, event.clientY - lettersPointer.y) > 10) lettersPointer.cancelled = true;
			});
			const cancel = () => {
				lettersPointer = null;
			};
			canvas.addEventListener("pointercancel", cancel);
			canvas.addEventListener("lostpointercapture", cancel);
			dialog.addEventListener("close", cancel);
			window.addEventListener("blur", cancel);
			window.addEventListener("resize", cancel);
			document.addEventListener("visibilitychange", () => {
				if (document.hidden) cancel();
			});
		}
		canvas.addEventListener("pointerup", (event) => {
			if (!room || room.status !== "playing" || !details.hidden) {
				if (letters) lettersPointer = null;
				return;
			}
			if (letters) {
				const pointer = lettersPointer;
				lettersPointer = null;
				if (!pointer || pointer.id !== event.pointerId || pointer.cancelled) return;
			}
			const rect = canvas.getBoundingClientRect();
			const rotated = street && matchMedia("(orientation: portrait)").matches;
			const command = renderer.tap(rotated ? event.clientY - rect.top : event.clientX - rect.left, rotated ? rect.right - event.clientX : event.clientY - rect.top, room.state);
			if (!command) return;
			run(async () => {
				pending ??= {
					seq: room.seq + 1,
					action: command
				};
				const next = await client.request(`/rooms/${room.code}/actions`, { body: JSON.stringify(pending) });
				pending = null;
				accept(next);
			});
		});
		if (new URL(location.href).searchParams.has("pk")) open();
	}
	var TYPES = [
		"rook",
		"horse",
		"elephant",
		"advisor",
		"king",
		"cannon",
		"pawn"
	];
	var NAMES = {
		red: [
			"车",
			"马",
			"相",
			"士",
			"帅",
			"炮",
			"兵"
		],
		black: [
			"车",
			"马",
			"象",
			"士",
			"将",
			"炮",
			"卒"
		]
	};
	var label = (piece) => NAMES[piece.side][TYPES.indexOf(piece.type)];
	var sideName = (side) => side === "red" ? "红方" : "黑方";
	var valid = (index, board) => Number.isInteger(index) && index >= 0 && index < board.length;
	function canMove(board, from, to, cols = 9) {
		if (!valid(from, board) || !valid(to, board) || from === to || !board[from]) return false;
		const piece = board[from];
		if (board[to]?.side === piece.side) return false;
		const x = from % cols, y = Math.floor(from / cols);
		const tx = to % cols, ty = Math.floor(to / cols);
		const dx = tx - x, dy = ty - y;
		const ax = Math.abs(dx), ay = Math.abs(dy);
		switch (piece.type) {
			case "rook":
			case "cannon": {
				if (dx !== 0 && dy !== 0) return false;
				const step = dx === 0 ? Math.sign(dy) * cols : Math.sign(dx);
				let blockers = 0;
				for (let i = from + step; i !== to; i += step) if (board[i]) blockers++;
				return blockers === (piece.type === "cannon" && board[to] ? 1 : 0);
			}
			case "horse":
				if (!(ax === 2 && ay === 1 || ax === 1 && ay === 2)) return false;
				return !board[from + (ax === 2 ? Math.sign(dx) : Math.sign(dy) * cols)];
			case "elephant": return ax === 2 && ay === 2 && !board[from + dy / 2 * cols + dx / 2];
			case "advisor": return ax === 1 && ay === 1;
			case "king":
			case "pawn": return ax + ay === 1;
			default: return false;
		}
	}
	//#endregion
	//#region ../../games/submodules/xiangqi-five/competition-renderer.js
	var colors = {
		ink: "#573626",
		cream: "#fff8e8",
		coral: "#ef795f",
		red: "#b94d37",
		mint: "#b9d2ad",
		green: "#365f45",
		wood: "#d6a16a",
		board: "#f7dcaa"
	};
	function rounded(ctx, x, y, width, height, radius, fill, stroke) {
		const r = Math.min(radius, width / 2, height / 2);
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + width - r, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + r);
		ctx.lineTo(x + width, y + height - r);
		ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
		ctx.lineTo(x + r, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
		if (fill) {
			ctx.fillStyle = fill;
			ctx.fill();
		}
		if (stroke) {
			ctx.strokeStyle = stroke;
			ctx.lineWidth = 1.6;
			ctx.stroke();
		}
	}
	function token(ctx, x, y, radius, piece, text, winning = false, selected = false) {
		const red = piece.side === "red", rim = red ? colors.red : colors.green;
		ctx.beginPath();
		ctx.ellipse(x, y + radius * .85, radius * .87, radius * .22, 0, 0, Math.PI * 2);
		ctx.fillStyle = "#70442225";
		ctx.fill();
		ctx.beginPath();
		ctx.arc(x, y + radius * .13, radius, 0, Math.PI * 2);
		ctx.fillStyle = red ? colors.coral : "#88a879";
		ctx.fill();
		ctx.strokeStyle = selected ? "#e7a927" : rim;
		ctx.lineWidth = selected ? 3 : 1.6;
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(x, y - radius * .04, radius * .88, 0, Math.PI * 2);
		ctx.fillStyle = winning ? "#ffe89a" : red ? "#ffddae" : "#dce9bf";
		ctx.fill();
		ctx.strokeStyle = "#fff8e8";
		ctx.lineWidth = Math.max(1, radius * .08);
		ctx.stroke();
		text(label(piece), x, y - radius * .25, Math.max(10, radius * 1.02), rim, true);
		for (const dx of [-.4, .4]) {
			ctx.beginPath();
			ctx.arc(x + radius * dx, y + radius * .3, Math.max(1, radius * .095), 0, Math.PI * 2);
			ctx.fillStyle = colors.ink;
			ctx.fill();
			ctx.beginPath();
			ctx.ellipse(x + radius * dx * 1.42, y + radius * .47, radius * .12, radius * .09, 0, 0, Math.PI * 2);
			ctx.fillStyle = "#ef947e";
			ctx.fill();
		}
		ctx.beginPath();
		ctx.arc(x, y + radius * .31, radius * .16, .12, Math.PI - .12);
		ctx.strokeStyle = colors.ink;
		ctx.lineWidth = Math.max(1, radius * .075);
		ctx.stroke();
	}
	function createRenderer() {
		let selected = null, lastPly = -1, hits = [], note = "", lastMoveAt = 0, priorBoard = [], lastDestination = null;
		const ownTurn = (state) => state && !state.result && state.turn === (state.seat === 0 ? "red" : "black");
		return {
			draw(ctx, width, height, state) {
				hits = [];
				ctx.fillStyle = colors.cream;
				ctx.fillRect(0, 0, width, height);
				ctx.textBaseline = "middle";
				ctx.textAlign = "center";
				const text = (value, x, y, size = 14, color = colors.ink, bold = false) => {
					ctx.font = `${bold ? "800 " : ""}${size}px "PingFang SC", sans-serif`;
					ctx.fillStyle = color;
					ctx.fillText(value, x, y);
				};
				if (!state?.board) {
					text("等好友一起下棋…", width / 2, 30);
					return hits;
				}
				if (state.ply !== lastPly) {
					lastDestination = state.board.findIndex((piece, index) => piece && `${piece.side}:${piece.type}` !== priorBoard[index]);
					priorBoard = state.board.map((piece) => piece ? `${piece.side}:${piece.type}` : "");
					selected = null;
					note = "";
					lastPly = state.ply;
					lastMoveAt = Date.now();
				}
				if (!ownTurn(state)) selected = null;
				const unit = Math.max(8, Math.min((width - 12) / 9, (height - 104) / 10, 56));
				const left = (width - unit * 9) / 2, top = 36;
				const me = state.seat === 0 ? "红" : "黑";
				const seconds = Math.max(0, Math.ceil((9e5 - state.elapsedMs) / 1e3));
				const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
				rounded(ctx, left + 2, 4, unit * 9 - 4, 26, 13, "#eef2da");
				text(state.result ? state.result === "draw" ? "平局啦，再玩一局！" : `${sideName(state.result)}连五获胜！` : `你执${me} · ${ownTurn(state) ? "轮到你啦" : "等好友落子"} · ${time}`, width / 2, 17, Math.min(13, width / 24), colors.ink, true);
				rounded(ctx, left - 4, 32, unit * 9 + 8, unit * 10 + 9, 13, "#b9814d", colors.ink);
				rounded(ctx, left - 2, 32, unit * 9 + 4, unit * 10 + 3, 11, colors.wood, "#aa7546");
				rounded(ctx, left + 1, 37, unit * 9 - 2, unit * 10 - 2, 7, colors.board, "#9c714a");
				ctx.strokeStyle = "#9b7a50";
				ctx.lineWidth = Math.max(.7, unit / 38);
				for (let x = 0; x < 9; x++) {
					ctx.beginPath();
					ctx.moveTo(left + (x + .5) * unit, top + .5 * unit);
					ctx.lineTo(left + (x + .5) * unit, top + 9.5 * unit);
					ctx.stroke();
				}
				for (let y = 0; y < 10; y++) {
					ctx.beginPath();
					ctx.moveTo(left + .5 * unit, top + (y + .5) * unit);
					ctx.lineTo(left + 8.5 * unit, top + (y + .5) * unit);
					ctx.stroke();
				}
				ctx.fillStyle = "#f8ddb0";
				ctx.fillRect(left + unit * .52, top + unit * 4.6, unit * 7.96, unit * .8);
				text("楚 河", left + unit * 2.5, top + unit * 5, unit * .37, "#956f47", true);
				text("汉 界", left + unit * 6.5, top + unit * 5, unit * .37, "#956f47", true);
				const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
				state.board.forEach((piece, index) => {
					const x = left + (index % 9 + .5) * unit, y = top + (Math.floor(index / 9) + .5) * unit;
					const winning = state.winningLine?.includes(index);
					if (piece) {
						const elapsed = Date.now() - lastMoveAt;
						token(ctx, x, y - (!reduced && index === lastDestination && elapsed < 350 ? Math.sin(elapsed / 350 * Math.PI) * unit * .08 : 0), unit * .38, piece, text, winning, selected === index);
					}
					if (selected !== null && canMove(state.board, selected, index, 9)) {
						ctx.beginPath();
						ctx.arc(x, y, unit * (piece ? .46 : .11), 0, Math.PI * 2);
						ctx.strokeStyle = piece ? colors.coral : "#689664";
						ctx.lineWidth = 2.2;
						ctx.stroke();
						if (!piece) {
							ctx.fillStyle = "#a7c699";
							ctx.fill();
						}
					}
					hits.push({
						label: `${String.fromCharCode(65 + index % 9)}${Math.floor(index / 9) + 1}${piece ? sideName(piece.side) + label(piece) : "空位"}`,
						x: x - unit / 2,
						y: y - unit / 2,
						w: unit,
						h: unit,
						index
					});
				});
				const bottom = top + unit * 10;
				text(note || (!ownTurn(state) ? "好友正在想下一手，马上轮到你" : state.pending ? `抽到「${label(state.pending)}」！点空位放上场` : selected !== null ? "点绿点移动，点红圈吃子" : "点空位落子，点自己的棋子移动"), width / 2, bottom + 15, Math.min(12, width / 27), "#8e7056");
				const count = Object.values(state.poolCounts?.[state.turn] || {}).reduce((sum, n) => sum + n, 0);
				const canDraw = ownTurn(state) && !state.pending && count > 0;
				const buttonWidth = Math.min(width - 16, 240), x = (width - buttonWidth) / 2;
				rounded(ctx, x, bottom + 24, buttonWidth, 44, 18, canDraw ? colors.coral : "#dbe6c7", canDraw ? colors.red : "#94ad80");
				text(state.result ? "五连达成！" : !ownTurn(state) ? "等朋友落子" : state.pending ? `已抽到「${label(state.pending)}」` : `抽一枚 · 还剩 ${count} 枚`, width / 2, bottom + 46, 15, canDraw ? "#fffaf0" : colors.green, true);
				if (canDraw) hits.push({
					label: "先抽子查看",
					x,
					y: bottom + 24,
					w: buttonWidth,
					h: 44,
					action: { type: "draw" }
				});
				return hits;
			},
			tap(x, y, state) {
				if (!ownTurn(state)) return null;
				const hit = hits.find((item) => x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h);
				if (!hit) return null;
				if (hit.action) {
					selected = null;
					note = "";
					return hit.action;
				}
				const index = hit.index, piece = state.board[index];
				if (state.pending) return piece ? null : {
					type: "deploy",
					to: index
				};
				if (piece?.side === state.turn) {
					selected = selected === index ? null : index;
					note = "";
					return null;
				}
				if (selected !== null) {
					if (canMove(state.board, selected, index, 9)) return {
						type: "move",
						from: selected,
						to: index
					};
					note = "这里走不到哦，试试绿点";
					return null;
				}
				if (!piece && Object.values(state.poolCounts?.[state.turn] || {}).some((n) => n > 0)) return {
					type: "deploy-directly",
					to: index
				};
				return null;
			}
		};
	}
	//#endregion
	//#region ../../.scratch/competition/h5-xiangqi-five.js
	globalThis.__COMPETITION_CONFIG__ = Object.assign({
		"game": "xiangqi-five",
		"platform": "h5",
		"title": "象五子棋",
		"apiUrl": ""
	}, globalThis.__COMPETITION_CONFIG__ || {});
	mountCompetition("xiangqi-five", createRenderer);
	//#endregion
})();
