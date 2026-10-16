import ActivityKit
import Capacitor
import Foundation
import WidgetKit

/// The web app's bridge to Live Activities (see src/liveActivity.ts). One commute shows at a time: showing a commute
/// updates its Live Activity if it's already up, starts it if not, and ends any other commute's.
/// Each Live Activity also gets a push token from iOS, sent to the web app as a "pushToken" event; our API uses it to
/// keep the times fresh while the app is closed (LiveActivityUpdater).
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWidgetCommutes", returnType: CAPPluginReturnPromise),
    ]

    // The Live Activities whose push tokens are being passed on, so each is watched once.
    private var watched = Set<String>()

    /// False before iOS 16.2, or when the user turned Live Activities off for NextTrain in iOS Settings.
    @objc func isAvailable(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve(["available": false]) }
        call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
    }

    @objc func show(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        guard let commuteId = call.getInt("commuteId"),
              let stationName = call.getString("stationName"),
              let destination = call.getString("destination"),
              let lineName = call.getString("lineName"),
              let lineColor = call.getString("lineColor"),
              let lineTextColor = call.getString("lineTextColor"),
              let endsAt = call.getDouble("endsAt")
        else { return call.reject("Missing commute details") }

        let departures = (call.getArray("departures") ?? []).compactMap { ($0 as? NSNumber)?.doubleValue }
        let state = CommuteActivityAttributes.ContentState(departures: departures, alert: call.getString("alert"), endsAt: endsAt)
        // Stale when the next train leaves (or the window ends): iOS redraws it then, so the countdown moves on to the
        // train after without waiting for an update. The server's pushes do the same (LiveActivityUpdater).
        let now = Date.now.timeIntervalSince1970
        let next = departures.first { $0 > now }.map { min($0, endsAt) } ?? endsAt
        let content = ActivityContent(state: state, staleDate: Date(timeIntervalSince1970: next))

        Task {
            var current: Activity<CommuteActivityAttributes>?
            for activity in Activity<CommuteActivityAttributes>.activities {
                if current == nil && activity.attributes.commuteId == commuteId {
                    current = activity
                } else {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
            if let current {
                await current.update(content)
                self.watchPushToken(current, endsAt: endsAt)
                return call.resolve()
            }
            do {
                let attributes = CommuteActivityAttributes(
                    commuteId: commuteId, stationName: stationName, destination: destination,
                    lineName: lineName, lineColor: lineColor, lineTextColor: lineTextColor)
                let activity = try Activity.request(attributes: attributes, content: content, pushType: .token)
                self.watchPushToken(activity, endsAt: endsAt)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Saves the commutes for the Home Screen widget, with the API's address so it can fetch live times itself, and
    /// redraws it. Home calls it whenever your commutes change; Delete my data calls it with none.
    @objc func setWidgetCommutes(_ call: CAPPluginCall) {
        let saved: [String: Any] = ["apiUrl": call.getString("apiUrl") ?? "", "commutes": call.getArray("commutes") ?? []]
        if let data = try? JSONSerialization.data(withJSONObject: saved) {
            SharedCommutes.save(data)
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /// Passes each push token iOS gives this Live Activity (now, and whenever it changes) to the web app, which sends it
    /// to our API. Kept until JavaScript listens, since this can happen before the page has loaded.
    @available(iOS 16.2, *)
    private func watchPushToken(_ activity: Activity<CommuteActivityAttributes>, endsAt: Double) {
        guard watched.insert(activity.id).inserted else { return }
        Task {
            for await data in activity.pushTokenUpdates {
                let token = data.map { String(format: "%02x", $0) }.joined()
                self.notifyListeners("pushToken", data: [
                    "commuteId": activity.attributes.commuteId, "token": token, "endsAt": endsAt,
                ], retainUntilConsumed: true)
            }
        }
    }

    @objc func endAll(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        Task {
            for activity in Activity<CommuteActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
