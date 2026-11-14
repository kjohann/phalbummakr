#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn lists_installed_font_families_without_duplicates() {
        let fonts = super::system_fonts().expect("system fonts should be available");
        assert!(!fonts.is_empty());
        assert!(fonts.iter().all(|font| !font.trim().is_empty()));
        assert!(fonts
            .windows(2)
            .all(|pair| pair[0].to_lowercase() < pair[1].to_lowercase()));
    }
}
#[cfg(windows)]
pub fn system_fonts() -> Result<Vec<String>, String> {
    use std::{collections::BTreeMap, ptr};
    use windows_sys::Win32::Graphics::Gdi::{
        EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW,
    };

    unsafe extern "system" fn collect_font(
        font: *const LOGFONTW,
        _metric: *const TEXTMETRICW,
        _kind: u32,
        context: isize,
    ) -> i32 {
        // GDI calls this synchronously with pointers valid for the duration of enumeration.
        let names = unsafe { &mut *(context as *mut BTreeMap<String, String>) };
        let face = unsafe { &(*font).lfFaceName };
        let length = face
            .iter()
            .position(|&unit| unit == 0)
            .unwrap_or(face.len());
        let name = String::from_utf16_lossy(&face[..length]);
        if !name.trim().is_empty() && !name.starts_with('@') {
            names.entry(name.to_lowercase()).or_insert(name);
        }
        1
    }

    let dc = unsafe { GetDC(ptr::null_mut()) };
    if dc.is_null() {
        return Err(format!(
            "Could not access system fonts: {}",
            std::io::Error::last_os_error()
        ));
    }
    let mut font = LOGFONTW::default();
    font.lfCharSet = DEFAULT_CHARSET;
    let mut names: BTreeMap<String, String> = BTreeMap::new();
    let result = unsafe {
        EnumFontFamiliesExW(
            dc,
            &font,
            Some(collect_font),
            &mut names as *mut _ as isize,
            0,
        )
    };
    unsafe { ReleaseDC(ptr::null_mut(), dc) };
    if result == 0 || names.is_empty() {
        return Err("Could not enumerate system fonts.".into());
    }
    Ok(names.into_values().collect())
}

#[cfg(not(windows))]
pub fn system_fonts() -> Result<Vec<String>, String> {
    Err("System font discovery is only supported on Windows.".into())
}
