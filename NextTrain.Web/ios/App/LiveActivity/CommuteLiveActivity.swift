import ActivityKit
import SwiftUI
import WidgetKit

// The Live Activity's look: Lock Screen and Dynamic Island. The app decides when it shows (see LiveActivityPlugin).
// The same extension holds the Home Screen widget (NextCommuteWidget.swift).

@main
struct LiveActivityBundle: WidgetBundle {
    var body: some Widget {
        CommuteLiveActivity()
        NextCommuteWidget()
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
                    HStack(spacing: 6) {
                        NextTrainLogo().frame(width: 22, height: 22)
                        LineBadge(attributes: context.attributes)
                    }
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
                NextTrainLogo().frame(width: 20, height: 20)
            } compactTrailing: {
                // The next train's line color, then its countdown.
                HStack(spacing: 4) {
                    Circle()
                        .fill(Color(hex: context.attributes.lineColor))
                        .frame(width: 8, height: 8)
                    Countdown(state: context.state, isStale: context.isStale)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: 64)
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

/// Counts down to the next train on its own, without updates from the app. When that train leaves, the activity goes
/// stale and iOS redraws it, so this moves on to the train after. Once the commute is over, or every known train has
/// left, it shows a dash rather than a wrong time.
struct Countdown: View {
    let state: CommuteActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        if !isOver(state, isStale: isStale), let next = upcoming(state).first {
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
        if isOver(state, isStale: isStale) {
            Text("Commute over. Open NextTrain for live times.").font(.footnote).foregroundStyle(.secondary)
        } else if !later.isEmpty {
            Text("Then " + later.map { $0.formatted(date: .omitted, time: .shortened) }.joined(separator: ", "))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

/// The NextTrain logo (public/favicon.svg) without its dark tile, which the Dynamic Island's black would hide anyway: a
/// train front over rails in the four subway colors. Drawn in the SVG's units, cropped to the drawing (x 10-54, y 7-56).
struct NextTrainLogo: View {
    var body: some View {
        Canvas { context, size in
            let scale = min(size.width / 44, size.height / 49)
            context.translateBy(x: (size.width - 44 * scale) / 2, y: (size.height - 49 * scale) / 2)
            context.scaleBy(x: scale, y: scale)
            context.translateBy(x: -10, y: -7)
            let dark = Color(hex: "#171717")
            func rounded(_ x: Double, _ y: Double, _ width: Double, _ height: Double, _ radius: Double) -> Path {
                Path(roundedRect: CGRect(x: x, y: y, width: width, height: height), cornerRadius: radius)
            }
            context.fill(rounded(18, 8, 28, 35, 8), with: .color(.white)) // the train's front
            context.fill(rounded(22.5, 13, 19, 12, 3), with: .color(dark)) // windshield
            for x in [25.5, 38.5] { // headlights
                context.fill(Path(ellipseIn: CGRect(x: x - 2.6, y: 31.9, width: 5.2, height: 5.2)), with: .color(dark))
            }
            var legs = Path()
            legs.move(to: CGPoint(x: 25, y: 43.5))
            legs.addLine(to: CGPoint(x: 21, y: 50))
            legs.move(to: CGPoint(x: 39, y: 43.5))
            legs.addLine(to: CGPoint(x: 43, y: 50))
            context.stroke(legs, with: .color(.white), style: StrokeStyle(lineWidth: 3.6, lineCap: .round))
            for (x, hex) in [(11.0, "#E0392B"), (22.0, "#F2A11F"), (33.0, "#22A355"), (44.0, "#3B82F6")] { // the rails
                context.fill(rounded(x, 51, 9.5, 4.5, 2.25), with: .color(Color(hex: hex)))
            }
        }
        .accessibilityHidden(true)
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
    let name: String
    let color: String
    let textColor: String

    var body: some View {
        Text(name)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color(hex: color)))
            .foregroundStyle(Color(hex: textColor))
    }
}

// In an extension, so Swift still generates LineBadge(name:color:textColor:) for the widget.
extension LineBadge {
    init(attributes: CommuteActivityAttributes) {
        self.init(name: attributes.lineName, color: attributes.lineColor, textColor: attributes.lineTextColor)
    }
}

/// Whether the commute window has ended. Content from before endsAt existed has only the stale date, which was then the
/// window's end.
private func isOver(_ state: CommuteActivityAttributes.ContentState, isStale: Bool) -> Bool {
    state.endsAt.map { Date.now.timeIntervalSince1970 >= $0 } ?? isStale
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
