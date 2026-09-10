package com.coffeeeeffoc.smallgames;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Bounded downloads and extraction; no files become active until the caller commits them. */
final class UpdateFiles {
    static final long LIMIT = 300L * 1024 * 1024;

    static void download(String address, File target, long limit) throws Exception {
        for (int redirects = 0; redirects < 6; redirects++) {
            URL url = new URL(address);
            String host = url.getHost();
            if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null
                    || (url.getPort() != -1 && url.getPort() != 443)
                    || !(host.equals("coffeeeeffoc.github.io") || host.equals("api.github.com")
                    || host.equals("github.com") || host.equals("release-assets.githubusercontent.com")
                    || host.equals("objects.githubusercontent.com"))) throw new IOException("不允许的更新地址");
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent", "SmallGames/" + "Android");
            connection.setRequestProperty("Cache-Control", "no-cache");
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("更新重定向无效");
                    address = new URL(url, location).toString();
                    continue;
                }
                if (status != 200) throw new IOException("更新服务器返回 HTTP " + status);
                if (connection.getContentLengthLong() > limit) throw new IOException("更新文件过大");
                try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(target)) {
                    copy(input, output, limit);
                }
                return;
            } finally { connection.disconnect(); }
        }
        throw new IOException("更新重定向次数过多");
    }

    static long copy(InputStream input, OutputStream output, long limit) throws IOException {
        byte[] buffer = new byte[32768];
        long size = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            size += count;
            if (size > limit) throw new IOException("更新文件超出大小限制");
            output.write(buffer, 0, count);
        }
        return size;
    }

    static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[32768];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format("%02x", value & 255));
        return hex.toString();
    }

    static void extract(File archive, File directory) throws Exception {
        if (!directory.mkdir()) throw new IOException("无法创建缓存目录");
        String prefix = directory.getCanonicalPath() + File.separator;
        HashSet<String> paths = new HashSet<>();
        long remaining = LIMIT;
        try (ZipInputStream zip = new ZipInputStream(new FileInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                File target = new File(directory, entry.getName());
                String path = target.getCanonicalPath();
                if (!path.startsWith(prefix) || entry.getName().contains("\\")
                        || !paths.add(path) || paths.size() > 10000) throw new IOException("资源包路径无效");
                if (entry.isDirectory()) {
                    if (!target.isDirectory() && !target.mkdirs()) throw new IOException("无法创建资源目录");
                } else {
                    File parent = target.getParentFile();
                    if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("无法创建资源目录");
                    try (OutputStream output = new FileOutputStream(target)) { remaining -= copy(zip, output, remaining); }
                }
            }
        }
        if (!new File(directory, "index.html").isFile()) throw new IOException("资源包缺少首页");
    }

    static void delete(File file) throws IOException {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        Files.deleteIfExists(file.toPath());
    }
}
