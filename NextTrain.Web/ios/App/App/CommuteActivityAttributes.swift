import ActivityKit
import Foundation

/// One commute's Live Activity. Shared by the app, which starts and updates it (LiveActivityPlugin), and the
/// LiveActivity extension, which draws it on the Lock Screen and in the Dynamic Island.
/// Times are Unix seconds: simple to send from the web app now, and from the server later.
@available(iOS 16.1, *)
struct CommuteActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var departures: [Double] // the next trains' departure times, soonest first
        var alert: String?       // the worst service alert on this commute, if any
    }

    var commuteId: Int
    var stationName: String  // "Park Street"
    var destination: String  // "Alewife"
    var lineName: String     // the badge text, e.g. "RL" or "GL B"
    var lineColor: String    // "#DA291C"
    var lineTextColor: String
}
