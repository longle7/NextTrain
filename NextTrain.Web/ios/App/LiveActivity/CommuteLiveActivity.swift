import ActivityKit
import SwiftUI
import WidgetKit

// The Live Activity's look: Lock Screen and Dynamic Island. The app decides when it shows (see LiveActivityPlugin).

@main
struct LiveActivityBundle: WidgetBundle {
    var body: some Widget {
        CommuteLiveActivity()
    }
}

struct CommuteLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CommuteActivityAttributes.self) { context in
            LockScreenView(attributes: context.attributes, state: context.state, isStale: context.isStale)
                .padding(16)
                .activityBackgroundTint(Color(white: 0.09))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    LineBadge(attributes: context.attributes)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: context.state, isStale: context.isStale)
                        .font(.title2.bold())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(context.attributes.stationName) to \(context.attributes.destination)")
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        LaterTrains(state: context.state, isStale: context.isStale)
                        AlertLine(state: context.state)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Circle()
                    .fill(Color(hex: context.attributes.lineColor))
                    .frame(width: 10, height: 10)
            } compactTrailing: {
                Countdown(state: context.state, isStale: context.isStale)
                    .frame(maxWidth: 56)
            } minimal: {
                Countdown(state: context.state, isStale: context.isStale)
            }
            .keylineTint(Color(hex: context.attributes.lineColor))
        }
    }
}

struct LockScreenView: View {
    let attributes: CommuteActivityAttributes
    let state: CommuteActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                LineBadge(attributes: attributes)
                Text(attributes.stationName).font(.headline).lineLimit(1)
                Spacer(minLength: 0)
            }
            HStack(alignment: .firstTextBaseline) {
                Text("to \(attributes.destination)").font(.subheadline).foregroundStyle(.secondary)
                Spacer()
                Countdown(state: state, isStale: isStale)
                    .font(.system(size: 34, weight: .bold))
            }
            LaterTrains(state: state, isStale: isStale)
            AlertLine(state: state)
        }
        .foregroundStyle(.white)
    }
}

/// Counts down to the next train on its own, without updates from the app. Once the commute is over (the activity
/// went stale), or every known train has left, it shows a dash rather than a wrong time.
struct Countdown: View {
    let state: CommuteActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        if !isStale, let next = upcoming(state).first {
            Text(timerInterval: Date.now...next, countsDown: true)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
        } else {
            Text("–")
        }
    }
}

/// "Then 8:11 AM, 8:15 AM", or "Commute over" once it's past.
struct LaterTrains: View {
    let state: CommuteActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        let later = upcoming(state).dropFirst()
        if isStale {
            Text("Commute over. Open NextTrain for live times.").font(.footnote).foregroundStyle(.secondary)
        } else if !later.isEmpty {
            Text("Then " + later.map { $0.formatted(date: .omitted, time: .shortened) }.joined(separator: ", "))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

struct AlertLine: View {
    let state: CommuteActivityAttributes.ContentState

    var body: some View {
        if let alert = state.alert {
            Label(alert, systemImage: "exclamationmark.triangle.fill")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.orange)
                .lineLimit(1)
        }
    }
}

struct LineBadge: View {
    let attributes: CommuteActivityAttributes

    var body: some View {
        Text(attributes.lineName)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color(hex: attributes.lineColor)))
            .foregroundStyle(Color(hex: attributes.lineTextColor))
    }
}

/// Departures that haven't left yet, as of when the view is drawn.
private func upcoming(_ state: CommuteActivityAttributes.ContentState) -> [Date] {
    state.departures.map { Date(timeIntervalSince1970: $0) }.filter { $0 > Date.now }
}

extension Color {
    /// "#DA291C" or "DA291C"; anything unreadable is gray.
    init(hex: String) {
        let value = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x80_80_80
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255)
    }
}
