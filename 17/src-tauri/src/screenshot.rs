use image::{DynamicImage, ImageBuffer, Rgba};
use std::io::Cursor;
use std::sync::Mutex;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::*;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::*;
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::*;
#[cfg(target_os = "windows")]
use windows::Win32::UI::HighDpi::*;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

static DPI_INIT: Mutex<bool> = Mutex::new(false);

#[cfg(target_os = "windows")]
fn ensure_dpi_awareness() {
    if let Ok(mut initialized) = DPI_INIT.lock() {
        if !*initialized {
            unsafe {
                let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
                let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE);
                let _ = SetProcessDPIAware();
            }
            *initialized = true;
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn ensure_dpi_awareness() {}

pub fn get_dpi_scale() -> f64 {
    ensure_dpi_awareness();

    #[cfg(target_os = "windows")]
    unsafe {
        let hdc_screen = GetDC(HWND::default());
        if hdc_screen.is_invalid() {
            return 1.0;
        }

        let logical_x = GetDeviceCaps(hdc_screen, LOGPIXELSX);
        let logical_y = GetDeviceCaps(hdc_screen, LOGPIXELSY);

        let physical_x = GetDeviceCaps(hdc_screen, HORZRES);
        let physical_y = GetDeviceCaps(hdc_screen, VERTRES);

        ReleaseDC(HWND::default(), hdc_screen);

        let desktop = GetDesktopWindow();
        let mut rect = RECT::default();
        let _ = GetWindowRect(desktop, &mut rect);
        let logical_width = rect.right - rect.left;
        let logical_height = rect.bottom - rect.top;

        let scale_x = if logical_width > 0 {
            physical_x as f64 / logical_width as f64
        } else {
            1.0
        };

        let scale_from_dpi = logical_x as f64 / 96.0;

        let final_scale = if scale_x > 0.0 && scale_x < 5.0 {
            scale_x
        } else {
            scale_from_dpi
        };

        eprintln!(
            "DPI: logical={}x{}, physical={}x{}, logical_rect={}x{}, scale={:.2}",
            logical_x, logical_y, physical_x, physical_y,
            logical_width, logical_height, final_scale
        );

        final_scale
    }

    #[cfg(not(target_os = "windows"))]
    {
        1.0
    }
}

pub fn get_screen_size() -> Result<(u32, u32)> {
    ensure_dpi_awareness();

    #[cfg(target_os = "windows")]
    {
        unsafe {
            let desktop = GetDesktopWindow();
            let mut rect = RECT::default();
            let result = GetWindowRect(desktop, &mut rect);
            if result.as_bool() {
                let width = rect.right - rect.left;
                let height = rect.bottom - rect.top;
                eprintln!("Logical screen size: {}x{}", width, height);
                return Ok((width as u32, height as u32));
            }

            let width = GetSystemMetrics(SM_CXSCREEN);
            let height = GetSystemMetrics(SM_CYSCREEN);
            Ok((width as u32, height as u32))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok((1920, 1080))
    }
}

pub fn get_physical_screen_size() -> Result<(u32, u32)> {
    ensure_dpi_awareness();

    #[cfg(target_os = "windows")]
    unsafe {
        let hdc_screen = GetDC(HWND::default());
        if hdc_screen.is_invalid() {
            return Ok((1920, 1080));
        }

        let width = GetDeviceCaps(hdc_screen, DESKTOPHORZRES);
        let height = GetDeviceCaps(hdc_screen, DESKTOPVERTRES);

        ReleaseDC(HWND::default(), hdc_screen);

        if width > 0 && height > 0 {
            eprintln!("Physical screen size: {}x{}", width, height);
            Ok((width as u32, height as u32))
        } else {
            let scale = get_dpi_scale();
            let (logical_w, logical_h) = get_screen_size()?;
            Ok((
                (logical_w as f64 * scale) as u32,
                (logical_h as f64 * scale) as u32,
            ))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok((1920, 1080))
    }
}

pub fn logical_to_physical(x: i32, y: i32) -> (i32, i32) {
    let scale = get_dpi_scale();
    let phys_x = (x as f64 * scale).round() as i32;
    let phys_y = (y as f64 * scale).round() as i32;
    (phys_x, phys_y)
}

pub fn physical_to_logical(x: i32, y: i32) -> (i32, i32) {
    let scale = get_dpi_scale();
    let log_x = (x as f64 / scale).round() as i32;
    let log_y = (y as f64 / scale).round() as i32;
    (log_x, log_y)
}

#[cfg(target_os = "windows")]
pub fn capture_full_screen() -> Result<DynamicImage> {
    ensure_dpi_awareness();

    unsafe {
        let desktop = GetDesktopWindow();
        let hdc_screen = GetDC(HWND::default());
        if hdc_screen.is_invalid() {
            return Err("Failed to get screen DC".into());
        }

        let physical_w = GetDeviceCaps(hdc_screen, DESKTOPHORZRES) as i32;
        let physical_h = GetDeviceCaps(hdc_screen, DESKTOPVERTRES) as i32;

        let actual_w = if physical_w > 0 { physical_w } else { GetSystemMetrics(SM_CXSCREEN) };
        let actual_h = if physical_h > 0 { physical_h } else { GetSystemMetrics(SM_CYSCREEN) };

        eprintln!("Capturing physical screen: {}x{}", actual_w, actual_h);

        let hdc_memory = CreateCompatibleDC(hdc_screen);
        if hdc_memory.is_invalid() {
            ReleaseDC(HWND::default(), hdc_screen);
            return Err("Failed to create compatible DC".into());
        }

        let hbitmap = CreateCompatibleBitmap(hdc_screen, actual_w, actual_h);
        if hbitmap.is_invalid() {
            DeleteDC(hdc_memory);
            ReleaseDC(HWND::default(), hdc_screen);
            return Err("Failed to create compatible bitmap".into());
        }

        SelectObject(hdc_memory, hbitmap);

        let bitblt_result = BitBlt(
            hdc_memory,
            0,
            0,
            actual_w,
            actual_h,
            hdc_screen,
            0,
            0,
            SRCCOPY | CAPTUREBLT,
        );

        if !bitblt_result.as_bool() {
            let scale = get_dpi_scale();
            let blit_w = (actual_w as f64 / scale).round() as i32;
            let blit_h = (actual_h as f64 / scale).round() as i32;
            
            let stretch_result = StretchBlt(
                hdc_memory,
                0,
                0,
                actual_w,
                actual_h,
                hdc_screen,
                0,
                0,
                blit_w,
                blit_h,
                SRCCOPY | CAPTUREBLT,
            );
            
            if !stretch_result.as_bool() {
                DeleteObject(hbitmap);
                DeleteDC(hdc_memory);
                ReleaseDC(HWND::default(), hdc_screen);
                return Err("Both BitBlt and StretchBlt failed".into());
            }
        }

        let mut bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: actual_w,
                biHeight: -actual_h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD {
                rgbBlue: 0,
                rgbGreen: 0,
                rgbRed: 0,
                rgbReserved: 0,
            }; 1],
        };

        let buffer_size = (actual_w * actual_h * 4) as usize;
        let mut buffer: Vec<u8> = vec![0; buffer_size];

        GetDIBits(
            hdc_memory,
            hbitmap,
            0,
            actual_h as u32,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bitmap_info,
            DIB_RGB_COLORS,
        );

        let mut rgba_buffer = Vec::with_capacity(buffer_size);
        for i in (0..buffer.len()).step_by(4) {
            rgba_buffer.push(buffer[i + 2]);
            rgba_buffer.push(buffer[i + 1]);
            rgba_buffer.push(buffer[i]);
            rgba_buffer.push(255);
        }

        let img = ImageBuffer::<Rgba<u8>, _>::from_raw(
            actual_w as u32,
            actual_h as u32,
            rgba_buffer,
        ).ok_or("Failed to create image buffer")?;

        DeleteObject(hbitmap);
        DeleteDC(hdc_memory);
        ReleaseDC(HWND::default(), hdc_screen);

        Ok(DynamicImage::ImageRgba8(img))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn capture_full_screen() -> Result<DynamicImage> {
    let (width, height) = get_physical_screen_size()?;
    let img = ImageBuffer::from_pixel(width, height, Rgba([128, 128, 128, 255]));
    Ok(DynamicImage::ImageRgba8(img))
}

pub fn capture_region(logical_x: i32, logical_y: i32, logical_w: u32, logical_h: u32) -> Result<Vec<u8>> {
    let (phys_x, phys_y) = logical_to_physical(logical_x, logical_y);
    let scale = get_dpi_scale();
    let phys_w = (logical_w as f64 * scale).round() as u32;
    let phys_h = (logical_h as f64 * scale).round() as u32;

    eprintln!(
        "capture_region: logical=({},{} {}x{}) → physical=({},{} {}x{}), scale={:.2}",
        logical_x, logical_y, logical_w, logical_h,
        phys_x, phys_y, phys_w, phys_h, scale
    );

    let full = capture_full_screen()?;
    let cropped = full.crop_imm(
        phys_x.max(0) as u32,
        phys_y.max(0) as u32,
        phys_w,
        phys_h,
    );

    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    cropped.write_to(&mut cursor, image::ImageFormat::Png)?;

    Ok(buffer)
}

pub fn capture_full_screen_base64() -> Result<String> {
    let img = capture_full_screen()?;
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    img.write_to(&mut cursor, image::ImageFormat::Png)?;

    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buffer))
}

pub fn capture_region_as_image(logical_x: i32, logical_y: i32, logical_w: u32, logical_h: u32) -> Result<DynamicImage> {
    let (phys_x, phys_y) = logical_to_physical(logical_x, logical_y);
    let scale = get_dpi_scale();
    let phys_w = (logical_w as f64 * scale).round() as u32;
    let phys_h = (logical_h as f64 * scale).round() as u32;

    eprintln!(
        "capture_region_as_image: logical=({},{} {}x{}) → physical=({},{} {}x{})",
        logical_x, logical_y, logical_w, logical_h,
        phys_x, phys_y, phys_w, phys_h
    );

    let full = capture_full_screen()?;
    Ok(full.crop_imm(
        phys_x.max(0) as u32,
        phys_y.max(0) as u32,
        phys_w,
        phys_h,
    ))
}

#[tauri::command]
pub fn get_dpi_info() -> Result<(f64, (u32, u32), (u32, u32)), String> {
    let scale = get_dpi_scale();
    let logical = get_screen_size().map_err(|e| e.to_string())?;
    let physical = get_physical_screen_size().map_err(|e| e.to_string())?;
    Ok((scale, logical, physical))
}
