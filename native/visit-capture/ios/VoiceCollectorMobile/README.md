# Voice Collector iPhone

原生SwiftUI客户端。手动开始/停止录音，支持锁屏继续录音；文件先进入本机队列，上传成功后删除。断网或Mac不可用时保留文件，应用再次进入前台时重试。

v0.5增加后台自动VAD：用户手动开启一次后，可锁屏持续检测人声；保留约0.5秒前置音频，连续静音约1.2秒后自动结束、保存和上传，然后继续等待下一段。电话等系统音频中断结束后会尝试恢复。

v0.6增加Apple Watch和系统快捷指令；v0.6.2将同一个App扩展到iPad mini及其他iPad：

- Watch点按后由手表独立录音，录音结束后经iPhone上传Mac。
- Watch电量到20%时请求iPhone接力；iPhone可运行时自动开始，否则显示锁屏通知。iPhone确认开始前Watch继续录音。
- Watch到10%且仍未完成接力时停止并安全排队，防止掉电损坏文件。
- iPhone提供“开始录音”和“停止并上传”两个快捷指令动作。快捷指令启动只控制iPhone，不会停止Watch录音。
- Mac Web页面显示录音来自Mac、iPhone或Apple Watch。
- iPad支持横竖屏、手动录音、后台VAD、离线队列和快捷指令，Mac Web页面将来源显示为iPad。

v0.7增加Watch本地VAD和可见的通信诊断：

- Watch可选择连续录音或VAD监听；VAD仅保存检测到人声的片段。
- Watch VAD保留约0.5秒前置声音，静音约1.2秒后自动结束片段并继续等待。
- Watch和iPhone均显示连接状态，并提供“测试通信”按钮。
- Watch使用VAD且电量到20%时，iPhone接力后也开启VAD；连续录音同理。
- Watch的CAF VAD片段保持原格式传到iPhone，再进入现有Mac上传和转写队列。

v0.8增加表盘快捷入口：

- 可把“Voice Collector VAD”圆形图标添加到支持Complication的表盘。
- 轻点图标会打开Watch App，并自动开启VAD监听。
- Apple保留数码表冠长按给Siri，第三方App不能监听或替换这个系统动作。

## 生成Xcode工程

```bash
brew install xcodegen
cd ios/VoiceCollectorMobile
xcodegen generate
open VoiceCollectorMobile.xcodeproj
```

`xcodegen generate`结束时会自动修正Xcode 26的Watch嵌入目录，不需要手工修改工程文件。

在Xcode中：

1. 选择`VoiceCollectorMobile` target，在Signing & Capabilities中选择自己的Personal Team。
2. 选择`VoiceCollectorWatch` target，选择同一个Personal Team。
3. 选择`VoiceCollectorWatchComplications` target，也选择同一个Personal Team。
4. 先连接已配对Apple Watch的iPhone，再从运行设备中选择手表并运行。
5. iPhone首次打开时允许麦克风、本地网络和通知；Watch首次录音时允许麦克风。

## 把VAD图标放到表盘

1. 在iPhone打开`Watch` App，进入“我的表盘”，选择当前表盘。
2. 点一个支持复杂功能的位置，选择`Voice Collector VAD`。
3. 也可以在手表上长按表盘，点“编辑”，滑到“复杂功能”后选择它。
4. 轻点表盘上的波形图标，Watch App会打开并开始VAD；第一次需确认麦克风权限。

## 设置快捷指令

安装并至少打开一次v0.6后，进入“快捷指令”App：

1. 新建快捷指令，搜索`Voice Collector`。
2. 选择“开始录音”，保存为“开始录音”。
3. 可将它分配给操作按钮、主屏幕、锁屏或轻点背面。
4. 另建一个快捷指令，选择“停止并上传”。

快捷动作会把Voice Collector带到前台并自动执行，避免iOS在App被彻底挂起时拒绝启动麦克风。

## 测试Watch接力

不需要把手表真的用到20%：先在Watch点“开始录音”，然后点“测试手机接力”。iPhone若可直接接管，Watch会显示“iPhone已接力录音”并停止；否则iPhone显示通知，点通知后自动开始并通知Watch停止。
