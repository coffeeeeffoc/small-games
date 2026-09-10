package com.coffeeeeffoc.smallgames;

import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class AppUpdates {
    private static final String PAGES = "https://coffeeeeffoc.github.io/small-games/mobile/";
    private static final String RELEASE = "https://api.github.com/repos/coffeeeeffoc/small-games/releases/latest";
    private final MainActivity activity;
    private final SharedPreferences preferences;
    private final File cache;
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    private static boolean cleaned;
    private boolean busy;
    private String message = "开启后可检查并下载 GitHub 静态资源，离线时使用已缓存版本。";
    private TextView status;
    private Button check, reload, apk;
    private File pendingApk;

    AppUpdates(MainActivity activity) {
        this.activity = activity;
        preferences = activity.getSharedPreferences("updates", 0);
        cache = new File(activity.getFilesDir(), "web-updates");
        cache.mkdirs();
        // Clean once per process, before any download can run. Activity recreation must not touch an in-flight job.
        File[] old = cleaned ? null : cache.listFiles();
        cleaned = true;
        if (old != null) for (File file : old) {
            if (!file.getName().equals(preferences.getString("version", ""))) {
                try { UpdateFiles.delete(file); } catch (Exception ignored) { /* Retry on next launch. */ }
            }
        }
    }

    boolean enabled() { return preferences.getBoolean("remote", false); }

    File source() {
        if (!enabled()) return null;
        String version = preferences.getString("version", "");
        if (!version.matches("[a-f0-9]{64}")) return null;
        File directory = new File(cache, version);
        return new File(directory, "index.html").isFile() ? directory : null;
    }

    void show() {
        LinearLayout layout = new LinearLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (20 * activity.getResources().getDisplayMetrics().density);
        layout.setPadding(padding, padding / 2, padding, padding / 2);
        Switch toggle = new Switch(activity);
        toggle.setText("从 GitHub 加载并缓存游戏");
        toggle.setChecked(enabled());
        toggle.setEnabled(!busy);
        layout.addView(toggle);
        status = new TextView(activity);
        status.setPadding(0, padding / 2, 0, padding / 2);
        layout.addView(status);
        check = button(layout, "检查并下载最新资源", () -> checkWeb());
        reload = button(layout, "重新加载（返回目录）", () -> activity.reloadHome());
        apk = button(layout, "下载并安装最新 APK", () -> downloadApk());
        toggle.setOnCheckedChangeListener((view, checked) -> {
            preferences.edit().putBoolean("remote", checked).apply();
            message = checked ? "已开启；检查更新后点击重新加载。重新加载会结束当前游戏。" : "已关闭，已切回内置游戏。";
            if (!checked) activity.reloadHome();
            refresh();
        });
        refresh();
        new AlertDialog.Builder(activity).setTitle("应用设置 · " + BuildConfig.VERSION_NAME)
                .setView(layout).setPositiveButton("关闭", null).show();
    }

    private Button button(LinearLayout layout, String title, Runnable action) {
        Button button = new Button(activity);
        button.setText(title);
        button.setOnClickListener(view -> action.run());
        layout.addView(button);
        return button;
    }

    private void refresh() {
        if (status == null) return;
        String version = preferences.getString("version", "");
        status.setText(message + "\n缓存：" + (version.isEmpty() ? "尚未下载" : version.substring(0, Math.min(12, version.length()))));
        check.setVisibility(enabled() ? android.view.View.VISIBLE : android.view.View.GONE);
        reload.setVisibility(enabled() ? android.view.View.VISIBLE : android.view.View.GONE);
        check.setEnabled(!busy);
        reload.setEnabled(!busy);
        apk.setEnabled(!busy);
    }

    private interface Work { String run() throws Exception; }
    private void run(Work work) {
        if (busy) return;
        busy = true;
        message = "正在检查或下载，请稍候…";
        refresh();
        WORKER.execute(() -> {
            String result;
            try { result = work.run(); }
            catch (Exception error) { result = "更新失败，保留现有版本：" + error.getMessage(); }
            final String text = result;
            activity.runOnUiThread(() -> {
                busy = false;
                if (activity.isDestroyed() || activity.isFinishing()) return;
                message = text;
                refresh();
                resumeInstall();
            });
        });
    }

    private JSONObject json(String url) throws Exception {
        File file = new File(activity.getCacheDir(), "update-metadata.json");
        try {
            UpdateFiles.download(url, file, 2 * 1024 * 1024);
            return new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
        } finally { Files.deleteIfExists(file.toPath()); }
    }

    void checkWeb() {
        if (!enabled()) return;
        run(() -> {
            JSONObject manifest = json(PAGES + "update.json");
            String version = manifest.getString("version");
            long size = manifest.getLong("bytes");
            if (manifest.getInt("schema") != 1 || !version.matches("[a-f0-9]{64}")
                    || !version.equals(manifest.getString("sha256")) || size <= 0 || size > UpdateFiles.LIMIT)
                throw new Exception("资源清单无效，请升级 APK");
            if (version.equals(preferences.getString("version", "")) && source() != null)
                return "已缓存最新资源。可点击重新加载。";
            File zip = new File(cache, "download.zip");
            File stage = new File(cache, "staging");
            try {
                UpdateFiles.download(PAGES + "web.zip", zip, UpdateFiles.LIMIT);
                if (zip.length() != size || !version.equals(UpdateFiles.sha256(zip)))
                    throw new Exception("资源校验失败，站点可能正在发布，请稍后重试");
                UpdateFiles.delete(stage);
                UpdateFiles.extract(zip, stage);
                File destination = new File(cache, version);
                // A previously downloaded immutable version can still be serving the current page.
                if (!destination.exists() && !stage.renameTo(destination)) throw new Exception("无法保存缓存");
                if (!preferences.edit().putString("version", version).commit()) throw new Exception("无法保存版本设置");
                return "最新资源已完整缓存；点击重新加载后生效。";
            } finally {
                UpdateFiles.delete(zip);
                UpdateFiles.delete(stage);
            }
        });
    }

    @SuppressWarnings("deprecation")
    private void downloadApk() {
        run(() -> {
            JSONObject release = json(RELEASE);
            JSONArray assets = release.getJSONArray("assets");
            JSONObject selected = null;
            for (int i = 0; i < assets.length(); i++) {
                JSONObject asset = assets.getJSONObject(i);
                if ("moyu-arcade.apk".equals(asset.getString("name"))) selected = asset;
            }
            if (selected == null) throw new Exception("尚无已签名 APK 发布包");
            String url = selected.getString("browser_download_url");
            if (!url.startsWith("https://github.com/coffeeeeffoc/small-games/releases/download/"))
                throw new Exception("APK 下载地址无效");
            File directory = new File(activity.getCacheDir(), "apk-updates");
            if (!directory.isDirectory() && !directory.mkdir()) throw new Exception("无法创建下载目录");
            File file = new File(directory, "update.apk");
            try {
                UpdateFiles.download(url, file, UpdateFiles.LIMIT);
                String digest = selected.getString("digest");
                if (!digest.equals("sha256:" + UpdateFiles.sha256(file))) throw new Exception("APK 校验失败");
                PackageManager manager = activity.getPackageManager();
                PackageInfo candidate = manager.getPackageArchiveInfo(file.toString(), PackageManager.GET_SIGNATURES);
                PackageInfo current = manager.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNATURES);
                if (candidate == null || !activity.getPackageName().equals(candidate.packageName)) throw new Exception("APK 包名不匹配");
                if (current.signatures == null || current.signatures.length == 0
                        || !Arrays.equals(current.signatures, candidate.signatures)) throw new Exception("APK 签名与当前应用不一致，请使用同一签名发布");
                if (candidate.versionCode <= current.versionCode) return "当前 APK 已是最新版本。";
                // Install only the verified file, after returning to the UI thread.
                activity.runOnUiThread(() -> pendingApk = file);
                return "APK 已下载并校验，请在系统界面确认安装。";
            } catch (Exception error) {
                UpdateFiles.delete(file);
                throw error;
            }
        });
    }

    void resumeInstall() {
        if (pendingApk == null) return;
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(activity).setMessage("安装更新需要允许本应用安装未知来源应用。授权后返回即可继续安装。")
                    .setPositiveButton("去设置", (dialog, which) -> {
                        try { activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + activity.getPackageName()))); }
                        catch (android.content.ActivityNotFoundException error) { message = "无法打开安装权限设置"; refresh(); }
                    }).setNegativeButton("取消", (dialog, which) -> pendingApk = null).show();
            return;
        }
        File file = pendingApk;
        pendingApk = null;
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", file);
            activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
        } catch (android.content.ActivityNotFoundException error) { message = "未找到系统安装程序"; refresh(); }
    }

}
