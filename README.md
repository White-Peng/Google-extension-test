# Reflection Tracker 安卓示例

该仓库提供一个可运行的 Android 示例应用（位于 `reflection-tracker/`），演示如何通过无障碍服务实时提取 Chrome 浏览地址，并将数据写入本地数据库，以便触发学习反思或提示。

## 核心特性
- 无障碍服务 (`ReflectionAccessibilityService`) 监听 `com.android.chrome` 的地址栏节点，自动去重并落库。
- Room + Kotlin 协程持久化浏览事件，并在 Compose UI 中以时间倒序展示。
- 应用内一键跳转到系统无障碍设置、申请通知权限、清空本地记录。
- 前台通知与权限说明，确保服务在后台稳定运行。

## 目录结构
```
reflection-tracker/
├── app/build.gradle.kts          // Compose + Room 依赖配置
├── app/src/main/AndroidManifest.xml
├── app/src/main/java/com/example/reflectiontracker/
│   ├── MainActivity.kt           // Compose UI & 权限指引
│   ├── data/                     // Room 实体、DAO、仓库
│   ├── service/ReflectionAccessibilityService.kt
│   └── ui/theme/                 // Compose 主题
└── settings.gradle.kts
```

## 运行方式
1. 使用 Android Studio（Ladybug 及以上版本）直接打开 `reflection-tracker/` 目录，首次同步时 IDE 会自动下载匹配的 Gradle 版本。
2. 连接一台运行 Android 8.0 (API 26) 及以上的真实设备或模拟器，点击“Run ▶︎”即可安装 `app`。若需要命令行编译，可在 IDE 生成 `gradlew` 后执行：
   ```bash
   cd reflection-tracker
   ./gradlew assembleDebug
   ```

## 测试步骤
1. 首次启动应用后，按提示授予通知权限（Android 13+）。
2. 点击“打开无障碍设置”，在系统界面中启用“Reflection Tracker”服务，允许其读取窗口内容。
3. 返回应用，可在首页看到“无障碍服务已开启”的状态提示。
4. 打开 Chrome（包名 `com.android.chrome`），正常浏览任意网页；切回应用即可看到最新 URL 和时间戳。
5. 点击“清空本地记录”可重置数据库内容。

## 权限与注意事项
- **无障碍服务**：用于读取可视化节点树，仅针对 Chrome 地址栏；若 Chrome 更新导致节点 ID 变化，可在 `ReflectionAccessibilityService` 中调整 `URL_BAR_ID`。
- **前台服务 + 通知**：保证在后台持续运行，Android 13+ 需手动授予通知权限。
- 数据默认保存在本地 `Room` 数据库（`browsing_events.db`），可按需扩展同步策略；请在产品化时提供隐私政策与停用入口。

如需将逻辑拓展到其他浏览器、加入反思问答模版或云端同步，可在现有架构基础上继续迭代。
