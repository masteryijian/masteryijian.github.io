# TechBridge 私有拜访采集

本目录仅包含代码，不包含录音、转写、客户资料、Token、配对文件、签名证书或 App 二进制。GitHub Pages不会执行本目录的Python或原生App。

## 已实现

- iPhone/iPad原生界面：客户拜访、后台VAD、人声片段、连续录音、离线上传队列、上传回执验证。
- 统一Mac SQLite录音授权：30秒服务器租约、客户端保守提前到期、续期失败停止、旧设备先停再由新设备获得授权；跨设备并行采集不作为离线降级策略。
- Apple Watch通过iPhone申请授权与上传；20%电量请求手机接力。手机可请求手表接力。手表保留音频直到iPhone明确确认已落盘。Watch离线时不新开独立监听。
- Mac只有在本机控制台明确请求接力后才开启麦克风；未获授权不打开音频流。
- 本地Qwen3-ASR-0.6B-4bit + LM Studio openai/gpt-oss-20b：每个人声片段入队、转写、整理，再整合拜访。20秒为分段上限，不是逐词实时流式转写。
- 文字与整理数据写入SQLite、独立JSON归档并fsync后，才清理原音频；失败、短片段未整理等情况保留。此前旧VoiceCollector数据不自动迁移或删除。
- 上传通过内容指纹去重，拜访ID随录音片段固化，避免切换客户后错归档；不上传仍在写入的VAD临时文件。
- 工作台读取控制台导出的证据JSON，生成待确认纪要；不会自动改变客户阶段、发信或执行模型待办。

## 运行与构建

Python环境参考pyproject.toml，Qwen MLX运行在独立Python环境。config.py列出模型路径；需按本机实际环境配置，不下载或伪装模型可用。LM Studio在127.0.0.1:1234运行。

iOS/Watch：在 ios/VoiceCollectorMobile 执行 xcodegen generate，然后在Xcode配置自己的Development Team，构建VoiceCollectorMobile scheme。手机和Mac同一局域网，并由用户允许本地网络与麦克风。Info.plist中的局域网IP例外应改成实际Mac地址，优先使用.local主机名；不关闭全局ATS。

Mac控制台 http://localhost:8877/visit 。局域网仅开放带Bearer Token的/api/mobile接口，管理页面限本机。Token由私有运行时生成，手机存入Keychain；不要把Pairing.json/config.json提交到仓库。

## 实际验证与限制

2026-10-17：iPhone 15 Pro安装启动成功，设备诊断确认连接Qwen ASR/GPT OSS服务，Mac库收到手机上传片段。合成语音端到端转写、整理、JSON归档、原音频删除已验证。Python核心13项测试通过；iOS/Watch构建成功。

标准XCUITest曾因设备系统自动化初始化超时失败，不能称UI自动化测试通过。Watch/iPad实机未连接，未完成其锁屏续航、接力与中断恢复测试；未测全天功耗。全时监听、极低功耗和无缝接力不作保证：强制关闭、系统挂起、电话占用、Mac睡眠及网络分区会中断。RTC租约属于保守应用级协调，不能改变Apple后台权限或硬件麦克风状态。

DeviceSmoke是显式启动参数 --opc-smoke-record 的15秒开发联调入口，不在正常启动时自动录音。正常使用须主动开始并取得在场者同意。

空ASR结果标记为未识别文字并保留原音频，不再永久显示等待整理。拜访整合包含有效的短片段原文；每版整合记录明确片段ID覆盖范围，后补转写也能触发更新。
