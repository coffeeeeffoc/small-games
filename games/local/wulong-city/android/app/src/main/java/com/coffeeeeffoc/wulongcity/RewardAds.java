package com.coffeeeeffoc.wulongcity;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import com.tapsdk.tapad.AdRequest;
import com.tapsdk.tapad.TapAdConfig;
import com.tapsdk.tapad.TapAdCustomController;
import com.tapsdk.tapad.TapAdManager;
import com.tapsdk.tapad.TapAdNative;
import com.tapsdk.tapad.TapAdSdk;
import com.tapsdk.tapad.TapRewardVideoAd;
import com.tapsdk.tapad.constants.Constants;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

final class RewardAds {
    interface Result { void deliver(String id, String status); }
    private final Activity activity;
    private final Result result;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Object timerToken = new Object();
    private final Set<TapRewardVideoAd> releasedAds = Collections.newSetFromMap(new IdentityHashMap<>());
    private TapAdNative loader;
    private TapRewardVideoAd currentAd;
    private RewardSession active;
    private AlertDialog consent;
    private boolean foreground = true, destroyed;
    private long lastAttempt = -60000;
    private int attempts;

    RewardAds(Activity activity, Result result) { this.activity = activity; this.result = result; }

    void show(String id) {
        if (destroyed) return;
        if (!foreground || !BuildConfig.REWARDED_ENABLED || active != null
            || attempts >= 6 || android.os.SystemClock.elapsedRealtime() - lastAttempt < 60000) {
            result.deliver(id, "unavailable"); return;
        }
        RewardSession request = new RewardSession(id);
        active = request;
        if (activity.getPreferences(0).getBoolean("ad-consent-v1", false)) load(request);
        else {
            consent = new AlertDialog.Builder(activity).setTitle("自愿观看激励广告")
                .setMessage("由 TapADN 提供视频，验证完成后获得 30 秒机关指引。广告服务会处理网络、设备基础及广告交互信息；本应用关闭可选的设备标识、位置、应用列表和传感器采集。拒绝仍可使用全部免费文字提示。")
                .setPositiveButton("同意并观看", (dialog, which) -> {
                    activity.getPreferences(0).edit().putBoolean("ad-consent-v1", true).apply(); load(request);
                })
                .setNegativeButton("暂不观看", (dialog, which) -> finish(request, "dismissed"))
                .setNeutralButton("隐私说明", (dialog, which) -> { finish(request, "dismissed"); privacy(); })
                .setOnCancelListener(dialog -> finish(request, "dismissed")).show();
        }
    }

    private void initialize() {
        if (loader != null) return;
        TapAdSdk.init(activity.getApplicationContext(), new TapAdConfig.Builder()
            .withMediaId(Long.parseLong(BuildConfig.TAPAD_MEDIA_ID)).withMediaName("乌龙城")
            .withMediaKey(BuildConfig.TAPAD_MEDIA_KEY).enableDebug(false).shakeEnabled(false)
            .withCustomController(new TapAdCustomController() {
                @Override public boolean isCanUseLocation() { return false; }
                @Override public boolean isCanUsePhoneState() { return false; }
                @Override public boolean isCanUseWifiState() { return false; }
                @Override public boolean isCanUseWriteExternal() { return false; }
                @Override public boolean alist() { return false; }
                @Override public boolean isCanUseAndroidId() { return false; }
                @Override public boolean isCanUsePhoneMacAddress() { return false; }
                @Override public boolean isCanUseBssid() { return false; }
                @Override public boolean isCanUseSsid() { return false; }
                @Override public boolean isCanUseSensor() { return false; }
                @Override public boolean isCanUseOaid() { return false; }
            }).build());
        TapAdSdk.putMediaGlobalSettings(Constants.Personalization.PERSONAL_ADS_TYPE,
            Constants.Personalization.PERSONAL_ADS_TYPE_LIMIT);
        loader = TapAdManager.get().createAdNative(activity);
    }

    private void load(RewardSession request) {
        if (active != request || !foreground || destroyed) { finish(request, "dismissed"); return; }
        lastAttempt = android.os.SystemClock.elapsedRealtime(); attempts++;
        try {
            initialize();
            later(() -> { if (active == request && !request.shown) finish(request, "unavailable"); }, 20000);
            loader.loadRewardVideoAd(new AdRequest.Builder().withSpaceId(Long.parseLong(BuildConfig.TAPAD_HINT_SPACE_ID))
                .withRewardName("机关指引").withRewardAmount(30).build(), new TapAdNative.RewardVideoAdListener() {
                    @Override public void onError(int code, String message) { main.post(() -> finish(request, "unavailable")); }
                    @Override public void onRewardVideoAdLoad(TapRewardVideoAd ad) { main.post(() -> {
                        if (!destroyed && active == request && (currentAd == null || currentAd == ad)) currentAd = ad;
                        else if (ad != currentAd) dispose(ad);
                    }); }
                    @Override public void onRewardVideoCached(TapRewardVideoAd ad) { main.post(() -> present(request, ad)); }
                });
        } catch (RuntimeException exception) { finish(request, "failed"); }
    }

