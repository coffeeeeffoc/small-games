import UIKit
import WebKit
import UniformTypeIdentifiers

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = GameController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

// The same stable origin serves every bundled game, including module imports and fetch(audio).
final class LocalAssets: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        do {
            guard let url = urlSchemeTask.request.url, url.host == "localhost",
                  let root = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true) else {
                throw URLError(.badURL)
            }
            let path = url.path == "/" ? "/index.html" : url.path
            let file = root.appendingPathComponent(String(path.dropFirst())).resolvingSymlinksInPath().standardizedFileURL
            guard file.path.hasPrefix(root.resolvingSymlinksInPath().path + "/") else { throw URLError(.noPermissionsToReadFile) }
            let data = try Data(contentsOf: file, options: .mappedIfSafe)
            let types = ["js": "text/javascript", "mjs": "text/javascript", "css": "text/css", "wasm": "application/wasm", "gltf": "model/gltf+json", "glb": "model/gltf-binary"]
            let mime = types[file.pathExtension] ?? UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            urlSchemeTask.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: mime.hasPrefix("text/") ? "utf-8" : nil))
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch { urlSchemeTask.didFailWithError(error) }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

final class GameController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var web: WKWebView!
    private let home = URL(string: "app://localhost/index.html")!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(LocalAssets(), forURLScheme: "app")
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        // WKWebView custom origins expose getRandomValues but may omit the secure-context UUID helper.
        configuration.userContentController.addUserScript(WKUserScript(source: """
        if (!crypto.randomUUID) crypto.randomUUID = () => {
          const b = crypto.getRandomValues(new Uint8Array(16));
          b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
          const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
          return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
        };
        """, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        let back = UIButton(type: .system)
        back.setTitle("返回目录", for: .normal)
        back.addTarget(self, action: #selector(goHome), for: .touchUpInside)
        let reload = UIButton(type: .system)
        reload.setTitle("重新加载", for: .normal)
        reload.addTarget(self, action: #selector(reloadPage), for: .touchUpInside)
        let bar = UIStackView(arrangedSubviews: [back, reload])
        bar.distribution = .fillEqually
        let stack = UIStackView(arrangedSubviews: [bar, web])
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 44)
        ])
        web.load(URLRequest(url: home))
    }

    @objc private func goHome() {
        web.evaluateJavaScript("(() => { const b = document.querySelector('.game-page > nav button'); if (!b) return false; if (!b.disabled) b.click(); return true; })()") { result, _ in
            if result as? Bool != true { self.web.load(URLRequest(url: self.home)) }
        }
    }

    @objc private func reloadPage() {
        let alert = UIAlertController(title: "重新加载？", message: "当前游戏将重新开始，已保存的进度保留。", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "重新加载", style: .default) { _ in self.web.reload() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "app" && url.host == "localhost" { decisionHandler(.allow); return }
        if (navigationAction.targetFrame?.isMainFrame ?? true) && ["https", "http"].contains(url.scheme ?? "") {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, url.scheme == "app", url.host == "localhost" {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        let alert = UIAlertController(title: "页面加载失败", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "返回目录", style: .default) { _ in self.web.load(URLRequest(url: self.home)) })
        present(alert, animated: true)
    }
}
