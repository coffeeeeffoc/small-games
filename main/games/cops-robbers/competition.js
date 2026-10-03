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
	//#region ../../games/local/cops-robbers/src/engine.js
	function prepareLevel(raw) {
		const adj = raw.nodes.map(() => []);
		for (const [a, b] of raw.edges) {
			adj[a].push(b);
			adj[b].push(a);
		}
		adj.forEach((neighbors) => neighbors.sort((a, b) => a - b));
		const dist = adj.map((_, start) => {
			const distances = adj.map(() => Infinity), queue = [start];
			distances[start] = 0;
			for (let i = 0; i < queue.length; i++) for (const next of adj[queue[i]]) {
				if (distances[next] !== Infinity) continue;
				distances[next] = distances[queue[i]] + 1;
				queue.push(next);
			}
			return distances;
		});
		return {
			...raw,
			exits: raw.exits || [],
			adj,
			dist
		};
	}
	function legalTargets(level, state, copIndex) {
		const from = state.cops[copIndex];
		if (from === void 0) return [];
		return [from, ...level.adj[from]].filter((node) => !state.robbers.includes(node) && (node === from || !state.cops.includes(node)));
	}
	//#endregion
	//#region ../../games/local/cops-robbers/src/levels.js
	var levels = [
		{
			"id": 1,
			"chapter": 0,
			"name": "三路合围",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[0, 5],
				[1, 2],
				[6, 7],
				[1, 6],
				[2, 3],
				[7, 8],
				[3, 4],
				[8, 9],
				[4, 0],
				[9, 5],
				[4, 9]
			],
			"cops": [
				2,
				8,
				9
			],
			"robbers": [5],
			"exits": [4, 1],
			"par": 7
		},
		{
			"id": 2,
			"chapter": 0,
			"name": "内外夹击",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[0, 6],
				[1, 2],
				[7, 8],
				[1, 7],
				[2, 3],
				[8, 9],
				[2, 8],
				[3, 4],
				[9, 10],
				[4, 5],
				[10, 11],
				[5, 0],
				[11, 6],
				[5, 11]
			],
			"cops": [
				1,
				9,
				5
			],
			"robbers": [7],
			"exits": [3, 0],
			"par": 6
		},
		{
			"id": 3,
			"chapter": 0,
			"name": "巷口接力",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[0, 5],
				[1, 2],
				[6, 7],
				[1, 6],
				[2, 3],
				[7, 8],
				[3, 4],
				[8, 9],
				[3, 8],
				[4, 0],
				[9, 5],
				[4, 9]
			],
			"cops": [
				8,
				9,
				5
			],
			"robbers": [6],
			"exits": [4, 0],
			"par": 5
		},
		{
			"id": 4,
			"chapter": 0,
			"name": "绕到背后",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[1, 2],
				[6, 7],
				[1, 6],
				[2, 3],
				[7, 8],
				[2, 7],
				[3, 4],
				[8, 9],
				[3, 8],
				[4, 0],
				[9, 5],
				[4, 9]
			],
			"cops": [
				2,
				6,
				9
			],
			"robbers": [3],
			"exits": [4, 1],
			"par": 5
		},
		{
			"id": 5,
			"chapter": 0,
			"name": "岔路换防",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[0, 6],
				[1, 2],
				[7, 8],
				[1, 7],
				[2, 3],
				[8, 9],
				[3, 4],
				[9, 10],
				[4, 5],
				[10, 11],
				[4, 10],
				[5, 0],
				[11, 6],
				[5, 11]
			],
			"cops": [
				2,
				1,
				7
			],
			"robbers": [5],
			"exits": [3, 0],
			"par": 7
		},
		{
			"id": 6,
			"chapter": 0,
			"name": "缺口危机",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[1, 2],
				[6, 7],
				[1, 6],
				[2, 3],
				[7, 8],
				[2, 7],
				[3, 4],
				[8, 9],
				[4, 0],
				[9, 5],
				[4, 9]
			],
			"cops": [
				9,
				4,
				8
			],
			"robbers": [5],
			"exits": [1, 0],
			"par": 5
		},
		{
			"id": 7,
			"chapter": 0,
			"name": "回环追逃",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[0, 5],
				[1, 2],
				[6, 7],
				[2, 3],
				[7, 8],
				[2, 7],
				[3, 4],
				[8, 9],
				[3, 8],
				[4, 0],
				[9, 5],
				[4, 9]
			],
			"cops": [
				6,
				8,
				9
			],
			"robbers": [3],
			"exits": [0, 4],
			"par": 5
		},
		{
			"id": 8,
			"chapter": 0,
			"name": "两门之间",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[1, 2],
				[7, 8],
				[1, 7],
				[2, 3],
				[8, 9],
				[2, 8],
				[3, 4],
				[9, 10],
				[3, 9],
				[4, 5],
				[10, 11],
				[5, 0],
				[11, 6],
				[5, 11]
			],
			"cops": [
				7,
				5,
				4
			],
			"robbers": [2],
			"exits": [3, 0],
			"par": 8
		},
		{
			"id": 9,
			"chapter": 0,
			"name": "街心穿行",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[1, 2],
				[6, 7],
				[1, 6],
				[2, 3],
				[7, 8],
				[3, 4],
				[8, 9],
				[3, 8],
				[4, 0],
				[9, 5],
				[4, 9]
			],
			"cops": [
				5,
				7,
				6
			],
			"robbers": [9],
			"exits": [0, 1],
			"par": 7
		},
		{
			"id": 10,
			"chapter": 0,
			"name": "不能漏岗",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[1, 2],
				[7, 8],
				[1, 7],
				[2, 3],
				[8, 9],
				[3, 4],
				[9, 10],
				[3, 9],
				[4, 5],
				[10, 11],
				[4, 10],
				[5, 0],
				[11, 6],
				[5, 11]
			],
			"cops": [
				1,
				2,
				4
			],
			"robbers": [10],
			"exits": [3, 0],
			"par": 7
		},
		{
			"id": 11,
			"chapter": 0,
			"name": "转角包抄",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[0, 5],
				[1, 2],
				[6, 7],
				[2, 3],
				[7, 8],
				[2, 7],
				[3, 4],
				[8, 9],
				[3, 8],
				[4, 0],
				[9, 5]
			],
			"cops": [
				3,
				0,
				8
			],
			"robbers": [2],
			"exits": [4, 1],
			"par": 5
		},
		{
			"id": 12,
			"chapter": 0,
			"name": "小巷总动员",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[0, 5],
				[1, 2],
				[6, 7],
				[2, 3],
				[7, 8],
				[2, 7],
				[3, 4],
				[8, 9],
				[4, 0],
				[9, 5],
				[4, 9]
			],
			"cops": [
				8,
				5,
				6
			],
			"robbers": [7],
			"exits": [4, 0],
			"par": 6
		},
		{
			"id": 13,
			"chapter": 1,
			"name": "十字摊位",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 395,
					"y": 205
				},
				{
					"x": 435,
					"y": 300
				},
				{
					"x": 395,
					"y": 395
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 205,
					"y": 395
				},
				{
					"x": 165,
					"y": 300
				},
				{
					"x": 205,
					"y": 205
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[0, 8],
				[1, 2],
				[9, 10],
				[1, 9],
				[2, 3],
				[10, 11],
				[3, 4],
				[11, 12],
				[3, 11],
				[4, 5],
				[12, 13],
				[4, 12],
				[5, 6],
				[13, 14],
				[5, 13],
				[6, 7],
				[14, 15],
				[7, 0],
				[15, 8],
				[7, 15]
			],
			"cops": [
				9,
				14,
				6
			],
			"robbers": [12],
			"exits": [2, 0],
			"par": 10
		},
		{
			"id": 14,
			"chapter": 1,
			"name": "早点铺后街",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[0, 6],
				[1, 2],
				[7, 8],
				[2, 3],
				[8, 9],
				[2, 8],
				[3, 4],
				[9, 10],
				[4, 5],
				[10, 11],
				[4, 10],
				[5, 0],
				[11, 6],
				[5, 11]
			],
			"cops": [
				6,
				9,
				8
			],
			"robbers": [11],
			"exits": [3, 0],
			"par": 10
		},
		{
			"id": 15,
			"chapter": 1,
			"name": "双街追逃",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[0, 6],
				[1, 2],
				[7, 8],
				[1, 7],
				[2, 3],
				[8, 9],
				[3, 4],
				[9, 10],
				[3, 9],
				[4, 5],
				[10, 11],
				[4, 10],
				[5, 0],
				[11, 6],
				[5, 11]
			],
			"cops": [
				7,
				8,
				4
			],
			"robbers": [9],
			"exits": [3, 0],
			"par": 9
		},
		{
			"id": 16,
			"chapter": 1,
			"name": "串起小巷",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[0, 7],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[3, 10],
				[4, 5],
				[11, 12],
				[5, 6],
				[12, 13],
				[5, 12],
				[6, 0],
				[13, 7]
			],
			"cops": [
				5,
				8,
				12
			],
			"robbers": [2],
			"exits": [0, 4],
			"par": 10
		},
		{
			"id": 17,
			"chapter": 1,
			"name": "中央花摊",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[0, 7],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[3, 10],
				[4, 5],
				[11, 12],
				[5, 6],
				[12, 13],
				[6, 0],
				[13, 7],
				[6, 13]
			],
			"cops": [
				4,
				11,
				1
			],
			"robbers": [10, 13],
			"exits": [0, 3],
			"par": 10
		},
		{
			"id": 18,
			"chapter": 1,
			"name": "三路分工",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[0, 6],
				[1, 2],
				[7, 8],
				[1, 7],
				[2, 3],
				[8, 9],
				[2, 8],
				[3, 4],
				[9, 10],
				[4, 5],
				[10, 11],
				[4, 10],
				[5, 0],
				[11, 6]
			],
			"cops": [
				2,
				9,
				6
			],
			"robbers": [5, 7],
			"exits": [3, 0],
			"par": 11
		},
		{
			"id": 19,
			"chapter": 1,
			"name": "糕点铺夹击",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[0, 5],
				[1, 2],
				[6, 7],
				[1, 6],
				[2, 3],
				[7, 8],
				[2, 7],
				[3, 4],
				[8, 9],
				[4, 0],
				[9, 5],
				[4, 9]
			],
			"cops": [
				2,
				7,
				9
			],
			"robbers": [3, 5],
			"exits": [1, 4],
			"par": 7
		},
		{
			"id": 20,
			"chapter": 1,
			"name": "后街近路",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[0, 5],
				[1, 2],
				[6, 7],
				[1, 6],
				[2, 3],
				[7, 8],
				[2, 7],
				[3, 4],
				[8, 9],
				[3, 8],
				[4, 0],
				[9, 5]
			],
			"cops": [
				5,
				0,
				7
			],
			"robbers": [9, 6],
			"exits": [1, 4],
			"par": 8
		},
		{
			"id": 21,
			"chapter": 1,
			"name": "忙碌菜市场",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[0, 6],
				[1, 2],
				[7, 8],
				[1, 7],
				[2, 3],
				[8, 9],
				[2, 8],
				[3, 4],
				[9, 10],
				[3, 9],
				[4, 5],
				[10, 11],
				[5, 0],
				[11, 6],
				[5, 11]
			],
			"cops": [
				10,
				2,
				1
			],
			"robbers": [4, 7],
			"exits": [3, 0],
			"par": 9
		},
		{
			"id": 22,
			"chapter": 1,
			"name": "双环连廊",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 395,
					"y": 205
				},
				{
					"x": 435,
					"y": 300
				},
				{
					"x": 395,
					"y": 395
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 205,
					"y": 395
				},
				{
					"x": 165,
					"y": 300
				},
				{
					"x": 205,
					"y": 205
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[0, 8],
				[1, 2],
				[9, 10],
				[2, 3],
				[10, 11],
				[2, 10],
				[3, 4],
				[11, 12],
				[3, 11],
				[4, 5],
				[12, 13],
				[5, 6],
				[13, 14],
				[6, 7],
				[14, 15],
				[6, 14],
				[7, 0],
				[15, 8],
				[7, 15]
			],
			"cops": [
				9,
				2,
				7
			],
			"robbers": [13, 5],
			"exits": [6, 0],
			"par": 12
		},
		{
			"id": 23,
			"chapter": 1,
			"name": "收摊时刻",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[1, 2],
				[8, 9],
				[2, 3],
				[9, 10],
				[3, 4],
				[10, 11],
				[4, 5],
				[11, 12],
				[5, 6],
				[12, 13],
				[5, 12],
				[6, 0],
				[13, 7],
				[6, 13]
			],
			"cops": [
				10,
				1,
				12
			],
			"robbers": [13, 3],
			"exits": [5, 0],
			"par": 14
		},
		{
			"id": 24,
			"chapter": 1,
			"name": "市场总巡逻",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 395,
					"y": 205
				},
				{
					"x": 435,
					"y": 300
				},
				{
					"x": 395,
					"y": 395
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 205,
					"y": 395
				},
				{
					"x": 165,
					"y": 300
				},
				{
					"x": 205,
					"y": 205
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[0, 8],
				[1, 2],
				[9, 10],
				[1, 9],
				[2, 3],
				[10, 11],
				[2, 10],
				[3, 4],
				[11, 12],
				[3, 11],
				[4, 5],
				[12, 13],
				[4, 12],
				[5, 6],
				[13, 14],
				[6, 7],
				[14, 15],
				[6, 14],
				[7, 0],
				[15, 8]
			],
			"cops": [
				1,
				14,
				5
			],
			"robbers": [6, 9],
			"exits": [4, 0],
			"par": 11
		},
		{
			"id": 25,
			"chapter": 2,
			"name": "湖边双环",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 519,
					"y": 229
				},
				{
					"x": 435,
					"y": 486
				},
				{
					"x": 165,
					"y": 486
				},
				{
					"x": 81,
					"y": 229
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 428,
					"y": 258
				},
				{
					"x": 379,
					"y": 409
				},
				{
					"x": 221,
					"y": 409
				},
				{
					"x": 172,
					"y": 258
				}
			],
			"edges": [
				[0, 1],
				[5, 6],
				[0, 5],
				[1, 2],
				[6, 7],
				[1, 6],
				[2, 3],
				[7, 8],
				[3, 4],
				[8, 9],
				[4, 0],
				[9, 5],
				[4, 9],
				[5, 7]
			],
			"cops": [
				7,
				2,
				6
			],
			"robbers": [8],
			"exits": [1, 4],
			"par": 8
		},
		{
			"id": 26,
			"chapter": 2,
			"name": "林间出口",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[0, 6],
				[1, 2],
				[7, 8],
				[2, 3],
				[8, 9],
				[2, 8],
				[3, 4],
				[9, 10],
				[3, 9],
				[4, 5],
				[10, 11],
				[4, 10],
				[5, 0],
				[11, 6],
				[5, 11],
				[6, 9],
				[6, 10]
			],
			"cops": [
				1,
				9,
				8
			],
			"robbers": [10],
			"exits": [0, 3],
			"par": 9
		},
		{
			"id": 27,
			"chapter": 2,
			"name": "花园捷径",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[0, 7],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[3, 10],
				[4, 5],
				[11, 12],
				[4, 11],
				[5, 6],
				[12, 13],
				[5, 12],
				[6, 0],
				[13, 7],
				[7, 11]
			],
			"cops": [
				3,
				7,
				12
			],
			"robbers": [10],
			"exits": [2, 5],
			"par": 8
		},
		{
			"id": 28,
			"chapter": 2,
			"name": "双亭连道",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[1, 2],
				[7, 8],
				[2, 3],
				[8, 9],
				[2, 8],
				[3, 4],
				[9, 10],
				[3, 9],
				[4, 5],
				[10, 11],
				[5, 0],
				[11, 6],
				[6, 8],
				[6, 10]
			],
			"cops": [
				5,
				9,
				1
			],
			"robbers": [2],
			"exits": [0, 3],
			"par": 8
		},
		{
			"id": 29,
			"chapter": 2,
			"name": "池塘与长廊",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[3, 10],
				[4, 5],
				[11, 12],
				[4, 11],
				[5, 6],
				[12, 13],
				[6, 0],
				[13, 7],
				[6, 13],
				[7, 9]
			],
			"cops": [
				12,
				3,
				2
			],
			"robbers": [8, 13],
			"exits": [4, 0],
			"par": 9
		},
		{
			"id": 30,
			"chapter": 2,
			"name": "树影穿梭",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[3, 10],
				[4, 5],
				[11, 12],
				[4, 11],
				[5, 6],
				[12, 13],
				[5, 12],
				[6, 0],
				[13, 7],
				[7, 9],
				[7, 10],
				[7, 12]
			],
			"cops": [
				3,
				12,
				4
			],
			"robbers": [13, 0],
			"exits": [2, 5],
			"par": 6
		},
		{
			"id": 31,
			"chapter": 2,
			"name": "凉亭换防",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[3, 4],
				[10, 11],
				[4, 5],
				[11, 12],
				[4, 11],
				[5, 6],
				[12, 13],
				[6, 0],
				[13, 7],
				[6, 13],
				[7, 9],
				[7, 10]
			],
			"cops": [
				11,
				13,
				0
			],
			"robbers": [6, 9],
			"exits": [4, 2],
			"par": 9
		},
		{
			"id": 32,
			"chapter": 2,
			"name": "湖心捷径",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 395,
					"y": 205
				},
				{
					"x": 435,
					"y": 300
				},
				{
					"x": 395,
					"y": 395
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 205,
					"y": 395
				},
				{
					"x": 165,
					"y": 300
				},
				{
					"x": 205,
					"y": 205
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[0, 8],
				[1, 2],
				[9, 10],
				[1, 9],
				[2, 3],
				[10, 11],
				[3, 4],
				[11, 12],
				[3, 11],
				[4, 5],
				[12, 13],
				[4, 12],
				[5, 6],
				[13, 14],
				[6, 7],
				[14, 15],
				[7, 0],
				[15, 8],
				[7, 15],
				[8, 10],
				[8, 12],
				[8, 14]
			],
			"cops": [
				7,
				13,
				14
			],
			"robbers": [12, 15],
			"exits": [6, 0],
			"par": 11
		},
		{
			"id": 33,
			"chapter": 2,
			"name": "花圃迷阵",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 395,
					"y": 205
				},
				{
					"x": 435,
					"y": 300
				},
				{
					"x": 395,
					"y": 395
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 205,
					"y": 395
				},
				{
					"x": 165,
					"y": 300
				},
				{
					"x": 205,
					"y": 205
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[1, 2],
				[9, 10],
				[1, 9],
				[2, 3],
				[10, 11],
				[3, 4],
				[11, 12],
				[3, 11],
				[4, 5],
				[12, 13],
				[5, 6],
				[13, 14],
				[6, 7],
				[14, 15],
				[7, 0],
				[15, 8],
				[8, 10],
				[8, 13],
				[8, 14]
			],
			"cops": [
				2,
				3,
				14
			],
			"robbers": [15, 5],
			"exits": [0, 4],
			"par": 11
		},
		{
			"id": 34,
			"chapter": 2,
			"name": "林地环线",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[0, 7],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[4, 5],
				[11, 12],
				[4, 11],
				[5, 6],
				[12, 13],
				[6, 0],
				[13, 7]
			],
			"cops": [
				3,
				13,
				1
			],
			"robbers": [4, 9],
			"exits": [0, 2],
			"par": 8
		},
		{
			"id": 35,
			"chapter": 2,
			"name": "野餐散场",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[0, 7],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[3, 4],
				[10, 11],
				[3, 10],
				[4, 5],
				[11, 12],
				[4, 11],
				[5, 6],
				[12, 13],
				[5, 12],
				[6, 0],
				[13, 7],
				[6, 13],
				[7, 9],
				[7, 10]
			],
			"cops": [
				10,
				8,
				1
			],
			"robbers": [9, 11],
			"exits": [0, 2],
			"par": 9
		},
		{
			"id": 36,
			"chapter": 2,
			"name": "公园闭园",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[0, 7],
				[1, 2],
				[8, 9],
				[2, 3],
				[9, 10],
				[3, 4],
				[10, 11],
				[4, 5],
				[11, 12],
				[5, 6],
				[12, 13],
				[5, 12],
				[6, 0],
				[13, 7],
				[6, 13],
				[7, 10],
				[7, 11]
			],
			"cops": [
				6,
				1,
				11
			],
			"robbers": [3, 13],
			"exits": [5, 0],
			"par": 12
		},
		{
			"id": 37,
			"chapter": 3,
			"name": "两岸多桥",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 395,
					"y": 205
				},
				{
					"x": 435,
					"y": 300
				},
				{
					"x": 395,
					"y": 395
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 205,
					"y": 395
				},
				{
					"x": 165,
					"y": 300
				},
				{
					"x": 205,
					"y": 205
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[1, 2],
				[9, 10],
				[2, 3],
				[10, 11],
				[2, 10],
				[3, 4],
				[11, 12],
				[4, 5],
				[12, 13],
				[4, 12],
				[5, 6],
				[13, 14],
				[5, 13],
				[6, 7],
				[14, 15],
				[6, 14],
				[7, 0],
				[15, 8],
				[8, 11],
				[8, 13]
			],
			"cops": [
				7,
				9,
				6
			],
			"robbers": [11, 8],
			"exits": [0, 4],
			"par": 7
		},
		{
			"id": 38,
			"chapter": 3,
			"name": "仓库后门",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 499,
					"y": 185
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 101,
					"y": 185
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 417,
					"y": 368
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 183,
					"y": 368
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[6, 7],
				[1, 2],
				[7, 8],
				[1, 7],
				[2, 3],
				[8, 9],
				[3, 4],
				[9, 10],
				[4, 5],
				[10, 11],
				[4, 10],
				[5, 0],
				[11, 6],
				[5, 11],
				[6, 8],
				[6, 9],
				[6, 10]
			],
			"cops": [
				5,
				2,
				8
			],
			"robbers": [4, 7],
			"exits": [0, 3],
			"par": 8
		},
		{
			"id": 39,
			"chapter": 3,
			"name": "两岸回廊",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[3, 4],
				[10, 11],
				[3, 10],
				[4, 5],
				[11, 12],
				[5, 6],
				[12, 13],
				[5, 12],
				[6, 0],
				[13, 7],
				[7, 9],
				[7, 10],
				[7, 11],
				[7, 12]
			],
			"cops": [
				3,
				13,
				6
			],
			"robbers": [7, 1],
			"exits": [4, 0],
			"par": 8
		},
		{
			"id": 40,
			"chapter": 3,
			"name": "货箱通道",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[0, 7],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[3, 4],
				[10, 11],
				[4, 5],
				[11, 12],
				[5, 6],
				[12, 13],
				[5, 12],
				[6, 0],
				[13, 7],
				[6, 13],
				[7, 10],
				[7, 11]
			],
			"cops": [
				12,
				1,
				2
			],
			"robbers": [7, 5],
			"exits": [0, 3],
			"par": 11
		},
		{
			"id": 41,
			"chapter": 3,
			"name": "渡口换防",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[0, 7],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[4, 5],
				[11, 12],
				[4, 11],
				[5, 6],
				[12, 13],
				[6, 0],
				[13, 7],
				[6, 13],
				[7, 12]
			],
			"cops": [
				13,
				6,
				1
			],
			"robbers": [7, 4],
			"exits": [2, 5],
			"par": 11
		},
		{
			"id": 42,
			"chapter": 3,
			"name": "双仓连桥",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[4, 5],
				[11, 12],
				[4, 11],
				[5, 6],
				[12, 13],
				[5, 12],
				[6, 0],
				[13, 7],
				[7, 11],
				[7, 12]
			],
			"cops": [
				8,
				5,
				7
			],
			"robbers": [12, 9],
			"exits": [4, 0],
			"par": 8
		},
		{
			"id": 43,
			"chapter": 3,
			"name": "栈桥回环",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[0, 7],
				[1, 2],
				[8, 9],
				[1, 8],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[3, 10],
				[4, 5],
				[11, 12],
				[5, 6],
				[12, 13],
				[6, 0],
				[13, 7],
				[6, 13],
				[7, 10],
				[7, 12]
			],
			"cops": [
				13,
				4,
				7
			],
			"robbers": [0, 12],
			"exits": [5, 2],
			"par": 11
		},
		{
			"id": 44,
			"chapter": 3,
			"name": "码头三岔",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 395,
					"y": 205
				},
				{
					"x": 435,
					"y": 300
				},
				{
					"x": 395,
					"y": 395
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 205,
					"y": 395
				},
				{
					"x": 165,
					"y": 300
				},
				{
					"x": 205,
					"y": 205
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[1, 2],
				[9, 10],
				[1, 9],
				[2, 3],
				[10, 11],
				[3, 4],
				[11, 12],
				[4, 5],
				[12, 13],
				[4, 12],
				[5, 6],
				[13, 14],
				[6, 7],
				[14, 15],
				[7, 0],
				[15, 8],
				[7, 15],
				[8, 10],
				[8, 11],
				[8, 13]
			],
			"cops": [
				8,
				4,
				7
			],
			"robbers": [9, 15],
			"exits": [2, 6],
			"par": 9
		},
		{
			"id": 45,
			"chapter": 3,
			"name": "旧船坞",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[1, 2],
				[8, 9],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[4, 5],
				[11, 12],
				[4, 11],
				[5, 6],
				[12, 13],
				[5, 12],
				[6, 0],
				[13, 7],
				[6, 13],
				[7, 9],
				[7, 11],
				[7, 12]
			],
			"cops": [
				12,
				1,
				10
			],
			"robbers": [7, 2],
			"exits": [4, 0],
			"par": 8
		},
		{
			"id": 46,
			"chapter": 3,
			"name": "货场包围",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 480,
					"y": 157
				},
				{
					"x": 524,
					"y": 351
				},
				{
					"x": 400,
					"y": 507
				},
				{
					"x": 200,
					"y": 507
				},
				{
					"x": 76,
					"y": 351
				},
				{
					"x": 120,
					"y": 157
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 406,
					"y": 216
				},
				{
					"x": 432,
					"y": 330
				},
				{
					"x": 359,
					"y": 422
				},
				{
					"x": 241,
					"y": 422
				},
				{
					"x": 168,
					"y": 330
				},
				{
					"x": 194,
					"y": 216
				}
			],
			"edges": [
				[0, 1],
				[7, 8],
				[0, 7],
				[1, 2],
				[8, 9],
				[2, 3],
				[9, 10],
				[2, 9],
				[3, 4],
				[10, 11],
				[3, 10],
				[4, 5],
				[11, 12],
				[4, 11],
				[5, 6],
				[12, 13],
				[6, 0],
				[13, 7],
				[6, 13],
				[7, 9],
				[7, 10],
				[7, 11]
			],
			"cops": [
				6,
				13,
				10
			],
			"robbers": [0, 8],
			"exits": [2, 5],
			"par": 8
		},
		{
			"id": 47,
			"chapter": 3,
			"name": "夜航之前",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 395,
					"y": 205
				},
				{
					"x": 435,
					"y": 300
				},
				{
					"x": 395,
					"y": 395
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 205,
					"y": 395
				},
				{
					"x": 165,
					"y": 300
				},
				{
					"x": 205,
					"y": 205
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[1, 2],
				[9, 10],
				[1, 9],
				[2, 3],
				[10, 11],
				[2, 10],
				[3, 4],
				[11, 12],
				[4, 5],
				[12, 13],
				[4, 12],
				[5, 6],
				[13, 14],
				[5, 13],
				[6, 7],
				[14, 15],
				[6, 14],
				[7, 0],
				[15, 8],
				[8, 13],
				[8, 14]
			],
			"cops": [
				9,
				5,
				14
			],
			"robbers": [6, 10],
			"exits": [0, 4],
			"par": 12
		},
		{
			"id": 48,
			"chapter": 3,
			"name": "封港行动",
			"tip": "3 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 300,
					"y": 165
				},
				{
					"x": 395,
					"y": 205
				},
				{
					"x": 435,
					"y": 300
				},
				{
					"x": 395,
					"y": 395
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 205,
					"y": 395
				},
				{
					"x": 165,
					"y": 300
				},
				{
					"x": 205,
					"y": 205
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[0, 8],
				[1, 2],
				[9, 10],
				[1, 9],
				[2, 3],
				[10, 11],
				[2, 10],
				[3, 4],
				[11, 12],
				[3, 11],
				[4, 5],
				[12, 13],
				[4, 12],
				[5, 6],
				[13, 14],
				[5, 13],
				[6, 7],
				[14, 15],
				[6, 14],
				[7, 0],
				[15, 8],
				[8, 11],
				[8, 12]
			],
			"cops": [
				4,
				7,
				3
			],
			"robbers": [12, 1],
			"exits": [2, 6],
			"par": 8
		},
		{
			"id": 49,
			"chapter": 4,
			"name": "四路会合",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 448,
					"y": 124
				},
				{
					"x": 527,
					"y": 260
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 379,
					"y": 516
				},
				{
					"x": 221,
					"y": 516
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 73,
					"y": 260
				},
				{
					"x": 152,
					"y": 124
				},
				{
					"x": 254,
					"y": 173
				},
				{
					"x": 346,
					"y": 173
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 433,
					"y": 323
				},
				{
					"x": 387,
					"y": 403
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 213,
					"y": 403
				},
				{
					"x": 167,
					"y": 323
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[2, 3],
				[11, 12],
				[2, 11],
				[2, 12],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[4, 13],
				[5, 6],
				[14, 15],
				[5, 14],
				[6, 7],
				[15, 16],
				[6, 15],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17],
				[9, 11]
			],
			"cops": [
				13,
				3,
				8,
				10
			],
			"robbers": [1, 17],
			"exits": [
				2,
				4,
				5
			],
			"par": 12
		},
		{
			"id": 50,
			"chapter": 4,
			"name": "路口接力",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 248,
					"y": 175
				},
				{
					"x": 352,
					"y": 175
				},
				{
					"x": 425,
					"y": 248
				},
				{
					"x": 425,
					"y": 352
				},
				{
					"x": 352,
					"y": 425
				},
				{
					"x": 248,
					"y": 425
				},
				{
					"x": 175,
					"y": 352
				},
				{
					"x": 175,
					"y": 248
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[0, 8],
				[1, 2],
				[9, 10],
				[1, 9],
				[2, 3],
				[10, 11],
				[2, 10],
				[3, 4],
				[11, 12],
				[3, 11],
				[4, 5],
				[12, 13],
				[4, 12],
				[5, 6],
				[13, 14],
				[5, 13],
				[6, 7],
				[14, 15],
				[6, 14],
				[6, 15],
				[7, 0],
				[15, 8],
				[7, 15],
				[8, 10],
				[8, 11]
			],
			"cops": [
				0,
				14,
				3,
				9
			],
			"robbers": [1, 8],
			"exits": [
				6,
				2,
				4
			],
			"par": 13
		},
		{
			"id": 51,
			"chapter": 4,
			"name": "社区巡逻",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 248,
					"y": 175
				},
				{
					"x": 352,
					"y": 175
				},
				{
					"x": 425,
					"y": 248
				},
				{
					"x": 425,
					"y": 352
				},
				{
					"x": 352,
					"y": 425
				},
				{
					"x": 248,
					"y": 425
				},
				{
					"x": 175,
					"y": 352
				},
				{
					"x": 175,
					"y": 248
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[0, 8],
				[1, 2],
				[9, 10],
				[1, 9],
				[2, 3],
				[10, 11],
				[2, 10],
				[3, 4],
				[11, 12],
				[3, 11],
				[4, 5],
				[12, 13],
				[4, 12],
				[5, 6],
				[13, 14],
				[5, 13],
				[6, 7],
				[14, 15],
				[6, 14],
				[7, 0],
				[15, 8],
				[7, 15],
				[7, 8],
				[8, 10],
				[8, 11]
			],
			"cops": [
				5,
				13,
				7,
				8
			],
			"robbers": [12, 15],
			"exits": [
				6,
				2,
				0
			],
			"par": 11
		},
		{
			"id": 52,
			"chapter": 4,
			"name": "双环夹巷",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 463,
					"y": 137
				},
				{
					"x": 530,
					"y": 300
				},
				{
					"x": 463,
					"y": 463
				},
				{
					"x": 300,
					"y": 530
				},
				{
					"x": 137,
					"y": 463
				},
				{
					"x": 70,
					"y": 300
				},
				{
					"x": 137,
					"y": 137
				},
				{
					"x": 248,
					"y": 175
				},
				{
					"x": 352,
					"y": 175
				},
				{
					"x": 425,
					"y": 248
				},
				{
					"x": 425,
					"y": 352
				},
				{
					"x": 352,
					"y": 425
				},
				{
					"x": 248,
					"y": 425
				},
				{
					"x": 175,
					"y": 352
				},
				{
					"x": 175,
					"y": 248
				}
			],
			"edges": [
				[0, 1],
				[8, 9],
				[0, 8],
				[1, 2],
				[9, 10],
				[1, 9],
				[2, 3],
				[10, 11],
				[2, 10],
				[3, 4],
				[11, 12],
				[3, 11],
				[3, 12],
				[4, 5],
				[12, 13],
				[4, 12],
				[5, 6],
				[13, 14],
				[5, 13],
				[6, 7],
				[14, 15],
				[6, 14],
				[7, 0],
				[15, 8],
				[7, 15],
				[8, 10],
				[8, 11]
			],
			"cops": [
				10,
				5,
				9,
				0
			],
			"robbers": [15, 1],
			"exits": [
				2,
				6,
				4
			],
			"par": 13
		},
		{
			"id": 53,
			"chapter": 4,
			"name": "街心大花园",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 448,
					"y": 124
				},
				{
					"x": 527,
					"y": 260
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 379,
					"y": 516
				},
				{
					"x": 221,
					"y": 516
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 73,
					"y": 260
				},
				{
					"x": 152,
					"y": 124
				},
				{
					"x": 254,
					"y": 173
				},
				{
					"x": 346,
					"y": 173
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 433,
					"y": 323
				},
				{
					"x": 387,
					"y": 403
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 213,
					"y": 403
				},
				{
					"x": 167,
					"y": 323
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[1, 11],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[4, 13],
				[5, 6],
				[14, 15],
				[5, 14],
				[6, 7],
				[15, 16],
				[6, 15],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17],
				[9, 12]
			],
			"cops": [
				11,
				1,
				0,
				13
			],
			"robbers": [2, 10],
			"exits": [
				5,
				7,
				4
			],
			"par": 14
		},
		{
			"id": 54,
			"chapter": 4,
			"name": "穿街过巷",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 448,
					"y": 124
				},
				{
					"x": 527,
					"y": 260
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 379,
					"y": 516
				},
				{
					"x": 221,
					"y": 516
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 73,
					"y": 260
				},
				{
					"x": 152,
					"y": 124
				},
				{
					"x": 254,
					"y": 173
				},
				{
					"x": 346,
					"y": 173
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 433,
					"y": 323
				},
				{
					"x": 387,
					"y": 403
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 213,
					"y": 403
				},
				{
					"x": 167,
					"y": 323
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[4, 13],
				[5, 6],
				[14, 15],
				[5, 14],
				[5, 15],
				[6, 7],
				[15, 16],
				[6, 15],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17],
				[9, 11]
			],
			"cops": [
				12,
				10,
				7,
				3
			],
			"robbers": [17, 1],
			"exits": [
				4,
				2,
				5
			],
			"par": 12
		},
		{
			"id": 55,
			"chapter": 4,
			"name": "广场四角",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 448,
					"y": 124
				},
				{
					"x": 527,
					"y": 260
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 379,
					"y": 516
				},
				{
					"x": 221,
					"y": 516
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 73,
					"y": 260
				},
				{
					"x": 152,
					"y": 124
				},
				{
					"x": 254,
					"y": 173
				},
				{
					"x": 346,
					"y": 173
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 433,
					"y": 323
				},
				{
					"x": 387,
					"y": 403
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 213,
					"y": 403
				},
				{
					"x": 167,
					"y": 323
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[4, 13],
				[4, 14],
				[5, 6],
				[14, 15],
				[5, 14],
				[6, 7],
				[15, 16],
				[6, 15],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17]
			],
			"cops": [
				9,
				2,
				6,
				8
			],
			"robbers": [0, 15],
			"exits": [
				5,
				4,
				7
			],
			"par": 14
		},
		{
			"id": 56,
			"chapter": 4,
			"name": "小队大集合",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 448,
					"y": 124
				},
				{
					"x": 527,
					"y": 260
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 379,
					"y": 516
				},
				{
					"x": 221,
					"y": 516
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 73,
					"y": 260
				},
				{
					"x": 152,
					"y": 124
				},
				{
					"x": 254,
					"y": 173
				},
				{
					"x": 346,
					"y": 173
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 433,
					"y": 323
				},
				{
					"x": 387,
					"y": 403
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 213,
					"y": 403
				},
				{
					"x": 167,
					"y": 323
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[1, 11],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[4, 13],
				[5, 6],
				[14, 15],
				[5, 14],
				[6, 7],
				[15, 16],
				[6, 15],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17],
				[9, 11],
				[9, 12]
			],
			"cops": [
				12,
				3,
				7,
				14
			],
			"robbers": [16, 13],
			"exits": [
				0,
				4,
				2
			],
			"par": 14
		},
		{
			"id": 57,
			"chapter": 4,
			"name": "穿过老城区",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 448,
					"y": 124
				},
				{
					"x": 527,
					"y": 260
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 379,
					"y": 516
				},
				{
					"x": 221,
					"y": 516
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 73,
					"y": 260
				},
				{
					"x": 152,
					"y": 124
				},
				{
					"x": 254,
					"y": 173
				},
				{
					"x": 346,
					"y": 173
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 433,
					"y": 323
				},
				{
					"x": 387,
					"y": 403
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 213,
					"y": 403
				},
				{
					"x": 167,
					"y": 323
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[4, 13],
				[4, 14],
				[5, 6],
				[14, 15],
				[5, 14],
				[6, 7],
				[15, 16],
				[6, 15],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17],
				[9, 12]
			],
			"cops": [
				9,
				6,
				8,
				13
			],
			"robbers": [
				16,
				11,
				2
			],
			"exits": [
				7,
				5,
				4
			],
			"par": 13
		},
		{
			"id": 58,
			"chapter": 4,
			"name": "四路出击",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 448,
					"y": 124
				},
				{
					"x": 527,
					"y": 260
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 379,
					"y": 516
				},
				{
					"x": 221,
					"y": 516
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 73,
					"y": 260
				},
				{
					"x": 152,
					"y": 124
				},
				{
					"x": 254,
					"y": 173
				},
				{
					"x": 346,
					"y": 173
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 433,
					"y": 323
				},
				{
					"x": 387,
					"y": 403
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 213,
					"y": 403
				},
				{
					"x": 167,
					"y": 323
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[4, 13],
				[5, 6],
				[14, 15],
				[5, 14],
				[6, 7],
				[15, 16],
				[6, 15],
				[6, 16],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17]
			],
			"cops": [
				13,
				8,
				14,
				3
			],
			"robbers": [
				12,
				17,
				0
			],
			"exits": [
				5,
				4,
				7
			],
			"par": 11
		},
		{
			"id": 59,
			"chapter": 4,
			"name": "城市晚安",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 448,
					"y": 124
				},
				{
					"x": 527,
					"y": 260
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 379,
					"y": 516
				},
				{
					"x": 221,
					"y": 516
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 73,
					"y": 260
				},
				{
					"x": 152,
					"y": 124
				},
				{
					"x": 254,
					"y": 173
				},
				{
					"x": 346,
					"y": 173
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 433,
					"y": 323
				},
				{
					"x": 387,
					"y": 403
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 213,
					"y": 403
				},
				{
					"x": 167,
					"y": 323
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[1, 11],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[4, 13],
				[5, 6],
				[14, 15],
				[5, 14],
				[6, 7],
				[15, 16],
				[6, 15],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17],
				[9, 11]
			],
			"cops": [
				3,
				6,
				8,
				12
			],
			"robbers": [
				11,
				14,
				2
			],
			"exits": [
				4,
				7,
				5
			],
			"par": 11
		},
		{
			"id": 60,
			"chapter": 4,
			"name": "最后的围捕",
			"tip": "4 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。",
			"nodes": [
				{
					"x": 300,
					"y": 70
				},
				{
					"x": 448,
					"y": 124
				},
				{
					"x": 527,
					"y": 260
				},
				{
					"x": 499,
					"y": 415
				},
				{
					"x": 379,
					"y": 516
				},
				{
					"x": 221,
					"y": 516
				},
				{
					"x": 101,
					"y": 415
				},
				{
					"x": 73,
					"y": 260
				},
				{
					"x": 152,
					"y": 124
				},
				{
					"x": 254,
					"y": 173
				},
				{
					"x": 346,
					"y": 173
				},
				{
					"x": 417,
					"y": 233
				},
				{
					"x": 433,
					"y": 323
				},
				{
					"x": 387,
					"y": 403
				},
				{
					"x": 300,
					"y": 435
				},
				{
					"x": 213,
					"y": 403
				},
				{
					"x": 167,
					"y": 323
				},
				{
					"x": 183,
					"y": 233
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[4, 13],
				[4, 14],
				[5, 6],
				[14, 15],
				[5, 14],
				[6, 7],
				[15, 16],
				[6, 15],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17],
				[9, 11]
			],
			"cops": [
				17,
				0,
				13,
				6
			],
			"robbers": [
				15,
				2,
				12
			],
			"exits": [
				4,
				5,
				7
			],
			"par": 13
		},
		{
			"id": 61,
			"chapter": 5,
			"name": "立体环街 1",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[7, 8],
				[17, 18],
				[8, 9],
				[18, 19],
				[9, 0],
				[19, 10],
				[10, 17]
			],
			"cops": [
				6,
				19,
				18
			],
			"robbers": [16, 9],
			"exits": [2, 7],
			"par": 14
		},
		{
			"id": 62,
			"chapter": 5,
			"name": "立体环街 2",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[7, 8],
				[17, 18],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10],
				[9, 19]
			],
			"cops": [
				8,
				1,
				11
			],
			"robbers": [6, 19],
			"exits": [2, 7],
			"par": 9
		},
		{
			"id": 63,
			"chapter": 5,
			"name": "立体环街 3",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[1, 2],
				[11, 12],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[7, 8],
				[17, 18],
				[7, 17],
				[8, 9],
				[18, 19],
				[9, 0],
				[19, 10]
			],
			"cops": [
				17,
				4,
				15
			],
			"robbers": [10, 9],
			"exits": [3, 7],
			"par": 8
		},
		{
			"id": 64,
			"chapter": 5,
			"name": "立体环街 4",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[6, 7],
				[16, 17],
				[6, 16],
				[7, 8],
				[17, 18],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10]
			],
			"cops": [
				14,
				3,
				18
			],
			"robbers": [15, 9],
			"exits": [7, 2],
			"par": 12
		},
		{
			"id": 65,
			"chapter": 5,
			"name": "立体环街 5",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 451,
					"y": 120
				},
				{
					"x": 531,
					"y": 259
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 380,
					"y": 521
				},
				{
					"x": 220,
					"y": 521
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 69,
					"y": 259
				},
				{
					"x": 149,
					"y": 120
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 390,
					"y": 193
				},
				{
					"x": 438,
					"y": 276
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 348,
					"y": 432
				},
				{
					"x": 252,
					"y": 432
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 162,
					"y": 276
				},
				{
					"x": 210,
					"y": 193
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[5, 6],
				[14, 15],
				[5, 14],
				[6, 7],
				[15, 16],
				[6, 15],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17],
				[9, 16]
			],
			"cops": [
				13,
				14,
				1
			],
			"robbers": [17, 4],
			"exits": [6, 0],
			"par": 14
		},
		{
			"id": 66,
			"chapter": 5,
			"name": "立体环街 6",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[7, 8],
				[17, 18],
				[7, 17],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10],
				[9, 19],
				[10, 18]
			],
			"cops": [
				18,
				13,
				10
			],
			"robbers": [9, 16],
			"exits": [8, 3],
			"par": 15
		},
		{
			"id": 67,
			"chapter": 5,
			"name": "立体环街 7",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 451,
					"y": 120
				},
				{
					"x": 531,
					"y": 259
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 380,
					"y": 521
				},
				{
					"x": 220,
					"y": 521
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 69,
					"y": 259
				},
				{
					"x": 149,
					"y": 120
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 390,
					"y": 193
				},
				{
					"x": 438,
					"y": 276
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 348,
					"y": 432
				},
				{
					"x": 252,
					"y": 432
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 162,
					"y": 276
				},
				{
					"x": 210,
					"y": 193
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[5, 6],
				[14, 15],
				[5, 14],
				[6, 7],
				[15, 16],
				[7, 8],
				[16, 17],
				[7, 16],
				[8, 0],
				[17, 9],
				[8, 17],
				[9, 11],
				[9, 15]
			],
			"cops": [
				12,
				3,
				7
			],
			"robbers": [5, 10],
			"exits": [0, 2],
			"par": 13
		},
		{
			"id": 68,
			"chapter": 5,
			"name": "立体环街 8",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[6, 7],
				[16, 17],
				[6, 16],
				[7, 8],
				[17, 18],
				[7, 17],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10],
				[9, 19],
				[10, 12],
				[10, 13]
			],
			"cops": [
				11,
				10,
				17
			],
			"robbers": [7, 5],
			"exits": [0, 2],
			"par": 10
		},
		{
			"id": 69,
			"chapter": 5,
			"name": "立体环街 9",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[6, 16],
				[7, 8],
				[17, 18],
				[7, 17],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10],
				[10, 15],
				[10, 16],
				[10, 17]
			],
			"cops": [
				12,
				1,
				6
			],
			"robbers": [8, 4],
			"exits": [5, 0],
			"par": 12
		},
		{
			"id": 70,
			"chapter": 5,
			"name": "立体环街 10",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[7, 8],
				[17, 18],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10],
				[9, 19],
				[10, 15],
				[10, 18]
			],
			"cops": [
				10,
				4,
				3
			],
			"robbers": [17, 15],
			"exits": [8, 7],
			"par": 19
		},
		{
			"id": 71,
			"chapter": 5,
			"name": "立体环街 11",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 451,
					"y": 120
				},
				{
					"x": 531,
					"y": 259
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 380,
					"y": 521
				},
				{
					"x": 220,
					"y": 521
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 69,
					"y": 259
				},
				{
					"x": 149,
					"y": 120
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 390,
					"y": 193
				},
				{
					"x": 438,
					"y": 276
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 348,
					"y": 432
				},
				{
					"x": 252,
					"y": 432
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 162,
					"y": 276
				},
				{
					"x": 210,
					"y": 193
				}
			],
			"edges": [
				[0, 1],
				[9, 10],
				[0, 9],
				[1, 2],
				[10, 11],
				[1, 10],
				[2, 3],
				[11, 12],
				[2, 11],
				[3, 4],
				[12, 13],
				[3, 12],
				[4, 5],
				[13, 14],
				[5, 6],
				[14, 15],
				[6, 7],
				[15, 16],
				[7, 8],
				[16, 17],
				[8, 0],
				[17, 9],
				[9, 13],
				[9, 15]
			],
			"cops": [
				14,
				1,
				4
			],
			"robbers": [5, 15],
			"exits": [0, 2],
			"par": 14
		},
		{
			"id": 72,
			"chapter": 5,
			"name": "立体环街 12",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[4, 5],
				[14, 15],
				[5, 6],
				[15, 16],
				[6, 7],
				[16, 17],
				[7, 8],
				[17, 18],
				[7, 17],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10],
				[9, 19],
				[10, 16],
				[10, 17]
			],
			"cops": [
				16,
				13,
				1
			],
			"robbers": [5, 11],
			"exits": [7, 8],
			"par": 18
		},
		{
			"id": 73,
			"chapter": 5,
			"name": "立体环街 13",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[3, 4],
				[13, 14],
				[4, 5],
				[14, 15],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[6, 16],
				[7, 8],
				[17, 18],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10],
				[10, 16],
				[10, 17]
			],
			"cops": [
				17,
				12,
				7
			],
			"robbers": [14, 8],
			"exits": [3, 2],
			"par": 17
		},
		{
			"id": 74,
			"chapter": 5,
			"name": "立体环街 14",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[6, 7],
				[16, 17],
				[6, 16],
				[7, 8],
				[17, 18],
				[8, 9],
				[18, 19],
				[9, 0],
				[19, 10],
				[10, 15],
				[10, 18]
			],
			"cops": [
				6,
				19,
				10
			],
			"robbers": [9, 0],
			"exits": [3, 5],
			"par": 14
		},
		{
			"id": 75,
			"chapter": 5,
			"name": "立体环街 15",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[0, 11],
				[1, 2],
				[12, 13],
				[1, 12],
				[2, 3],
				[13, 14],
				[2, 13],
				[3, 4],
				[14, 15],
				[3, 14],
				[4, 5],
				[15, 16],
				[4, 15],
				[5, 6],
				[16, 17],
				[6, 7],
				[17, 18],
				[6, 17],
				[7, 8],
				[18, 19],
				[7, 18],
				[8, 9],
				[19, 20],
				[8, 19],
				[9, 10],
				[20, 21],
				[10, 0],
				[21, 11],
				[10, 21],
				[11, 15]
			],
			"cops": [
				9,
				5,
				0
			],
			"robbers": [18, 21],
			"exits": [6, 8],
			"par": 13
		},
		{
			"id": 76,
			"chapter": 5,
			"name": "立体环街 16",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[6, 7],
				[16, 17],
				[6, 16],
				[7, 8],
				[17, 18],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10],
				[9, 19],
				[10, 12]
			],
			"cops": [
				8,
				17,
				10
			],
			"robbers": [19, 14],
			"exits": [2, 0],
			"par": 20
		},
		{
			"id": 77,
			"chapter": 5,
			"name": "立体环街 17",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[1, 2],
				[12, 13],
				[2, 3],
				[13, 14],
				[2, 13],
				[3, 4],
				[14, 15],
				[3, 14],
				[4, 5],
				[15, 16],
				[4, 15],
				[5, 6],
				[16, 17],
				[5, 16],
				[6, 7],
				[17, 18],
				[6, 17],
				[7, 8],
				[18, 19],
				[7, 18],
				[8, 9],
				[19, 20],
				[8, 19],
				[9, 10],
				[20, 21],
				[10, 0],
				[21, 11],
				[10, 21],
				[11, 14],
				[11, 16],
				[11, 20]
			],
			"cops": [
				15,
				11,
				18
			],
			"robbers": [21, 3],
			"exits": [8, 6],
			"par": 16
		},
		{
			"id": 78,
			"chapter": 5,
			"name": "立体环街 18",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[6, 16],
				[7, 8],
				[17, 18],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10],
				[10, 17]
			],
			"cops": [
				19,
				6,
				14
			],
			"robbers": [15, 11],
			"exits": [5, 3],
			"par": 16
		},
		{
			"id": 79,
			"chapter": 5,
			"name": "立体环街 19",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[0, 11],
				[1, 2],
				[12, 13],
				[1, 12],
				[2, 3],
				[13, 14],
				[3, 4],
				[14, 15],
				[3, 14],
				[4, 5],
				[15, 16],
				[4, 15],
				[5, 6],
				[16, 17],
				[5, 16],
				[6, 7],
				[17, 18],
				[6, 17],
				[7, 8],
				[18, 19],
				[7, 18],
				[8, 9],
				[19, 20],
				[8, 19],
				[9, 10],
				[20, 21],
				[9, 20],
				[10, 0],
				[21, 11],
				[11, 19]
			],
			"cops": [
				16,
				17,
				9
			],
			"robbers": [10, 6],
			"exits": [3, 5],
			"par": 14
		},
		{
			"id": 80,
			"chapter": 5,
			"name": "立体环街 20",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[0, 11],
				[1, 2],
				[12, 13],
				[1, 12],
				[2, 3],
				[13, 14],
				[2, 13],
				[3, 4],
				[14, 15],
				[3, 14],
				[4, 5],
				[15, 16],
				[5, 6],
				[16, 17],
				[6, 7],
				[17, 18],
				[7, 8],
				[18, 19],
				[7, 18],
				[8, 9],
				[19, 20],
				[8, 19],
				[9, 10],
				[20, 21],
				[9, 20],
				[10, 0],
				[21, 11]
			],
			"cops": [
				5,
				10,
				18
			],
			"robbers": [21, 8],
			"exits": [2, 0],
			"par": 18
		},
		{
			"id": 81,
			"chapter": 6,
			"name": "终极迷城 1",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[7, 8],
				[17, 18],
				[7, 17],
				[8, 9],
				[18, 19],
				[8, 18],
				[9, 0],
				[19, 10]
			],
			"cops": [
				11,
				1,
				6
			],
			"robbers": [
				12,
				13,
				7
			],
			"exits": [2, 0],
			"par": 17
		},
		{
			"id": 82,
			"chapter": 6,
			"name": "终极迷城 2",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[0, 11],
				[1, 2],
				[12, 13],
				[2, 3],
				[13, 14],
				[3, 4],
				[14, 15],
				[4, 5],
				[15, 16],
				[5, 6],
				[16, 17],
				[5, 16],
				[6, 7],
				[17, 18],
				[6, 17],
				[7, 8],
				[18, 19],
				[7, 18],
				[8, 9],
				[19, 20],
				[8, 19],
				[9, 10],
				[20, 21],
				[9, 20],
				[10, 0],
				[21, 11],
				[10, 21],
				[11, 19]
			],
			"cops": [
				15,
				0,
				8
			],
			"robbers": [
				13,
				12,
				6
			],
			"exits": [3, 2],
			"par": 22
		},
		{
			"id": 83,
			"chapter": 6,
			"name": "终极迷城 3",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[1, 2],
				[11, 12],
				[2, 3],
				[12, 13],
				[3, 4],
				[13, 14],
				[3, 13],
				[4, 5],
				[14, 15],
				[4, 14],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[6, 16],
				[7, 8],
				[17, 18],
				[7, 17],
				[8, 9],
				[18, 19],
				[9, 0],
				[19, 10],
				[9, 19],
				[10, 17]
			],
			"cops": [
				6,
				10,
				1
			],
			"robbers": [
				17,
				0,
				14
			],
			"exits": [2, 3],
			"par": 16
		},
		{
			"id": 84,
			"chapter": 6,
			"name": "终极迷城 4",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[0, 11],
				[1, 2],
				[12, 13],
				[1, 12],
				[2, 3],
				[13, 14],
				[2, 13],
				[3, 4],
				[14, 15],
				[3, 14],
				[4, 5],
				[15, 16],
				[4, 15],
				[5, 6],
				[16, 17],
				[6, 7],
				[17, 18],
				[6, 17],
				[7, 8],
				[18, 19],
				[7, 18],
				[8, 9],
				[19, 20],
				[9, 10],
				[20, 21],
				[9, 20],
				[10, 0],
				[21, 11],
				[11, 14]
			],
			"cops": [
				7,
				21,
				4
			],
			"robbers": [
				6,
				12,
				20
			],
			"exits": [0, 3],
			"par": 19
		},
		{
			"id": 85,
			"chapter": 6,
			"name": "终极迷城 5",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 438,
					"y": 110
				},
				{
					"x": 523,
					"y": 227
				},
				{
					"x": 523,
					"y": 373
				},
				{
					"x": 438,
					"y": 490
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 162,
					"y": 490
				},
				{
					"x": 77,
					"y": 373
				},
				{
					"x": 77,
					"y": 227
				},
				{
					"x": 162,
					"y": 110
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 382,
					"y": 187
				},
				{
					"x": 433,
					"y": 257
				},
				{
					"x": 433,
					"y": 343
				},
				{
					"x": 382,
					"y": 413
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 218,
					"y": 413
				},
				{
					"x": 167,
					"y": 343
				},
				{
					"x": 167,
					"y": 257
				},
				{
					"x": 218,
					"y": 187
				}
			],
			"edges": [
				[0, 1],
				[10, 11],
				[0, 10],
				[1, 2],
				[11, 12],
				[1, 11],
				[2, 3],
				[12, 13],
				[2, 12],
				[3, 4],
				[13, 14],
				[4, 5],
				[14, 15],
				[5, 6],
				[15, 16],
				[5, 15],
				[6, 7],
				[16, 17],
				[6, 16],
				[7, 8],
				[17, 18],
				[7, 17],
				[8, 9],
				[18, 19],
				[9, 0],
				[19, 10],
				[9, 19],
				[10, 12],
				[10, 14]
			],
			"cops": [
				13,
				12,
				19
			],
			"robbers": [
				15,
				5,
				8
			],
			"exits": [0, 2],
			"par": 11
		},
		{
			"id": 86,
			"chapter": 6,
			"name": "终极迷城 6",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[0, 11],
				[1, 2],
				[12, 13],
				[1, 12],
				[2, 3],
				[13, 14],
				[2, 13],
				[3, 4],
				[14, 15],
				[4, 5],
				[15, 16],
				[5, 6],
				[16, 17],
				[5, 16],
				[6, 7],
				[17, 18],
				[6, 17],
				[7, 8],
				[18, 19],
				[8, 9],
				[19, 20],
				[8, 19],
				[9, 10],
				[20, 21],
				[10, 0],
				[21, 11],
				[11, 13],
				[11, 14],
				[11, 18],
				[11, 20]
			],
			"cops": [
				0,
				15,
				9
			],
			"robbers": [
				21,
				7,
				11
			],
			"exits": [3, 2],
			"par": 14
		},
		{
			"id": 87,
			"chapter": 6,
			"name": "终极迷城 7",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[0, 11],
				[1, 2],
				[12, 13],
				[1, 12],
				[2, 3],
				[13, 14],
				[2, 13],
				[3, 4],
				[14, 15],
				[3, 14],
				[4, 5],
				[15, 16],
				[4, 15],
				[5, 6],
				[16, 17],
				[5, 16],
				[6, 7],
				[17, 18],
				[7, 8],
				[18, 19],
				[7, 18],
				[8, 9],
				[19, 20],
				[8, 19],
				[9, 10],
				[20, 21],
				[10, 0],
				[21, 11],
				[11, 17],
				[11, 18]
			],
			"cops": [
				13,
				15,
				12
			],
			"robbers": [
				1,
				9,
				20
			],
			"exits": [6, 5],
			"par": 18
		},
		{
			"id": 88,
			"chapter": 6,
			"name": "终极迷城 8",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[0, 11],
				[1, 2],
				[12, 13],
				[2, 3],
				[13, 14],
				[2, 13],
				[3, 4],
				[14, 15],
				[3, 14],
				[4, 5],
				[15, 16],
				[5, 6],
				[16, 17],
				[6, 7],
				[17, 18],
				[6, 17],
				[7, 8],
				[18, 19],
				[7, 18],
				[8, 9],
				[19, 20],
				[8, 19],
				[9, 10],
				[20, 21],
				[9, 20],
				[10, 0],
				[21, 11],
				[10, 21]
			],
			"cops": [
				17,
				14,
				2
			],
			"robbers": [
				3,
				18,
				10
			],
			"exits": [5, 6],
			"par": 15
		},
		{
			"id": 89,
			"chapter": 6,
			"name": "终极迷城 9",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[0, 11],
				[1, 2],
				[12, 13],
				[2, 3],
				[13, 14],
				[3, 4],
				[14, 15],
				[3, 14],
				[4, 5],
				[15, 16],
				[4, 15],
				[5, 6],
				[16, 17],
				[6, 7],
				[17, 18],
				[7, 8],
				[18, 19],
				[8, 9],
				[19, 20],
				[8, 19],
				[9, 10],
				[20, 21],
				[9, 20],
				[10, 0],
				[21, 11],
				[10, 21],
				[11, 20]
			],
			"cops": [
				10,
				5,
				16
			],
			"robbers": [
				15,
				14,
				1
			],
			"exits": [0, 9],
			"par": 14
		},
		{
			"id": 90,
			"chapter": 6,
			"name": "终极迷城 10",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 418,
					"y": 96
				},
				{
					"x": 504,
					"y": 183
				},
				{
					"x": 535,
					"y": 300
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 418,
					"y": 504
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 183,
					"y": 504
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 65,
					"y": 300
				},
				{
					"x": 96,
					"y": 182
				},
				{
					"x": 182,
					"y": 96
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 370,
					"y": 179
				},
				{
					"x": 421,
					"y": 230
				},
				{
					"x": 440,
					"y": 300
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 370,
					"y": 421
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 230,
					"y": 421
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 160,
					"y": 300
				},
				{
					"x": 179,
					"y": 230
				},
				{
					"x": 230,
					"y": 179
				}
			],
			"edges": [
				[0, 1],
				[12, 13],
				[1, 2],
				[13, 14],
				[2, 3],
				[14, 15],
				[3, 4],
				[15, 16],
				[4, 5],
				[16, 17],
				[4, 16],
				[5, 6],
				[17, 18],
				[5, 17],
				[6, 7],
				[18, 19],
				[6, 18],
				[7, 8],
				[19, 20],
				[7, 19],
				[8, 9],
				[20, 21],
				[9, 10],
				[21, 22],
				[9, 21],
				[10, 11],
				[22, 23],
				[10, 22],
				[11, 0],
				[23, 12],
				[11, 23],
				[12, 18],
				[12, 19],
				[12, 20],
				[12, 22]
			],
			"cops": [
				6,
				12,
				7
			],
			"robbers": [
				13,
				16,
				19
			],
			"exits": [5, 11],
			"par": 13
		},
		{
			"id": 91,
			"chapter": 6,
			"name": "终极迷城 11",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[1, 2],
				[12, 13],
				[1, 12],
				[2, 3],
				[13, 14],
				[2, 13],
				[3, 4],
				[14, 15],
				[3, 14],
				[4, 5],
				[15, 16],
				[4, 15],
				[5, 6],
				[16, 17],
				[6, 7],
				[17, 18],
				[6, 17],
				[7, 8],
				[18, 19],
				[7, 18],
				[8, 9],
				[19, 20],
				[8, 19],
				[9, 10],
				[20, 21],
				[9, 20],
				[10, 0],
				[21, 11]
			],
			"cops": [
				3,
				4,
				21
			],
			"robbers": [
				12,
				0,
				11
			],
			"exits": [8, 6],
			"par": 13
		},
		{
			"id": 92,
			"chapter": 6,
			"name": "终极迷城 12",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[1, 2],
				[12, 13],
				[2, 3],
				[13, 14],
				[3, 4],
				[14, 15],
				[4, 5],
				[15, 16],
				[4, 15],
				[5, 6],
				[16, 17],
				[5, 16],
				[6, 7],
				[17, 18],
				[6, 17],
				[7, 8],
				[18, 19],
				[8, 9],
				[19, 20],
				[9, 10],
				[20, 21],
				[10, 0],
				[21, 11],
				[10, 21],
				[11, 18],
				[11, 19]
			],
			"cops": [
				11,
				4,
				14
			],
			"robbers": [
				6,
				18,
				19
			],
			"exits": [0, 9],
			"par": 15
		},
		{
			"id": 93,
			"chapter": 6,
			"name": "终极迷城 13",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 418,
					"y": 96
				},
				{
					"x": 504,
					"y": 183
				},
				{
					"x": 535,
					"y": 300
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 418,
					"y": 504
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 183,
					"y": 504
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 65,
					"y": 300
				},
				{
					"x": 96,
					"y": 182
				},
				{
					"x": 182,
					"y": 96
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 370,
					"y": 179
				},
				{
					"x": 421,
					"y": 230
				},
				{
					"x": 440,
					"y": 300
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 370,
					"y": 421
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 230,
					"y": 421
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 160,
					"y": 300
				},
				{
					"x": 179,
					"y": 230
				},
				{
					"x": 230,
					"y": 179
				}
			],
			"edges": [
				[0, 1],
				[12, 13],
				[1, 2],
				[13, 14],
				[2, 3],
				[14, 15],
				[3, 4],
				[15, 16],
				[4, 5],
				[16, 17],
				[5, 6],
				[17, 18],
				[6, 7],
				[18, 19],
				[7, 8],
				[19, 20],
				[7, 19],
				[8, 9],
				[20, 21],
				[8, 20],
				[9, 10],
				[21, 22],
				[9, 21],
				[10, 11],
				[22, 23],
				[10, 22],
				[11, 0],
				[23, 12],
				[11, 23],
				[12, 14],
				[12, 17],
				[12, 21]
			],
			"cops": [
				8,
				23,
				19
			],
			"robbers": [
				5,
				4,
				10
			],
			"exits": [0, 1],
			"par": 19
		},
		{
			"id": 94,
			"chapter": 6,
			"name": "终极迷城 14",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 418,
					"y": 96
				},
				{
					"x": 504,
					"y": 183
				},
				{
					"x": 535,
					"y": 300
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 418,
					"y": 504
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 183,
					"y": 504
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 65,
					"y": 300
				},
				{
					"x": 96,
					"y": 182
				},
				{
					"x": 182,
					"y": 96
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 370,
					"y": 179
				},
				{
					"x": 421,
					"y": 230
				},
				{
					"x": 440,
					"y": 300
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 370,
					"y": 421
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 230,
					"y": 421
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 160,
					"y": 300
				},
				{
					"x": 179,
					"y": 230
				},
				{
					"x": 230,
					"y": 179
				}
			],
			"edges": [
				[0, 1],
				[12, 13],
				[0, 12],
				[1, 2],
				[13, 14],
				[1, 13],
				[2, 3],
				[14, 15],
				[3, 4],
				[15, 16],
				[3, 15],
				[4, 5],
				[16, 17],
				[4, 16],
				[5, 6],
				[17, 18],
				[6, 7],
				[18, 19],
				[7, 8],
				[19, 20],
				[8, 9],
				[20, 21],
				[8, 20],
				[9, 10],
				[21, 22],
				[10, 11],
				[22, 23],
				[11, 0],
				[23, 12],
				[12, 20],
				[12, 22]
			],
			"cops": [
				3,
				7,
				11
			],
			"robbers": [
				15,
				14,
				18
			],
			"exits": [0, 1],
			"par": 12
		},
		{
			"id": 95,
			"chapter": 6,
			"name": "终极迷城 15",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 418,
					"y": 96
				},
				{
					"x": 504,
					"y": 183
				},
				{
					"x": 535,
					"y": 300
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 418,
					"y": 504
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 183,
					"y": 504
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 65,
					"y": 300
				},
				{
					"x": 96,
					"y": 182
				},
				{
					"x": 182,
					"y": 96
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 370,
					"y": 179
				},
				{
					"x": 421,
					"y": 230
				},
				{
					"x": 440,
					"y": 300
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 370,
					"y": 421
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 230,
					"y": 421
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 160,
					"y": 300
				},
				{
					"x": 179,
					"y": 230
				},
				{
					"x": 230,
					"y": 179
				}
			],
			"edges": [
				[0, 1],
				[12, 13],
				[1, 2],
				[13, 14],
				[2, 3],
				[14, 15],
				[2, 14],
				[3, 4],
				[15, 16],
				[3, 15],
				[4, 5],
				[16, 17],
				[4, 16],
				[5, 6],
				[17, 18],
				[5, 17],
				[6, 7],
				[18, 19],
				[7, 8],
				[19, 20],
				[7, 19],
				[8, 9],
				[20, 21],
				[8, 20],
				[9, 10],
				[21, 22],
				[10, 11],
				[22, 23],
				[11, 0],
				[23, 12],
				[12, 19],
				[12, 20]
			],
			"cops": [
				0,
				19,
				12
			],
			"robbers": [
				9,
				13,
				21
			],
			"exits": [2, 1],
			"par": 15
		},
		{
			"id": 96,
			"chapter": 6,
			"name": "终极迷城 16",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 418,
					"y": 96
				},
				{
					"x": 504,
					"y": 183
				},
				{
					"x": 535,
					"y": 300
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 418,
					"y": 504
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 183,
					"y": 504
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 65,
					"y": 300
				},
				{
					"x": 96,
					"y": 182
				},
				{
					"x": 182,
					"y": 96
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 370,
					"y": 179
				},
				{
					"x": 421,
					"y": 230
				},
				{
					"x": 440,
					"y": 300
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 370,
					"y": 421
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 230,
					"y": 421
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 160,
					"y": 300
				},
				{
					"x": 179,
					"y": 230
				},
				{
					"x": 230,
					"y": 179
				}
			],
			"edges": [
				[0, 1],
				[12, 13],
				[0, 12],
				[1, 2],
				[13, 14],
				[1, 13],
				[2, 3],
				[14, 15],
				[3, 4],
				[15, 16],
				[4, 5],
				[16, 17],
				[5, 6],
				[17, 18],
				[6, 7],
				[18, 19],
				[7, 8],
				[19, 20],
				[7, 19],
				[8, 9],
				[20, 21],
				[8, 20],
				[9, 10],
				[21, 22],
				[10, 11],
				[22, 23],
				[10, 22],
				[11, 0],
				[23, 12],
				[11, 23],
				[12, 14],
				[12, 15],
				[12, 21]
			],
			"cops": [
				22,
				9,
				14
			],
			"robbers": [
				17,
				7,
				8
			],
			"exits": [2, 1],
			"par": 13
		},
		{
			"id": 97,
			"chapter": 6,
			"name": "终极迷城 17",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 418,
					"y": 96
				},
				{
					"x": 504,
					"y": 183
				},
				{
					"x": 535,
					"y": 300
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 418,
					"y": 504
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 183,
					"y": 504
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 65,
					"y": 300
				},
				{
					"x": 96,
					"y": 182
				},
				{
					"x": 182,
					"y": 96
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 370,
					"y": 179
				},
				{
					"x": 421,
					"y": 230
				},
				{
					"x": 440,
					"y": 300
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 370,
					"y": 421
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 230,
					"y": 421
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 160,
					"y": 300
				},
				{
					"x": 179,
					"y": 230
				},
				{
					"x": 230,
					"y": 179
				}
			],
			"edges": [
				[0, 1],
				[12, 13],
				[0, 12],
				[1, 2],
				[13, 14],
				[1, 13],
				[2, 3],
				[14, 15],
				[2, 14],
				[3, 4],
				[15, 16],
				[3, 15],
				[4, 5],
				[16, 17],
				[4, 16],
				[5, 6],
				[17, 18],
				[6, 7],
				[18, 19],
				[6, 18],
				[7, 8],
				[19, 20],
				[8, 9],
				[20, 21],
				[8, 20],
				[9, 10],
				[21, 22],
				[10, 11],
				[22, 23],
				[11, 0],
				[23, 12],
				[11, 23],
				[12, 21]
			],
			"cops": [
				6,
				23,
				19
			],
			"robbers": [
				3,
				0,
				14
			],
			"exits": [9, 5],
			"par": 12
		},
		{
			"id": 98,
			"chapter": 6,
			"name": "终极迷城 18",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 427,
					"y": 102
				},
				{
					"x": 514,
					"y": 202
				},
				{
					"x": 533,
					"y": 333
				},
				{
					"x": 478,
					"y": 454
				},
				{
					"x": 366,
					"y": 525
				},
				{
					"x": 234,
					"y": 525
				},
				{
					"x": 122,
					"y": 454
				},
				{
					"x": 67,
					"y": 333
				},
				{
					"x": 86,
					"y": 202
				},
				{
					"x": 173,
					"y": 102
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 376,
					"y": 182
				},
				{
					"x": 427,
					"y": 242
				},
				{
					"x": 439,
					"y": 320
				},
				{
					"x": 406,
					"y": 392
				},
				{
					"x": 339,
					"y": 434
				},
				{
					"x": 261,
					"y": 434
				},
				{
					"x": 194,
					"y": 392
				},
				{
					"x": 161,
					"y": 320
				},
				{
					"x": 173,
					"y": 242
				},
				{
					"x": 224,
					"y": 182
				}
			],
			"edges": [
				[0, 1],
				[11, 12],
				[0, 11],
				[1, 2],
				[12, 13],
				[1, 12],
				[2, 3],
				[13, 14],
				[2, 13],
				[3, 4],
				[14, 15],
				[4, 5],
				[15, 16],
				[4, 15],
				[5, 6],
				[16, 17],
				[5, 16],
				[6, 7],
				[17, 18],
				[6, 17],
				[7, 8],
				[18, 19],
				[7, 18],
				[8, 9],
				[19, 20],
				[9, 10],
				[20, 21],
				[9, 20],
				[10, 0],
				[21, 11]
			],
			"cops": [
				12,
				10,
				19
			],
			"robbers": [
				4,
				9,
				15
			],
			"exits": [0, 2],
			"par": 15
		},
		{
			"id": 99,
			"chapter": 6,
			"name": "终极迷城 19",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 418,
					"y": 96
				},
				{
					"x": 504,
					"y": 183
				},
				{
					"x": 535,
					"y": 300
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 418,
					"y": 504
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 183,
					"y": 504
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 65,
					"y": 300
				},
				{
					"x": 96,
					"y": 182
				},
				{
					"x": 182,
					"y": 96
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 370,
					"y": 179
				},
				{
					"x": 421,
					"y": 230
				},
				{
					"x": 440,
					"y": 300
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 370,
					"y": 421
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 230,
					"y": 421
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 160,
					"y": 300
				},
				{
					"x": 179,
					"y": 230
				},
				{
					"x": 230,
					"y": 179
				}
			],
			"edges": [
				[0, 1],
				[12, 13],
				[0, 12],
				[1, 2],
				[13, 14],
				[1, 13],
				[2, 3],
				[14, 15],
				[2, 14],
				[3, 4],
				[15, 16],
				[3, 15],
				[4, 5],
				[16, 17],
				[4, 16],
				[5, 6],
				[17, 18],
				[5, 17],
				[6, 7],
				[18, 19],
				[6, 18],
				[7, 8],
				[19, 20],
				[7, 19],
				[8, 9],
				[20, 21],
				[9, 10],
				[21, 22],
				[9, 21],
				[10, 11],
				[22, 23],
				[11, 0],
				[23, 12],
				[12, 17],
				[12, 21]
			],
			"cops": [
				11,
				13,
				1
			],
			"robbers": [
				3,
				20,
				17
			],
			"exits": [10, 9],
			"par": 25
		},
		{
			"id": 100,
			"chapter": 6,
			"name": "终极迷城 20",
			"tip": "多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。",
			"nodes": [
				{
					"x": 300,
					"y": 65
				},
				{
					"x": 418,
					"y": 96
				},
				{
					"x": 504,
					"y": 183
				},
				{
					"x": 535,
					"y": 300
				},
				{
					"x": 504,
					"y": 417
				},
				{
					"x": 418,
					"y": 504
				},
				{
					"x": 300,
					"y": 535
				},
				{
					"x": 183,
					"y": 504
				},
				{
					"x": 96,
					"y": 418
				},
				{
					"x": 65,
					"y": 300
				},
				{
					"x": 96,
					"y": 182
				},
				{
					"x": 182,
					"y": 96
				},
				{
					"x": 300,
					"y": 160
				},
				{
					"x": 370,
					"y": 179
				},
				{
					"x": 421,
					"y": 230
				},
				{
					"x": 440,
					"y": 300
				},
				{
					"x": 421,
					"y": 370
				},
				{
					"x": 370,
					"y": 421
				},
				{
					"x": 300,
					"y": 440
				},
				{
					"x": 230,
					"y": 421
				},
				{
					"x": 179,
					"y": 370
				},
				{
					"x": 160,
					"y": 300
				},
				{
					"x": 179,
					"y": 230
				},
				{
					"x": 230,
					"y": 179
				}
			],
			"edges": [
				[0, 1],
				[12, 13],
				[0, 12],
				[1, 2],
				[13, 14],
				[1, 13],
				[2, 3],
				[14, 15],
				[3, 4],
				[15, 16],
				[3, 15],
				[4, 5],
				[16, 17],
				[4, 16],
				[5, 6],
				[17, 18],
				[6, 7],
				[18, 19],
				[6, 18],
				[7, 8],
				[19, 20],
				[7, 19],
				[8, 9],
				[20, 21],
				[8, 20],
				[9, 10],
				[21, 22],
				[9, 21],
				[10, 11],
				[22, 23],
				[10, 22],
				[11, 0],
				[23, 12],
				[11, 23]
			],
			"cops": [
				16,
				10,
				3
			],
			"robbers": [
				6,
				21,
				7
			],
			"exits": [11, 1],
			"par": 17
		}
	].map(prepareLevel);
	//#endregion
	//#region ../../games/local/cops-robbers/src/duel-levels.js
	function makeMap(id, mode) {
		let seed = id * 9137 + (mode === "escape" ? 7183 : 51031);
		const random = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
		const size = 4 + Math.floor((id - 1) / 34), nodes = Array.from({ length: size * size }, (_, index) => ({
			x: 65 + index % size * 470 / (size - 1),
			y: 70 + Math.floor(index / size) * 460 / (size - 1)
		}));
		const candidates = [], edges = [], parent = nodes.map((_, index) => index);
		const root = (node) => {
			while (node !== parent[node]) node = parent[node];
			return node;
		};
		for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
			const node = y * size + x;
			if (x + 1 < size) candidates.push([node, node + 1]);
			if (y + 1 < size) candidates.push([node, node + size]);
		}
		const shuffled = candidates.map((edge) => ({
			edge,
			weight: random()
		})).sort((a, b) => a.weight - b.weight);
		const extras = [];
		for (const { edge: [a, b] } of shuffled) if (root(a) !== root(b)) {
			parent[root(a)] = root(b);
			edges.push([a, b]);
		} else extras.push([a, b]);
		edges.push(...extras.slice(0, 2 + Math.floor(id / 9)));
		edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
		const rotation = Math.floor(random() * 4);
		const rotate = (index) => {
			let x = index % size, y = Math.floor(index / size);
			for (let i = 0; i < rotation; i++) [x, y] = [size - 1 - y, x];
			return y * size + x;
		};
		const cops = [
			1,
			size * size - 2,
			...id > 67 ? [size - 1] : []
		].map(rotate);
		const robbers = [size * Math.floor(size / 2) + Math.floor(size / 2) - 1].map(rotate);
		const exits = mode === "escape" ? [0, size * size - 1].map(rotate) : [];
		for (const pair of [[rotate(0), cops[0]], [rotate(size * size - 1), cops[1]]]) {
			const edge = pair.sort((a, b) => a - b);
			if (!edges.some(([a, b]) => a === edge[0] && b === edge[1])) edges.push(edge);
		}
		edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
		const level = prepareLevel({
			id,
			mode,
			name: `${mode === "escape" ? "出口竞速" : "限步周旋"} ${String(id).padStart(3, "0")}`,
			nodes,
			edges,
			cops,
			robbers,
			exits,
			roundLimit: (mode === "escape" ? 18 : 10) + Math.floor((id - 1) / 5),
			difficulty: 1 + Math.floor((id - 1) / 20)
		});
		const starts = nodes.map((_, index) => index).filter((node) => !cops.includes(node) && !exits.includes(node));
		starts.sort((a, b) => Math.min(...cops.map((cop) => level.dist[cop][b])) - Math.min(...cops.map((cop) => level.dist[cop][a])) || level.adj[b].length - level.adj[a].length);
		level.robbers = [starts[0]];
		return level;
	}
	var duelLevels = ["escape", "survival"].flatMap((mode) => Array.from({ length: 100 }, (_, index) => makeMap(index + 1, mode)));
	var getDuelLevel = (mode, id) => duelLevels.find((level) => level.mode === mode && level.id === Number(id));
	//#endregion
	//#region ../../games/local/cops-robbers/src/duel.js
	function legalDuelTargets(level, state, actor, side = state.side) {
		if (state.winner || !["pursuer", "runner"].includes(side) || !Number.isInteger(actor)) return [];
		const positions = side === "pursuer" ? state.cops : state.robbers, from = positions[actor];
		if (!Number.isInteger(from) || from < 0 || !level.adj[from]) return [];
		return [from, ...level.adj[from]].filter((node) => !positions.some((position, index) => index !== actor && position === node) && (side === "pursuer" || !state.cops.includes(node)));
	}
	//#endregion
	//#region ../../games/local/cops-robbers/src/role-appearance.js
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
	var images = /* @__PURE__ */ new Map();
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
			const value = globalThis.localStorage?.getItem(storageKey) || "{}";
			if (settings && value === stored) return settings;
			stored = value;
			settings = JSON.parse(value);
		} catch {
			settings = {};
		}
		if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
		return settings;
	}
	function getRoleAppearance(role) {
		const key = side(role), value = read()[key];
		const style = Object.hasOwn(presets, value?.style) ? value.style : "team";
		const [color, accent, badge] = presets[style][key];
		return {
			label: key === "cop" ? "追逐队" : "突围队",
			style,
			color,
			accent,
			badge,
			avatar: validAvatar(value?.avatar) ? value.avatar : ""
		};
	}
	function drawRoleAvatar(ctx, role, x, y, size) {
		const { color, accent, badge, avatar } = getRoleAppearance(role);
		const chaser = side(role) === "cop";
		ctx.save();
		ctx.fillStyle = accent;
		ctx.strokeStyle = color;
		ctx.lineWidth = Math.max(2, size * .065);
		ctx.beginPath();
		if (chaser) ctx.rect(x, y, size, size);
		else ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		let img = images.get(avatar);
		if (avatar && !img && typeof Image !== "undefined") {
			img = new Image();
			img.src = avatar;
			images.set(avatar, img);
		}
		if (img?.complete && img.naturalWidth) ctx.drawImage(img, x + size * .1, y + size * .1, size * .8, size * .8);
		else {
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = `${size * .65}px sans-serif`;
			ctx.fillStyle = color;
			ctx.fillText(badge, x + size / 2, y + size / 2);
		}
		ctx.beginPath();
		ctx.arc(x + size * .87, y + size * .9, size * .2, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();
		ctx.strokeStyle = "#fff9ed";
		ctx.lineWidth = 1;
		ctx.stroke();
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = `bold ${size * .22}px sans-serif`;
		ctx.fillStyle = "white";
		ctx.fillText(chaser ? "追" : "突", x + size * .87, y + size * .9);
		ctx.restore();
	}
	//#endregion
	//#region ../../games/local/cops-robbers/src/competition-renderer.js
	/** Local selection only; authoritative moves and turn ownership come from the server. */
	function createRenderer() {
		let selected = 0, hits = [], note = "", previousRole;
		const contains = (hit, x, y) => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h;
		const mapFor = (state) => state?.kind === "cops-duel" ? getDuelLevel(state.mode, state.levelId) : levels.find((item) => item.id === state?.levelId);
		const isEnded = (state) => state.kind === "cops-duel" ? Boolean(state.board.winner) : state.board.robbers.includes(-2) || state.board.robbers.every((node) => node < 0) || state.board.turn >= 200 || state.elapsedMs >= 3e5;
		const legal = (level, state) => state.kind === "cops-duel" ? state.role === state.board.side ? legalDuelTargets(level, state.board, selected) : [] : legalTargets(level, state.board, selected);
		return {
			draw(ctx, width, height, state) {
				hits = [];
				const level = mapFor(state), duel = state?.kind === "cops-duel", role = duel ? state.role : "pursuer";
				ctx.fillStyle = "#f5f0e5";
				ctx.fillRect(0, 0, width, height);
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				const text = (label, x, y, size = 14, color = "#263e43") => {
					ctx.font = `${size}px sans-serif`;
					ctx.fillStyle = color;
					ctx.fillText(label, x, y);
				};
				if (!level || !state.board) {
					text("正在等待围捕地图…", 16, 30);
					return hits;
				}
				const board = state.board, ended = isEnded(state), positions = role === "runner" ? board.robbers : board.cops;
				if (role !== previousRole) {
					selected = 0;
					previousRole = role;
					note = "";
				}
				selected = Math.min(selected, positions.length - 1);
				if (positions[selected] < 0) selected = Math.max(0, positions.findIndex((node) => node >= 0));
				const targets = ended ? [] : legal(level, state);
				const size = Math.max(100, Math.min(width - 16, height - 150, 620)), left = (width - size) / 2, top = 60;
				const point = (node) => ({
					x: left + level.nodes[node].x / 600 * size,
					y: top + level.nodes[node].y / 600 * size
				});
				const circle = (x, y, r, fill, stroke = "") => {
					ctx.beginPath();
					ctx.arc(x, y, r, 0, Math.PI * 2);
					ctx.fillStyle = fill;
					ctx.fill();
					if (stroke) {
						ctx.strokeStyle = stroke;
						ctx.lineWidth = 2;
						ctx.stroke();
					}
				};
				const hit = (label, x, y, w, h, action) => hits.push({
					label,
					x,
					y,
					w,
					h,
					action
				});
				text(`${level.name}`, 12, 16, 15);
				text(duel ? `我是${role === "runner" ? "突围队" : "追逐队"} · ${board.side === "runner" ? "突围队" : "追逐队"}行动` : "围堵挑战", 12, 38, 12);
				ctx.textAlign = "right";
				text(`${duel ? Math.floor(board.turn / 2) + " 回合" : board.turn + " 步"}`, width - 12, 16, 12);
				ctx.textAlign = "center";
				ctx.fillStyle = "#e3e8d2";
				ctx.fillRect(left, top, size, size);
				ctx.lineCap = "round";
				ctx.lineWidth = Math.max(12, size * .032);
				ctx.strokeStyle = "#fbf7e8";
				for (const [from, to] of level.edges) {
					const a = point(from), b = point(to);
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.stroke();
				}
				level.nodes.forEach((_, index) => {
					const p = point(index), reachable = targets.includes(index), exit = level.exits.includes(index);
					circle(p.x, p.y, 11, exit ? "#ffd39e" : "#fbf7e8", reachable ? "#1258c2" : "#aebea6");
					text(`${index + 1}`, p.x, p.y + 18, 11, reachable ? "#1258c2" : "#566851");
					if (exit) text("出口", p.x, p.y - 25, 10, "#a44908");
					hit(`${index + 1} 号路口`, p.x - 20, p.y + 2, 40, 34, { target: index });
				});
				for (const side of ["runner", "pursuer"]) (side === "runner" ? board.robbers : board.cops).forEach((node, index) => {
					if (node < 0) return;
					const p = point(node), mine = role === side;
					if (mine && index === selected) circle(p.x, p.y - 10, 21, "#d0e7f8", "#1258c2");
					drawRoleAvatar(ctx, side === "pursuer" ? "cop" : "robber", p.x - 16, p.y - 29, 32);
					ctx.textAlign = "center";
					text(`${side === "pursuer" ? "追" : "突"}${index + 1}`, p.x, p.y - 33, 11, side === "pursuer" ? "#1258c2" : "#a44908");
					hit(`${side === "pursuer" ? "追逐队" : "突围队"} ${index + 1} 号`, p.x - 22, p.y - 35, 44, 40, mine ? { local: index } : { target: node });
				});
				text(ended ? `${duel ? board.winner === "runner" ? "突围队获胜" : "追逐队获胜" : board.robbers.includes(-2) ? "突围成功" : "拦截成功"} · 等待结算` : duel && board.side !== role ? "等待对手行动" : note || `已选 ${selected + 1} 号，点相邻路口数字移动`, width / 2, top + size + 17, 12);
				const buttonY = top + size + 33, buttonWidth = Math.min(180, width - 24), buttonX = (width - buttonWidth) / 2, canAct = !ended && (!duel || board.side === role);
				ctx.fillStyle = canAct ? "#1258c2" : "#b9c4b8";
				ctx.fillRect(buttonX, buttonY, buttonWidth, 40);
				text(ended ? "本局结束" : canAct ? "留守一步" : "对手行动中", width / 2, buttonY + 20, 14, "#fffdf5");
				if (canAct) hit("留守一步", buttonX, buttonY, buttonWidth, 40, { target: positions[selected] });
				return hits;
			},
			tap(x, y, state) {
				const level = mapFor(state);
				if (!level || !state?.board || isEnded(state)) return null;
				const duel = state.kind === "cops-duel";
				if (duel && state.role !== state.board.side) return null;
				const item = hits.filter((target) => contains(target, x, y)).sort((a, b) => Math.hypot(x - a.x - a.w / 2, y - a.y - a.h / 2) - Math.hypot(x - b.x - b.w / 2, y - b.y - b.h / 2))[0];
				if (!item) return null;
				if ("local" in item.action) {
					selected = item.action.local;
					note = "";
					return null;
				}
				const target = item.action.target;
				if (!legal(level, state).includes(target)) {
					note = "只能走相邻路口";
					return null;
				}
				note = "";
				return duel ? {
					type: "move",
					side: state.role,
					actor: selected,
					target
				} : {
					type: "move",
					cop: selected,
					target
				};
			}
		};
	}
	//#endregion
	//#region ../../.scratch/competition/h5-cops-robbers.js
	globalThis.__COMPETITION_CONFIG__ = Object.assign({
		"game": "cops-robbers",
		"platform": "h5",
		"title": "围捕小队",
		"apiUrl": ""
	}, globalThis.__COMPETITION_CONFIG__ || {});
	mountCompetition("cops-robbers", createRenderer);
	//#endregion
})();
