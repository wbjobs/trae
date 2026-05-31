-keep class com.doccorrection.** { *; }
-keep class com.doccorrection.DocumentCorrectionSDK { *; }
-keep class com.doccorrection.DocumentCorrectionSDKJava { *; }

-keepclasseswithmembernames class * {
    native <methods>;
}

-keep class android.graphics.Bitmap { *; }
