package com.coffeeeeffoc.smallgames;

import java.io.*;
import java.nio.file.Files;
import java.util.zip.*;

public final class UpdateFilesCheck {
    public static void main(String[] args) throws Exception {
        File root = Files.createTempDirectory("web-update-check").toFile();
        try {
            File zip = new File(root, "web.zip");
            write(zip, "index.html", "hello");
            File destination = new File(root, "valid");
            UpdateFiles.extract(zip, destination);
            assert Files.readString(new File(destination, "index.html").toPath()).equals("hello");
            assert UpdateFiles.sha256(new File(destination, "index.html")).equals("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
            write(zip, "../escape.html", "bad");
            try { UpdateFiles.extract(zip, new File(root, "invalid")); throw new AssertionError("Accepted traversal"); }
            catch (IOException expected) { assert !new File(root, "escape.html").exists(); }
            write(zip, "other.html", "missing index");
            try { UpdateFiles.extract(zip, new File(root, "missing")); throw new AssertionError("Accepted incomplete bundle"); }
            catch (IOException expected) { /* Expected. */ }
            try { UpdateFiles.copy(new ByteArrayInputStream(new byte[5]), new ByteArrayOutputStream(), 4); throw new AssertionError("Accepted oversized payload"); }
            catch (IOException expected) { /* Expected. */ }
            System.out.println("Update hash, extraction, traversal, incomplete bundle and size checks passed");
        } finally { UpdateFiles.delete(root); }
    }

    private static void write(File file, String path, String content) throws Exception {
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(file))) {
            zip.putNextEntry(new ZipEntry(path));
            zip.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zip.closeEntry();
        }
    }
}