    private void present(RewardSession request, TapRewardVideoAd ad) {
        if (active != request || request.shown || destroyed) {
            if (ad != currentAd) dispose(ad);
            return;
        }
        currentAd = ad;
        if (!foreground) { finish(request, "dismissed"); return; }
        if (!ad.isValid()) { finish(request, "unavailable"); return; }
        request.shown = true;
        ad.setRewardAdInteractionListener(new TapRewardVideoAd.RewardAdInteractionListener() {
            @Override public void onAdShow(TapRewardVideoAd value) {}
            @Override public void onAdClick(TapRewardVideoAd value) {}
            @Override public void onAdValidShow(TapRewardVideoAd value) {}
            @Override public void onVideoComplete(TapRewardVideoAd value) { /* Completion alone does not authorize a reward. */ }
            @Override public void onVideoError(TapRewardVideoAd value) { main.post(() -> finish(request, "failed")); }
            @Override public void onSkippedVideo(TapRewardVideoAd value) { main.post(() -> request.cancelled = true); }
            @Override public void onRewardVerify(TapRewardVideoAd value, boolean valid, int amount, String name, int code, String message) {
                main.post(() -> { request.verify(valid); settle(request, false); });
            }
            @Override public void onAdClose(TapRewardVideoAd value) {
                main.post(() -> {
                    request.closed = true;
                    settle(request, false);
                    // Account for a verification callback queued just after close, but never wait indefinitely.
                    later(() -> settle(request, true), 1500);
                });
            }
        });
        try { ad.showRewardVideoAd(activity); }
        catch (RuntimeException exception) { finish(request, "failed"); }
    }

    private void settle(RewardSession request, boolean expired) {
        if (active != request) return;
        String status = request.outcome(expired);
        if (status != null) finish(request, status);
    }

    private void later(Runnable callback, long delay) {
        if (!destroyed) main.postAtTime(callback, timerToken, android.os.SystemClock.uptimeMillis() + delay);
    }

    private void dispose(TapRewardVideoAd ad) {
        if (ad != null && releasedAds.add(ad)) ad.dispose();
    }

    private void finish(RewardSession request, String status) {
        if (active != request) return;
        request.settled = true;
        active = null;
        if (currentAd != null) { dispose(currentAd); currentAd = null; }
        if (consent != null) { consent.dismiss(); consent = null; }
        if (!destroyed) result.deliver(request.id, status);
    }

    void cancel(String id) {
        if (active == null || !active.id.equals(id)) return;
        active.cancelled = true;
        // SDK owns the visible ad. Keep its slot occupied until its close callback.
        if (!active.shown || active.closed) finish(active, "dismissed");
    }
    void pause() { foreground = false; if (active != null && !active.shown) cancel(active.id); }
    void resume() { foreground = true; }
    void destroy() {
        destroyed = true;
        // Resource callbacks must still run so late load/cache objects are disposed.
        main.removeCallbacksAndMessages(timerToken);
        active = null;
        if (currentAd != null) { dispose(currentAd); currentAd = null; }
        if (consent != null) { consent.dismiss(); consent = null; }
    }

    void privacy() {
        if (destroyed) return;
        new AlertDialog.Builder(activity).setTitle("广告与隐私")
            .setMessage("文字提示始终免费。只有主动选择广告并同意后才初始化 TapADN。可撤回下次请求广告的授权；已经初始化的 SDK 在退出应用后释放。")
            .setPositiveButton("游戏隐私政策", (dialog, which) -> openPrivacy(BuildConfig.WULONG_PRIVACY_URL))
            .setNeutralButton("TapADN 隐私政策", (dialog, which) -> openPrivacy("https://ssp.dirichlet.cn/docs/privacy/"))
            .setNegativeButton("撤回并退出", (dialog, which) -> {
                activity.getPreferences(0).edit().remove("ad-consent-v1").commit();
                activity.finishAndRemoveTask();
                // TapADN 5.3.0.4 has no shutdown API and holds Application-level callbacks.
                // This explicit user action ends our process so the SDK cannot survive revocation.
                android.os.Process.killProcess(android.os.Process.myPid());
            }).show();
    }
    private void openPrivacy(String url) {
        if (url != null && url.startsWith("https://")) {
            try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (android.content.ActivityNotFoundException ignored) {}
        }
    }
}
