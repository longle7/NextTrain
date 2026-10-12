import Foundation
import Security

/// The commutes the Home Screen widget shows, passed from the app (LiveActivityPlugin.setWidgetCommutes) to the
/// LiveActivity extension's widget (NextCommuteWidget). Built into both targets, like CommuteActivityAttributes.
///
/// They share a keychain access group rather than an App Group: every provisioning profile already allows the team's
/// keychain groups, so the cloud-signed TestFlight build needs no setup in the Apple Developer account. The group is
/// listed in App.entitlements and LiveActivity.entitlements.
enum SharedCommutes {
    // The team's keychain prefix (Team ID 3CXXU244US, public) plus the group's name.
    static let accessGroup = "3CXXU244US.com.longledev.nexttrain.shared"

    private static let item: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.longledev.nexttrain.widget",
        kSecAttrAccount as String: "commutes",
        kSecAttrAccessGroup as String: accessGroup,
    ]

    static func save(_ data: Data) {
        SecItemDelete(item as CFDictionary)
        var added = item
        added[kSecValueData as String] = data
        // Readable once the phone has been unlocked since it started, so the Lock Screen widget can refresh.
        added[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(added as CFDictionary, nil)
    }

    static func load() -> Data? {
        var query = item
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        return SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess ? result as? Data : nil
    }
}
