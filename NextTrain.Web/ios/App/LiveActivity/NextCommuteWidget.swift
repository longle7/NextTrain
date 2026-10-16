import SwiftUI
import WidgetKit

// The Home Screen and Lock Screen widget: your commute that's on now (or the next one), with its next trains or buses
// counting down. The app passes the commutes (SharedCommutes, saved by Home); the widget fetches live times itself from
// the same public predictions API the app uses, with no user ID.

/// One commute as the app saves it for the widget (src/liveActivity.ts, widgetCommutes).
struct WidgetCommute: Decodable {
    let stopId: String
    let stationName: String
    let routeId: String
    let directionId: Int
    let destination: String
    let lineName: String     // the badge text, e.g. "RL" or "SL1"
    let lineColor: String
    let lineTextColor: String
    let windowStart: String  // "07:45:00", Boston time
    let windowEnd: String
    let activeDays: String   // "Mon,Tue,Wed,Thu,Fri"
}

private struct SavedCommutes: Decodable {
    let apiUrl: String
    let commutes: [WidgetCommute]
}

struct CommuteEntry: TimelineEntry {
    let date: Date
    let commute: WidgetCommute?
    let isOn: Bool          // on now, or starting within 15 minutes: live times
    let startsAt: Date?     // when it's next on
    let departures: [Date]  // soonest first
}

/// When commutes are on, in Boston time like the app (Home's "Now until 8:15 AM").
enum CommuteSchedule {
    struct Window {
        let commute: WidgetCommute
        let start: Date
        let end: Date
    }

    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        return calendar
    }()
    private static let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    /// The commute that's on now, else the one that starts soonest within the week.
    static func next(_ commutes: [WidgetCommute], after now: Date) -> Window? {
        commutes.compactMap { window(of: $0, after: now) }.min { $0.start < $1.start }
    }

    // This commute's next window that hasn't ended: today's, or one of the next seven days'.
    private static func window(of commute: WidgetCommute, after now: Date) -> Window? {
        let today = calendar.startOfDay(for: now)
        for offset in 0..<8 {
            guard let day = calendar.date(byAdding: .day, value: offset, to: today),
                  commute.activeDays.split(separator: ",").contains(Substring(days[calendar.component(.weekday, from: day) - 1])),
                  let start = time(commute.windowStart, on: day),
                  let end = time(commute.windowEnd, on: day),
                  end > now
            else { continue }
            return Window(commute: commute, start: start, end: end)
        }
        return nil
    }

    private static func time(_ value: String, on day: Date) -> Date? {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        return parts.count >= 2 ? calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day) : nil
    }
}

struct NextCommuteProvider: TimelineProvider {
    func placeholder(in context: Context) -> CommuteEntry { .sample }

    func getSnapshot(in context: Context, completion: @escaping (CommuteEntry) -> Void) {
        if context.isPreview { return completion(.sample) }
        Task { completion(await Self.entry(now: .now)) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CommuteEntry>) -> Void) {
        Task {
            let entry = await Self.entry(now: .now)
            // While it's on, fresh times every 5 minutes (the countdown ticks by itself in between). Otherwise, wake up
            // 15 minutes before it's next on, or in 6 hours if there's nothing coming up.
            let next = entry.isOn
                ? Date.now.addingTimeInterval(5 * 60)
                : entry.startsAt?.addingTimeInterval(-15 * 60) ?? Date.now.addingTimeInterval(6 * 3600)
            completion(Timeline(entries: [entry], policy: .after(max(next, Date.now.addingTimeInterval(60)))))
        }
    }

    static func entry(now: Date) async -> CommuteEntry {
        guard let data = SharedCommutes.load(),
              let saved = try? JSONDecoder().decode(SavedCommutes.self, from: data),
              let window = CommuteSchedule.next(saved.commutes, after: now)
        else { return CommuteEntry(date: now, commute: nil, isOn: false, startsAt: nil, departures: []) }
        let isOn = window.start.addingTimeInterval(-15 * 60) <= now
        let departures = isOn ? await liveDepartures(window.commute, api: saved.apiUrl) : []
        return CommuteEntry(date: now, commute: window.commute, isOn: isOn, startsAt: window.start, departures: departures)
    }

    private struct Prediction: Decodable {
        let departureTime: Date
    }

