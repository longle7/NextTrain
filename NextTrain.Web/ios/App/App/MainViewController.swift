import Capacitor

/// The app's web view, plus NextTrain's own native plugins (Capacitor registers npm plugins by itself).
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
