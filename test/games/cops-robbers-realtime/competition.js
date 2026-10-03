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
	function facePaths(role) {
		const { color, accent, style } = getRoleAppearance(role);
		const chaser = side(role) === "cop";
		const animal = style === "animals";
		const paths = [];
		const add = (d, fill, stroke = "", width = 3) => paths.push({
			d,
			fill,
			stroke,
			width
		});
		if (animal) {
			add(chaser ? "M9 43 10 6Q12 0 18 6L39 27M61 27 82 6Q88 0 90 6L91 43" : "M6 48 13 5Q15 0 21 7L42 29M58 29 79 7Q85 0 87 5L94 48", color);
			add("M16 29 17 13 30 30M70 30 83 13 84 29", "#ffb6a2");
		}
		add(chaser ? "M8 46Q8 22 31 19H69Q92 22 92 46V65Q92 94 50 96 8 94 8 65Z" : "M5 53Q5 17 50 17T95 53Q95 92 50 97 5 92 5 53Z", animal ? color : accent, color);
		if (animal) add(chaser ? "M16 58Q27 43 42 57L50 65 58 57Q73 43 84 58V70Q81 89 50 90 19 89 16 70Z" : "M10 50 42 60 50 70 58 60 90 50Q90 87 50 91 10 87 10 50Z", "#fff4df");
		else {
			add(chaser ? "M13 34Q19 12 47 17L56 7 59 19Q80 17 88 34L76 39 50 32 24 39Z" : "M16 31Q25 14 48 18L61 6 60 21Q80 20 85 34L67 32 55 39 40 30 25 36Z", color);
			if (style === "cosmic") add("M50 19 53 25 60 26 55 31 56 38 50 34 44 38 45 31 40 26 47 25Z", "#ffe075");
		}
		add("M27 58a5 7 0 1 0 10 0a5 7 0 1 0-10 0M63 58a5 7 0 1 0 10 0a5 7 0 1 0-10 0", "#243d49");
		add("M29 55a1.5 2 0 1 0 3 0a1.5 2 0 1 0-3 0M65 55a1.5 2 0 1 0 3 0a1.5 2 0 1 0-3 0", "#fff");
		add("M17 72a7 4 0 1 0 14 0a7 4 0 1 0-14 0M69 72a7 4 0 1 0 14 0a7 4 0 1 0-14 0", "#f49d92");
		if (animal) add("M45 68Q50 64 55 68L50 73Z", "#9e5149");
		add("M39 76Q50 90 61 76", "none", "#9e5149", 3.5);
		return paths;
	}
	var portraitOutline = (role) => side(role) === "cop" ? "M28 0H72Q100 0 100 28V72Q100 100 72 100H28Q0 100 0 72V28Q0 0 28 0Z" : "M0 50a50 50 0 1 0 100 0a50 50 0 1 0-100 0";
	function drawRoleAvatar(ctx, role, x, y, size) {
		const { avatar } = getRoleAppearance(role);
		let img = images.get(avatar);
		if (avatar && !img && typeof Image !== "undefined") {
			img = new Image();
			img.src = avatar;
			images.set(avatar, img);
		}
		ctx.save();
		ctx.translate(x, y);
		ctx.scale(size / 100, size / 100);
		ctx.lineCap = ctx.lineJoin = "round";
		if (img?.complete && img.naturalWidth) {
			ctx.clip(new Path2D(portraitOutline(role)));
			const edge = Math.min(img.naturalWidth, img.naturalHeight);
			ctx.drawImage(img, (img.naturalWidth - edge) / 2, (img.naturalHeight - edge) / 2, edge, edge, 0, 0, 100, 100);
		} else for (const { d, fill, stroke, width } of facePaths(role)) {
			const path = new Path2D(d);
			if (fill !== "none") {
				ctx.fillStyle = fill;
				ctx.fill(path);
			}
			if (stroke) {
				ctx.strokeStyle = stroke;
				ctx.lineWidth = width;
				ctx.stroke(path);
			}
		}
		ctx.restore();
	}
	//#endregion
	//#region ../../games/local/cops-robbers-realtime/src/engine.js
	var pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	var finitePoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
	function edgePoint(graph, edge, t) {
		const segment = graph.edges[edge];
		const a = graph.nodes[segment.a];
		const b = graph.nodes[segment.b];
		return {
			x: a.x + (b.x - a.x) * t,
			y: a.y + (b.y - a.y) * t,
			edge,
			t
		};
	}
	function roadTarget(game, point, maxDistance = 48) {
		if (!finitePoint(point) || !Number.isFinite(maxDistance) || maxDistance < 0) return null;
		let best = null;
		let distance = maxDistance;
		game.graph.edges.forEach(({ a, b }, edge) => {
			const start = game.graph.nodes[a];
			const end = game.graph.nodes[b];
			const dx = end.x - start.x;
			const dy = end.y - start.y;
			const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
			const candidate = edgePoint(game.graph, edge, t);
			const d = pointDistance(point, candidate);
			if (d <= distance) {
				best = candidate;
				distance = d;
			}
		});
		return best;
	}
	//#endregion
	//#region ../../games/local/cops-robbers-realtime/src/renderer.js
	var INK = "#29493f";
	var FONT = "\"Trebuchet MS\", \"Microsoft YaHei\", sans-serif";
	function round(ctx, x, y, w, h, r, fill, stroke, width = 2) {
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, r);
		if (fill) {
			ctx.fillStyle = fill;
			ctx.fill();
		}
		if (stroke) {
			ctx.strokeStyle = stroke;
			ctx.lineWidth = width;
			ctx.stroke();
		}
	}
	function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 2) {
		ctx.beginPath();
		ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
		if (fill) {
			ctx.fillStyle = fill;
			ctx.fill();
		}
		if (stroke) {
			ctx.strokeStyle = stroke;
			ctx.lineWidth = width;
			ctx.stroke();
		}
	}
	function line(ctx, points, color, width = 2) {
		ctx.beginPath();
		points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.stroke();
	}
	function route(ctx, actor, selected) {
		if (!actor.destination) return;
		const points = [{
			x: actor.x,
			y: actor.y
		}, ...actor.routePoints || []];
		if (points.length < 2) points.push(actor.destination);
		ctx.save();
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.setLineDash(selected ? [8, 7] : [4, 9]);
		line(ctx, points.map((p) => [p.x, p.y]), selected ? "#438ed6a6" : "#438ed649", selected ? 3.5 : 2);
		ctx.setLineDash([]);
		const { x, y } = actor.destination;
		ellipse(ctx, x, y, 11, 4, selected ? "#448bc942" : "#448bc922");
		line(ctx, [[x, y], [x, y - 24]], selected ? "#36729b" : "#85a5b3", 2);
		ctx.beginPath();
		ctx.moveTo(x, y - 24);
		ctx.lineTo(x + 19, y - 19);
		ctx.lineTo(x, y - 13);
		ctx.closePath();
		ctx.fillStyle = selected ? "#337fbc" : "#9cbcc5";
		ctx.fill();
		ctx.font = `bold 9px ${FONT}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = "#fff8df";
		ctx.fillText(String(actor.id + 1), x + 6, y - 19);
		ctx.restore();
	}
	function bubble(ctx, x, y, text, color = INK, scale = 1) {
		ctx.save();
		ctx.translate(x, y);
		ctx.scale(scale, scale);
		ctx.font = `bold ${text.length > 3 ? 11 : 15}px ${FONT}`;
		const w = Math.max(25, ctx.measureText(text).width + 17);
		round(ctx, -w / 2, -23, w, 25, 9, "#fff9e8", color, 1.5);
		ctx.beginPath();
		ctx.moveTo(-4, 1);
		ctx.lineTo(1, 7);
		ctx.lineTo(5, 1);
		ctx.fillStyle = "#fff9e8";
		ctx.fill();
		line(ctx, [
			[-4, 2],
			[1, 7],
			[5, 2]
		], color, 1.5);
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = color;
		ctx.fillText(text, 0, -10);
		ctx.restore();
	}
	function actorBody(ctx, actor, cop, selected, t, salute, caughtAge, celebrating, escapedAge) {
		const role = cop ? "cop" : "robber", { color } = getRoleAppearance(role);
		const stride = actor.moving ? Math.sin(t * 16 + actor.id * 2) * 5 : 0;
		ctx.save();
		ctx.translate(actor.x, actor.y);
		if (actor.caught) ctx.globalAlpha = Math.max(0, 1 - Math.max(0, caughtAge - .65) / .7);
		else if (actor.escaped) ctx.globalAlpha = Math.max(0, 1 - escapedAge / .9);
		ellipse(ctx, 0, 6, 19, 7, "#43594735");
		if (selected) ellipse(ctx, 0, 0, 30, 21, "#fff9e955", color, 4);
		line(ctx, [[-9, -5], [-10 - stride, 7]], color, 7);
		line(ctx, [[9, -5], [10 + stride, 7]], color, 7);
		drawRoleAvatar(ctx, role, -23, -52 - Math.abs(stride) * .4, 46);
		ellipse(ctx, 22, -49, 10, 10, "#fff9e9", color, 2);
		ctx.font = `bold 12px ${FONT}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = color;
		ctx.fillText(String(actor.id + 1), 22, -49);
		if (actor.caught) bubble(ctx, 0, -75, "合围！", color, .9);
		else if (actor.escaped) bubble(ctx, 0, -75, "突围！", color, .9);
		else if (actor.escapeProgress > 0) bubble(ctx, 0, -75, "冲线！", color, .9);
		else if (salute) bubble(ctx, 0, -75, "收到！", color, .8);
		ctx.restore();
	}
	//#endregion
	//#region ../../games/local/cops-robbers-realtime/src/competition-renderer.js
	function createRenderer() {
		let selected = 0, hits = [], transform = null, note = "";
		const inside = (hit, x, y) => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h;
		return {
			draw(ctx, width, height, state) {
				hits = [];
				ctx.fillStyle = "#f5f3e9";
				ctx.fillRect(0, 0, width, height);
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				const text = (value, x, y, size = 14, color = "#29493f") => {
					ctx.font = `${size}px sans-serif`;
					ctx.fillStyle = color;
					ctx.fillText(value, x, y);
				};
				if (!state?.map) {
					text("正在等待街区…", 14, 24);
					return hits;
				}
				const runner = state.role === "runner", own = runner ? state.robbers : state.cops;
				selected = Math.min(selected, own.length - 1);
				if (own[selected]?.caught || own[selected]?.escaped) selected = Math.max(0, own.findIndex((a) => !a.caught && !a.escaped));
				text(`${state.name} · 抓获 ${state.caught}/${state.total}`, 12, 20, 15);
				ctx.textAlign = "right";
				text(`${(state.elapsedMs / 1e3).toFixed(1)} / 120 秒`, width - 12, 20, 13);
				const nodes = state.map.nodes;
				const minX = Math.min(...nodes.map((p) => p.x)) - 55, minY = Math.min(...nodes.map((p) => p.y)) - 65;
				const mapW = Math.max(...nodes.map((p) => p.x)) + 55 - minX, mapH = Math.max(...nodes.map((p) => p.y)) + 55 - minY;
				const mapBottom = Math.max(150, height - 106);
				const scale = Math.max(.05, Math.min((width - 16) / mapW, (mapBottom - 40) / mapH));
				const left = (width - mapW * scale) / 2, top = 40 + (mapBottom - 40 - mapH * scale) / 2;
				transform = {
					x: left - minX * scale,
					y: top - minY * scale,
					scale,
					top: 40,
					bottom: mapBottom
				};
				const hit = (label, x, y, w, h, action) => hits.push({
					label,
					x,
					y,
					w,
					h,
					action
				});
				ctx.save();
				ctx.translate(transform.x, transform.y);
				ctx.scale(scale, scale);
				ctx.fillStyle = "#ccdec0";
				ctx.fillRect(minX, minY, mapW, mapH);
				ctx.lineCap = "round";
				ctx.lineJoin = "round";
				for (const [color, lineWidth] of [
					["#a8b58e", 58],
					["#fff4dc", 50],
					["#efe4cb", 38]
				]) {
					ctx.strokeStyle = color;
					ctx.lineWidth = lineWidth;
					ctx.beginPath();
					for (const [a, b] of state.map.edges) {
						ctx.moveTo(nodes[a].x, nodes[a].y);
						ctx.lineTo(nodes[b].x, nodes[b].y);
					}
					ctx.stroke();
				}
				nodes.forEach((point, index) => {
					const x = transform.x + point.x * scale, y = transform.y + point.y * scale;
					hit(`道路 ${index + 1}`, x - 18, y - 18, 36, 36, {
						type: "move",
						actor: selected,
						x: point.x,
						y: point.y
					});
				});
				for (const actor of own) route(ctx, actor, actor.id === selected);
				ctx.textAlign = "center";
				for (const exit of state.exits) {
					ctx.fillStyle = exit.blocked ? "#3a836c" : "#bb5b31";
					ctx.fillRect(exit.x - 20, exit.y - 10, 40, 20);
					text(`${exit.label} ${exit.blocked ? "已封" : "出口"}`, exit.x, exit.y + 31, 17, exit.blocked ? "#286450" : "#9a4524");
				}
				for (const robber of state.robbers) {
					if (robber.gap && !robber.caught && !robber.escaped) {
						ctx.beginPath();
						ctx.moveTo(robber.gap.from.x, robber.gap.from.y);
						ctx.lineTo(robber.gap.to.x, robber.gap.to.y);
						ctx.strokeStyle = "#ed9c36";
						ctx.lineWidth = 8;
						ctx.stroke();
					}
					actorBody(ctx, robber, false, runner && robber.id === selected, state.elapsedMs / 1e3, false, 0, false, 0);
					if (runner && !robber.caught && !robber.escaped) hit(`选择 ${robber.id + 1} 号突围队员`, transform.x + robber.x * scale - 22, transform.y + (robber.y - 20) * scale - 22, 44, 44, { local: robber.id });
					if (robber.capture > 0 && !robber.caught) {
						ctx.beginPath();
						ctx.arc(robber.x, robber.y, 31, -Math.PI / 2, -Math.PI / 2 + robber.capture * Math.PI * 2);
						ctx.strokeStyle = "#c46327";
						ctx.lineWidth = 5;
						ctx.stroke();
					}
				}
				for (const cop of state.cops) {
					actorBody(ctx, cop, true, !runner && cop.id === selected, state.elapsedMs / 1e3, false, 0, state.phase === "won", 0);
					const x = transform.x + cop.x * scale, y = transform.y + (cop.y - 20) * scale;
					if (!runner) hit(`选择 ${cop.id + 1} 号追逐队员`, x - 22, y - 22, 44, 44, { local: cop.id });
				}
				ctx.restore();
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				const liveRobber = state.robbers.find((r) => !r.caught && !r.escaped);
				const opening = state.openingRemainingMs > 0 ? `${state.firstRole === "pursuer" ? "追逐队" : "突围队"}先动 · ${(state.openingRemainingMs / 1e3).toFixed(1)}秒` : "";
				text(state.finished ? `${state.phase === "won" ? "追逐队" : "突围队"}获胜 · 服务端确认` : opening || note || (runner ? `你是突围队 · 已选 ${selected + 1} 号 · 点道路换向突围` : liveRobber?.escapeProgress > 0 ? "对方正在越过出口！马上拦截" : liveRobber?.enclosed ? `双人合围 ${Math.round(liveRobber.capture * 100)}% · 保持位置` : `你是追逐队 · 已选 ${selected + 1} 号 · 点道路下令`), width / 2, mapBottom + 17, 12);
				const gap = 6, buttonWidth = Math.min(84, (width - 24 - gap * own.length) / (own.length + 1));
				const buttonsLeft = (width - (buttonWidth * (own.length + 1) + gap * own.length)) / 2, buttonY = mapBottom + 34;
				for (let index = 0; index <= own.length; index++) {
					const hold = index === own.length, x = buttonsLeft + index * (buttonWidth + gap);
					ctx.fillStyle = state.finished ? "#bdc9b1" : hold ? "#29493f" : index === selected ? "#337fbc" : "#dbe5d4";
					ctx.fillRect(x, buttonY, buttonWidth, 44);
					text(hold ? "留守" : `${index + 1} 号`, x + buttonWidth / 2, buttonY + 22, 14, !state.finished && (hold || index === selected) ? "#fff9e9" : "#29493f");
					if (!state.finished) hit(hold ? "原地留守" : `选择 ${index + 1} 号${runner ? "突围队员" : "追逐队员"}`, x, buttonY, buttonWidth, 44, hold ? {
						type: "hold",
						actor: selected
					} : { local: index });
				}
				text("比赛无法暂停 · 断线时已有命令继续", width / 2, buttonY + 59, 11, "#62705b");
				return hits;
			},
			tap(x, y, state) {
				if (!transform || !state?.map || state.finished) return null;
				if (state.openingRemainingMs > 0 && state.firstRole !== state.role) {
					note = "开局待命，2 秒后同时行动";
					return null;
				}
				const item = [...hits].reverse().find((hit) => inside(hit, x, y));
				if (item) {
					note = "";
					if ("local" in item.action) {
						selected = item.action.local;
						return null;
					}
					return {
						...item.action,
						actor: selected
					};
				}
				if (y < transform.top || y > transform.bottom) return null;
				const point = {
					x: (x - transform.x) / transform.scale,
					y: (y - transform.y) / transform.scale
				};
				const closest = roadTarget({ graph: {
					nodes: state.map.nodes,
					edges: state.map.edges.map(([a, b]) => ({
						a,
						b
					}))
				} }, point);
				if (!closest) {
					note = "这里是建筑，请点道路";
					return null;
				}
				note = "";
				return {
					type: "move",
					actor: selected,
					x: closest.x,
					y: closest.y
				};
			}
		};
	}
	//#endregion
	//#region ../../.scratch/competition/h5-cops-robbers-realtime.js
	globalThis.__COMPETITION_CONFIG__ = Object.assign({
		"game": "cops-robbers-realtime",
		"platform": "h5",
		"title": "别跑！街区围捕",
		"apiUrl": ""
	}, globalThis.__COMPETITION_CONFIG__ || {});
	mountCompetition("cops-robbers-realtime", createRenderer);
	//#endregion
})();
