package com.coffeeeeffoc.wulongcity;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    private RewardAds ads;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();
        web = new WebView(this);
        setContentView(web);
        ads = new RewardAds(this, (id, status) -> {
            if (web != null && !isDestroyed() && !isFinishing()) web.evaluateJavascript(
                "window.WulongNative?.deliver(" + JSONObject.quote(id) + "," + JSONObject.quote(status) + ")", null);
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // All navigation is internal game state. Never load remote HTML in this bridge-enabled WebView.
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                WebResourceResponse result = null;
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
                    && uri.getPort() == -1 && uri.getPath() != null && uri.getPath().startsWith("/assets/game/")) {
                    result = loader.shouldInterceptRequest(uri);
                }
                if (result == null) return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                    Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                return result;
            }
        });
        web.addJavascriptInterface(new Host(), "WulongAndroidHost");
        web.loadUrl(ORIGIN + "/assets/game/index.html");
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private void event(String name) {
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event(" + JSONObject.quote(name) + "))", null);
    }

    @Override protected void onPause() {
        event("wulong:native-pause");
        if (ads != null) ads.pause();
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        immersive();
        if (web != null) web.onResume();
        if (ads != null) ads.resume();
        event("wulong:native-resume");
    }

    @Override public void onBackPressed() { event("wulong:native-back"); }

    @Override protected void onDestroy() {
        if (ads != null) ads.destroy();
        if (web != null) { web.removeJavascriptInterface("WulongAndroidHost"); web.destroy(); web = null; }
        super.onDestroy();
    }

    final class Host {
        @JavascriptInterface public String capabilities() {
            return "{\"rewarded\":" + BuildConfig.REWARDED_ENABLED + "}";
        }
        @JavascriptInterface public void showRewarded(String id, String placement) {
            if (id == null || !id.matches("[0-9]{1,12}") || !"wulong-city:hint-highlight".equals(placement)) return;
            runOnUiThread(() -> { if (!isDestroyed() && !isFinishing()) ads.show(id); });
        }
        @JavascriptInterface public void cancelRewarded(String id) { runOnUiThread(() -> ads.cancel(id)); }
        @JavascriptInterface public void share(String text) {
            if (text == null || text.length() > 500) return;
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(intent, "分享乌龙城"));
            });
        }
        @JavascriptInterface public void privacy() { runOnUiThread(() -> { if (!isDestroyed() && !isFinishing()) ads.privacy(); }); }
        @JavascriptInterface public void exit() {
            runOnUiThread(() -> new AlertDialog.Builder(MainActivity.this).setTitle("离开小城？")
                .setMessage("关卡进度已自动保存，下次可以继续探索。")
                .setNegativeButton("继续探索", null).setPositiveButton("退出", (dialog, which) -> finish()).show());
        }
    }
}
