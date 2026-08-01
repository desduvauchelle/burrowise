import AppKit
import UniformTypeIdentifiers

@objc(ShareViewController)
final class ShareViewController: NSViewController {
    private let appGroup = "group.ai.recursivesolutions.secondbrain"
    private let statusLabel = NSTextField(labelWithString: "Saving video to Burrowise…")
    private var started = false

    override func loadView() {
        let view = NSView(frame: NSRect(x: 0, y: 0, width: 360, height: 112))
        statusLabel.alignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        let progress = NSProgressIndicator()
        progress.style = .spinning
        progress.startAnimation(nil)
        progress.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(progress)
        view.addSubview(statusLabel)
        NSLayoutConstraint.activate([
            progress.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            progress.topAnchor.constraint(equalTo: view.topAnchor, constant: 22),
            statusLabel.topAnchor.constraint(equalTo: progress.bottomAnchor, constant: 12),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18)
        ])
        self.view = view
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        guard !started else { return }
        started = true
        acceptSharedMovies()
    }

    private func acceptSharedMovies() {
        let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroup
        ) ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0].appendingPathComponent("Burrowise", isDirectory: true)
        let inbox = container.appendingPathComponent("Share Inbox", isDirectory: true)
        do {
            try FileManager.default.createDirectory(
                at: inbox,
                withIntermediateDirectories: true
            )
        } catch {
            finish(error: "The Share Inbox could not be created.")
            return
        }

        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }
            .filter { $0.hasItemConformingToTypeIdentifier(UTType.movie.identifier) }
        guard !providers.isEmpty else {
            finish(error: "No supported video was included.")
            return
        }

        let group = DispatchGroup()
        let resultLock = NSLock()
        var failures = 0
        for provider in providers {
            let originalName = provider.suggestedName
            group.enter()
            provider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) {
                temporaryURL, error in
                defer { group.leave() }
                guard let temporaryURL, error == nil else {
                    resultLock.lock()
                    failures += 1
                    resultLock.unlock()
                    return
                }
                let identifier = UUID().uuidString.lowercased()
                let ext = temporaryURL.pathExtension.lowercased()
                let safeExtension = ["mp4", "mov", "m4v"].contains(ext) ? ext : "mov"
                let fileName = "\(identifier).\(safeExtension)"
                let destination = inbox.appendingPathComponent(fileName)
                let manifest = inbox.appendingPathComponent("\(identifier).json")
                do {
                    try FileManager.default.copyItem(at: temporaryURL, to: destination)
                    let payload: [String: String] = [
                        "fileName": fileName,
                        "originalName": originalName ?? temporaryURL.lastPathComponent
                    ]
                    let data = try JSONSerialization.data(
                        withJSONObject: payload,
                        options: [.prettyPrinted, .sortedKeys]
                    )
                    try data.write(to: manifest, options: .atomic)
                } catch {
                    try? FileManager.default.removeItem(at: destination)
                    resultLock.lock()
                    failures += 1
                    resultLock.unlock()
                }
            }
        }
        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            if failures == providers.count {
                self.finish(error: "The video could not be copied to Burrowise.")
                return
            }
            self.statusLabel.stringValue =
                failures == 0 ? "Saved. Opening Burrowise…" : "Some videos were saved. Opening Burrowise…"
            let url = URL(string: "burrowise://shared-video")!
            self.extensionContext?.open(url) { _ in
                self.extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }

    private func finish(error: String) {
        statusLabel.stringValue = error
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.extensionContext?.cancelRequest(
                withError: NSError(
                    domain: "ai.recursivesolutions.secondbrain.share",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: error]
                )
            )
        }
    }
}
