import SwiftUI
import WidgetKit

private struct VoiceCollectorEntry: TimelineEntry {
    let date: Date
}

private struct VoiceCollectorProvider: TimelineProvider {
    func placeholder(in context: Context) -> VoiceCollectorEntry { VoiceCollectorEntry(date: Date()) }

    func getSnapshot(in context: Context, completion: @escaping (VoiceCollectorEntry) -> Void) {
        completion(VoiceCollectorEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VoiceCollectorEntry>) -> Void) {
        completion(Timeline(entries: [VoiceCollectorEntry(date: Date())], policy: .never))
    }
}

private struct VoiceCollectorComplicationView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: "waveform.circle.fill")
                        .font(.system(size: 26, weight: .semibold))
                        .widgetAccentable()
                }
            case .accessoryCorner:
                Image(systemName: "waveform.circle.fill")
                    .font(.title2)
                    .widgetAccentable()
                    .widgetLabel { Text("VAD") }
            default:
                HStack(spacing: 5) {
                    Image(systemName: "waveform.circle.fill")
                        .widgetAccentable()
                    Text("开始VAD")
                        .font(.caption.bold())
                }
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "voicecollector://start-vad"))
    }
}

struct VoiceCollectorComplication: Widget {
    let kind = "VoiceCollectorStartVAD"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: VoiceCollectorProvider()) { _ in
            VoiceCollectorComplicationView()
        }
        .configurationDisplayName("Voice Collector VAD")
        .description("轻点后打开 Voice Collector 并开始语音检测录音。")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular])
    }
}

@main
struct VoiceCollectorComplicationBundle: WidgetBundle {
    var body: some Widget {
        VoiceCollectorComplication()
    }
}