    // The commute's next three departures, from the app's own API (public: no user ID).
    private static func liveDepartures(_ commute: WidgetCommute, api: String) async -> [Date] {
        var url = URLComponents(string: "\(api)/stations/\(commute.stopId)/predictions")
        url?.queryItems = [
            URLQueryItem(name: "route", value: commute.routeId),
            URLQueryItem(name: "direction", value: String(commute.directionId)),
        ]
        guard let request = url?.url, let (data, _) = try? await URLSession.shared.data(from: request) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let predictions = (try? decoder.decode([Prediction].self, from: data)) ?? []
        return Array(predictions.map(\.departureTime).filter { $0 > .now }.sorted().prefix(3))
    }
}

struct NextCommuteWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NextCommute", provider: NextCommuteProvider()) { entry in
            NextCommuteView(entry: entry)
        }
        .configurationDisplayName("Next commute")
        .description("Your commute's next trains or buses, counting down.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct NextCommuteView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CommuteEntry

    // Departures that haven't left as of when the widget is drawn (it can be drawn after the times were fetched).
    private var upcoming: [Date] { entry.departures.filter { $0 > .now } }

    var body: some View {
        switch family {
        case .accessoryInline: inline.widgetBackground(clear: true)
        case .accessoryRectangular: rectangular.widgetBackground(clear: true)
        default: tile.widgetBackground(clear: false)
        }
    }

    @ViewBuilder private var tile: some View {
        if let commute = entry.commute {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    LineBadge(name: commute.lineName, color: commute.lineColor, textColor: commute.lineTextColor)
                    Text(commute.stationName).font(.headline).lineLimit(1)
                }
                Text("to \(commute.destination)").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: 0)
                if entry.isOn, let next = upcoming.first {
                    countdown(to: next).font(.system(size: 32, weight: .bold))
                    if upcoming.count > 1 {
                        Text("Then " + upcoming.dropFirst().map { $0.formatted(date: .omitted, time: .shortened) }.joined(separator: ", "))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                } else if entry.isOn {
                    Text("No times right now").font(.subheadline.weight(.semibold))
                } else if let start = entry.startsAt {
                    Text("Next: \(start.formatted(.dateTime.weekday(.abbreviated).hour().minute()))")
                        .font(.subheadline.weight(.semibold))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("NextTrain").font(.headline)
                Text("Save a commute in the app to see its next train here.").font(.subheadline).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    @ViewBuilder private var rectangular: some View {
        if let commute = entry.commute {
            VStack(alignment: .leading, spacing: 1) {
                Text("\(commute.lineName) · \(commute.stationName)").font(.headline).lineLimit(1)
                if entry.isOn, let next = upcoming.first {
                    countdown(to: next).font(.title3.bold())
                    Text("to \(commute.destination)").font(.caption).lineLimit(1)
                } else if entry.isOn {
                    Text("No times right now").font(.caption)
                } else if let start = entry.startsAt {
                    Text("Next: \(start.formatted(.dateTime.weekday(.abbreviated).hour().minute()))").font(.caption)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text("Save a commute in NextTrain").font(.caption)
        }
    }

    @ViewBuilder private var inline: some View {
        if let commute = entry.commute, entry.isOn, let next = upcoming.first {
            Text("\(commute.lineName) \(next.formatted(date: .omitted, time: .shortened)) to \(commute.destination)")
        } else if let commute = entry.commute, let start = entry.startsAt {
            Text("\(commute.lineName) \(commute.stationName) \(start.formatted(.dateTime.weekday(.abbreviated).hour().minute()))")
        } else {
            Text("NextTrain")
        }
    }

    // Counts down on its own between refreshes, like the Live Activity's.
    private func countdown(to next: Date) -> some View {
        Text(timerInterval: min(Date.now, next)...next, countsDown: true).monospacedDigit()
    }
}

private extension View {
    // iOS 17 and later ask widgets for their background; before that, it's padding and a fill.
    @ViewBuilder func widgetBackground(clear: Bool) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) { clear ? Color.clear : Color(.systemBackground) }
        } else {
            padding(clear ? 0 : 16).background(clear ? Color.clear : Color(.systemBackground))
        }
    }
}

extension CommuteEntry {
    // For the widget gallery and placeholders.
    static let sample = CommuteEntry(
        date: .now,
        commute: WidgetCommute(
            stopId: "place-pktrm", stationName: "Park Street", routeId: "Red", directionId: 1, destination: "Alewife",
            lineName: "RL", lineColor: "#DA291C", lineTextColor: "#FFFFFF", windowStart: "08:00:00", windowEnd: "09:00:00",
            activeDays: "Mon,Tue,Wed,Thu,Fri"),
        isOn: true,
        startsAt: nil,
        departures: [Date.now.addingTimeInterval(4 * 60), Date.now.addingTimeInterval(12 * 60)])
}
