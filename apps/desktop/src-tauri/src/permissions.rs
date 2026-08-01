#[cfg(target_os = "macos")]
pub fn microphone_authorization_status() -> String {
    use objc2::rc::autoreleasepool;
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};

    autoreleasepool(|_| unsafe {
        let Some(media_type) = AVMediaTypeAudio else {
            return "unsupported".into();
        };
        match AVCaptureDevice::authorizationStatusForMediaType(media_type) {
            AVAuthorizationStatus::Authorized => "granted",
            AVAuthorizationStatus::Denied => "denied",
            AVAuthorizationStatus::Restricted => "restricted",
            _ => "not-requested",
        }
        .into()
    })
}

#[cfg(not(target_os = "macos"))]
pub fn microphone_authorization_status() -> String {
    "unsupported".into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn microphone_status_is_a_supported_product_state() {
        assert!([
            "granted",
            "denied",
            "restricted",
            "not-requested",
            "unsupported",
        ]
        .contains(&microphone_authorization_status().as_str()));
    }
}
