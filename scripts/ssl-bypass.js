/*
 * Frida script: обход distinctive certificate pinning реализаций на Android.
 * Основано на публичных методиках обхода TrustManager/OkHttp/Conscrypt pinning
 * (см. https://github.com/httptoolkit/frida-android-unpinning как референс).
 *
 * Запуск:
 *   frida -U -f com.tencent.mm -l ssl-bypass.js --no-pause
 *
 * Назначение: лабораторная демонстрация того, что приложения без надёжного
 * pinning (или с pinning, который можно перехватить на уровне Java API)
 * позволяют MITM через установленный системный CA. Если скрипт НЕ даёт
 * эффекта — это тоже валидный результат: значит WeChat использует более
 * глубокий (нативный, не-Java) pinning, что стоит задокументировать в
 * findings/traffic-analysis.md.
 */

Java.perform(function () {
    console.log("[*] SSL bypass script loaded");

    // 1. Обход стандартного X509TrustManager
    try {
        var TrustManager = Java.registerClass({
            name: "com.lab.TrustManager",
            implements: [Java.use("javax.net.ssl.X509TrustManager")],
            methods: {
                checkClientTrusted: function (chain, authType) {},
                checkServerTrusted: function (chain, authType) {},
                getAcceptedIssuers: function () { return []; }
            }
        });

        var SSLContext = Java.use("javax.net.ssl.SSLContext");
        var TrustManagerArray = Java.array("javax.net.ssl.TrustManager", [TrustManager.$new()]);

        SSLContext.init.overload(
            "[Ljavax.net.ssl.KeyManager;",
            "[Ljavax.net.ssl.TrustManager;",
            "java.security.SecureRandom"
        ).implementation = function (keyManager, trustManager, secureRandom) {
            console.log("[+] Overriding SSLContext.init TrustManager");
            this.init(keyManager, TrustManagerArray, secureRandom);
        };
    } catch (e) {
        console.log("[-] X509TrustManager hook failed: " + e);
    }

    // 2. Обход OkHttp3 CertificatePinner (часто используется в китайских SDK)
    try {
        var CertificatePinner = Java.use("okhttp3.CertificatePinner");
        CertificatePinner.check.overload("java.lang.String", "java.util.List").implementation = function (hostname, certs) {
            console.log("[+] Bypassing OkHttp3 CertificatePinner for " + hostname);
            return;
        };
    } catch (e) {
        console.log("[-] OkHttp3 CertificatePinner not found (возможно не используется): " + e);
    }

    // 3. Обход TrustManagerImpl.verifyChain (Android 7+ системная проверка)
    try {
        var TrustManagerImpl = Java.use("com.android.org.conscrypt.TrustManagerImpl");
        TrustManagerImpl.verifyChain.implementation = function (untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
            console.log("[+] Bypassing TrustManagerImpl.verifyChain for " + host);
            return untrustedChain;
        };
    } catch (e) {
        console.log("[-] TrustManagerImpl hook failed: " + e);
    }

    console.log("[*] All available hooks installed. Launch app traffic now.");
});
