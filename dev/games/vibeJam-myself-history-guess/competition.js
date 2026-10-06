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
	var world_default = {
		type: "FeatureCollection",
		features: [
			{
				"type": "Feature",
				"properties": {
					"name": "斐济",
					"x": 177.975427,
					"y": -17.826099,
					"rank": 6
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[180, -16.067],
							[180, -16.555],
							[179.364, -16.801],
							[178.725, -17.012],
							[178.597, -16.639],
							[179.097, -16.434],
							[179.414, -16.379],
							[180, -16.067]
						]],
						[[
							[178.126, -17.505],
							[178.374, -17.34],
							[178.718, -17.628],
							[178.553, -18.151],
							[177.933, -18.288],
							[177.381, -18.164],
							[177.285, -17.725],
							[177.671, -17.381],
							[178.126, -17.505]
						]],
						[[
							[-179.793, -16.021],
							[-179.917, -16.502],
							[-180, -16.555],
							[-180, -16.067],
							[-179.793, -16.021]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "坦桑尼亚",
					"x": 34.959183,
					"y": -6.051866,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[33.904, -.95],
						[34.073, -1.06],
						[37.699, -3.097],
						[37.767, -3.677],
						[39.202, -4.677],
						[38.741, -5.909],
						[38.8, -6.476],
						[39.44, -6.84],
						[39.47, -7.1],
						[39.195, -7.704],
						[39.252, -8.008],
						[39.187, -8.486],
						[39.536, -9.112],
						[39.95, -10.098],
						[40.317, -10.317],
						[40.317, -10.317],
						[39.521, -10.897],
						[38.428, -11.285],
						[37.828, -11.269],
						[37.471, -11.569],
						[36.775, -11.595],
						[36.514, -11.721],
						[35.312, -11.439],
						[34.56, -11.52],
						[34.28, -10.16],
						[33.941, -9.694],
						[33.74, -9.417],
						[32.759, -9.231],
						[32.192, -8.93],
						[31.556, -8.762],
						[31.158, -8.595],
						[30.74, -8.34],
						[30.74, -8.34],
						[30.2, -7.08],
						[29.62, -6.52],
						[29.42, -5.94],
						[29.52, -5.42],
						[29.34, -4.5],
						[29.754, -4.452],
						[30.116, -4.09],
						[30.506, -3.569],
						[30.752, -3.359],
						[30.743, -3.034],
						[30.528, -2.808],
						[30.47, -2.414],
						[30.47, -2.414],
						[30.758, -2.287],
						[30.816, -1.699],
						[30.419, -1.135],
						[30.77, -1.015],
						[31.866, -1.027],
						[33.904, -.95]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "西撒哈拉",
					"x": -12.630304,
					"y": 23.967592,
					"rank": 7
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-8.666, 27.656],
						[-8.665, 27.589],
						[-8.684, 27.396],
						[-8.687, 25.881],
						[-11.969, 25.933],
						[-11.937, 23.375],
						[-12.874, 23.285],
						[-13.119, 22.771],
						[-12.929, 21.327],
						[-16.845, 21.333],
						[-17.063, 21],
						[-17.02, 21.422],
						[-17.003, 21.421],
						[-14.751, 21.501],
						[-14.631, 21.861],
						[-14.221, 22.31],
						[-13.891, 23.691],
						[-12.501, 24.77],
						[-12.031, 26.031],
						[-11.718, 26.104],
						[-11.393, 26.883],
						[-10.551, 26.991],
						[-10.189, 26.861],
						[-9.735, 26.861],
						[-9.413, 27.088],
						[-8.795, 27.121],
						[-8.818, 27.656],
						[-8.666, 27.656]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "加拿大",
					"x": -101.9107,
					"y": 60.324287,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[-122.84, 49],
							[-122.974, 49.003],
							[-124.91, 49.985],
							[-125.625, 50.417],
							[-127.436, 50.831],
							[-127.993, 51.716],
							[-127.85, 52.33],
							[-129.13, 52.755],
							[-129.305, 53.562],
							[-130.515, 54.288],
							[-130.536, 54.803],
							[-130.536, 54.803],
							[-129.98, 55.285],
							[-130.008, 55.916],
							[-131.708, 56.552],
							[-132.73, 57.693],
							[-133.356, 58.41],
							[-134.271, 58.861],
							[-134.945, 59.271],
							[-135.476, 59.788],
							[-136.48, 59.464],
							[-137.452, 58.905],
							[-138.341, 59.562],
							[-139.039, 60],
							[-140.013, 60.277],
							[-140.998, 60.306],
							[-140.993, 66],
							[-140.986, 69.712],
							[-140.986, 69.712],
							[-139.121, 69.471],
							[-137.546, 68.99],
							[-136.504, 68.898],
							[-135.626, 69.315],
							[-134.415, 69.627],
							[-132.929, 69.505],
							[-131.431, 69.945],
							[-129.795, 70.194],
							[-129.108, 69.779],
							[-128.362, 70.013],
							[-128.138, 70.484],
							[-127.447, 70.377],
							[-125.756, 69.481],
							[-124.425, 70.158],
							[-124.29, 69.4],
							[-123.061, 69.564],
							[-122.683, 69.856],
							[-121.472, 69.798],
							[-119.943, 69.378],
							[-117.603, 69.011],
							[-116.226, 68.842],
							[-115.247, 68.906],
							[-113.898, 68.399],
							[-115.305, 67.903],
							[-113.497, 67.688],
							[-110.798, 67.806],
							[-109.946, 67.981],
							[-108.88, 67.381],
							[-107.792, 67.887],
							[-108.813, 68.312],
							[-108.167, 68.654],
							[-106.95, 68.7],
							[-106.15, 68.8],
							[-105.343, 68.561],
							[-104.338, 68.018],
							[-103.221, 68.098],
							[-101.454, 67.647],
							[-99.902, 67.806],
							[-98.443, 67.782],
							[-98.559, 68.404],
							[-97.669, 68.579],
							[-96.12, 68.239],
							[-96.126, 67.293],
							[-95.489, 68.091],
							[-94.685, 68.064],
							[-94.233, 69.069],
							[-95.304, 69.686],
							[-96.471, 70.09],
							[-96.391, 71.195],
							[-95.209, 71.921],
							[-93.89, 71.76],
							[-92.878, 71.319],
							[-91.52, 70.191],
							[-92.407, 69.7],
							[-90.547, 69.498],
							[-90.552, 68.475],
							[-89.215, 69.259],
							[-88.02, 68.615],
							[-88.317, 67.873],
							[-87.35, 67.199],
							[-86.306, 67.921],
							[-85.577, 68.785],
							[-85.522, 69.882],
							[-84.101, 69.805],
							[-82.623, 69.658],
							[-81.28, 69.162],
							[-81.22, 68.666],
							[-81.964, 68.133],
							[-81.259, 67.597],
							[-81.387, 67.111],
							[-83.345, 66.412],
							[-84.735, 66.257],
							[-85.769, 66.558],
							[-86.068, 66.056],
							[-87.031, 65.213],
							[-87.323, 64.776],
							[-88.483, 64.099],
							[-89.914, 64.033],
							[-90.704, 63.61],
							[-90.77, 62.96],
							[-91.933, 62.835],
							[-93.157, 62.025],
							[-94.242, 60.899],
							[-94.629, 60.11],
							[-94.685, 58.949],
							[-93.215, 58.782],
							[-92.765, 57.846],
							[-92.297, 57.087],
							[-90.898, 57.285],
							[-89.04, 56.852],
							[-88.04, 56.472],
							[-87.324, 55.999],
							[-86.071, 55.724],
							[-85.012, 55.303],
							[-83.361, 55.245],
							[-82.273, 55.148],
							[-82.436, 54.282],
							[-82.125, 53.277],
							[-81.401, 52.158],
							[-79.913, 51.208],
							[-79.143, 51.534],
							[-78.602, 52.562],
							[-79.124, 54.141],
							[-79.83, 54.668],
							[-78.229, 55.136],
							[-77.096, 55.837],
							[-76.541, 56.534],
							[-76.623, 57.203],
							[-77.302, 58.052],
							[-78.517, 58.805],
							[-77.337, 59.853],
							[-77.773, 60.758],
							[-78.107, 62.32],
							[-77.411, 62.551],
							[-75.696, 62.278],
							[-74.668, 62.181],
							[-73.84, 62.444],
							[-72.909, 62.105],
							[-71.677, 61.525],
							[-71.374, 61.137],
							[-69.59, 61.061],
							[-69.62, 60.221],
							[-69.288, 58.957],
							[-68.375, 58.801],
							[-67.65, 58.212],
							[-66.202, 58.767],
							[-65.245, 59.871],
							[-64.584, 60.336],
							[-63.805, 59.443],
							[-62.502, 58.167],
							[-61.397, 56.967],
							[-61.799, 56.339],
							[-60.469, 55.775],
							[-59.57, 55.204],
							[-57.975, 54.945],
							[-57.333, 54.627],
							[-56.937, 53.78],
							[-56.158, 53.647],
							[-55.756, 53.27],
							[-55.683, 52.147],
							[-56.409, 51.771],
							[-57.127, 51.42],
							[-58.775, 51.064],
							[-60.033, 50.243],
							[-61.724, 50.08],
							[-63.863, 50.291],
							[-65.363, 50.298],
							[-66.399, 50.229],
							[-67.236, 49.512],
							[-68.511, 49.068],
							[-69.954, 47.745],
							[-71.105, 46.822],
							[-70.255, 46.986],
							[-68.65, 48.3],
							[-66.552, 49.133],
							[-65.056, 49.233],
							[-64.171, 48.742],
							[-65.115, 48.071],
							[-64.799, 46.993],
							[-64.472, 46.238],
							[-63.173, 45.739],
							[-61.521, 45.884],
							[-60.518, 47.008],
							[-60.449, 46.283],
							[-59.803, 45.92],
							[-61.04, 45.265],
							[-63.255, 44.67],
							[-64.247, 44.266],
							[-65.364, 43.545],
							[-66.123, 43.619],
							[-66.162, 44.465],
							[-64.425, 45.292],
							[-66.026, 45.259],
							[-67.137, 45.138],
							[-67.791, 45.703],
							[-67.79, 47.066],
							[-68.234, 47.355],
							[-68.905, 47.185],
							[-69.237, 47.448],
							[-70, 46.693],
							[-70.305, 45.915],
							[-70.66, 45.46],
							[-71.085, 45.305],
							[-71.405, 45.255],
							[-71.505, 45.008],
							[-73.348, 45.007],
							[-74.867, 45],
							[-75.318, 44.816],
							[-76.375, 44.096],
							[-76.5, 44.018],
							[-76.82, 43.629],
							[-77.738, 43.629],
							[-78.72, 43.625],
							[-79.172, 43.466],
							[-79.01, 43.27],
							[-78.92, 42.965],
							[-78.939, 42.864],
							[-80.247, 42.366],
							[-81.278, 42.209],
							[-82.439, 41.675],
							[-82.69, 41.675],
							[-83.03, 41.833],
							[-83.142, 41.976],
							[-83.12, 42.08],
							[-82.9, 42.43],
							[-82.43, 42.98],
							[-82.138, 43.571],
							[-82.338, 44.44],
							[-82.551, 45.348],
							[-83.593, 45.817],
							[-83.47, 45.995],
							[-83.616, 46.117],
							[-83.891, 46.117],
							[-84.092, 46.275],
							[-84.142, 46.512],
							[-84.337, 46.409],
							[-84.605, 46.44],
							[-84.544, 46.539],
							[-84.779, 46.637],
							[-84.876, 46.9],
							[-85.652, 47.22],
							[-86.462, 47.553],
							[-87.44, 47.94],
							[-88.378, 48.303],
							[-89.273, 48.02],
							[-89.6, 48.01],
							[-90.83, 48.27],
							[-91.64, 48.14],
							[-92.61, 48.45],
							[-93.631, 48.609],
							[-94.329, 48.671],
							[-94.64, 48.84],
							[-94.818, 49.389],
							[-95.156, 49.384],
							[-95.159, 49],
							[-97.229, 49.001],
							[-100.65, 49],
							[-104.048, 49],
							[-107.05, 49],
							[-110.05, 49],
							[-113, 49],
							[-116.048, 49],
							[-117.031, 49],
							[-120, 49],
							[-122.84, 49]
						]],
						[[
							[-83.994, 62.453],
							[-83.25, 62.914],
							[-81.877, 62.905],
							[-81.898, 62.711],
							[-83.069, 62.159],
							[-83.775, 62.182],
							[-83.994, 62.453]
						]],
						[[
							[-79.776, 72.803],
							[-80.876, 73.333],
							[-80.834, 73.693],
							[-80.353, 73.76],
							[-78.064, 73.652],
							[-76.34, 73.103],
							[-76.251, 72.826],
							[-77.314, 72.856],
							[-78.392, 72.877],
							[-79.486, 72.742],
							[-79.776, 72.803]
						]],
						[[
							[-80.315, 62.086],
							[-79.929, 62.386],
							[-79.52, 62.364],
							[-79.266, 62.159],
							[-79.658, 61.633],
							[-80.1, 61.718],
							[-80.362, 62.016],
							[-80.315, 62.086]
						]],
						[[
							[-93.613, 74.98],
							[-94.157, 74.592],
							[-95.609, 74.667],
							[-96.821, 74.928],
							[-96.289, 75.378],
							[-94.851, 75.647],
							[-93.978, 75.296],
							[-93.613, 74.98]
						]],
						[[
							[-93.84, 77.52],
							[-94.296, 77.491],
							[-96.17, 77.555],
							[-96.436, 77.835],
							[-94.423, 77.82],
							[-93.721, 77.634],
							[-93.84, 77.52]
						]],
						[[
							[-96.754, 78.766],
							[-95.559, 78.418],
							[-95.83, 78.057],
							[-97.31, 77.851],
							[-98.124, 78.083],
							[-98.553, 78.458],
							[-98.632, 78.872],
							[-97.337, 78.832],
							[-96.754, 78.766]
						]],
						[[
							[-88.15, 74.392],
							[-89.765, 74.516],
							[-92.422, 74.838],
							[-92.768, 75.387],
							[-92.89, 75.883],
							[-93.894, 76.319],
							[-95.962, 76.441],
							[-97.121, 76.751],
							[-96.745, 77.161],
							[-94.684, 77.098],
							[-93.574, 76.776],
							[-91.605, 76.779],
							[-90.742, 76.45],
							[-90.97, 76.074],
							[-89.822, 75.848],
							[-89.187, 75.61],
							[-87.838, 75.566],
							[-86.379, 75.482],
							[-84.79, 75.699],
							[-82.753, 75.784],
							[-81.129, 75.714],
							[-80.058, 75.337],
							[-79.834, 74.923],
							[-80.458, 74.657],
							[-81.949, 74.442],
							[-83.229, 74.564],
							[-86.097, 74.41],
							[-88.15, 74.392]
						]],
						[[
							[-111.264, 78.153],
							[-109.854, 77.996],
							[-110.187, 77.697],
							[-112.051, 77.409],
							[-113.534, 77.732],
							[-112.725, 78.051],
							[-111.264, 78.153]
						]],
						[[
							[-110.964, 78.804],
							[-109.663, 78.602],
							[-110.881, 78.407],
							[-112.542, 78.408],
							[-112.526, 78.551],
							[-111.5, 78.85],
							[-110.964, 78.804]
						]],
						[[
							[-55.6, 51.317],
							[-56.134, 50.687],
							[-56.796, 49.812],
							[-56.143, 50.15],
							[-55.471, 49.936],
							[-55.822, 49.587],
							[-54.935, 49.313],
							[-54.474, 49.557],
							[-53.477, 49.249],
							[-53.786, 48.517],
							[-53.086, 48.688],
							[-52.959, 48.157],
							[-52.648, 47.536],
							[-53.069, 46.655],
							[-53.521, 46.618],
							[-54.179, 46.807],
							[-53.962, 47.625],
							[-54.24, 47.752],
							[-55.401, 46.885],
							[-55.997, 46.92],
							[-55.291, 47.39],
							[-56.251, 47.633],
							[-57.325, 47.573],
							[-59.266, 47.603],
							[-59.419, 47.899],
							[-58.797, 48.252],
							[-59.232, 48.523],
							[-58.392, 49.126],
							[-57.359, 50.718],
							[-56.739, 51.287],
							[-55.871, 51.632],
							[-55.407, 51.588],
							[-55.6, 51.317]
						]],
						[[
							[-83.883, 65.11],
							[-82.788, 64.767],
							[-81.642, 64.455],
							[-81.553, 63.98],
							[-80.817, 64.057],
							[-80.103, 63.726],
							[-80.991, 63.411],
							[-82.547, 63.652],
							[-83.109, 64.102],
							[-84.1, 63.57],
							[-85.523, 63.052],
							[-85.867, 63.637],
							[-87.222, 63.541],
							[-86.353, 64.036],
							[-86.225, 64.823],
							[-85.884, 65.739],
							[-85.161, 65.657],
							[-84.976, 65.218],
							[-84.464, 65.372],
							[-83.883, 65.11]
						]],
						[[
							[-78.771, 72.352],
							[-77.825, 72.75],
							[-75.606, 72.244],
							[-74.229, 71.767],
							[-74.099, 71.331],
							[-72.242, 71.557],
							[-71.2, 70.92],
							[-68.786, 70.525],
							[-67.915, 70.122],
							[-66.969, 69.186],
							[-68.805, 68.72],
							[-66.45, 68.067],
							[-64.862, 67.848],
							[-63.425, 66.928],
							[-61.852, 66.862],
							[-62.163, 66.16],
							[-63.918, 64.999],
							[-65.149, 65.426],
							[-66.721, 66.388],
							[-68.015, 66.263],
							[-68.141, 65.69],
							[-67.09, 65.108],
							[-65.732, 64.648],
							[-65.32, 64.383],
							[-64.669, 63.393],
							[-65.014, 62.674],
							[-66.275, 62.945],
							[-68.783, 63.746],
							[-67.37, 62.884],
							[-66.328, 62.28],
							[-66.166, 61.931],
							[-68.877, 62.33],
							[-71.023, 62.911],
							[-72.235, 63.398],
							[-71.886, 63.68],
							[-73.378, 64.194],
							[-74.834, 64.679],
							[-74.819, 64.389],
							[-77.71, 64.23],
							[-78.556, 64.573],
							[-77.897, 65.309],
							[-76.018, 65.327],
							[-73.96, 65.455],
							[-74.294, 65.812],
							[-73.945, 66.311],
							[-72.651, 67.285],
							[-72.926, 67.727],
							[-73.312, 68.069],
							[-74.843, 68.555],
							[-76.869, 68.895],
							[-76.229, 69.148],
							[-77.287, 69.77],
							[-78.169, 69.826],
							[-78.957, 70.167],
							[-79.492, 69.872],
							[-81.305, 69.743],
							[-84.945, 69.967],
							[-87.06, 70.26],
							[-88.682, 70.411],
							[-89.513, 70.762],
							[-88.468, 71.218],
							[-89.888, 71.223],
							[-90.205, 72.235],
							[-89.437, 73.129],
							[-88.408, 73.538],
							[-85.826, 73.804],
							[-86.562, 73.157],
							[-85.774, 72.534],
							[-84.85, 73.34],
							[-82.316, 73.751],
							[-80.6, 72.717],
							[-80.749, 72.062],
							[-78.771, 72.352]
						]],
						[[
							[-94.504, 74.135],
							[-92.42, 74.1],
							[-90.51, 73.857],
							[-92.004, 72.966],
							[-93.196, 72.772],
							[-94.269, 72.025],
							[-95.41, 72.062],
							[-96.034, 72.94],
							[-96.018, 73.437],
							[-95.496, 73.862],
							[-94.504, 74.135]
						]],
						[[
							[-122.855, 76.117],
							[-122.855, 76.117],
							[-121.158, 76.865],
							[-119.104, 77.512],
							[-117.57, 77.498],
							[-116.199, 77.645],
							[-116.336, 76.877],
							[-117.106, 76.53],
							[-118.04, 76.481],
							[-119.899, 76.053],
							[-121.5, 75.9],
							[-122.855, 76.117]
						]],
						[[
							[-132.71, 54.04],
							[-131.75, 54.12],
							[-132.049, 52.985],
							[-131.179, 52.18],
							[-131.578, 52.182],
							[-132.18, 52.64],
							[-132.55, 53.1],
							[-133.055, 53.411],
							[-133.24, 53.851],
							[-133.18, 54.17],
							[-132.71, 54.04]
						]],
						[[
							[-105.492, 79.302],
							[-103.529, 79.165],
							[-100.825, 78.8],
							[-100.06, 78.325],
							[-99.671, 77.908],
							[-101.304, 78.019],
							[-102.95, 78.343],
							[-105.176, 78.38],
							[-104.21, 78.677],
							[-105.42, 78.918],
							[-105.492, 79.302]
						]],
						[[
							[-123.51, 48.51],
							[-124.013, 48.371],
							[-125.655, 48.825],
							[-125.955, 49.18],
							[-126.85, 49.53],
							[-127.03, 49.815],
							[-128.059, 49.995],
							[-128.445, 50.539],
							[-128.358, 50.771],
							[-127.309, 50.553],
							[-126.695, 50.401],
							[-125.755, 50.295],
							[-125.415, 49.95],
							[-124.921, 49.475],
							[-123.923, 49.062],
							[-123.51, 48.51]
						]],
						[[
							[-121.538, 74.449],
							[-120.11, 74.241],
							[-117.556, 74.186],
							[-116.584, 73.896],
							[-115.511, 73.475],
							[-116.768, 73.223],
							[-119.22, 72.52],
							[-120.46, 71.82],
							[-120.46, 71.384],
							[-123.092, 70.902],
							[-123.62, 71.34],
							[-125.929, 71.869],
							[-125.5, 72.292],
							[-124.807, 73.023],
							[-123.94, 73.68],
							[-124.918, 74.293],
							[-121.538, 74.449]
						]],
						[[
							[-107.819, 75.846],
							[-106.929, 76.013],
							[-105.881, 75.969],
							[-105.705, 75.48],
							[-106.313, 75.005],
							[-109.7, 74.85],
							[-112.223, 74.417],
							[-113.744, 74.394],
							[-113.871, 74.72],
							[-111.794, 75.162],
							[-116.312, 75.043],
							[-117.71, 75.222],
							[-116.346, 76.199],
							[-115.405, 76.479],
							[-112.591, 76.141],
							[-110.814, 75.549],
							[-109.067, 75.473],
							[-110.497, 76.43],
							[-109.581, 76.794],
							[-108.549, 76.678],
							[-108.211, 76.202],
							[-107.819, 75.846]
						]],
						[[
							[-106.523, 73.076],
							[-105.402, 72.673],
							[-104.775, 71.698],
							[-104.465, 70.993],
							[-102.785, 70.498],
							[-100.981, 70.024],
							[-101.089, 69.584],
							[-102.731, 69.504],
							[-102.093, 69.12],
							[-102.43, 68.753],
							[-104.24, 68.91],
							[-105.96, 69.18],
							[-107.123, 69.119],
							[-109, 68.78],
							[-111.534, 68.63],
							[-113.313, 68.536],
							[-113.855, 69.007],
							[-115.22, 69.28],
							[-116.108, 69.168],
							[-117.34, 69.96],
							[-116.675, 70.067],
							[-115.131, 70.237],
							[-113.721, 70.192],
							[-112.416, 70.366],
							[-114.35, 70.6],
							[-116.487, 70.52],
							[-117.905, 70.541],
							[-118.432, 70.909],
							[-116.113, 71.309],
							[-117.656, 71.295],
							[-119.402, 71.559],
							[-118.563, 72.308],
							[-117.866, 72.706],
							[-115.189, 73.315],
							[-114.167, 73.121],
							[-114.666, 72.653],
							[-112.441, 72.955],
							[-111.05, 72.45],
							[-109.92, 72.961],
							[-109.007, 72.633],
							[-108.188, 71.651],
							[-107.686, 72.065],
							[-108.396, 73.09],
							[-107.516, 73.236],
							[-106.523, 73.076]
						]],
						[[
							[-100.438, 72.706],
							[-101.54, 73.36],
							[-100.356, 73.844],
							[-99.164, 73.633],
							[-97.38, 73.76],
							[-97.12, 73.47],
							[-98.054, 72.991],
							[-96.54, 72.56],
							[-96.72, 71.66],
							[-98.36, 71.273],
							[-99.323, 71.356],
							[-100.015, 71.738],
							[-102.5, 72.51],
							[-102.48, 72.83],
							[-100.438, 72.706]
						]],
						[[
							[-106.6, 73.6],
							[-105.26, 73.64],
							[-104.5, 73.42],
							[-105.38, 72.76],
							[-106.94, 73.46],
							[-106.6, 73.6]
						]],
						[[
							[-98.5, 76.72],
							[-97.736, 76.257],
							[-97.704, 75.743],
							[-98.16, 75],
							[-99.809, 74.897],
							[-100.884, 75.057],
							[-100.863, 75.641],
							[-102.502, 75.564],
							[-102.566, 76.337],
							[-101.49, 76.305],
							[-99.983, 76.646],
							[-98.577, 76.589],
							[-98.5, 76.72]
						]],
						[[
							[-96.016, 80.602],
							[-95.323, 80.907],
							[-94.298, 80.977],
							[-94.735, 81.206],
							[-92.41, 81.257],
							[-91.133, 80.723],
							[-89.45, 80.509],
							[-87.81, 80.32],
							[-87.02, 79.66],
							[-85.814, 79.337],
							[-87.188, 79.039],
							[-89.035, 78.287],
							[-90.804, 78.215],
							[-92.877, 78.343],
							[-93.951, 78.751],
							[-93.936, 79.114],
							[-93.145, 79.38],
							[-94.974, 79.372],
							[-96.076, 79.705],
							[-96.71, 80.158],
							[-96.016, 80.602]
						]],
						[[
							[-91.587, 81.894],
							[-90.1, 82.085],
							[-88.932, 82.118],
							[-86.97, 82.28],
							[-85.5, 82.652],
							[-84.26, 82.6],
							[-83.18, 82.32],
							[-82.42, 82.86],
							[-81.1, 83.02],
							[-79.307, 83.131],
							[-76.25, 83.172],
							[-75.719, 83.064],
							[-72.832, 83.233],
							[-70.666, 83.17],
							[-68.5, 83.106],
							[-65.827, 83.028],
							[-63.68, 82.9],
							[-61.85, 82.629],
							[-61.894, 82.362],
							[-64.334, 81.928],
							[-66.753, 81.725],
							[-67.658, 81.501],
							[-65.48, 81.507],
							[-67.84, 80.9],
							[-69.47, 80.617],
							[-71.18, 79.8],
							[-73.243, 79.634],
							[-73.88, 79.43],
							[-76.908, 79.323],
							[-75.529, 79.198],
							[-76.22, 79.019],
							[-75.393, 78.526],
							[-76.344, 78.183],
							[-77.889, 77.9],
							[-78.363, 77.509],
							[-79.76, 77.21],
							[-79.62, 76.983],
							[-77.911, 77.022],
							[-77.889, 76.778],
							[-80.561, 76.178],
							[-83.174, 76.454],
							[-86.112, 76.299],
							[-87.6, 76.42],
							[-89.491, 76.472],
							[-89.616, 76.952],
							[-87.767, 77.178],
							[-88.26, 77.9],
							[-87.65, 77.97],
							[-84.976, 77.539],
							[-86.34, 78.18],
							[-87.962, 78.372],
							[-87.152, 78.759],
							[-85.379, 78.997],
							[-85.095, 79.345],
							[-86.507, 79.736],
							[-86.932, 80.251],
							[-84.198, 80.208],
							[-83.409, 80.1],
							[-81.848, 80.464],
							[-84.1, 80.58],
							[-87.599, 80.516],
							[-89.367, 80.856],
							[-90.2, 81.26],
							[-91.368, 81.553],
							[-91.587, 81.894]
						]],
						[[
							[-75.216, 67.444],
							[-75.866, 67.149],
							[-76.987, 67.099],
							[-77.236, 67.588],
							[-76.812, 68.149],
							[-75.895, 68.287],
							[-75.115, 68.01],
							[-75.103, 67.582],
							[-75.216, 67.444]
						]],
						[[
							[-96.257, 69.49],
							[-95.648, 69.108],
							[-96.27, 68.757],
							[-97.617, 69.06],
							[-98.432, 68.951],
							[-99.797, 69.4],
							[-98.917, 69.71],
							[-98.218, 70.144],
							[-97.157, 69.86],
							[-96.557, 69.68],
							[-96.257, 69.49]
						]],
						[[
							[-64.519, 49.873],
							[-64.173, 49.957],
							[-62.858, 49.706],
							[-61.836, 49.289],
							[-61.806, 49.105],
							[-62.293, 49.087],
							[-63.589, 49.401],
							[-64.519, 49.873]
						]],
						[[
							[-64.015, 47.036],
							[-63.664, 46.55],
							[-62.939, 46.416],
							[-62.012, 46.443],
							[-62.504, 46.033],
							[-62.874, 45.968],
							[-64.143, 46.393],
							[-64.393, 46.727],
							[-64.015, 47.036]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "美国",
					"x": -97.482602,
					"y": 39.538479,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[-122.84, 49],
							[-120, 49],
							[-117.031, 49],
							[-116.048, 49],
							[-113, 49],
							[-110.05, 49],
							[-107.05, 49],
							[-104.048, 49],
							[-100.65, 49],
							[-97.229, 49.001],
							[-95.159, 49],
							[-95.156, 49.384],
							[-94.818, 49.389],
							[-94.64, 48.84],
							[-94.329, 48.671],
							[-93.631, 48.609],
							[-92.61, 48.45],
							[-91.64, 48.14],
							[-90.83, 48.27],
							[-89.6, 48.01],
							[-89.273, 48.02],
							[-88.378, 48.303],
							[-87.44, 47.94],
							[-86.462, 47.553],
							[-85.652, 47.22],
							[-84.876, 46.9],
							[-84.779, 46.637],
							[-84.544, 46.539],
							[-84.605, 46.44],
							[-84.337, 46.409],
							[-84.142, 46.512],
							[-84.092, 46.275],
							[-83.891, 46.117],
							[-83.616, 46.117],
							[-83.47, 45.995],
							[-83.593, 45.817],
							[-82.551, 45.348],
							[-82.338, 44.44],
							[-82.138, 43.571],
							[-82.43, 42.98],
							[-82.9, 42.43],
							[-83.12, 42.08],
							[-83.142, 41.976],
							[-83.03, 41.833],
							[-82.69, 41.675],
							[-82.439, 41.675],
							[-81.278, 42.209],
							[-80.247, 42.366],
							[-78.939, 42.864],
							[-78.92, 42.965],
							[-79.01, 43.27],
							[-79.172, 43.466],
							[-78.72, 43.625],
							[-77.738, 43.629],
							[-76.82, 43.629],
							[-76.5, 44.018],
							[-76.375, 44.096],
							[-75.318, 44.816],
							[-74.867, 45],
							[-73.348, 45.007],
							[-71.505, 45.008],
							[-71.405, 45.255],
							[-71.085, 45.305],
							[-70.66, 45.46],
							[-70.305, 45.915],
							[-70, 46.693],
							[-69.237, 47.448],
							[-68.905, 47.185],
							[-68.234, 47.355],
							[-67.79, 47.066],
							[-67.791, 45.703],
							[-67.137, 45.138],
							[-66.965, 44.81],
							[-68.033, 44.325],
							[-69.06, 43.98],
							[-70.116, 43.684],
							[-70.645, 43.09],
							[-70.815, 42.865],
							[-70.825, 42.335],
							[-70.495, 41.805],
							[-70.08, 41.78],
							[-70.185, 42.145],
							[-69.885, 41.923],
							[-69.965, 41.637],
							[-70.64, 41.475],
							[-71.12, 41.494],
							[-71.86, 41.32],
							[-72.295, 41.27],
							[-72.876, 41.221],
							[-73.71, 40.931],
							[-72.241, 41.119],
							[-71.945, 40.93],
							[-73.345, 40.63],
							[-73.982, 40.628],
							[-73.952, 40.751],
							[-74.257, 40.474],
							[-73.962, 40.428],
							[-74.178, 39.709],
							[-74.906, 38.94],
							[-74.98, 39.196],
							[-75.2, 39.248],
							[-75.528, 39.498],
							[-75.32, 38.96],
							[-75.072, 38.782],
							[-75.057, 38.404],
							[-75.377, 38.016],
							[-75.94, 37.217],
							[-76.031, 37.257],
							[-75.722, 37.937],
							[-76.233, 38.319],
							[-76.35, 39.15],
							[-76.543, 38.718],
							[-76.329, 38.083],
							[-76.99, 38.24],
							[-76.302, 37.918],
							[-76.259, 36.966],
							[-75.972, 36.897],
							[-75.868, 36.551],
							[-75.727, 35.551],
							[-76.363, 34.809],
							[-77.398, 34.512],
							[-78.055, 33.925],
							[-78.554, 33.861],
							[-79.061, 33.494],
							[-79.204, 33.158],
							[-80.301, 32.509],
							[-80.865, 32.033],
							[-81.336, 31.44],
							[-81.49, 30.73],
							[-81.314, 30.036],
							[-80.98, 29.18],
							[-80.536, 28.472],
							[-80.53, 28.04],
							[-80.057, 26.88],
							[-80.088, 26.206],
							[-80.132, 25.817],
							[-80.381, 25.206],
							[-80.68, 25.08],
							[-81.172, 25.201],
							[-81.33, 25.64],
							[-81.71, 25.87],
							[-82.24, 26.73],
							[-82.705, 27.495],
							[-82.855, 27.886],
							[-82.65, 28.55],
							[-82.93, 29.1],
							[-83.71, 29.937],
							[-84.1, 30.09],
							[-85.109, 29.636],
							[-85.288, 29.686],
							[-85.773, 30.153],
							[-86.4, 30.4],
							[-87.53, 30.274],
							[-88.418, 30.385],
							[-89.18, 30.316],
							[-89.594, 30.16],
							[-89.414, 29.894],
							[-89.43, 29.489],
							[-89.218, 29.291],
							[-89.408, 29.16],
							[-89.779, 29.307],
							[-90.155, 29.117],
							[-90.88, 29.149],
							[-91.627, 29.677],
							[-92.499, 29.552],
							[-93.226, 29.784],
							[-93.848, 29.714],
							[-94.69, 29.48],
							[-95.6, 28.739],
							[-96.594, 28.307],
							[-97.14, 27.83],
							[-97.37, 27.38],
							[-97.38, 26.69],
							[-97.33, 26.21],
							[-97.14, 25.87],
							[-97.53, 25.84],
							[-98.24, 26.06],
							[-99.02, 26.37],
							[-99.3, 26.84],
							[-99.52, 27.54],
							[-100.11, 28.11],
							[-100.456, 28.696],
							[-100.958, 29.381],
							[-101.662, 29.779],
							[-102.48, 29.76],
							[-103.11, 28.97],
							[-103.94, 29.27],
							[-104.457, 29.572],
							[-104.706, 30.122],
							[-105.037, 30.644],
							[-105.632, 31.084],
							[-106.143, 31.4],
							[-106.508, 31.755],
							[-108.24, 31.755],
							[-108.242, 31.342],
							[-109.035, 31.342],
							[-111.024, 31.335],
							[-113.305, 32.039],
							[-114.815, 32.525],
							[-114.721, 32.721],
							[-115.991, 32.612],
							[-117.128, 32.535],
							[-117.296, 33.046],
							[-117.944, 33.621],
							[-118.411, 33.741],
							[-118.52, 34.028],
							[-119.081, 34.078],
							[-119.439, 34.348],
							[-120.368, 34.447],
							[-120.623, 34.609],
							[-120.744, 35.157],
							[-121.715, 36.162],
							[-122.547, 37.552],
							[-122.512, 37.783],
							[-122.953, 38.114],
							[-123.727, 38.952],
							[-123.865, 39.767],
							[-124.398, 40.313],
							[-124.179, 41.142],
							[-124.214, 42],
							[-124.533, 42.766],
							[-124.142, 43.708],
							[-124.021, 44.616],
							[-123.899, 45.523],
							[-124.08, 46.865],
							[-124.396, 47.72],
							[-124.687, 48.184],
							[-124.566, 48.38],
							[-123.12, 48.04],
							[-122.587, 47.096],
							[-122.34, 47.36],
							[-122.5, 48.18],
							[-122.84, 49]
						]],
						[[
							[-155.402, 20.08],
							[-155.225, 19.993],
							[-155.062, 19.859],
							[-154.807, 19.509],
							[-154.831, 19.453],
							[-155.222, 19.24],
							[-155.542, 19.083],
							[-155.688, 18.916],
							[-155.937, 19.059],
							[-155.908, 19.339],
							[-156.073, 19.703],
							[-156.024, 19.814],
							[-155.85, 19.977],
							[-155.919, 20.174],
							[-155.861, 20.267],
							[-155.785, 20.249],
							[-155.402, 20.08]
						]],
						[[
							[-155.996, 20.764],
							[-156.079, 20.644],
							[-156.414, 20.572],
							[-156.587, 20.783],
							[-156.702, 20.864],
							[-156.711, 20.927],
							[-156.613, 21.012],
							[-156.257, 20.917],
							[-155.996, 20.764]
						]],
						[[
							[-156.758, 21.177],
							[-156.789, 21.069],
							[-157.325, 21.098],
							[-157.25, 21.22],
							[-156.758, 21.177]
						]],
						[[
							[-158.025, 21.717],
							[-157.942, 21.653],
							[-157.653, 21.322],
							[-157.707, 21.264],
							[-157.779, 21.277],
							[-158.127, 21.312],
							[-158.254, 21.539],
							[-158.293, 21.579],
							[-158.025, 21.717]
						]],
						[[
							[-159.366, 22.215],
							[-159.345, 21.982],
							[-159.464, 21.883],
							[-159.801, 22.065],
							[-159.749, 22.138],
							[-159.596, 22.236],
							[-159.366, 22.215]
						]],
						[[
							[-166.468, 60.384],
							[-165.674, 60.294],
							[-165.579, 59.91],
							[-166.193, 59.754],
							[-166.848, 59.941],
							[-167.455, 60.213],
							[-166.468, 60.384]
						]],
						[[
							[-153.229, 57.969],
							[-152.565, 57.901],
							[-152.141, 57.591],
							[-153.006, 57.116],
							[-154.005, 56.735],
							[-154.516, 56.993],
							[-154.671, 57.461],
							[-153.763, 57.817],
							[-153.229, 57.969]
						]],
						[[
							[-140.986, 69.712],
							[-140.986, 69.712],
							[-140.993, 66],
							[-140.998, 60.306],
							[-140.013, 60.277],
							[-139.039, 60],
							[-138.341, 59.562],
							[-137.452, 58.905],
							[-136.48, 59.464],
							[-135.476, 59.788],
							[-134.945, 59.271],
							[-134.271, 58.861],
							[-133.356, 58.41],
							[-132.73, 57.693],
							[-131.708, 56.552],
							[-130.008, 55.916],
							[-129.98, 55.285],
							[-130.536, 54.803],
							[-130.536, 54.803],
							[-130.536, 54.803],
							[-131.086, 55.179],
							[-131.967, 55.498],
							[-132.25, 56.37],
							[-133.539, 57.179],
							[-134.078, 58.123],
							[-135.038, 58.188],
							[-136.628, 58.212],
							[-137.8, 58.5],
							[-139.868, 59.538],
							[-140.825, 59.728],
							[-142.574, 60.084],
							[-143.959, 59.999],
							[-145.926, 60.459],
							[-147.114, 60.885],
							[-148.224, 60.673],
							[-148.018, 59.978],
							[-148.571, 59.914],
							[-149.728, 59.706],
							[-150.608, 59.368],
							[-151.716, 59.156],
							[-151.859, 59.745],
							[-151.41, 60.726],
							[-150.347, 61.034],
							[-150.621, 61.284],
							[-151.896, 60.727],
							[-152.578, 60.062],
							[-154.019, 59.35],
							[-153.288, 58.865],
							[-154.232, 58.146],
							[-155.307, 57.728],
							[-156.308, 57.423],
							[-156.556, 56.98],
							[-158.117, 56.464],
							[-158.433, 55.994],
							[-159.603, 55.567],
							[-160.29, 55.644],
							[-161.223, 55.365],
							[-162.238, 55.024],
							[-163.069, 54.69],
							[-164.786, 54.404],
							[-164.942, 54.572],
							[-163.848, 55.039],
							[-162.87, 55.348],
							[-161.804, 55.895],
							[-160.564, 56.008],
							[-160.071, 56.418],
							[-158.684, 57.017],
							[-158.461, 57.217],
							[-157.723, 57.57],
							[-157.55, 58.328],
							[-157.042, 58.919],
							[-158.195, 58.616],
							[-158.517, 58.788],
							[-159.059, 58.424],
							[-159.712, 58.931],
							[-159.981, 58.573],
							[-160.355, 59.071],
							[-161.355, 58.671],
							[-161.969, 58.672],
							[-162.055, 59.267],
							[-161.874, 59.634],
							[-162.518, 59.99],
							[-163.818, 59.798],
							[-164.662, 60.267],
							[-165.346, 60.507],
							[-165.351, 61.074],
							[-166.121, 61.5],
							[-165.734, 62.075],
							[-164.919, 62.633],
							[-164.563, 63.146],
							[-163.753, 63.219],
							[-163.067, 63.059],
							[-162.261, 63.542],
							[-161.534, 63.456],
							[-160.773, 63.766],
							[-160.958, 64.223],
							[-161.518, 64.403],
							[-160.778, 64.789],
							[-161.392, 64.777],
							[-162.453, 64.559],
							[-162.758, 64.339],
							[-163.546, 64.559],
							[-164.961, 64.447],
							[-166.425, 64.687],
							[-166.845, 65.089],
							[-168.111, 65.67],
							[-166.705, 66.088],
							[-164.475, 66.577],
							[-163.653, 66.577],
							[-163.789, 66.077],
							[-161.678, 66.116],
							[-162.49, 66.736],
							[-163.72, 67.116],
							[-164.431, 67.616],
							[-165.39, 68.043],
							[-166.764, 68.359],
							[-166.205, 68.883],
							[-164.431, 68.916],
							[-163.169, 69.371],
							[-162.931, 69.858],
							[-161.909, 70.333],
							[-160.935, 70.448],
							[-159.039, 70.892],
							[-158.12, 70.825],
							[-156.581, 71.358],
							[-155.068, 71.148],
							[-154.344, 70.696],
							[-153.9, 70.89],
							[-152.21, 70.83],
							[-152.27, 70.6],
							[-150.74, 70.43],
							[-149.72, 70.53],
							[-147.613, 70.214],
							[-145.69, 70.12],
							[-144.92, 69.99],
							[-143.589, 70.153],
							[-142.073, 69.852],
							[-140.986, 69.712],
							[-140.986, 69.712]
						]],
						[[
							[-171.732, 63.783],
							[-171.114, 63.592],
							[-170.491, 63.695],
							[-169.683, 63.431],
							[-168.689, 63.298],
							[-168.772, 63.189],
							[-169.529, 62.977],
							[-170.291, 63.194],
							[-170.671, 63.376],
							[-171.553, 63.318],
							[-171.791, 63.406],
							[-171.732, 63.783]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "哈萨克斯坦",
					"x": 68.685548,
					"y": 49.054149,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[87.36, 49.215],
						[86.599, 48.549],
						[85.768, 48.456],
						[85.72, 47.453],
						[85.164, 47.001],
						[83.18, 47.33],
						[82.459, 45.54],
						[81.947, 45.317],
						[79.966, 44.918],
						[80.866, 43.18],
						[80.18, 42.92],
						[80.26, 42.35],
						[79.644, 42.497],
						[79.142, 42.856],
						[77.658, 42.961],
						[76, 42.988],
						[75.637, 42.878],
						[74.213, 43.298],
						[73.645, 43.091],
						[73.49, 42.501],
						[71.845, 42.845],
						[71.186, 42.704],
						[70.962, 42.266],
						[70.389, 42.081],
						[69.07, 41.384],
						[68.632, 40.669],
						[68.26, 40.662],
						[67.986, 41.136],
						[66.714, 41.168],
						[66.511, 41.988],
						[66.023, 41.995],
						[66.098, 42.998],
						[64.901, 43.728],
						[63.186, 43.65],
						[62.013, 43.504],
						[61.058, 44.406],
						[60.24, 44.784],
						[58.69, 45.5],
						[58.503, 45.587],
						[55.929, 44.996],
						[55.968, 41.309],
						[55.455, 41.26],
						[54.755, 42.044],
						[54.079, 42.324],
						[52.944, 42.116],
						[52.502, 41.783],
						[52.446, 42.027],
						[52.692, 42.444],
						[52.501, 42.792],
						[51.342, 43.133],
						[50.891, 44.031],
						[50.339, 44.284],
						[50.306, 44.61],
						[51.279, 44.515],
						[51.317, 45.246],
						[52.167, 45.408],
						[53.041, 45.259],
						[53.221, 46.235],
						[53.043, 46.853],
						[52.042, 46.805],
						[51.192, 47.049],
						[50.034, 46.609],
						[49.101, 46.399],
						[48.593, 46.561],
						[48.695, 47.076],
						[48.057, 47.744],
						[47.315, 47.716],
						[46.466, 48.394],
						[47.044, 49.152],
						[46.752, 49.356],
						[47.549, 50.455],
						[48.578, 49.875],
						[48.702, 50.605],
						[50.767, 51.693],
						[52.329, 51.719],
						[54.533, 51.026],
						[55.717, 50.622],
						[56.778, 51.044],
						[58.363, 51.064],
						[59.642, 50.545],
						[59.933, 50.842],
						[61.337, 50.799],
						[61.588, 51.273],
						[59.968, 51.96],
						[60.927, 52.448],
						[60.74, 52.72],
						[61.7, 52.98],
						[60.978, 53.665],
						[61.437, 54.006],
						[65.179, 54.354],
						[65.667, 54.601],
						[68.169, 54.97],
						[69.068, 55.385],
						[70.865, 55.17],
						[71.18, 54.133],
						[72.224, 54.377],
						[73.509, 54.036],
						[73.426, 53.49],
						[74.385, 53.547],
						[76.891, 54.491],
						[76.525, 54.177],
						[77.801, 53.404],
						[80.036, 50.865],
						[80.568, 51.388],
						[81.946, 50.812],
						[83.383, 51.069],
						[83.935, 50.889],
						[84.416, 50.311],
						[85.116, 50.117],
						[85.541, 49.693],
						[86.829, 49.827],
						[87.36, 49.215]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "乌兹别克斯坦",
					"x": 64.005429,
					"y": 41.693603,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[55.968, 41.309],
						[55.929, 44.996],
						[58.503, 45.587],
						[58.69, 45.5],
						[60.24, 44.784],
						[61.058, 44.406],
						[62.013, 43.504],
						[63.186, 43.65],
						[64.901, 43.728],
						[66.098, 42.998],
						[66.023, 41.995],
						[66.511, 41.988],
						[66.714, 41.168],
						[67.986, 41.136],
						[68.26, 40.662],
						[68.632, 40.669],
						[69.07, 41.384],
						[70.389, 42.081],
						[70.962, 42.266],
						[71.259, 42.168],
						[70.42, 41.52],
						[71.158, 41.144],
						[71.87, 41.393],
						[73.055, 40.866],
						[71.775, 40.146],
						[71.014, 40.244],
						[70.601, 40.219],
						[70.458, 40.496],
						[70.667, 40.96],
						[69.329, 40.728],
						[69.012, 40.086],
						[68.536, 39.533],
						[67.701, 39.58],
						[67.442, 39.14],
						[68.176, 38.902],
						[68.392, 38.157],
						[67.83, 37.145],
						[67.076, 37.356],
						[66.519, 37.363],
						[66.546, 37.975],
						[65.216, 38.403],
						[64.17, 38.892],
						[63.518, 39.363],
						[62.374, 40.054],
						[61.883, 41.085],
						[61.547, 41.266],
						[60.466, 41.22],
						[60.083, 41.425],
						[59.976, 42.223],
						[58.629, 42.752],
						[57.787, 42.171],
						[56.932, 41.826],
						[57.096, 41.322],
						[55.968, 41.309]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "巴布亚新几内亚",
					"x": 143.910216,
					"y": -5.695285,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[141, -2.6],
							[142.735, -3.289],
							[144.584, -3.861],
							[145.273, -4.374],
							[145.83, -4.876],
							[145.982, -5.466],
							[147.648, -6.084],
							[147.891, -6.614],
							[146.971, -6.722],
							[147.192, -7.388],
							[148.085, -8.044],
							[148.734, -9.105],
							[149.307, -9.071],
							[149.267, -9.514],
							[150.039, -9.684],
							[149.739, -9.873],
							[150.802, -10.294],
							[150.691, -10.583],
							[150.028, -10.652],
							[149.782, -10.393],
							[148.923, -10.281],
							[147.913, -10.13],
							[147.135, -9.492],
							[146.568, -8.943],
							[146.048, -8.067],
							[144.744, -7.63],
							[143.897, -7.915],
							[143.286, -8.245],
							[143.414, -8.983],
							[142.628, -9.327],
							[142.068, -9.16],
							[141.034, -9.118],
							[141.017, -5.859],
							[141, -2.6]
						]],
						[[
							[152.64, -3.66],
							[153.02, -3.98],
							[153.14, -4.5],
							[152.827, -4.766],
							[152.639, -4.176],
							[152.406, -3.79],
							[151.953, -3.462],
							[151.384, -3.035],
							[150.662, -2.741],
							[150.94, -2.5],
							[151.48, -2.78],
							[151.82, -3],
							[152.24, -3.24],
							[152.64, -3.66]
						]],
						[[
							[151.301, -5.841],
							[150.754, -6.084],
							[150.241, -6.318],
							[149.71, -6.317],
							[148.89, -6.026],
							[148.319, -5.747],
							[148.402, -5.438],
							[149.298, -5.584],
							[149.846, -5.506],
							[149.996, -5.026],
							[150.14, -5.001],
							[150.237, -5.532],
							[150.807, -5.456],
							[151.09, -5.114],
							[151.648, -4.757],
							[151.538, -4.168],
							[152.137, -4.149],
							[152.339, -4.313],
							[152.319, -4.868],
							[151.983, -5.478],
							[151.459, -5.56],
							[151.301, -5.841]
						]],
						[[
							[154.76, -5.34],
							[155.063, -5.567],
							[155.548, -6.201],
							[156.02, -6.54],
							[155.88, -6.82],
							[155.6, -6.92],
							[155.167, -6.536],
							[154.729, -5.901],
							[154.514, -5.139],
							[154.653, -5.042],
							[154.76, -5.34]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "印度尼西亚",
					"x": 101.892949,
					"y": -.954404,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[141, -2.6],
							[141.017, -5.859],
							[141.034, -9.118],
							[140.143, -8.297],
							[139.128, -8.096],
							[138.881, -8.381],
							[137.614, -8.412],
							[138.039, -7.598],
							[138.669, -7.32],
							[138.408, -6.233],
							[137.928, -5.393],
							[135.989, -4.547],
							[135.165, -4.463],
							[133.663, -3.539],
							[133.368, -4.025],
							[132.984, -4.113],
							[132.757, -3.746],
							[132.754, -3.312],
							[131.99, -2.821],
							[133.067, -2.46],
							[133.78, -2.48],
							[133.696, -2.215],
							[132.232, -2.213],
							[131.836, -1.617],
							[130.943, -1.433],
							[130.52, -.938],
							[131.868, -.695],
							[132.38, -.37],
							[133.986, -.78],
							[134.143, -1.152],
							[134.423, -2.769],
							[135.458, -3.368],
							[136.293, -2.307],
							[137.441, -1.704],
							[138.33, -1.703],
							[139.185, -2.051],
							[139.927, -2.409],
							[141, -2.6]
						]],
						[[
							[124.969, -8.893],
							[125.07, -9.09],
							[125.089, -9.393],
							[124.436, -10.14],
							[123.58, -10.36],
							[123.46, -10.24],
							[123.55, -9.9],
							[123.98, -9.29],
							[124.969, -8.893]
						]],
						[[
							[134.21, -6.895],
							[134.113, -6.142],
							[134.29, -5.783],
							[134.5, -5.445],
							[134.727, -5.738],
							[134.725, -6.214],
							[134.21, -6.895]
						]],
						[[
							[117.882, 4.138],
							[117.313, 3.234],
							[118.048, 2.288],
							[117.876, 1.828],
							[118.997, .902],
							[117.812, .784],
							[117.478, .102],
							[117.522, -.804],
							[116.56, -1.488],
							[116.534, -2.484],
							[116.148, -4.013],
							[116.001, -3.657],
							[114.865, -4.107],
							[114.469, -3.496],
							[113.756, -3.439],
							[113.257, -3.119],
							[112.068, -3.478],
							[111.703, -2.994],
							[111.048, -3.049],
							[110.224, -2.934],
							[110.071, -1.593],
							[109.572, -1.315],
							[109.092, -.46],
							[108.953, .415],
							[109.069, 1.342],
							[109.663, 2.006],
							[109.83, 1.338],
							[110.514, .773],
							[111.159, .976],
							[111.798, .904],
							[112.38, 1.41],
							[112.86, 1.498],
							[113.806, 1.218],
							[114.621, 1.431],
							[115.134, 2.821],
							[115.519, 3.169],
							[115.866, 4.307],
							[117.015, 4.306],
							[117.882, 4.138]
						]],
						[[
							[129.371, -2.802],
							[130.471, -3.094],
							[130.835, -3.858],
							[129.991, -3.446],
							[129.155, -3.363],
							[128.591, -3.429],
							[127.899, -3.393],
							[128.136, -2.844],
							[129.371, -2.802]
						]],
						[[
							[126.875, -3.791],
							[126.184, -3.607],
							[125.989, -3.177],
							[127.001, -3.129],
							[127.249, -3.459],
							[126.875, -3.791]
						]],
						[[
							[127.932, 2.175],
							[128.004, 1.629],
							[128.595, 1.541],
							[128.688, 1.132],
							[128.636, .258],
							[128.12, .356],
							[127.968, -.252],
							[128.38, -.78],
							[128.1, -.9],
							[127.696, -.267],
							[127.399, 1.012],
							[127.601, 1.811],
							[127.932, 2.175]
						]],
						[[
							[122.928, .875],
							[124.078, .917],
							[125.066, 1.643],
							[125.241, 1.42],
							[124.437, .428],
							[123.686, .236],
							[122.723, .431],
							[121.057, .381],
							[120.183, .237],
							[120.041, -.52],
							[120.936, -1.409],
							[121.476, -.956],
							[123.341, -.616],
							[123.258, -1.076],
							[122.823, -.931],
							[122.389, -1.517],
							[121.508, -1.904],
							[122.455, -3.186],
							[122.272, -3.53],
							[123.171, -4.684],
							[123.162, -5.341],
							[122.629, -5.635],
							[122.236, -5.283],
							[122.72, -4.464],
							[121.738, -4.851],
							[121.489, -4.575],
							[121.619, -4.188],
							[120.898, -3.602],
							[120.972, -2.628],
							[120.305, -2.932],
							[120.39, -4.098],
							[120.431, -5.528],
							[119.797, -5.673],
							[119.367, -5.38],
							[119.654, -4.459],
							[119.499, -3.494],
							[119.078, -3.487],
							[118.768, -2.802],
							[119.181, -2.147],
							[119.323, -1.353],
							[119.826, .154],
							[120.036, .566],
							[120.886, 1.309],
							[121.667, 1.014],
							[122.928, .875]
						]],
						[[
							[120.295, -10.259],
							[118.968, -9.558],
							[119.9, -9.361],
							[120.426, -9.666],
							[120.776, -9.97],
							[120.716, -10.24],
							[120.295, -10.259]
						]],
						[[
							[121.342, -8.537],
							[122.007, -8.461],
							[122.904, -8.094],
							[122.757, -8.65],
							[121.254, -8.934],
							[119.924, -8.81],
							[119.921, -8.445],
							[120.715, -8.237],
							[121.342, -8.537]
						]],
						[[
							[118.261, -8.362],
							[118.878, -8.281],
							[119.127, -8.706],
							[117.97, -8.907],
							[117.278, -9.041],
							[116.74, -9.033],
							[117.084, -8.457],
							[117.632, -8.449],
							[117.9, -8.096],
							[118.261, -8.362]
						]],
						[[
							[108.487, -6.422],
							[108.623, -6.778],
							[110.539, -6.877],
							[110.76, -6.465],
							[112.615, -6.946],
							[112.979, -7.594],
							[114.479, -7.777],
							[115.706, -8.371],
							[114.565, -8.752],
							[113.465, -8.349],
							[112.56, -8.376],
							[111.522, -8.302],
							[110.586, -8.123],
							[109.428, -7.741],
							[108.694, -7.642],
							[108.278, -7.767],
							[106.454, -7.355],
							[106.281, -6.925],
							[105.365, -6.851],
							[106.052, -5.896],
							[107.265, -5.955],
							[108.072, -6.346],
							[108.487, -6.422]
						]],
						[[
							[104.37, -1.085],
							[104.539, -1.782],
							[104.888, -2.34],
							[105.622, -2.429],
							[106.109, -3.062],
							[105.857, -4.306],
							[105.818, -5.852],
							[104.71, -5.873],
							[103.868, -5.037],
							[102.584, -4.22],
							[102.156, -3.614],
							[101.399, -2.8],
							[100.903, -2.05],
							[100.142, -.65],
							[99.264, .183],
							[98.97, 1.043],
							[98.601, 1.824],
							[97.7, 2.453],
							[97.177, 3.309],
							[96.424, 3.869],
							[95.381, 4.971],
							[95.293, 5.48],
							[95.937, 5.44],
							[97.485, 5.246],
							[98.369, 4.268],
							[99.143, 3.59],
							[99.694, 3.174],
							[100.641, 2.099],
							[101.658, 2.084],
							[102.498, 1.399],
							[103.077, .561],
							[103.838, .105],
							[103.438, -.712],
							[104.011, -1.059],
							[104.37, -1.085]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "阿根廷",
					"x": -64.173331,
					"y": -33.501159,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[-68.634, -52.636],
						[-68.25, -53.1],
						[-67.75, -53.85],
						[-66.45, -54.45],
						[-65.05, -54.7],
						[-65.5, -55.2],
						[-66.45, -55.25],
						[-66.96, -54.897],
						[-67.562, -54.87],
						[-68.633, -54.87],
						[-68.634, -52.636]
					]], [[
						[-57.625, -30.216],
						[-57.875, -31.017],
						[-58.142, -32.045],
						[-58.133, -33.041],
						[-58.35, -33.263],
						[-58.427, -33.909],
						[-58.495, -34.431],
						[-57.226, -35.288],
						[-57.362, -35.977],
						[-56.737, -36.413],
						[-56.788, -36.902],
						[-57.749, -38.184],
						[-59.232, -38.72],
						[-61.237, -38.928],
						[-62.336, -38.828],
						[-62.126, -39.424],
						[-62.331, -40.173],
						[-62.146, -40.677],
						[-62.746, -41.029],
						[-63.77, -41.167],
						[-64.732, -40.803],
						[-65.118, -41.064],
						[-64.979, -42.058],
						[-64.303, -42.359],
						[-63.756, -42.044],
						[-63.458, -42.563],
						[-64.379, -42.874],
						[-65.182, -43.495],
						[-65.329, -44.501],
						[-65.565, -45.037],
						[-66.51, -45.04],
						[-67.294, -45.552],
						[-67.581, -46.302],
						[-66.597, -47.034],
						[-65.641, -47.236],
						[-65.985, -48.133],
						[-67.166, -48.697],
						[-67.816, -49.87],
						[-68.729, -50.264],
						[-69.139, -50.733],
						[-68.816, -51.771],
						[-68.15, -52.35],
						[-68.572, -52.299],
						[-69.498, -52.143],
						[-71.915, -52.009],
						[-72.329, -51.426],
						[-72.31, -50.677],
						[-72.976, -50.741],
						[-73.328, -50.379],
						[-73.415, -49.318],
						[-72.648, -48.879],
						[-72.331, -48.244],
						[-72.447, -47.739],
						[-71.917, -46.885],
						[-71.552, -45.561],
						[-71.659, -44.974],
						[-71.223, -44.784],
						[-71.33, -44.408],
						[-71.794, -44.207],
						[-71.464, -43.788],
						[-71.915, -43.409],
						[-72.149, -42.255],
						[-71.747, -42.051],
						[-71.916, -40.832],
						[-71.681, -39.808],
						[-71.414, -38.916],
						[-70.815, -38.553],
						[-71.119, -37.577],
						[-71.122, -36.658],
						[-70.365, -36.005],
						[-70.388, -35.17],
						[-69.817, -34.194],
						[-69.815, -33.274],
						[-70.074, -33.091],
						[-70.535, -31.365],
						[-69.919, -30.336],
						[-70.014, -29.368],
						[-69.656, -28.459],
						[-69.001, -27.521],
						[-68.296, -26.899],
						[-68.595, -26.507],
						[-68.386, -26.185],
						[-68.418, -24.519],
						[-67.328, -24.025],
						[-66.985, -22.986],
						[-67.107, -22.736],
						[-66.273, -21.832],
						[-64.965, -22.076],
						[-64.377, -22.798],
						[-63.987, -21.994],
						[-62.846, -22.035],
						[-62.685, -22.249],
						[-60.847, -23.881],
						[-60.029, -24.033],
						[-58.807, -24.771],
						[-57.777, -25.162],
						[-57.634, -25.604],
						[-58.618, -27.124],
						[-57.61, -27.396],
						[-56.487, -27.548],
						[-55.696, -27.388],
						[-54.789, -26.622],
						[-54.625, -25.739],
						[-54.13, -25.548],
						[-53.628, -26.125],
						[-53.649, -26.923],
						[-54.491, -27.475],
						[-55.162, -27.882],
						[-56.291, -28.853],
						[-57.625, -30.216]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "智利",
					"x": -72.318871,
					"y": -38.151771,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[-68.634, -52.636],
						[-68.633, -54.87],
						[-67.562, -54.87],
						[-66.96, -54.897],
						[-67.291, -55.301],
						[-68.149, -55.612],
						[-68.64, -55.58],
						[-69.232, -55.499],
						[-69.958, -55.198],
						[-71.006, -55.054],
						[-72.264, -54.495],
						[-73.285, -53.958],
						[-74.663, -52.837],
						[-73.838, -53.047],
						[-72.434, -53.715],
						[-71.108, -54.074],
						[-70.592, -53.616],
						[-70.267, -52.931],
						[-69.346, -52.518],
						[-68.634, -52.636]
					]], [[
						[-69.59, -17.58],
						[-69.1, -18.26],
						[-68.967, -18.982],
						[-68.442, -19.405],
						[-68.757, -20.373],
						[-68.22, -21.494],
						[-67.828, -22.873],
						[-67.107, -22.736],
						[-66.985, -22.986],
						[-67.328, -24.025],
						[-68.418, -24.519],
						[-68.386, -26.185],
						[-68.595, -26.507],
						[-68.296, -26.899],
						[-69.001, -27.521],
						[-69.656, -28.459],
						[-70.014, -29.368],
						[-69.919, -30.336],
						[-70.535, -31.365],
						[-70.074, -33.091],
						[-69.815, -33.274],
						[-69.817, -34.194],
						[-70.388, -35.17],
						[-70.365, -36.005],
						[-71.122, -36.658],
						[-71.119, -37.577],
						[-70.815, -38.553],
						[-71.414, -38.916],
						[-71.681, -39.808],
						[-71.916, -40.832],
						[-71.747, -42.051],
						[-72.149, -42.255],
						[-71.915, -43.409],
						[-71.464, -43.788],
						[-71.794, -44.207],
						[-71.33, -44.408],
						[-71.223, -44.784],
						[-71.659, -44.974],
						[-71.552, -45.561],
						[-71.917, -46.885],
						[-72.447, -47.739],
						[-72.331, -48.244],
						[-72.648, -48.879],
						[-73.415, -49.318],
						[-73.328, -50.379],
						[-72.976, -50.741],
						[-72.31, -50.677],
						[-72.329, -51.426],
						[-71.915, -52.009],
						[-69.498, -52.143],
						[-68.572, -52.299],
						[-69.461, -52.292],
						[-69.943, -52.538],
						[-70.845, -52.899],
						[-71.006, -53.833],
						[-71.43, -53.856],
						[-72.558, -53.531],
						[-73.703, -52.835],
						[-73.703, -52.835],
						[-74.947, -52.263],
						[-75.26, -51.629],
						[-74.977, -51.043],
						[-75.48, -50.378],
						[-75.608, -48.674],
						[-75.183, -47.712],
						[-74.127, -46.939],
						[-75.644, -46.648],
						[-74.692, -45.764],
						[-74.352, -44.103],
						[-73.24, -44.455],
						[-72.718, -42.383],
						[-73.389, -42.118],
						[-73.701, -43.366],
						[-74.332, -43.225],
						[-74.018, -41.795],
						[-73.677, -39.942],
						[-73.218, -39.259],
						[-73.506, -38.283],
						[-73.588, -37.156],
						[-73.167, -37.124],
						[-72.553, -35.509],
						[-71.862, -33.909],
						[-71.438, -32.419],
						[-71.669, -30.921],
						[-71.37, -30.096],
						[-71.49, -28.861],
						[-70.905, -27.64],
						[-70.725, -25.706],
						[-70.404, -23.629],
						[-70.091, -21.393],
						[-70.164, -19.756],
						[-70.373, -18.348],
						[-69.858, -18.093],
						[-69.59, -17.58]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "刚果民主共和国",
					"x": 23.458829,
					"y": -1.858167,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[29.34, -4.5],
						[29.52, -5.42],
						[29.42, -5.94],
						[29.62, -6.52],
						[30.2, -7.08],
						[30.74, -8.34],
						[30.74, -8.34],
						[30.346, -8.238],
						[29.003, -8.407],
						[28.735, -8.527],
						[28.45, -9.165],
						[28.674, -9.606],
						[28.496, -10.79],
						[28.372, -11.794],
						[28.642, -11.972],
						[29.342, -12.361],
						[29.616, -12.179],
						[29.7, -13.257],
						[28.934, -13.249],
						[28.524, -12.699],
						[28.155, -12.272],
						[27.389, -12.133],
						[27.164, -11.609],
						[26.553, -11.924],
						[25.752, -11.785],
						[25.418, -11.331],
						[24.783, -11.239],
						[24.315, -11.263],
						[24.257, -10.952],
						[23.912, -10.927],
						[23.457, -10.868],
						[22.837, -11.018],
						[22.403, -10.993],
						[22.155, -11.085],
						[22.209, -9.895],
						[21.875, -9.524],
						[21.802, -8.909],
						[21.949, -8.306],
						[21.746, -7.92],
						[21.728, -7.291],
						[20.515, -7.3],
						[20.602, -6.939],
						[20.092, -6.943],
						[20.038, -7.116],
						[19.418, -7.155],
						[19.167, -7.738],
						[19.017, -7.988],
						[18.464, -7.847],
						[18.134, -7.988],
						[17.473, -8.069],
						[17.09, -7.546],
						[16.86, -7.222],
						[16.573, -6.623],
						[16.327, -5.877],
						[13.376, -5.864],
						[13.025, -5.984],
						[12.735, -5.966],
						[12.322, -6.1],
						[12.182, -5.79],
						[12.437, -5.684],
						[12.468, -5.248],
						[12.632, -4.991],
						[12.996, -4.781],
						[13.258, -4.883],
						[13.6, -4.5],
						[14.145, -4.51],
						[14.209, -4.793],
						[14.583, -4.97],
						[15.171, -4.344],
						[15.754, -3.855],
						[16.006, -3.535],
						[15.973, -2.712],
						[16.407, -1.741],
						[16.865, -1.226],
						[17.524, -.744],
						[17.639, -.425],
						[17.664, -.058],
						[17.827, .289],
						[17.774, .856],
						[17.899, 1.742],
						[18.094, 2.366],
						[18.394, 2.9],
						[18.453, 3.504],
						[18.543, 4.202],
						[18.932, 4.71],
						[19.468, 5.032],
						[20.291, 4.692],
						[20.928, 4.323],
						[21.659, 4.224],
						[22.405, 4.029],
						[22.704, 4.633],
						[22.841, 4.71],
						[23.297, 4.61],
						[24.411, 5.109],
						[24.805, 4.897],
						[25.129, 4.927],
						[25.279, 5.17],
						[25.65, 5.256],
						[26.403, 5.151],
						[27.044, 5.128],
						[27.374, 5.234],
						[27.98, 4.408],
						[28.429, 4.287],
						[28.697, 4.455],
						[29.159, 4.389],
						[29.716, 4.601],
						[29.953, 4.174],
						[30.834, 3.509],
						[30.834, 3.509],
						[30.773, 2.34],
						[31.174, 2.204],
						[30.853, 1.849],
						[30.469, 1.584],
						[30.086, 1.062],
						[29.876, .597],
						[29.82, -.205],
						[29.588, -.587],
						[29.579, -1.341],
						[29.292, -1.62],
						[29.255, -2.215],
						[29.117, -2.292],
						[29.025, -2.839],
						[29.276, -3.294],
						[29.34, -4.5]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "索马里",
					"x": 45.19238,
					"y": 3.568925,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[41.585, -1.683],
						[40.993, -.858],
						[40.981, 2.785],
						[41.855, 3.919],
						[42.129, 4.234],
						[42.77, 4.253],
						[43.661, 4.958],
						[44.964, 5.002],
						[47.789, 8.003],
						[48.487, 8.838],
						[48.938, 9.452],
						[48.938, 9.973],
						[48.938, 10.982],
						[48.942, 11.394],
						[48.948, 11.411],
						[48.948, 11.411],
						[49.268, 11.43],
						[49.729, 11.579],
						[50.259, 11.68],
						[50.732, 12.022],
						[51.111, 12.025],
						[51.134, 11.748],
						[51.042, 11.167],
						[51.045, 10.641],
						[50.834, 10.28],
						[50.552, 9.199],
						[50.071, 8.082],
						[49.453, 6.805],
						[48.595, 5.339],
						[47.741, 4.219],
						[46.565, 2.855],
						[45.564, 2.046],
						[44.068, 1.053],
						[43.136, .292],
						[42.042, -.919],
						[41.811, -1.446],
						[41.585, -1.683]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "肯尼亚",
					"x": 37.907632,
					"y": .549043,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[39.202, -4.677],
						[37.767, -3.677],
						[37.699, -3.097],
						[34.073, -1.06],
						[33.904, -.95],
						[33.894, .11],
						[34.18, .515],
						[34.672, 1.177],
						[35.036, 1.906],
						[34.596, 3.054],
						[34.479, 3.556],
						[34.005, 4.25],
						[34.62, 4.847],
						[35.298, 5.506],
						[35.817, 5.338],
						[35.817, 4.777],
						[36.159, 4.448],
						[36.855, 4.448],
						[38.121, 3.599],
						[38.437, 3.589],
						[38.671, 3.616],
						[38.893, 3.501],
						[39.559, 3.422],
						[39.855, 3.839],
						[40.768, 4.257],
						[41.172, 3.919],
						[41.855, 3.919],
						[40.981, 2.785],
						[40.993, -.858],
						[41.585, -1.683],
						[40.885, -2.083],
						[40.638, -2.5],
						[40.263, -2.573],
						[40.121, -3.278],
						[39.8, -3.681],
						[39.605, -4.347],
						[39.202, -4.677]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "苏丹",
					"x": 29.260657,
					"y": 16.330746,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[24.567, 8.229],
						[23.806, 8.666],
						[23.459, 8.954],
						[23.395, 9.265],
						[23.557, 9.681],
						[23.554, 10.089],
						[22.978, 10.714],
						[22.864, 11.142],
						[22.876, 11.385],
						[22.509, 11.679],
						[22.498, 12.26],
						[22.288, 12.646],
						[21.937, 12.588],
						[22.038, 12.955],
						[22.297, 13.372],
						[22.183, 13.786],
						[22.512, 14.093],
						[22.304, 14.327],
						[22.568, 14.944],
						[23.025, 15.681],
						[23.887, 15.611],
						[23.838, 19.58],
						[23.85, 20],
						[25, 20.003],
						[25, 22],
						[29.02, 22],
						[32.9, 22],
						[36.866, 22],
						[37.189, 21.019],
						[36.969, 20.837],
						[37.115, 19.808],
						[37.482, 18.614],
						[37.863, 18.368],
						[38.41, 17.998],
						[37.904, 17.428],
						[37.167, 17.263],
						[36.853, 16.957],
						[36.754, 16.292],
						[36.323, 14.822],
						[36.43, 14.422],
						[36.27, 13.563],
						[35.864, 12.578],
						[35.26, 12.083],
						[34.832, 11.319],
						[34.731, 10.91],
						[34.257, 10.63],
						[33.962, 9.584],
						[33.975, 8.685],
						[33.963, 9.464],
						[33.825, 9.484],
						[33.842, 9.982],
						[33.722, 10.325],
						[33.207, 10.72],
						[33.087, 11.441],
						[33.207, 12.179],
						[32.743, 12.248],
						[32.675, 12.025],
						[32.074, 11.973],
						[32.314, 11.681],
						[32.4, 11.081],
						[31.851, 10.531],
						[31.353, 9.81],
						[30.838, 9.707],
						[29.997, 10.291],
						[29.619, 10.085],
						[29.516, 9.793],
						[29.001, 9.604],
						[28.967, 9.398],
						[27.971, 9.398],
						[27.834, 9.604],
						[27.113, 9.639],
						[26.752, 9.467],
						[26.477, 9.553],
						[25.962, 10.136],
						[25.791, 10.411],
						[25.07, 10.274],
						[24.795, 9.81],
						[24.537, 8.918],
						[24.194, 8.729],
						[23.887, 8.62],
						[24.567, 8.229]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "乍得",
					"x": 18.645041,
					"y": 15.142959,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[23.838, 19.58],
						[23.887, 15.611],
						[23.025, 15.681],
						[22.568, 14.944],
						[22.304, 14.327],
						[22.512, 14.093],
						[22.183, 13.786],
						[22.297, 13.372],
						[22.038, 12.955],
						[21.937, 12.588],
						[22.288, 12.646],
						[22.498, 12.26],
						[22.509, 11.679],
						[22.876, 11.385],
						[22.864, 11.142],
						[22.231, 10.972],
						[21.724, 10.567],
						[21.001, 9.476],
						[20.06, 9.013],
						[19.094, 9.075],
						[18.812, 8.983],
						[18.911, 8.631],
						[18.39, 8.281],
						[17.965, 7.891],
						[16.706, 7.508],
						[16.456, 7.735],
						[16.291, 7.754],
						[16.106, 7.497],
						[15.279, 7.422],
						[15.436, 7.693],
						[15.121, 8.382],
						[14.98, 8.796],
						[14.544, 8.966],
						[13.954, 9.549],
						[14.171, 10.021],
						[14.627, 9.921],
						[14.909, 9.992],
						[15.468, 9.982],
						[14.924, 10.891],
						[14.96, 11.556],
						[14.893, 12.219],
						[14.496, 12.859],
						[14.596, 13.33],
						[13.954, 13.353],
						[13.957, 13.997],
						[13.54, 14.367],
						[13.972, 15.684],
						[15.248, 16.627],
						[15.3, 17.928],
						[15.686, 19.957],
						[15.903, 20.388],
						[15.487, 20.73],
						[15.471, 21.048],
						[15.097, 21.309],
						[14.851, 22.863],
						[15.861, 23.41],
						[19.849, 21.495],
						[23.838, 19.58]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "海地",
					"x": -72.224051,
					"y": 19.263784,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-71.712, 19.714],
						[-71.625, 19.17],
						[-71.701, 18.785],
						[-71.945, 18.617],
						[-71.688, 18.317],
						[-71.708, 18.045],
						[-72.372, 18.215],
						[-72.844, 18.146],
						[-73.455, 18.218],
						[-73.922, 18.031],
						[-74.458, 18.343],
						[-74.37, 18.665],
						[-73.45, 18.526],
						[-72.695, 18.446],
						[-72.335, 18.668],
						[-72.792, 19.102],
						[-72.784, 19.484],
						[-73.415, 19.64],
						[-73.19, 19.916],
						[-72.58, 19.872],
						[-71.712, 19.714]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "多米尼加",
					"x": -70.653998,
					"y": 19.104137,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-71.708, 18.045],
						[-71.688, 18.317],
						[-71.945, 18.617],
						[-71.701, 18.785],
						[-71.625, 19.17],
						[-71.712, 19.714],
						[-71.587, 19.885],
						[-70.807, 19.88],
						[-70.214, 19.623],
						[-69.951, 19.648],
						[-69.769, 19.293],
						[-69.222, 19.313],
						[-69.254, 19.015],
						[-68.809, 18.979],
						[-68.318, 18.612],
						[-68.689, 18.205],
						[-69.165, 18.423],
						[-69.624, 18.381],
						[-69.953, 18.428],
						[-70.133, 18.246],
						[-70.517, 18.184],
						[-70.669, 18.427],
						[-71, 18.283],
						[-71.4, 17.599],
						[-71.658, 17.758],
						[-71.708, 18.045]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "俄罗斯",
					"x": 44.686469,
					"y": 58.249357,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[178.725, 71.099],
							[180, 71.516],
							[180, 70.832],
							[178.903, 70.781],
							[178.725, 71.099]
						]],
						[[
							[49.101, 46.399],
							[48.645, 45.806],
							[47.676, 45.641],
							[46.682, 44.609],
							[47.591, 43.66],
							[47.493, 42.987],
							[48.584, 41.809],
							[48.584, 41.809],
							[47.987, 41.406],
							[47.816, 41.151],
							[47.373, 41.22],
							[46.686, 41.827],
							[46.405, 41.861],
							[45.776, 42.092],
							[45.47, 42.503],
							[44.538, 42.712],
							[43.931, 42.555],
							[43.756, 42.741],
							[42.394, 43.22],
							[40.922, 43.382],
							[40.077, 43.553],
							[39.955, 43.435],
							[38.68, 44.28],
							[37.539, 44.657],
							[36.675, 45.245],
							[37.403, 45.405],
							[38.233, 46.241],
							[37.674, 46.637],
							[39.148, 47.045],
							[39.121, 47.263],
							[38.224, 47.102],
							[38.255, 47.546],
							[38.771, 47.826],
							[39.738, 47.899],
							[39.896, 48.232],
							[39.675, 48.784],
							[40.081, 49.307],
							[40.069, 49.601],
							[38.595, 49.926],
							[38.011, 49.916],
							[37.393, 50.384],
							[36.626, 50.226],
							[35.356, 50.577],
							[35.378, 50.774],
							[35.022, 51.208],
							[34.225, 51.256],
							[34.142, 51.566],
							[34.392, 51.769],
							[33.753, 52.335],
							[32.716, 52.238],
							[32.412, 52.289],
							[32.159, 52.061],
							[31.786, 52.102],
							[31.786, 52.102],
							[31.54, 52.742],
							[31.305, 53.074],
							[31.498, 53.167],
							[32.305, 53.133],
							[32.694, 53.351],
							[32.406, 53.618],
							[31.731, 53.794],
							[31.791, 53.975],
							[31.384, 54.157],
							[30.758, 54.812],
							[30.972, 55.082],
							[30.874, 55.551],
							[29.896, 55.789],
							[29.372, 55.67],
							[29.23, 55.918],
							[28.177, 56.169],
							[27.855, 56.759],
							[27.77, 57.244],
							[27.288, 57.475],
							[27.717, 57.792],
							[27.42, 58.725],
							[28.132, 59.301],
							[27.981, 59.475],
							[27.981, 59.475],
							[29.118, 60.028],
							[28.07, 60.504],
							[28.07, 60.504],
							[30.211, 61.78],
							[31.14, 62.358],
							[31.516, 62.868],
							[30.036, 63.553],
							[30.445, 64.204],
							[29.544, 64.949],
							[30.218, 65.806],
							[29.055, 66.944],
							[29.977, 67.698],
							[28.446, 68.365],
							[28.592, 69.065],
							[29.4, 69.157],
							[31.101, 69.558],
							[31.101, 69.558],
							[32.133, 69.906],
							[33.775, 69.301],
							[36.514, 69.063],
							[40.292, 67.932],
							[41.06, 67.457],
							[41.126, 66.792],
							[40.016, 66.266],
							[38.383, 66],
							[33.919, 66.76],
							[33.184, 66.633],
							[34.815, 65.9],
							[34.879, 65.436],
							[34.944, 64.414],
							[36.231, 64.109],
							[37.013, 63.85],
							[37.142, 64.335],
							[36.54, 64.764],
							[37.176, 65.143],
							[39.593, 64.521],
							[40.436, 64.764],
							[39.763, 65.497],
							[42.093, 66.476],
							[43.016, 66.419],
							[43.95, 66.069],
							[44.532, 66.756],
							[43.698, 67.352],
							[44.188, 67.951],
							[43.453, 68.571],
							[46.25, 68.25],
							[46.821, 67.69],
							[45.555, 67.567],
							[45.562, 67.01],
							[46.349, 66.668],
							[47.894, 66.885],
							[48.139, 67.522],
							[50.228, 67.999],
							[53.717, 68.857],
							[54.472, 68.808],
							[53.486, 68.201],
							[54.726, 68.097],
							[55.443, 68.439],
							[57.317, 68.466],
							[58.802, 68.881],
							[59.941, 68.278],
							[61.078, 68.941],
							[60.03, 69.52],
							[60.55, 69.85],
							[63.504, 69.547],
							[64.888, 69.235],
							[68.512, 68.092],
							[69.181, 68.616],
							[68.164, 69.144],
							[68.135, 69.356],
							[66.93, 69.455],
							[67.26, 69.929],
							[66.725, 70.709],
							[66.695, 71.029],
							[68.54, 71.934],
							[69.196, 72.843],
							[69.94, 73.04],
							[72.588, 72.776],
							[72.796, 72.22],
							[71.848, 71.409],
							[72.47, 71.09],
							[72.792, 70.391],
							[72.565, 69.021],
							[73.668, 68.408],
							[73.239, 67.74],
							[71.28, 66.32],
							[72.423, 66.173],
							[72.821, 66.533],
							[73.921, 66.789],
							[74.187, 67.284],
							[75.052, 67.76],
							[74.469, 68.329],
							[74.936, 68.989],
							[73.842, 69.071],
							[73.602, 69.628],
							[74.4, 70.632],
							[73.101, 71.447],
							[74.891, 72.121],
							[74.659, 72.832],
							[75.158, 72.855],
							[75.684, 72.301],
							[75.289, 71.336],
							[76.359, 71.153],
							[75.903, 71.874],
							[77.577, 72.267],
							[79.652, 72.32],
							[81.5, 71.75],
							[80.611, 72.583],
							[80.511, 73.648],
							[82.25, 73.85],
							[84.655, 73.806],
							[86.822, 73.937],
							[86.01, 74.46],
							[87.167, 75.116],
							[88.316, 75.144],
							[90.26, 75.64],
							[92.901, 75.773],
							[93.234, 76.047],
							[95.86, 76.14],
							[96.678, 75.915],
							[98.923, 76.447],
							[100.76, 76.43],
							[101.035, 76.862],
							[101.991, 77.288],
							[104.352, 77.698],
							[106.067, 77.374],
							[104.705, 77.127],
							[106.97, 76.974],
							[107.24, 76.48],
							[108.154, 76.723],
							[111.077, 76.71],
							[113.332, 76.222],
							[114.134, 75.848],
							[113.885, 75.328],
							[112.779, 75.032],
							[110.151, 74.477],
							[109.4, 74.18],
							[110.64, 74.04],
							[112.119, 73.788],
							[113.02, 73.977],
							[113.53, 73.335],
							[113.969, 73.595],
							[115.568, 73.753],
							[118.776, 73.588],
							[119.02, 73.12],
							[123.201, 72.971],
							[123.258, 73.735],
							[125.38, 73.56],
							[126.976, 73.565],
							[128.591, 73.039],
							[129.052, 72.399],
							[128.46, 71.98],
							[129.716, 71.193],
							[131.289, 70.787],
							[132.254, 71.836],
							[133.858, 71.386],
							[135.562, 71.655],
							[137.498, 71.348],
							[138.234, 71.628],
							[139.87, 71.488],
							[139.148, 72.416],
							[140.468, 72.849],
							[149.5, 72.2],
							[150.351, 71.606],
							[152.969, 70.842],
							[157.007, 71.031],
							[158.998, 70.867],
							[159.83, 70.453],
							[159.709, 69.722],
							[160.941, 69.437],
							[162.279, 69.642],
							[164.052, 69.668],
							[165.94, 69.472],
							[167.836, 69.583],
							[169.578, 68.694],
							[170.817, 69.014],
							[170.008, 69.653],
							[170.453, 70.097],
							[173.644, 69.817],
							[175.724, 69.877],
							[178.6, 69.4],
							[180, 68.964],
							[180, 64.98],
							[179.993, 64.974],
							[178.707, 64.535],
							[177.411, 64.608],
							[178.313, 64.076],
							[178.908, 63.252],
							[179.37, 62.983],
							[179.486, 62.569],
							[179.228, 62.304],
							[177.364, 62.522],
							[174.569, 61.769],
							[173.68, 61.653],
							[172.15, 60.95],
							[170.698, 60.336],
							[170.331, 59.882],
							[168.9, 60.574],
							[166.295, 59.789],
							[165.84, 60.16],
							[164.877, 59.732],
							[163.539, 59.869],
							[163.217, 59.211],
							[162.017, 58.243],
							[162.053, 57.839],
							[163.192, 57.615],
							[163.058, 56.159],
							[162.13, 56.122],
							[161.701, 55.286],
							[162.117, 54.855],
							[160.369, 54.344],
							[160.022, 53.203],
							[158.531, 52.959],
							[158.231, 51.943],
							[156.79, 51.011],
							[156.42, 51.7],
							[155.992, 53.159],
							[155.434, 55.381],
							[155.914, 56.768],
							[156.758, 57.365],
							[156.81, 57.832],
							[158.364, 58.056],
							[160.151, 59.315],
							[161.872, 60.343],
							[163.67, 61.141],
							[164.474, 62.551],
							[163.258, 62.466],
							[162.658, 61.642],
							[160.121, 60.544],
							[159.302, 61.774],
							[156.721, 61.434],
							[154.218, 59.758],
							[155.044, 59.145],
							[152.812, 58.884],
							[151.266, 58.781],
							[151.338, 59.504],
							[149.784, 59.656],
							[148.545, 59.164],
							[145.487, 59.336],
							[142.198, 59.04],
							[138.958, 57.088],
							[135.126, 54.73],
							[136.702, 54.604],
							[137.193, 53.977],
							[138.165, 53.755],
							[138.805, 54.255],
							[139.902, 54.19],
							[141.345, 53.09],
							[141.379, 52.239],
							[140.597, 51.24],
							[140.513, 50.046],
							[140.062, 48.447],
							[138.555, 47],
							[138.22, 46.308],
							[136.862, 45.144],
							[135.515, 43.989],
							[134.869, 43.398],
							[133.537, 42.811],
							[132.906, 42.798],
							[132.278, 43.285],
							[130.936, 42.553],
							[130.78, 42.22],
							[130.78, 42.22],
							[130.78, 42.22],
							[130.78, 42.22],
							[130.64, 42.395],
							[130.64, 42.395],
							[130.634, 42.903],
							[131.145, 42.93],
							[131.289, 44.112],
							[131.025, 44.968],
							[131.883, 45.321],
							[133.097, 45.144],
							[133.77, 46.117],
							[134.112, 47.212],
							[134.501, 47.578],
							[135.026, 48.478],
							[133.374, 48.183],
							[132.507, 47.789],
							[130.987, 47.79],
							[130.582, 48.73],
							[129.398, 49.441],
							[127.657, 49.76],
							[127.287, 50.74],
							[126.939, 51.354],
							[126.564, 51.784],
							[125.946, 52.793],
							[125.068, 53.161],
							[123.571, 53.459],
							[122.246, 53.432],
							[121.003, 53.251],
							[120.177, 52.754],
							[120.726, 52.516],
							[120.738, 51.964],
							[120.182, 51.644],
							[119.279, 50.583],
							[119.288, 50.143],
							[117.879, 49.511],
							[116.679, 49.889],
							[115.486, 49.805],
							[114.962, 50.14],
							[114.362, 50.248],
							[112.898, 49.544],
							[111.581, 49.378],
							[110.662, 49.13],
							[109.402, 49.293],
							[108.475, 49.283],
							[107.868, 49.794],
							[106.889, 50.274],
							[105.887, 50.406],
							[104.622, 50.275],
							[103.677, 50.09],
							[102.256, 50.511],
							[102.065, 51.26],
							[100.889, 51.517],
							[99.982, 51.634],
							[98.861, 52.047],
							[97.826, 51.011],
							[98.232, 50.422],
							[97.26, 49.726],
							[95.814, 49.977],
							[94.816, 50.013],
							[94.148, 50.481],
							[93.104, 50.495],
							[92.235, 50.802],
							[90.714, 50.332],
							[88.806, 49.471],
							[87.751, 49.297],
							[87.36, 49.215],
							[86.829, 49.827],
							[85.541, 49.693],
							[85.116, 50.117],
							[84.416, 50.311],
							[83.935, 50.889],
							[83.383, 51.069],
							[81.946, 50.812],
							[80.568, 51.388],
							[80.036, 50.865],
							[77.801, 53.404],
							[76.525, 54.177],
							[76.891, 54.491],
							[74.385, 53.547],
							[73.426, 53.49],
							[73.509, 54.036],
							[72.224, 54.377],
							[71.18, 54.133],
							[70.865, 55.17],
							[69.068, 55.385],
							[68.169, 54.97],
							[65.667, 54.601],
							[65.179, 54.354],
							[61.437, 54.006],
							[60.978, 53.665],
							[61.7, 52.98],
							[60.74, 52.72],
							[60.927, 52.448],
							[59.968, 51.96],
							[61.588, 51.273],
							[61.337, 50.799],
							[59.933, 50.842],
							[59.642, 50.545],
							[58.363, 51.064],
							[56.778, 51.044],
							[55.717, 50.622],
							[54.533, 51.026],
							[52.329, 51.719],
							[50.767, 51.693],
							[48.702, 50.605],
							[48.578, 49.875],
							[47.549, 50.455],
							[46.752, 49.356],
							[47.044, 49.152],
							[46.466, 48.394],
							[47.315, 47.716],
							[48.057, 47.744],
							[48.695, 47.076],
							[48.593, 46.561],
							[49.101, 46.399]
						]],
						[[
							[93.778, 81.025],
							[95.941, 81.25],
							[97.884, 80.747],
							[100.187, 79.78],
							[99.94, 78.881],
							[97.758, 78.756],
							[94.973, 79.045],
							[93.313, 79.427],
							[92.545, 80.144],
							[91.181, 80.341],
							[93.778, 81.025]
						]],
						[[
							[102.838, 79.281],
							[105.372, 78.713],
							[105.075, 78.307],
							[99.438, 77.921],
							[101.265, 79.234],
							[102.086, 79.346],
							[102.838, 79.281]
						]],
						[[
							[138.831, 76.137],
							[141.472, 76.093],
							[145.086, 75.563],
							[144.3, 74.82],
							[140.614, 74.848],
							[138.955, 74.611],
							[136.974, 75.262],
							[137.512, 75.949],
							[138.831, 76.137]
						]],
						[[
							[148.222, 75.346],
							[150.732, 75.084],
							[149.576, 74.689],
							[147.977, 74.778],
							[146.119, 75.173],
							[146.358, 75.497],
							[148.222, 75.346]
						]],
						[[
							[139.863, 73.37],
							[140.812, 73.765],
							[142.062, 73.858],
							[143.483, 73.475],
							[143.604, 73.212],
							[142.088, 73.205],
							[140.038, 73.317],
							[139.863, 73.37]
						]],
						[[
							[44.847, 80.59],
							[46.799, 80.772],
							[48.318, 80.784],
							[48.523, 80.515],
							[49.097, 80.754],
							[50.04, 80.919],
							[51.523, 80.7],
							[51.136, 80.547],
							[49.794, 80.415],
							[48.894, 80.34],
							[48.755, 80.175],
							[47.586, 80.01],
							[46.503, 80.247],
							[47.072, 80.559],
							[44.847, 80.59]
						]],
						[[
							[22.731, 54.328],
							[20.892, 54.313],
							[19.661, 54.426],
							[19.888, 54.866],
							[21.268, 55.19],
							[22.316, 55.015],
							[22.758, 54.857],
							[22.651, 54.583],
							[22.731, 54.328]
						]],
						[[
							[53.508, 73.75],
							[55.902, 74.627],
							[55.632, 75.081],
							[57.869, 75.609],
							[61.17, 76.252],
							[64.498, 76.439],
							[66.211, 76.81],
							[68.157, 76.94],
							[68.852, 76.545],
							[68.181, 76.234],
							[64.637, 75.738],
							[61.584, 75.261],
							[58.477, 74.309],
							[56.987, 73.333],
							[55.419, 72.371],
							[55.623, 71.541],
							[57.536, 70.72],
							[56.945, 70.633],
							[53.677, 70.763],
							[53.412, 71.207],
							[51.602, 71.475],
							[51.456, 72.015],
							[52.478, 72.229],
							[52.444, 72.775],
							[54.428, 73.628],
							[53.508, 73.75]
						]],
						[[
							[142.915, 53.705],
							[143.261, 52.741],
							[143.235, 51.757],
							[143.648, 50.748],
							[144.654, 48.976],
							[143.174, 49.307],
							[142.559, 47.862],
							[143.533, 46.837],
							[143.505, 46.138],
							[142.748, 46.741],
							[142.092, 45.967],
							[141.907, 46.806],
							[142.018, 47.78],
							[141.904, 48.859],
							[142.136, 49.615],
							[142.18, 50.952],
							[141.594, 51.935],
							[141.683, 53.302],
							[142.607, 53.762],
							[142.21, 54.225],
							[142.655, 54.366],
							[142.915, 53.705]
						]],
						[[
							[-174.928, 67.206],
							[-175.014, 66.584],
							[-174.34, 66.336],
							[-174.572, 67.062],
							[-171.857, 66.913],
							[-169.9, 65.977],
							[-170.891, 65.541],
							[-172.53, 65.438],
							[-172.555, 64.461],
							[-172.955, 64.253],
							[-173.892, 64.283],
							[-174.654, 64.631],
							[-175.984, 64.923],
							[-176.207, 65.357],
							[-177.223, 65.52],
							[-178.36, 65.391],
							[-178.903, 65.74],
							[-178.686, 66.112],
							[-179.884, 65.875],
							[-179.433, 65.404],
							[-180, 64.98],
							[-180, 68.964],
							[-177.55, 68.2],
							[-174.928, 67.206]
						]],
						[[
							[-178.694, 70.893],
							[-180, 70.832],
							[-180, 71.516],
							[-179.872, 71.558],
							[-179.024, 71.556],
							[-177.578, 71.269],
							[-177.664, 71.133],
							[-178.694, 70.893]
						]],
						[[
							[33.436, 45.972],
							[33.699, 46.22],
							[34.41, 46.005],
							[34.732, 45.966],
							[34.862, 45.768],
							[35.013, 45.738],
							[35.021, 45.651],
							[35.51, 45.41],
							[36.53, 45.47],
							[36.335, 45.113],
							[35.24, 44.94],
							[33.883, 44.361],
							[33.326, 44.565],
							[33.547, 45.035],
							[32.454, 45.327],
							[32.631, 45.519],
							[33.588, 45.852],
							[33.436, 45.972]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "巴哈马",
					"x": -77.146688,
					"y": 26.401789,
					"rank": 4
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[-78.98, 26.79],
							[-78.51, 26.87],
							[-77.85, 26.84],
							[-77.82, 26.58],
							[-78.91, 26.42],
							[-78.98, 26.79]
						]],
						[[
							[-77.79, 27.04],
							[-77, 26.59],
							[-77.173, 25.879],
							[-77.356, 26.007],
							[-77.34, 26.53],
							[-77.788, 26.925],
							[-77.79, 27.04]
						]],
						[[
							[-78.191, 25.21],
							[-77.89, 25.17],
							[-77.54, 24.34],
							[-77.535, 23.76],
							[-77.78, 23.71],
							[-78.034, 24.286],
							[-78.408, 24.576],
							[-78.191, 25.21]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "福克兰群岛",
					"x": -58.738602,
					"y": -51.608913,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-61.2, -51.85],
						[-60, -51.25],
						[-59.15, -51.5],
						[-58.55, -51.1],
						[-57.75, -51.55],
						[-58.05, -51.9],
						[-59.4, -52.2],
						[-59.85, -51.85],
						[-60.7, -52.3],
						[-61.2, -51.85]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "挪威",
					"x": 9.679975,
					"y": 61.357092,
					"rank": 3
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[15.143, 79.674],
							[15.523, 80.016],
							[16.991, 80.051],
							[18.252, 79.702],
							[21.544, 78.956],
							[19.027, 78.563],
							[18.472, 77.827],
							[17.594, 77.638],
							[17.118, 76.809],
							[15.913, 76.77],
							[13.763, 77.38],
							[14.67, 77.736],
							[13.171, 78.025],
							[11.222, 78.869],
							[10.445, 79.652],
							[13.171, 80.01],
							[13.719, 79.66],
							[15.143, 79.674]
						]],
						[[
							[31.101, 69.558],
							[29.4, 69.157],
							[28.592, 69.065],
							[29.016, 69.766],
							[27.732, 70.164],
							[26.18, 69.825],
							[25.689, 69.092],
							[24.736, 68.65],
							[23.662, 68.891],
							[22.356, 68.842],
							[21.245, 69.37],
							[20.646, 69.106],
							[20.025, 69.065],
							[19.879, 68.407],
							[17.994, 68.567],
							[17.729, 68.011],
							[16.769, 68.014],
							[16.109, 67.302],
							[15.108, 66.194],
							[13.556, 64.787],
							[13.92, 64.445],
							[13.572, 64.049],
							[12.58, 64.066],
							[11.931, 63.128],
							[11.992, 61.8],
							[12.631, 61.294],
							[12.3, 60.118],
							[11.468, 59.432],
							[11.027, 58.856],
							[10.357, 59.47],
							[8.382, 58.313],
							[7.049, 58.079],
							[5.666, 58.588],
							[5.308, 59.663],
							[4.992, 61.971],
							[5.913, 62.614],
							[8.553, 63.454],
							[10.528, 64.486],
							[12.358, 65.88],
							[14.761, 67.811],
							[16.436, 68.563],
							[19.184, 69.817],
							[21.378, 70.255],
							[23.024, 70.202],
							[24.547, 71.03],
							[26.37, 70.986],
							[28.166, 71.185],
							[31.293, 70.454],
							[30.005, 70.186],
							[31.101, 69.558]
						]],
						[[
							[27.408, 80.056],
							[25.925, 79.518],
							[23.024, 79.4],
							[20.075, 79.567],
							[19.897, 79.842],
							[18.462, 79.86],
							[17.368, 80.319],
							[20.456, 80.598],
							[21.908, 80.358],
							[22.919, 80.657],
							[25.448, 80.407],
							[27.408, 80.056]
						]],
						[[
							[24.724, 77.854],
							[22.49, 77.445],
							[20.726, 77.677],
							[21.416, 77.935],
							[20.812, 78.255],
							[22.884, 78.455],
							[23.281, 78.08],
							[24.724, 77.854]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "格陵兰",
					"x": -39.335251,
					"y": 74.319387,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-46.764, 82.628],
						[-43.406, 83.225],
						[-39.898, 83.18],
						[-38.622, 83.549],
						[-35.088, 83.645],
						[-27.1, 83.52],
						[-20.845, 82.727],
						[-22.692, 82.342],
						[-26.518, 82.298],
						[-31.9, 82.2],
						[-31.396, 82.022],
						[-27.857, 82.132],
						[-24.844, 81.787],
						[-22.903, 82.093],
						[-22.072, 81.734],
						[-23.17, 81.153],
						[-20.624, 81.525],
						[-15.768, 81.912],
						[-12.77, 81.719],
						[-12.209, 81.292],
						[-16.285, 80.58],
						[-16.85, 80.35],
						[-20.046, 80.177],
						[-17.73, 80.129],
						[-18.9, 79.4],
						[-19.705, 78.751],
						[-19.674, 77.639],
						[-18.473, 76.986],
						[-20.035, 76.944],
						[-21.679, 76.628],
						[-19.834, 76.098],
						[-19.599, 75.248],
						[-20.668, 75.156],
						[-19.373, 74.296],
						[-21.594, 74.224],
						[-20.435, 73.817],
						[-20.762, 73.464],
						[-22.172, 73.31],
						[-23.566, 73.307],
						[-22.313, 72.629],
						[-22.3, 72.184],
						[-24.278, 72.598],
						[-24.793, 72.33],
						[-23.443, 72.08],
						[-22.133, 71.469],
						[-21.754, 70.664],
						[-23.536, 70.471],
						[-24.307, 70.856],
						[-25.543, 71.431],
						[-25.201, 70.752],
						[-26.363, 70.226],
						[-23.727, 70.184],
						[-22.349, 70.129],
						[-25.029, 69.259],
						[-27.747, 68.47],
						[-30.674, 68.125],
						[-31.777, 68.121],
						[-32.811, 67.735],
						[-34.202, 66.68],
						[-36.353, 65.979],
						[-37.044, 65.938],
						[-38.375, 65.692],
						[-39.812, 65.458],
						[-40.669, 64.84],
						[-40.683, 64.139],
						[-41.189, 63.482],
						[-42.819, 62.682],
						[-42.417, 61.901],
						[-42.866, 61.074],
						[-43.378, 60.098],
						[-44.788, 60.037],
						[-46.264, 60.853],
						[-48.263, 60.858],
						[-49.233, 61.407],
						[-49.9, 62.383],
						[-51.633, 63.627],
						[-52.14, 64.278],
						[-52.277, 65.177],
						[-53.662, 66.1],
						[-53.302, 66.837],
						[-53.969, 67.189],
						[-52.98, 68.358],
						[-51.475, 68.73],
						[-51.08, 69.148],
						[-50.871, 69.929],
						[-52.014, 69.575],
						[-52.558, 69.426],
						[-53.456, 69.284],
						[-54.683, 69.61],
						[-54.75, 70.289],
						[-54.359, 70.821],
						[-53.431, 70.836],
						[-51.39, 70.57],
						[-53.109, 71.205],
						[-54.004, 71.547],
						[-55, 71.407],
						[-55.835, 71.654],
						[-54.718, 72.586],
						[-55.326, 72.959],
						[-56.12, 73.65],
						[-57.324, 74.71],
						[-58.597, 75.099],
						[-58.585, 75.517],
						[-61.269, 76.102],
						[-63.392, 76.175],
						[-66.064, 76.135],
						[-68.504, 76.061],
						[-69.665, 76.38],
						[-71.403, 77.009],
						[-68.777, 77.323],
						[-66.764, 77.376],
						[-71.043, 77.636],
						[-73.297, 78.044],
						[-73.159, 78.433],
						[-69.373, 78.914],
						[-65.711, 79.394],
						[-65.324, 79.758],
						[-68.023, 80.117],
						[-67.151, 80.516],
						[-63.689, 81.214],
						[-62.234, 81.321],
						[-62.651, 81.77],
						[-60.282, 82.034],
						[-57.207, 82.191],
						[-54.134, 82.2],
						[-53.043, 81.888],
						[-50.391, 82.439],
						[-48.004, 82.065],
						[-46.6, 81.986],
						[-44.523, 81.661],
						[-46.901, 82.2],
						[-46.764, 82.628]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "法属南部和南极领地",
					"x": 69.122136,
					"y": -49.303721,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[68.935, -48.625],
						[69.58, -48.94],
						[70.525, -49.065],
						[70.56, -49.255],
						[70.28, -49.71],
						[68.745, -49.775],
						[68.72, -49.242],
						[68.868, -48.83],
						[68.935, -48.625]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "东帝汶",
					"x": 125.854679,
					"y": -8.803705,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[124.969, -8.893],
						[125.086, -8.657],
						[125.947, -8.432],
						[126.645, -8.398],
						[126.957, -8.273],
						[127.336, -8.397],
						[126.968, -8.668],
						[125.926, -9.106],
						[125.089, -9.393],
						[125.07, -9.09],
						[124.969, -8.893]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "南非",
					"x": 23.665734,
					"y": -29.708776,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[16.345, -28.577],
						[16.824, -28.082],
						[17.219, -28.356],
						[17.387, -28.784],
						[17.836, -28.856],
						[18.465, -29.045],
						[19.002, -28.972],
						[19.895, -28.461],
						[19.896, -24.768],
						[20.166, -24.918],
						[20.759, -25.868],
						[20.666, -26.477],
						[20.89, -26.829],
						[21.606, -26.727],
						[22.106, -26.28],
						[22.58, -25.979],
						[22.824, -25.5],
						[23.312, -25.269],
						[23.734, -25.39],
						[24.211, -25.67],
						[25.025, -25.72],
						[25.665, -25.487],
						[25.766, -25.175],
						[25.942, -24.696],
						[26.486, -24.616],
						[26.786, -24.241],
						[27.119, -23.574],
						[28.017, -22.828],
						[29.432, -22.091],
						[29.839, -22.102],
						[30.323, -22.272],
						[30.66, -22.152],
						[31.191, -22.252],
						[31.67, -23.659],
						[31.931, -24.369],
						[31.752, -25.484],
						[31.838, -25.843],
						[31.333, -25.66],
						[31.044, -25.731],
						[30.95, -26.023],
						[30.677, -26.398],
						[30.686, -26.744],
						[31.283, -27.286],
						[31.868, -27.178],
						[32.072, -26.734],
						[32.83, -26.742],
						[32.58, -27.47],
						[32.462, -28.301],
						[32.203, -28.752],
						[31.521, -29.257],
						[31.326, -29.402],
						[30.902, -29.91],
						[30.623, -30.424],
						[30.056, -31.14],
						[28.926, -32.172],
						[28.22, -32.772],
						[27.465, -33.227],
						[26.419, -33.615],
						[25.91, -33.667],
						[25.781, -33.945],
						[25.173, -33.797],
						[24.678, -33.987],
						[23.594, -33.794],
						[22.988, -33.916],
						[22.574, -33.864],
						[21.543, -34.259],
						[20.689, -34.417],
						[20.071, -34.795],
						[19.616, -34.819],
						[19.193, -34.463],
						[18.855, -34.444],
						[18.425, -33.998],
						[18.377, -34.137],
						[18.244, -33.868],
						[18.25, -33.281],
						[17.925, -32.611],
						[18.248, -32.429],
						[18.222, -31.662],
						[17.567, -30.726],
						[17.064, -29.879],
						[17.063, -29.876],
						[16.345, -28.577]
					], [
						[28.978, -28.956],
						[28.542, -28.648],
						[28.074, -28.851],
						[27.533, -29.243],
						[26.999, -29.876],
						[27.749, -30.645],
						[28.107, -30.546],
						[28.291, -30.226],
						[28.848, -30.07],
						[29.018, -29.744],
						[29.325, -29.257],
						[28.978, -28.956]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "莱索托",
					"x": 28.246639,
					"y": -29.480158,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[28.978, -28.956],
						[29.325, -29.257],
						[29.018, -29.744],
						[28.848, -30.07],
						[28.291, -30.226],
						[28.107, -30.546],
						[27.749, -30.645],
						[26.999, -29.876],
						[27.533, -29.243],
						[28.074, -28.851],
						[28.542, -28.648],
						[28.978, -28.956]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "墨西哥",
					"x": -102.289448,
					"y": 23.919988,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-117.128, 32.535],
						[-115.991, 32.612],
						[-114.721, 32.721],
						[-114.815, 32.525],
						[-113.305, 32.039],
						[-111.024, 31.335],
						[-109.035, 31.342],
						[-108.242, 31.342],
						[-108.24, 31.755],
						[-106.508, 31.755],
						[-106.143, 31.4],
						[-105.632, 31.084],
						[-105.037, 30.644],
						[-104.706, 30.122],
						[-104.457, 29.572],
						[-103.94, 29.27],
						[-103.11, 28.97],
						[-102.48, 29.76],
						[-101.662, 29.779],
						[-100.958, 29.381],
						[-100.456, 28.696],
						[-100.11, 28.11],
						[-99.52, 27.54],
						[-99.3, 26.84],
						[-99.02, 26.37],
						[-98.24, 26.06],
						[-97.53, 25.84],
						[-97.14, 25.87],
						[-97.528, 24.992],
						[-97.703, 24.272],
						[-97.776, 22.933],
						[-97.872, 22.444],
						[-97.699, 21.899],
						[-97.389, 21.411],
						[-97.189, 20.635],
						[-96.526, 19.891],
						[-96.292, 19.32],
						[-95.901, 18.828],
						[-94.839, 18.563],
						[-94.426, 18.144],
						[-93.549, 18.424],
						[-92.786, 18.525],
						[-92.037, 18.705],
						[-91.408, 18.876],
						[-90.772, 19.284],
						[-90.534, 19.867],
						[-90.451, 20.708],
						[-90.279, 21],
						[-89.601, 21.262],
						[-88.544, 21.494],
						[-87.658, 21.459],
						[-87.052, 21.544],
						[-86.812, 21.332],
						[-86.846, 20.85],
						[-87.383, 20.255],
						[-87.621, 19.647],
						[-87.437, 19.472],
						[-87.587, 19.04],
						[-87.837, 18.26],
						[-88.091, 18.517],
						[-88.3, 18.5],
						[-88.49, 18.487],
						[-88.848, 17.883],
						[-89.03, 18.002],
						[-89.151, 17.955],
						[-89.143, 17.808],
						[-90.068, 17.819],
						[-91.002, 17.818],
						[-91.002, 17.255],
						[-91.454, 17.252],
						[-91.082, 16.918],
						[-90.712, 16.687],
						[-90.601, 16.471],
						[-90.439, 16.41],
						[-90.464, 16.07],
						[-91.748, 16.067],
						[-92.229, 15.251],
						[-92.087, 15.065],
						[-92.203, 14.83],
						[-92.228, 14.539],
						[-93.359, 15.615],
						[-93.875, 15.94],
						[-94.692, 16.201],
						[-95.25, 16.128],
						[-96.053, 15.752],
						[-96.557, 15.654],
						[-97.264, 15.917],
						[-98.013, 16.107],
						[-98.948, 16.566],
						[-99.697, 16.706],
						[-100.829, 17.171],
						[-101.666, 17.649],
						[-101.919, 17.916],
						[-102.478, 17.976],
						[-103.501, 18.292],
						[-103.918, 18.749],
						[-104.992, 19.316],
						[-105.493, 19.947],
						[-105.731, 20.434],
						[-105.398, 20.532],
						[-105.501, 20.817],
						[-105.271, 21.076],
						[-105.266, 21.422],
						[-105.603, 21.871],
						[-105.693, 22.269],
						[-106.029, 22.774],
						[-106.91, 23.768],
						[-107.915, 24.549],
						[-108.402, 25.172],
						[-109.26, 25.581],
						[-109.444, 25.825],
						[-109.292, 26.443],
						[-109.801, 26.676],
						[-110.392, 27.162],
						[-110.641, 27.86],
						[-111.179, 27.941],
						[-111.76, 28.468],
						[-112.228, 28.954],
						[-112.272, 29.267],
						[-112.81, 30.021],
						[-113.164, 30.787],
						[-113.149, 31.171],
						[-113.872, 31.568],
						[-114.206, 31.524],
						[-114.776, 31.8],
						[-114.937, 31.393],
						[-114.771, 30.914],
						[-114.674, 30.163],
						[-114.331, 29.75],
						[-113.589, 29.062],
						[-113.424, 28.826],
						[-113.272, 28.755],
						[-113.14, 28.411],
						[-112.962, 28.425],
						[-112.762, 27.78],
						[-112.458, 27.526],
						[-112.245, 27.172],
						[-111.616, 26.663],
						[-111.285, 25.733],
						[-110.988, 25.295],
						[-110.71, 24.826],
						[-110.655, 24.299],
						[-110.173, 24.266],
						[-109.772, 23.811],
						[-109.409, 23.365],
						[-109.433, 23.186],
						[-109.854, 22.818],
						[-110.031, 22.823],
						[-110.295, 23.431],
						[-110.95, 24.001],
						[-111.671, 24.484],
						[-112.182, 24.738],
						[-112.149, 25.47],
						[-112.301, 26.012],
						[-112.777, 26.322],
						[-113.465, 26.768],
						[-113.597, 26.639],
						[-113.849, 26.9],
						[-114.466, 27.142],
						[-115.055, 27.723],
						[-114.982, 27.798],
						[-114.57, 27.741],
						[-114.199, 28.115],
						[-114.162, 28.566],
						[-114.932, 29.279],
						[-115.519, 29.556],
						[-115.887, 30.181],
						[-116.258, 30.836],
						[-116.722, 31.636],
						[-117.128, 32.535]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "乌拉圭",
					"x": -55.966942,
					"y": -32.961127,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-57.625, -30.216],
						[-56.976, -30.11],
						[-55.973, -30.883],
						[-55.602, -30.854],
						[-54.572, -31.495],
						[-53.788, -32.047],
						[-53.21, -32.728],
						[-53.651, -33.202],
						[-53.374, -33.768],
						[-53.806, -34.397],
						[-54.936, -34.953],
						[-55.674, -34.753],
						[-56.215, -34.86],
						[-57.14, -34.43],
						[-57.818, -34.463],
						[-58.427, -33.909],
						[-58.35, -33.263],
						[-58.133, -33.041],
						[-58.142, -32.045],
						[-57.875, -31.017],
						[-57.625, -30.216]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "巴西",
					"x": -49.55945,
					"y": -12.098687,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-53.374, -33.768],
						[-53.651, -33.202],
						[-53.21, -32.728],
						[-53.788, -32.047],
						[-54.572, -31.495],
						[-55.602, -30.854],
						[-55.973, -30.883],
						[-56.976, -30.11],
						[-57.625, -30.216],
						[-56.291, -28.853],
						[-55.162, -27.882],
						[-54.491, -27.475],
						[-53.649, -26.923],
						[-53.628, -26.125],
						[-54.13, -25.548],
						[-54.625, -25.739],
						[-54.429, -25.162],
						[-54.293, -24.571],
						[-54.293, -24.021],
						[-54.653, -23.84],
						[-55.028, -24.001],
						[-55.401, -23.957],
						[-55.518, -23.572],
						[-55.611, -22.656],
						[-55.798, -22.357],
						[-56.473, -22.086],
						[-56.882, -22.282],
						[-57.937, -22.09],
						[-57.871, -20.733],
						[-58.166, -20.177],
						[-57.854, -19.97],
						[-57.95, -19.4],
						[-57.676, -18.962],
						[-57.498, -18.174],
						[-57.735, -17.552],
						[-58.281, -17.272],
						[-58.388, -16.877],
						[-58.241, -16.3],
						[-60.158, -16.258],
						[-60.543, -15.094],
						[-60.251, -15.077],
						[-60.264, -14.646],
						[-60.459, -14.354],
						[-60.503, -13.776],
						[-61.084, -13.479],
						[-61.713, -13.489],
						[-62.127, -13.199],
						[-62.803, -13.001],
						[-63.196, -12.627],
						[-64.316, -12.462],
						[-65.402, -11.566],
						[-65.322, -10.896],
						[-65.445, -10.511],
						[-65.338, -9.762],
						[-66.647, -9.931],
						[-67.174, -10.307],
						[-68.048, -10.712],
						[-68.271, -11.015],
						[-68.786, -11.036],
						[-69.53, -10.952],
						[-70.094, -11.124],
						[-70.549, -11.009],
						[-70.482, -9.49],
						[-71.302, -10.079],
						[-72.185, -10.054],
						[-72.563, -9.52],
						[-73.227, -9.462],
						[-73.015, -9.033],
						[-73.571, -8.424],
						[-73.987, -7.524],
						[-73.723, -7.341],
						[-73.724, -6.919],
						[-73.12, -6.63],
						[-73.22, -6.089],
						[-72.965, -5.741],
						[-72.892, -5.275],
						[-71.748, -4.594],
						[-70.929, -4.402],
						[-70.795, -4.251],
						[-69.894, -4.298],
						[-69.444, -1.556],
						[-69.42, -1.123],
						[-69.577, -.55],
						[-70.021, -.185],
						[-70.016, .541],
						[-69.452, .706],
						[-69.252, .603],
						[-69.219, .986],
						[-69.805, 1.089],
						[-69.817, 1.715],
						[-67.869, 1.692],
						[-67.538, 2.037],
						[-67.26, 1.72],
						[-67.065, 1.13],
						[-66.876, 1.253],
						[-66.326, .724],
						[-65.548, .789],
						[-65.355, 1.095],
						[-64.611, 1.329],
						[-64.199, 1.493],
						[-64.083, 1.916],
						[-63.369, 2.201],
						[-63.423, 2.411],
						[-64.27, 2.497],
						[-64.409, 3.127],
						[-64.368, 3.797],
						[-64.816, 4.056],
						[-64.629, 4.148],
						[-63.888, 4.021],
						[-63.093, 3.771],
						[-62.805, 4.007],
						[-62.085, 4.162],
						[-60.967, 4.536],
						[-60.601, 4.918],
						[-60.734, 5.2],
						[-60.214, 5.244],
						[-59.981, 5.014],
						[-60.111, 4.575],
						[-59.767, 4.424],
						[-59.538, 3.959],
						[-59.815, 3.606],
						[-59.975, 2.755],
						[-59.719, 2.25],
						[-59.646, 1.787],
						[-59.031, 1.318],
						[-58.54, 1.268],
						[-58.429, 1.464],
						[-58.113, 1.507],
						[-57.661, 1.683],
						[-57.336, 1.949],
						[-56.783, 1.864],
						[-56.539, 1.9],
						[-55.996, 1.818],
						[-55.906, 2.022],
						[-56.073, 2.221],
						[-55.973, 2.51],
						[-55.57, 2.422],
						[-55.098, 2.524],
						[-54.525, 2.312],
						[-54.088, 2.106],
						[-53.779, 2.377],
						[-53.555, 2.335],
						[-53.418, 2.053],
						[-52.94, 2.125],
						[-52.556, 2.505],
						[-52.249, 3.241],
						[-51.658, 4.156],
						[-51.317, 4.203],
						[-51.07, 3.65],
						[-50.509, 1.902],
						[-49.974, 1.736],
						[-49.947, 1.046],
						[-50.699, .223],
						[-50.388, -.078],
						[-48.621, -.235],
						[-48.584, -1.238],
						[-47.825, -.582],
						[-46.567, -.941],
						[-44.906, -1.552],
						[-44.418, -2.138],
						[-44.582, -2.691],
						[-43.419, -2.383],
						[-41.473, -2.912],
						[-39.979, -2.873],
						[-38.5, -3.701],
						[-37.223, -4.821],
						[-36.453, -5.109],
						[-35.598, -5.15],
						[-35.235, -5.465],
						[-34.896, -6.738],
						[-34.73, -7.343],
						[-35.128, -8.996],
						[-35.637, -9.649],
						[-37.047, -11.041],
						[-37.684, -12.171],
						[-38.424, -13.038],
						[-38.674, -13.058],
						[-38.953, -13.793],
						[-38.882, -15.667],
						[-39.161, -17.208],
						[-39.267, -17.868],
						[-39.584, -18.262],
						[-39.761, -19.599],
						[-40.775, -20.905],
						[-40.945, -21.937],
						[-41.754, -22.371],
						[-41.988, -22.97],
						[-43.075, -22.968],
						[-44.648, -23.352],
						[-45.352, -23.797],
						[-46.472, -24.089],
						[-47.649, -24.885],
						[-48.495, -25.877],
						[-48.641, -26.624],
						[-48.475, -27.176],
						[-48.662, -28.186],
						[-48.888, -28.674],
						[-49.587, -29.224],
						[-50.697, -30.984],
						[-51.576, -31.778],
						[-52.256, -32.245],
						[-52.712, -33.197],
						[-53.374, -33.768]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "玻利维亚",
					"x": -64.593433,
					"y": -16.666015,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-69.53, -10.952],
						[-68.786, -11.036],
						[-68.271, -11.015],
						[-68.048, -10.712],
						[-67.174, -10.307],
						[-66.647, -9.931],
						[-65.338, -9.762],
						[-65.445, -10.511],
						[-65.322, -10.896],
						[-65.402, -11.566],
						[-64.316, -12.462],
						[-63.196, -12.627],
						[-62.803, -13.001],
						[-62.127, -13.199],
						[-61.713, -13.489],
						[-61.084, -13.479],
						[-60.503, -13.776],
						[-60.459, -14.354],
						[-60.264, -14.646],
						[-60.251, -15.077],
						[-60.543, -15.094],
						[-60.158, -16.258],
						[-58.241, -16.3],
						[-58.388, -16.877],
						[-58.281, -17.272],
						[-57.735, -17.552],
						[-57.498, -18.174],
						[-57.676, -18.962],
						[-57.95, -19.4],
						[-57.854, -19.97],
						[-58.166, -20.177],
						[-58.183, -19.868],
						[-59.115, -19.357],
						[-60.044, -19.343],
						[-61.786, -19.634],
						[-62.266, -20.514],
						[-62.291, -21.052],
						[-62.685, -22.249],
						[-62.846, -22.035],
						[-63.987, -21.994],
						[-64.377, -22.798],
						[-64.965, -22.076],
						[-66.273, -21.832],
						[-67.107, -22.736],
						[-67.828, -22.873],
						[-68.22, -21.494],
						[-68.757, -20.373],
						[-68.442, -19.405],
						[-68.967, -18.982],
						[-69.1, -18.26],
						[-69.59, -17.58],
						[-68.96, -16.501],
						[-69.39, -15.66],
						[-69.16, -15.324],
						[-69.34, -14.953],
						[-68.949, -14.454],
						[-68.929, -13.603],
						[-68.88, -12.9],
						[-68.665, -12.561],
						[-69.53, -10.952]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "秘鲁",
					"x": -72.90016,
					"y": -12.976679,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-69.894, -4.298],
						[-70.795, -4.251],
						[-70.929, -4.402],
						[-71.748, -4.594],
						[-72.892, -5.275],
						[-72.965, -5.741],
						[-73.22, -6.089],
						[-73.12, -6.63],
						[-73.724, -6.919],
						[-73.723, -7.341],
						[-73.987, -7.524],
						[-73.571, -8.424],
						[-73.015, -9.033],
						[-73.227, -9.462],
						[-72.563, -9.52],
						[-72.185, -10.054],
						[-71.302, -10.079],
						[-70.482, -9.49],
						[-70.549, -11.009],
						[-70.094, -11.124],
						[-69.53, -10.952],
						[-68.665, -12.561],
						[-68.88, -12.9],
						[-68.929, -13.603],
						[-68.949, -14.454],
						[-69.34, -14.953],
						[-69.16, -15.324],
						[-69.39, -15.66],
						[-68.96, -16.501],
						[-69.59, -17.58],
						[-69.858, -18.093],
						[-70.373, -18.348],
						[-71.375, -17.774],
						[-71.462, -17.363],
						[-73.445, -16.359],
						[-75.238, -15.266],
						[-76.009, -14.649],
						[-76.423, -13.823],
						[-76.259, -13.535],
						[-77.106, -12.223],
						[-78.092, -10.378],
						[-79.037, -8.387],
						[-79.446, -7.931],
						[-79.761, -7.194],
						[-80.537, -6.542],
						[-81.25, -6.137],
						[-80.926, -5.691],
						[-81.411, -4.737],
						[-81.1, -4.036],
						[-80.303, -3.405],
						[-80.184, -3.821],
						[-80.469, -4.059],
						[-80.442, -4.426],
						[-80.029, -4.346],
						[-79.625, -4.454],
						[-79.205, -4.959],
						[-78.64, -4.548],
						[-78.451, -3.873],
						[-77.838, -3.003],
						[-76.635, -2.609],
						[-75.545, -1.562],
						[-75.234, -.911],
						[-75.373, -.152],
						[-75.107, -.057],
						[-74.442, -.531],
						[-74.122, -1.003],
						[-73.66, -1.26],
						[-73.07, -2.309],
						[-72.326, -2.434],
						[-71.775, -2.17],
						[-71.414, -2.343],
						[-70.813, -2.257],
						[-70.048, -2.725],
						[-70.693, -3.743],
						[-70.394, -3.767],
						[-69.894, -4.298]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "哥伦比亚",
					"x": -73.174347,
					"y": 3.373111,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-66.876, 1.253],
						[-67.065, 1.13],
						[-67.26, 1.72],
						[-67.538, 2.037],
						[-67.869, 1.692],
						[-69.817, 1.715],
						[-69.805, 1.089],
						[-69.219, .986],
						[-69.252, .603],
						[-69.452, .706],
						[-70.016, .541],
						[-70.021, -.185],
						[-69.577, -.55],
						[-69.42, -1.123],
						[-69.444, -1.556],
						[-69.894, -4.298],
						[-70.394, -3.767],
						[-70.693, -3.743],
						[-70.048, -2.725],
						[-70.813, -2.257],
						[-71.414, -2.343],
						[-71.775, -2.17],
						[-72.326, -2.434],
						[-73.07, -2.309],
						[-73.66, -1.26],
						[-74.122, -1.003],
						[-74.442, -.531],
						[-75.107, -.057],
						[-75.373, -.152],
						[-75.801, .085],
						[-76.292, .416],
						[-76.576, .257],
						[-77.425, .396],
						[-77.669, .826],
						[-77.855, .81],
						[-78.855, 1.381],
						[-78.991, 1.691],
						[-78.618, 1.766],
						[-78.662, 2.267],
						[-78.428, 2.63],
						[-77.932, 2.697],
						[-77.51, 3.325],
						[-77.128, 3.85],
						[-77.496, 4.088],
						[-77.308, 4.668],
						[-77.533, 5.583],
						[-77.319, 5.845],
						[-77.477, 6.691],
						[-77.882, 7.224],
						[-77.753, 7.71],
						[-77.431, 7.638],
						[-77.243, 7.935],
						[-77.475, 8.524],
						[-77.353, 8.671],
						[-76.837, 8.639],
						[-76.086, 9.337],
						[-75.675, 9.443],
						[-75.665, 9.774],
						[-75.48, 10.619],
						[-74.907, 11.083],
						[-74.277, 11.102],
						[-74.197, 11.31],
						[-73.415, 11.227],
						[-72.628, 11.732],
						[-72.238, 11.956],
						[-71.754, 12.437],
						[-71.4, 12.376],
						[-71.137, 12.113],
						[-71.332, 11.776],
						[-71.974, 11.609],
						[-72.228, 11.109],
						[-72.615, 10.822],
						[-72.905, 10.45],
						[-73.028, 9.737],
						[-73.305, 9.152],
						[-72.789, 9.085],
						[-72.66, 8.625],
						[-72.44, 8.405],
						[-72.361, 8.003],
						[-72.48, 7.633],
						[-72.444, 7.424],
						[-72.198, 7.34],
						[-71.96, 6.992],
						[-70.674, 7.088],
						[-70.093, 6.96],
						[-69.389, 6.1],
						[-68.985, 6.207],
						[-68.265, 6.153],
						[-67.695, 6.267],
						[-67.341, 6.095],
						[-67.522, 5.557],
						[-67.745, 5.221],
						[-67.823, 4.504],
						[-67.622, 3.839],
						[-67.338, 3.542],
						[-67.303, 3.318],
						[-67.81, 2.821],
						[-67.447, 2.6],
						[-67.181, 2.251],
						[-66.876, 1.253]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "巴拿马",
					"x": -80.352106,
					"y": 8.72198,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-77.353, 8.671],
						[-77.475, 8.524],
						[-77.243, 7.935],
						[-77.431, 7.638],
						[-77.753, 7.71],
						[-77.882, 7.224],
						[-78.215, 7.512],
						[-78.429, 8.052],
						[-78.182, 8.319],
						[-78.435, 8.388],
						[-78.622, 8.718],
						[-79.12, 8.996],
						[-79.558, 8.932],
						[-79.761, 8.585],
						[-80.164, 8.333],
						[-80.383, 8.298],
						[-80.481, 8.09],
						[-80.004, 7.548],
						[-80.277, 7.42],
						[-80.421, 7.272],
						[-80.886, 7.221],
						[-81.06, 7.818],
						[-81.19, 7.648],
						[-81.52, 7.707],
						[-81.721, 8.109],
						[-82.131, 8.175],
						[-82.391, 8.292],
						[-82.82, 8.291],
						[-82.851, 8.074],
						[-82.966, 8.225],
						[-82.913, 8.424],
						[-82.83, 8.626],
						[-82.869, 8.807],
						[-82.719, 8.926],
						[-82.927, 9.074],
						[-82.933, 9.477],
						[-82.546, 9.566],
						[-82.187, 9.207],
						[-82.208, 8.996],
						[-81.809, 8.951],
						[-81.714, 9.032],
						[-81.439, 8.786],
						[-80.947, 8.859],
						[-80.522, 9.111],
						[-79.915, 9.313],
						[-79.573, 9.612],
						[-79.021, 9.553],
						[-79.058, 9.455],
						[-78.501, 9.42],
						[-78.056, 9.248],
						[-77.73, 8.947],
						[-77.353, 8.671]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "哥斯达黎加",
					"x": -84.077922,
					"y": 10.0651,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-82.546, 9.566],
						[-82.933, 9.477],
						[-82.927, 9.074],
						[-82.719, 8.926],
						[-82.869, 8.807],
						[-82.83, 8.626],
						[-82.913, 8.424],
						[-82.966, 8.225],
						[-83.508, 8.447],
						[-83.711, 8.657],
						[-83.596, 8.83],
						[-83.633, 9.051],
						[-83.91, 9.291],
						[-84.303, 9.487],
						[-84.648, 9.616],
						[-84.713, 9.908],
						[-84.976, 10.087],
						[-84.911, 9.796],
						[-85.111, 9.557],
						[-85.339, 9.835],
						[-85.661, 9.933],
						[-85.797, 10.135],
						[-85.792, 10.439],
						[-85.659, 10.754],
						[-85.942, 10.895],
						[-85.713, 11.088],
						[-85.562, 11.217],
						[-84.903, 10.952],
						[-84.673, 11.083],
						[-84.356, 10.999],
						[-84.19, 10.793],
						[-83.895, 10.727],
						[-83.656, 10.939],
						[-83.402, 10.395],
						[-83.016, 9.993],
						[-82.546, 9.566]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "尼加拉瓜",
					"x": -85.069347,
					"y": 12.670697,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-83.656, 10.939],
						[-83.895, 10.727],
						[-84.19, 10.793],
						[-84.356, 10.999],
						[-84.673, 11.083],
						[-84.903, 10.952],
						[-85.562, 11.217],
						[-85.713, 11.088],
						[-86.058, 11.403],
						[-86.526, 11.807],
						[-86.746, 12.144],
						[-87.168, 12.458],
						[-87.668, 12.91],
						[-87.557, 13.065],
						[-87.392, 12.914],
						[-87.317, 12.985],
						[-87.006, 13.026],
						[-86.881, 13.254],
						[-86.734, 13.263],
						[-86.755, 13.755],
						[-86.521, 13.778],
						[-86.312, 13.771],
						[-86.096, 14.038],
						[-85.801, 13.836],
						[-85.699, 13.96],
						[-85.514, 14.079],
						[-85.165, 14.354],
						[-85.149, 14.56],
						[-85.053, 14.552],
						[-84.925, 14.79],
						[-84.82, 14.82],
						[-84.65, 14.667],
						[-84.449, 14.622],
						[-84.228, 14.749],
						[-83.976, 14.749],
						[-83.629, 14.88],
						[-83.49, 15.016],
						[-83.147, 14.996],
						[-83.233, 14.9],
						[-83.284, 14.677],
						[-83.182, 14.311],
						[-83.412, 13.97],
						[-83.52, 13.568],
						[-83.552, 13.127],
						[-83.499, 12.869],
						[-83.473, 12.419],
						[-83.626, 12.321],
						[-83.72, 11.893],
						[-83.651, 11.629],
						[-83.855, 11.373],
						[-83.809, 11.103],
						[-83.656, 10.939]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "洪都拉斯",
					"x": -86.887604,
					"y": 14.794801,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-83.147, 14.996],
						[-83.49, 15.016],
						[-83.629, 14.88],
						[-83.976, 14.749],
						[-84.228, 14.749],
						[-84.449, 14.622],
						[-84.65, 14.667],
						[-84.82, 14.82],
						[-84.925, 14.79],
						[-85.053, 14.552],
						[-85.149, 14.56],
						[-85.165, 14.354],
						[-85.514, 14.079],
						[-85.699, 13.96],
						[-85.801, 13.836],
						[-86.096, 14.038],
						[-86.312, 13.771],
						[-86.521, 13.778],
						[-86.755, 13.755],
						[-86.734, 13.263],
						[-86.881, 13.254],
						[-87.006, 13.026],
						[-87.317, 12.985],
						[-87.489, 13.298],
						[-87.793, 13.384],
						[-87.724, 13.785],
						[-87.86, 13.893],
						[-88.065, 13.965],
						[-88.504, 13.845],
						[-88.541, 13.98],
						[-88.843, 14.141],
						[-89.059, 14.34],
						[-89.353, 14.424],
						[-89.146, 14.678],
						[-89.225, 14.874],
						[-89.155, 15.066],
						[-88.681, 15.346],
						[-88.225, 15.728],
						[-88.121, 15.689],
						[-87.902, 15.864],
						[-87.616, 15.879],
						[-87.523, 15.797],
						[-87.368, 15.847],
						[-86.903, 15.757],
						[-86.441, 15.783],
						[-86.119, 15.893],
						[-86.002, 16.005],
						[-85.683, 15.954],
						[-85.444, 15.886],
						[-85.182, 15.909],
						[-84.984, 15.996],
						[-84.527, 15.857],
						[-84.368, 15.835],
						[-84.063, 15.648],
						[-83.774, 15.424],
						[-83.41, 15.271],
						[-83.147, 14.996]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "萨尔瓦多",
					"x": -88.890124,
					"y": 13.685371,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-89.353, 14.424],
						[-89.059, 14.34],
						[-88.843, 14.141],
						[-88.541, 13.98],
						[-88.504, 13.845],
						[-88.065, 13.965],
						[-87.86, 13.893],
						[-87.724, 13.785],
						[-87.793, 13.384],
						[-87.904, 13.149],
						[-88.483, 13.164],
						[-88.843, 13.26],
						[-89.257, 13.459],
						[-89.812, 13.521],
						[-90.096, 13.735],
						[-90.065, 13.882],
						[-89.722, 14.134],
						[-89.534, 14.245],
						[-89.587, 14.363],
						[-89.353, 14.424]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "危地马拉",
					"x": -90.497134,
					"y": 14.982133,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-92.228, 14.539],
						[-92.203, 14.83],
						[-92.087, 15.065],
						[-92.229, 15.251],
						[-91.748, 16.067],
						[-90.464, 16.07],
						[-90.439, 16.41],
						[-90.601, 16.471],
						[-90.712, 16.687],
						[-91.082, 16.918],
						[-91.454, 17.252],
						[-91.002, 17.255],
						[-91.002, 17.818],
						[-90.068, 17.819],
						[-89.143, 17.808],
						[-89.151, 17.016],
						[-89.229, 15.887],
						[-88.931, 15.887],
						[-88.605, 15.706],
						[-88.518, 15.855],
						[-88.225, 15.728],
						[-88.681, 15.346],
						[-89.155, 15.066],
						[-89.225, 14.874],
						[-89.146, 14.678],
						[-89.353, 14.424],
						[-89.587, 14.363],
						[-89.534, 14.245],
						[-89.722, 14.134],
						[-90.065, 13.882],
						[-90.096, 13.735],
						[-90.609, 13.91],
						[-91.232, 13.928],
						[-91.69, 14.126],
						[-92.228, 14.539]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "伯利兹",
					"x": -88.712962,
					"y": 17.202068,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-89.143, 17.808],
						[-89.151, 17.955],
						[-89.03, 18.002],
						[-88.848, 17.883],
						[-88.49, 18.487],
						[-88.3, 18.5],
						[-88.296, 18.353],
						[-88.107, 18.349],
						[-88.123, 18.077],
						[-88.285, 17.644],
						[-88.198, 17.489],
						[-88.303, 17.132],
						[-88.24, 17.036],
						[-88.355, 16.531],
						[-88.552, 16.265],
						[-88.732, 16.234],
						[-88.931, 15.887],
						[-89.229, 15.887],
						[-89.151, 17.016],
						[-89.143, 17.808]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "委内瑞拉",
					"x": -64.599381,
					"y": 7.182476,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-60.734, 5.2],
						[-60.601, 4.918],
						[-60.967, 4.536],
						[-62.085, 4.162],
						[-62.805, 4.007],
						[-63.093, 3.771],
						[-63.888, 4.021],
						[-64.629, 4.148],
						[-64.816, 4.056],
						[-64.368, 3.797],
						[-64.409, 3.127],
						[-64.27, 2.497],
						[-63.423, 2.411],
						[-63.369, 2.201],
						[-64.083, 1.916],
						[-64.199, 1.493],
						[-64.611, 1.329],
						[-65.355, 1.095],
						[-65.548, .789],
						[-66.326, .724],
						[-66.876, 1.253],
						[-67.181, 2.251],
						[-67.447, 2.6],
						[-67.81, 2.821],
						[-67.303, 3.318],
						[-67.338, 3.542],
						[-67.622, 3.839],
						[-67.823, 4.504],
						[-67.745, 5.221],
						[-67.522, 5.557],
						[-67.341, 6.095],
						[-67.695, 6.267],
						[-68.265, 6.153],
						[-68.985, 6.207],
						[-69.389, 6.1],
						[-70.093, 6.96],
						[-70.674, 7.088],
						[-71.96, 6.992],
						[-72.198, 7.34],
						[-72.444, 7.424],
						[-72.48, 7.633],
						[-72.361, 8.003],
						[-72.44, 8.405],
						[-72.66, 8.625],
						[-72.789, 9.085],
						[-73.305, 9.152],
						[-73.028, 9.737],
						[-72.905, 10.45],
						[-72.615, 10.822],
						[-72.228, 11.109],
						[-71.974, 11.609],
						[-71.332, 11.776],
						[-71.36, 11.54],
						[-71.947, 11.423],
						[-71.621, 10.969],
						[-71.633, 10.446],
						[-72.074, 9.866],
						[-71.696, 9.072],
						[-71.265, 9.137],
						[-71.04, 9.86],
						[-71.35, 10.212],
						[-71.401, 10.969],
						[-70.155, 11.375],
						[-70.294, 11.847],
						[-69.943, 12.162],
						[-69.584, 11.46],
						[-68.883, 11.443],
						[-68.233, 10.886],
						[-68.194, 10.555],
						[-67.296, 10.546],
						[-66.228, 10.649],
						[-65.655, 10.201],
						[-64.89, 10.077],
						[-64.329, 10.39],
						[-64.318, 10.641],
						[-63.079, 10.702],
						[-61.881, 10.716],
						[-62.73, 10.42],
						[-62.389, 9.948],
						[-61.589, 9.873],
						[-60.831, 9.381],
						[-60.671, 8.58],
						[-60.15, 8.603],
						[-59.758, 8.367],
						[-60.551, 7.78],
						[-60.638, 7.415],
						[-60.296, 7.044],
						[-60.544, 6.857],
						[-61.159, 6.696],
						[-61.139, 6.234],
						[-61.41, 5.959],
						[-60.734, 5.2]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "圭亚那",
					"x": -58.942643,
					"y": 5.124317,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-56.539, 1.9],
						[-56.783, 1.864],
						[-57.336, 1.949],
						[-57.661, 1.683],
						[-58.113, 1.507],
						[-58.429, 1.464],
						[-58.54, 1.268],
						[-59.031, 1.318],
						[-59.646, 1.787],
						[-59.719, 2.25],
						[-59.975, 2.755],
						[-59.815, 3.606],
						[-59.538, 3.959],
						[-59.767, 4.424],
						[-60.111, 4.575],
						[-59.981, 5.014],
						[-60.214, 5.244],
						[-60.734, 5.2],
						[-61.41, 5.959],
						[-61.139, 6.234],
						[-61.159, 6.696],
						[-60.544, 6.857],
						[-60.296, 7.044],
						[-60.638, 7.415],
						[-60.551, 7.78],
						[-59.758, 8.367],
						[-59.102, 7.999],
						[-58.483, 7.348],
						[-58.455, 6.833],
						[-58.078, 6.809],
						[-57.542, 6.321],
						[-57.147, 5.973],
						[-57.307, 5.074],
						[-57.914, 4.813],
						[-57.86, 4.577],
						[-58.045, 4.061],
						[-57.602, 3.335],
						[-57.281, 3.333],
						[-57.15, 2.769],
						[-56.539, 1.9]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "苏里南",
					"x": -55.91094,
					"y": 4.143987,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-54.525, 2.312],
						[-55.098, 2.524],
						[-55.57, 2.422],
						[-55.973, 2.51],
						[-56.073, 2.221],
						[-55.906, 2.022],
						[-55.996, 1.818],
						[-56.539, 1.9],
						[-57.15, 2.769],
						[-57.281, 3.333],
						[-57.602, 3.335],
						[-58.045, 4.061],
						[-57.86, 4.577],
						[-57.914, 4.813],
						[-57.307, 5.074],
						[-57.147, 5.973],
						[-55.949, 5.773],
						[-55.842, 5.953],
						[-55.033, 6.025],
						[-53.958, 5.757],
						[-54.479, 4.897],
						[-54.4, 4.213],
						[-54.007, 3.62],
						[-54.182, 3.19],
						[-54.27, 2.732],
						[-54.525, 2.312]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "法国",
					"x": 2.552275,
					"y": 46.696113,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[-51.658, 4.156],
							[-52.249, 3.241],
							[-52.556, 2.505],
							[-52.94, 2.125],
							[-53.418, 2.053],
							[-53.555, 2.335],
							[-53.779, 2.377],
							[-54.088, 2.106],
							[-54.525, 2.312],
							[-54.27, 2.732],
							[-54.182, 3.19],
							[-54.007, 3.62],
							[-54.4, 4.213],
							[-54.479, 4.897],
							[-53.958, 5.757],
							[-53.618, 5.647],
							[-52.882, 5.41],
							[-51.823, 4.566],
							[-51.658, 4.156]
						]],
						[[
							[6.186, 49.464],
							[6.658, 49.202],
							[8.099, 49.018],
							[7.594, 48.333],
							[7.467, 47.621],
							[7.192, 47.45],
							[6.737, 47.542],
							[6.769, 47.288],
							[6.037, 46.726],
							[6.023, 46.273],
							[6.5, 46.43],
							[6.844, 45.991],
							[6.802, 45.709],
							[7.097, 45.333],
							[6.75, 45.029],
							[7.008, 44.255],
							[7.55, 44.128],
							[7.435, 43.694],
							[6.529, 43.129],
							[4.557, 43.4],
							[3.1, 43.075],
							[2.986, 42.473],
							[1.827, 42.343],
							[.702, 42.796],
							[.338, 42.58],
							[-1.503, 43.034],
							[-1.901, 43.423],
							[-1.384, 44.023],
							[-1.194, 46.015],
							[-2.226, 47.064],
							[-2.963, 47.57],
							[-4.492, 47.955],
							[-4.592, 48.684],
							[-3.296, 48.902],
							[-1.617, 48.644],
							[-1.933, 49.776],
							[-.989, 49.347],
							[1.339, 50.127],
							[1.639, 50.947],
							[2.514, 51.149],
							[2.658, 50.797],
							[3.123, 50.78],
							[3.588, 50.379],
							[4.286, 49.907],
							[4.799, 49.985],
							[5.674, 49.529],
							[5.898, 49.443],
							[6.186, 49.464]
						]],
						[[
							[8.746, 42.628],
							[9.39, 43.01],
							[9.56, 42.152],
							[9.23, 41.38],
							[8.776, 41.584],
							[8.544, 42.257],
							[8.746, 42.628]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "厄瓜多尔",
					"x": -78.188375,
					"y": -1.259076,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-75.373, -.152],
						[-75.234, -.911],
						[-75.545, -1.562],
						[-76.635, -2.609],
						[-77.838, -3.003],
						[-78.451, -3.873],
						[-78.64, -4.548],
						[-79.205, -4.959],
						[-79.625, -4.454],
						[-80.029, -4.346],
						[-80.442, -4.426],
						[-80.469, -4.059],
						[-80.184, -3.821],
						[-80.303, -3.405],
						[-79.77, -2.658],
						[-79.987, -2.221],
						[-80.369, -2.685],
						[-80.968, -2.247],
						[-80.765, -1.965],
						[-80.934, -1.057],
						[-80.583, -.907],
						[-80.399, -.284],
						[-80.021, .36],
						[-80.091, .768],
						[-79.543, .983],
						[-78.855, 1.381],
						[-77.855, .81],
						[-77.669, .826],
						[-77.425, .396],
						[-76.576, .257],
						[-76.292, .416],
						[-75.801, .085],
						[-75.373, -.152]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "波多黎各",
					"x": -66.481065,
					"y": 18.234668,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-66.282, 18.515],
						[-65.771, 18.427],
						[-65.591, 18.228],
						[-65.847, 17.976],
						[-66.6, 17.982],
						[-67.184, 17.947],
						[-67.242, 18.374],
						[-67.101, 18.521],
						[-66.282, 18.515]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "牙买加",
					"x": -77.318767,
					"y": 18.137124,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-77.57, 18.491],
						[-76.897, 18.401],
						[-76.365, 18.161],
						[-76.2, 17.887],
						[-76.903, 17.868],
						[-77.206, 17.701],
						[-77.766, 17.862],
						[-78.338, 18.226],
						[-78.218, 18.455],
						[-77.797, 18.524],
						[-77.57, 18.491]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "古巴",
					"x": -77.975855,
					"y": 21.334024,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-82.268, 23.189],
						[-81.404, 23.117],
						[-80.619, 23.106],
						[-79.68, 22.765],
						[-79.281, 22.399],
						[-78.347, 22.512],
						[-77.993, 22.277],
						[-77.146, 21.658],
						[-76.524, 21.207],
						[-76.195, 21.221],
						[-75.598, 21.017],
						[-75.671, 20.735],
						[-74.934, 20.694],
						[-74.178, 20.285],
						[-74.297, 20.05],
						[-74.962, 19.923],
						[-75.635, 19.874],
						[-76.324, 19.953],
						[-77.755, 19.855],
						[-77.085, 20.413],
						[-77.493, 20.673],
						[-78.137, 20.74],
						[-78.483, 21.029],
						[-78.72, 21.598],
						[-79.285, 21.559],
						[-80.217, 21.827],
						[-80.518, 22.037],
						[-81.821, 22.192],
						[-82.17, 22.387],
						[-81.795, 22.637],
						[-82.776, 22.688],
						[-83.494, 22.169],
						[-83.909, 22.155],
						[-84.052, 21.911],
						[-84.547, 21.801],
						[-84.975, 21.896],
						[-84.447, 22.205],
						[-84.23, 22.566],
						[-83.778, 22.788],
						[-83.268, 22.983],
						[-82.51, 23.079],
						[-82.268, 23.189]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "津巴布韦",
					"x": 29.925444,
					"y": -18.91164,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[31.191, -22.252],
						[30.66, -22.152],
						[30.323, -22.272],
						[29.839, -22.102],
						[29.432, -22.091],
						[28.795, -21.639],
						[28.021, -21.486],
						[27.727, -20.852],
						[27.725, -20.499],
						[27.297, -20.392],
						[26.165, -19.293],
						[25.85, -18.714],
						[25.649, -18.536],
						[25.264, -17.737],
						[26.382, -17.846],
						[26.707, -17.961],
						[27.044, -17.938],
						[27.598, -17.291],
						[28.468, -16.468],
						[28.826, -16.39],
						[28.947, -16.043],
						[29.517, -15.645],
						[30.274, -15.508],
						[30.339, -15.881],
						[31.173, -15.861],
						[31.636, -16.072],
						[31.852, -16.319],
						[32.328, -16.392],
						[32.848, -16.713],
						[32.85, -17.979],
						[32.655, -18.672],
						[32.612, -19.419],
						[32.773, -19.716],
						[32.66, -20.304],
						[32.509, -20.395],
						[32.245, -21.116],
						[31.191, -22.252]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "博茨瓦纳",
					"x": 24.179216,
					"y": -22.102634,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[29.432, -22.091],
						[28.017, -22.828],
						[27.119, -23.574],
						[26.786, -24.241],
						[26.486, -24.616],
						[25.942, -24.696],
						[25.766, -25.175],
						[25.665, -25.487],
						[25.025, -25.72],
						[24.211, -25.67],
						[23.734, -25.39],
						[23.312, -25.269],
						[22.824, -25.5],
						[22.58, -25.979],
						[22.106, -26.28],
						[21.606, -26.727],
						[20.89, -26.829],
						[20.666, -26.477],
						[20.759, -25.868],
						[20.166, -24.918],
						[19.896, -24.768],
						[19.895, -21.849],
						[20.881, -21.814],
						[20.911, -18.252],
						[21.655, -18.219],
						[23.197, -17.869],
						[23.579, -18.281],
						[24.217, -17.889],
						[24.521, -17.887],
						[25.084, -17.662],
						[25.264, -17.737],
						[25.649, -18.536],
						[25.85, -18.714],
						[26.165, -19.293],
						[27.297, -20.392],
						[27.725, -20.499],
						[27.727, -20.852],
						[28.021, -21.486],
						[28.795, -21.639],
						[29.432, -22.091]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "纳米比亚",
					"x": 17.108166,
					"y": -20.575298,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[19.896, -24.768],
						[19.895, -28.461],
						[19.002, -28.972],
						[18.465, -29.045],
						[17.836, -28.856],
						[17.387, -28.784],
						[17.219, -28.356],
						[16.824, -28.082],
						[16.345, -28.577],
						[15.602, -27.821],
						[15.21, -27.091],
						[14.99, -26.117],
						[14.743, -25.393],
						[14.408, -23.853],
						[14.386, -22.657],
						[14.258, -22.111],
						[13.869, -21.699],
						[13.352, -20.873],
						[12.827, -19.673],
						[12.609, -19.045],
						[11.795, -18.069],
						[11.734, -17.302],
						[12.215, -17.112],
						[12.814, -16.941],
						[13.462, -16.971],
						[14.059, -17.423],
						[14.21, -17.353],
						[18.263, -17.31],
						[18.956, -17.789],
						[21.377, -17.931],
						[23.215, -17.523],
						[24.034, -17.296],
						[24.682, -17.353],
						[25.077, -17.579],
						[25.084, -17.662],
						[24.521, -17.887],
						[24.217, -17.889],
						[23.579, -18.281],
						[23.197, -17.869],
						[21.655, -18.219],
						[20.911, -18.252],
						[20.881, -21.814],
						[19.895, -21.849],
						[19.896, -24.768]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "塞内加尔",
					"x": -14.778586,
					"y": 15.138125,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-16.714, 13.595],
						[-17.126, 14.374],
						[-17.625, 14.73],
						[-17.185, 14.919],
						[-16.701, 15.622],
						[-16.463, 16.135],
						[-16.121, 16.456],
						[-15.624, 16.369],
						[-15.136, 16.587],
						[-14.577, 16.598],
						[-14.1, 16.304],
						[-13.436, 16.039],
						[-12.831, 15.304],
						[-12.171, 14.617],
						[-12.125, 13.995],
						[-11.928, 13.422],
						[-11.553, 13.141],
						[-11.468, 12.755],
						[-11.514, 12.443],
						[-11.658, 12.387],
						[-12.204, 12.466],
						[-12.279, 12.354],
						[-12.499, 12.332],
						[-13.218, 12.576],
						[-13.7, 12.586],
						[-15.548, 12.628],
						[-15.817, 12.516],
						[-16.148, 12.548],
						[-16.677, 12.385],
						[-16.842, 13.151],
						[-15.931, 13.13],
						[-15.691, 13.27],
						[-15.512, 13.279],
						[-15.141, 13.51],
						[-14.712, 13.298],
						[-14.278, 13.281],
						[-13.845, 13.505],
						[-14.047, 13.794],
						[-14.377, 13.626],
						[-14.687, 13.63],
						[-15.082, 13.876],
						[-15.399, 13.86],
						[-15.625, 13.624],
						[-16.714, 13.595]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "马里",
					"x": -2.038455,
					"y": 18.692713,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-11.514, 12.443],
						[-11.468, 12.755],
						[-11.553, 13.141],
						[-11.928, 13.422],
						[-12.125, 13.995],
						[-12.171, 14.617],
						[-11.834, 14.799],
						[-11.666, 15.388],
						[-11.349, 15.411],
						[-10.651, 15.133],
						[-10.087, 15.33],
						[-9.7, 15.264],
						[-9.55, 15.486],
						[-5.538, 15.502],
						[-5.315, 16.202],
						[-5.489, 16.325],
						[-5.971, 20.641],
						[-6.454, 24.957],
						[-4.923, 24.975],
						[-1.55, 22.793],
						[1.823, 20.611],
						[2.061, 20.142],
						[2.684, 19.856],
						[3.147, 19.694],
						[3.158, 19.057],
						[4.267, 19.155],
						[4.27, 16.852],
						[3.723, 16.184],
						[3.638, 15.568],
						[2.75, 15.41],
						[1.386, 15.324],
						[1.016, 14.968],
						[.375, 14.929],
						[-.266, 14.924],
						[-.516, 15.116],
						[-1.066, 14.974],
						[-2.001, 14.559],
						[-2.192, 14.246],
						[-2.968, 13.798],
						[-3.104, 13.541],
						[-3.523, 13.338],
						[-4.006, 13.472],
						[-4.28, 13.228],
						[-4.427, 12.543],
						[-5.221, 11.714],
						[-5.198, 11.375],
						[-5.471, 10.951],
						[-5.404, 10.371],
						[-5.817, 10.223],
						[-6.05, 10.096],
						[-6.205, 10.524],
						[-6.494, 10.411],
						[-6.666, 10.431],
						[-6.851, 10.139],
						[-7.623, 10.147],
						[-7.9, 10.297],
						[-8.03, 10.207],
						[-8.335, 10.495],
						[-8.282, 10.793],
						[-8.407, 10.909],
						[-8.62, 10.811],
						[-8.581, 11.136],
						[-8.376, 11.394],
						[-8.786, 11.813],
						[-8.905, 12.088],
						[-9.127, 12.308],
						[-9.328, 12.334],
						[-9.568, 12.194],
						[-9.891, 12.06],
						[-10.165, 11.844],
						[-10.593, 11.924],
						[-10.871, 12.178],
						[-11.037, 12.211],
						[-11.298, 12.078],
						[-11.456, 12.077],
						[-11.514, 12.443]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "毛里塔尼亚",
					"x": -9.740299,
					"y": 19.587062,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-17.063, 21],
						[-16.845, 21.333],
						[-12.929, 21.327],
						[-13.119, 22.771],
						[-12.874, 23.285],
						[-11.937, 23.375],
						[-11.969, 25.933],
						[-8.687, 25.881],
						[-8.684, 27.396],
						[-4.923, 24.975],
						[-6.454, 24.957],
						[-5.971, 20.641],
						[-5.489, 16.325],
						[-5.315, 16.202],
						[-5.538, 15.502],
						[-9.55, 15.486],
						[-9.7, 15.264],
						[-10.087, 15.33],
						[-10.651, 15.133],
						[-11.349, 15.411],
						[-11.666, 15.388],
						[-11.834, 14.799],
						[-12.171, 14.617],
						[-12.831, 15.304],
						[-13.436, 16.039],
						[-14.1, 16.304],
						[-14.577, 16.598],
						[-15.136, 16.587],
						[-15.624, 16.369],
						[-16.121, 16.456],
						[-16.463, 16.135],
						[-16.55, 16.674],
						[-16.271, 17.167],
						[-16.146, 18.108],
						[-16.257, 19.097],
						[-16.378, 19.594],
						[-16.278, 20.093],
						[-16.536, 20.568],
						[-17.063, 21]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "贝宁",
					"x": 2.352018,
					"y": 10.324775,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[2.692, 6.259],
						[1.865, 6.142],
						[1.619, 6.832],
						[1.664, 9.129],
						[1.463, 9.335],
						[1.425, 9.825],
						[1.078, 10.176],
						[.772, 10.471],
						[.9, 10.997],
						[1.243, 11.111],
						[1.447, 11.548],
						[1.936, 11.641],
						[2.154, 11.94],
						[2.49, 12.233],
						[2.849, 12.236],
						[3.611, 11.66],
						[3.572, 11.328],
						[3.797, 10.735],
						[3.6, 10.332],
						[3.705, 10.063],
						[3.22, 9.444],
						[2.912, 9.138],
						[2.724, 8.507],
						[2.749, 7.871],
						[2.692, 6.259]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "尼日尔",
					"x": 9.504356,
					"y": 17.446195,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[14.851, 22.863],
						[15.097, 21.309],
						[15.471, 21.048],
						[15.487, 20.73],
						[15.903, 20.388],
						[15.686, 19.957],
						[15.3, 17.928],
						[15.248, 16.627],
						[13.972, 15.684],
						[13.54, 14.367],
						[13.957, 13.997],
						[13.954, 13.353],
						[14.596, 13.33],
						[14.496, 12.859],
						[14.214, 12.802],
						[14.181, 12.484],
						[13.995, 12.462],
						[13.319, 13.556],
						[13.084, 13.596],
						[12.302, 13.037],
						[11.528, 13.329],
						[10.99, 13.387],
						[10.701, 13.247],
						[10.115, 13.277],
						[9.525, 12.851],
						[9.015, 12.827],
						[7.805, 13.344],
						[7.331, 13.098],
						[6.82, 13.115],
						[6.445, 13.493],
						[5.443, 13.866],
						[4.368, 13.747],
						[4.108, 13.531],
						[3.967, 12.956],
						[3.681, 12.553],
						[3.611, 11.66],
						[2.849, 12.236],
						[2.49, 12.233],
						[2.154, 11.94],
						[2.177, 12.625],
						[1.024, 12.852],
						[.993, 13.336],
						[.43, 13.989],
						[.296, 14.444],
						[.375, 14.929],
						[1.016, 14.968],
						[1.386, 15.324],
						[2.75, 15.41],
						[3.638, 15.568],
						[3.723, 16.184],
						[4.27, 16.852],
						[4.267, 19.155],
						[5.678, 19.601],
						[8.573, 21.566],
						[12, 23.472],
						[13.581, 23.041],
						[14.144, 22.491],
						[14.851, 22.863]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "尼日利亚",
					"x": 7.50322,
					"y": 9.439799,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[2.692, 6.259],
						[2.749, 7.871],
						[2.724, 8.507],
						[2.912, 9.138],
						[3.22, 9.444],
						[3.705, 10.063],
						[3.6, 10.332],
						[3.797, 10.735],
						[3.572, 11.328],
						[3.611, 11.66],
						[3.681, 12.553],
						[3.967, 12.956],
						[4.108, 13.531],
						[4.368, 13.747],
						[5.443, 13.866],
						[6.445, 13.493],
						[6.82, 13.115],
						[7.331, 13.098],
						[7.805, 13.344],
						[9.015, 12.827],
						[9.525, 12.851],
						[10.115, 13.277],
						[10.701, 13.247],
						[10.99, 13.387],
						[11.528, 13.329],
						[12.302, 13.037],
						[13.084, 13.596],
						[13.319, 13.556],
						[13.995, 12.462],
						[14.181, 12.484],
						[14.577, 12.085],
						[14.468, 11.905],
						[14.415, 11.572],
						[13.573, 10.799],
						[13.309, 10.16],
						[13.168, 9.641],
						[12.955, 9.418],
						[12.754, 8.718],
						[12.219, 8.306],
						[12.064, 7.8],
						[11.839, 7.397],
						[11.746, 6.981],
						[11.059, 6.644],
						[10.497, 7.055],
						[10.118, 7.039],
						[9.523, 6.453],
						[9.233, 6.444],
						[8.758, 5.48],
						[8.5, 4.772],
						[7.462, 4.412],
						[7.083, 4.465],
						[6.698, 4.241],
						[5.898, 4.262],
						[5.363, 4.888],
						[5.034, 5.612],
						[4.326, 6.271],
						[3.574, 6.258],
						[2.692, 6.259]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "喀麦隆",
					"x": 12.473488,
					"y": 4.585041,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[14.496, 12.859],
						[14.893, 12.219],
						[14.96, 11.556],
						[14.924, 10.891],
						[15.468, 9.982],
						[14.909, 9.992],
						[14.627, 9.921],
						[14.171, 10.021],
						[13.954, 9.549],
						[14.544, 8.966],
						[14.98, 8.796],
						[15.121, 8.382],
						[15.436, 7.693],
						[15.279, 7.422],
						[14.777, 6.408],
						[14.537, 6.227],
						[14.459, 5.452],
						[14.559, 5.031],
						[14.478, 4.733],
						[14.951, 4.21],
						[15.036, 3.851],
						[15.405, 3.335],
						[15.863, 3.014],
						[15.907, 2.557],
						[16.013, 2.268],
						[15.941, 1.728],
						[15.146, 1.964],
						[14.338, 2.228],
						[13.076, 2.267],
						[12.951, 2.322],
						[12.359, 2.193],
						[11.752, 2.327],
						[11.276, 2.261],
						[9.649, 2.284],
						[9.795, 3.073],
						[9.404, 3.735],
						[8.948, 3.904],
						[8.745, 4.352],
						[8.489, 4.496],
						[8.5, 4.772],
						[8.758, 5.48],
						[9.233, 6.444],
						[9.523, 6.453],
						[10.118, 7.039],
						[10.497, 7.055],
						[11.059, 6.644],
						[11.746, 6.981],
						[11.839, 7.397],
						[12.064, 7.8],
						[12.219, 8.306],
						[12.754, 8.718],
						[12.955, 9.418],
						[13.168, 9.641],
						[13.309, 10.16],
						[13.573, 10.799],
						[14.415, 11.572],
						[14.468, 11.905],
						[14.577, 12.085],
						[14.181, 12.484],
						[14.214, 12.802],
						[14.496, 12.859]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "多哥",
					"x": 1.058113,
					"y": 8.80722,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[.9, 10.997],
						[.772, 10.471],
						[1.078, 10.176],
						[1.425, 9.825],
						[1.463, 9.335],
						[1.664, 9.129],
						[1.619, 6.832],
						[1.865, 6.142],
						[1.06, 5.929],
						[.837, 6.28],
						[.57, 6.914],
						[.491, 7.412],
						[.712, 8.312],
						[.461, 8.677],
						[.366, 9.465],
						[.368, 10.191],
						[-.05, 10.707],
						[.024, 11.019],
						[.9, 10.997]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "加纳",
					"x": -1.036941,
					"y": 7.717639,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[.024, 11.019],
						[-.05, 10.707],
						[.368, 10.191],
						[.366, 9.465],
						[.461, 8.677],
						[.712, 8.312],
						[.491, 7.412],
						[.57, 6.914],
						[.837, 6.28],
						[1.06, 5.929],
						[-.508, 5.343],
						[-1.064, 5.001],
						[-1.965, 4.71],
						[-2.856, 4.994],
						[-2.811, 5.389],
						[-3.244, 6.25],
						[-2.984, 7.38],
						[-2.562, 8.22],
						[-2.827, 9.642],
						[-2.964, 10.395],
						[-2.94, 10.963],
						[-1.203, 11.01],
						[-.762, 10.937],
						[-.439, 11.098],
						[.024, 11.019]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "科特迪瓦",
					"x": -5.568618,
					"y": 7.49139,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-8.03, 10.207],
						[-7.9, 10.297],
						[-7.623, 10.147],
						[-6.851, 10.139],
						[-6.666, 10.431],
						[-6.494, 10.411],
						[-6.205, 10.524],
						[-6.05, 10.096],
						[-5.817, 10.223],
						[-5.404, 10.371],
						[-4.955, 10.153],
						[-4.78, 9.822],
						[-4.33, 9.611],
						[-3.98, 9.862],
						[-3.512, 9.9],
						[-2.827, 9.642],
						[-2.562, 8.22],
						[-2.984, 7.38],
						[-3.244, 6.25],
						[-2.811, 5.389],
						[-2.856, 4.994],
						[-3.311, 4.984],
						[-4.009, 5.18],
						[-4.65, 5.168],
						[-5.834, 4.994],
						[-6.529, 4.705],
						[-7.519, 4.338],
						[-7.712, 4.365],
						[-7.635, 5.188],
						[-7.54, 5.313],
						[-7.57, 5.707],
						[-7.994, 6.126],
						[-8.311, 6.193],
						[-8.603, 6.468],
						[-8.385, 6.912],
						[-8.485, 7.395],
						[-8.439, 7.686],
						[-8.281, 7.687],
						[-8.222, 8.123],
						[-8.299, 8.316],
						[-8.203, 8.455],
						[-7.832, 8.576],
						[-8.079, 9.376],
						[-8.31, 9.79],
						[-8.229, 10.129],
						[-8.03, 10.207]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "几内亚",
					"x": -10.016402,
					"y": 10.618516,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-13.7, 12.586],
						[-13.218, 12.576],
						[-12.499, 12.332],
						[-12.279, 12.354],
						[-12.204, 12.466],
						[-11.658, 12.387],
						[-11.514, 12.443],
						[-11.456, 12.077],
						[-11.298, 12.078],
						[-11.037, 12.211],
						[-10.871, 12.178],
						[-10.593, 11.924],
						[-10.165, 11.844],
						[-9.891, 12.06],
						[-9.568, 12.194],
						[-9.328, 12.334],
						[-9.127, 12.308],
						[-8.905, 12.088],
						[-8.786, 11.813],
						[-8.376, 11.394],
						[-8.581, 11.136],
						[-8.62, 10.811],
						[-8.407, 10.909],
						[-8.282, 10.793],
						[-8.335, 10.495],
						[-8.03, 10.207],
						[-8.229, 10.129],
						[-8.31, 9.79],
						[-8.079, 9.376],
						[-7.832, 8.576],
						[-8.203, 8.455],
						[-8.299, 8.316],
						[-8.222, 8.123],
						[-8.281, 7.687],
						[-8.439, 7.686],
						[-8.722, 7.712],
						[-8.926, 7.309],
						[-9.209, 7.314],
						[-9.403, 7.527],
						[-9.337, 7.929],
						[-9.755, 8.541],
						[-10.017, 8.429],
						[-10.23, 8.406],
						[-10.505, 8.349],
						[-10.494, 8.716],
						[-10.655, 8.977],
						[-10.622, 9.268],
						[-10.839, 9.688],
						[-11.117, 10.046],
						[-11.917, 10.047],
						[-12.15, 9.859],
						[-12.426, 9.836],
						[-12.597, 9.62],
						[-12.712, 9.343],
						[-13.247, 8.903],
						[-13.685, 9.495],
						[-14.074, 9.886],
						[-14.33, 10.016],
						[-14.58, 10.214],
						[-14.693, 10.656],
						[-14.84, 10.877],
						[-15.13, 11.04],
						[-14.686, 11.528],
						[-14.382, 11.509],
						[-14.121, 11.677],
						[-13.901, 11.679],
						[-13.743, 11.811],
						[-13.828, 12.143],
						[-13.719, 12.247],
						[-13.7, 12.586]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "几内亚比绍",
					"x": -14.52413,
					"y": 12.163712,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-16.677, 12.385],
						[-16.148, 12.548],
						[-15.817, 12.516],
						[-15.548, 12.628],
						[-13.7, 12.586],
						[-13.719, 12.247],
						[-13.828, 12.143],
						[-13.743, 11.811],
						[-13.901, 11.679],
						[-14.121, 11.677],
						[-14.382, 11.509],
						[-14.686, 11.528],
						[-15.13, 11.04],
						[-15.664, 11.458],
						[-16.085, 11.525],
						[-16.315, 11.807],
						[-16.309, 11.959],
						[-16.614, 12.171],
						[-16.677, 12.385]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "利比里亚",
					"x": -9.460379,
					"y": 6.447177,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-8.439, 7.686],
						[-8.485, 7.395],
						[-8.385, 6.912],
						[-8.603, 6.468],
						[-8.311, 6.193],
						[-7.994, 6.126],
						[-7.57, 5.707],
						[-7.54, 5.313],
						[-7.635, 5.188],
						[-7.712, 4.365],
						[-7.974, 4.356],
						[-9.005, 4.832],
						[-9.913, 5.594],
						[-10.765, 6.141],
						[-11.439, 6.786],
						[-11.2, 7.106],
						[-11.147, 7.397],
						[-10.696, 7.939],
						[-10.23, 8.406],
						[-10.017, 8.429],
						[-9.755, 8.541],
						[-9.337, 7.929],
						[-9.403, 7.527],
						[-9.209, 7.314],
						[-8.926, 7.309],
						[-8.722, 7.712],
						[-8.439, 7.686]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "塞拉利昂",
					"x": -11.763677,
					"y": 8.617449,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-13.247, 8.903],
						[-12.712, 9.343],
						[-12.597, 9.62],
						[-12.426, 9.836],
						[-12.15, 9.859],
						[-11.917, 10.047],
						[-11.117, 10.046],
						[-10.839, 9.688],
						[-10.622, 9.268],
						[-10.655, 8.977],
						[-10.494, 8.716],
						[-10.505, 8.349],
						[-10.23, 8.406],
						[-10.696, 7.939],
						[-11.147, 7.397],
						[-11.2, 7.106],
						[-11.439, 6.786],
						[-11.708, 6.86],
						[-12.428, 7.263],
						[-12.949, 7.799],
						[-13.124, 8.164],
						[-13.247, 8.903]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "布基纳法索",
					"x": -1.36388,
					"y": 12.673048,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-5.404, 10.371],
						[-5.471, 10.951],
						[-5.198, 11.375],
						[-5.221, 11.714],
						[-4.427, 12.543],
						[-4.28, 13.228],
						[-4.006, 13.472],
						[-3.523, 13.338],
						[-3.104, 13.541],
						[-2.968, 13.798],
						[-2.192, 14.246],
						[-2.001, 14.559],
						[-1.066, 14.974],
						[-.516, 15.116],
						[-.266, 14.924],
						[.375, 14.929],
						[.296, 14.444],
						[.43, 13.989],
						[.993, 13.336],
						[1.024, 12.852],
						[2.177, 12.625],
						[2.154, 11.94],
						[1.936, 11.641],
						[1.447, 11.548],
						[1.243, 11.111],
						[.9, 10.997],
						[.024, 11.019],
						[-.439, 11.098],
						[-.762, 10.937],
						[-1.203, 11.01],
						[-2.94, 10.963],
						[-2.964, 10.395],
						[-2.827, 9.642],
						[-3.512, 9.9],
						[-3.98, 9.862],
						[-4.33, 9.611],
						[-4.78, 9.822],
						[-4.955, 10.153],
						[-5.404, 10.371]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "中非共和国",
					"x": 20.906897,
					"y": 6.989681,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[27.374, 5.234],
						[27.044, 5.128],
						[26.403, 5.151],
						[25.65, 5.256],
						[25.279, 5.17],
						[25.129, 4.927],
						[24.805, 4.897],
						[24.411, 5.109],
						[23.297, 4.61],
						[22.841, 4.71],
						[22.704, 4.633],
						[22.405, 4.029],
						[21.659, 4.224],
						[20.928, 4.323],
						[20.291, 4.692],
						[19.468, 5.032],
						[18.932, 4.71],
						[18.543, 4.202],
						[18.453, 3.504],
						[17.81, 3.56],
						[17.133, 3.728],
						[16.537, 3.198],
						[16.013, 2.268],
						[15.907, 2.557],
						[15.863, 3.014],
						[15.405, 3.335],
						[15.036, 3.851],
						[14.951, 4.21],
						[14.478, 4.733],
						[14.559, 5.031],
						[14.459, 5.452],
						[14.537, 6.227],
						[14.777, 6.408],
						[15.279, 7.422],
						[16.106, 7.497],
						[16.291, 7.754],
						[16.456, 7.735],
						[16.706, 7.508],
						[17.965, 7.891],
						[18.39, 8.281],
						[18.911, 8.631],
						[18.812, 8.983],
						[19.094, 9.075],
						[20.06, 9.013],
						[21.001, 9.476],
						[21.724, 10.567],
						[22.231, 10.972],
						[22.864, 11.142],
						[22.978, 10.714],
						[23.554, 10.089],
						[23.557, 9.681],
						[23.395, 9.265],
						[23.459, 8.954],
						[23.806, 8.666],
						[24.567, 8.229],
						[25.115, 7.825],
						[25.124, 7.5],
						[25.797, 6.979],
						[26.213, 6.547],
						[26.466, 5.947],
						[27.213, 5.551],
						[27.374, 5.234]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "刚果共和国",
					"x": 15.9005,
					"y": .142331,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[18.453, 3.504],
						[18.394, 2.9],
						[18.094, 2.366],
						[17.899, 1.742],
						[17.774, .856],
						[17.827, .289],
						[17.664, -.058],
						[17.639, -.425],
						[17.524, -.744],
						[16.865, -1.226],
						[16.407, -1.741],
						[15.973, -2.712],
						[16.006, -3.535],
						[15.754, -3.855],
						[15.171, -4.344],
						[14.583, -4.97],
						[14.209, -4.793],
						[14.145, -4.51],
						[13.6, -4.5],
						[13.258, -4.883],
						[12.996, -4.781],
						[12.621, -4.438],
						[12.319, -4.606],
						[11.915, -5.038],
						[11.094, -3.979],
						[11.855, -3.427],
						[11.478, -2.766],
						[11.821, -2.514],
						[12.496, -2.392],
						[12.575, -1.949],
						[13.11, -2.429],
						[13.992, -2.471],
						[14.299, -1.998],
						[14.425, -1.333],
						[14.316, -.553],
						[13.843, .039],
						[14.276, 1.197],
						[14.027, 1.396],
						[13.283, 1.314],
						[13.003, 1.831],
						[13.076, 2.267],
						[14.338, 2.228],
						[15.146, 1.964],
						[15.941, 1.728],
						[16.013, 2.268],
						[16.537, 3.198],
						[17.133, 3.728],
						[17.81, 3.56],
						[18.453, 3.504]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "加蓬",
					"x": 11.835939,
					"y": -.437739,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[11.276, 2.261],
						[11.752, 2.327],
						[12.359, 2.193],
						[12.951, 2.322],
						[13.076, 2.267],
						[13.003, 1.831],
						[13.283, 1.314],
						[14.027, 1.396],
						[14.276, 1.197],
						[13.843, .039],
						[14.316, -.553],
						[14.425, -1.333],
						[14.299, -1.998],
						[13.992, -2.471],
						[13.11, -2.429],
						[12.575, -1.949],
						[12.496, -2.392],
						[11.821, -2.514],
						[11.478, -2.766],
						[11.855, -3.427],
						[11.094, -3.979],
						[10.066, -2.969],
						[9.405, -2.144],
						[8.798, -1.111],
						[8.83, -.779],
						[9.048, -.459],
						[9.291, .269],
						[9.493, 1.01],
						[9.83, 1.068],
						[11.285, 1.058],
						[11.276, 2.261]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "赤道几内亚",
					"x": 8.9902,
					"y": 2.333,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[9.649, 2.284],
						[11.276, 2.261],
						[11.285, 1.058],
						[9.83, 1.068],
						[9.493, 1.01],
						[9.306, 1.161],
						[9.649, 2.284]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "赞比亚",
					"x": 26.395298,
					"y": -14.660804,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[30.74, -8.34],
						[31.158, -8.595],
						[31.556, -8.762],
						[32.192, -8.93],
						[32.759, -9.231],
						[33.231, -9.677],
						[33.486, -10.526],
						[33.315, -10.797],
						[33.114, -11.607],
						[33.306, -12.436],
						[32.992, -12.784],
						[32.688, -13.713],
						[33.214, -13.972],
						[30.179, -14.796],
						[30.274, -15.508],
						[29.517, -15.645],
						[28.947, -16.043],
						[28.826, -16.39],
						[28.468, -16.468],
						[27.598, -17.291],
						[27.044, -17.938],
						[26.707, -17.961],
						[26.382, -17.846],
						[25.264, -17.737],
						[25.084, -17.662],
						[25.077, -17.579],
						[24.682, -17.353],
						[24.034, -17.296],
						[23.215, -17.523],
						[22.562, -16.898],
						[21.888, -16.08],
						[21.934, -12.898],
						[24.016, -12.911],
						[23.931, -12.566],
						[24.08, -12.191],
						[23.904, -11.722],
						[24.018, -11.237],
						[23.912, -10.927],
						[24.257, -10.952],
						[24.315, -11.263],
						[24.783, -11.239],
						[25.418, -11.331],
						[25.752, -11.785],
						[26.553, -11.924],
						[27.164, -11.609],
						[27.389, -12.133],
						[28.155, -12.272],
						[28.524, -12.699],
						[28.934, -13.249],
						[29.7, -13.257],
						[29.616, -12.179],
						[29.342, -12.361],
						[28.642, -11.972],
						[28.372, -11.794],
						[28.496, -10.79],
						[28.674, -9.606],
						[28.45, -9.165],
						[28.735, -8.527],
						[29.003, -8.407],
						[30.346, -8.238],
						[30.74, -8.34]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "马拉维",
					"x": 33.608082,
					"y": -13.386737,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[32.759, -9.231],
						[33.74, -9.417],
						[33.941, -9.694],
						[34.28, -10.16],
						[34.56, -11.52],
						[34.28, -12.28],
						[34.56, -13.58],
						[34.907, -13.565],
						[35.268, -13.888],
						[35.687, -14.611],
						[35.772, -15.897],
						[35.339, -16.107],
						[35.034, -16.801],
						[34.381, -16.184],
						[34.307, -15.479],
						[34.518, -15.014],
						[34.46, -14.613],
						[34.065, -14.36],
						[33.79, -14.452],
						[33.214, -13.972],
						[32.688, -13.713],
						[32.992, -12.784],
						[33.306, -12.436],
						[33.114, -11.607],
						[33.315, -10.797],
						[33.486, -10.526],
						[33.231, -9.677],
						[32.759, -9.231]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "莫桑比克",
					"x": 37.83789,
					"y": -13.94323,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[34.56, -11.52],
						[35.312, -11.439],
						[36.514, -11.721],
						[36.775, -11.595],
						[37.471, -11.569],
						[37.828, -11.269],
						[38.428, -11.285],
						[39.521, -10.897],
						[40.317, -10.317],
						[40.317, -10.317],
						[40.317, -10.317],
						[40.478, -10.765],
						[40.437, -11.762],
						[40.561, -12.639],
						[40.6, -14.202],
						[40.775, -14.692],
						[40.477, -15.406],
						[40.089, -16.101],
						[39.453, -16.721],
						[38.538, -17.101],
						[37.411, -17.586],
						[36.281, -18.66],
						[35.896, -18.842],
						[35.198, -19.553],
						[34.786, -19.784],
						[34.702, -20.497],
						[35.176, -21.254],
						[35.373, -21.841],
						[35.386, -22.14],
						[35.563, -22.09],
						[35.534, -23.071],
						[35.372, -23.535],
						[35.607, -23.707],
						[35.459, -24.123],
						[35.041, -24.478],
						[34.216, -24.816],
						[33.013, -25.358],
						[32.575, -25.727],
						[32.66, -26.149],
						[32.916, -26.216],
						[32.83, -26.742],
						[32.072, -26.734],
						[31.986, -26.292],
						[31.838, -25.843],
						[31.752, -25.484],
						[31.931, -24.369],
						[31.67, -23.659],
						[31.191, -22.252],
						[32.245, -21.116],
						[32.509, -20.395],
						[32.66, -20.304],
						[32.773, -19.716],
						[32.612, -19.419],
						[32.655, -18.672],
						[32.85, -17.979],
						[32.848, -16.713],
						[32.328, -16.392],
						[31.852, -16.319],
						[31.636, -16.072],
						[31.173, -15.861],
						[30.339, -15.881],
						[30.274, -15.508],
						[30.179, -14.796],
						[33.214, -13.972],
						[33.79, -14.452],
						[34.065, -14.36],
						[34.46, -14.613],
						[34.518, -15.014],
						[34.307, -15.479],
						[34.381, -16.184],
						[35.034, -16.801],
						[35.339, -16.107],
						[35.772, -15.897],
						[35.687, -14.611],
						[35.268, -13.888],
						[34.907, -13.565],
						[34.56, -13.58],
						[34.28, -12.28],
						[34.56, -11.52]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "斯威士兰",
					"x": 31.467264,
					"y": -26.533676,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[32.072, -26.734],
						[31.868, -27.178],
						[31.283, -27.286],
						[30.686, -26.744],
						[30.677, -26.398],
						[30.95, -26.023],
						[31.044, -25.731],
						[31.333, -25.66],
						[31.838, -25.843],
						[31.986, -26.292],
						[32.072, -26.734]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "安哥拉",
					"x": 17.984249,
					"y": -12.182762,
					"rank": 3
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[12.996, -4.781],
						[12.632, -4.991],
						[12.468, -5.248],
						[12.437, -5.684],
						[12.182, -5.79],
						[11.915, -5.038],
						[12.319, -4.606],
						[12.621, -4.438],
						[12.996, -4.781]
					]], [[
						[12.322, -6.1],
						[12.735, -5.966],
						[13.025, -5.984],
						[13.376, -5.864],
						[16.327, -5.877],
						[16.573, -6.623],
						[16.86, -7.222],
						[17.09, -7.546],
						[17.473, -8.069],
						[18.134, -7.988],
						[18.464, -7.847],
						[19.017, -7.988],
						[19.167, -7.738],
						[19.418, -7.155],
						[20.038, -7.116],
						[20.092, -6.943],
						[20.602, -6.939],
						[20.515, -7.3],
						[21.728, -7.291],
						[21.746, -7.92],
						[21.949, -8.306],
						[21.802, -8.909],
						[21.875, -9.524],
						[22.209, -9.895],
						[22.155, -11.085],
						[22.403, -10.993],
						[22.837, -11.018],
						[23.457, -10.868],
						[23.912, -10.927],
						[24.018, -11.237],
						[23.904, -11.722],
						[24.08, -12.191],
						[23.931, -12.566],
						[24.016, -12.911],
						[21.934, -12.898],
						[21.888, -16.08],
						[22.562, -16.898],
						[23.215, -17.523],
						[21.377, -17.931],
						[18.956, -17.789],
						[18.263, -17.31],
						[14.21, -17.353],
						[14.059, -17.423],
						[13.462, -16.971],
						[12.814, -16.941],
						[12.215, -17.112],
						[11.734, -17.302],
						[11.64, -16.673],
						[11.779, -15.794],
						[12.124, -14.878],
						[12.176, -14.449],
						[12.5, -13.548],
						[12.738, -13.138],
						[13.313, -12.484],
						[13.634, -12.039],
						[13.739, -11.298],
						[13.686, -10.731],
						[13.387, -10.374],
						[13.121, -9.767],
						[12.875, -9.167],
						[12.929, -8.959],
						[13.236, -8.563],
						[12.933, -7.597],
						[12.728, -6.927],
						[12.227, -6.294],
						[12.322, -6.1]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "布隆迪",
					"x": 29.917086,
					"y": -3.332836,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[30.47, -2.414],
						[30.528, -2.808],
						[30.743, -3.034],
						[30.752, -3.359],
						[30.506, -3.569],
						[30.116, -4.09],
						[29.754, -4.452],
						[29.34, -4.5],
						[29.276, -3.294],
						[29.025, -2.839],
						[29.632, -2.918],
						[29.938, -2.348],
						[30.47, -2.414]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "以色列",
					"x": 34.847915,
					"y": 30.911148,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[35.72, 32.709],
						[35.546, 32.394],
						[35.184, 32.533],
						[34.975, 31.867],
						[35.226, 31.754],
						[34.971, 31.617],
						[34.927, 31.353],
						[35.398, 31.489],
						[35.421, 31.1],
						[34.923, 29.501],
						[34.823, 29.761],
						[34.265, 31.219],
						[34.265, 31.219],
						[34.265, 31.219],
						[34.556, 31.549],
						[34.488, 31.606],
						[34.753, 32.073],
						[34.955, 32.827],
						[35.098, 33.081],
						[35.126, 33.091],
						[35.461, 33.089],
						[35.553, 33.264],
						[35.821, 33.277],
						[35.836, 32.868],
						[35.701, 32.716],
						[35.72, 32.709]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "黎巴嫩",
					"x": 35.992892,
					"y": 34.133368,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[35.821, 33.277],
						[35.553, 33.264],
						[35.461, 33.089],
						[35.126, 33.091],
						[35.482, 33.905],
						[35.98, 34.61],
						[35.998, 34.645],
						[36.448, 34.594],
						[36.612, 34.202],
						[36.066, 33.825],
						[35.821, 33.277]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "马达加斯加",
					"x": 46.704241,
					"y": -18.628288,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[49.544, -12.47],
						[49.809, -12.895],
						[50.057, -13.556],
						[50.217, -14.759],
						[50.477, -15.227],
						[50.377, -15.706],
						[50.2, -16],
						[49.861, -15.414],
						[49.673, -15.71],
						[49.863, -16.451],
						[49.775, -16.875],
						[49.499, -17.106],
						[49.436, -17.953],
						[49.042, -19.119],
						[48.549, -20.497],
						[47.931, -22.392],
						[47.548, -23.782],
						[47.096, -24.942],
						[46.282, -25.178],
						[45.41, -25.601],
						[44.834, -25.346],
						[44.04, -24.988],
						[43.764, -24.461],
						[43.698, -23.574],
						[43.346, -22.777],
						[43.254, -22.057],
						[43.433, -21.336],
						[43.894, -21.163],
						[43.896, -20.83],
						[44.374, -20.072],
						[44.464, -19.435],
						[44.232, -18.962],
						[44.043, -18.331],
						[43.963, -17.41],
						[44.312, -16.85],
						[44.447, -16.216],
						[44.945, -16.179],
						[45.503, -15.974],
						[45.873, -15.793],
						[46.312, -15.78],
						[46.882, -15.21],
						[47.705, -14.594],
						[48.005, -14.091],
						[47.869, -13.664],
						[48.294, -13.784],
						[48.845, -13.089],
						[48.864, -12.488],
						[49.195, -12.041],
						[49.544, -12.47]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "巴勒斯坦",
					"x": 35.291341,
					"y": 32.047431,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[35.398, 31.489],
						[34.927, 31.353],
						[34.971, 31.617],
						[35.226, 31.754],
						[34.975, 31.867],
						[35.184, 32.533],
						[35.546, 32.394],
						[35.545, 31.783],
						[35.398, 31.489]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "冈比亚",
					"x": -14.998318,
					"y": 13.641721,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-16.714, 13.595],
						[-15.625, 13.624],
						[-15.399, 13.86],
						[-15.082, 13.876],
						[-14.687, 13.63],
						[-14.377, 13.626],
						[-14.047, 13.794],
						[-13.845, 13.505],
						[-14.278, 13.281],
						[-14.712, 13.298],
						[-15.141, 13.51],
						[-15.512, 13.279],
						[-15.691, 13.27],
						[-15.931, 13.13],
						[-16.842, 13.151],
						[-16.714, 13.595]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "突尼斯",
					"x": 9.007881,
					"y": 33.687263,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[9.482, 30.308],
						[9.056, 32.103],
						[8.439, 32.506],
						[8.43, 32.748],
						[7.613, 33.344],
						[7.524, 34.097],
						[8.141, 34.655],
						[8.376, 35.48],
						[8.218, 36.433],
						[8.421, 36.946],
						[9.51, 37.35],
						[10.21, 37.23],
						[10.181, 36.724],
						[11.029, 37.092],
						[11.1, 36.9],
						[10.6, 36.41],
						[10.593, 35.947],
						[10.94, 35.699],
						[10.808, 34.834],
						[10.15, 34.331],
						[10.34, 33.786],
						[10.857, 33.769],
						[11.109, 33.293],
						[11.489, 33.137],
						[11.432, 32.369],
						[10.945, 32.082],
						[10.637, 31.761],
						[9.95, 31.376],
						[10.057, 30.962],
						[9.97, 30.539],
						[9.482, 30.308]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "阿尔及利亚",
					"x": 2.808241,
					"y": 27.397406,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-8.684, 27.396],
						[-8.665, 27.589],
						[-8.666, 27.656],
						[-8.674, 28.841],
						[-7.059, 29.579],
						[-6.061, 29.732],
						[-5.242, 30],
						[-4.86, 30.501],
						[-3.69, 30.897],
						[-3.647, 31.637],
						[-3.069, 31.724],
						[-2.617, 32.094],
						[-1.308, 32.263],
						[-1.125, 32.652],
						[-1.388, 32.864],
						[-1.733, 33.92],
						[-1.793, 34.528],
						[-2.17, 35.168],
						[-1.209, 35.715],
						[-.127, 35.889],
						[.504, 36.301],
						[1.467, 36.606],
						[3.162, 36.784],
						[4.816, 36.865],
						[5.32, 36.717],
						[6.262, 37.111],
						[7.33, 37.118],
						[7.737, 36.886],
						[8.421, 36.946],
						[8.218, 36.433],
						[8.376, 35.48],
						[8.141, 34.655],
						[7.524, 34.097],
						[7.613, 33.344],
						[8.43, 32.748],
						[8.439, 32.506],
						[9.056, 32.103],
						[9.482, 30.308],
						[9.806, 29.425],
						[9.86, 28.96],
						[9.684, 28.144],
						[9.756, 27.688],
						[9.629, 27.141],
						[9.716, 26.512],
						[9.319, 26.094],
						[9.911, 25.365],
						[9.948, 24.937],
						[10.304, 24.379],
						[10.771, 24.563],
						[11.561, 24.098],
						[12, 23.472],
						[8.573, 21.566],
						[5.678, 19.601],
						[4.267, 19.155],
						[3.158, 19.057],
						[3.147, 19.694],
						[2.684, 19.856],
						[2.061, 20.142],
						[1.823, 20.611],
						[-1.55, 22.793],
						[-4.923, 24.975],
						[-8.684, 27.396]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "约旦",
					"x": 36.375991,
					"y": 30.805025,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[35.546, 32.394],
						[35.72, 32.709],
						[36.834, 32.313],
						[38.792, 33.379],
						[39.195, 32.161],
						[39.005, 32.01],
						[37.002, 31.508],
						[37.999, 30.509],
						[37.668, 30.339],
						[37.504, 30.004],
						[36.741, 29.865],
						[36.501, 29.505],
						[36.069, 29.197],
						[34.956, 29.357],
						[34.923, 29.501],
						[35.421, 31.1],
						[35.398, 31.489],
						[35.545, 31.783],
						[35.546, 32.394]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "阿拉伯联合酋长国",
					"x": 54.547256,
					"y": 23.466285,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[51.58, 24.245],
						[51.757, 24.294],
						[51.794, 24.02],
						[52.577, 24.177],
						[53.404, 24.151],
						[54.008, 24.122],
						[54.693, 24.798],
						[55.439, 25.439],
						[56.071, 26.055],
						[56.261, 25.715],
						[56.397, 24.925],
						[55.886, 24.921],
						[55.804, 24.27],
						[55.981, 24.131],
						[55.529, 23.934],
						[55.526, 23.525],
						[55.234, 23.111],
						[55.208, 22.708],
						[55.007, 22.497],
						[52.001, 23.001],
						[51.618, 24.014],
						[51.58, 24.245]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "卡塔尔",
					"x": 51.143509,
					"y": 25.237383,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[50.81, 24.755],
						[50.744, 25.482],
						[51.013, 26.007],
						[51.286, 26.115],
						[51.589, 25.801],
						[51.607, 25.216],
						[51.39, 24.627],
						[51.112, 24.556],
						[50.81, 24.755]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "科威特",
					"x": 47.313999,
					"y": 29.413628,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[47.975, 29.976],
						[48.183, 29.534],
						[48.094, 29.306],
						[48.416, 28.552],
						[47.709, 28.526],
						[47.46, 29.003],
						[46.569, 29.099],
						[47.303, 30.059],
						[47.975, 29.976]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "伊拉克",
					"x": 43.26181,
					"y": 33.09403,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[39.195, 32.161],
						[38.792, 33.379],
						[41.006, 34.419],
						[41.384, 35.628],
						[41.29, 36.359],
						[41.837, 36.606],
						[42.35, 37.23],
						[42.779, 37.385],
						[43.942, 37.256],
						[44.293, 37.002],
						[44.773, 37.17],
						[45.421, 35.978],
						[46.076, 35.677],
						[46.152, 35.093],
						[45.648, 34.748],
						[45.417, 33.968],
						[46.109, 33.017],
						[47.335, 32.469],
						[47.849, 31.709],
						[47.685, 30.985],
						[48.005, 30.985],
						[48.015, 30.452],
						[48.568, 29.927],
						[47.975, 29.976],
						[47.303, 30.059],
						[46.569, 29.099],
						[44.709, 29.179],
						[41.89, 31.19],
						[40.4, 31.89],
						[39.195, 32.161]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "阿曼",
					"x": 57.336553,
					"y": 22.120427,
					"rank": 4
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[55.208, 22.708],
						[55.234, 23.111],
						[55.526, 23.525],
						[55.529, 23.934],
						[55.981, 24.131],
						[55.804, 24.27],
						[55.886, 24.921],
						[56.397, 24.925],
						[56.845, 24.242],
						[57.403, 23.879],
						[58.137, 23.748],
						[58.729, 23.566],
						[59.181, 22.992],
						[59.45, 22.66],
						[59.808, 22.534],
						[59.806, 22.311],
						[59.442, 21.715],
						[59.282, 21.434],
						[58.861, 21.114],
						[58.488, 20.429],
						[58.034, 20.481],
						[57.826, 20.243],
						[57.666, 19.736],
						[57.789, 19.068],
						[57.694, 18.945],
						[57.234, 18.948],
						[56.61, 18.574],
						[56.512, 18.087],
						[56.284, 17.876],
						[55.661, 17.884],
						[55.27, 17.632],
						[55.275, 17.228],
						[54.791, 16.951],
						[54.239, 17.045],
						[53.571, 16.708],
						[53.109, 16.651],
						[52.782, 17.35],
						[52, 19],
						[55, 20],
						[55.667, 22],
						[55.208, 22.708]
					]], [[
						[56.261, 25.715],
						[56.071, 26.055],
						[56.362, 26.396],
						[56.486, 26.309],
						[56.391, 25.896],
						[56.261, 25.715]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "瓦努阿图",
					"x": 166.908762,
					"y": -15.37153,
					"rank": 4
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[167.217, -15.892],
						[167.845, -16.466],
						[167.515, -16.598],
						[167.18, -16.16],
						[167.217, -15.892]
					]], [[
						[166.793, -15.669],
						[166.65, -15.393],
						[166.629, -14.626],
						[167.108, -14.934],
						[167.27, -15.74],
						[167.001, -15.615],
						[166.793, -15.669]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "柬埔寨",
					"x": 104.50487,
					"y": 12.647584,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[102.585, 12.187],
						[102.348, 13.394],
						[102.988, 14.226],
						[104.281, 14.417],
						[105.219, 14.273],
						[106.044, 13.881],
						[106.496, 14.571],
						[107.383, 14.202],
						[107.615, 13.536],
						[107.491, 12.337],
						[105.811, 11.568],
						[106.25, 10.962],
						[105.2, 10.889],
						[104.334, 10.487],
						[103.497, 10.633],
						[103.091, 11.154],
						[102.585, 12.187]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "泰国",
					"x": 101.073198,
					"y": 15.45974,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[105.219, 14.273],
						[104.281, 14.417],
						[102.988, 14.226],
						[102.348, 13.394],
						[102.585, 12.187],
						[101.687, 12.646],
						[100.832, 12.627],
						[100.978, 13.413],
						[100.098, 13.407],
						[100.019, 12.307],
						[99.479, 10.846],
						[99.154, 9.963],
						[99.222, 9.239],
						[99.874, 9.208],
						[100.28, 8.295],
						[100.459, 7.43],
						[101.017, 6.857],
						[101.623, 6.741],
						[102.141, 6.222],
						[101.814, 5.811],
						[101.154, 5.691],
						[101.076, 6.205],
						[100.26, 6.643],
						[100.086, 6.464],
						[99.691, 6.848],
						[99.52, 7.343],
						[98.988, 7.908],
						[98.504, 8.382],
						[98.34, 7.795],
						[98.15, 8.35],
						[98.259, 8.974],
						[98.554, 9.933],
						[99.038, 10.961],
						[99.587, 11.893],
						[99.196, 12.805],
						[99.212, 13.269],
						[99.098, 13.828],
						[98.431, 14.622],
						[98.192, 15.124],
						[98.537, 15.308],
						[98.903, 16.178],
						[98.494, 16.838],
						[97.859, 17.568],
						[97.376, 18.445],
						[97.798, 18.627],
						[98.254, 19.708],
						[98.96, 19.753],
						[99.543, 20.187],
						[100.116, 20.418],
						[100.549, 20.109],
						[100.606, 19.508],
						[101.282, 19.463],
						[101.036, 18.409],
						[101.06, 17.512],
						[102.114, 18.109],
						[102.413, 17.933],
						[102.999, 17.962],
						[103.2, 18.31],
						[103.956, 18.241],
						[104.717, 17.429],
						[104.779, 16.442],
						[105.589, 15.57],
						[105.544, 14.724],
						[105.219, 14.273]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "老挝",
					"x": 102.533912,
					"y": 19.431821,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[107.383, 14.202],
						[106.496, 14.571],
						[106.044, 13.881],
						[105.219, 14.273],
						[105.544, 14.724],
						[105.589, 15.57],
						[104.779, 16.442],
						[104.717, 17.429],
						[103.956, 18.241],
						[103.2, 18.31],
						[102.999, 17.962],
						[102.413, 17.933],
						[102.114, 18.109],
						[101.06, 17.512],
						[101.036, 18.409],
						[101.282, 19.463],
						[100.606, 19.508],
						[100.549, 20.109],
						[100.116, 20.418],
						[100.329, 20.786],
						[101.18, 21.437],
						[101.27, 21.202],
						[101.803, 21.174],
						[101.652, 22.318],
						[102.17, 22.465],
						[102.755, 21.675],
						[103.204, 20.767],
						[104.435, 20.759],
						[104.823, 19.887],
						[104.183, 19.625],
						[103.897, 19.265],
						[105.095, 18.667],
						[105.926, 17.485],
						[106.556, 16.604],
						[107.313, 15.909],
						[107.565, 15.202],
						[107.383, 14.202]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "缅甸",
					"x": 95.804497,
					"y": 21.573855,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[100.116, 20.418],
						[99.543, 20.187],
						[98.96, 19.753],
						[98.254, 19.708],
						[97.798, 18.627],
						[97.376, 18.445],
						[97.859, 17.568],
						[98.494, 16.838],
						[98.903, 16.178],
						[98.537, 15.308],
						[98.192, 15.124],
						[98.431, 14.622],
						[99.098, 13.828],
						[99.212, 13.269],
						[99.196, 12.805],
						[99.587, 11.893],
						[99.038, 10.961],
						[98.554, 9.933],
						[98.457, 10.675],
						[98.765, 11.441],
						[98.428, 12.033],
						[98.51, 13.122],
						[98.104, 13.64],
						[97.778, 14.837],
						[97.597, 16.101],
						[97.165, 16.929],
						[96.506, 16.427],
						[95.369, 15.714],
						[94.808, 15.803],
						[94.189, 16.038],
						[94.533, 17.277],
						[94.325, 18.214],
						[93.541, 19.366],
						[93.663, 19.727],
						[93.078, 19.855],
						[92.369, 20.671],
						[92.303, 21.475],
						[92.652, 21.324],
						[92.673, 22.041],
						[93.166, 22.278],
						[93.06, 22.703],
						[93.286, 23.044],
						[93.325, 24.079],
						[94.107, 23.851],
						[94.553, 24.675],
						[94.603, 25.162],
						[95.155, 26.001],
						[95.125, 26.574],
						[96.419, 27.265],
						[97.134, 27.084],
						[97.052, 27.699],
						[97.403, 27.883],
						[97.327, 28.262],
						[97.912, 28.336],
						[98.246, 27.747],
						[98.683, 27.509],
						[98.712, 26.744],
						[98.672, 25.919],
						[97.725, 25.084],
						[97.605, 23.897],
						[98.66, 24.063],
						[98.899, 23.143],
						[99.532, 22.949],
						[99.241, 22.118],
						[99.983, 21.743],
						[100.417, 21.559],
						[101.15, 21.85],
						[101.18, 21.437],
						[100.329, 20.786],
						[100.116, 20.418]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "越南",
					"x": 105.387292,
					"y": 21.715416,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[104.334, 10.487],
						[105.2, 10.889],
						[106.25, 10.962],
						[105.811, 11.568],
						[107.491, 12.337],
						[107.615, 13.536],
						[107.383, 14.202],
						[107.565, 15.202],
						[107.313, 15.909],
						[106.556, 16.604],
						[105.926, 17.485],
						[105.095, 18.667],
						[103.897, 19.265],
						[104.183, 19.625],
						[104.823, 19.887],
						[104.435, 20.759],
						[103.204, 20.767],
						[102.755, 21.675],
						[102.17, 22.465],
						[102.707, 22.709],
						[103.505, 22.704],
						[104.477, 22.819],
						[105.329, 23.352],
						[105.811, 22.977],
						[106.725, 22.794],
						[106.567, 22.218],
						[107.043, 21.812],
						[108.05, 21.552],
						[106.715, 20.697],
						[105.882, 19.752],
						[105.662, 19.058],
						[106.427, 18.004],
						[107.362, 16.697],
						[108.269, 16.08],
						[108.877, 15.277],
						[109.335, 13.426],
						[109.2, 11.667],
						[108.366, 11.008],
						[107.221, 10.364],
						[106.405, 9.531],
						[105.158, 8.6],
						[104.795, 9.241],
						[105.076, 9.918],
						[104.334, 10.487]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "朝鲜",
					"x": 126.444516,
					"y": 39.885252,
					"rank": 3
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[130.78, 42.22],
						[130.78, 42.22],
						[130.78, 42.22],
						[130.78, 42.22]
					]], [[
						[130.64, 42.395],
						[130.64, 42.395],
						[130.78, 42.22],
						[130.4, 42.28],
						[129.966, 41.941],
						[129.667, 41.601],
						[129.705, 40.883],
						[129.188, 40.662],
						[129.01, 40.485],
						[128.633, 40.19],
						[127.967, 40.025],
						[127.533, 39.757],
						[127.502, 39.324],
						[127.385, 39.213],
						[127.783, 39.051],
						[128.35, 38.612],
						[128.206, 38.37],
						[127.78, 38.305],
						[127.073, 38.256],
						[126.684, 37.805],
						[126.237, 37.84],
						[126.175, 37.75],
						[125.689, 37.94],
						[125.568, 37.752],
						[125.275, 37.669],
						[125.24, 37.857],
						[124.981, 37.949],
						[124.712, 38.108],
						[124.986, 38.548],
						[125.222, 38.666],
						[125.133, 38.849],
						[125.387, 39.388],
						[125.321, 39.551],
						[124.737, 39.66],
						[124.266, 39.928],
						[125.08, 40.57],
						[126.182, 41.107],
						[126.869, 41.817],
						[127.344, 41.503],
						[128.208, 41.467],
						[128.052, 41.994],
						[129.597, 42.425],
						[129.994, 42.985],
						[130.64, 42.395]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "韩国",
					"x": 128.129504,
					"y": 36.384924,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[126.175, 37.75],
						[126.237, 37.84],
						[126.684, 37.805],
						[127.073, 38.256],
						[127.78, 38.305],
						[128.206, 38.37],
						[128.35, 38.612],
						[129.213, 37.432],
						[129.46, 36.784],
						[129.468, 35.632],
						[129.091, 35.082],
						[128.186, 34.89],
						[127.387, 34.476],
						[126.486, 34.39],
						[126.374, 34.935],
						[126.559, 35.685],
						[126.117, 36.725],
						[126.86, 36.894],
						[126.175, 37.75]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "蒙古国",
					"x": 104.150405,
					"y": 45.997488,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[87.751, 49.297],
						[88.806, 49.471],
						[90.714, 50.332],
						[92.235, 50.802],
						[93.104, 50.495],
						[94.148, 50.481],
						[94.816, 50.013],
						[95.814, 49.977],
						[97.26, 49.726],
						[98.232, 50.422],
						[97.826, 51.011],
						[98.861, 52.047],
						[99.982, 51.634],
						[100.889, 51.517],
						[102.065, 51.26],
						[102.256, 50.511],
						[103.677, 50.09],
						[104.622, 50.275],
						[105.887, 50.406],
						[106.889, 50.274],
						[107.868, 49.794],
						[108.475, 49.283],
						[109.402, 49.293],
						[110.662, 49.13],
						[111.581, 49.378],
						[112.898, 49.544],
						[114.362, 50.248],
						[114.962, 50.14],
						[115.486, 49.805],
						[116.679, 49.889],
						[116.192, 49.135],
						[115.485, 48.135],
						[115.743, 47.727],
						[116.309, 47.853],
						[117.296, 47.698],
						[118.064, 48.067],
						[118.867, 47.747],
						[119.773, 47.048],
						[119.663, 46.693],
						[118.874, 46.805],
						[117.422, 46.673],
						[116.718, 46.388],
						[115.985, 45.727],
						[114.46, 45.34],
						[113.464, 44.809],
						[112.436, 45.012],
						[111.873, 45.102],
						[111.348, 44.457],
						[111.668, 44.073],
						[111.83, 43.743],
						[111.13, 43.407],
						[110.412, 42.871],
						[109.244, 42.519],
						[107.745, 42.482],
						[106.129, 42.134],
						[104.965, 41.597],
						[104.522, 41.908],
						[103.312, 41.907],
						[101.833, 42.515],
						[100.846, 42.664],
						[99.516, 42.525],
						[97.452, 42.749],
						[96.349, 42.726],
						[95.762, 43.319],
						[95.307, 44.241],
						[94.689, 44.352],
						[93.481, 44.975],
						[92.134, 45.115],
						[90.946, 45.286],
						[90.586, 45.72],
						[90.971, 46.888],
						[90.281, 47.694],
						[88.854, 48.069],
						[88.014, 48.599],
						[87.751, 49.297]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "印度",
					"x": 79.358105,
					"y": 22.686852,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[97.327, 28.262],
						[97.403, 27.883],
						[97.052, 27.699],
						[97.134, 27.084],
						[96.419, 27.265],
						[95.125, 26.574],
						[95.155, 26.001],
						[94.603, 25.162],
						[94.553, 24.675],
						[94.107, 23.851],
						[93.325, 24.079],
						[93.286, 23.044],
						[93.06, 22.703],
						[93.166, 22.278],
						[92.673, 22.041],
						[92.146, 23.627],
						[91.87, 23.624],
						[91.706, 22.985],
						[91.159, 23.504],
						[91.468, 24.073],
						[91.915, 24.13],
						[92.376, 24.977],
						[91.8, 25.147],
						[90.872, 25.133],
						[89.921, 25.27],
						[89.832, 25.965],
						[89.355, 26.014],
						[88.563, 26.447],
						[88.21, 25.768],
						[88.932, 25.239],
						[88.306, 24.866],
						[88.084, 24.502],
						[88.7, 24.234],
						[88.53, 23.631],
						[88.876, 22.879],
						[89.032, 22.056],
						[88.889, 21.691],
						[88.208, 21.703],
						[86.976, 21.496],
						[87.033, 20.743],
						[86.499, 20.152],
						[85.06, 19.479],
						[83.941, 18.302],
						[83.189, 17.671],
						[82.193, 17.017],
						[82.191, 16.557],
						[81.693, 16.31],
						[80.792, 15.952],
						[80.325, 15.899],
						[80.025, 15.136],
						[80.233, 13.836],
						[80.286, 13.006],
						[79.863, 12.056],
						[79.858, 10.357],
						[79.341, 10.309],
						[78.885, 9.546],
						[79.19, 9.217],
						[78.278, 8.933],
						[77.941, 8.253],
						[77.54, 7.966],
						[76.593, 8.899],
						[76.13, 10.3],
						[75.746, 11.308],
						[75.396, 11.781],
						[74.865, 12.742],
						[74.617, 13.993],
						[74.444, 14.617],
						[73.534, 15.991],
						[73.12, 17.929],
						[72.821, 19.208],
						[72.824, 20.42],
						[72.631, 21.356],
						[71.175, 20.757],
						[70.47, 20.877],
						[69.164, 22.089],
						[69.645, 22.451],
						[69.35, 22.843],
						[68.177, 23.692],
						[68.843, 24.359],
						[71.043, 24.357],
						[70.845, 25.215],
						[70.283, 25.722],
						[70.169, 26.492],
						[69.514, 26.941],
						[70.616, 27.989],
						[71.778, 27.913],
						[72.824, 28.962],
						[73.451, 29.976],
						[74.421, 30.98],
						[74.406, 31.693],
						[75.259, 32.271],
						[74.452, 32.765],
						[74.104, 33.441],
						[73.75, 34.318],
						[74.24, 34.749],
						[75.757, 34.505],
						[76.872, 34.654],
						[77.837, 35.494],
						[78.912, 34.322],
						[78.811, 33.506],
						[79.209, 32.994],
						[79.176, 32.484],
						[78.458, 32.618],
						[78.739, 31.516],
						[79.721, 30.883],
						[81.111, 30.183],
						[80.477, 29.73],
						[80.088, 28.794],
						[81.057, 28.416],
						[82, 27.925],
						[83.304, 27.365],
						[84.675, 27.235],
						[85.252, 26.726],
						[86.024, 26.631],
						[87.227, 26.398],
						[88.06, 26.415],
						[88.175, 26.81],
						[88.043, 27.446],
						[88.12, 27.877],
						[88.73, 28.087],
						[88.814, 27.299],
						[88.836, 27.099],
						[89.745, 26.719],
						[90.373, 26.876],
						[91.218, 26.809],
						[92.033, 26.838],
						[92.104, 27.453],
						[91.697, 27.772],
						[92.503, 27.897],
						[93.413, 28.641],
						[94.566, 29.277],
						[95.405, 29.032],
						[96.118, 29.453],
						[96.587, 28.831],
						[96.249, 28.411],
						[97.327, 28.262]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "孟加拉国",
					"x": 89.684963,
					"y": 24.214956,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[92.673, 22.041],
						[92.652, 21.324],
						[92.303, 21.475],
						[92.369, 20.671],
						[92.083, 21.192],
						[92.025, 21.702],
						[91.835, 22.183],
						[91.417, 22.765],
						[90.496, 22.805],
						[90.587, 22.393],
						[90.273, 21.836],
						[89.847, 22.039],
						[89.702, 21.857],
						[89.419, 21.966],
						[89.032, 22.056],
						[88.876, 22.879],
						[88.53, 23.631],
						[88.7, 24.234],
						[88.084, 24.502],
						[88.306, 24.866],
						[88.932, 25.239],
						[88.21, 25.768],
						[88.563, 26.447],
						[89.355, 26.014],
						[89.832, 25.965],
						[89.921, 25.27],
						[90.872, 25.133],
						[91.8, 25.147],
						[92.376, 24.977],
						[91.915, 24.13],
						[91.468, 24.073],
						[91.159, 23.504],
						[91.706, 22.985],
						[91.87, 23.624],
						[92.146, 23.627],
						[92.673, 22.041]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "不丹",
					"x": 90.040294,
					"y": 27.536685,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[91.697, 27.772],
						[92.104, 27.453],
						[92.033, 26.838],
						[91.218, 26.809],
						[90.373, 26.876],
						[89.745, 26.719],
						[88.836, 27.099],
						[88.814, 27.299],
						[89.476, 28.043],
						[90.016, 28.296],
						[90.731, 28.065],
						[91.259, 28.041],
						[91.697, 27.772]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "尼泊尔",
					"x": 83.639914,
					"y": 28.297925,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[88.12, 27.877],
						[88.043, 27.446],
						[88.175, 26.81],
						[88.06, 26.415],
						[87.227, 26.398],
						[86.024, 26.631],
						[85.252, 26.726],
						[84.675, 27.235],
						[83.304, 27.365],
						[82, 27.925],
						[81.057, 28.416],
						[80.088, 28.794],
						[80.477, 29.73],
						[81.111, 30.183],
						[81.526, 30.423],
						[82.328, 30.115],
						[83.337, 29.464],
						[83.899, 29.32],
						[84.235, 28.84],
						[85.012, 28.643],
						[85.823, 28.204],
						[86.955, 27.974],
						[88.12, 27.877]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "巴基斯坦",
					"x": 68.545632,
					"y": 29.328389,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[77.837, 35.494],
						[76.872, 34.654],
						[75.757, 34.505],
						[74.24, 34.749],
						[73.75, 34.318],
						[74.104, 33.441],
						[74.452, 32.765],
						[75.259, 32.271],
						[74.406, 31.693],
						[74.421, 30.98],
						[73.451, 29.976],
						[72.824, 28.962],
						[71.778, 27.913],
						[70.616, 27.989],
						[69.514, 26.941],
						[70.169, 26.492],
						[70.283, 25.722],
						[70.845, 25.215],
						[71.043, 24.357],
						[68.843, 24.359],
						[68.177, 23.692],
						[67.444, 23.945],
						[67.145, 24.664],
						[66.373, 25.425],
						[64.53, 25.237],
						[62.906, 25.218],
						[61.497, 25.078],
						[61.874, 26.24],
						[63.317, 26.757],
						[63.234, 27.217],
						[62.755, 27.379],
						[62.728, 28.26],
						[61.772, 28.699],
						[61.369, 29.303],
						[60.874, 29.829],
						[62.55, 29.319],
						[63.55, 29.468],
						[64.148, 29.341],
						[64.35, 29.56],
						[65.047, 29.472],
						[66.346, 29.888],
						[66.381, 30.739],
						[66.939, 31.305],
						[67.683, 31.303],
						[67.793, 31.583],
						[68.557, 31.713],
						[68.927, 31.62],
						[69.318, 31.901],
						[69.263, 32.502],
						[69.687, 33.105],
						[70.324, 33.359],
						[69.931, 34.02],
						[70.882, 33.989],
						[71.157, 34.349],
						[71.115, 34.733],
						[71.613, 35.153],
						[71.499, 35.651],
						[71.262, 36.074],
						[71.846, 36.51],
						[72.92, 36.72],
						[74.068, 36.836],
						[74.576, 37.021],
						[75.158, 37.133],
						[75.897, 36.667],
						[76.193, 35.898],
						[77.837, 35.494]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "阿富汗",
					"x": 66.496586,
					"y": 34.164262,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[66.519, 37.363],
						[67.076, 37.356],
						[67.83, 37.145],
						[68.136, 37.023],
						[68.859, 37.344],
						[69.196, 37.151],
						[69.519, 37.609],
						[70.117, 37.588],
						[70.271, 37.735],
						[70.376, 38.138],
						[70.807, 38.486],
						[71.348, 38.259],
						[71.239, 37.953],
						[71.542, 37.906],
						[71.449, 37.066],
						[71.845, 36.738],
						[72.193, 36.948],
						[72.637, 37.048],
						[73.26, 37.495],
						[73.949, 37.422],
						[74.98, 37.42],
						[75.158, 37.133],
						[74.576, 37.021],
						[74.068, 36.836],
						[72.92, 36.72],
						[71.846, 36.51],
						[71.262, 36.074],
						[71.499, 35.651],
						[71.613, 35.153],
						[71.115, 34.733],
						[71.157, 34.349],
						[70.882, 33.989],
						[69.931, 34.02],
						[70.324, 33.359],
						[69.687, 33.105],
						[69.263, 32.502],
						[69.318, 31.901],
						[68.927, 31.62],
						[68.557, 31.713],
						[67.793, 31.583],
						[67.683, 31.303],
						[66.939, 31.305],
						[66.381, 30.739],
						[66.346, 29.888],
						[65.047, 29.472],
						[64.35, 29.56],
						[64.148, 29.341],
						[63.55, 29.468],
						[62.55, 29.319],
						[60.874, 29.829],
						[61.781, 30.736],
						[61.699, 31.38],
						[60.942, 31.548],
						[60.864, 32.183],
						[60.536, 32.981],
						[60.964, 33.529],
						[60.528, 33.676],
						[60.803, 34.404],
						[61.211, 35.65],
						[62.231, 35.271],
						[62.985, 35.404],
						[63.194, 35.857],
						[63.983, 36.008],
						[64.546, 36.312],
						[64.746, 37.112],
						[65.589, 37.305],
						[65.746, 37.661],
						[66.217, 37.394],
						[66.519, 37.363]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "塔吉克斯坦",
					"x": 72.587276,
					"y": 38.199835,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[67.83, 37.145],
						[68.392, 38.157],
						[68.176, 38.902],
						[67.442, 39.14],
						[67.701, 39.58],
						[68.536, 39.533],
						[69.012, 40.086],
						[69.329, 40.728],
						[70.667, 40.96],
						[70.458, 40.496],
						[70.601, 40.219],
						[71.014, 40.244],
						[70.648, 39.936],
						[69.56, 40.103],
						[69.465, 39.527],
						[70.549, 39.604],
						[71.785, 39.279],
						[73.675, 39.431],
						[73.929, 38.506],
						[74.258, 38.607],
						[74.865, 38.379],
						[74.83, 37.99],
						[74.98, 37.42],
						[73.949, 37.422],
						[73.26, 37.495],
						[72.637, 37.048],
						[72.193, 36.948],
						[71.845, 36.738],
						[71.449, 37.066],
						[71.542, 37.906],
						[71.239, 37.953],
						[71.348, 38.259],
						[70.807, 38.486],
						[70.376, 38.138],
						[70.271, 37.735],
						[70.117, 37.588],
						[69.519, 37.609],
						[69.196, 37.151],
						[68.859, 37.344],
						[68.136, 37.023],
						[67.83, 37.145]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "吉尔吉斯斯坦",
					"x": 74.532637,
					"y": 41.66854,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[70.962, 42.266],
						[71.186, 42.704],
						[71.845, 42.845],
						[73.49, 42.501],
						[73.645, 43.091],
						[74.213, 43.298],
						[75.637, 42.878],
						[76, 42.988],
						[77.658, 42.961],
						[79.142, 42.856],
						[79.644, 42.497],
						[80.26, 42.35],
						[80.119, 42.124],
						[78.544, 41.582],
						[78.187, 41.185],
						[76.904, 41.066],
						[76.526, 40.428],
						[75.468, 40.562],
						[74.777, 40.366],
						[73.822, 39.894],
						[73.96, 39.66],
						[73.675, 39.431],
						[71.785, 39.279],
						[70.549, 39.604],
						[69.465, 39.527],
						[69.56, 40.103],
						[70.648, 39.936],
						[71.014, 40.244],
						[71.775, 40.146],
						[73.055, 40.866],
						[71.87, 41.393],
						[71.158, 41.144],
						[70.42, 41.52],
						[71.259, 42.168],
						[70.962, 42.266]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "土库曼斯坦",
					"x": 58.676647,
					"y": 39.855246,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[52.502, 41.783],
						[52.944, 42.116],
						[54.079, 42.324],
						[54.755, 42.044],
						[55.455, 41.26],
						[55.968, 41.309],
						[57.096, 41.322],
						[56.932, 41.826],
						[57.787, 42.171],
						[58.629, 42.752],
						[59.976, 42.223],
						[60.083, 41.425],
						[60.466, 41.22],
						[61.547, 41.266],
						[61.883, 41.085],
						[62.374, 40.054],
						[63.518, 39.363],
						[64.17, 38.892],
						[65.216, 38.403],
						[66.546, 37.975],
						[66.519, 37.363],
						[66.217, 37.394],
						[65.746, 37.661],
						[65.589, 37.305],
						[64.746, 37.112],
						[64.546, 36.312],
						[63.983, 36.008],
						[63.194, 35.857],
						[62.985, 35.404],
						[62.231, 35.271],
						[61.211, 35.65],
						[61.123, 36.492],
						[60.378, 36.527],
						[59.235, 37.413],
						[58.436, 37.522],
						[57.33, 38.029],
						[56.619, 38.121],
						[56.18, 37.935],
						[55.512, 37.964],
						[54.8, 37.392],
						[53.922, 37.199],
						[53.736, 37.906],
						[53.881, 38.952],
						[53.101, 39.291],
						[53.358, 39.975],
						[52.694, 40.034],
						[52.915, 40.877],
						[53.858, 40.631],
						[54.737, 40.951],
						[54.008, 41.551],
						[53.722, 42.123],
						[52.917, 41.868],
						[52.815, 41.135],
						[52.502, 41.783]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "伊朗",
					"x": 54.931495,
					"y": 32.166225,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[48.568, 29.927],
						[48.015, 30.452],
						[48.005, 30.985],
						[47.685, 30.985],
						[47.849, 31.709],
						[47.335, 32.469],
						[46.109, 33.017],
						[45.417, 33.968],
						[45.648, 34.748],
						[46.152, 35.093],
						[46.076, 35.677],
						[45.421, 35.978],
						[44.773, 37.17],
						[44.773, 37.17],
						[44.226, 37.972],
						[44.421, 38.281],
						[44.109, 39.428],
						[44.794, 39.713],
						[44.953, 39.336],
						[45.458, 38.874],
						[46.144, 38.741],
						[46.506, 38.771],
						[47.685, 39.508],
						[48.06, 39.582],
						[48.356, 39.289],
						[48.011, 38.794],
						[48.634, 38.27],
						[48.883, 38.32],
						[49.2, 37.583],
						[50.148, 37.375],
						[50.842, 36.873],
						[52.264, 36.7],
						[53.826, 36.965],
						[53.922, 37.199],
						[54.8, 37.392],
						[55.512, 37.964],
						[56.18, 37.935],
						[56.619, 38.121],
						[57.33, 38.029],
						[58.436, 37.522],
						[59.235, 37.413],
						[60.378, 36.527],
						[61.123, 36.492],
						[61.211, 35.65],
						[60.803, 34.404],
						[60.528, 33.676],
						[60.964, 33.529],
						[60.536, 32.981],
						[60.864, 32.183],
						[60.942, 31.548],
						[61.699, 31.38],
						[61.781, 30.736],
						[60.874, 29.829],
						[61.369, 29.303],
						[61.772, 28.699],
						[62.728, 28.26],
						[62.755, 27.379],
						[63.234, 27.217],
						[63.317, 26.757],
						[61.874, 26.24],
						[61.497, 25.078],
						[59.616, 25.38],
						[58.526, 25.61],
						[57.397, 25.74],
						[56.971, 26.966],
						[56.492, 27.143],
						[55.724, 26.965],
						[54.715, 26.481],
						[53.493, 26.812],
						[52.484, 27.581],
						[51.521, 27.866],
						[50.853, 28.815],
						[50.115, 30.148],
						[49.577, 29.986],
						[48.941, 30.317],
						[48.568, 29.927]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "叙利亚",
					"x": 38.277783,
					"y": 35.006636,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[35.72, 32.709],
						[35.701, 32.716],
						[35.836, 32.868],
						[35.821, 33.277],
						[36.066, 33.825],
						[36.612, 34.202],
						[36.448, 34.594],
						[35.998, 34.645],
						[35.905, 35.41],
						[36.15, 35.822],
						[36.418, 36.041],
						[36.685, 36.26],
						[36.739, 36.818],
						[37.067, 36.623],
						[38.168, 36.901],
						[38.7, 36.713],
						[39.523, 36.716],
						[40.673, 37.091],
						[41.212, 37.074],
						[42.35, 37.23],
						[41.837, 36.606],
						[41.29, 36.359],
						[41.384, 35.628],
						[41.006, 34.419],
						[38.792, 33.379],
						[36.834, 32.313],
						[35.72, 32.709]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "亚美尼亚",
					"x": 44.800564,
					"y": 40.459077,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[46.506, 38.771],
						[46.144, 38.741],
						[45.735, 39.32],
						[45.74, 39.474],
						[45.298, 39.472],
						[45.002, 39.74],
						[44.794, 39.713],
						[44.4, 40.005],
						[43.656, 40.254],
						[43.753, 40.74],
						[43.583, 41.092],
						[44.972, 41.248],
						[45.179, 40.985],
						[45.56, 40.812],
						[45.359, 40.562],
						[45.892, 40.218],
						[45.61, 39.9],
						[46.035, 39.628],
						[46.483, 39.464],
						[46.506, 38.771]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "瑞典",
					"x": 19.01705,
					"y": 65.85918,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[11.027, 58.856],
						[11.468, 59.432],
						[12.3, 60.118],
						[12.631, 61.294],
						[11.992, 61.8],
						[11.931, 63.128],
						[12.58, 64.066],
						[13.572, 64.049],
						[13.92, 64.445],
						[13.556, 64.787],
						[15.108, 66.194],
						[16.109, 67.302],
						[16.769, 68.014],
						[17.729, 68.011],
						[17.994, 68.567],
						[19.879, 68.407],
						[20.025, 69.065],
						[20.646, 69.106],
						[21.979, 68.617],
						[23.539, 67.936],
						[23.566, 66.396],
						[23.903, 66.007],
						[22.183, 65.724],
						[21.214, 65.026],
						[21.37, 64.414],
						[19.779, 63.61],
						[17.848, 62.749],
						[17.12, 61.341],
						[17.831, 60.637],
						[18.788, 60.082],
						[17.869, 58.954],
						[16.829, 58.72],
						[16.448, 57.041],
						[15.88, 56.104],
						[14.667, 56.201],
						[14.101, 55.408],
						[12.943, 55.362],
						[12.625, 56.307],
						[11.788, 57.442],
						[11.027, 58.856]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "白俄罗斯",
					"x": 28.417701,
					"y": 53.821888,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[28.177, 56.169],
						[29.23, 55.918],
						[29.372, 55.67],
						[29.896, 55.789],
						[30.874, 55.551],
						[30.972, 55.082],
						[30.758, 54.812],
						[31.384, 54.157],
						[31.791, 53.975],
						[31.731, 53.794],
						[32.406, 53.618],
						[32.694, 53.351],
						[32.305, 53.133],
						[31.498, 53.167],
						[31.305, 53.074],
						[31.54, 52.742],
						[31.786, 52.102],
						[31.786, 52.102],
						[30.928, 52.042],
						[30.619, 51.823],
						[30.555, 51.32],
						[30.157, 51.416],
						[29.255, 51.368],
						[28.993, 51.602],
						[28.618, 51.428],
						[28.242, 51.572],
						[27.454, 51.592],
						[26.338, 51.832],
						[25.328, 51.911],
						[24.553, 51.888],
						[24.005, 51.617],
						[23.527, 51.578],
						[23.508, 52.024],
						[23.199, 52.487],
						[23.799, 52.691],
						[23.805, 53.09],
						[23.528, 53.47],
						[23.484, 53.912],
						[24.451, 53.906],
						[25.536, 54.282],
						[25.768, 54.847],
						[26.588, 55.167],
						[26.494, 55.615],
						[27.102, 55.783],
						[28.177, 56.169]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "乌克兰",
					"x": 32.140865,
					"y": 49.724739,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[31.786, 52.102],
						[32.159, 52.061],
						[32.412, 52.289],
						[32.716, 52.238],
						[33.753, 52.335],
						[34.392, 51.769],
						[34.142, 51.566],
						[34.225, 51.256],
						[35.022, 51.208],
						[35.378, 50.774],
						[35.356, 50.577],
						[36.626, 50.226],
						[37.393, 50.384],
						[38.011, 49.916],
						[38.595, 49.926],
						[40.069, 49.601],
						[40.081, 49.307],
						[39.675, 48.784],
						[39.896, 48.232],
						[39.738, 47.899],
						[38.771, 47.826],
						[38.255, 47.546],
						[38.224, 47.102],
						[37.425, 47.022],
						[36.76, 46.699],
						[35.824, 46.646],
						[34.962, 46.273],
						[35.013, 45.738],
						[34.862, 45.768],
						[34.732, 45.966],
						[34.41, 46.005],
						[33.699, 46.22],
						[33.436, 45.972],
						[33.299, 46.081],
						[31.744, 46.333],
						[31.675, 46.706],
						[30.749, 46.583],
						[30.378, 46.032],
						[29.603, 45.293],
						[29.15, 45.465],
						[28.68, 45.304],
						[28.234, 45.488],
						[28.485, 45.597],
						[28.66, 45.94],
						[28.934, 46.259],
						[28.863, 46.438],
						[29.072, 46.518],
						[29.171, 46.379],
						[29.76, 46.35],
						[30.025, 46.424],
						[29.838, 46.525],
						[29.909, 46.674],
						[29.56, 46.929],
						[29.415, 47.347],
						[29.051, 47.51],
						[29.123, 47.849],
						[28.671, 48.118],
						[28.26, 48.156],
						[27.523, 48.467],
						[26.858, 48.368],
						[26.619, 48.221],
						[26.197, 48.221],
						[25.946, 47.987],
						[25.208, 47.891],
						[24.866, 47.738],
						[24.402, 47.982],
						[23.761, 47.986],
						[23.142, 48.096],
						[22.711, 47.882],
						[22.641, 48.15],
						[22.086, 48.422],
						[22.281, 48.825],
						[22.558, 49.086],
						[22.776, 49.027],
						[22.518, 49.477],
						[23.427, 50.309],
						[23.923, 50.425],
						[24.03, 50.705],
						[23.527, 51.578],
						[24.005, 51.617],
						[24.553, 51.888],
						[25.328, 51.911],
						[26.338, 51.832],
						[27.454, 51.592],
						[28.242, 51.572],
						[28.618, 51.428],
						[28.993, 51.602],
						[29.255, 51.368],
						[30.157, 51.416],
						[30.555, 51.32],
						[30.619, 51.823],
						[30.928, 52.042],
						[31.786, 52.102]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "波兰",
					"x": 19.490468,
					"y": 51.990316,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[23.484, 53.912],
						[23.528, 53.47],
						[23.805, 53.09],
						[23.799, 52.691],
						[23.199, 52.487],
						[23.508, 52.024],
						[23.527, 51.578],
						[24.03, 50.705],
						[23.923, 50.425],
						[23.427, 50.309],
						[22.518, 49.477],
						[22.776, 49.027],
						[22.558, 49.086],
						[21.608, 49.47],
						[20.888, 49.329],
						[20.416, 49.431],
						[19.825, 49.217],
						[19.321, 49.572],
						[18.91, 49.436],
						[18.853, 49.496],
						[18.393, 49.989],
						[17.649, 50.049],
						[17.555, 50.362],
						[16.869, 50.474],
						[16.719, 50.216],
						[16.176, 50.423],
						[16.239, 50.698],
						[15.491, 50.785],
						[15.017, 51.107],
						[14.607, 51.745],
						[14.685, 52.09],
						[14.438, 52.625],
						[14.075, 52.981],
						[14.353, 53.248],
						[14.12, 53.757],
						[14.803, 54.051],
						[16.363, 54.513],
						[17.623, 54.852],
						[18.621, 54.683],
						[18.696, 54.439],
						[19.661, 54.426],
						[20.892, 54.313],
						[22.731, 54.328],
						[23.244, 54.221],
						[23.484, 53.912]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "奥地利",
					"x": 14.130515,
					"y": 47.518859,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[16.98, 48.123],
						[16.904, 47.715],
						[16.341, 47.713],
						[16.534, 47.496],
						[16.202, 46.852],
						[16.012, 46.684],
						[15.137, 46.659],
						[14.632, 46.432],
						[13.806, 46.509],
						[12.376, 46.768],
						[12.153, 47.115],
						[11.165, 46.942],
						[11.049, 46.751],
						[10.443, 46.894],
						[9.932, 46.921],
						[9.48, 47.103],
						[9.633, 47.348],
						[9.594, 47.525],
						[9.896, 47.58],
						[10.402, 47.302],
						[10.545, 47.566],
						[11.426, 47.524],
						[12.141, 47.703],
						[12.621, 47.672],
						[12.933, 47.468],
						[13.026, 47.638],
						[12.884, 48.289],
						[13.243, 48.416],
						[13.596, 48.877],
						[14.339, 48.555],
						[14.901, 48.964],
						[15.253, 49.039],
						[16.03, 48.734],
						[16.499, 48.786],
						[16.96, 48.597],
						[16.88, 48.47],
						[16.98, 48.123]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "匈牙利",
					"x": 19.447867,
					"y": 47.086841,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[22.086, 48.422],
						[22.641, 48.15],
						[22.711, 47.882],
						[22.1, 47.672],
						[21.627, 46.994],
						[21.022, 46.316],
						[20.22, 46.127],
						[19.596, 46.172],
						[18.83, 45.909],
						[18.83, 45.909],
						[18.456, 45.759],
						[17.63, 45.952],
						[16.883, 46.381],
						[16.565, 46.504],
						[16.371, 46.841],
						[16.202, 46.852],
						[16.534, 47.496],
						[16.341, 47.713],
						[16.904, 47.715],
						[16.98, 48.123],
						[17.488, 47.867],
						[17.857, 47.758],
						[18.697, 47.881],
						[18.777, 48.082],
						[19.174, 48.111],
						[19.661, 48.267],
						[19.769, 48.203],
						[20.239, 48.328],
						[20.474, 48.563],
						[20.801, 48.624],
						[21.872, 48.32],
						[22.086, 48.422]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "摩尔多瓦",
					"x": 28.487904,
					"y": 47.434999,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[26.619, 48.221],
						[26.858, 48.368],
						[27.523, 48.467],
						[28.26, 48.156],
						[28.671, 48.118],
						[29.123, 47.849],
						[29.051, 47.51],
						[29.415, 47.347],
						[29.56, 46.929],
						[29.909, 46.674],
						[29.838, 46.525],
						[30.025, 46.424],
						[29.76, 46.35],
						[29.171, 46.379],
						[29.072, 46.518],
						[28.863, 46.438],
						[28.934, 46.259],
						[28.66, 45.94],
						[28.485, 45.597],
						[28.234, 45.488],
						[28.054, 45.945],
						[28.16, 46.372],
						[28.128, 46.81],
						[27.551, 47.405],
						[27.234, 47.827],
						[26.924, 48.123],
						[26.619, 48.221]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "罗马尼亚",
					"x": 24.972624,
					"y": 45.733237,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[28.234, 45.488],
						[28.68, 45.304],
						[29.15, 45.465],
						[29.603, 45.293],
						[29.627, 45.035],
						[29.142, 44.82],
						[28.838, 44.914],
						[28.558, 43.707],
						[27.97, 43.812],
						[27.242, 44.176],
						[26.065, 43.943],
						[25.569, 43.688],
						[24.101, 43.741],
						[23.332, 43.897],
						[22.945, 43.824],
						[22.657, 44.235],
						[22.474, 44.409],
						[22.706, 44.578],
						[22.459, 44.703],
						[22.145, 44.478],
						[21.562, 44.769],
						[21.484, 45.181],
						[20.874, 45.416],
						[20.762, 45.735],
						[20.22, 46.127],
						[21.022, 46.316],
						[21.627, 46.994],
						[22.1, 47.672],
						[22.711, 47.882],
						[23.142, 48.096],
						[23.761, 47.986],
						[24.402, 47.982],
						[24.866, 47.738],
						[25.208, 47.891],
						[25.946, 47.987],
						[26.197, 48.221],
						[26.619, 48.221],
						[26.924, 48.123],
						[27.234, 47.827],
						[27.551, 47.405],
						[28.128, 46.81],
						[28.16, 46.372],
						[28.054, 45.945],
						[28.234, 45.488]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "立陶宛",
					"x": 24.089932,
					"y": 55.103703,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[26.494, 55.615],
						[26.588, 55.167],
						[25.768, 54.847],
						[25.536, 54.282],
						[24.451, 53.906],
						[23.484, 53.912],
						[23.244, 54.221],
						[22.731, 54.328],
						[22.651, 54.583],
						[22.758, 54.857],
						[22.316, 55.015],
						[21.268, 55.19],
						[21.056, 56.031],
						[22.201, 56.338],
						[23.878, 56.274],
						[24.861, 56.373],
						[25.001, 56.165],
						[25.533, 56.1],
						[26.494, 55.615]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "拉脱维亚",
					"x": 25.458723,
					"y": 57.066872,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[27.288, 57.475],
						[27.77, 57.244],
						[27.855, 56.759],
						[28.177, 56.169],
						[27.102, 55.783],
						[26.494, 55.615],
						[25.533, 56.1],
						[25.001, 56.165],
						[24.861, 56.373],
						[23.878, 56.274],
						[22.201, 56.338],
						[21.056, 56.031],
						[21.09, 56.784],
						[21.582, 57.412],
						[22.524, 57.753],
						[23.318, 57.006],
						[24.121, 57.026],
						[24.313, 57.793],
						[25.165, 57.97],
						[25.603, 57.848],
						[26.464, 57.476],
						[27.288, 57.475]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "爱沙尼亚",
					"x": 25.867126,
					"y": 58.724865,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[27.981, 59.475],
						[27.981, 59.475],
						[28.132, 59.301],
						[27.42, 58.725],
						[27.717, 57.792],
						[27.288, 57.475],
						[26.464, 57.476],
						[25.603, 57.848],
						[25.165, 57.97],
						[24.313, 57.793],
						[24.429, 58.383],
						[24.061, 58.257],
						[23.427, 58.613],
						[23.34, 59.187],
						[24.604, 59.466],
						[25.864, 59.611],
						[26.949, 59.446],
						[27.981, 59.475],
						[27.981, 59.475]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "德国",
					"x": 9.678348,
					"y": 50.961733,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[14.12, 53.757],
						[14.353, 53.248],
						[14.075, 52.981],
						[14.438, 52.625],
						[14.685, 52.09],
						[14.607, 51.745],
						[15.017, 51.107],
						[14.571, 51.002],
						[14.307, 51.117],
						[14.056, 50.927],
						[13.338, 50.733],
						[12.967, 50.484],
						[12.24, 50.266],
						[12.415, 49.969],
						[12.521, 49.547],
						[13.031, 49.307],
						[13.596, 48.877],
						[13.243, 48.416],
						[12.884, 48.289],
						[13.026, 47.638],
						[12.933, 47.468],
						[12.621, 47.672],
						[12.141, 47.703],
						[11.426, 47.524],
						[10.545, 47.566],
						[10.402, 47.302],
						[9.896, 47.58],
						[9.594, 47.525],
						[8.523, 47.831],
						[8.317, 47.614],
						[7.467, 47.621],
						[7.594, 48.333],
						[8.099, 49.018],
						[6.658, 49.202],
						[6.186, 49.464],
						[6.243, 49.902],
						[6.043, 50.128],
						[6.157, 50.804],
						[5.989, 51.852],
						[6.589, 51.852],
						[6.843, 52.228],
						[7.092, 53.144],
						[6.905, 53.482],
						[7.1, 53.694],
						[7.936, 53.748],
						[8.122, 53.528],
						[8.801, 54.021],
						[8.572, 54.396],
						[8.526, 54.963],
						[9.282, 54.831],
						[9.922, 54.983],
						[9.94, 54.597],
						[10.95, 54.364],
						[10.939, 54.009],
						[11.956, 54.196],
						[12.518, 54.47],
						[13.647, 54.076],
						[14.12, 53.757]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "保加利亚",
					"x": 25.15709,
					"y": 42.508785,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[22.657, 44.235],
						[22.945, 43.824],
						[23.332, 43.897],
						[24.101, 43.741],
						[25.569, 43.688],
						[26.065, 43.943],
						[27.242, 44.176],
						[27.97, 43.812],
						[28.558, 43.707],
						[28.039, 43.293],
						[27.674, 42.578],
						[27.997, 42.007],
						[27.136, 42.141],
						[26.117, 41.827],
						[26.106, 41.329],
						[25.197, 41.234],
						[24.493, 41.584],
						[23.692, 41.309],
						[22.952, 41.338],
						[22.881, 41.999],
						[22.381, 42.32],
						[22.545, 42.461],
						[22.437, 42.58],
						[22.605, 42.899],
						[22.986, 43.211],
						[22.5, 43.643],
						[22.41, 44.008],
						[22.657, 44.235]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "希腊",
					"x": 21.72568,
					"y": 39.492763,
					"rank": 3
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[26.29, 35.3],
						[26.165, 35.005],
						[24.725, 34.92],
						[24.735, 35.085],
						[23.515, 35.28],
						[23.7, 35.705],
						[24.247, 35.368],
						[25.025, 35.425],
						[25.769, 35.354],
						[25.745, 35.18],
						[26.29, 35.3]
					]], [[
						[22.952, 41.338],
						[23.692, 41.309],
						[24.493, 41.584],
						[25.197, 41.234],
						[26.106, 41.329],
						[26.117, 41.827],
						[26.604, 41.562],
						[26.295, 40.936],
						[26.057, 40.824],
						[25.448, 40.853],
						[24.926, 40.947],
						[23.715, 40.687],
						[24.408, 40.125],
						[23.9, 39.962],
						[23.343, 39.961],
						[22.814, 40.476],
						[22.626, 40.257],
						[22.85, 39.659],
						[23.35, 39.19],
						[22.973, 38.971],
						[23.53, 38.51],
						[24.025, 38.22],
						[24.04, 37.655],
						[23.115, 37.92],
						[23.41, 37.41],
						[22.775, 37.305],
						[23.154, 36.423],
						[22.49, 36.41],
						[21.67, 36.845],
						[21.295, 37.645],
						[21.12, 38.31],
						[20.73, 38.77],
						[20.218, 39.34],
						[20.15, 39.625],
						[20.615, 40.11],
						[20.675, 40.435],
						[21, 40.58],
						[21.02, 40.843],
						[21.674, 40.931],
						[22.055, 41.15],
						[22.597, 41.13],
						[22.762, 41.305],
						[22.952, 41.338]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "土耳其",
					"x": 34.508268,
					"y": 39.345388,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[44.773, 37.17],
						[44.293, 37.002],
						[43.942, 37.256],
						[42.779, 37.385],
						[42.35, 37.23],
						[41.212, 37.074],
						[40.673, 37.091],
						[39.523, 36.716],
						[38.7, 36.713],
						[38.168, 36.901],
						[37.067, 36.623],
						[36.739, 36.818],
						[36.685, 36.26],
						[36.418, 36.041],
						[36.15, 35.822],
						[35.782, 36.275],
						[36.161, 36.651],
						[35.551, 36.565],
						[34.715, 36.796],
						[34.027, 36.22],
						[32.509, 36.108],
						[31.7, 36.644],
						[30.622, 36.678],
						[30.391, 36.263],
						[29.7, 36.144],
						[28.733, 36.677],
						[27.641, 36.659],
						[27.049, 37.653],
						[26.318, 38.208],
						[26.805, 38.986],
						[26.171, 39.464],
						[27.28, 40.42],
						[28.82, 40.46],
						[29.24, 41.22],
						[31.146, 41.088],
						[32.348, 41.736],
						[33.513, 42.019],
						[35.168, 42.04],
						[36.913, 41.335],
						[38.348, 40.949],
						[39.513, 41.103],
						[40.373, 41.014],
						[41.554, 41.536],
						[42.62, 41.583],
						[43.583, 41.092],
						[43.753, 40.74],
						[43.656, 40.254],
						[44.4, 40.005],
						[44.794, 39.713],
						[44.109, 39.428],
						[44.421, 38.281],
						[44.226, 37.972],
						[44.773, 37.17],
						[44.773, 37.17]
					]], [[
						[26.117, 41.827],
						[27.136, 42.141],
						[27.997, 42.007],
						[28.116, 41.623],
						[28.988, 41.3],
						[28.806, 41.055],
						[27.619, 41],
						[27.192, 40.691],
						[26.358, 40.152],
						[26.043, 40.618],
						[26.057, 40.824],
						[26.295, 40.936],
						[26.604, 41.562],
						[26.117, 41.827]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "阿尔巴尼亚",
					"x": 20.11384,
					"y": 40.654855,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[21.02, 40.843],
						[21, 40.58],
						[20.675, 40.435],
						[20.615, 40.11],
						[20.15, 39.625],
						[19.98, 39.695],
						[19.96, 39.915],
						[19.406, 40.251],
						[19.319, 40.727],
						[19.404, 41.41],
						[19.54, 41.72],
						[19.372, 41.878],
						[19.372, 41.878],
						[19.304, 42.196],
						[19.738, 42.688],
						[19.802, 42.5],
						[20.071, 42.589],
						[20.284, 42.32],
						[20.523, 42.218],
						[20.59, 41.855],
						[20.59, 41.855],
						[20.463, 41.515],
						[20.605, 41.086],
						[21.02, 40.843]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "克罗地亚",
					"x": 16.37241,
					"y": 45.805799,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[16.565, 46.504],
						[16.883, 46.381],
						[17.63, 45.952],
						[18.456, 45.759],
						[18.83, 45.909],
						[19.073, 45.522],
						[19.39, 45.237],
						[19.005, 44.86],
						[18.553, 45.082],
						[17.862, 45.068],
						[17.002, 45.234],
						[16.535, 45.212],
						[16.318, 45.004],
						[15.959, 45.234],
						[15.75, 44.819],
						[16.24, 44.351],
						[16.456, 44.041],
						[16.916, 43.668],
						[17.297, 43.446],
						[17.675, 43.029],
						[18.56, 42.65],
						[18.45, 42.48],
						[18.45, 42.48],
						[17.51, 42.85],
						[16.93, 43.21],
						[16.015, 43.507],
						[15.174, 44.243],
						[15.376, 44.318],
						[14.92, 44.738],
						[14.902, 45.076],
						[14.259, 45.234],
						[13.952, 44.802],
						[13.657, 45.137],
						[13.679, 45.484],
						[13.715, 45.5],
						[14.412, 45.466],
						[14.595, 45.635],
						[14.935, 45.472],
						[15.328, 45.452],
						[15.324, 45.732],
						[15.672, 45.834],
						[15.769, 46.238],
						[16.565, 46.504]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "瑞士",
					"x": 7.463965,
					"y": 46.719114,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[9.594, 47.525],
						[9.633, 47.348],
						[9.48, 47.103],
						[9.932, 46.921],
						[10.443, 46.894],
						[10.363, 46.484],
						[9.923, 46.315],
						[9.183, 46.44],
						[8.966, 46.037],
						[8.49, 46.005],
						[8.317, 46.164],
						[7.756, 45.824],
						[7.274, 45.777],
						[6.844, 45.991],
						[6.5, 46.43],
						[6.023, 46.273],
						[6.037, 46.726],
						[6.769, 47.288],
						[6.737, 47.542],
						[7.192, 47.45],
						[7.467, 47.621],
						[8.317, 47.614],
						[8.523, 47.831],
						[9.594, 47.525]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "卢森堡",
					"x": 6.07762,
					"y": 49.733732,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[6.043, 50.128],
						[6.243, 49.902],
						[6.186, 49.464],
						[5.898, 49.443],
						[5.674, 49.529],
						[5.782, 50.09],
						[6.043, 50.128]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "比利时",
					"x": 4.800448,
					"y": 50.785392,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[6.157, 50.804],
						[6.043, 50.128],
						[5.782, 50.09],
						[5.674, 49.529],
						[4.799, 49.985],
						[4.286, 49.907],
						[3.588, 50.379],
						[3.123, 50.78],
						[2.658, 50.797],
						[2.514, 51.149],
						[3.315, 51.346],
						[3.315, 51.346],
						[3.315, 51.346],
						[4.047, 51.267],
						[4.974, 51.475],
						[5.607, 51.037],
						[6.157, 50.804]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "荷兰",
					"x": 5.61144,
					"y": 52.422211,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[6.905, 53.482],
						[7.092, 53.144],
						[6.843, 52.228],
						[6.589, 51.852],
						[5.989, 51.852],
						[6.157, 50.804],
						[5.607, 51.037],
						[4.974, 51.475],
						[4.047, 51.267],
						[3.315, 51.346],
						[3.315, 51.346],
						[3.83, 51.621],
						[4.706, 53.092],
						[6.074, 53.51],
						[6.905, 53.482]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "葡萄牙",
					"x": -8.271754,
					"y": 39.606675,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-9.035, 41.881],
						[-8.672, 42.135],
						[-8.264, 42.28],
						[-8.013, 41.791],
						[-7.423, 41.792],
						[-7.251, 41.918],
						[-6.669, 41.883],
						[-6.389, 41.382],
						[-6.851, 41.111],
						[-6.864, 40.331],
						[-7.026, 40.185],
						[-7.067, 39.712],
						[-7.499, 39.63],
						[-7.098, 39.03],
						[-7.374, 38.373],
						[-7.029, 38.076],
						[-7.167, 37.804],
						[-7.537, 37.429],
						[-7.454, 37.098],
						[-7.856, 36.838],
						[-8.383, 36.979],
						[-8.899, 36.869],
						[-8.746, 37.651],
						[-8.84, 38.266],
						[-9.287, 38.358],
						[-9.527, 38.737],
						[-9.447, 39.392],
						[-9.048, 39.755],
						[-8.977, 40.159],
						[-8.769, 40.761],
						[-8.791, 41.184],
						[-8.991, 41.543],
						[-9.035, 41.881]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "西班牙",
					"x": -3.464718,
					"y": 40.090953,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-7.454, 37.098],
						[-7.537, 37.429],
						[-7.167, 37.804],
						[-7.029, 38.076],
						[-7.374, 38.373],
						[-7.098, 39.03],
						[-7.499, 39.63],
						[-7.067, 39.712],
						[-7.026, 40.185],
						[-6.864, 40.331],
						[-6.851, 41.111],
						[-6.389, 41.382],
						[-6.669, 41.883],
						[-7.251, 41.918],
						[-7.423, 41.792],
						[-8.013, 41.791],
						[-8.264, 42.28],
						[-8.672, 42.135],
						[-9.035, 41.881],
						[-8.984, 42.593],
						[-9.393, 43.027],
						[-7.978, 43.748],
						[-6.754, 43.568],
						[-5.412, 43.574],
						[-4.348, 43.403],
						[-3.518, 43.456],
						[-1.901, 43.423],
						[-1.503, 43.034],
						[.338, 42.58],
						[.702, 42.796],
						[1.827, 42.343],
						[2.986, 42.473],
						[3.039, 41.892],
						[2.092, 41.226],
						[.811, 41.015],
						[.721, 40.678],
						[.107, 40.124],
						[-.279, 39.31],
						[.111, 38.739],
						[-.467, 38.292],
						[-.683, 37.642],
						[-1.438, 37.443],
						[-2.146, 36.674],
						[-3.416, 36.659],
						[-4.369, 36.678],
						[-4.995, 36.325],
						[-5.377, 35.947],
						[-5.866, 36.03],
						[-6.237, 36.368],
						[-6.52, 36.943],
						[-7.454, 37.098]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "爱尔兰",
					"x": -7.798588,
					"y": 53.078726,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-6.198, 53.868],
						[-6.033, 53.153],
						[-6.789, 52.26],
						[-8.562, 51.669],
						[-9.977, 51.82],
						[-9.166, 52.865],
						[-9.689, 53.881],
						[-8.328, 54.665],
						[-7.572, 55.132],
						[-7.366, 54.596],
						[-7.572, 54.06],
						[-6.954, 54.074],
						[-6.198, 53.868]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "新喀里多尼亚",
					"x": 165.084004,
					"y": -21.064697,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[165.78, -21.08],
						[166.6, -21.7],
						[167.12, -22.16],
						[166.74, -22.4],
						[166.19, -22.13],
						[165.474, -21.68],
						[164.83, -21.15],
						[164.168, -20.445],
						[164.03, -20.106],
						[164.46, -20.12],
						[165.02, -20.46],
						[165.46, -20.8],
						[165.78, -21.08]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "所罗门群岛",
					"x": 159.170468,
					"y": -8.029548,
					"rank": 3
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[162.119, -10.483],
							[162.399, -10.826],
							[161.7, -10.82],
							[161.32, -10.205],
							[161.917, -10.447],
							[162.119, -10.483]
						]],
						[[
							[161.68, -9.6],
							[161.529, -9.784],
							[160.788, -8.918],
							[160.58, -8.32],
							[160.92, -8.32],
							[161.28, -9.12],
							[161.68, -9.6]
						]],
						[[
							[160.852, -9.873],
							[160.463, -9.895],
							[159.849, -9.794],
							[159.64, -9.64],
							[159.703, -9.243],
							[160.363, -9.4],
							[160.689, -9.61],
							[160.852, -9.873]
						]],
						[[
							[159.64, -8.02],
							[159.875, -8.337],
							[159.917, -8.538],
							[159.134, -8.114],
							[158.586, -7.755],
							[158.211, -7.422],
							[158.36, -7.32],
							[158.82, -7.56],
							[159.64, -8.02]
						]],
						[[
							[157.14, -7.022],
							[157.538, -7.348],
							[157.339, -7.405],
							[156.902, -7.177],
							[156.491, -6.766],
							[156.543, -6.599],
							[157.14, -7.022]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "新西兰",
					"x": 172.787,
					"y": -39.759,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[176.886, -40.066],
						[176.508, -40.605],
						[176.012, -41.29],
						[175.24, -41.688],
						[175.068, -41.426],
						[174.651, -41.282],
						[175.228, -40.459],
						[174.9, -39.909],
						[173.824, -39.509],
						[173.852, -39.147],
						[174.575, -38.798],
						[174.743, -38.028],
						[174.697, -37.381],
						[174.292, -36.711],
						[174.319, -36.535],
						[173.841, -36.122],
						[173.054, -35.237],
						[172.636, -34.529],
						[173.007, -34.451],
						[173.551, -35.006],
						[174.329, -35.265],
						[174.612, -36.156],
						[175.337, -37.209],
						[175.358, -36.526],
						[175.809, -36.799],
						[175.958, -37.555],
						[176.763, -37.881],
						[177.439, -37.961],
						[178.01, -37.58],
						[178.517, -37.695],
						[178.275, -38.583],
						[177.97, -39.166],
						[177.207, -39.146],
						[176.94, -39.45],
						[177.033, -39.88],
						[176.886, -40.066]
					]], [[
						[169.668, -43.555],
						[170.525, -43.032],
						[171.125, -42.513],
						[171.57, -41.767],
						[171.949, -41.514],
						[172.097, -40.956],
						[172.799, -40.494],
						[173.02, -40.919],
						[173.247, -41.332],
						[173.958, -40.927],
						[174.248, -41.349],
						[174.249, -41.77],
						[173.876, -42.233],
						[173.223, -42.97],
						[172.711, -43.372],
						[173.08, -43.853],
						[172.309, -43.866],
						[171.453, -44.243],
						[171.185, -44.897],
						[170.617, -45.909],
						[169.831, -46.356],
						[169.332, -46.641],
						[168.411, -46.62],
						[167.764, -46.29],
						[166.677, -46.22],
						[166.509, -45.853],
						[167.046, -45.111],
						[168.304, -44.124],
						[168.949, -43.936],
						[169.668, -43.555]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "澳大利亚",
					"x": 134.04972,
					"y": -24.129522,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[147.689, -40.808],
						[148.289, -40.875],
						[148.36, -42.062],
						[148.017, -42.407],
						[147.914, -43.212],
						[147.565, -42.938],
						[146.87, -43.635],
						[146.663, -43.581],
						[146.048, -43.55],
						[145.432, -42.694],
						[145.295, -42.034],
						[144.718, -41.163],
						[144.744, -40.704],
						[145.398, -40.793],
						[146.364, -41.138],
						[146.909, -41.001],
						[147.689, -40.808]
					]], [[
						[126.149, -32.216],
						[125.089, -32.729],
						[124.222, -32.959],
						[124.029, -33.484],
						[123.66, -33.89],
						[122.811, -33.914],
						[122.183, -34.003],
						[121.299, -33.821],
						[120.58, -33.93],
						[119.894, -33.976],
						[119.299, -34.509],
						[119.007, -34.464],
						[118.506, -34.747],
						[118.025, -35.065],
						[117.296, -35.025],
						[116.625, -35.025],
						[115.564, -34.386],
						[115.027, -34.197],
						[115.049, -33.623],
						[115.545, -33.487],
						[115.715, -33.26],
						[115.679, -32.9],
						[115.802, -32.205],
						[115.69, -31.612],
						[115.161, -30.602],
						[114.997, -30.031],
						[115.04, -29.461],
						[114.642, -28.81],
						[114.616, -28.516],
						[114.174, -28.118],
						[114.049, -27.335],
						[113.477, -26.543],
						[113.339, -26.117],
						[113.778, -26.549],
						[113.441, -25.621],
						[113.937, -25.911],
						[114.233, -26.298],
						[114.216, -25.786],
						[113.721, -24.999],
						[113.625, -24.684],
						[113.394, -24.385],
						[113.502, -23.806],
						[113.707, -23.56],
						[113.843, -23.06],
						[113.737, -22.475],
						[114.15, -21.756],
						[114.225, -22.517],
						[114.648, -21.83],
						[115.46, -21.495],
						[115.947, -21.069],
						[116.712, -20.702],
						[117.166, -20.624],
						[117.442, -20.747],
						[118.23, -20.374],
						[118.836, -20.263],
						[118.988, -20.044],
						[119.252, -19.953],
						[119.805, -19.977],
						[120.856, -19.684],
						[121.4, -19.24],
						[121.655, -18.705],
						[122.242, -18.198],
						[122.287, -17.799],
						[122.313, -17.255],
						[123.013, -16.405],
						[123.434, -17.269],
						[123.859, -17.069],
						[123.503, -16.597],
						[123.817, -16.111],
						[124.258, -16.328],
						[124.38, -15.567],
						[124.926, -15.075],
						[125.167, -14.68],
						[125.67, -14.51],
						[125.686, -14.231],
						[126.125, -14.347],
						[126.143, -14.096],
						[126.583, -13.953],
						[127.066, -13.818],
						[127.805, -14.277],
						[128.36, -14.869],
						[128.986, -14.876],
						[129.621, -14.97],
						[129.41, -14.421],
						[129.889, -13.619],
						[130.339, -13.357],
						[130.184, -13.108],
						[130.618, -12.536],
						[131.223, -12.184],
						[131.735, -12.302],
						[132.575, -12.114],
						[132.557, -11.603],
						[131.825, -11.274],
						[132.357, -11.129],
						[133.02, -11.376],
						[133.551, -11.787],
						[134.393, -12.042],
						[134.679, -11.941],
						[135.298, -12.249],
						[135.883, -11.962],
						[136.258, -12.049],
						[136.492, -11.857],
						[136.952, -12.352],
						[136.685, -12.887],
						[136.305, -13.291],
						[135.962, -13.325],
						[136.078, -13.724],
						[135.784, -14.224],
						[135.429, -14.715],
						[135.5, -14.998],
						[136.295, -15.55],
						[137.065, -15.871],
						[137.58, -16.215],
						[138.303, -16.808],
						[138.585, -16.807],
						[139.109, -17.063],
						[139.261, -17.372],
						[140.215, -17.711],
						[140.875, -17.369],
						[141.071, -16.832],
						[141.274, -16.389],
						[141.398, -15.841],
						[141.702, -15.045],
						[141.563, -14.561],
						[141.636, -14.27],
						[141.52, -13.698],
						[141.651, -12.945],
						[141.843, -12.742],
						[141.687, -12.408],
						[141.929, -11.877],
						[142.118, -11.328],
						[142.144, -11.043],
						[142.515, -10.668],
						[142.797, -11.157],
						[142.867, -11.785],
						[143.116, -11.906],
						[143.159, -12.326],
						[143.522, -12.834],
						[143.597, -13.4],
						[143.562, -13.764],
						[143.922, -14.548],
						[144.564, -14.171],
						[144.895, -14.594],
						[145.375, -14.985],
						[145.272, -15.428],
						[145.485, -16.286],
						[145.637, -16.785],
						[145.889, -16.907],
						[146.16, -17.762],
						[146.064, -18.28],
						[146.387, -18.958],
						[147.471, -19.481],
						[148.178, -19.956],
						[148.848, -20.391],
						[148.717, -20.633],
						[149.289, -21.261],
						[149.678, -22.343],
						[150.077, -22.123],
						[150.483, -22.556],
						[150.727, -22.402],
						[150.9, -23.462],
						[151.609, -24.076],
						[152.074, -24.458],
						[152.855, -25.268],
						[153.136, -26.071],
						[153.162, -26.641],
						[153.093, -27.26],
						[153.569, -28.11],
						[153.512, -28.995],
						[153.339, -29.458],
						[153.069, -30.35],
						[153.09, -30.924],
						[152.892, -31.64],
						[152.45, -32.55],
						[151.709, -33.041],
						[151.344, -33.816],
						[151.011, -34.31],
						[150.714, -35.173],
						[150.328, -35.672],
						[150.075, -36.42],
						[149.946, -37.109],
						[149.997, -37.425],
						[149.424, -37.773],
						[148.305, -37.809],
						[147.382, -38.219],
						[146.922, -38.607],
						[146.318, -39.036],
						[145.49, -38.594],
						[144.877, -38.417],
						[145.032, -37.896],
						[144.486, -38.085],
						[143.61, -38.809],
						[142.745, -38.538],
						[142.178, -38.38],
						[141.607, -38.309],
						[140.639, -38.019],
						[139.992, -37.403],
						[139.807, -36.644],
						[139.574, -36.138],
						[139.083, -35.733],
						[138.121, -35.612],
						[138.449, -35.127],
						[138.208, -34.385],
						[137.719, -35.077],
						[136.829, -35.261],
						[137.352, -34.707],
						[137.504, -34.13],
						[137.89, -33.64],
						[137.81, -32.9],
						[136.997, -33.753],
						[136.372, -34.095],
						[135.989, -34.89],
						[135.208, -34.479],
						[135.239, -33.948],
						[134.613, -33.223],
						[134.086, -32.848],
						[134.274, -32.617],
						[132.991, -32.011],
						[132.288, -31.983],
						[131.326, -31.496],
						[129.536, -31.59],
						[128.241, -31.948],
						[127.103, -32.282],
						[126.149, -32.216]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "斯里兰卡",
					"x": 80.704823,
					"y": 7.581097,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[81.788, 7.523],
						[81.637, 6.482],
						[81.218, 6.197],
						[80.348, 5.968],
						[79.872, 6.763],
						[79.695, 8.201],
						[80.148, 9.824],
						[80.839, 9.268],
						[81.304, 8.564],
						[81.788, 7.523]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "中国",
					"x": 106.337289,
					"y": 32.498178,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[109.475, 18.198],
						[108.655, 18.508],
						[108.626, 19.368],
						[109.119, 19.821],
						[110.212, 20.101],
						[110.787, 20.078],
						[111.01, 19.696],
						[110.571, 19.256],
						[110.339, 18.678],
						[109.475, 18.198]
					]], [[
						[80.26, 42.35],
						[80.18, 42.92],
						[80.866, 43.18],
						[79.966, 44.918],
						[81.947, 45.317],
						[82.459, 45.54],
						[83.18, 47.33],
						[85.164, 47.001],
						[85.72, 47.453],
						[85.768, 48.456],
						[86.599, 48.549],
						[87.36, 49.215],
						[87.751, 49.297],
						[88.014, 48.599],
						[88.854, 48.069],
						[90.281, 47.694],
						[90.971, 46.888],
						[90.586, 45.72],
						[90.946, 45.286],
						[92.134, 45.115],
						[93.481, 44.975],
						[94.689, 44.352],
						[95.307, 44.241],
						[95.762, 43.319],
						[96.349, 42.726],
						[97.452, 42.749],
						[99.516, 42.525],
						[100.846, 42.664],
						[101.833, 42.515],
						[103.312, 41.907],
						[104.522, 41.908],
						[104.965, 41.597],
						[106.129, 42.134],
						[107.745, 42.482],
						[109.244, 42.519],
						[110.412, 42.871],
						[111.13, 43.407],
						[111.83, 43.743],
						[111.668, 44.073],
						[111.348, 44.457],
						[111.873, 45.102],
						[112.436, 45.012],
						[113.464, 44.809],
						[114.46, 45.34],
						[115.985, 45.727],
						[116.718, 46.388],
						[117.422, 46.673],
						[118.874, 46.805],
						[119.663, 46.693],
						[119.773, 47.048],
						[118.867, 47.747],
						[118.064, 48.067],
						[117.296, 47.698],
						[116.309, 47.853],
						[115.743, 47.727],
						[115.485, 48.135],
						[116.192, 49.135],
						[116.679, 49.889],
						[117.879, 49.511],
						[119.288, 50.143],
						[119.279, 50.583],
						[120.182, 51.644],
						[120.738, 51.964],
						[120.726, 52.516],
						[120.177, 52.754],
						[121.003, 53.251],
						[122.246, 53.432],
						[123.571, 53.459],
						[125.068, 53.161],
						[125.946, 52.793],
						[126.564, 51.784],
						[126.939, 51.354],
						[127.287, 50.74],
						[127.657, 49.76],
						[129.398, 49.441],
						[130.582, 48.73],
						[130.987, 47.79],
						[132.507, 47.789],
						[133.374, 48.183],
						[135.026, 48.478],
						[134.501, 47.578],
						[134.112, 47.212],
						[133.77, 46.117],
						[133.097, 45.144],
						[131.883, 45.321],
						[131.025, 44.968],
						[131.289, 44.112],
						[131.145, 42.93],
						[130.634, 42.903],
						[130.64, 42.395],
						[129.994, 42.985],
						[129.597, 42.425],
						[128.052, 41.994],
						[128.208, 41.467],
						[127.344, 41.503],
						[126.869, 41.817],
						[126.182, 41.107],
						[125.08, 40.57],
						[124.266, 39.928],
						[122.868, 39.638],
						[122.131, 39.17],
						[121.055, 38.897],
						[121.586, 39.361],
						[121.377, 39.75],
						[122.169, 40.422],
						[121.64, 40.946],
						[120.769, 40.593],
						[119.64, 39.898],
						[119.023, 39.252],
						[118.043, 39.204],
						[117.533, 38.738],
						[118.06, 38.061],
						[118.878, 37.897],
						[118.912, 37.448],
						[119.703, 37.156],
						[120.823, 37.87],
						[121.711, 37.481],
						[122.358, 37.454],
						[122.52, 36.931],
						[121.104, 36.651],
						[120.637, 36.111],
						[119.665, 35.61],
						[119.151, 34.91],
						[120.228, 34.36],
						[120.62, 33.377],
						[121.229, 32.46],
						[121.908, 31.692],
						[121.892, 30.949],
						[121.264, 30.676],
						[121.504, 30.143],
						[122.092, 29.833],
						[121.938, 29.018],
						[121.684, 28.226],
						[121.126, 28.136],
						[120.395, 27.053],
						[119.585, 25.741],
						[118.657, 24.547],
						[117.282, 23.625],
						[115.891, 22.783],
						[114.764, 22.668],
						[114.153, 22.224],
						[113.807, 22.548],
						[113.241, 22.051],
						[111.844, 21.55],
						[110.785, 21.397],
						[110.444, 20.341],
						[109.89, 20.282],
						[109.628, 21.008],
						[109.864, 21.395],
						[108.523, 21.715],
						[108.05, 21.552],
						[107.043, 21.812],
						[106.567, 22.218],
						[106.725, 22.794],
						[105.811, 22.977],
						[105.329, 23.352],
						[104.477, 22.819],
						[103.505, 22.704],
						[102.707, 22.709],
						[102.17, 22.465],
						[101.652, 22.318],
						[101.803, 21.174],
						[101.27, 21.202],
						[101.18, 21.437],
						[101.15, 21.85],
						[100.417, 21.559],
						[99.983, 21.743],
						[99.241, 22.118],
						[99.532, 22.949],
						[98.899, 23.143],
						[98.66, 24.063],
						[97.605, 23.897],
						[97.725, 25.084],
						[98.672, 25.919],
						[98.712, 26.744],
						[98.683, 27.509],
						[98.246, 27.747],
						[97.912, 28.336],
						[97.327, 28.262],
						[96.249, 28.411],
						[96.587, 28.831],
						[96.118, 29.453],
						[95.405, 29.032],
						[94.566, 29.277],
						[93.413, 28.641],
						[92.503, 27.897],
						[91.697, 27.772],
						[91.259, 28.041],
						[90.731, 28.065],
						[90.016, 28.296],
						[89.476, 28.043],
						[88.814, 27.299],
						[88.73, 28.087],
						[88.12, 27.877],
						[86.955, 27.974],
						[85.823, 28.204],
						[85.012, 28.643],
						[84.235, 28.84],
						[83.899, 29.32],
						[83.337, 29.464],
						[82.328, 30.115],
						[81.526, 30.423],
						[81.111, 30.183],
						[79.721, 30.883],
						[78.739, 31.516],
						[78.458, 32.618],
						[79.176, 32.484],
						[79.209, 32.994],
						[78.811, 33.506],
						[78.912, 34.322],
						[77.837, 35.494],
						[76.193, 35.898],
						[75.897, 36.667],
						[75.158, 37.133],
						[74.98, 37.42],
						[74.83, 37.99],
						[74.865, 38.379],
						[74.258, 38.607],
						[73.929, 38.506],
						[73.675, 39.431],
						[73.96, 39.66],
						[73.822, 39.894],
						[74.777, 40.366],
						[75.468, 40.562],
						[76.526, 40.428],
						[76.904, 41.066],
						[78.187, 41.185],
						[78.544, 41.582],
						[80.119, 42.124],
						[80.26, 42.35]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "中华民国",
					"x": 120.868204,
					"y": 23.652408,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[121.778, 24.394],
						[121.176, 22.791],
						[120.747, 21.971],
						[120.22, 22.815],
						[120.106, 23.556],
						[120.695, 24.538],
						[121.495, 25.295],
						[121.951, 24.998],
						[121.778, 24.394]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "意大利",
					"x": 11.076907,
					"y": 44.732482,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[10.443, 46.894],
							[11.049, 46.751],
							[11.165, 46.942],
							[12.153, 47.115],
							[12.376, 46.768],
							[13.806, 46.509],
							[13.698, 46.017],
							[13.938, 45.591],
							[13.142, 45.737],
							[12.329, 45.382],
							[12.384, 44.885],
							[12.261, 44.6],
							[12.589, 44.091],
							[13.527, 43.588],
							[14.03, 42.761],
							[15.143, 41.955],
							[15.926, 41.961],
							[16.17, 41.74],
							[15.889, 41.541],
							[16.785, 41.18],
							[17.519, 40.877],
							[18.377, 40.356],
							[18.48, 40.169],
							[18.293, 39.811],
							[17.738, 40.278],
							[16.87, 40.442],
							[16.449, 39.795],
							[17.171, 39.425],
							[17.053, 38.903],
							[16.635, 38.844],
							[16.101, 37.986],
							[15.684, 37.909],
							[15.688, 38.215],
							[15.892, 38.751],
							[16.109, 38.965],
							[15.719, 39.544],
							[15.414, 40.048],
							[14.998, 40.173],
							[14.703, 40.605],
							[14.061, 40.786],
							[13.628, 41.188],
							[12.888, 41.253],
							[12.107, 41.705],
							[11.192, 42.355],
							[10.512, 42.931],
							[10.2, 43.92],
							[9.702, 44.036],
							[8.889, 44.366],
							[8.429, 44.231],
							[7.851, 43.767],
							[7.435, 43.694],
							[7.55, 44.128],
							[7.008, 44.255],
							[6.75, 45.029],
							[7.097, 45.333],
							[6.802, 45.709],
							[6.844, 45.991],
							[7.274, 45.777],
							[7.756, 45.824],
							[8.317, 46.164],
							[8.49, 46.005],
							[8.966, 46.037],
							[9.183, 46.44],
							[9.923, 46.315],
							[10.363, 46.484],
							[10.443, 46.894]
						]],
						[[
							[14.761, 38.144],
							[15.52, 38.231],
							[15.16, 37.444],
							[15.31, 37.134],
							[15.1, 36.62],
							[14.335, 36.997],
							[13.827, 37.105],
							[12.431, 37.613],
							[12.571, 38.126],
							[13.741, 38.035],
							[14.761, 38.144]
						]],
						[[
							[8.71, 40.9],
							[9.21, 41.21],
							[9.81, 40.5],
							[9.67, 39.177],
							[9.215, 39.24],
							[8.807, 38.907],
							[8.428, 39.172],
							[8.388, 40.378],
							[8.16, 40.95],
							[8.71, 40.9]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "丹麦",
					"x": 9.018163,
					"y": 55.966965,
					"rank": 4
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[9.922, 54.983],
						[9.282, 54.831],
						[8.526, 54.963],
						[8.12, 55.518],
						[8.09, 56.54],
						[8.257, 56.81],
						[8.543, 57.11],
						[9.424, 57.172],
						[9.776, 57.448],
						[10.58, 57.73],
						[10.546, 57.216],
						[10.25, 56.89],
						[10.37, 56.61],
						[10.912, 56.459],
						[10.668, 56.081],
						[10.37, 56.19],
						[9.65, 55.47],
						[9.922, 54.983]
					]], [[
						[12.371, 56.111],
						[12.69, 55.61],
						[12.09, 54.8],
						[11.044, 55.365],
						[10.904, 55.78],
						[12.371, 56.111]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "英国",
					"x": -2.116346,
					"y": 54.402739,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[-6.198, 53.868],
						[-6.954, 54.074],
						[-7.572, 54.06],
						[-7.366, 54.596],
						[-7.572, 55.132],
						[-6.734, 55.173],
						[-5.662, 54.555],
						[-6.198, 53.868]
					]], [[
						[-3.094, 53.405],
						[-3.092, 53.404],
						[-2.945, 53.985],
						[-3.615, 54.601],
						[-3.63, 54.615],
						[-4.844, 54.791],
						[-5.083, 55.062],
						[-4.719, 55.508],
						[-5.048, 55.784],
						[-5.586, 55.311],
						[-5.645, 56.275],
						[-6.15, 56.785],
						[-5.787, 57.819],
						[-5.01, 58.63],
						[-4.211, 58.551],
						[-3.005, 58.635],
						[-4.074, 57.553],
						[-3.055, 57.69],
						[-1.959, 57.685],
						[-2.22, 56.87],
						[-3.119, 55.974],
						[-2.085, 55.91],
						[-2.006, 55.805],
						[-1.115, 54.625],
						[-.43, 54.464],
						[.185, 53.325],
						[.47, 52.93],
						[1.682, 52.74],
						[1.56, 52.1],
						[1.051, 51.807],
						[1.45, 51.289],
						[.55, 50.766],
						[-.788, 50.775],
						[-2.49, 50.5],
						[-2.956, 50.697],
						[-3.617, 50.228],
						[-4.543, 50.342],
						[-5.245, 49.96],
						[-5.777, 50.16],
						[-4.31, 51.21],
						[-3.415, 51.426],
						[-3.423, 51.427],
						[-4.984, 51.593],
						[-5.267, 51.991],
						[-4.222, 52.301],
						[-4.77, 52.84],
						[-4.58, 53.495],
						[-3.094, 53.405]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "冰岛",
					"x": -18.673711,
					"y": 64.779286,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-14.509, 66.456],
						[-14.74, 65.809],
						[-13.61, 65.127],
						[-14.91, 64.364],
						[-17.794, 63.679],
						[-18.656, 63.496],
						[-19.973, 63.644],
						[-22.763, 63.96],
						[-21.778, 64.402],
						[-23.955, 64.891],
						[-22.184, 65.085],
						[-22.227, 65.379],
						[-24.326, 65.611],
						[-23.651, 66.263],
						[-22.135, 66.41],
						[-20.576, 65.732],
						[-19.057, 66.277],
						[-17.799, 65.994],
						[-16.168, 66.527],
						[-14.509, 66.456]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "阿塞拜疆",
					"x": 47.210994,
					"y": 40.402387,
					"rank": 5
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[46.405, 41.861],
						[46.686, 41.827],
						[47.373, 41.22],
						[47.816, 41.151],
						[47.987, 41.406],
						[48.584, 41.809],
						[49.11, 41.282],
						[49.619, 40.573],
						[50.085, 40.526],
						[50.393, 40.257],
						[49.569, 40.176],
						[49.395, 39.399],
						[49.223, 39.049],
						[48.857, 38.815],
						[48.883, 38.32],
						[48.634, 38.27],
						[48.011, 38.794],
						[48.356, 39.289],
						[48.06, 39.582],
						[47.685, 39.508],
						[46.506, 38.771],
						[46.483, 39.464],
						[46.035, 39.628],
						[45.61, 39.9],
						[45.892, 40.218],
						[45.359, 40.562],
						[45.56, 40.812],
						[45.179, 40.985],
						[44.972, 41.248],
						[45.217, 41.411],
						[45.963, 41.124],
						[46.502, 41.064],
						[46.638, 41.182],
						[46.145, 41.723],
						[46.405, 41.861]
					]], [[
						[46.144, 38.741],
						[45.458, 38.874],
						[44.953, 39.336],
						[44.794, 39.713],
						[45.002, 39.74],
						[45.298, 39.472],
						[45.74, 39.474],
						[45.735, 39.32],
						[46.144, 38.741]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "格鲁吉亚",
					"x": 43.735724,
					"y": 41.870087,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[39.955, 43.435],
						[40.077, 43.553],
						[40.922, 43.382],
						[42.394, 43.22],
						[43.756, 42.741],
						[43.931, 42.555],
						[44.538, 42.712],
						[45.47, 42.503],
						[45.776, 42.092],
						[46.405, 41.861],
						[46.145, 41.723],
						[46.638, 41.182],
						[46.502, 41.064],
						[45.963, 41.124],
						[45.217, 41.411],
						[44.972, 41.248],
						[43.583, 41.092],
						[42.62, 41.583],
						[41.554, 41.536],
						[41.703, 41.963],
						[41.453, 42.645],
						[40.875, 43.014],
						[40.321, 43.129],
						[39.955, 43.435]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "菲律宾",
					"x": 122.465,
					"y": 11.198,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[120.834, 12.704],
							[120.323, 13.466],
							[121.18, 13.43],
							[121.527, 13.07],
							[121.262, 12.206],
							[120.834, 12.704]
						]],
						[[
							[122.586, 9.981],
							[122.837, 10.261],
							[122.947, 10.882],
							[123.499, 10.941],
							[123.338, 10.267],
							[124.078, 11.233],
							[123.982, 10.279],
							[123.623, 9.95],
							[123.31, 9.318],
							[122.996, 9.022],
							[122.38, 9.713],
							[122.586, 9.981]
						]],
						[[
							[126.377, 8.415],
							[126.479, 7.75],
							[126.537, 7.189],
							[126.197, 6.274],
							[125.831, 7.294],
							[125.364, 6.786],
							[125.683, 6.05],
							[125.397, 5.581],
							[124.22, 6.161],
							[123.939, 6.885],
							[124.244, 7.361],
							[123.61, 7.834],
							[123.296, 7.419],
							[122.826, 7.457],
							[122.085, 6.899],
							[121.92, 7.192],
							[122.312, 8.035],
							[122.942, 8.316],
							[123.488, 8.693],
							[123.841, 8.24],
							[124.601, 8.514],
							[124.765, 8.96],
							[125.471, 8.987],
							[125.412, 9.76],
							[126.223, 9.286],
							[126.307, 8.782],
							[126.377, 8.415]
						]],
						[[
							[118.505, 9.316],
							[117.174, 8.367],
							[117.664, 9.067],
							[118.387, 9.684],
							[118.987, 10.376],
							[119.511, 11.37],
							[119.69, 10.554],
							[119.029, 10.004],
							[118.505, 9.316]
						]],
						[[
							[122.337, 18.225],
							[122.174, 17.81],
							[122.516, 17.094],
							[122.252, 16.262],
							[121.663, 15.931],
							[121.505, 15.125],
							[121.729, 14.328],
							[122.259, 14.218],
							[122.701, 14.337],
							[123.95, 13.782],
							[123.855, 13.238],
							[124.181, 12.998],
							[124.077, 12.537],
							[123.298, 13.028],
							[122.929, 13.553],
							[122.671, 13.186],
							[122.035, 13.784],
							[121.126, 13.637],
							[120.629, 13.858],
							[120.679, 14.271],
							[120.992, 14.525],
							[120.693, 14.757],
							[120.564, 14.396],
							[120.07, 14.971],
							[119.921, 15.406],
							[119.884, 16.364],
							[120.286, 16.035],
							[120.39, 17.599],
							[120.716, 18.505],
							[121.321, 18.504],
							[121.938, 18.219],
							[122.246, 18.479],
							[122.337, 18.225]
						]],
						[[
							[122.038, 11.416],
							[121.884, 11.892],
							[122.484, 11.582],
							[123.12, 11.584],
							[123.101, 11.166],
							[122.638, 10.741],
							[122.003, 10.441],
							[121.967, 10.906],
							[122.038, 11.416]
						]],
						[[
							[125.503, 12.163],
							[125.783, 11.046],
							[125.012, 11.311],
							[125.033, 10.976],
							[125.277, 10.359],
							[124.802, 10.135],
							[124.76, 10.838],
							[124.459, 10.89],
							[124.303, 11.495],
							[124.891, 11.416],
							[124.878, 11.794],
							[124.267, 12.558],
							[125.227, 12.536],
							[125.503, 12.163]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "马来西亚",
					"x": 113.83708,
					"y": 2.528667,
					"rank": 3
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [[[
						[100.086, 6.464],
						[100.26, 6.643],
						[101.076, 6.205],
						[101.154, 5.691],
						[101.814, 5.811],
						[102.141, 6.222],
						[102.371, 6.128],
						[102.962, 5.524],
						[103.381, 4.855],
						[103.439, 4.182],
						[103.332, 3.727],
						[103.429, 3.383],
						[103.502, 2.791],
						[103.855, 2.515],
						[104.248, 1.631],
						[104.229, 1.293],
						[103.52, 1.226],
						[102.574, 1.967],
						[101.391, 2.761],
						[101.274, 3.27],
						[100.695, 3.939],
						[100.557, 4.767],
						[100.197, 5.312],
						[100.306, 6.041],
						[100.086, 6.464]
					]], [[
						[117.882, 4.138],
						[117.015, 4.306],
						[115.866, 4.307],
						[115.519, 3.169],
						[115.134, 2.821],
						[114.621, 1.431],
						[113.806, 1.218],
						[112.86, 1.498],
						[112.38, 1.41],
						[111.798, .904],
						[111.159, .976],
						[110.514, .773],
						[109.83, 1.338],
						[109.663, 2.006],
						[110.396, 1.664],
						[111.169, 1.851],
						[111.37, 2.697],
						[111.797, 2.886],
						[112.996, 3.102],
						[113.713, 3.894],
						[114.204, 4.526],
						[114.66, 4.008],
						[114.87, 4.348],
						[115.347, 4.317],
						[115.406, 4.955],
						[115.451, 5.448],
						[116.221, 6.143],
						[116.725, 6.925],
						[117.13, 6.928],
						[117.643, 6.422],
						[117.689, 5.987],
						[118.348, 5.709],
						[119.182, 5.408],
						[119.111, 5.016],
						[118.44, 4.967],
						[118.618, 4.478],
						[117.882, 4.138]
					]]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "文莱",
					"x": 114.551943,
					"y": 4.448298,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[115.451, 5.448],
						[115.406, 4.955],
						[115.347, 4.317],
						[114.87, 4.348],
						[114.66, 4.008],
						[114.204, 4.526],
						[114.6, 4.9],
						[115.451, 5.448]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "斯洛文尼亚",
					"x": 14.915312,
					"y": 46.06076,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[13.806, 46.509],
						[14.632, 46.432],
						[15.137, 46.659],
						[16.012, 46.684],
						[16.202, 46.852],
						[16.371, 46.841],
						[16.565, 46.504],
						[15.769, 46.238],
						[15.672, 45.834],
						[15.324, 45.732],
						[15.328, 45.452],
						[14.935, 45.472],
						[14.595, 45.635],
						[14.412, 45.466],
						[13.715, 45.5],
						[13.938, 45.591],
						[13.698, 46.017],
						[13.806, 46.509]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "芬兰",
					"x": 27.276449,
					"y": 63.252361,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[28.592, 69.065],
						[28.446, 68.365],
						[29.977, 67.698],
						[29.055, 66.944],
						[30.218, 65.806],
						[29.544, 64.949],
						[30.445, 64.204],
						[30.036, 63.553],
						[31.516, 62.868],
						[31.14, 62.358],
						[30.211, 61.78],
						[28.07, 60.504],
						[28.07, 60.504],
						[28.07, 60.504],
						[26.255, 60.424],
						[24.497, 60.057],
						[22.87, 59.846],
						[22.291, 60.392],
						[21.322, 60.72],
						[21.545, 61.705],
						[21.059, 62.607],
						[21.536, 63.19],
						[22.443, 63.818],
						[24.731, 64.902],
						[25.398, 65.111],
						[25.294, 65.534],
						[23.903, 66.007],
						[23.566, 66.396],
						[23.539, 67.936],
						[21.979, 68.617],
						[20.646, 69.106],
						[21.245, 69.37],
						[22.356, 68.842],
						[23.662, 68.891],
						[24.736, 68.65],
						[25.689, 69.092],
						[26.18, 69.825],
						[27.732, 70.164],
						[29.016, 69.766],
						[28.592, 69.065]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "斯洛伐克",
					"x": 19.049868,
					"y": 48.734044,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[22.558, 49.086],
						[22.281, 48.825],
						[22.086, 48.422],
						[21.872, 48.32],
						[20.801, 48.624],
						[20.474, 48.563],
						[20.239, 48.328],
						[19.769, 48.203],
						[19.661, 48.267],
						[19.174, 48.111],
						[18.777, 48.082],
						[18.697, 47.881],
						[17.857, 47.758],
						[17.488, 47.867],
						[16.98, 48.123],
						[16.88, 48.47],
						[16.96, 48.597],
						[17.102, 48.817],
						[17.545, 48.8],
						[17.886, 48.903],
						[17.914, 48.996],
						[18.105, 49.044],
						[18.17, 49.272],
						[18.4, 49.315],
						[18.555, 49.495],
						[18.853, 49.496],
						[18.91, 49.436],
						[19.321, 49.572],
						[19.825, 49.217],
						[20.416, 49.431],
						[20.888, 49.329],
						[21.608, 49.47],
						[22.558, 49.086]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "捷克",
					"x": 15.377555,
					"y": 49.882364,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[15.017, 51.107],
						[15.491, 50.785],
						[16.239, 50.698],
						[16.176, 50.423],
						[16.719, 50.216],
						[16.869, 50.474],
						[17.555, 50.362],
						[17.649, 50.049],
						[18.393, 49.989],
						[18.853, 49.496],
						[18.555, 49.495],
						[18.4, 49.315],
						[18.17, 49.272],
						[18.105, 49.044],
						[17.914, 48.996],
						[17.886, 48.903],
						[17.545, 48.8],
						[17.102, 48.817],
						[16.96, 48.597],
						[16.499, 48.786],
						[16.03, 48.734],
						[15.253, 49.039],
						[14.901, 48.964],
						[14.339, 48.555],
						[13.596, 48.877],
						[13.031, 49.307],
						[12.521, 49.547],
						[12.415, 49.969],
						[12.24, 50.266],
						[12.967, 50.484],
						[13.338, 50.733],
						[14.056, 50.927],
						[14.307, 51.117],
						[14.571, 51.002],
						[15.017, 51.107]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "厄立特里亚",
					"x": 38.285566,
					"y": 15.787401,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[36.43, 14.422],
						[36.323, 14.822],
						[36.754, 16.292],
						[36.853, 16.957],
						[37.167, 17.263],
						[37.904, 17.428],
						[38.41, 17.998],
						[38.991, 16.841],
						[39.266, 15.923],
						[39.814, 15.436],
						[41.179, 14.491],
						[41.735, 13.921],
						[42.277, 13.344],
						[42.59, 13],
						[43.081, 12.7],
						[42.78, 12.455],
						[42.352, 12.542],
						[42.01, 12.866],
						[41.599, 13.452],
						[41.155, 13.773],
						[40.897, 14.119],
						[40.026, 14.52],
						[39.341, 14.532],
						[39.099, 14.741],
						[38.513, 14.505],
						[37.906, 14.959],
						[37.594, 14.213],
						[36.43, 14.422]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "日本",
					"x": 138.44217,
					"y": 36.142538,
					"rank": 2
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[141.885, 39.181],
							[140.959, 38.174],
							[140.976, 37.142],
							[140.6, 36.344],
							[140.774, 35.843],
							[140.253, 35.138],
							[138.976, 34.668],
							[137.218, 34.606],
							[135.793, 33.465],
							[135.121, 33.849],
							[135.079, 34.597],
							[133.34, 34.376],
							[132.157, 33.905],
							[130.986, 33.886],
							[132, 33.15],
							[131.333, 31.45],
							[130.686, 31.03],
							[130.202, 31.418],
							[130.448, 32.319],
							[129.815, 32.61],
							[129.408, 33.296],
							[130.354, 33.604],
							[130.878, 34.233],
							[131.884, 34.75],
							[132.618, 35.433],
							[134.608, 35.732],
							[135.678, 35.527],
							[136.724, 37.305],
							[137.391, 36.827],
							[138.858, 37.827],
							[139.426, 38.216],
							[140.055, 39.439],
							[139.883, 40.563],
							[140.306, 41.195],
							[141.369, 41.379],
							[141.914, 39.992],
							[141.885, 39.181]
						]],
						[[
							[144.613, 43.961],
							[145.321, 44.385],
							[145.543, 43.262],
							[144.06, 42.988],
							[143.184, 41.995],
							[141.611, 42.679],
							[141.067, 41.585],
							[139.955, 41.57],
							[139.818, 42.564],
							[140.312, 43.333],
							[141.381, 43.389],
							[141.672, 44.772],
							[141.968, 45.551],
							[143.143, 44.51],
							[143.91, 44.174],
							[144.613, 43.961]
						]],
						[[
							[132.371, 33.464],
							[132.924, 34.06],
							[133.493, 33.945],
							[133.904, 34.365],
							[134.638, 34.149],
							[134.766, 33.806],
							[134.203, 33.201],
							[133.793, 33.522],
							[133.28, 33.29],
							[133.015, 32.705],
							[132.363, 32.989],
							[132.371, 33.464]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "巴拉圭",
					"x": -60.146394,
					"y": -21.674509,
					"rank": 4
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-58.166, -20.177],
						[-57.871, -20.733],
						[-57.937, -22.09],
						[-56.882, -22.282],
						[-56.473, -22.086],
						[-55.798, -22.357],
						[-55.611, -22.656],
						[-55.518, -23.572],
						[-55.401, -23.957],
						[-55.028, -24.001],
						[-54.653, -23.84],
						[-54.293, -24.021],
						[-54.293, -24.571],
						[-54.429, -25.162],
						[-54.625, -25.739],
						[-54.789, -26.622],
						[-55.696, -27.388],
						[-56.487, -27.548],
						[-57.61, -27.396],
						[-58.618, -27.124],
						[-57.634, -25.604],
						[-57.777, -25.162],
						[-58.807, -24.771],
						[-60.029, -24.033],
						[-60.847, -23.881],
						[-62.685, -22.249],
						[-62.291, -21.052],
						[-62.266, -20.514],
						[-61.786, -19.634],
						[-60.044, -19.343],
						[-59.115, -19.357],
						[-58.183, -19.868],
						[-58.166, -20.177]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "也门",
					"x": 45.874383,
					"y": 15.328226,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[52, 19],
						[52.782, 17.35],
						[53.109, 16.651],
						[52.385, 16.382],
						[52.192, 15.938],
						[52.168, 15.597],
						[51.173, 15.175],
						[49.575, 14.709],
						[48.679, 14.003],
						[48.239, 13.948],
						[47.939, 14.007],
						[47.354, 13.592],
						[46.717, 13.4],
						[45.878, 13.348],
						[45.625, 13.291],
						[45.406, 13.027],
						[45.144, 12.954],
						[44.99, 12.7],
						[44.495, 12.722],
						[44.175, 12.586],
						[43.483, 12.637],
						[43.223, 13.221],
						[43.251, 13.768],
						[43.088, 14.063],
						[42.892, 14.802],
						[42.605, 15.213],
						[42.805, 15.262],
						[42.702, 15.719],
						[42.824, 15.912],
						[42.779, 16.348],
						[43.218, 16.667],
						[43.116, 17.088],
						[43.381, 17.58],
						[43.792, 17.32],
						[44.063, 17.41],
						[45.217, 17.433],
						[45.4, 17.333],
						[46.367, 17.233],
						[46.75, 17.283],
						[47, 16.95],
						[47.467, 17.117],
						[48.183, 18.167],
						[49.117, 18.617],
						[52, 19]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "沙特阿拉伯",
					"x": 44.6996,
					"y": 23.806908,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[34.956, 29.357],
						[36.069, 29.197],
						[36.501, 29.505],
						[36.741, 29.865],
						[37.504, 30.004],
						[37.668, 30.339],
						[37.999, 30.509],
						[37.002, 31.508],
						[39.005, 32.01],
						[39.195, 32.161],
						[40.4, 31.89],
						[41.89, 31.19],
						[44.709, 29.179],
						[46.569, 29.099],
						[47.46, 29.003],
						[47.709, 28.526],
						[48.416, 28.552],
						[48.808, 27.69],
						[49.3, 27.461],
						[49.471, 27.11],
						[50.152, 26.69],
						[50.213, 26.277],
						[50.113, 25.944],
						[50.24, 25.608],
						[50.527, 25.328],
						[50.661, 25],
						[50.81, 24.755],
						[51.112, 24.556],
						[51.39, 24.627],
						[51.58, 24.245],
						[51.618, 24.014],
						[52.001, 23.001],
						[55.007, 22.497],
						[55.208, 22.708],
						[55.667, 22],
						[55, 20],
						[52, 19],
						[49.117, 18.617],
						[48.183, 18.167],
						[47.467, 17.117],
						[47, 16.95],
						[46.75, 17.283],
						[46.367, 17.233],
						[45.4, 17.333],
						[45.217, 17.433],
						[44.063, 17.41],
						[43.792, 17.32],
						[43.381, 17.58],
						[43.116, 17.088],
						[43.218, 16.667],
						[42.779, 16.348],
						[42.65, 16.775],
						[42.348, 17.076],
						[42.271, 17.475],
						[41.754, 17.833],
						[41.221, 18.672],
						[40.939, 19.486],
						[40.248, 20.175],
						[39.802, 20.339],
						[39.139, 21.292],
						[39.024, 21.987],
						[39.066, 22.58],
						[38.493, 23.688],
						[38.024, 24.079],
						[37.484, 24.285],
						[37.155, 24.858],
						[37.209, 25.085],
						[36.932, 25.603],
						[36.64, 25.826],
						[36.249, 26.57],
						[35.64, 27.377],
						[35.13, 28.063],
						[34.632, 28.059],
						[34.788, 28.607],
						[34.832, 28.957],
						[34.956, 29.357]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "南极洲",
					"x": 35.885455,
					"y": -79.843222,
					"rank": 4
				},
				"geometry": {
					"type": "MultiPolygon",
					"coordinates": [
						[[
							[-48.661, -78.047],
							[-48.151, -78.047],
							[-46.663, -77.831],
							[-45.155, -78.047],
							[-43.921, -78.478],
							[-43.49, -79.086],
							[-43.372, -79.517],
							[-43.333, -80.026],
							[-44.881, -80.34],
							[-46.506, -80.594],
							[-48.386, -80.829],
							[-50.482, -81.025],
							[-52.852, -80.967],
							[-54.164, -80.634],
							[-53.988, -80.222],
							[-51.853, -79.948],
							[-50.991, -79.615],
							[-50.365, -79.183],
							[-49.914, -78.811],
							[-49.307, -78.459],
							[-48.661, -78.047],
							[-48.661, -78.047]
						]],
						[[
							[-66.29, -80.256],
							[-64.038, -80.295],
							[-61.883, -80.393],
							[-61.139, -79.981],
							[-60.61, -79.629],
							[-59.572, -80.04],
							[-59.866, -80.55],
							[-60.16, -81],
							[-62.255, -80.863],
							[-64.488, -80.922],
							[-65.742, -80.589],
							[-65.742, -80.55],
							[-66.29, -80.256]
						]],
						[[
							[-73.916, -71.269],
							[-73.916, -71.269],
							[-73.23, -71.152],
							[-72.075, -71.191],
							[-71.781, -70.681],
							[-71.722, -70.309],
							[-71.742, -69.506],
							[-71.174, -69.035],
							[-70.253, -68.879],
							[-69.724, -69.251],
							[-69.489, -69.623],
							[-69.059, -70.074],
							[-68.726, -70.505],
							[-68.451, -70.956],
							[-68.334, -71.406],
							[-68.51, -71.798],
							[-68.784, -72.171],
							[-69.959, -72.308],
							[-71.076, -72.504],
							[-72.388, -72.484],
							[-71.898, -72.092],
							[-73.074, -72.229],
							[-74.19, -72.367],
							[-74.954, -72.073],
							[-75.013, -71.661],
							[-73.916, -71.269]
						]],
						[[
							[-102.331, -71.894],
							[-102.331, -71.894],
							[-101.704, -71.718],
							[-100.431, -71.855],
							[-98.982, -71.933],
							[-97.885, -72.071],
							[-96.788, -71.953],
							[-96.2, -72.521],
							[-96.984, -72.443],
							[-98.198, -72.482],
							[-99.432, -72.443],
							[-100.783, -72.502],
							[-101.802, -72.306],
							[-102.331, -71.894]
						]],
						[[
							[-122.622, -73.658],
							[-122.622, -73.658],
							[-122.406, -73.325],
							[-121.212, -73.501],
							[-119.919, -73.658],
							[-118.724, -73.481],
							[-119.292, -73.834],
							[-120.232, -74.089],
							[-121.623, -74.01],
							[-122.622, -73.658]
						]],
						[[
							[-127.283, -73.462],
							[-127.283, -73.462],
							[-126.558, -73.246],
							[-125.56, -73.481],
							[-124.032, -73.873],
							[-124.619, -73.834],
							[-125.912, -73.736],
							[-127.283, -73.462]
						]],
						[[
							[-163.713, -78.596],
							[-163.713, -78.596],
							[-163.106, -78.223],
							[-161.245, -78.38],
							[-160.246, -78.694],
							[-159.482, -79.046],
							[-159.208, -79.497],
							[-161.128, -79.634],
							[-162.44, -79.281],
							[-163.027, -78.929],
							[-163.067, -78.87],
							[-163.713, -78.596]
						]],
						[[
							[180, -84.713],
							[180, -90],
							[-180, -90],
							[-180, -84.713],
							[-179.942, -84.721],
							[-179.059, -84.139],
							[-177.257, -84.453],
							[-177.141, -84.418],
							[-176.085, -84.099],
							[-175.947, -84.11],
							[-175.83, -84.118],
							[-174.383, -84.534],
							[-173.117, -84.118],
							[-172.889, -84.061],
							[-169.951, -83.885],
							[-169, -84.118],
							[-168.53, -84.237],
							[-167.022, -84.57],
							[-164.182, -84.825],
							[-161.93, -85.139],
							[-158.071, -85.374],
							[-155.192, -85.1],
							[-150.942, -85.296],
							[-148.533, -85.609],
							[-145.889, -85.315],
							[-143.108, -85.041],
							[-142.892, -84.57],
							[-146.829, -84.531],
							[-150.061, -84.296],
							[-150.903, -83.904],
							[-153.586, -83.689],
							[-153.41, -83.238],
							[-153.038, -82.827],
							[-152.666, -82.454],
							[-152.862, -82.043],
							[-154.526, -81.768],
							[-155.29, -81.416],
							[-156.837, -81.102],
							[-154.409, -81.161],
							[-152.098, -81.004],
							[-150.648, -81.337],
							[-148.866, -81.043],
							[-147.221, -80.671],
							[-146.418, -80.338],
							[-146.77, -79.926],
							[-148.063, -79.652],
							[-149.532, -79.358],
							[-151.588, -79.299],
							[-153.39, -79.162],
							[-155.329, -79.064],
							[-155.976, -78.692],
							[-157.268, -78.378],
							[-158.052, -78.026],
							[-158.365, -76.889],
							[-157.875, -76.987],
							[-156.975, -77.301],
							[-155.329, -77.203],
							[-153.743, -77.066],
							[-152.92, -77.497],
							[-151.334, -77.399],
							[-150.002, -77.183],
							[-148.748, -76.909],
							[-147.612, -76.576],
							[-146.104, -76.478],
							[-146.144, -76.105],
							[-146.496, -75.733],
							[-146.202, -75.38],
							[-144.91, -75.204],
							[-144.322, -75.537],
							[-142.794, -75.341],
							[-141.639, -75.086],
							[-140.209, -75.067],
							[-138.858, -74.969],
							[-137.506, -74.734],
							[-136.429, -74.518],
							[-135.215, -74.303],
							[-134.431, -74.361],
							[-133.746, -74.44],
							[-132.257, -74.303],
							[-130.925, -74.479],
							[-129.554, -74.459],
							[-128.242, -74.322],
							[-126.891, -74.42],
							[-125.402, -74.518],
							[-124.011, -74.479],
							[-122.562, -74.499],
							[-121.074, -74.518],
							[-119.703, -74.479],
							[-118.684, -74.185],
							[-117.47, -74.028],
							[-116.216, -74.244],
							[-115.022, -74.068],
							[-113.944, -73.715],
							[-113.298, -74.028],
							[-112.945, -74.381],
							[-112.299, -74.714],
							[-111.261, -74.42],
							[-110.066, -74.793],
							[-108.715, -74.91],
							[-107.559, -75.184],
							[-106.149, -75.126],
							[-104.876, -74.949],
							[-103.368, -74.988],
							[-102.017, -75.126],
							[-100.646, -75.302],
							[-100.117, -74.871],
							[-100.763, -74.538],
							[-101.253, -74.185],
							[-102.545, -74.107],
							[-103.113, -73.734],
							[-103.329, -73.362],
							[-103.681, -72.618],
							[-102.917, -72.755],
							[-101.605, -72.813],
							[-100.313, -72.755],
							[-99.137, -72.911],
							[-98.119, -73.205],
							[-97.688, -73.558],
							[-96.337, -73.617],
							[-95.044, -73.48],
							[-93.673, -73.284],
							[-92.439, -73.166],
							[-91.421, -73.401],
							[-90.089, -73.323],
							[-89.227, -72.559],
							[-88.424, -73.009],
							[-87.268, -73.186],
							[-86.015, -73.088],
							[-85.192, -73.48],
							[-83.88, -73.519],
							[-82.666, -73.636],
							[-81.471, -73.852],
							[-80.687, -73.48],
							[-80.296, -73.127],
							[-79.297, -73.519],
							[-77.926, -73.421],
							[-76.907, -73.636],
							[-76.222, -73.97],
							[-74.89, -73.872],
							[-73.852, -73.656],
							[-72.834, -73.401],
							[-71.619, -73.264],
							[-70.209, -73.147],
							[-68.936, -73.009],
							[-67.957, -72.794],
							[-67.369, -72.48],
							[-67.134, -72.049],
							[-67.252, -71.638],
							[-67.565, -71.246],
							[-67.917, -70.854],
							[-68.231, -70.462],
							[-68.485, -70.109],
							[-68.544, -69.717],
							[-68.446, -69.326],
							[-67.976, -68.953],
							[-67.585, -68.542],
							[-67.428, -68.15],
							[-67.624, -67.719],
							[-67.741, -67.327],
							[-67.252, -66.876],
							[-66.703, -66.582],
							[-66.057, -66.21],
							[-65.371, -65.896],
							[-64.568, -65.603],
							[-64.177, -65.171],
							[-63.628, -64.897],
							[-63.001, -64.642],
							[-62.042, -64.584],
							[-61.415, -64.27],
							[-60.71, -64.074],
							[-59.887, -63.957],
							[-59.163, -63.702],
							[-58.595, -63.388],
							[-57.811, -63.271],
							[-57.224, -63.525],
							[-57.596, -63.859],
							[-58.614, -64.152],
							[-59.045, -64.368],
							[-59.789, -64.211],
							[-60.612, -64.309],
							[-61.297, -64.544],
							[-62.022, -64.799],
							[-62.512, -65.093],
							[-62.649, -65.485],
							[-62.59, -65.857],
							[-62.12, -66.19],
							[-62.806, -66.426],
							[-63.746, -66.504],
							[-64.294, -66.837],
							[-64.882, -67.15],
							[-65.508, -67.582],
							[-65.665, -67.954],
							[-65.313, -68.365],
							[-64.784, -68.679],
							[-63.961, -68.914],
							[-63.197, -69.228],
							[-62.786, -69.619],
							[-62.571, -69.992],
							[-62.277, -70.384],
							[-61.807, -70.717],
							[-61.513, -71.089],
							[-61.376, -72.01],
							[-61.082, -72.382],
							[-61.004, -72.774],
							[-60.69, -73.166],
							[-60.827, -73.695],
							[-61.376, -74.107],
							[-61.963, -74.44],
							[-63.295, -74.577],
							[-63.746, -74.93],
							[-64.353, -75.263],
							[-65.861, -75.635],
							[-67.193, -75.792],
							[-68.446, -76.007],
							[-69.798, -76.223],
							[-70.601, -76.634],
							[-72.207, -76.674],
							[-73.97, -76.634],
							[-75.556, -76.713],
							[-77.24, -76.713],
							[-76.927, -77.105],
							[-75.399, -77.281],
							[-74.283, -77.555],
							[-73.656, -77.908],
							[-74.773, -78.222],
							[-76.496, -78.124],
							[-77.926, -78.378],
							[-77.985, -78.79],
							[-78.024, -79.182],
							[-76.849, -79.515],
							[-76.633, -79.887],
							[-75.36, -80.26],
							[-73.245, -80.416],
							[-71.443, -80.691],
							[-70.013, -81.004],
							[-68.192, -81.318],
							[-65.704, -81.474],
							[-63.256, -81.749],
							[-61.552, -82.043],
							[-59.691, -82.376],
							[-58.712, -82.846],
							[-58.222, -83.218],
							[-57.008, -82.866],
							[-55.363, -82.572],
							[-53.62, -82.258],
							[-51.544, -82.004],
							[-49.761, -81.729],
							[-47.274, -81.71],
							[-44.826, -81.847],
							[-42.808, -82.082],
							[-42.162, -81.651],
							[-40.771, -81.357],
							[-38.245, -81.337],
							[-36.267, -81.122],
							[-34.386, -80.906],
							[-32.31, -80.769],
							[-30.097, -80.593],
							[-28.55, -80.338],
							[-29.255, -79.985],
							[-29.686, -79.633],
							[-29.686, -79.26],
							[-31.625, -79.299],
							[-33.681, -79.456],
							[-35.64, -79.456],
							[-35.914, -79.084],
							[-35.777, -78.339],
							[-35.327, -78.124],
							[-33.897, -77.889],
							[-32.212, -77.653],
							[-30.998, -77.36],
							[-29.784, -77.066],
							[-28.883, -76.674],
							[-27.512, -76.497],
							[-26.16, -76.36],
							[-25.475, -76.282],
							[-23.928, -76.243],
							[-22.459, -76.105],
							[-21.225, -75.909],
							[-20.01, -75.674],
							[-18.914, -75.439],
							[-17.523, -75.126],
							[-16.642, -74.793],
							[-15.701, -74.499],
							[-15.408, -74.107],
							[-16.465, -73.872],
							[-16.113, -73.46],
							[-15.447, -73.147],
							[-14.409, -72.951],
							[-13.312, -72.715],
							[-12.294, -72.402],
							[-11.51, -72.01],
							[-11.02, -71.54],
							[-10.296, -71.265],
							[-9.101, -71.324],
							[-8.611, -71.657],
							[-7.417, -71.697],
							[-7.377, -71.324],
							[-6.868, -70.932],
							[-5.791, -71.03],
							[-5.536, -71.403],
							[-4.342, -71.461],
							[-3.049, -71.285],
							[-1.795, -71.167],
							[-.659, -71.226],
							[-.229, -71.638],
							[.868, -71.305],
							[1.887, -71.128],
							[3.023, -70.991],
							[4.139, -70.854],
							[5.158, -70.619],
							[6.274, -70.462],
							[7.136, -70.247],
							[7.743, -69.894],
							[8.487, -70.149],
							[9.525, -70.011],
							[10.25, -70.482],
							[10.818, -70.834],
							[11.954, -70.638],
							[12.404, -70.247],
							[13.423, -69.972],
							[14.735, -70.031],
							[15.127, -70.403],
							[15.949, -70.031],
							[17.027, -69.913],
							[18.202, -69.874],
							[19.259, -69.894],
							[20.376, -70.011],
							[21.453, -70.07],
							[21.923, -70.403],
							[22.569, -70.697],
							[23.666, -70.521],
							[24.841, -70.482],
							[25.977, -70.482],
							[27.094, -70.462],
							[28.093, -70.325],
							[29.15, -70.207],
							[30.032, -69.933],
							[30.972, -69.757],
							[31.99, -69.659],
							[32.754, -69.384],
							[33.302, -68.836],
							[33.87, -68.503],
							[34.908, -68.659],
							[35.3, -69.012],
							[36.162, -69.247],
							[37.2, -69.169],
							[37.905, -69.521],
							[38.649, -69.776],
							[39.668, -69.541],
							[40.02, -69.11],
							[40.921, -68.934],
							[41.959, -68.601],
							[42.939, -68.463],
							[44.114, -68.267],
							[44.897, -68.052],
							[45.72, -67.817],
							[46.503, -67.601],
							[47.443, -67.719],
							[48.344, -67.366],
							[48.991, -67.092],
							[49.931, -67.111],
							[50.753, -66.876],
							[50.949, -66.523],
							[51.792, -66.249],
							[52.614, -66.053],
							[53.613, -65.896],
							[54.534, -65.818],
							[55.415, -65.877],
							[56.355, -65.975],
							[57.158, -66.249],
							[57.256, -66.68],
							[58.137, -67.013],
							[58.745, -67.288],
							[59.939, -67.405],
							[60.605, -67.68],
							[61.428, -67.954],
							[62.387, -68.013],
							[63.19, -67.817],
							[64.052, -67.405],
							[64.992, -67.621],
							[65.972, -67.738],
							[66.912, -67.856],
							[67.891, -67.934],
							[68.89, -67.934],
							[69.713, -68.973],
							[69.673, -69.228],
							[69.556, -69.678],
							[68.596, -69.933],
							[67.813, -70.305],
							[67.95, -70.697],
							[69.066, -70.678],
							[68.929, -71.069],
							[68.42, -71.442],
							[67.95, -71.853],
							[68.714, -72.167],
							[69.869, -72.265],
							[71.025, -72.088],
							[71.573, -71.697],
							[71.906, -71.324],
							[72.455, -71.011],
							[73.081, -70.717],
							[73.336, -70.364],
							[73.865, -69.874],
							[74.492, -69.776],
							[75.628, -69.737],
							[76.626, -69.619],
							[77.645, -69.463],
							[78.135, -69.071],
							[78.428, -68.698],
							[79.114, -68.326],
							[80.093, -68.072],
							[80.935, -67.876],
							[81.484, -67.542],
							[82.052, -67.366],
							[82.776, -67.209],
							[83.775, -67.307],
							[84.676, -67.209],
							[85.656, -67.092],
							[86.752, -67.15],
							[87.477, -66.876],
							[87.986, -66.21],
							[88.358, -66.484],
							[88.828, -66.955],
							[89.671, -67.15],
							[90.63, -67.229],
							[91.59, -67.111],
							[92.609, -67.19],
							[93.549, -67.209],
							[94.175, -67.111],
							[95.018, -67.17],
							[95.781, -67.386],
							[96.682, -67.249],
							[97.76, -67.249],
							[98.68, -67.111],
							[99.718, -67.249],
							[100.384, -66.915],
							[100.893, -66.582],
							[101.579, -66.308],
							[102.832, -65.563],
							[103.479, -65.7],
							[104.243, -65.975],
							[104.908, -66.328],
							[106.182, -66.935],
							[107.161, -66.955],
							[108.081, -66.955],
							[109.159, -66.837],
							[110.236, -66.7],
							[111.058, -66.426],
							[111.744, -66.132],
							[112.86, -66.092],
							[113.605, -65.877],
							[114.388, -66.073],
							[114.897, -66.386],
							[115.602, -66.7],
							[116.699, -66.661],
							[117.385, -66.915],
							[118.579, -67.17],
							[119.833, -67.268],
							[120.871, -67.19],
							[121.654, -66.876],
							[122.32, -66.563],
							[123.221, -66.484],
							[124.122, -66.621],
							[125.16, -66.719],
							[126.1, -66.563],
							[127.001, -66.563],
							[127.883, -66.661],
							[128.803, -66.759],
							[129.704, -66.582],
							[130.781, -66.426],
							[131.8, -66.386],
							[132.936, -66.386],
							[133.856, -66.288],
							[134.757, -66.21],
							[135.032, -65.72],
							[135.071, -65.309],
							[135.697, -65.583],
							[135.874, -66.034],
							[136.207, -66.445],
							[136.618, -66.778],
							[137.46, -66.955],
							[138.596, -66.896],
							[139.908, -66.876],
							[140.809, -66.817],
							[142.122, -66.817],
							[143.062, -66.798],
							[144.374, -66.837],
							[145.49, -66.915],
							[146.196, -67.229],
							[146, -67.601],
							[146.646, -67.895],
							[147.723, -68.13],
							[148.84, -68.385],
							[150.132, -68.561],
							[151.484, -68.718],
							[152.502, -68.875],
							[153.638, -68.895],
							[154.285, -68.561],
							[155.166, -68.836],
							[155.93, -69.149],
							[156.811, -69.384],
							[158.026, -69.482],
							[159.181, -69.6],
							[159.671, -69.992],
							[160.807, -70.227],
							[161.57, -70.58],
							[162.687, -70.736],
							[163.842, -70.717],
							[164.92, -70.776],
							[166.114, -70.756],
							[167.309, -70.834],
							[168.426, -70.971],
							[169.464, -71.207],
							[170.502, -71.403],
							[171.207, -71.697],
							[171.089, -72.088],
							[170.56, -72.441],
							[170.11, -72.892],
							[169.757, -73.245],
							[169.287, -73.656],
							[167.975, -73.813],
							[167.387, -74.165],
							[166.095, -74.381],
							[165.644, -74.773],
							[164.959, -75.145],
							[164.234, -75.459],
							[163.823, -75.87],
							[163.568, -76.243],
							[163.47, -76.693],
							[163.49, -77.066],
							[164.058, -77.457],
							[164.273, -77.83],
							[164.743, -78.183],
							[166.604, -78.32],
							[166.996, -78.751],
							[165.194, -78.907],
							[163.666, -79.123],
							[161.766, -79.162],
							[160.924, -79.73],
							[160.748, -80.201],
							[160.317, -80.573],
							[159.788, -80.945],
							[161.12, -81.279],
							[161.629, -81.69],
							[162.491, -82.062],
							[163.705, -82.395],
							[165.096, -82.709],
							[166.604, -83.022],
							[168.896, -83.336],
							[169.405, -83.826],
							[172.284, -84.041],
							[172.477, -84.118],
							[173.224, -84.414],
							[175.986, -84.159],
							[178.277, -84.473],
							[180, -84.713]
						]]
					]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "北塞浦路斯土耳其共和国",
					"x": 33.692434,
					"y": 35.216071,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[32.732, 35.14],
						[32.802, 35.146],
						[32.947, 35.387],
						[33.667, 35.373],
						[34.576, 35.672],
						[33.901, 35.246],
						[33.974, 35.059],
						[33.866, 35.094],
						[33.675, 35.018],
						[33.526, 35.039],
						[33.476, 35],
						[33.456, 35.101],
						[33.384, 35.163],
						[33.191, 35.173],
						[32.92, 35.088],
						[32.732, 35.14]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "塞浦路斯",
					"x": 33.084182,
					"y": 34.913329,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[32.732, 35.14],
						[32.92, 35.088],
						[33.191, 35.173],
						[33.384, 35.163],
						[33.456, 35.101],
						[33.476, 35],
						[33.526, 35.039],
						[33.675, 35.018],
						[33.866, 35.094],
						[33.974, 35.059],
						[34.005, 34.978],
						[32.98, 34.572],
						[32.49, 34.702],
						[32.257, 35.103],
						[32.732, 35.14]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "摩洛哥",
					"x": -7.187296,
					"y": 31.650723,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-2.17, 35.168],
						[-1.793, 34.528],
						[-1.733, 33.92],
						[-1.388, 32.864],
						[-1.125, 32.652],
						[-1.308, 32.263],
						[-2.617, 32.094],
						[-3.069, 31.724],
						[-3.647, 31.637],
						[-3.69, 30.897],
						[-4.86, 30.501],
						[-5.242, 30],
						[-6.061, 29.732],
						[-7.059, 29.579],
						[-8.674, 28.841],
						[-8.666, 27.656],
						[-8.818, 27.656],
						[-8.795, 27.121],
						[-9.413, 27.088],
						[-9.735, 26.861],
						[-10.189, 26.861],
						[-10.551, 26.991],
						[-11.393, 26.883],
						[-11.718, 26.104],
						[-12.031, 26.031],
						[-12.501, 24.77],
						[-13.891, 23.691],
						[-14.221, 22.31],
						[-14.631, 21.861],
						[-14.751, 21.501],
						[-17.003, 21.421],
						[-17.02, 21.422],
						[-16.973, 21.886],
						[-16.589, 22.158],
						[-16.262, 22.679],
						[-16.326, 23.018],
						[-15.983, 23.723],
						[-15.426, 24.359],
						[-15.089, 24.52],
						[-14.825, 25.104],
						[-14.801, 25.636],
						[-14.44, 26.254],
						[-13.774, 26.619],
						[-13.14, 27.64],
						[-13.122, 27.654],
						[-12.619, 28.038],
						[-11.689, 28.149],
						[-10.901, 28.832],
						[-10.4, 29.099],
						[-9.565, 29.934],
						[-9.815, 31.178],
						[-9.435, 32.038],
						[-9.301, 32.565],
						[-8.657, 33.24],
						[-7.654, 33.697],
						[-6.913, 34.11],
						[-6.244, 35.146],
						[-5.93, 35.76],
						[-5.194, 35.755],
						[-4.591, 35.331],
						[-3.64, 35.4],
						[-2.604, 35.179],
						[-2.17, 35.168]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "埃及",
					"x": 29.445837,
					"y": 26.186173,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[36.866, 22],
						[32.9, 22],
						[29.02, 22],
						[25, 22],
						[25, 25.683],
						[25, 29.239],
						[24.7, 30.044],
						[24.958, 30.662],
						[24.803, 31.089],
						[25.165, 31.569],
						[26.495, 31.586],
						[27.458, 31.321],
						[28.45, 31.026],
						[28.914, 30.87],
						[29.683, 31.187],
						[30.095, 31.473],
						[30.977, 31.556],
						[31.688, 31.43],
						[31.96, 30.934],
						[32.192, 31.26],
						[32.994, 31.024],
						[33.773, 30.967],
						[34.265, 31.219],
						[34.265, 31.219],
						[34.823, 29.761],
						[34.923, 29.501],
						[34.642, 29.099],
						[34.427, 28.344],
						[34.155, 27.823],
						[33.921, 27.649],
						[33.588, 27.971],
						[33.137, 28.418],
						[32.423, 29.851],
						[32.32, 29.76],
						[32.735, 28.705],
						[33.349, 27.7],
						[34.105, 26.142],
						[34.474, 25.599],
						[34.795, 25.034],
						[35.692, 23.927],
						[35.494, 23.752],
						[35.526, 23.102],
						[36.691, 22.205],
						[36.866, 22]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "利比亚",
					"x": 18.011015,
					"y": 26.638944,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[25, 22],
						[25, 20.003],
						[23.85, 20],
						[23.838, 19.58],
						[19.849, 21.495],
						[15.861, 23.41],
						[14.851, 22.863],
						[14.144, 22.491],
						[13.581, 23.041],
						[12, 23.472],
						[11.561, 24.098],
						[10.771, 24.563],
						[10.304, 24.379],
						[9.948, 24.937],
						[9.911, 25.365],
						[9.319, 26.094],
						[9.716, 26.512],
						[9.629, 27.141],
						[9.756, 27.688],
						[9.684, 28.144],
						[9.86, 28.96],
						[9.806, 29.425],
						[9.482, 30.308],
						[9.97, 30.539],
						[10.057, 30.962],
						[9.95, 31.376],
						[10.637, 31.761],
						[10.945, 32.082],
						[11.432, 32.369],
						[11.489, 33.137],
						[12.663, 32.793],
						[13.083, 32.879],
						[13.919, 32.712],
						[15.246, 32.265],
						[15.714, 31.376],
						[16.612, 31.182],
						[18.021, 30.764],
						[19.086, 30.266],
						[19.574, 30.526],
						[20.053, 30.986],
						[19.82, 31.752],
						[20.134, 32.238],
						[20.855, 32.707],
						[21.543, 32.843],
						[22.896, 32.639],
						[23.237, 32.191],
						[23.609, 32.187],
						[23.927, 32.017],
						[24.921, 31.899],
						[25.165, 31.569],
						[24.803, 31.089],
						[24.958, 30.662],
						[24.7, 30.044],
						[25, 29.239],
						[25, 25.683],
						[25, 22]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "埃塞俄比亚",
					"x": 39.0886,
					"y": 8.032795,
					"rank": 2
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[47.789, 8.003],
						[44.964, 5.002],
						[43.661, 4.958],
						[42.77, 4.253],
						[42.129, 4.234],
						[41.855, 3.919],
						[41.172, 3.919],
						[40.768, 4.257],
						[39.855, 3.839],
						[39.559, 3.422],
						[38.893, 3.501],
						[38.671, 3.616],
						[38.437, 3.589],
						[38.121, 3.599],
						[36.855, 4.448],
						[36.159, 4.448],
						[35.817, 4.777],
						[35.817, 5.338],
						[35.298, 5.506],
						[34.707, 6.594],
						[34.25, 6.826],
						[34.075, 7.226],
						[33.568, 7.713],
						[32.954, 7.785],
						[33.295, 8.355],
						[33.825, 8.379],
						[33.975, 8.685],
						[33.962, 9.584],
						[34.257, 10.63],
						[34.731, 10.91],
						[34.832, 11.319],
						[35.26, 12.083],
						[35.864, 12.578],
						[36.27, 13.563],
						[36.43, 14.422],
						[37.594, 14.213],
						[37.906, 14.959],
						[38.513, 14.505],
						[39.099, 14.741],
						[39.341, 14.532],
						[40.026, 14.52],
						[40.897, 14.119],
						[41.155, 13.773],
						[41.599, 13.452],
						[42.01, 12.866],
						[42.352, 12.542],
						[42, 12.1],
						[41.662, 11.631],
						[41.74, 11.355],
						[41.756, 11.051],
						[42.314, 11.034],
						[42.555, 11.105],
						[42.777, 10.927],
						[42.559, 10.573],
						[42.928, 10.022],
						[43.297, 9.54],
						[43.679, 9.184],
						[46.948, 7.997],
						[47.789, 8.003]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "吉布提",
					"x": 42.498825,
					"y": 11.976343,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[42.352, 12.542],
						[42.78, 12.455],
						[43.081, 12.7],
						[43.318, 12.39],
						[43.286, 11.975],
						[42.716, 11.736],
						[43.145, 11.462],
						[42.777, 10.927],
						[42.555, 11.105],
						[42.314, 11.034],
						[41.756, 11.051],
						[41.74, 11.355],
						[41.662, 11.631],
						[42, 12.1],
						[42.352, 12.542]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "索马里兰",
					"x": 46.731595,
					"y": 9.443889,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[48.948, 11.411],
						[48.948, 11.411],
						[48.942, 11.394],
						[48.938, 10.982],
						[48.938, 9.973],
						[48.938, 9.452],
						[48.487, 8.838],
						[47.789, 8.003],
						[46.948, 7.997],
						[43.679, 9.184],
						[43.297, 9.54],
						[42.928, 10.022],
						[42.559, 10.573],
						[42.777, 10.927],
						[43.145, 11.462],
						[43.471, 11.278],
						[43.667, 10.864],
						[44.118, 10.446],
						[44.614, 10.442],
						[45.557, 10.698],
						[46.645, 10.817],
						[47.526, 11.127],
						[48.022, 11.193],
						[48.379, 11.375],
						[48.948, 11.411],
						[48.948, 11.411]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "乌干达",
					"x": 32.948555,
					"y": 1.972589,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[33.904, -.95],
						[31.866, -1.027],
						[30.77, -1.015],
						[30.419, -1.135],
						[29.822, -1.443],
						[29.579, -1.341],
						[29.588, -.587],
						[29.82, -.205],
						[29.876, .597],
						[30.086, 1.062],
						[30.469, 1.584],
						[30.853, 1.849],
						[31.174, 2.204],
						[30.773, 2.34],
						[30.834, 3.509],
						[30.834, 3.509],
						[31.246, 3.782],
						[31.881, 3.558],
						[32.686, 3.792],
						[33.39, 3.79],
						[34.005, 4.25],
						[34.479, 3.556],
						[34.596, 3.054],
						[35.036, 1.906],
						[34.672, 1.177],
						[34.18, .515],
						[33.894, .11],
						[33.904, -.95]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "卢旺达",
					"x": 30.103894,
					"y": -1.897196,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[30.419, -1.135],
						[30.816, -1.699],
						[30.758, -2.287],
						[30.47, -2.414],
						[30.47, -2.414],
						[29.938, -2.348],
						[29.632, -2.918],
						[29.025, -2.839],
						[29.117, -2.292],
						[29.255, -2.215],
						[29.292, -1.62],
						[29.579, -1.341],
						[29.822, -1.443],
						[30.419, -1.135]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "波斯尼亚和黑塞哥维那",
					"x": 18.06841,
					"y": 44.091051,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[18.56, 42.65],
						[17.675, 43.029],
						[17.297, 43.446],
						[16.916, 43.668],
						[16.456, 44.041],
						[16.24, 44.351],
						[15.75, 44.819],
						[15.959, 45.234],
						[16.318, 45.004],
						[16.535, 45.212],
						[17.002, 45.234],
						[17.862, 45.068],
						[18.553, 45.082],
						[19.005, 44.86],
						[19.005, 44.86],
						[19.368, 44.863],
						[19.118, 44.423],
						[19.6, 44.038],
						[19.454, 43.568],
						[19.219, 43.524],
						[19.032, 43.433],
						[18.706, 43.2],
						[18.56, 42.65]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "北马其顿",
					"x": 21.555839,
					"y": 41.558223,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[22.381, 42.32],
						[22.881, 41.999],
						[22.952, 41.338],
						[22.762, 41.305],
						[22.597, 41.13],
						[22.055, 41.15],
						[21.674, 40.931],
						[21.02, 40.843],
						[20.605, 41.086],
						[20.463, 41.515],
						[20.59, 41.855],
						[20.59, 41.855],
						[20.717, 41.847],
						[20.762, 42.052],
						[21.353, 42.207],
						[21.577, 42.245],
						[21.917, 42.304],
						[22.381, 42.32]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "塞尔维亚",
					"x": 20.787989,
					"y": 44.189919,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[18.83, 45.909],
						[18.83, 45.909],
						[19.596, 46.172],
						[20.22, 46.127],
						[20.762, 45.735],
						[20.874, 45.416],
						[21.484, 45.181],
						[21.562, 44.769],
						[22.145, 44.478],
						[22.459, 44.703],
						[22.706, 44.578],
						[22.474, 44.409],
						[22.657, 44.235],
						[22.41, 44.008],
						[22.5, 43.643],
						[22.986, 43.211],
						[22.605, 42.899],
						[22.437, 42.58],
						[22.545, 42.461],
						[22.381, 42.32],
						[21.917, 42.304],
						[21.577, 42.245],
						[21.543, 42.32],
						[21.663, 42.439],
						[21.775, 42.683],
						[21.633, 42.677],
						[21.439, 42.863],
						[21.274, 42.91],
						[21.143, 43.069],
						[20.957, 43.131],
						[20.814, 43.272],
						[20.635, 43.217],
						[20.497, 42.885],
						[20.258, 42.813],
						[20.34, 42.899],
						[19.959, 43.106],
						[19.63, 43.214],
						[19.484, 43.352],
						[19.219, 43.524],
						[19.454, 43.568],
						[19.6, 44.038],
						[19.118, 44.423],
						[19.368, 44.863],
						[19.005, 44.86],
						[19.005, 44.86],
						[19.39, 45.237],
						[19.073, 45.522],
						[18.83, 45.909]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "黑山",
					"x": 19.143727,
					"y": 42.803101,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[20.071, 42.589],
						[19.802, 42.5],
						[19.738, 42.688],
						[19.304, 42.196],
						[19.372, 41.878],
						[19.162, 41.955],
						[18.882, 42.282],
						[18.45, 42.48],
						[18.56, 42.65],
						[18.706, 43.2],
						[19.032, 43.433],
						[19.219, 43.524],
						[19.484, 43.352],
						[19.63, 43.214],
						[19.959, 43.106],
						[20.34, 42.899],
						[20.258, 42.813],
						[20.071, 42.589]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "科索沃",
					"x": 20.860719,
					"y": 42.593587,
					"rank": 6
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[20.59, 41.855],
						[20.523, 42.218],
						[20.284, 42.32],
						[20.071, 42.589],
						[20.258, 42.813],
						[20.497, 42.885],
						[20.635, 43.217],
						[20.814, 43.272],
						[20.957, 43.131],
						[21.143, 43.069],
						[21.274, 42.91],
						[21.439, 42.863],
						[21.633, 42.677],
						[21.775, 42.683],
						[21.663, 42.439],
						[21.543, 42.32],
						[21.577, 42.245],
						[21.353, 42.207],
						[20.762, 42.052],
						[20.717, 41.847],
						[20.59, 41.855]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "特立尼达和多巴哥",
					"x": -60.9184,
					"y": 10.9989,
					"rank": 5
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[-61.68, 10.76],
						[-61.105, 10.89],
						[-60.895, 10.855],
						[-60.935, 10.11],
						[-61.77, 10],
						[-61.95, 10.09],
						[-61.66, 10.365],
						[-61.68, 10.76]
					]]
				}
			},
			{
				"type": "Feature",
				"properties": {
					"name": "南苏丹",
					"x": 30.390151,
					"y": 7.230477,
					"rank": 3
				},
				"geometry": {
					"type": "Polygon",
					"coordinates": [[
						[30.834, 3.509],
						[29.953, 4.174],
						[29.716, 4.601],
						[29.159, 4.389],
						[28.697, 4.455],
						[28.429, 4.287],
						[27.98, 4.408],
						[27.374, 5.234],
						[27.213, 5.551],
						[26.466, 5.947],
						[26.213, 6.547],
						[25.797, 6.979],
						[25.124, 7.5],
						[25.115, 7.825],
						[24.567, 8.229],
						[23.887, 8.62],
						[24.194, 8.729],
						[24.537, 8.918],
						[24.795, 9.81],
						[25.07, 10.274],
						[25.791, 10.411],
						[25.962, 10.136],
						[26.477, 9.553],
						[26.752, 9.467],
						[27.113, 9.639],
						[27.834, 9.604],
						[27.971, 9.398],
						[28.967, 9.398],
						[29.001, 9.604],
						[29.516, 9.793],
						[29.619, 10.085],
						[29.997, 10.291],
						[30.838, 9.707],
						[31.353, 9.81],
						[31.851, 10.531],
						[32.4, 11.081],
						[32.314, 11.681],
						[32.074, 11.973],
						[32.675, 12.025],
						[32.743, 12.248],
						[33.207, 12.179],
						[33.087, 11.441],
						[33.207, 10.72],
						[33.722, 10.325],
						[33.842, 9.982],
						[33.825, 9.484],
						[33.963, 9.464],
						[33.975, 8.685],
						[33.825, 8.379],
						[33.295, 8.355],
						[32.954, 7.785],
						[33.568, 7.713],
						[34.075, 7.226],
						[34.25, 6.826],
						[34.707, 6.594],
						[35.298, 5.506],
						[34.62, 4.847],
						[34.005, 4.25],
						[33.39, 3.79],
						[32.686, 3.792],
						[31.881, 3.558],
						[31.246, 3.782],
						[30.834, 3.509]
					]]
				}
			}
		]
	};
	//#endregion
	//#region ../../games/local/vibeJam-myself-history-guess/src/cities.js
	var baseCities = [
		[
			"北京",
			39.904,
			116.407
		],
		[
			"上海",
			31.23,
			121.474
		],
		[
			"西安 / 长安",
			34.265,
			108.943
		],
		[
			"开封 / 汴京",
			34.797,
			114.307
		],
		[
			"敦煌",
			40.04,
			94.803
		],
		[
			"南京",
			32.06,
			118.796
		],
		[
			"杭州",
			30.274,
			120.155
		],
		[
			"洛阳",
			34.619,
			112.454
		],
		[
			"成都",
			30.572,
			104.066
		],
		[
			"广州",
			23.129,
			113.264
		],
		[
			"拉萨",
			29.65,
			91.14
		],
		[
			"武汉",
			30.593,
			114.305
		],
		[
			"重庆",
			29.563,
			106.55
		],
		[
			"昆明",
			25.038,
			102.718
		],
		[
			"乌鲁木齐",
			43.825,
			87.617
		],
		[
			"香港",
			22.319,
			114.169
		],
		[
			"台北",
			25.033,
			121.565
		],
		[
			"郑州",
			34.747,
			113.625
		],
		[
			"泉州",
			24.874,
			118.675
		],
		[
			"苏州",
			31.299,
			120.585
		],
		[
			"兰州",
			36.061,
			103.834
		],
		[
			"银川",
			38.487,
			106.23
		],
		[
			"喀什",
			39.47,
			75.989
		],
		[
			"大同",
			40.076,
			113.3
		],
		[
			"沈阳",
			41.805,
			123.431
		],
		[
			"哈尔滨",
			45.804,
			126.535
		],
		[
			"天津",
			39.084,
			117.201
		],
		[
			"长沙",
			28.228,
			112.939
		],
		[
			"福州",
			26.075,
			119.296
		],
		[
			"罗马",
			41.903,
			12.496
		],
		[
			"巴黎",
			48.857,
			2.352
		],
		[
			"吉萨",
			29.987,
			31.211
		],
		[
			"开罗",
			30.044,
			31.236
		],
		[
			"伦敦",
			51.507,
			-.128
		],
		[
			"雅典",
			37.984,
			23.728
		],
		[
			"伊斯坦布尔",
			41.008,
			28.978
		],
		[
			"耶路撒冷",
			31.768,
			35.214
		],
		[
			"巴格达",
			33.315,
			44.366
		],
		[
			"德黑兰",
			35.689,
			51.389
		],
		[
			"撒马尔罕",
			39.654,
			66.959
		],
		[
			"东京",
			35.676,
			139.65
		],
		[
			"京都",
			35.011,
			135.768
		],
		[
			"首尔",
			37.566,
			126.978
		],
		[
			"曼谷",
			13.756,
			100.502
		],
		[
			"河内",
			21.028,
			105.834
		],
		[
			"新加坡",
			1.352,
			103.82
		],
		[
			"新德里",
			28.614,
			77.209
		],
		[
			"孟买",
			19.076,
			72.878
		],
		[
			"加德满都",
			27.717,
			85.324
		],
		[
			"雅加达",
			-6.209,
			106.846
		],
		[
			"暹粒",
			13.363,
			103.856
		],
		[
			"莫斯科",
			55.756,
			37.617
		],
		[
			"圣彼得堡",
			59.934,
			30.335
		],
		[
			"柏林",
			52.52,
			13.405
		],
		[
			"维也纳",
			48.208,
			16.373
		],
		[
			"马德里",
			40.417,
			-3.704
		],
		[
			"里斯本",
			38.722,
			-9.139
		],
		[
			"阿姆斯特丹",
			52.367,
			4.904
		],
		[
			"威尼斯",
			45.44,
			12.315
		],
		[
			"佛罗伦萨",
			43.77,
			11.256
		],
		[
			"斯德哥尔摩",
			59.329,
			18.069
		],
		[
			"纽约",
			40.713,
			-74.006
		],
		[
			"华盛顿",
			38.907,
			-77.037
		],
		[
			"旧金山",
			37.775,
			-122.419
		],
		[
			"洛杉矶",
			34.052,
			-118.244
		],
		[
			"墨西哥城",
			19.433,
			-99.133
		],
		[
			"利马",
			-12.046,
			-77.043
		],
		[
			"里约热内卢",
			-22.907,
			-43.173
		],
		[
			"布宜诺斯艾利斯",
			-34.604,
			-58.382
		],
		[
			"多伦多",
			43.653,
			-79.383
		],
		[
			"悉尼",
			-33.869,
			151.209
		],
		[
			"墨尔本",
			-37.814,
			144.963
		],
		[
			"奥克兰",
			-36.849,
			174.763
		],
		[
			"开普敦",
			-33.925,
			18.424
		],
		[
			"内罗毕",
			-1.292,
			36.822
		],
		[
			"马拉喀什",
			31.63,
			-7.981
		],
		[
			"突尼斯",
			36.807,
			10.182
		],
		[
			"亚历山大",
			31.2,
			29.919
		],
		[
			"卢克索",
			25.687,
			32.64
		],
		[
			"阿克拉",
			5.603,
			-.187
		]
	].map(([name, lat, lng]) => ({
		name,
		lat,
		lng
	}));
	//#endregion
	//#region ../../games/local/vibeJam-myself-history-guess/competition-renderer.js
	var yearLabel = (year) => `${Number(year) < 0 ? "公元前" : "公元"} ${Math.abs(Number(year)) || "—"} 年`;
	var clamp = (n, min, max) => Math.max(min, Math.min(max, n));
	function createRenderer({ createImage, assetBase = "", loadImage } = {}) {
		let buttons = [], rect, currentRound, mode = "scene", previousMode = "scene";
		let guess = null, digits = "", bce = false, yaw = .5, zoom = 1, mapZoom = 1, center = {
			lat: 15,
			lng: 20
		};
		let imagePath, picture, imageReady = false, imageError = false, message = "", imageToken = 0;
		const reset = (state) => {
			if (currentRound === state.roundKey) return;
			currentRound = state.roundKey;
			mode = "scene";
			guess = null;
			digits = "";
			bce = false;
			yaw = .5;
			zoom = 1;
			mapZoom = 1;
			center = {
				lat: 15,
				lng: 20
			};
			message = "";
			if (state.input) {
				guess = state.input.guess || null;
				digits = state.input.digits || "";
				bce = state.input.bce === true;
			}
		};
		function draw(ctx, w, h, state) {
			reset(state);
			buttons = [];
			ctx.save();
			ctx.fillStyle = "#f4efe4";
			ctx.fillRect(0, 0, w, h);
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			const text = (value, x, y, size = 14, color = "#243d33") => {
				ctx.fillStyle = color;
				ctx.font = `${size}px sans-serif`;
				ctx.fillText(String(value), x, y);
			};
			const wrap = (value, x, y, width, maxLines = 4, size = 14) => {
				let line = "", row = 0;
				ctx.font = `${size}px sans-serif`;
				const chars = [...String(value)];
				for (let i = 0; i < chars.length; i++) {
					if (ctx.measureText(line + chars[i]).width > width && line) {
						text(row === maxLines - 1 ? line.slice(0, -1) + "…" : line, x, y + row * (size + 6), size);
						if (++row >= maxLines) return;
						line = "";
					}
					line += chars[i];
				}
				if (line) text(line, x, y + row * (size + 6), size);
			};
			const button = (label, x, y, width, height, run, active = false) => {
				ctx.fillStyle = active ? "#244e40" : "#e4dece";
				ctx.fillRect(x, y, width, height);
				ctx.textAlign = "center";
				text(label, x + width / 2, y + height / 2, 14, active ? "#fff9ec" : "#243d33");
				ctx.textAlign = "left";
				buttons.push({
					x,
					y,
					w: width,
					h: height,
					run,
					label
				});
			};
			text(`第 ${state.round}/${state.total} 幕 · ${state.score} 分`, 10, 17);
			const wide = w > 600 && h < 460;
			const top = 88, bottom = h - (wide ? 58 : 125);
			rect = {
				x: 10,
				y: top,
				w: w - 20,
				h: Math.max(80, bottom - top)
			};
			if (state.phase === "revealed") {
				const answer = state.answer;
				if (mode === "answer-map") {
					drawMap();
					button("返回解说", 10, 36, w - 20, 44, () => {
						mode = "scene";
					});
				} else {
					button("对照地图", 10, 36, w - 20, 44, () => {
						mode = "answer-map";
						mapZoom = 1;
					});
					text(answer.place, 12, 100, 18);
					text(`${yearLabel(answer.year)} · 满分宽容 ±${answer.tolerance} 年`, 12, 131);
					text(`本幕 ${answer.score}/5000 · 提示扣 ${answer.penalty}`, 12, 158);
					text(`地点：${answer.distance === null ? "未作答" : Math.round(answer.distance) + " 公里误差"} · 年代：${answer.years === null ? "未作答" : answer.years + " 年误差"}`, 12, 186);
					wrap(answer.story, wide ? w / 2 : 12, wide ? 100 : 218, wide ? w / 2 - 16 : w - 24, wide ? 5 : Math.max(2, Math.floor((bottom - 225) / 20)));
				}
				if (!wide) wrap("AI 历史想象复原；年份为游戏设定。", 12, h - 89, w - 24, 1, 12);
				if (!state.finished) button("前往下一幕", 10, h - 60, w - 20, 48, () => ({ type: "next" }), true);
				else wrap("五幕已完成，本局答题结束。", 12, h - 39, w - 24, 2);
				ctx.restore();
				return;
			}
			button(mode === "scene" ? "地图选点" : "观察场景", 10, 36, (w - 28) / 2, 44, () => {
				mode = mode === "scene" ? "map" : "scene";
			});
			button(state.hint ? "提示已扣 500" : "提示 −500", 18 + (w - 28) / 2, 36, (w - 28) / 2, 44, () => state.hint ? null : { type: "hint" });
			if (mode === "year") {
				const columns = rect.h < 255 ? 6 : 3, rows = 12 / columns;
				const keyW = (w - 20 - (columns - 1) * 6) / columns;
				const keyH = Math.max(wide ? 28 : 44, Math.min(48, (rect.h - 55) / rows - 5));
				text(yearLabel((bce ? -1 : 1) * Number(digits)), 16, 101, 20);
				button(bce ? "改为公元" : "改为公元前", w - 142, 82, 130, 44, () => {
					bce = !bce;
				});
				[
					"1",
					"2",
					"3",
					"4",
					"5",
					"6",
					"7",
					"8",
					"9",
					"清空",
					"0",
					"退格"
				].forEach((key, i) => button(key, 10 + i % columns * (keyW + 6), 130 + Math.floor(i / columns) * (keyH + 5), keyW, keyH, () => {
					digits = key === "清空" ? "" : key === "退格" ? digits.slice(0, -1) : (digits + key).slice(0, 4);
				}));
			} else if (mode === "map") drawMap();
			else {
				const imageRect = {
					...rect,
					w: wide ? Math.floor(w * .6) - 20 : rect.w,
					h: wide ? rect.h : Math.max(50, rect.h - (state.hint ? 132 : 80))
				};
				if (state.image !== imagePath) {
					imagePath = state.image;
					imageReady = false;
					imageError = false;
					const token = ++imageToken, source = imagePath;
					picture = null;
					if (loadImage) Promise.resolve().then(() => loadImage(source)).then((image) => {
						if (token !== imageToken) return;
						if (!image) {
							imageError = true;
							return;
						}
						picture = image;
						imageReady = true;
					}, () => {
						if (token === imageToken) imageError = true;
					});
					else {
						picture = createImage?.();
						if (picture) {
							picture.onload = () => {
								if (token === imageToken) imageReady = true;
							};
							picture.onerror = () => {
								if (token === imageToken) imageError = true;
							};
							picture.src = `${assetBase}${assetBase && !assetBase.endsWith("/") ? "/" : ""}${imagePath}`;
						} else imageError = true;
					}
				}
				ctx.fillStyle = "#203e36";
				ctx.fillRect(imageRect.x, imageRect.y, imageRect.w, imageRect.h);
				if (imageReady) {
					const sh = picture.height / zoom, sw = Math.min(picture.width, sh * imageRect.w / imageRect.h);
					const sx = yaw * Math.max(0, picture.width - sw);
					ctx.drawImage(picture, sx, (picture.height - sh) / 2, sw, sh, imageRect.x, imageRect.y, imageRect.w, imageRect.h);
				} else text(imageError ? "场景加载失败，点击画面重试" : "正在载入历史全景…", 18, 123, 14, "#fff9ec");
				buttons.push({
					...imageRect,
					run: () => {
						if (imageError) imagePath = null;
						else yaw = (yaw + .2) % 1;
					}
				});
				const controlsY = imageRect.y + imageRect.h - 48;
				[
					["向左", () => {
						yaw = clamp(yaw - .2, 0, 1);
					}],
					["向右", () => {
						yaw = clamp(yaw + .2, 0, 1);
					}],
					[zoom === 1 ? "放大" : "还原", () => {
						zoom = zoom === 1 ? 2 : 1;
					}]
				].forEach(([label, run], i) => button(label, 14 + i * 72, controlsY, 66, 44, run));
				const clueX = wide ? Math.floor(w * .6) : 12, clueW = wide ? w - clueX - 12 : w - 24;
				wrap(state.clue, clueX, wide ? 96 : imageRect.y + imageRect.h + 16, clueW, 3, 13);
				if (state.hint) wrap(state.hint, clueX, wide ? 164 : imageRect.y + imageRect.h + 75, clueW, 3, 13);
			}
			const year = (bce ? -1 : 1) * Number(digits);
			const validYear = Number.isInteger(year) && year !== 0 && year >= -3e3 && year <= 2026;
			if (!wide || message) text(message || (guess ? `已落点 ${guess.lat.toFixed(2)}°, ${guess.lng.toFixed(2)}°` : "先观察线索，再打开地图落点"), 12, wide ? h - 68 : h - 110, 12);
			button(mode === "year" ? "完成年代输入" : digits ? yearLabel(year) + " · 修改" : "输入猜测年代", 10, h - (wide ? 48 : 96), wide ? w / 2 - 15 : w - 20, 44, () => {
				if (mode === "year") mode = previousMode;
				else {
					previousMode = mode;
					mode = "year";
				}
			});
			button("提交地点与年代", wide ? w / 2 + 5 : 10, h - 48, wide ? w / 2 - 15 : w - 20, 44, () => {
				if (!guess || !validYear) {
					message = !guess ? "请先在地图落点" : "年代范围：公元前 3000 至公元 2026，无 0 年";
					return null;
				}
				message = "";
				return {
					type: "guess",
					point: guess,
					year
				};
			}, true);
			ctx.restore();
			function drawMap() {
				ctx.save();
				ctx.beginPath();
				ctx.rect(rect.x, rect.y, rect.w, rect.h);
				ctx.clip();
				ctx.fillStyle = "#c9dedb";
				ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
				const sx = rect.w / 360 * mapZoom, sy = rect.h / 170 * mapZoom;
				const project = (lng, lat) => [rect.x + rect.w / 2 + (lng - center.lng) * sx, rect.y + rect.h / 2 - (lat - center.lat) * sy];
				ctx.fillStyle = "#e8e1ce";
				ctx.strokeStyle = "#8b9d91";
				ctx.lineWidth = .6;
				for (const feature of world_default.features) {
					const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
					for (const polygon of polygons) {
						ctx.beginPath();
						for (const ring of polygon) {
							ring.forEach(([lng, lat], i) => {
								const p = project(lng, lat);
								i ? ctx.lineTo(...p) : ctx.moveTo(...p);
							});
							ctx.closePath();
						}
						ctx.fill();
						ctx.stroke();
					}
				}
				buttons.push({
					...rect,
					run: (x, y) => {
						if (state.phase === "revealed") return null;
						guess = {
							lng: clamp(center.lng + (x - rect.x - rect.w / 2) / sx, -180, 180),
							lat: clamp(center.lat - (y - rect.y - rect.h / 2) / sy, -85, 85)
						};
						message = "";
					}
				});
				const used = [];
				for (const { name, lat, lng } of baseCities) {
					const [x, y] = project(lng, lat);
					if (x < 18 || x > w - 18 || y < 100 || y > bottom - 45 || used.some((p) => Math.abs(p[0] - x) < 48 && Math.abs(p[1] - y) < 24)) continue;
					used.push([x, y]);
					ctx.fillStyle = "#355648";
					ctx.fillRect(x - 2, y - 2, 4, 4);
					text(name.split(" / ")[0], x + 4, y, 11);
					buttons.push({
						x: x - 12,
						y: y - 12,
						w: 35,
						h: 24,
						run: () => {
							if (state.phase !== "revealed") guess = {
								lat,
								lng
							};
						}
					});
				}
				const marker = (point, label, color) => {
					if (!point) return;
					const [x, y] = project(point.lng, point.lat);
					ctx.fillStyle = color;
					ctx.beginPath();
					ctx.arc(x, y, 7, 0, Math.PI * 2);
					ctx.fill();
					text(label, x + 9, y, 13, color);
				};
				marker(state.answer?.point || guess, "猜", "#ad422f");
				marker(state.answer, "真", "#147052");
				ctx.restore();
				button("＋ 放大", 14, bottom - 49, 83, 44, () => {
					if (guess) center = { ...guess };
					mapZoom = Math.min(16, mapZoom * 2);
				});
				button("− 缩小", 102, bottom - 49, 83, 44, () => {
					mapZoom = Math.max(1, mapZoom / 2);
					if (mapZoom === 1) center = {
						lat: 15,
						lng: 20
					};
				});
				text("Natural Earth", Math.max(192, w - 100), bottom - 20, 10);
			}
		}
		return {
			draw,
			snapshot() {
				return {
					guess,
					digits,
					bce
				};
			},
			tap(x, y, state) {
				reset(state);
				return [...buttons].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.run(x, y) || null;
			}
		};
	}
	//#endregion
	//#region ../../.scratch/competition/h5-vibeJam-myself-history-guess.js
	globalThis.__COMPETITION_CONFIG__ = Object.assign({
		"game": "vibeJam-myself-history-guess",
		"platform": "h5",
		"title": "此时·此地",
		"apiUrl": ""
	}, globalThis.__COMPETITION_CONFIG__ || {});
	mountCompetition("vibeJam-myself-history-guess", createRenderer);
	//#endregion
})();
