package com.family.mylittlelearningworld;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Hosts the learning app (assets/www) in Android's built-in WebView.
 * Files are served from inside the APK at https://app.local/, so nothing is
 * ever fetched from the internet (the app has no INTERNET permission).
 */
public class MainActivity extends Activity {
    private static final String HOST = "app.local";
    private static final int REQ_FILE = 1;
    private static final int REQ_PERMS = 2;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutput;
    private PermissionRequest pendingWebPermission;
    private boolean pendingCameraChooser;
    private WebChromeClient.FileChooserParams pendingParams;

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "application/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("m4a", "audio/mp4");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("png", "image/png");
        MIME.put("svg", "image/svg+xml");
        MIME.put("ttf", "font/ttf");
        MIME.put("ico", "image/x-icon");
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#FFF8EC"));
        setContentView(web);
        hideSystemBars();

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false); // narration starts by itself
        ws.setTextZoom(100); // ignore the tablet's font-size setting so layouts fit
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(true);
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!HOST.equals(u.getHost())) {
                    // Anything outside the app is blocked.
                    return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", null, null);
                }
                return serveAsset(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                if (params.isCaptureEnabled() && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    pendingCameraChooser = true;
                    pendingParams = params;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_PERMS);
                    return true;
                }
                openChooser(params.isCaptureEnabled());
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                List<String> needed = new ArrayList<>();
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                        needed.add(Manifest.permission.RECORD_AUDIO);
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                        needed.add(Manifest.permission.CAMERA);
                }
                if (needed.isEmpty()) {
                    request.grant(request.getResources());
                } else {
                    pendingWebPermission = request;
                    requestPermissions(needed.toArray(new String[0]), REQ_PERMS);
                }
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        String file = "www" + path;
        String ext = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1).toLowerCase() : "";
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            InputStream in = getAssets().open(file);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            String enc = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") ? "utf-8" : null;
            return new WebResourceResponse(mime, enc, 200, "OK", headers, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
        }
    }

    // Lets the parent take a photo or choose one from the gallery.
    private void openChooser(boolean cameraOnly) {
        Intent camera = null;
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME, "learning-photo-" + System.currentTimeMillis() + ".jpg");
            v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            cameraOutput = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutput);
            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        }
        Intent target;
        if (cameraOnly && camera != null) {
            target = camera;
        } else {
            Intent gallery = new Intent(Intent.ACTION_GET_CONTENT);
            gallery.addCategory(Intent.CATEGORY_OPENABLE);
            gallery.setType("image/*");
            target = Intent.createChooser(gallery, "Choose a photo");
            if (camera != null) target.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        }
        try {
            startActivityForResult(target, REQ_FILE);
        } catch (Exception e) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) result = new Uri[]{data.getData()};
            else if (cameraOutput != null) result = new Uri[]{cameraOutput};
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ_PERMS) return;
        if (pendingWebPermission != null) {
            boolean ok = true;
            for (int r : results) ok &= r == PackageManager.PERMISSION_GRANTED;
            if (ok) pendingWebPermission.grant(pendingWebPermission.getResources());
            else pendingWebPermission.deny();
            pendingWebPermission = null;
        }
        if (pendingCameraChooser) {
            pendingCameraChooser = false;
            openChooser(pendingParams != null && pendingParams.isCaptureEnabled());
            pendingParams = null;
        }
    }

    // The tablet's Back button goes back inside the app; it never quits from Home.
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__appBack ? window.__appBack() : false", null);
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.__appPause && window.__appPause()", null);
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }
}
