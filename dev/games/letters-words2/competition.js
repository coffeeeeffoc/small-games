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
			kuaishou: "ks"
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
	//#region ../../platforms/competition/h5.js
	var titles = {
		"cops-robbers": "围捕小队",
		"cops-robbers-realtime": "别跑！街区围捕",
		"letters-words2": "词屿 · 字母叠叠乐",
		"vibeJam-myself-history-guess": "此时·此地",
		"xiangqi-five": "象五子棋"
	};
	var roleNames = {
		pursuer: "追逐队",
		runner: "突围队"
	};
	function mountCompetition(game, createRenderer) {
		if (document.querySelector("[data-competition-launch]")) return;
		globalThis.__installCompetition();
		const client = globalThis.__competition, renderer = createRenderer({
			createImage: () => new Image(),
			assetBase: new URL("./", location.href).href
		});
		const launch = document.createElement("button");
		launch.textContent = "好友 PK · 全站榜";
		launch.dataset.competitionLaunch = "";
		const style = document.createElement("style");
		style.textContent = h5_default;
		document.head.append(style);
		const dialog = document.createElement("dialog");
		dialog.className = "competition-dialog";
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
		document.body.append(launch, dialog);
		const select = (q) => dialog.querySelector(q), status = select("[data-status]"), canvas = select("canvas"), ctx = canvas.getContext("2d"), details = select("[data-details]");
		let room = null, profile = null, poll = null, busy = false, exiting = false, pending = null, frame = 0, lastPoll = 0, resultShown = null, returnFocus = null, modes = [];
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
			select(".pk-exit").inert = false;
			if (returnFocus?.isConnected && !returnFocus.closest("[hidden]")) returnFocus.focus();
			else select("[data-rules]").focus();
		}
		function detailPanel(title, subtitle, kind) {
			if (details.hidden) returnFocus = document.activeElement;
			details.hidden = false;
			details.replaceChildren();
			select(".pk-content").inert = true;
			select(".pk-footer").inert = true;
			select(".pk-exit").inert = true;
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
			if (!dialog.open) return;
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
			if (!room || busy || !dialog.open || Date.now() - lastPoll < (room.pollMs || 1200)) return;
			lastPoll = Date.now();
			try {
				accept(await client.request(`/rooms/${room.code}`));
			} catch (error) {
				feedback(error);
			}
		}
		function showResults() {
			const sheet = detailPanel("这一局，打得漂亮", "比赛结果已由服务端确认。", "result");
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
			if (!dialog.open) return;
			if (!canvas.hidden) {
				const rect = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2), width = Math.floor(rect.width * ratio), height = Math.floor(rect.height * ratio);
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
			if (dialog.open || exiting) return;
			window.dispatchEvent(new CustomEvent("competition-visibility", { detail: { open: true } }));
			dialog.showModal();
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
			dialog.close();
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
				launch.textContent = "好友 PK · 全站榜";
				launch.removeAttribute("title");
				feedback("同一规则，和好友认真比一局。");
			} catch {
				launch.textContent = "已退出 · 房间待确认";
				launch.title = "网络不可用，服务端尚未确认退出。重连可查看原房间，否则按时限结束。";
			} finally {
				exiting = false;
				launch.disabled = false;
			}
		};
		dialog.addEventListener("cancel", (event) => {
			event.preventDefault();
			if (!details.hidden) dismiss();
			else select("[data-close]").click();
		});
		details.addEventListener("click", (event) => {
			if (event.target === details) dismiss();
		});
		dialog.addEventListener("close", () => {
			clearInterval(poll);
			cancelAnimationFrame(frame);
			dismiss();
			window.dispatchEvent(new CustomEvent("competition-visibility", { detail: { open: false } }));
		});
		canvas.addEventListener("pointerup", (event) => {
			if (!room || room.status !== "playing" || !details.hidden) return;
			const rect = canvas.getBoundingClientRect(), command = renderer.tap(event.clientX - rect.left, event.clientY - rect.top, room.state);
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
	//#endregion
	//#region ../../games/local/letters-words2/competition-renderer.js
	function createRenderer() {
		let targets = [], choosing = false, choicePage = 0;
		const wrap = (ctx, text, x, y, width, maxLines = 2) => {
			let line = "", row = 0;
			for (const char of text) {
				if (ctx.measureText(line + char).width > width && line) {
					ctx.fillText(line, x, y + row * 22);
					line = "";
					row++;
					if (row === maxLines) return;
				}
				line += char;
			}
			ctx.fillText(line, x, y + row * 22);
		};
		return {
			draw(ctx, width, height, state) {
				targets = [];
				ctx.fillStyle = "#f5f3eb";
				ctx.fillRect(0, 0, width, height);
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				ctx.font = "14px sans-serif";
				if (!state?.tiles) {
					ctx.fillStyle = "#375640";
					ctx.fillText("等待比赛开始…", 16, 30);
					return;
				}
				const button = (label, x, y, w, h, action, enabled = true) => {
					ctx.fillStyle = enabled ? "#dfe8c5" : "#e4e6dc";
					ctx.fillRect(x, y, w, h);
					ctx.fillStyle = enabled ? "#284b35" : "#7b8573";
					ctx.font = "14px sans-serif";
					ctx.textAlign = "center";
					ctx.fillText(label, x + w / 2, y + h / 2);
					ctx.textAlign = "left";
					if (enabled) targets.push({
						x,
						y,
						w,
						h,
						action
					});
				};
				ctx.fillStyle = "#284b35";
				ctx.font = "14px sans-serif";
				ctx.fillText(`有效 ${state.cleanCorrect}/${state.total} · 提交 ${state.attempts} · ${Math.max(0, Math.ceil((state.durationMs - state.elapsedMs) / 1e3))}秒`, 12, 20);
				button("换词义", width - 84, 37, 72, 44, { local: "choose" });
				ctx.font = "bold 20px sans-serif";
				ctx.fillStyle = "#284b35";
				wrap(ctx, state.meaning, 12, 51, width - 108, 2);
				const landscape = width > 620 && height < 540;
				const boardWidth = landscape ? width * .52 : width;
				const boardTop = landscape ? 12 : 95;
				const scale = Math.min((boardWidth - 20) / state.board.width, (height - (landscape ? 24 : 226)) / state.board.height);
				const boardX = (boardWidth - state.board.width * scale) / 2;
				const hudX = landscape ? boardWidth + 10 : 12;
				const hudWidth = landscape ? width - boardWidth - 22 : width - 24;
				if (landscape) {
					ctx.fillStyle = "#f5f3eb";
					ctx.fillRect(0, 0, width, 94);
					ctx.fillStyle = "#284b35";
					ctx.font = "bold 20px sans-serif";
					wrap(ctx, state.meaning, hudX, 28, hudWidth, 2);
					button("换词义", hudX, 68, hudWidth, 44, { local: "choose" });
					targets.shift();
					ctx.font = "12px sans-serif";
					ctx.fillStyle = "#284b35";
					ctx.fillText(`有效 ${state.cleanCorrect}/${state.total} · 提交 ${state.attempts}`, hudX, height - 12);
				}
				ctx.fillStyle = "#e8ecd9";
				ctx.fillRect(boardX, boardTop, state.board.width * scale, state.board.height * scale);
				for (const tile of [...state.tiles].sort((a, b) => a.z - b.z)) {
					const x = boardX + tile.x * scale, y = boardTop + tile.y * scale, size = tile.size * scale;
					const selected = state.selected.includes(tile.id);
					ctx.fillStyle = tile.blocked ? "#b9c4a4" : selected ? "#32664f" : "#fffcdf";
					ctx.fillRect(x, y, size, size);
					ctx.strokeStyle = tile.id === state.hint ? "#c58c26" : "#899475";
					ctx.lineWidth = tile.id === state.hint ? 3 : 1;
					ctx.strokeRect(x, y, size, size);
					ctx.fillStyle = selected ? "#fffdec" : tile.blocked ? "#69765b" : "#294b34";
					ctx.font = `bold ${Math.max(18, size * .48)}px serif`;
					ctx.textAlign = "center";
					ctx.fillText(tile.char, x + size / 2, y + size / 2);
					ctx.textAlign = "left";
					targets.push({
						x,
						y,
						w: size,
						h: size,
						action: tile.blocked ? null : {
							type: "select",
							tileId: tile.id
						}
					});
				}
				const answerY = landscape ? 138 : boardTop + state.board.height * scale + 20;
				const answer = state.selected.map((id) => state.tiles.find((tile) => tile.id === id)?.char || "").join("");
				ctx.fillStyle = "#284b35";
				ctx.font = "bold 21px sans-serif";
				wrap(ctx, `${answer || "点字母拼写"}  ${state.selected.length}/${state.length}`, hudX, answerY, hudWidth, 2);
				const gap = 4, size = (hudWidth - 12) / 4, controlsY = answerY + 28;
				[
					"检查",
					"撤回",
					"重排",
					"提示"
				].forEach((label, index) => button(label, hudX + index * (size + gap), controlsY, size, 44, { type: [
					"submit",
					"undo",
					"shuffle",
					"hint"
				][index] }, !state.finished && (index === 0 ? state.selected.length === state.length : index === 1 ? state.selected.length > 0 : true)));
				ctx.font = "12px sans-serif";
				ctx.fillStyle = "#486043";
				wrap(ctx, state.feedback || "提示词不计排位正确量；拼出不等于掌握。", hudX, controlsY + 62, hudWidth, 2);
				if (choosing) {
					ctx.fillStyle = "#183024ee";
					ctx.fillRect(0, 0, width, height);
					targets = [];
					ctx.fillStyle = "#fff";
					ctx.font = "18px sans-serif";
					ctx.fillText("选择中文词义", 16, 26);
					const columns = width >= 600 ? 2 : 1;
					const pageSize = Math.max(1, Math.floor((height - 110) / 56)) * columns, lastPage = Math.max(0, Math.ceil(state.words.length / pageSize) - 1);
					choicePage = Math.min(choicePage, lastPage);
					const columnWidth = (width - 24 - (columns - 1) * 8) / columns;
					state.words.slice(choicePage * pageSize, (choicePage + 1) * pageSize).forEach((word, index) => button(`${word.meaning} · ${word.done ? "完成" : word.available ? "可拼" : "待解锁"}`, 12 + index % columns * (columnWidth + 8), 48 + Math.floor(index / columns) * 56, columnWidth, 48, {
						type: "choose",
						wordId: word.id
					}, !word.done));
					const footer = height - 50, third = (width - 32) / 3;
					button("上一页", 12, footer, third, 44, { local: "previous" }, choicePage > 0);
					button("返回拼写", 16 + third, footer, third, 44, { local: "close" });
					button("下一页", 20 + third * 2, footer, third, 44, { local: "next" }, choicePage < lastPage);
				}
			},
			tap(x, y) {
				const target = [...targets].reverse().find((box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
				if (!target) return null;
				if (target.action?.local) {
					if (target.action.local === "previous") choicePage--;
					else if (target.action.local === "next") choicePage++;
					else {
						choosing = target.action.local === "choose";
						choicePage = 0;
					}
					return null;
				}
				if (target.action?.type === "choose") choosing = false;
				return target.action;
			}
		};
	}
	//#endregion
	//#region ../../.scratch/competition/h5-letters-words2.js
	globalThis.__COMPETITION_CONFIG__ = Object.assign({
		"game": "letters-words2",
		"platform": "h5",
		"title": "词屿 · 字母叠叠乐",
		"apiUrl": ""
	}, globalThis.__COMPETITION_CONFIG__ || {});
	mountCompetition("letters-words2", createRenderer);
	//#endregion
})();
